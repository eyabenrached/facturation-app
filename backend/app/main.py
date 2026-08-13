import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal
from . import models  # noqa: F401 (nécessaire pour enregistrer les tables)
from .security import hash_password
from .routers import (
    chauffeurs, clients, agences, vehicules, circuits, mouvements, mouvements_location, factures,
    auth, utilisateurs, dashboard,
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


@app.on_event("startup")
def on_startup():
    # Pour démarrer rapidement en développement.
    # En production, préférer les migrations Alembic (voir dossier alembic/).
    Base.metadata.create_all(bind=engine)
    creer_admin_par_defaut()


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
app.include_router(dashboard.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "API Facturation Transport"}