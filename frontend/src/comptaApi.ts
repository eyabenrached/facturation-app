// Types, formatage et utilitaires du module Comptabilité.
import { api } from "./api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface DiagnosticCompta {
  factures_sans_ecriture: number;
  paiements_sans_ecriture: number;
  locations_sans_ecriture: number;
  paiements_location_sans_ecriture: number;
  depenses_sans_ecriture: number;
  total: number;
}

export interface PointMensuel {
  mois: string; // "2026-10"
  recettes: number;
  depenses: number;
  resultat: number;
  ca: number;
}

export interface DashboardCompta {
  date_du: string;
  date_au: string;
  solde_banque: number;
  solde_caisse: number;
  total_recettes: number;
  total_depenses: number;
  chiffre_affaires: number;
  resultat_periode: number;
  creances_clients: number;
  dettes_fournisseurs: number;
  resultat_mois: number;
  tva_collectee: number;
  tva_deductible: number;
  tva_a_payer: number;
  paiements_en_attente: { nombre: number; montant: number };
  serie_mensuelle: PointMensuel[];
  repartition_charges: { numero: string; libelle: string; total: number }[];
  diagnostic: DiagnosticCompta;
}

export interface Compte {
  id: number;
  numero: string;
  libelle: string;
  classe: number;
  actif: boolean;
  systeme: boolean;
  nb_lignes: number;
}

export interface LigneEcriture {
  id: number;
  compte_id: number;
  compte_numero: string;
  compte_libelle: string;
  compte_auxiliaire: string | null;
  libelle: string | null;
  debit: number;
  credit: number;
}

export interface Ecriture {
  id: number;
  date: string;
  numero_piece: string;
  journal: string;
  libelle: string;
  reference: string | null;
  type_operation: string;
  automatique: boolean;
  cloturee: boolean;
  modifiable: boolean;
  total_debit: number;
  total_credit: number;
  lignes: LigneEcriture[];
}

export interface PageEcritures {
  items: Ecriture[];
  total: number;
  page: number;
  taille: number;
  total_debit: number;
  total_credit: number;
  journaux: Record<string, string>;
  types: Record<string, string>;
}

// ---------------------------------------------------------- clients / créances
export type StatutCreance = "solde" | "en_cours" | "en_retard";

export interface LigneCreance {
  client: string;
  total_facture: number;
  total_paye: number;
  reste: number;
  echeance: string | null;
  nb_factures: number;
  nb_impayees: number;
  jours_retard: number;
  statut: StatutCreance;
}

export interface CreancesData {
  items: LigneCreance[];
  total_facture: number;
  total_paye: number;
  total_reste: number;
  total_en_retard: number;
  nb_clients_en_retard: number;
  delai_jours: number;
}

export type StatutFactureClient = "payee" | "partielle" | "en_attente" | "en_retard";

export interface FactureClient {
  type: "facture" | "location";
  id: number;
  numero: string;
  date: string;
  echeance: string;
  ttc: number;
  paye: number;
  reste: number;
  statut: StatutFactureClient;
  jours_retard: number;
}

export interface PaiementClient {
  id: number;
  date: string;
  montant: number;
  mode: string;
  mode_label: string;
  reference: string | null;
  note: string | null;
  facture_numero: string;
}

export interface DetailClient {
  client: string;
  email: string | null;
  telephone: string | null;
  total_facture: number;
  total_paye: number;
  reste: number;
  delai_jours: number;
  modes: Record<string, string>;
  factures: FactureClient[];
  paiements: PaiementClient[];
}

export const LABELS_STATUT_CREANCE: Record<StatutCreance, string> = { solde: "Soldé", en_cours: "En cours", en_retard: "En retard" };
export const LABELS_STATUT_FACTURE: Record<StatutFactureClient, string> = {
  payee: "Payée", partielle: "Partielle", en_attente: "En attente", en_retard: "En retard",
};

export const LABELS_CLASSE: Record<number, string> = {
  1: "Capitaux",
  2: "Immobilisations",
  3: "Stocks",
  4: "Tiers",
  5: "Trésorerie",
  6: "Charges",
  7: "Produits",
};

