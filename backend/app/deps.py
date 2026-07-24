from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decoder_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Utilisateur:
    erreur_auth = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session invalide ou expirée, merci de vous reconnecter.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Cas particulier : lien de téléchargement PDF (<a href>), qui ne peut pas
    # envoyer d'en-tête Authorization -> on accepte aussi ?access_token=...
    if not token:
        token = request.query_params.get("access_token")
    if not token:
        raise erreur_auth

    payload = decoder_access_token(token)
    if payload is None:
        raise erreur_auth
    user_id = payload.get("sub")
    if user_id is None:
        raise erreur_auth
    user = db.query(models.Utilisateur).get(int(user_id))
    if user is None or not user.actif:
        raise erreur_auth
    return user


def exiger_role(*roles_autorises: models.RoleUtilisateur):
    """Dépendance factory : n'autorise que les rôles listés à accéder à la route."""

    def verifier(user: models.Utilisateur = Depends(get_current_user)) -> models.Utilisateur:
        if user.role not in roles_autorises:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous n'avez pas les droits nécessaires pour cette action.",
            )
        return user

    return verifier


# Raccourcis pratiques
exiger_admin = exiger_role(models.RoleUtilisateur.administrateur)
exiger_utilisateur_connecte = exiger_role(
    models.RoleUtilisateur.administrateur, models.RoleUtilisateur.gestionnaire
)
