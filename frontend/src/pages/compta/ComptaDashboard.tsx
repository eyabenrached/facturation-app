import { useCallback, useEffect, useState } from "react";
import {
  bornesPeriode, comptaApi, DashboardCompta, fmtDate, fmtMontant, LABELS_PERIODE, PeriodeCle,
} from "../../comptaApi";
import { GraphChiffreAffaires, GraphRecettesDepenses, GraphRepartition, GraphResultat } from "../../components/compta/Charts";
import { useToast } from "../../components/compta/Toast";
import { useAuth } from "../../auth/AuthContext";
import "./compta.css";

const PERIODES: PeriodeCle[] = ["jour", "semaine", "mois", "trimestre", "annee", "perso"];

function Kpi({ label, valeur, classe = "", hint, signe }: { label: string; valeur: number; classe?: string; hint?: string; signe?: boolean }) {
  const couleur = signe ? (valeur >= 0 ? "valeur-positive" : "valeur-negative") : "";
  return (
    <div className={`compta-kpi ${classe}`}>
      <div className="label">{label}</div>
      <div className={`value ${couleur}`}>
        {fmtMontant(valeur)}
        <small>TND</small>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export default function ComptaDashboard() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const { toast, toastHost } = useToast();

  const [periode, setPeriode] = useState<PeriodeCle>("mois");
  const [persoDu, setPersoDu] = useState(() => bornesPeriode("mois")[0]);
  const [persoAu, setPersoAu] = useState(() => bornesPeriode("mois")[1]);
  const [data, setData] = useState<DashboardCompta | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [rattrapageEnCours, setRattrapageEnCours] = useState(false);

  const [du, au] = periode === "perso" ? [persoDu, persoAu] : bornesPeriode(periode);

  const charger = useCallback(async () => {
    if (!estAdmin) return;
    if (!du || !au || du > au) {
      setErreur("La date de début doit précéder la date de fin.");
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      setData(await comptaApi.dashboard(du, au));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [estAdmin, du, au]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function genererEcritures() {
    setRattrapageEnCours(true);
    try {
      const r = await comptaApi.rattrapage();
      const c = r.crees;
      const total = c.factures + c.paiements + c.locations + c.paiements_location + c.depenses;
      toast(`${total} écriture(s) générée(s)${c.erreurs ? ` — ${c.erreurs} erreur(s), voir les journaux du serveur` : ""}.`, c.erreurs ? "erreur" : "succes");
      await charger();
    } catch (e) {
      toast((e as Error).message, "erreur");
    } finally {
      setRattrapageEnCours(false);
    }
  }

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header"><h2>Comptabilité</h2></div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  const d = data;
  return (
    <div>
      <div className="page-header">
        <h2>Comptabilité — Tableau de bord</h2>
      </div>

      <div className="compta-periodes no-print">
        {PERIODES.map((p) => (
          <button key={p} className={`compta-chip${periode === p ? " actif" : ""}`} onClick={() => setPeriode(p)}>
            {LABELS_PERIODE[p]}
          </button>
        ))}
        {periode === "perso" && (
          <>
            <input type="date" value={persoDu} max={persoAu} onChange={(e) => setPersoDu(e.target.value)} aria-label="Date de début" />
            <span>→</span>
            <input type="date" value={persoAu} min={persoDu} onChange={(e) => setPersoAu(e.target.value)} aria-label="Date de fin" />
          </>
        )}
      </div>
      <p className="compta-sous-titre">Période : du {fmtDate(du)} au {fmtDate(au)}</p>

      {erreur && <p className="error-msg">{erreur}</p>}

      {d && d.diagnostic.total > 0 && (
        <div className="compta-bandeau">
          <span>
            <strong>{d.diagnostic.total} opération(s)</strong> existante(s) (factures, règlements, dépenses) n'ont pas encore d'écriture comptable.
          </span>
          <button className="btn" onClick={genererEcritures} disabled={rattrapageEnCours}>
            {rattrapageEnCours ? "Génération…" : "Générer les écritures manquantes"}
          </button>
        </div>
      )}

      {chargement && !d && <div className="compta-chargement">Chargement…</div>}

      {d && (
        <div style={{ opacity: chargement ? 0.55 : 1, transition: "opacity .15s" }}>
          <div className="compta-section-titre">Trésorerie</div>
          <div className="compta-kpis">
            <Kpi label="Solde bancaire" valeur={d.solde_banque} signe hint="Compte 512000, cumul à la fin de période" />
            <Kpi label="Solde caisse" valeur={d.solde_caisse} signe hint="Compte 530000" />
            <Kpi label="Paiements en attente" valeur={d.paiements_en_attente.montant} classe="or" hint={`${d.paiements_en_attente.nombre} facture(s) non soldée(s)`} />
          </div>

          <div className="compta-section-titre">Activité de la période</div>
          <div className="compta-kpis">
            <Kpi label="Total recettes" valeur={d.total_recettes} classe="vert" hint="Produits (classe 7), hors TVA" />
            <Kpi label="Total dépenses" valeur={d.total_depenses} classe="rouge" hint="Charges (classe 6)" />
            <Kpi label="Chiffre d'affaires" valeur={d.chiffre_affaires} hint="Comptes 70x, hors TVA" />
            <Kpi label="Résultat du mois" valeur={d.resultat_mois} signe hint="Mois de la date de fin de période" />
          </div>

          <div className="compta-section-titre">Clients et fournisseurs</div>
          <div className="compta-kpis">
            <Kpi label="Créances clients" valeur={d.creances_clients} classe="or" hint="Compte 411000, à recevoir" />
            <Kpi label="Dettes fournisseurs" valeur={d.dettes_fournisseurs} classe="or" hint="Compte 401000, à payer" />
          </div>

          <div className="compta-section-titre">TVA</div>
          <div className="compta-kpis">
            <Kpi label="TVA collectée" valeur={d.tva_collectee} />
            <Kpi label="TVA déductible" valeur={d.tva_deductible} />
            <Kpi label="TVA à payer" valeur={d.tva_a_payer} signe={false} classe={d.tva_a_payer > 0 ? "rouge" : "vert"} hint="Collectée − déductible" />
          </div>

          <div className="compta-section-titre">Évolution</div>
          <div className="compta-graphs">
            <div className="card">
              <h3>Recettes vs dépenses par mois</h3>
              <GraphRecettesDepenses donnees={d.serie_mensuelle} />
            </div>
            <div className="card">
              <h3>Chiffre d'affaires par mois</h3>
              <GraphChiffreAffaires donnees={d.serie_mensuelle} />
            </div>
            <div className="card">
              <h3>Résultat mensuel</h3>
              <GraphResultat donnees={d.serie_mensuelle} />
            </div>
            <div className="card">
              <h3>Répartition des charges</h3>
              <GraphRepartition donnees={d.repartition_charges} />
            </div>
          </div>
        </div>
      )}
      {toastHost}
    </div>
  );
}
