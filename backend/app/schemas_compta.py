"""Schémas Pydantic du module Comptabilité.

Les règles métier (équilibre débit/crédit, ligne valide...) sont volontairement
vérifiées dans compta_service : elles renvoient un message français clair
(HTTP 400) que le frontend affiche tel quel.
"""
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class CompteIn(BaseModel):
    numero: str = Field(min_length=4, max_length=10, pattern=r"^[1-9][0-9]{3,9}$")
    libelle: str = Field(min_length=2, max_length=150)
    actif: bool = True


class CompteOut(BaseModel):
    id: int
    numero: str
    libelle: str
    classe: int
    actif: bool
    systeme: bool
    nb_lignes: int = 0


class LigneIn(BaseModel):
    compte_id: int
    compte_auxiliaire: str | None = None
    libelle: str | None = None
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")


class EcritureIn(BaseModel):
    date: date
    libelle: str
    journal: str = "OD"
    reference: str | None = None
    numero_piece: str | None = None
    lignes: list[LigneIn]


class PaiementIn(BaseModel):
    type_facture: Literal["facture", "location"]
    facture_id: int
    montant: Decimal = Field(gt=0)
    date: date
    mode: str = "virement"
    reference: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=255)
