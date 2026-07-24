from datetime import date, time, datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from .models import StatutFacture, RoleUtilisateur


# ---------- Authentification / Utilisateurs ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UtilisateurCreate(BaseModel):
    nom: str
    email: EmailStr
    password: str
    role: RoleUtilisateur = RoleUtilisateur.gestionnaire


class UtilisateurOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nom: str
    email: EmailStr
    role: RoleUtilisateur
    actif: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    utilisateur: UtilisateurOut


# ---------- Chauffeurs ----------
class ChauffeurBase(BaseModel):
    nom: str
    prenom: str
    cin: str
    telephone: str
    date_embauche: date
    date_fin_contrat: date | None = None


class ChauffeurCreate(ChauffeurBase):
    pass


class ChauffeurOut(ChauffeurBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Clients ----------
class ClientBase(BaseModel):
    nom_societe: str
    responsable: str
    telephone: str
    email: EmailStr
    taux_tva: float = 19
    remise: float = 0


class ClientCreate(ClientBase):
    pass


class ClientOut(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Agences ----------
class AgenceBase(BaseModel):
    nom_agence: str
    responsable: str
    telephone: str
    email: EmailStr


class AgenceCreate(AgenceBase):
    pass


class AgenceOut(AgenceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Véhicules ----------
class VehiculeBase(BaseModel):
    matricule: str
    agence_id: int
    ambiance_voyage: str | None = None
    remarque: str | None = None


class VehiculeCreate(VehiculeBase):
    pass


class VehiculeOut(VehiculeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agence: AgenceOut | None = None


# ---------- Circuits ----------
class CircuitBase(BaseModel):
    point_depart: str
    point_arrivee: str
    prix_jour: float
    prix_nuit: float


class CircuitCreate(CircuitBase):
    pass


class CircuitOut(CircuitBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Tarifs spécifiques client ----------
class TarifClientBase(BaseModel):
    client_id: int
    circuit_id: int
    heure_debut: time | None = None
    heure_fin: time | None = None
    prix: float


class TarifClientCreate(TarifClientBase):
    pass


class TarifClientOut(TarifClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Mouvements ----------
class MouvementBase(BaseModel):
    date: date
    heure: time
    client_id: int
    circuit_id: int
    chauffeur_id: int | None = None
    vehicule_id: int | None = None


class MouvementCreate(MouvementBase):
    """prix_applique est calculé côté serveur si non fourni."""
    prix_applique: float | None = None


class MouvementOut(MouvementBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    prix_applique: float
    facture_id: int | None = None
    client: ClientOut | None = None
    circuit: CircuitOut | None = None


# ---------- Factures ----------
class FactureGenerateRequest(BaseModel):
    client_id: int
    date_debut: date
    date_fin: date
    numero_facture: str  # pré-rempli automatiquement côté frontend, modifiable avant validation


class FactureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    numero_facture: str
    date_debut: date
    date_fin: date
    montant_ht: float
    taux_tva: float
    montant_tva: float
    montant_ttc: float
    statut: StatutFacture
    date_creation: datetime
    date_paiement: date | None = None
    client: ClientOut | None = None
    mouvements: list[MouvementOut] = []


class FactureStatutUpdate(BaseModel):
    statut: StatutFacture
    date_paiement: date | None = None


class NextNumeroOut(BaseModel):
    numero_suggere: str
