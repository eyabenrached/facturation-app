import enum
from datetime import date, time, datetime

from sqlalchemy import (
    String, Integer, Date, Time, DateTime, ForeignKey, Numeric, Enum, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class StatutFacture(str, enum.Enum):
    payee = "payee"
    impayee = "impayee"
    partielle = "partielle"


class RoleUtilisateur(str, enum.Enum):
    administrateur = "administrateur"
    gestionnaire = "gestionnaire"


class TypeVehicule(str, enum.Enum):
    mini_bus = "mini_bus"
    microbus = "microbus"
    bus = "bus"
    quatre_quatre = "quatre_quatre"


class CategorieDepense(str, enum.Enum):
    """Catégories de dépenses d'exploitation, utilisées pour le module financier."""

    salaire_chauffeur = "salaire_chauffeur"
    cnss = "cnss"
    carburant = "carburant"
    entretien = "entretien"
    assurance = "assurance"
    taxe = "taxe"
    autre = "autre"


class Utilisateur(Base):
    __tablename__ = "utilisateurs"

    id: Mapped[int] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[RoleUtilisateur] = mapped_column(
        Enum(RoleUtilisateur, name="role_utilisateur"), default=RoleUtilisateur.gestionnaire
    )
    actif: Mapped[bool] = mapped_column(default=True)
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Chauffeur(Base):
    __tablename__ = "chauffeurs"

    id: Mapped[int] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column(String(100))
    prenom: Mapped[str] = mapped_column(String(100))
    cin: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    telephone: Mapped[str] = mapped_column(String(30))
    date_embauche: Mapped[date] = mapped_column(Date)
    date_fin_contrat: Mapped[date | None] = mapped_column(Date, nullable=True)

    mouvements: Mapped[list["Mouvement"]] = relationship(back_populates="chauffeur")
    depenses: Mapped[list["Depense"]] = relationship(back_populates="chauffeur")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    nom_societe: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    responsable: Mapped[str] = mapped_column(String(100))
    telephone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(150))
    taux_tva: Mapped[float] = mapped_column(Numeric(5, 2), default=19)
    remise: Mapped[float] = mapped_column(Numeric(5, 2), default=0)

    mouvements: Mapped[list["Mouvement"]] = relationship(back_populates="client")
    factures: Mapped[list["Facture"]] = relationship(back_populates="client")
    tarifs: Mapped[list["TarifClient"]] = relationship(back_populates="client")


class Agence(Base):
    __tablename__ = "agences"

    id: Mapped[int] = mapped_column(primary_key=True)
    nom_agence: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    responsable: Mapped[str] = mapped_column(String(100))
    telephone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(150))

    vehicules: Mapped[list["Vehicule"]] = relationship(back_populates="agence")


class Vehicule(Base):
    __tablename__ = "vehicules"

    id: Mapped[int] = mapped_column(primary_key=True)
    matricule: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    agence_id: Mapped[int] = mapped_column(ForeignKey("agences.id"))
    type_vehicule: Mapped[TypeVehicule] = mapped_column(
        Enum(TypeVehicule, name="type_vehicule"), default=TypeVehicule.mini_bus
    )
    ambiance_voyage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remarque: Mapped[str | None] = mapped_column(Text, nullable=True)

    agence: Mapped["Agence"] = relationship(back_populates="vehicules")
    mouvements: Mapped[list["Mouvement"]] = relationship(back_populates="vehicule")
    depenses: Mapped[list["Depense"]] = relationship(back_populates="vehicule")


class Circuit(Base):
    __tablename__ = "circuits"

    id: Mapped[int] = mapped_column(primary_key=True)
    point_depart: Mapped[str] = mapped_column(String(150))
    point_arrivee: Mapped[str] = mapped_column(String(150))
    prix_jour: Mapped[float] = mapped_column(Numeric(10, 3))
    prix_nuit: Mapped[float] = mapped_column(Numeric(10, 3))

    mouvements: Mapped[list["Mouvement"]] = relationship(back_populates="circuit")
    tarifs: Mapped[list["TarifClient"]] = relationship(back_populates="circuit")


class TarifClient(Base):
    """Surcharge de prix pour un couple client + circuit (+ créneau horaire optionnel)."""

    __tablename__ = "tarifs_clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    type_vehicule: Mapped[TypeVehicule | None] = mapped_column(
        Enum(TypeVehicule, name="type_vehicule"), nullable=True
    )
    heure_debut: Mapped[time | None] = mapped_column(Time, nullable=True)
    heure_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    prix: Mapped[float] = mapped_column(Numeric(10, 3))

    client: Mapped["Client"] = relationship(back_populates="tarifs")
    circuit: Mapped["Circuit"] = relationship(back_populates="tarifs")


class Mouvement(Base):
    __tablename__ = "mouvements"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    heure: Mapped[time] = mapped_column(Time)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    chauffeur_id: Mapped[int | None] = mapped_column(ForeignKey("chauffeurs.id"), nullable=True)
    vehicule_id: Mapped[int | None] = mapped_column(ForeignKey("vehicules.id"), nullable=True)
    transporteur_id: Mapped[int | None] = mapped_column(ForeignKey("agences.id"), nullable=True)
    nb_personnes: Mapped[int | None] = mapped_column(nullable=True)
    prix_applique: Mapped[float] = mapped_column(Numeric(10, 3))
    facture_id: Mapped[int | None] = mapped_column(ForeignKey("factures.id"), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="mouvements")
    circuit: Mapped["Circuit"] = relationship(back_populates="mouvements")
    chauffeur: Mapped["Chauffeur | None"] = relationship(back_populates="mouvements")
    vehicule: Mapped["Vehicule | None"] = relationship(back_populates="mouvements")
    transporteur: Mapped["Agence | None"] = relationship(foreign_keys=[transporteur_id])
    facture: Mapped["Facture | None"] = relationship(back_populates="mouvements")


