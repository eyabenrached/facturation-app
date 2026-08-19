import { useEffect, useState } from "react";
import { api } from "../api";
import {
  ResumeFinancier, EvolutionMensuelle, BeneficeParMouvement,
  Vehicule, LABELS_CATEGORIE_DEPENSE,
} from "../types";
import { DataTable } from "../components/DataTable";
import { useAuth } from "../auth/AuthContext";

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const COULEURS_CATEGORIE: Record<string, string> = {
  carburant: "#c0791b",
  entretien: "#8a5a1f",
  assurance: "#1f8a70",
  salaire_chauffeur: "#1f3864",
  cnss: "#5b6b9e",
  taxe: "#a83232",
  autre: "#7a7a7a",
};

function premierEtDernierJour(annee: number, mois: number): [string, string] {
  const premier = new Date(annee, mois - 1, 1);
  const dernier = new Date(annee, mois, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [fmt(premier), fmt(dernier)];
}

export default function Finances() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";

  const maintenant = new Date();
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth() + 1);

  const [resume, setResume] = useState<ResumeFinancier | null>(null);
  const [evolution, setEvolution] = useState<EvolutionMensuelle[]>([]);
  const [chargement, setChargement] = useState(false);

  // Détail par mouvement : affiché à la demande (peut être long), filtrable par véhicule
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [detailVehicule, setDetailVehicule] = useState("");
  const [detailMouvements, setDetailMouvements] = useState<BeneficeParMouvement[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);

  useEffect(() => {
    if (estAdmin) api.get<Vehicule[]>("/vehicules/").then(setVehicules);
  }, [estAdmin]);

  async function charger() {
    if (!estAdmin) return;
    setChargement(true);
    const [du, au] = premierEtDernierJour(annee, mois);
    try {
      const [r1, r2] = await Promise.all([
        api.get<ResumeFinancier>(`/finances/resume?date_du=${du}&date_au=${au}`),
        api.get<EvolutionMensuelle[]>(`/finances/evolution-annuelle?annee=${annee}`),
      ]);
      setResume(r1);
      setEvolution(r2);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, [annee, mois]);

  async function chargerDetailMouvements() {
    const [du, au] = premierEtDernierJour(annee, mois);
    const params = new URLSearchParams({ date_du: du, date_au: au });
    if (detailVehicule) params.set("vehicule_id", detailVehicule);
    setDetailMouvements(await api.get<BeneficeParMouvement[]>(`/finances/benefice-par-mouvement?${params.toString()}`));
  }

  useEffect(() => {
    if (detailOuvert) chargerDetailMouvements();
  }, [detailOuvert, detailVehicule, annee, mois]);

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header">
          <h2>Finances</h2>
        </div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  const maxDepenseCategorie = resume ? Math.max(1, ...resume.depenses_par_categorie.map((d) => d.total)) : 1;
  const maxEvolution = Math.max(1, ...evolution.map((e) => Math.max(e.revenus, e.depenses)));

  return (
    <div>
      <div className="page-header">
        <h2>Finances</h2>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <div className="form-field">
            <label>Mois</label>
            <select value={mois} onChange={(e) => setMois(Number(e.target.value))}>
              {NOMS_MOIS.map((nom, i) => (
                <option key={i} value={i + 1}>{nom}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Année</label>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => maintenant.getFullYear() - 3 + i).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {chargement && <p>Chargement…</p>}

      {resume && !chargement && (
        <>
          {/* ---------- Indicateurs clés (1 à 5) ---------- */}
          <div className="recap-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            <div className="recap-box">
              <div className="label">Chiffre d'affaires total</div>
              <div className="value">{resume.total_revenus.toFixed(3)} TND</div>
            </div>
            <div className="recap-box">
              <div className="label">Total des dépenses</div>
              <div className="value">{resume.total_depenses.toFixed(3)} TND</div>
            </div>
            <div className="recap-box">
              <div className="label">Bénéfice net</div>
              <div className="value" style={{ color: resume.benefice_net >= 0 ? "#1f8a70" : "#a83232" }}>
                {resume.benefice_net.toFixed(3)} TND
              </div>
            </div>
            <div className="recap-box">
              <div className="label">Marge bénéficiaire</div>
              <div className="value" style={{ color: resume.marge_beneficiaire >= 0 ? "#1f8a70" : "#a83232" }}>
                {resume.marge_beneficiaire.toFixed(1)} %
              </div>
            </div>
            <div className="recap-box">
              <div className="label">Nombre de mouvements</div>
              <div className="value">{resume.nb_mouvements}</div>
            </div>
          </div>

          <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.4rem" }}>
            Transport : {resume.chiffre_affaires_transport.toFixed(3)} TND · Location : {resume.chiffre_affaires_location.toFixed(3)} TND
          </p>

          {/* ---------- Évolution du bénéfice mois par mois (9) ---------- */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Évolution mensuelle — {annee}</h3>
            <p style={{ marginTop: "-0.5rem", color: "var(--muted)", fontSize: "0.8rem" }}>
              <span style={{ color: "#c0791b", fontWeight: 600 }}>Revenus</span> · <span style={{ color: "#a83232", fontWeight: 600 }}>Dépenses</span> · <span style={{ color: "#1f8a70", fontWeight: 600 }}>Bénéfice</span>
            </p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "180px", overflowX: "auto", paddingTop: "1rem" }}>
              {evolution.map((e) => (
                <div
                  key={e.mois}
                  title={`${NOMS_MOIS[e.mois - 1]} : revenus ${e.revenus.toFixed(3)} TND, dépenses ${e.depenses.toFixed(3)} TND, bénéfice ${e.benefice.toFixed(3)} TND`}
                  style={{ flex: "0 0 auto", width: "46px", display: "flex", alignItems: "flex-end", gap: "3px", height: "150px" }}
                >
                  <div style={{ width: "12px", height: `${Math.max(2, (e.revenus / maxEvolution) * 150)}px`, background: e.mois === mois ? "#c0791b" : "#e0b169", borderRadius: "3px 3px 0 0" }} />
                  <div style={{ width: "12px", height: `${Math.max(2, (e.depenses / maxEvolution) * 150)}px`, background: e.mois === mois ? "#a83232" : "#d08d8d", borderRadius: "3px 3px 0 0" }} />
                  <div style={{ width: "12px", height: `${Math.max(2, (Math.abs(e.benefice) / maxEvolution) * 150)}px`, background: e.benefice >= 0 ? (e.mois === mois ? "#1f8a70" : "#7fbfae") : "#a83232", borderRadius: "3px 3px 0 0" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "4px", fontSize: "0.68rem", color: "var(--muted)" }}>
              {evolution.map((e) => (
                <div key={e.mois} style={{ flex: "0 0 auto", width: "46px", textAlign: "center" }}>
                  {NOMS_MOIS[e.mois - 1].slice(0, 3)}
                </div>
              ))}
            </div>
          </div>

          {/* ---------- Dépenses par catégorie (7) ---------- */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Dépenses par catégorie</h3>
            {resume.depenses_par_categorie.length === 0 && <p>Aucune dépense enregistrée sur cette période.</p>}
            {resume.depenses_par_categorie.map((d) => (
              <div key={d.categorie} style={{ marginBottom: "0.7rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "2px" }}>
                  <span>{d.label}</span>
                  <strong>{d.total.toFixed(3)} TND</strong>
                </div>
                <div style={{ background: "#eee", borderRadius: "4px", height: "10px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(d.total / maxDepenseCategorie) * 100}%`,
                      height: "100%",
                      background: COULEURS_CATEGORIE[d.categorie] || "#7a7a7a",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ---------- Revenus / bénéfice par client (6) ---------- */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Bénéfice par client</h3>
            <p style={{ marginTop: "-0.5rem", color: "var(--muted)", fontSize: "0.8rem" }}>
              Les charges d'exploitation non affectées à un client précis sont réparties au prorata du chiffre d'affaires de chaque client (estimation).
            </p>
            <DataTable
              rows={resume.benefice_par_client}
              columns={[
                { header: "Client", render: (c) => c.nom_client },
                { header: "Mouvements", render: (c) => c.nb_mouvements },
                { header: "Revenu", render: (c) => `${c.revenu.toFixed(3)} TND` },
                { header: "Charges réparties", render: (c) => `${c.depenses_allouees.toFixed(3)} TND` },
                {
                  header: "Bénéfice",
                  render: (c) => (
                    <strong style={{ color: c.benefice >= 0 ? "#1f8a70" : "#a83232" }}>
                      {c.benefice.toFixed(3)} TND
                    </strong>
                  ),
                },
                { header: "Marge", render: (c) => `${c.marge_pct.toFixed(1)} %` },
              ]}
            />
          </div>

          {/* ---------- Bénéfice par véhicule (8) ---------- */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Bénéfice par véhicule</h3>
            <p style={{ marginTop: "-0.5rem", color: "var(--muted)", fontSize: "0.8rem" }}>
              Dépenses directement rattachées au véhicule (carburant, entretien, assurance...) uniquement.
            </p>
            <DataTable
              rows={resume.benefice_par_vehicule}
              columns={[
                { header: "Véhicule", render: (v) => v.matricule },
                { header: "Mouvements", render: (v) => v.nb_mouvements },
                { header: "Revenu", render: (v) => `${v.revenu.toFixed(3)} TND` },
                { header: "Dépenses", render: (v) => `${v.depenses.toFixed(3)} TND` },
                {
                  header: "Bénéfice",
                  render: (v) => (
                    <strong style={{ color: v.benefice >= 0 ? "#1f8a70" : "#a83232" }}>
                      {v.benefice.toFixed(3)} TND
                    </strong>
                  ),
                },
              ]}
            />
          </div>

          {/* ---------- Détail par mouvement (à la demande) ---------- */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
              <h3 style={{ margin: 0, color: "#1f3864" }}>Bénéfice par mouvement</h3>
              <button className="btn secondary" onClick={() => setDetailOuvert((o) => !o)}>
                {detailOuvert ? "Masquer le détail" : "Afficher le détail"}
              </button>
            </div>
            {detailOuvert && (
              <>
                <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                  Le revenu est exact ; le coût est une estimation obtenue en répartissant les dépenses du véhicule sur ses mouvements de la période.
                </p>
                <div className="form-field" style={{ maxWidth: "260px", marginBottom: "0.75rem" }}>
                  <label>Filtrer par véhicule</label>
                  <select value={detailVehicule} onChange={(e) => setDetailVehicule(e.target.value)}>
                    <option value="">Tous les véhicules</option>
                    {vehicules.map((v) => (
                      <option key={v.id} value={v.id}>{v.matricule}</option>
                    ))}
                  </select>
                </div>
                <DataTable
                  rows={detailMouvements}
                  columns={[
                    { header: "Date", render: (m) => m.date },
                    { header: "Heure", render: (m) => m.heure },
                    { header: "Type", render: (m) => (m.type === "transport" ? "Transport" : "Location") },
                    { header: "Client", render: (m) => m.client },
                    { header: "Véhicule", render: (m) => m.vehicule },
                    { header: "Revenu", render: (m) => `${m.revenu.toFixed(3)} TND` },
                    { header: "Coût estimé", render: (m) => `${m.cout_estime.toFixed(3)} TND` },
                    {
                      header: "Bénéfice",
                      render: (m) => (
                        <strong style={{ color: m.benefice >= 0 ? "#1f8a70" : "#a83232" }}>
                          {m.benefice.toFixed(3)} TND
                        </strong>
                      ),
                    },
                  ]}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