// ---------------------------------------------------------------- formatage
const nf = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function fmtMontant(n: number | null | undefined): string {
  return nf.format(Number(n || 0));
}

export function fmtTND(n: number | null | undefined): string {
  return `${fmtMontant(n)} TND`;
}

export function fmtDate(iso: string): string {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function libelleMois(cle: string): string {
  const [a, m] = cle.split("-");
  return `${MOIS_COURTS[Number(m) - 1]} ${a.slice(2)}`;
}

// ------------------------------------------------------------------ périodes
/** Date locale au format AAAA-MM-JJ (évite le décalage UTC de toISOString). */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type PeriodeCle = "jour" | "semaine" | "mois" | "trimestre" | "annee" | "perso";

export const LABELS_PERIODE: Record<PeriodeCle, string> = {
  jour: "Aujourd'hui",
  semaine: "Cette semaine",
  mois: "Ce mois",
  trimestre: "Ce trimestre",
  annee: "Cette année",
  perso: "Période personnalisée",
};

export function bornesPeriode(cle: Exclude<PeriodeCle, "perso">, ref = new Date()): [string, string] {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (cle) {
    case "jour":
      return [isoLocal(ref), isoLocal(ref)];
    case "semaine": {
      const decalage = (ref.getDay() + 6) % 7; // lundi = 0
      const debut = new Date(y, m, ref.getDate() - decalage);
      const fin = new Date(y, m, ref.getDate() - decalage + 6);
      return [isoLocal(debut), isoLocal(fin)];
    }
    case "mois":
      return [isoLocal(new Date(y, m, 1)), isoLocal(new Date(y, m + 1, 0))];
    case "trimestre": {
      const t = Math.floor(m / 3) * 3;
      return [isoLocal(new Date(y, t, 1)), isoLocal(new Date(y, t + 3, 0))];
    }
    case "annee":
      return [`${y}-01-01`, `${y}-12-31`];
  }
}

// ------------------------------------------------------------------- appels API
export const comptaApi = {
  dashboard: (du: string, au: string) =>
    api.get<DashboardCompta>(`/comptabilite/dashboard?date_du=${du}&date_au=${au}`),
  rattrapage: () =>
    api.post<{ crees: Record<string, number>; diagnostic: DiagnosticCompta }>("/comptabilite/rattrapage", {}),
  comptes: (params: Record<string, string> = {}) =>
    api.get<Compte[]>(`/comptabilite/comptes?${new URLSearchParams(params).toString()}`),
  creances: (params: Record<string, string> = {}) =>
    api.get<CreancesData>(`/comptabilite/creances?${new URLSearchParams(params).toString()}`),
  detailClient: (nom: string) => api.get<DetailClient>(`/comptabilite/creances/detail?nom=${encodeURIComponent(nom)}`),
  ecritures: (params: Record<string, string>) =>
    api.get<PageEcritures>(`/comptabilite/ecritures?${new URLSearchParams(params).toString()}`),
};

/** Les exports sont ouverts via un lien <a> : le jeton passe en paramètre d'URL,
 * comme pour les PDF de factures (voir api.ts). */
export function exportJournalUrl(format: "pdf" | "xlsx", filtres: Record<string, string>): string {
  const token = localStorage.getItem("token") || "";
  const params = new URLSearchParams({ ...filtres, access_token: token });
  return `${API_URL}/comptabilite/ecritures/export/${format}?${params.toString()}`;
}

function urlAvecJeton(chemin: string, params: Record<string, string>): string {
  const token = localStorage.getItem("token") || "";
  return `${API_URL}${chemin}?${new URLSearchParams({ ...params, access_token: token }).toString()}`;
}

export const releveClientUrl = (nom: string, du?: string, au?: string) =>
  urlAvecJeton("/comptabilite/creances/releve/pdf", { nom, ...(du ? { date_du: du } : {}), ...(au ? { date_au: au } : {}) });

export const relanceClientUrl = (nom: string) => urlAvecJeton("/comptabilite/creances/relance/pdf", { nom });
