import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { bornesPeriode, comptaApi, fmtTND, libelleMois, TvaData } from "../../comptaApi";
import "./compta.css";

export default function ComptaTva() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [[du, au], setPeriode] = useState<[string, string]>(bornesPeriode("annee"));
  const [data, setData] = useState<TvaData | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!estAdmin) return;
    setErreur("");
    comptaApi.tva(du, au).then(setData).catch((e) => setErreur((e as Error).message));
  }, [estAdmin, du, au]);

  if (!estAdmin) return <p>Cette section est réservée aux administrateurs.</p>;
  return (
    <div>
      <div className="page-header"><h2>🧾 TVA</h2><button className="btn secondary no-print" onClick={() => window.print()}>Imprimer</button></div>
      <p className="compta-sous-titre">Calculée à partir du journal : 445710 TVA collectée, 445660 TVA déductible, 447000 droits de timbre.</p>
      <div className="compta-periodes no-print">
        {(["mois", "trimestre", "annee"] as const).map((c) => (
          <button key={c} className={`compta-chip${bornesPeriode(c)[0] === du && bornesPeriode(c)[1] === au ? " actif" : ""}`} onClick={() => setPeriode(bornesPeriode(c))}>
            {c === "mois" ? "Ce mois" : c === "trimestre" ? "Ce trimestre" : "Cette année"}
          </button>
        ))}
        <input type="date" value={du} onChange={(e) => e.target.value && setPeriode([e.target.value, au])} aria-label="Du" />
        <input type="date" value={au} onChange={(e) => e.target.value && setPeriode([du, e.target.value])} aria-label="Au" />
      </div>
      {erreur && <p className="error-msg">{erreur}</p>}
      {data && (
        <>
          <div className="compta-kpis">
            <div className="compta-kpi"><div className="label">TVA collectée</div><div className="value">{fmtTND(data.total_collectee)}</div></div>
            <div className="compta-kpi"><div className="label">TVA déductible</div><div className="value">{fmtTND(data.total_deductible)}</div></div>
            <div className="compta-kpi or"><div className="label">TVA à payer</div><div className={`value ${data.total_a_payer < 0 ? "valeur-negative" : ""}`}>{fmtTND(data.total_a_payer)}</div>
              {data.total_a_payer < 0 && <div className="hint">Crédit de TVA</div>}</div>
            <div className="compta-kpi"><div className="label">Droits de timbre</div><div className="value">{fmtTND(data.total_timbre)}</div></div>
          </div>
          <div className="data-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="data-table compta-table" style={{ minWidth: 0 }}>
              <thead><tr><th>Mois</th><th className="num">TVA collectée</th><th className="num">TVA déductible</th><th className="num">TVA à payer</th><th className="num">Timbre</th></tr></thead>
              <tbody>
                {data.lignes.length === 0 && <tr><td colSpan={5} className="empty-cell">Aucune TVA sur cette période.</td></tr>}
                {data.lignes.map((l) => (
                  <tr key={l.mois}><td>{libelleMois(l.mois)}</td><td className="num">{fmtTND(l.collectee)}</td><td className="num">{fmtTND(l.deductible)}</td><td className="num">{fmtTND(l.a_payer)}</td><td className="num">{fmtTND(l.timbre)}</td></tr>
                ))}
              </tbody>
              {data.lignes.length > 0 && (
                <tfoot><tr><td>Total</td><td className="num">{fmtTND(data.total_collectee)}</td><td className="num">{fmtTND(data.total_deductible)}</td><td className="num">{fmtTND(data.total_a_payer)}</td><td className="num">{fmtTND(data.total_timbre)}</td></tr></tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
