import os
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt

SECRET_KEY = os.getenv("SECRET_KEY", "change-moi-en-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8h

PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    """Hash au format 'sel$hash', avec pbkdf2_hmac (aucune dépendance compilée)."""
    sel = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sel.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"{sel}${h.hex()}"


def verify_password(password: str, hash_stocke: str) -> bool:
    try:
        sel, h_hex = hash_stocke.split("$")
    except ValueError:
        return False
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sel.encode("utf-8"), PBKDF2_ITERATIONS)
    return hmac.compare_digest(h.hex(), h_hex)


def creer_access_token(donnees: dict) -> str:
    a_encoder = donnees.copy()
    expiration = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    a_encoder.update({"exp": expiration})
    return jwt.encode(a_encoder, SECRET_KEY, algorithm=ALGORITHM)


def decoder_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
