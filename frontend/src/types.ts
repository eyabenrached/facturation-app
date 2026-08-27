export interface Chauffeur {
  id: number;
  nom: string;
  prenom: string;
  cin: string;
  telephone: string;
  date_embauche: string;
  date_fin_contrat: string | null;
}

export interface Client {
  id: number;
  nom_societe: string;
  responsable: string;
  telephone: string;
  email: string;
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