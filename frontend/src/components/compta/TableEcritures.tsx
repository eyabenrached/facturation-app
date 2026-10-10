import { Fragment, ReactNode } from "react";
import { Ecriture, fmtDate, fmtMontant } from "../../comptaApi";

interface Props {
  items: Ecriture[];
  types: Record<string, string>;
  chargement?: boolean;
  /** Si renseigné, ajoute une colonne portant ce libellé (Client, Fournisseur…) avec le tiers de l'écriture. */
  libelleTiers?: string;
  vide?: string;
  onDetail: (e: Ecriture) => void;
  actions?: (e: Ecriture) => ReactNode;
  pied?: { total: number; debit: number; credit: number };
}

const LABEL_JOURNAL: Record<string, string> = {
  VT: "Ventes (VT)", BQ: "Banque 1 (BQ)", BQ2: "Banque 2 (BQ2)", CA: "Caisse (CA)", AC: "Achats (AC)", OD: "OD",
};

/** Tableau d'écritures « grand livre » : une écriture = un bloc de lignes, avec sa traçabilité. */
export function TableEcritures({ items, types, chargement, libelleTiers, vide, onDetail, actions, pied }: Props) {
  const colonnes = 8 + (libelleTiers ? 1 : 0) + (actions ? 1 : 0);
  return (
    <div className="data-table-wrap" style={{ opacity: chargement ? 0.55 : 1, transition: "opacity .15s" }}>
      <table className="data-table compta-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>N° pièce</th>
            {libelleTiers && <th>{libelleTiers}</th>}
            <th>Libellé</th>
            <th>Compte</th>
            <th className="num">Débit</th>
            <th className="num">Crédit</th>
            <th>Référence</th>
            <th>Observation</th>
            {actions && <th className="no-print" />}
          </tr>
        </thead>
        {items.length === 0 && (
          <tbody>
            <tr><td colSpan={colonnes} className="empty-cell">{chargement ? "Chargement…" : vide ?? "Aucune écriture."}</td></tr>
          </tbody>
        )}
        {items.map((e) => (
          <tbody key={e.id} className="ecriture">
            {e.lignes.map((l, i) => (
              <tr key={l.id}>
                {i === 0 && (
                  <Fragment>
                    <td rowSpan={e.lignes.length}>{fmtDate(e.date)}</td>
                    <td rowSpan={e.lignes.length}>
                      <button className="btn-link piece-lien" onClick={() => onDetail(e)} title="Voir la traçabilité">{e.numero_piece}</button>
                    </td>
                    {libelleTiers && <td rowSpan={e.lignes.length}>{e.tiers || <span className="muted">—</span>}</td>}
                    <td rowSpan={e.lignes.length}>
                      {e.libelle}
                      <div className="badges-ligne">
                        <span className="badge" title="Journal">{LABEL_JOURNAL[e.journal] ?? e.journal}</span>
                        <span className={`badge ${e.automatique ? "auto" : "manuelle"}`}>{e.automatique ? "Automatique" : "Manuelle"}</span>
                        {e.dossier_label && <span className="badge dossier">{e.dossier_label}</span>}
                        {types[e.type_operation] && e.type_operation !== "manuelle" && <span className="badge">{types[e.type_operation]}</span>}
                        {e.regularisee_par && <span className="badge cloture" title={`Corrigée par ${e.regularisee_par}`}>Régularisée</span>}
                        {e.cloturee && <span className="badge cloture">Clôturée</span>}
                      </div>
                    </td>
                  </Fragment>
                )}
                <td>
                  <span className="compte-num">{l.compte_numero}</span>{l.compte_libelle}
                  {l.compte_auxiliaire && <div className="muted" style={{ fontSize: "0.76rem" }}>{l.compte_auxiliaire}</div>}
                  {l.devise !== "TND" && l.montant_devise != null && (
                    <div className="ligne-devise">{fmtMontant(l.montant_devise)} {l.devise} × {l.taux_change}</div>
                  )}
                </td>
                <td className="num">{l.debit ? fmtMontant(l.debit) : ""}</td>
                <td className="num">{l.credit ? fmtMontant(l.credit) : ""}</td>
                {i === 0 && (
                  <Fragment>
                    <td rowSpan={e.lignes.length} className="muted">{e.reference || ""}</td>
                    <td rowSpan={e.lignes.length} className="muted">{e.observation || ""}</td>
                    {actions && <td rowSpan={e.lignes.length} className="actions no-print">{actions(e)}</td>}
                  </Fragment>
                )}
              </tr>
            ))}
          </tbody>
        ))}
        {pied && items.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4 + (libelleTiers ? 1 : 0)}>Total des écritures filtrées ({pied.total})</td>
              <td className="num">{fmtMontant(pied.debit)}</td>
              <td className="num">{fmtMontant(pied.credit)}</td>
              <td colSpan={2 + (actions ? 1 : 0)} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
