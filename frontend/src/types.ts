export interface Chauffeur {
  id: number;
  nom: string;
  prenom: string;
  cin: string;
  telephone: string;
  date_embauche: string;
  date_fin_contrat: string | null;
  actif: boolean;
}

export interface Client {
  id: number;
  nom_societe: string;
  responsable: string;
  telephone: string;
  email: string;
  adresse?: string | null;
  matricule_fiscal?: string | null;
  taux_tva: number;
  remise: number;
}

export interface Agence {
  id: number;
  nom_agence: string;
  responsable: string;
  telephone: string;
  email: string;
}

export type TypeVehicule = "mini_bus" | "quatre_quatre" | "microbus" | "bus";

export type ModePrixRemplacement = "demande" | "fourni" | "manuel";

export const LABELS_TYPE_VEHICULE: Record<TypeVehicule, string> = {
  mini_bus: "Mini bus",
  quatre_quatre: "4x4",
  microbus: "Microbus",
  bus: "Bus",
};

export interface Vehicule {
  id: number;
  matricule: string;
  agence_id: number;
  type_vehicule: TypeVehicule;
  ambiance_voyage: string | null;
  remarque: string | null;
  nb_places: number | null;
  agence?: Agence;
}

export interface Circuit {
  id: number;
  point_depart: string;
  point_arrivee: string;
  prix_jour: number;
  prix_nuit: number;
}

export type Role = "administrateur" | "gestionnaire";

export interface Utilisateur {
  id: number;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
}

export interface TarifClient {
  id: number;
  client_id: number;
  circuit_id: number;
  type_vehicule: TypeVehicule | null;
  heure_debut: string | null;
  heure_fin: string | null;
  prix: number;
  circuit?: Circuit | null;
}

export interface Mouvement {
  id: number;
  date: string;
  heure: string;
  client_id: number;
  circuit_id: number;
  chauffeur_id: number | null;
  vehicule_id: number | null;
  transporteur_id: number | null;
  nb_personnes: number | null;
  prix_applique: number;
  offert: boolean;
  // Remplacement de véhicule : type demandé par le client et règle de prix retenue.
  type_vehicule_demande: TypeVehicule | null;
  mode_prix_remplacement: ModePrixRemplacement | null;
  facture_id: number | null;
  client?: Client;
  circuit?: Circuit;
  chauffeur?: Chauffeur;
  vehicule?: Vehicule;
  transporteur?: Agence;
}

export interface MouvementLocation {
  id: number;
  date: string;
  heure: string;
  client: string;
  circuit: string;
  prix: number;
  chauffeur_id: number | null;
  vehicule_id: number | null;
  transporteur_id: number | null;
  nb_personnes: number | null;
  remarque: string | null;
  facture_id: number | null;
  chauffeur?: Chauffeur;
  vehicule?: Vehicule;
  transporteur?: Agence;
}

export interface FactureLocation {
  id: number;
  client: string;
  numero_facture: string;
  date_debut: string;
  date_fin: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  statut: StatutFacture;
  date_creation: string;
  date_paiement: string | null;
  mouvements: MouvementLocation[];
}

export interface RecapLigne {
  heure: string;
  comptes: Record<string, number>;
  total: number;
}

export interface RecapTransporteurs {
  transporteurs: Agence[];
  lignes: RecapLigne[];
  totaux: Record<string, number>;
  total_general: number;
}

export type StatutFacture = "payee" | "impayee" | "partielle";


export interface Facture {
  id: number;
  client_id: number;
  numero_facture: string;
  date_debut: string;
  date_fin: string;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  timbre?: number;
  statut: StatutFacture;
  date_creation: string;
  date_paiement: string | null;
  type_facture: "detaillee" | "recap_heures";
  client?: Client;
  mouvements: Mouvement[];
}

// ---------- Module financier ----------
export type CategorieDepense =
  | "salaire_chauffeur"
  | "cnss"
  | "carburant"
  | "entretien"
  | "assurance"
  | "taxe"
  | "autre";

export const LABELS_CATEGORIE_DEPENSE: Record<CategorieDepense, string> = {
  salaire_chauffeur: "Dépenses chauffeurs",
  cnss: "CNSS et charges sociales",
  carburant: "Carburant",
  entretien: "Entretien et réparation",
  assurance: "Assurances",
  taxe: "Taxes et autres charges",
  autre: "Autres dépenses d'exploitation",
};

export interface Depense {
  id: number;
  categorie: CategorieDepense;
  date: string;
  montant: number;
  description: string | null;
  vehicule_id: number | null;
  chauffeur_id: number | null;
  transporteur_id: number | null;
  date_creation: string;
  vehicule?: Vehicule;
  chauffeur?: Chauffeur;
  transporteur?: Agence;
}

export interface DepenseParCategorie {
  categorie: CategorieDepense;
  label: string;
  total: number;
}

export interface BeneficeParClient {
  client_id: number | null;
  nom_client: string;
  nb_mouvements: number;
  revenu: number;
  depenses_allouees: number;
  benefice: number;
  marge_pct: number;
}

export interface BeneficeParVehicule {
  vehicule_id: number;
  matricule: string;
  nb_mouvements: number;
  revenu: number;
  depenses: number;
  benefice: number;
}

export interface ResumeFinancier {
  date_du: string;
  date_au: string;
  chiffre_affaires_transport: number;
  chiffre_affaires_location: number;
  total_revenus: number;
  nb_mouvements: number;
  depenses_par_categorie: DepenseParCategorie[];
  total_depenses: number;
  benefice_net: number;
  marge_beneficiaire: number;
  benefice_par_client: BeneficeParClient[];
  benefice_par_vehicule: BeneficeParVehicule[];
}

