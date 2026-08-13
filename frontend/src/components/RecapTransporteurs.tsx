import { useEffect, useState } from "react";
import { api } from "../api";
import { RecapTransporteurs as RecapTransporteursType } from "../types";

interface Props {
  endpoint: string; // ex: "/mouvements/recap-transporteurs"
  dateDu: string;
  dateAu: string;
}

export function RecapTransporteurs({ endpoint, dateDu, dateAu }: Props) {
  const [recap, setRecap] = useState<RecapTransporteursType | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateDu) params.set("date_du", dateDu);
    if (dateAu) params.set("date_au", dateAu);
    api.get<RecapTransporteursType>(`${endpoint}?${params.toString()}`).then(setRecap);
  }, [endpoint, dateDu, dateAu]);

  if (!recap || recap.transporteurs.length === 0) return null;

  return (
    <div className="card recap-transporteurs-card" style={{ marginBottom: "1.4rem" }}>
      <h3 style={{ marginTop: 0, color: "#1f3864" }}>Chrono par heure et par transporteur</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table recap-transporteurs-table">
          <thead>
            <tr>
              <th>Heure</th>
              {recap.transporteurs.map((t) => (
                <th key={t.id}>{t.nom_agence}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recap.lignes.map((ligne) => (
              <tr key={ligne.heure}>
                <td className="heure-cell">{ligne.heure.slice(0, 5)}</td>
                {recap.transporteurs.map((t) => (
                  <td key={t.id} className="compte-cell">{ligne.comptes[String(t.id)] ?? 0}</td>
                ))}
              </tr>
            ))}
            <tr className="ligne-total">
              <td>TOTAL</td>
              {recap.transporteurs.map((t) => (
                <td key={t.id}>{recap.totaux[String(t.id)] ?? 0}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
