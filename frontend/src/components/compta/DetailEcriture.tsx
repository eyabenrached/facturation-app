import { useState } from "react";
import { api } from "../../api";
import { Ecriture, fmtDate, fmtMontant, isoLocal } from "../../comptaApi";
import { Modal } from "../Modal";

interface Props {
  ecriture: Ecriture;
  types: Record<string, string>;
  onFermer: () => void;
  /** Appelé après création d'une écriture de régularisation (rechargez la liste). */
  onRegularisee: (nouvelle: Ecriture) => void;
}

function fmtHorodatage(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Fiche de traçabilité : pourquoi cette écriture existe, qui l'a créée, d'où elle vient. */
export function DetailEcriture({ ecriture: e, types, onFermer, onRegularisee }: Props) {
  const [formulaire, setFormulaire] = useState(false);
  const [motif, setMotif] = useState("");
  const [date, setDate] = useState(isoLocal(new Date()));
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const peutRegulariser = e.type_operation !== "regularisation" && !e.regularisee_par && e.type_operation !== "solde_initial";

  async function regulariser() {
    setErreur("");
    setEnvoi(true);
    try {
      const n = await api.post<Ecriture>(`/comptabilite/ecritures/${e.id}/regularisation`, { date, motif: motif.trim() || null });
      onRegularisee(n);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  const source = e.automatique
    ? `Générée automatiquement par l'application (${types[e.type_operation] ?? e.type_operation})`
    : e.type_operation === "regularisation"
      ? "Écriture de régularisation saisie par le comptable"
      : e.type_operation === "solde_initial"
        ? "Solde d'ouverture saisi par le comptable"
        : "Saisie manuelle par le comptable";

  return (
    <Modal title={`Écriture ${e.numero_piece}`} onClose={onFermer}>
      <p style={{ marginTop: 0 }}><strong>{e.libelle}</strong></p>
      <div className="detail-grille">
        <div><span>Origine</span><b><span className={`badge ${e.automatique ? "auto" : "manuelle"}`}>{e.automatique ? "AUTOMATIQUE" : "MANUELLE"}</span></b></div>
        <div><span>Dossier</span><b>{e.dossier_label || "—"}</b></div>
        <div><span>Référence</span><b>{e.reference || "—"}</b></div>
        <div><span>Journal</span><b>{e.journal}</b></div>
        <div><span>Date de l'écriture</span><b>{fmtDate(e.date)}</b></div>
        <div><span>Date de création</span><b>{fmtHorodatage(e.date_creation)}</b></div>
        <div><span>Utilisateur</span><b>{e.utilisateur ?? (e.automatique ? "Système (automatique)" : "—")}</b></div>
        <div><span>Tiers</span><b>{e.tiers || "—"}</b></div>
      </div>
      <p className="detail-pourquoi">{source}.{e.regularise_id ? ` Elle corrige l'écriture n° ${e.regularise_id}.` : ""}{e.regularisee_par ? ` Elle a été corrigée par ${e.regularisee_par}.` : ""}</p>
      {e.observation && <p className="muted" style={{ marginTop: 0 }}>Observation : {e.observation}</p>}

      <table className="compta-lignes detail-lignes">
        <thead>
          <tr><th>Compte</th><th>Tiers</th><th style={{ textAlign: "right" }}>Débit</th><th style={{ textAlign: "right" }}>Crédit</th></tr>
        </thead>
        <tbody>
          {e.lignes.map((l) => (
            <tr key={l.id}>
              <td><span className="compte-num">{l.compte_numero}</span> {l.compte_libelle}
                {l.devise !== "TND" && l.montant_devise != null && <div className="ligne-devise">{fmtMontant(l.montant_devise)} {l.devise} au taux {l.taux_change}</div>}
              </td>
              <td className="muted">{l.compte_auxiliaire || ""}</td>
              <td className="num">{l.debit ? fmtMontant(l.debit) : ""}</td>
              <td className="num">{l.credit ? fmtMontant(l.credit) : ""}</td>
            </tr>
          ))}
          <tr className="detail-total">
            <td colSpan={2}>Total (en TND)</td>
            <td className="num">{fmtMontant(e.total_debit)}</td>
            <td className="num">{fmtMontant(e.total_credit)}</td>
          </tr>
        </tbody>
      </table>

      {erreur && <p className="error-msg">{erreur}</p>}
      {formulaire ? (
        <div className="regul-form">
          <p style={{ margin: "0 0 0.5rem" }}>
            Une écriture de régularisation inverse celle-ci (débit ↔ crédit). L'écriture d'origine n'est pas modifiée.
          </p>
          <div className="form-grid" style={{ gridTemplateColumns: "160px 1fr" }}>
            <div className="form-field"><label>Date</label><input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} /></div>
            <div className="form-field"><label>Motif</label><input value={motif} maxLength={200} onChange={(ev) => setMotif(ev.target.value)} placeholder="Ex : erreur de montant" /></div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setFormulaire(false)} disabled={envoi}>Annuler</button>
            <button className="btn" onClick={regulariser} disabled={envoi}>{envoi ? "…" : "Créer la régularisation"}</button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          {peutRegulariser && <button className="btn secondary" onClick={() => setFormulaire(true)}>Régulariser cette écriture</button>}
          <button className="btn" onClick={onFermer}>Fermer</button>
        </div>
      )}
    </Modal>
  );
}
