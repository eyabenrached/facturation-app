import { useEffect, useState } from "react";
import { api } from "../api";

interface ParClient {
  client_id: number;
  nom_client: string;
  total: number;
  nb: number;
}

interface ParClientLocation {
  nom_client: string;
  total: number;
  nb: number;
}

interface ParTransporteur {
  transporteur_id: number;
  nom_transporteur: string;
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
  chiffre_affaires_location: number;
  nb_mouvements_location: number;
  nb_mouvements_location_non_factures: number;
  total_facture_location_ttc: number;
  total_encaisse_location: number;
  total_impaye_location: number;
  par_client_location: ParClientLocation[];
  par_jour_location: ParJour[];
  par_transporteur: ParTransporteur[];
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
  const maxJourLocation = data ? Math.max(1, ...data.par_jour_location.map((j) => j.total)) : 1;

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

          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Chiffre d'affaires par transporteur</h3>
            <p style={{ marginTop: "-0.5rem", color: "var(--muted)", fontSize: "0.8rem" }}>
              Mouvements &amp; Facturation + Mouvements Location cumulés.
            </p>
            {data.par_transporteur.length === 0 && <p>Aucun mouvement avec transporteur choisi ce mois-ci.</p>}
            {data.par_transporteur.map((t) => (
              <div key={t.transporteur_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--line)" }}>
                <span>{t.nom_transporteur} <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>({t.nb} mouvement{t.nb > 1 ? "s" : ""})</span></span>
                <strong>{t.total.toFixed(3)} TND</strong>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: "2rem", color: "#1f3864" }}>Mouvements Location</h3>

          <div className="recap-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="recap-box">
              <div className="label">Chiffre d'affaires location ({NOMS_MOIS[data.mois - 1]})</div>
              <div className="value">{data.chiffre_affaires_location.toFixed(3)} TND</div>
            </div>
            <div className="recap-box">
              <div className="label">Mouvements location réalisés</div>
              <div className="value">{data.nb_mouvements_location}</div>
            </div>
            <div className="recap-box">
              <div className="label">Encaissé (location)</div>
              <div className="value">{data.total_encaisse_location.toFixed(3)} TND</div>
            </div>
            <div className="recap-box">
              <div className="label">Impayé (location)</div>
              <div className="value">{data.total_impaye_location.toFixed(3)} TND</div>
            </div>
          </div>

          {data.nb_mouvements_location_non_factures > 0 && (
            <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
              ⚠️ {data.nb_mouvements_location_non_factures} mouvement(s) de location ce mois ne sont pas encore facturés.
            </p>
          )}

          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Chiffre d'affaires location par jour</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "160px", overflowX: "auto" }}>
              {data.par_jour_location.map((j) => (
                <div
                  key={j.jour}
                  title={`${j.jour} : ${j.total.toFixed(3)} TND`}
                  style={{
                    flex: "0 0 auto",
                    width: "18px",
                    height: `${Math.max(2, (j.total / maxJourLocation) * 140)}px`,
                    background: j.total > 0 ? "#1f8a70" : "#e5e5e5",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: "3px", marginTop: "4px", fontSize: "0.65rem", color: "var(--muted)" }}>
              {data.par_jour_location.map((j) => (
                <div key={j.jour} style={{ flex: "0 0 auto", width: "18px", textAlign: "center" }}>
                  {j.jour}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginTop: 0, color: "#1f3864" }}>Chiffre d'affaires location par client</h3>
            {data.par_client_location.length === 0 && <p>Aucun mouvement de location ce mois-ci.</p>}
            {data.par_client_location.map((c) => (
              <div key={c.nom_client} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--line)" }}>
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