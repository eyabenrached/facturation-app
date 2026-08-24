from datetime import date, time, datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from .models import StatutFacture, RoleUtilisateur, TypeVehicule, CategorieDepense


# ---------- Authentification / Utilisateurs ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UtilisateurCreate(BaseModel):
    nom: str
    email: EmailStr
    password: str
    role: RoleUtilisateur = RoleUtilisateur.gestionnaire


class UtilisateurUpdate(BaseModel):
    nom: str
    email: EmailStr
    role: RoleUtilisateur
    password: str | None = None  # si fourni, réinitialise le mot de passe


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
    type_vehicule: TypeVehicule = TypeVehicule.mini_bus
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
    type_vehicule: TypeVehicule | None = None  # None = valable pour tous les types
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
    transporteur_id: int | None = None
    nb_personnes: int | None = None


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
    chauffeur: ChauffeurOut | None = None
    vehicule: VehiculeOut | None = None
    transporteur: AgenceOut | None = None


class MouvementsChangerDateIn(BaseModel):
    """Modification groupée de la date pour une sélection de mouvements (à refaire)."""
    ids: list[int]
    nouvelle_date: date


# ---------- Mouvements Location (indépendants de la facturation) ----------
class MouvementLocationBase(BaseModel):
    date: date
    heure: time
    client: str
    circuit: str
    prix: float
    chauffeur_id: int | None = None
    vehicule_id: int | None = None
    transporteur_id: int | None = None
    nb_personnes: int | None = None
    remarque: str | None = None


class MouvementLocationCreate(MouvementLocationBase):
    pass


class MouvementLocationOut(MouvementLocationBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    facture_id: int | None = None
    chauffeur: ChauffeurOut | None = None
    vehicule: VehiculeOut | None = None
    transporteur: AgenceOut | None = None


# ---------- Factures Location ----------
class FactureLocationGenerateRequest(BaseModel):
    client: str  # doit correspondre (insensible à la casse/espaces) au champ "client" des mouvements
    date_debut: date
    date_fin: date
    numero_facture: str  # pré-rempli automatiquement côté frontend, modifiable avant validation
    taux_tva: float = 19  # saisi manuellement : pas de fiche client associée


class FactureLocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client: str
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
    mouvements: list[MouvementLocationOut] = []


# ---------- Récapitulatif transporteurs (chrono par heure) ----------
class RecapLigneOut(BaseModel):
    heure: time
    comptes: dict[str, int]
    total: int


class RecapTransporteursOut(BaseModel):
    transporteurs: list[AgenceOut]
    lignes: list[RecapLigneOut]
    totaux: dict[str, int]
    total_general: int


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


# ---------- Dépenses (module financier) ----------
class DepenseBase(BaseModel):
    categorie: CategorieDepense
    date: date
    montant: float
    description: str | None = None
    vehicule_id: int | None = None
    chauffeur_id: int | None = None
    transporteur_id: int | None = None


class DepenseCreate(DepenseBase):
    pass


class DepenseOut(DepenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date_creation: datetime
    vehicule: VehiculeOut | None = None
    chauffeur: ChauffeurOut | None = None
    transporteur: AgenceOut | None = None