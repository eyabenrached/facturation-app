from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import exiger_admin, exiger_utilisateur_connecte

router = APIRouter(prefix="/chauffeurs", tags=["Chauffeurs"])


def desactiver_chauffeurs_expires(db: Session) -> None:
    """Désactive (sans jamais les supprimer) tous les chauffeurs dont la date
    de fin de contrat est dépassée. Un chauffeur inactif n'apparaît plus dans
    les listes de sélection pour de nouveaux mouvements/dépenses, mais reste
    en base avec tout son historique : les mouvements passés qui lui sont
    liés continuent d'afficher son nom normalement.

    Appelée au démarrage de l'application et à chaque consultation de la
    liste des chauffeurs, pour rester à jour même sans redémarrage quotidien.
    """
    (
        db.query(models.Chauffeur)
        .filter(models.Chauffeur.actif.is_(True))
        .filter(models.Chauffeur.date_fin_contrat.isnot(None))
        .filter(models.Chauffeur.date_fin_contrat < date.today())
        .update({"actif": False}, synchronize_session=False)
    )
    db.commit()


@router.get("/", response_model=list[schemas.ChauffeurOut], dependencies=[Depends(exiger_utilisateur_connecte)])
def liste_chauffeurs(
    recherche: str | None = None,
    inclure_inactifs: bool = False,
    db: Session = Depends(get_db),
):
    desactiver_chauffeurs_expires(db)
    q = db.query(models.Chauffeur)
    if not inclure_inactifs:
        q = q.filter(models.Chauffeur.actif.is_(True))
    if recherche:
        like = f"%{recherche}%"
        q = q.filter(
            (models.Chauffeur.nom.ilike(like))
            | (models.Chauffeur.prenom.ilike(like))
            | (models.Chauffeur.cin.ilike(like))
        )
    return q.order_by(models.Chauffeur.nom).all()


@router.post("/", response_model=schemas.ChauffeurOut, status_code=201, dependencies=[Depends(exiger_utilisateur_connecte)])
def creer_chauffeur(payload: schemas.ChauffeurCreate, db: Session = Depends(get_db)):
    if db.query(models.Chauffeur).filter(models.Chauffeur.cin == payload.cin).first():
        raise HTTPException(400, "Un chauffeur avec ce CIN existe déjà.")
    obj = models.Chauffeur(**payload.model_dump())
    # Si une date de fin de contrat déjà passée est saisie dès la création,
    # le chauffeur est directement créé inactif.
    obj.actif = not (obj.date_fin_contrat and obj.date_fin_contrat < date.today())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{chauffeur_id}", response_model=schemas.ChauffeurOut, dependencies=[Depends(exiger_admin)])
def modifier_chauffeur(chauffeur_id: int, payload: schemas.ChauffeurCreate, db: Session = Depends(get_db)):
    obj = db.query(models.Chauffeur).get(chauffeur_id)
    if not obj:
        raise HTTPException(404, "Chauffeur introuvable.")
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    # Recalcule le statut à chaque modification : permet de "réactiver" un
    # chauffeur en repoussant/supprimant sa date de fin de contrat, ou au
    # contraire de le désactiver immédiatement en saisissant une date passée.
    obj.actif = not (obj.date_fin_contrat and obj.date_fin_contrat < date.today())
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{chauffeur_id}", status_code=204, dependencies=[Depends(exiger_admin)])
def supprimer_chauffeur(chauffeur_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Chauffeur).get(chauffeur_id)
    if not obj:
        raise HTTPException(404, "Chauffeur introuvable.")
    if db.query(models.Mouvement).filter(models.Mouvement.chauffeur_id == chauffeur_id).first():
        raise HTTPException(400, "Ce chauffeur est lié à des mouvements existants : suppression bloquée.")
    db.delete(obj)
    db.commit()