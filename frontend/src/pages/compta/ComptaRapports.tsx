import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { BalanceData, bornesPeriode, comptaApi, fmtMontant } from "../../comptaApi";
import "./compta.css";

export default function ComptaRapports() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [[du, au], setPeriode] = useState<[string, string]>(bornesPeriode("annee"));
  const [data, setData] = useState<BalanceData | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!estAdmin) return;
    setErreur("");
    comptaApi.balance(du, au).then(setData).catch((e) => setErreur((e as Error).message));
  }, [estAdmin, du, au]);

  if (!estAdmin) return <p>Cette section est réservée aux administrateurs.</p>;
  return (
    <div>
      <div className="page-header"><h2>📊 Rapports — Balance générale</h2><button className="btn secondary no-print" onClick={() => window.print()}>Imprimer</button></div>
      <p className="compta-sous-titre">Total débit et total crédit de chaque compte sur la période, toutes écritures confondues (automatiques et manuelles).</p>
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
        <div className="data-table-wrap">
          <table className="data-table compta-table" style={{ minWidth: 0 }}>
            <thead><tr><th>Compte</th><th>Libellé</th><th className="num">Débit</th><th className="num">Crédit</th><th className="num">Solde débiteur</th><th className="num">Solde créditeur</th></tr></thead>
            <tbody>
              {data.lignes.length === 0 && <tr><td colSpan={6} className="empty-cell">Aucune écriture sur cette période.</td></tr>}
              {data.lignes.map((l) => (
                <tr key={l.numero}>
                  <td><span className="compte-num">{l.numero}</span></td><td>{l.libelle}</td>
                  <td className="num">{fmtMontant(l.debit)}</td><td className="num">{fmtMontant(l.credit)}</td>
                  <td className="num">{l.solde_debiteur ? fmtMontant(l.solde_debiteur) : ""}</td><td className="num">{l.solde_crediteur ? fmtMontant(l.solde_crediteur) : ""}</td>
                </tr>
              ))}
            </tbody>
            {data.lignes.length > 0 && (
              <tfoot><tr><td colSpan={2}>Total {data.equilibre ? "✓ équilibré" : "✕ DÉSÉQUILIBRÉ"}</td><td className="num">{fmtMontant(data.total_debit)}</td><td className="num">{fmtMontant(data.total_credit)}</td><td colSpan={2} /></tr></tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
