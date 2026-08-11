import { useEffect, useState } from "react";
import { api } from "../api";

interface ParClient {
  client_id: number;
  nom_client: string;
  total: number;
  nb: number;
}

interface ParJour {
  jour: number;
  total: number;
}

interface RevenuMensuel {
  annee: number;
  mois: number;
  chiffre_affaires: number;
  nb_mouvements: number;
  nb_mouvements_non_factures: number;
  total_facture_ttc: number;
  total_encaisse: number;
  total_impaye: number;
  par_client: ParClient[];
  par_jour: ParJour[];
}

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default function Dashboard() {
  const maintenant = new Date();
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth() + 1);
  const [data, setData] = useState<RevenuMensuel | null>(null);
  const [chargement, setChargement] = useState(false);

  async function charger() {
    setChargement(true);
    try {
      const res = await api.get<RevenuMensuel>(`/dashboard/revenu-mensuel?annee=${annee}&mois=${mois}`);
      setData(res);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, [annee, mois]);

  const maxJour = data ? Math.max(1, ...data.par_jour.map((j) => j.total)) : 1;

  return (
    <div>
      <div className="page-header">
        <h2>Tableau de bord</h2>
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

      {data && !chargement && (
        <>
          <div className="recap-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="recap-box">
              <div className="label">Chiffre d'affaires ({NOMS_MOIS[data.mois - 1]})</div>
              <div className="value">{data.chiffre_affaires.toFixed(3)} TND</div>
            </div>
            <div className="recap-box">
              <div className="label">Mouvements réalisés</div>
              <div className="value">{data.nb_mouvements}</div>
            </div>
            <div className="recap-box">
              <div className="label">Encaissé</div>
              <div className="value">{data.total_encaisse.toFixed(3)} TND</div>
            </div>
            <div className="recap-box">
              <div className="label">Impayé</div>
              <div className="value">{data.total_impaye.toFixed(3)} TND</div>
            </div>
          </div>

          {data.nb_mouvements_non_factures > 0 && (
            <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
              ⚠️ {data.nb_mouvements_non_factures} mouvement(s) de ce mois ne sont pas encore facturés.
            </p>
          )}

          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Chiffre d'affaires par jour</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "160px", overflowX: "auto" }}>
              {data.par_jour.map((j) => (
                <div
                  key={j.jour}
                  title={`${j.jour} : ${j.total.toFixed(3)} TND`}
                  style={{
                    flex: "0 0 auto",
                    width: "18px",
                    height: `${Math.max(2, (j.total / maxJour) * 140)}px`,
                    background: j.total > 0 ? "#c0791b" : "#e5e5e5",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: "3px", marginTop: "4px", fontSize: "0.65rem", color: "var(--muted)" }}>
              {data.par_jour.map((j) => (
                <div key={j.jour} style={{ flex: "0 0 auto", width: "18px", textAlign: "center" }}>
                  {j.jour}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Chiffre d'affaires par client</h3>
            {data.par_client.length === 0 && <p>Aucun mouvement ce mois-ci.</p>}
            {data.par_client.map((c) => (
              <div key={c.client_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--line)" }}>
                <span>{c.nom_client} <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>({c.nb} mouvement{c.nb > 1 ? "s" : ""})</span></span>
                <strong>{c.total.toFixed(3)} TND</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}