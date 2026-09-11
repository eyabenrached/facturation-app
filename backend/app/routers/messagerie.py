import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db, SessionLocal
from ..deps import get_current_user
from ..security import decoder_access_token
from ..ws_manager import manager

router = APIRouter(prefix="/messagerie", tags=["Messagerie"])


# ---------- Helpers ----------
def _membres_ids(db: Session, conversation_id: int) -> list[int]:
    rows = (
        db.query(models.ConversationMembre.utilisateur_id)
        .filter(models.ConversationMembre.conversation_id == conversation_id)
        .all()
    )
    return [r[0] for r in rows]


def _verifier_membre(db: Session, conversation_id: int, utilisateur_id: int) -> models.ConversationMembre:
    membre = (
        db.query(models.ConversationMembre)
        .filter(
            models.ConversationMembre.conversation_id == conversation_id,
            models.ConversationMembre.utilisateur_id == utilisateur_id,
        )
        .first()
    )
    if not membre:
        raise HTTPException(403, "Vous ne faites pas partie de cette conversation.")
    return membre


def _creer_message(db: Session, conversation_id: int, expediteur_id: int, contenu: str) -> models.Message:
    msg = models.Message(conversation_id=conversation_id, expediteur_id=expediteur_id, contenu=contenu.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def _conversation_vers_detail(db: Session, conv: models.Conversation, utilisateur_id: int) -> schemas.ConversationDetailOut:
    membres = (
        db.query(models.Utilisateur)
        .join(models.ConversationMembre, models.ConversationMembre.utilisateur_id == models.Utilisateur.id)
        .filter(models.ConversationMembre.conversation_id == conv.id)
        .all()
    )
    dernier = (
        db.query(models.Message)
        .filter(models.Message.conversation_id == conv.id)
        .order_by(models.Message.date_envoi.desc())
        .first()
    )
    mon_membre = next((m for m in conv.membres if m.utilisateur_id == utilisateur_id), None)
    seuil = mon_membre.dernier_lu_a if mon_membre else None
    requete_non_lus = db.query(func.count(models.Message.id)).filter(
        models.Message.conversation_id == conv.id,
        models.Message.expediteur_id != utilisateur_id,
    )
    if seuil is not None:
        requete_non_lus = requete_non_lus.filter(models.Message.date_envoi > seuil)
    non_lus = requete_non_lus.scalar() or 0

    return schemas.ConversationDetailOut(
        id=conv.id,
        type=conv.type,
        nom=conv.nom,
        date_creation=conv.date_creation,
        membres=membres,
        dernier_message=dernier,
        non_lus=non_lus,
    )


# ---------- Routes REST ----------
@router.get("/utilisateurs", response_model=list[schemas.UtilisateurOut])
def utilisateurs_messagerie(
    db: Session = Depends(get_db), user: models.Utilisateur = Depends(get_current_user)
):
    """Liste des collègues avec qui démarrer une conversation privée."""
    return (
        db.query(models.Utilisateur)
        .filter(models.Utilisateur.actif == True, models.Utilisateur.id != user.id)  # noqa: E712
        .order_by(models.Utilisateur.nom)
        .all()
    )


@router.get("/conversations", response_model=list[schemas.ConversationDetailOut])
def liste_conversations(db: Session = Depends(get_db), user: models.Utilisateur = Depends(get_current_user)):
    mes_membres = (
        db.query(models.ConversationMembre)
        .filter(models.ConversationMembre.utilisateur_id == user.id)
        .all()
    )
    resultats = [_conversation_vers_detail(db, m.conversation, user.id) for m in mes_membres]
    resultats.sort(
        key=lambda c: c.dernier_message.date_envoi if c.dernier_message else c.date_creation,
        reverse=True,
    )
    return resultats


@router.post("/conversations/privee", response_model=schemas.ConversationDetailOut)
def obtenir_ou_creer_conversation_privee(
    payload: schemas.ConversationPriveeCreate,
    db: Session = Depends(get_db),
    user: models.Utilisateur = Depends(get_current_user),
):
    if payload.utilisateur_id == user.id:
        raise HTTPException(400, "Vous ne pouvez pas démarrer une conversation avec vous-même.")
    autre = db.query(models.Utilisateur).get(payload.utilisateur_id)
    if not autre:
        raise HTTPException(404, "Utilisateur introuvable.")

    # Recherche d'une conversation privée existante entre les deux utilisateurs.
    candidates = (
        db.query(models.ConversationMembre.conversation_id)
        .join(models.Conversation, models.Conversation.id == models.ConversationMembre.conversation_id)
        .filter(models.Conversation.type == "privee")
        .filter(models.ConversationMembre.utilisateur_id.in_([user.id, payload.utilisateur_id]))
        .group_by(models.ConversationMembre.conversation_id)
        .having(func.count(models.ConversationMembre.id) == 2)
        .all()
    )
    conv_id = None
    for (cid,) in candidates:
        if set(_membres_ids(db, cid)) == {user.id, payload.utilisateur_id}:
            conv_id = cid
            break

    if conv_id is None:
        conv = models.Conversation(type="privee")
        db.add(conv)
        db.flush()
        db.add(models.ConversationMembre(conversation_id=conv.id, utilisateur_id=user.id))
        db.add(models.ConversationMembre(conversation_id=conv.id, utilisateur_id=payload.utilisateur_id))
        db.commit()
        conv_id = conv.id

    conv = db.query(models.Conversation).get(conv_id)
    return _conversation_vers_detail(db, conv, user.id)


@router.get("/conversations/{conversation_id}/messages", response_model=list[schemas.MessageOut])
def historique_messages(
    conversation_id: int,
    avant_id: int | None = Query(default=None),
    limite: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    user: models.Utilisateur = Depends(get_current_user),
):
    _verifier_membre(db, conversation_id, user.id)
    q = db.query(models.Message).filter(models.Message.conversation_id == conversation_id)
    if avant_id:
        q = q.filter(models.Message.id < avant_id)
    messages = q.order_by(models.Message.id.desc()).limit(limite).all()
    messages.reverse()
    return messages


@router.post("/conversations/{conversation_id}/messages", response_model=schemas.MessageOut, status_code=201)
async def envoyer_message(
    conversation_id: int,
    payload: schemas.MessageCreate,
    db: Session = Depends(get_db),
    user: models.Utilisateur = Depends(get_current_user),
):
    _verifier_membre(db, conversation_id, user.id)
    if not payload.contenu.strip():
        raise HTTPException(400, "Le message ne peut pas être vide.")
    msg = _creer_message(db, conversation_id, user.id, payload.contenu)
    membres_ids = _membres_ids(db, conversation_id)
    data = schemas.MessageOut.model_validate(msg).model_dump(mode="json")
    await manager.diffuser(membres_ids, {"type": "nouveau_message", "message": data})
    return msg


@router.patch("/conversations/{conversation_id}/lu")
def marquer_lu(
    conversation_id: int, db: Session = Depends(get_db), user: models.Utilisateur = Depends(get_current_user)
):
    membre = _verifier_membre(db, conversation_id, user.id)
    membre.dernier_lu_a = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# ---------- WebSocket temps réel ----------
@router.websocket("/ws")
async def websocket_messagerie(websocket: WebSocket, token: str = Query(...)):
    payload = decoder_access_token(token)
    if not payload or payload.get("sub") is None:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        user_id = int(payload["sub"])
        user = db.query(models.Utilisateur).get(user_id)
        if not user or not user.actif:
            await websocket.close(code=4401)
            return

        await manager.connecter(user_id, websocket)
        try:
            while True:
                brut = await websocket.receive_text()
                try:
                    data = json.loads(brut)
                except json.JSONDecodeError:
                    continue

                conversation_id = data.get("conversation_id")
                contenu = (data.get("contenu") or "").strip()
                if not conversation_id or not contenu:
                    continue

                est_membre = (
                    db.query(models.ConversationMembre)
                    .filter(
                        models.ConversationMembre.conversation_id == conversation_id,
                        models.ConversationMembre.utilisateur_id == user_id,
                    )
                    .first()
                )
                if not est_membre:
                    continue

                msg = _creer_message(db, conversation_id, user_id, contenu)
                membres_ids = _membres_ids(db, conversation_id)
                msg_out = schemas.MessageOut.model_validate(msg).model_dump(mode="json")
                await manager.diffuser(membres_ids, {"type": "nouveau_message", "message": msg_out})
        except WebSocketDisconnect:
            pass
        finally:
            manager.deconnecter(user_id, websocket)
    finally:
        db.close()