export interface BeneficeParMouvement {
  type: "transport" | "location";
  mouvement_id: number;
  date: string;
  heure: string;
  client: string;
  vehicule: string;
  revenu: number;
  cout_estime: number;
  benefice: number;
}

export interface EvolutionMensuelle {
  mois: number;
  revenus: number;
  depenses: number;
  benefice: number;
}

// ---------- Fiche client détaillée ----------
export interface ClientFiche {
  client: Client;
  tarifs: TarifClient[];
  mouvements: Mouvement[];
  factures: Facture[];
  nb_mouvements: number;
  chiffre_affaires_facture: number;
  chiffre_affaires_encaisse: number;
  chiffre_affaires_impaye: number;
}

// ---------- Messagerie interne ----------
export interface MessageChat {
  id: number;
  conversation_id: number;
  expediteur_id: number;
  contenu: string;
  date_envoi: string;
  expediteur?: Utilisateur | null;
}

export type TypeConversation = "generale" | "privee";

export interface ConversationChat {
  id: number;
  type: TypeConversation;
  nom: string | null;
  date_creation: string;
  membres: Utilisateur[];
  dernier_message: MessageChat | null;
  non_lus: number;
}

// ---------- Paramètres de l'application ----------
export interface Parametres {
  duplication_mouvements_active: boolean;
  prix_automatique_actif: boolean;
}

// ---------- Module Hôtels ----------
export interface Hotel {
  id: number;
  nom: string;
  ville: string;
  pays: string;
  categorie_etoiles: number | null; // nombre d'étoiles, 1 à 5
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  contact_reservation: string | null;
  observations: string | null;
  actif: boolean;
}

// Valeurs possibles du statut global calculé (propriété `statut_global`, non stockée,
// dérivée côté backend de l'état des réservations liées au dossier).
export type StatutDossierHotel = "en_cours" | "confirme" | "cloture" | "annule";

export const LABELS_STATUT_DOSSIER_HOTEL: Record<StatutDossierHotel, string> = {
  en_cours: "En cours",
  confirme: "Confirmé",
  cloture: "Clôturé",
  annule: "Annulé",
};

export type EtatReservation = "en_attente" | "option" | "confirmee" | "refusee" | "annulee";

export const LABELS_ETAT_RESERVATION: Record<EtatReservation, string> = {
  en_attente: "En attente",
  option: "Option",
  confirmee: "Confirmée",
  refusee: "Refusée",
  annulee: "Annulée",
};

export type TypePension = "sans_pension" | "petit_dejeuner" | "demi_pension" | "pension_complete" | "all_inclusive";

export const LABELS_TYPE_PENSION: Record<TypePension, string> = {
  sans_pension: "Sans pension",
  petit_dejeuner: "Petit-déjeuner",
  demi_pension: "Demi-pension",
  pension_complete: "Pension complète",
  all_inclusive: "All inclusive",
};

export interface ReservationHotel {
  id: number;
  dossier_id: number;
  hotel_id: number;
  date_arrivee: string;
  date_depart: string;
  nb_nuits: number; // calculé côté backend (propriété), jamais envoyé en écriture
  nb_personnes: number | null;
  nb_chambres: number | null;
  chambres_single: number;
  chambres_double: number;
  chambres_twin: number;
  chambres_triple: number;
  type_pension: TypePension | null;
  etat: EtatReservation;
  hotel_remplacement_id: number | null;
  observations: string | null;
  hotel?: Hotel;
  hotel_remplacement?: Hotel | null;
}

// Payload accepté par les routes imbriquées POST/PUT
// /dossiers-hotels/{id}/reservations[/{reservation_id}]
export interface ReservationHotelPayload {
  hotel_id: number;
  date_arrivee: string;
  date_depart: string;
  nb_personnes: number | null;
  nb_chambres: number | null;
  chambres_single: number;
  chambres_double: number;
  chambres_twin: number;
  chambres_triple: number;
  type_pension: TypePension | null;
  etat: EtatReservation;
  hotel_remplacement_id: number | null;
  observations: string | null;
}

// Correspond à DossierHotelOut : `agence` (pas `client`) et `statut_global`
// (calculé, jamais envoyé en écriture — DossierHotelCreate ne le contient pas).
export interface DossierHotel {
  id: number;
  numero_dossier: string;
  agence_nom: string | null;
  circuit_nom: string | null;
  date_arrivee: string | null;
  heure_arrivee: string | null;
  numero_vol_arrivee: string | null;
  compagnie_arrivee: string | null;
  date_depart: string | null;
  heure_depart: string | null;
  numero_vol_depart: string | null;
  compagnie_depart: string | null;
  nb_personnes: number | null;
  nb_chambres: number | null;
  observations: string | null;
  date_creation: string;
  statut_global: string;
  reservations: ReservationHotel[];
}

// Payload accepté par POST/PUT /dossiers-hotels/ (pas de numero_dossier : auto-généré,
// pas de statut : calculé).
export interface DossierHotelPayload {
  agence_nom: string | null;
  circuit_nom: string | null;
  date_arrivee: string | null;
  heure_arrivee: string | null;
  numero_vol_arrivee: string | null;
  compagnie_arrivee: string | null;
  date_depart: string | null;
  heure_depart: string | null;
  numero_vol_depart: string | null;
  compagnie_depart: string | null;
  nb_personnes: number | null;
  nb_chambres: number | null;
  observations: string | null;
}