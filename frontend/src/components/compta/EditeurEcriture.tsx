import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Compte, comptaApi, DOSSIERS_MANUELS_CLES, DossierCle, Ecriture, fmtMontant, isoLocal } from "../../comptaApi";
import { Modal } from "../Modal";

interface LigneForm {
  compte_id: string;
  compte_auxiliaire: string;
  debit: string;
  credit: string;
  devise: string;
  montant_devise: string;
  taux_change: string;
}

const LIGNE_VIDE: LigneForm = { compte_id: "", compte_auxiliaire: "", debit: "", credit: "", devise: "TND", montant_devise: "", taux_change: "" };

export const JOURNAL_PAR_DOSSIER: Record<DossierCle, string> = { client: "OD", fournisseur: "OD", banque1: "BQ", banque2: "BQ2", caisse: "CA" };

const NATURES: Record<"client" | "fournisseur", string[]> = {
  client: ["Régularisation client", "Correction", "Avoir", "Différence de paiement", "Opération exceptionnelle"],
  fournisseur: ["Régularisation fournisseur", "Correction", "Avoir", "Différence de paiement", "Frais", "Opération exceptionnelle"],
};

/** Accepte « 1 234,500 » ou « 1234.5 » ; renvoie 0 si vide ou invalide. */
export function nombre(s: string): number {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface Props {
  ecriture: Ecriture | null;
  comptes: Compte[];
  journaux: Record<string, string>;
  dossiers: Record<string, string>;
  /** Dossier imposé (saisie depuis un dossier de la comptabilité manuelle). */
  dossierFixe?: DossierCle;
  onFermer: () => void;
  onEnregistre: (e: Ecriture) => void;
}

/** Saisie (ou modification) d'une écriture MANUELLE multi-lignes, toujours rattachée à un dossier. */
export function EditeurEcriture({ ecriture, comptes, journaux, dossiers, dossierFixe, onFermer, onEnregistre }: Props) {
  const [dossier, setDossier] = useState<DossierCle>((ecriture?.dossier ?? dossierFixe ?? "client") as DossierCle);
  const [date, setDate] = useState(ecriture?.date ?? isoLocal(new Date()));
  const [journal, setJournal] = useState(ecriture?.journal ?? JOURNAL_PAR_DOSSIER[dossier]);
  const [piece, setPiece] = useState(ecriture?.numero_piece ?? "");
  const [libelle, setLibelle] = useState(ecriture?.libelle ?? "");
  const [reference, setReference] = useState(ecriture?.reference ?? "");
  const [tiers, setTiers] = useState(ecriture?.tiers ?? "");
  const [observation, setObservation] = useState(ecriture?.observation ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [lignes, setLignes] = useState<LigneForm[]>(
    ecriture
      ? ecriture.lignes.map((l) => ({
          compte_id: String(l.compte_id),
          compte_auxiliaire: l.compte_auxiliaire ?? "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
          devise: l.devise ?? "TND",
          montant_devise: l.montant_devise ? String(l.montant_devise) : "",
          taux_change: l.taux_change ? String(l.taux_change) : "",
        }))
      : [{ ...LIGNE_VIDE }, { ...LIGNE_VIDE }]
  );
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const tiersObligatoire = dossier === "client" || dossier === "fournisseur";
  const devisesActives = dossier === "banque2";

  useEffect(() => {
    if (tiersObligatoire) comptaApi.tiers(dossier).then(setSuggestions).catch(() => setSuggestions([]));
    else setSuggestions([]);
  }, [dossier, tiersObligatoire]);

  const options = useMemo(() => {
    const utilises = new Set(ecriture?.lignes.map((l) => l.compte_id));
    return comptes.filter((c) => c.actif || utilises.has(c.id));
  }, [comptes, ecriture]);

  const totalDebit = lignes.reduce((s, l) => s + nombre(l.debit), 0);
  const totalCredit = lignes.reduce((s, l) => s + nombre(l.credit), 0);
  const ecart = Math.round((totalDebit - totalCredit) * 1000) / 1000;
  const equilibree = ecart === 0 && totalDebit > 0;

  function changerDossier(d: DossierCle) {
    setDossier(d);
    if (!ecriture) setJournal(JOURNAL_PAR_DOSSIER[d]);
  }

  function maj(i: number, champ: keyof LigneForm, valeur: string) {
    setLignes((ls) =>
      ls.map((l, k) => {
        if (k !== i) return l;
        const n = { ...l, [champ]: valeur };
        if (champ === "debit" && nombre(valeur) > 0) n.credit = "";
        if (champ === "credit" && nombre(valeur) > 0) n.debit = "";
        // Devise : débit/crédit TND = montant en devise × taux (calculé tant que l'utilisateur n'a pas saisi autre chose).
        if (n.devise !== "TND" && (champ === "montant_devise" || champ === "taux_change" || champ === "devise")) {
          const tnd = Math.round(nombre(n.montant_devise) * nombre(n.taux_change) * 1000) / 1000;
          if (tnd > 0) {
            const cote = nombre(n.credit) > 0 ? "credit" : "debit";
            n[cote] = String(tnd);
          }
        }
        if (champ === "devise" && valeur === "TND") { n.montant_devise = ""; n.taux_change = ""; }
        return n;
      })
    );
  }

  async function enregistrer() {
    setErreur("");
    if (!libelle.trim()) return setErreur("Le libellé est obligatoire.");
    if (tiersObligatoire && !tiers.trim()) return setErreur(`Indiquez le ${dossier === "client" ? "client" : "fournisseur"} concerné.`);
    if (lignes.some((l) => !l.compte_id)) return setErreur("Chaque ligne doit avoir un compte.");
    if (lignes.some((l) => nombre(l.debit) === 0 && nombre(l.credit) === 0)) return setErreur("Chaque ligne doit avoir un montant au débit ou au crédit.");
    if (lignes.some((l) => l.devise !== "TND" && (nombre(l.montant_devise) === 0 || nombre(l.taux_change) === 0)))
      return setErreur("Pour une ligne en devise, indiquez le montant en devise et le taux de change.");
    if (!equilibree) return setErreur(`L'écriture n'est pas équilibrée (écart de ${fmtMontant(Math.abs(ecart))} TND) : total débit = total crédit est obligatoire.`);

    const payload = {
      date, journal, dossier,
      libelle: libelle.trim(),
      reference: reference.trim() || null,
      numero_piece: piece.trim() || null,
      tiers: tiers.trim() || null,
      observation: observation.trim() || null,
      lignes: lignes.map((l) => ({
        compte_id: Number(l.compte_id),
        compte_auxiliaire: l.compte_auxiliaire.trim() || (tiersObligatoire ? tiers.trim() : "") || null,
        debit: nombre(l.debit),
        credit: nombre(l.credit),
        devise: l.devise,
        montant_devise: l.devise !== "TND" ? nombre(l.montant_devise) : null,
        taux_change: l.devise !== "TND" ? nombre(l.taux_change) : null,
      })),
    };
    setEnvoi(true);
    try {
      const res = ecriture
        ? await api.put<Ecriture>(`/comptabilite/ecritures/${ecriture.id}`, payload)
        : await api.post<Ecriture>("/comptabilite/ecritures", payload);
      onEnregistre(res);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal title={ecriture ? `Modifier l'écriture ${ecriture.numero_piece}` : "Nouvelle écriture manuelle"} onClose={onFermer}>
      <div className="modal-large-hack" style={{ minWidth: 0 }}>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div className="form-field">
            <label>Dossier</label>
            <select value={dossier} onChange={(e) => changerDossier(e.target.value as DossierCle)} disabled={!!dossierFixe}>
              {DOSSIERS_MANUELS_CLES.map((k) => <option key={k} value={k}>{dossiers[k] ?? k}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Journal</label>
            <select value={journal} onChange={(e) => setJournal(e.target.value)}>
              {Object.entries(journaux).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>N° de pièce</label>
            <input value={piece} placeholder="Automatique" onChange={(e) => setPiece(e.target.value)} maxLength={40} />
          </div>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: tiersObligatoire ? "1fr 1fr" : "1fr", marginTop: "0.6rem" }}>
          {tiersObligatoire && (
            <div className="form-field">
              <label>{dossier === "client" ? "Client" : "Fournisseur"} *</label>
              <input list="liste-tiers" value={tiers} onChange={(e) => setTiers(e.target.value)} maxLength={150}
                placeholder={dossier === "client" ? "Nom du client" : "Hôtel, transporteur, compagnie, guide…"} />
              <datalist id="liste-tiers">{suggestions.map((n) => <option key={n} value={n} />)}</datalist>
            </div>
          )}
          <div className="form-field">
            <label>Référence</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="Ex : FAC-2026-0012" />
          </div>
        </div>
        <div className="form-field" style={{ margin: "0.6rem 0" }}>
          <label>Libellé *</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(dossier === "client" || dossier === "fournisseur") && (
              <select style={{ maxWidth: 210 }} value="" onChange={(e) => e.target.value && setLibelle(libelle.trim() ? libelle : `${e.target.value} — `)} aria-label="Nature de l'opération">
                <option value="">Nature…</option>
                {NATURES[dossier].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <input style={{ flex: 1 }} value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={255} placeholder="Ex : Avoir sur facture FAC-2026-0012" />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="compta-lignes">
            <thead>
              <tr>
                <th style={{ minWidth: 210 }}>Compte</th>
                {devisesActives && <th style={{ width: 84 }}>Devise</th>}
                {devisesActives && <th style={{ width: 104 }}>Montant devise</th>}
                {devisesActives && <th style={{ width: 84 }}>Taux</th>}
                <th style={{ width: 120 }}>Débit TND</th>
                <th style={{ width: 120 }}>Crédit TND</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select value={l.compte_id} onChange={(e) => maj(i, "compte_id", e.target.value)}>
                      <option value="">— Choisir un compte —</option>
                      {options.map((c) => <option key={c.id} value={c.id}>{c.numero} — {c.libelle}{c.actif ? "" : " (désactivé)"}</option>)}
                    </select>
                  </td>
                  {devisesActives && (
                    <td>
                      <select value={l.devise} onChange={(e) => maj(i, "devise", e.target.value)}>
                        {["TND", "EUR", "USD", "GBP"].map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                  )}
                  {devisesActives && <td><input className="montant" inputMode="decimal" value={l.montant_devise} disabled={l.devise === "TND"} onChange={(e) => maj(i, "montant_devise", e.target.value)} /></td>}
                  {devisesActives && <td><input className="montant" inputMode="decimal" value={l.taux_change} disabled={l.devise === "TND"} onChange={(e) => maj(i, "taux_change", e.target.value)} placeholder="3,400" /></td>}
                  <td><input className="montant" inputMode="decimal" value={l.debit} onChange={(e) => maj(i, "debit", e.target.value)} placeholder="0,000" /></td>
                  <td><input className="montant" inputMode="decimal" value={l.credit} onChange={(e) => maj(i, "credit", e.target.value)} placeholder="0,000" /></td>
                  <td><button className="btn-icon" aria-label="Supprimer la ligne" disabled={lignes.length <= 2} onClick={() => setLignes((ls) => ls.filter((_, k) => k !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn-link" type="button" onClick={() => setLignes((ls) => [...ls, { ...LIGNE_VIDE }])}>+ Ajouter une ligne</button>

        <div className="form-field" style={{ margin: "0.7rem 0" }}>
          <label>Observation</label>
          <input value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={500} placeholder="Explication libre (facultatif)" />
        </div>

        <div className="compta-equilibre">
          <span>Total débit : <strong>{fmtMontant(totalDebit)}</strong></span>
          <span>Total crédit : <strong>{fmtMontant(totalCredit)}</strong></span>
          {equilibree ? <span className="etat ok">✓ Écriture équilibrée</span> : <span className="etat ko">✕ Écart : {fmtMontant(Math.abs(ecart))}</span>}
        </div>

        {erreur && <p className="error-msg">{erreur}</p>}
        <div className="form-actions">
          <button className="btn secondary" onClick={onFermer} disabled={envoi}>Annuler</button>
          <button className="btn" onClick={enregistrer} disabled={envoi || !equilibree}>{envoi ? "Enregistrement…" : "Valider l'écriture"}</button>
        </div>
      </div>
    </Modal>
  );
}
