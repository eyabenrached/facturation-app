"""Schémas Pydantic du module Comptabilité.

Les règles métier (équilibre débit/crédit, ligne valide...) sont volontairement
vérifiées dans compta_service : elles renvoient un message français clair
(HTTP 400) que le frontend affiche tel quel.
"""
import datetime as dt
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
    devise: str = "TND"
    montant_devise: Decimal | None = None
    taux_change: Decimal | None = None


class EcritureIn(BaseModel):
    date: date
    libelle: str
    journal: str = "OD"
    reference: str | None = None
    numero_piece: str | None = None
    dossier: str | None = None
    tiers: str | None = Field(default=None, max_length=150)
    observation: str | None = Field(default=None, max_length=500)
    lignes: list[LigneIn]


class MouvementTresorerieIn(BaseModel):
    dossier: Literal["banque1", "banque2", "caisse"]
    sens: Literal["entree", "sortie"]
    date: dt.date
    montant: Decimal = Field(gt=0)
    contrepartie_id: int
    libelle: str = Field(min_length=2, max_length=255)
    devise: str = "TND"
    taux: Decimal | None = Field(default=None, gt=0)
    reference: str | None = Field(default=None, max_length=100)
    tiers: str | None = Field(default=None, max_length=150)
    observation: str | None = Field(default=None, max_length=500)


class SoldeInitialIn(BaseModel):
    dossier: Literal["banque1", "banque2", "caisse"]
    montant: Decimal
    date: dt.date
    devise: str = "TND"
    taux: Decimal | None = Field(default=None, gt=0)


class RegularisationIn(BaseModel):
    date: dt.date | None = None
    motif: str | None = Field(default=None, max_length=200)


class ClotureIn(BaseModel):
    jusqu_au: dt.date


class PaiementIn(BaseModel):
    type_facture: Literal["facture", "location"]
    facture_id: int
    montant: Decimal = Field(gt=0)
    date: date
    mode: str = "virement"
    reference: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=255)
