import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import Base, engine, SessionLocal
from . import models  # noqa: F401 (nécessaire pour enregistrer les tables)
from .security import hash_password
from .routers import (
    chauffeurs, clients, agences, vehicules, circuits, mouvements, mouvements_location,
    factures, factures_location, auth, utilisateurs, dashboard, depenses, finances, parametres,
    messagerie,
)

app = FastAPI(title="API Facturation Transport", version="1.0.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def creer_admin_par_defaut():
    """Crée un compte administrateur au tout premier démarrage, si aucun utilisateur n'existe."""
    db = SessionLocal()
    try:
        if db.query(models.Utilisateur).count() == 0:
            email = os.getenv("ADMIN_EMAIL", "admin@facturation-transport.com")
            password = os.getenv("ADMIN_PASSWORD", "admin123")
            admin = models.Utilisateur(
                nom="Administrateur",
                email=email,
                mot_de_passe_hash=hash_password(password),
                role=models.RoleUtilisateur.administrateur,
            )
            db.add(admin)
            db.commit()
            print(f"[INFO] Compte administrateur créé : {email} / {password}")
            print("[INFO] Merci de changer ce mot de passe dès que possible.")
    finally:
        db.close()


def migrer_colonnes_manquantes():
    """create_all() ne modifie jamais une table déjà existante : si le
    projet a été mis à jour avec de nouvelles colonnes sur une table
    préexistante (ex : parametres_app), il faut les ajouter nous-mêmes.
    Sans migration Alembic en place, on fait cette petite rustine, sûre
    à rejouer à chaque démarrage (IF NOT EXISTS)."""
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE parametres_app ADD COLUMN IF NOT EXISTS "
            "duplication_mouvements_active BOOLEAN NOT NULL DEFAULT TRUE"
        ))
        conn.execute(text(
            "ALTER TABLE parametres_app ADD COLUMN IF NOT EXISTS "
            "prix_automatique_actif BOOLEAN NOT NULL DEFAULT TRUE"
        ))


def creer_canal_general():
    """Crée le canal général de la messagerie interne s'il n'existe pas
    encore, et y ajoute tout utilisateur actif qui n'en est pas déjà
    membre (nouveaux comptes créés avant l'ajout de cette fonctionnalité,
    par exemple)."""
    db = SessionLocal()
    try:
        canal = db.query(models.Conversation).filter(models.Conversation.type == "generale").first()
        if not canal:
            canal = models.Conversation(type="generale", nom="Général")
            db.add(canal)
            db.flush()
        ids_existants = {
            m.utilisateur_id
            for m in db.query(models.ConversationMembre)
            .filter(models.ConversationMembre.conversation_id == canal.id)
            .all()
        }
        for u in db.query(models.Utilisateur).all():
            if u.id not in ids_existants:
                db.add(models.ConversationMembre(conversation_id=canal.id, utilisateur_id=u.id))
        db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    # Pour démarrer rapidement en développement.
    # En production, préférer les migrations Alembic (voir dossier alembic/).
    Base.metadata.create_all(bind=engine)
    migrer_colonnes_manquantes()
    creer_admin_par_defaut()
    creer_canal_general()


app.include_router(auth.router)
app.include_router(utilisateurs.router)
app.include_router(chauffeurs.router)
app.include_router(clients.router)
app.include_router(agences.router)
app.include_router(vehicules.router)
app.include_router(circuits.router)
app.include_router(mouvements.router)
app.include_router(mouvements_location.router)
app.include_router(factures.router)
app.include_router(factures_location.router)
app.include_router(dashboard.router)
app.include_router(depenses.router)
app.include_router(finances.router)
app.include_router(parametres.router)
app.include_router(messagerie.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "API Facturation Transport"}