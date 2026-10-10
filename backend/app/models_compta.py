"""Modèles SQLAlchemy du module Comptabilité (phase 1 : plan comptable + journal).

Ce fichier est séparé de models.py pour ne pas toucher aux modèles existants.
Il est importé dans main.py (pour que Base.metadata.create_all() crée les tables).
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .models import Utilisateur


class CompteComptable(Base):
    """Compte du plan comptable (ex : 411000 Clients). `classe` = premier chiffre
    du numéro. Un compte `systeme` est utilisé par les écritures automatiques :
    il ne peut ni être désactivé ni changer de numéro."""

    __tablename__ = "comptes_comptables"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    libelle: Mapped[str] = mapped_column(String(150))
    classe: Mapped[int] = mapped_column(Integer, index=True)
    actif: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    systeme: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class EcritureComptable(Base):
    """En-tête d'une écriture du journal. Les écritures générées par
    l'application (facture, paiement, dépense) portent source_type / source_id /
    source_evenement ; la contrainte d'unicité ci-dessous garantit qu'une même
    opération ne produit jamais deux écritures (PostgreSQL considère les NULL
    comme distincts : les écritures manuelles ne sont pas concernées)."""

    __tablename__ = "ecritures_comptables"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", "source_evenement", name="uq_ecriture_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    numero_piece: Mapped[str] = mapped_column(String(40), index=True)
    journal: Mapped[str] = mapped_column(String(5), default="OD", server_default="OD")
    libelle: Mapped[str] = mapped_column(String(255))
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    type_operation: Mapped[str] = mapped_column(String(30), default="manuelle", index=True)
    source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_evenement: Mapped[str | None] = mapped_column(String(30), nullable=True)
    cloturee: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # --- Traçabilité (organisation en dossiers) ---
    # origine : "automatique" (générée par une facture, un paiement, une dépense)
    #           ou "manuelle" (saisie par le comptable).
    origine: Mapped[str] = mapped_column(String(12), default="manuelle", server_default="manuelle", index=True)
    # dossier : client / fournisseur / banque1 / banque2 / caisse.
    dossier: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    tiers: Mapped[str | None] = mapped_column(String(150), nullable=True)
    observation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Pour une écriture de régularisation : id de l'écriture corrigée.
    regularise_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    utilisateur_id: Mapped[int | None] = mapped_column(
        ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True
    )
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    utilisateur: Mapped["Utilisateur | None"] = relationship(foreign_keys=[utilisateur_id])
    lignes: Mapped[list["LigneEcriture"]] = relationship(
        back_populates="ecriture", cascade="all, delete-orphan", order_by="LigneEcriture.id"
    )


class LigneEcriture(Base):
    __tablename__ = "lignes_ecritures"
    __table_args__ = (CheckConstraint("debit >= 0 AND credit >= 0", name="ck_ligne_montants_positifs"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ecriture_id: Mapped[int] = mapped_column(
        ForeignKey("ecritures_comptables.id", ondelete="CASCADE"), index=True
    )
    compte_id: Mapped[int] = mapped_column(ForeignKey("comptes_comptables.id"), index=True)
    compte_auxiliaire: Mapped[str | None] = mapped_column(String(150), nullable=True)
    libelle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0, server_default="0")
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0, server_default="0")
    # Devises (Banque 2) : débit / crédit restent TOUJOURS en TND ; le montant d'origine
    # dans la devise du compte est conservé ici, avec le taux utilisé.
    devise: Mapped[str] = mapped_column(String(3), default="TND", server_default="TND")
    montant_devise: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True)
    taux_change: Mapped[Decimal | None] = mapped_column(Numeric(14, 6), nullable=True)

    ecriture: Mapped["EcritureComptable"] = relationship(back_populates="lignes")
    compte: Mapped["CompteComptable"] = relationship()


class PaiementFacture(Base):
    """Règlement (total ou partiel) d'une facture de transport OU de location.
    Chaque règlement génère une écriture comptable (D trésorerie / C 411000).
    Le statut de la facture (impayée / partielle / payée) est déduit de la somme
    des règlements."""

    __tablename__ = "paiements_factures"
    __table_args__ = (
        CheckConstraint(
            "(facture_id IS NOT NULL AND facture_location_id IS NULL) OR "
            "(facture_id IS NULL AND facture_location_id IS NOT NULL)",
            name="ck_paiement_une_facture",
        ),
        CheckConstraint("montant > 0", name="ck_paiement_montant_positif"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    facture_id: Mapped[int | None] = mapped_column(ForeignKey("factures.id", ondelete="CASCADE"), nullable=True, index=True)
    facture_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("factures_location.id", ondelete="CASCADE"), nullable=True, index=True
    )
    montant: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    date: Mapped[date] = mapped_column(Date, index=True)
    mode: Mapped[str] = mapped_column(String(20), default="virement", server_default="virement")
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utilisateur_id: Mapped[int | None] = mapped_column(ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