class MouvementLocation(Base):
    """Mouvement de location indépendant de la facturation classique : client, circuit et
    prix sont saisis librement (texte/numérique), sans lien avec les tables
    référentielles Client/Circuit. Peut néanmoins être rattaché à une FactureLocation."""

    __tablename__ = "mouvements_location"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)
    heure: Mapped[time] = mapped_column(Time)
    client: Mapped[str] = mapped_column(String(150))
    circuit: Mapped[str] = mapped_column(String(200))
    prix: Mapped[float] = mapped_column(Numeric(10, 3))
    chauffeur_id: Mapped[int | None] = mapped_column(ForeignKey("chauffeurs.id"), nullable=True)
    vehicule_id: Mapped[int | None] = mapped_column(ForeignKey("vehicules.id"), nullable=True)
    transporteur_id: Mapped[int | None] = mapped_column(ForeignKey("agences.id"), nullable=True)
    nb_personnes: Mapped[int | None] = mapped_column(nullable=True)
    remarque: Mapped[str | None] = mapped_column(Text, nullable=True)
    facture_id: Mapped[int | None] = mapped_column(ForeignKey("factures_location.id"), nullable=True)

    chauffeur: Mapped["Chauffeur | None"] = relationship(foreign_keys=[chauffeur_id])
    vehicule: Mapped["Vehicule | None"] = relationship(foreign_keys=[vehicule_id])
    transporteur: Mapped["Agence | None"] = relationship(foreign_keys=[transporteur_id])
    facture: Mapped["FactureLocation | None"] = relationship(back_populates="mouvements")


class FactureLocation(Base):
    """Facture indépendante, adossée aux MouvementLocation. Le client y est un texte
    libre (pas de FK vers la table Client) et le taux de TVA est saisi manuellement,
    faute de fiche client associée."""

    __tablename__ = "factures_location"

    id: Mapped[int] = mapped_column(primary_key=True)
    client: Mapped[str] = mapped_column(String(150))
    numero_facture: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    date_debut: Mapped[date] = mapped_column(Date)
    date_fin: Mapped[date] = mapped_column(Date)
    montant_ht: Mapped[float] = mapped_column(Numeric(12, 3))
    taux_tva: Mapped[float] = mapped_column(Numeric(5, 2))
    montant_tva: Mapped[float] = mapped_column(Numeric(12, 3))
    montant_ttc: Mapped[float] = mapped_column(Numeric(12, 3))
    statut: Mapped[StatutFacture] = mapped_column(
        Enum(StatutFacture, name="statut_facture"), default=StatutFacture.impayee
    )
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    date_paiement: Mapped[date | None] = mapped_column(Date, nullable=True)

    mouvements: Mapped[list["MouvementLocation"]] = relationship(back_populates="facture")


class Facture(Base):
    __tablename__ = "factures"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    numero_facture: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    date_debut: Mapped[date] = mapped_column(Date)
    date_fin: Mapped[date] = mapped_column(Date)
    montant_ht: Mapped[float] = mapped_column(Numeric(12, 3))
    taux_tva: Mapped[float] = mapped_column(Numeric(5, 2))
    montant_tva: Mapped[float] = mapped_column(Numeric(12, 3))
    montant_ttc: Mapped[float] = mapped_column(Numeric(12, 3))
    statut: Mapped[StatutFacture] = mapped_column(
        Enum(StatutFacture, name="statut_facture"), default=StatutFacture.impayee
    )
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    date_paiement: Mapped[date | None] = mapped_column(Date, nullable=True)

    client: Mapped["Client"] = relationship(back_populates="factures")
    mouvements: Mapped[list["Mouvement"]] = relationship(back_populates="facture")


class Depense(Base):
    """Dépense d'exploitation de l'entreprise : carburant, entretien, assurance,
    CNSS/charges sociales, salaires chauffeurs, taxes ou toute autre charge.

    vehicule_id et chauffeur_id sont optionnels et permettent de rattacher une
    dépense à un véhicule ou à un chauffeur précis (ex. plein de carburant sur
    un véhicule donné, salaire d'un chauffeur donné) pour calculer le bénéfice
    par véhicule / par chauffeur. Une dépense générale de l'entreprise (loyer,
    taxe globale, etc.) peut laisser les deux champs vides.
    """

    __tablename__ = "depenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    categorie: Mapped[CategorieDepense] = mapped_column(
        Enum(CategorieDepense, name="categorie_depense")
    )
    date: Mapped[date] = mapped_column(Date)
    montant: Mapped[float] = mapped_column(Numeric(12, 3))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vehicule_id: Mapped[int | None] = mapped_column(ForeignKey("vehicules.id"), nullable=True)
    chauffeur_id: Mapped[int | None] = mapped_column(ForeignKey("chauffeurs.id"), nullable=True)
    transporteur_id: Mapped[int | None] = mapped_column(ForeignKey("agences.id"), nullable=True)
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    vehicule: Mapped["Vehicule | None"] = relationship(back_populates="depenses")
    chauffeur: Mapped["Chauffeur | None"] = relationship(back_populates="depenses")
    transporteur: Mapped["Agence | None"] = relationship(foreign_keys=[transporteur_id])