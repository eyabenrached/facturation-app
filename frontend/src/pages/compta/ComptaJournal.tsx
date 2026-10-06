import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
import { ConfirmModal } from "../../components/compta/ConfirmModal";
import { useToast } from "../../components/compta/Toast";
import { useAuth } from "../../auth/AuthContext";
import { Compte, comptaApi, Ecriture, exportJournalUrl, fmtDate, fmtMontant, isoLocal, PageEcritures } from "../../comptaApi";
import "./compta.css";

// ------------------------------------------------------------------ éditeur
interface LigneForm {
  compte_id: string;
  compte_auxiliaire: string;
  debit: string;
  credit: string;
}

const LIGNE_VIDE: LigneForm = { compte_id: "", compte_auxiliaire: "", debit: "", credit: "" };

/** Accepte "1 234,500" ou "1234.5" ; renvoie 0 si vide ou invalide. */
function nombre(s: string): number {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function EditeurEcriture({
  ecriture, comptes, journaux, onFermer, onEnregistre,
}: {
  ecriture: Ecriture | null;
  comptes: Compte[];
  journaux: Record<string, string>;
  onFermer: () => void;
  onEnregistre: (e: Ecriture) => void;
}) {
  const [date, setDate] = useState(ecriture?.date ?? isoLocal(new Date()));
  const [journal, setJournal] = useState(ecriture?.journal ?? "OD");
  const [piece, setPiece] = useState(ecriture?.numero_piece ?? "");
  const [libelle, setLibelle] = useState(ecriture?.libelle ?? "");
  const [reference, setReference] = useState(ecriture?.reference ?? "");
  const [lignes, setLignes] = useState<LigneForm[]>(
    ecriture
      ? ecriture.lignes.map((l) => ({
          compte_id: String(l.compte_id),
          compte_auxiliaire: l.compte_auxiliaire ?? "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
        }))
      : [{ ...LIGNE_VIDE }, { ...LIGNE_VIDE }]
  );
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // Comptes sélectionnables : actifs, plus ceux déjà utilisés par l'écriture éditée.
  const options = useMemo(() => {
    const utilises = new Set(ecriture?.lignes.map((l) => l.compte_id));
    return comptes.filter((c) => c.actif || utilises.has(c.id));
  }, [comptes, ecriture]);

  const totalDebit = lignes.reduce((s, l) => s + nombre(l.debit), 0);
  const totalCredit = lignes.reduce((s, l) => s + nombre(l.credit), 0);
  const ecart = Math.round((totalDebit - totalCredit) * 1000) / 1000;
  const equilibree = ecart === 0 && totalDebit > 0;

  function maj(i: number, champ: keyof LigneForm, valeur: string) {
    setLignes((ls) =>
      ls.map((l, k) => {
        if (k !== i) return l;
        const n = { ...l, [champ]: valeur };
        // Une ligne est soit au débit, soit au crédit : saisir l'un vide l'autre.
        if (champ === "debit" && nombre(valeur) > 0) n.credit = "";
        if (champ === "credit" && nombre(valeur) > 0) n.debit = "";
        return n;
      })
    );
  }

  async function enregistrer() {
    setErreur("");
    if (!libelle.trim()) return setErreur("Le libellé est obligatoire.");
    if (lignes.some((l) => !l.compte_id)) return setErreur("Chaque ligne doit avoir un compte.");
    if (lignes.some((l) => nombre(l.debit) === 0 && nombre(l.credit) === 0)) return setErreur("Chaque ligne doit avoir un montant au débit ou au crédit.");
    if (!equilibree) return setErreur(`L'écriture n'est pas équilibrée (écart de ${fmtMontant(Math.abs(ecart))} TND) : total débit = total crédit est obligatoire.`);

    const payload = {
      date,
      journal,
      libelle: libelle.trim(),
      reference: reference.trim() || null,
      numero_piece: piece.trim() || null,
      lignes: lignes.map((l) => ({
        compte_id: Number(l.compte_id),
        compte_auxiliaire: l.compte_auxiliaire.trim() || null,
        debit: nombre(l.debit),
        credit: nombre(l.credit),
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
    <Modal title={ecriture ? `Modifier l'écriture ${ecriture.numero_piece}` : "Nouvelle écriture"} onClose={onFermer}>
      <div className="modal-large-hack" style={{ minWidth: 0 }}>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Journal</label>
            <select value={journal} onChange={(e) => setJournal(e.target.value)}>
              {Object.entries(journaux).map(([k, v]) => (
                <option key={k} value={k}>{k} — {v}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>N° de pièce</label>
            <input value={piece} placeholder="Automatique" onChange={(e) => setPiece(e.target.value)} maxLength={40} />
          </div>
          <div className="form-field">
            <label>Référence</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </div>
        </div>
        <div className="form-field" style={{ marginBottom: "0.9rem" }}>
          <label>Libellé</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={255} placeholder="Ex : Retrait espèces pour la caisse" />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="compta-lignes">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Compte</th>
                <th style={{ minWidth: 140 }}>Compte auxiliaire</th>
                <th style={{ width: 120 }}>Débit</th>
                <th style={{ width: 120 }}>Crédit</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select value={l.compte_id} onChange={(e) => maj(i, "compte_id", e.target.value)}>
                      <option value="">— Choisir un compte —</option>
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>{c.numero} — {c.libelle}{c.actif ? "" : " (désactivé)"}</option>
                      ))}
                    </select>
                  </td>
                  <td><input value={l.compte_auxiliaire} onChange={(e) => maj(i, "compte_auxiliaire", e.target.value)} placeholder="Client, fournisseur…" /></td>
                  <td><input className="montant" inputMode="decimal" value={l.debit} onChange={(e) => maj(i, "debit", e.target.value)} placeholder="0,000" /></td>
                  <td><input className="montant" inputMode="decimal" value={l.credit} onChange={(e) => maj(i, "credit", e.target.value)} placeholder="0,000" /></td>
                  <td>
                    <button className="btn-icon" aria-label="Supprimer la ligne" disabled={lignes.length <= 2}
                      onClick={() => setLignes((ls) => ls.filter((_, k) => k !== i))}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn-link" type="button" onClick={() => setLignes((ls) => [...ls, { ...LIGNE_VIDE }])}>+ Ajouter une ligne</button>

        <div className="compta-equilibre">
          <span>Total débit : <strong>{fmtMontant(totalDebit)}</strong></span>
          <span>Total crédit : <strong>{fmtMontant(totalCredit)}</strong></span>
          {equilibree ? (
            <span className="etat ok">✓ Écriture équilibrée</span>
          ) : (
            <span className="etat ko">✕ Écart : {fmtMontant(Math.abs(ecart))}</span>
          )}
        </div>

        {erreur && <p className="error-msg">{erreur}</p>}
        <div className="form-actions">
          <button className="btn secondary" onClick={onFermer} disabled={envoi}>Annuler</button>
          <button className="btn" onClick={enregistrer} disabled={envoi || !equilibree}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------- page
export default function ComptaJournal() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const { toast, toastHost } = useToast();

  const [recherche, setRecherche] = useState("");
  const [rechercheDiff, setRechercheDiff] = useState("");
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [compteId, setCompteId] = useState("");
  const [type, setType] = useState("");
  const [journal, setJournal] = useState("");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(25);

  const [donnees, setDonnees] = useState<PageEcritures | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [edition, setEdition] = useState<Ecriture | "nouvelle" | null>(null);
  const [aSupprimer, setASupprimer] = useState<Ecriture | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  // Recherche différée : évite une requête à chaque frappe.
  const minuteur = useRef<number>();
  useEffect(() => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => {
      setRechercheDiff(recherche);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(minuteur.current);
  }, [recherche]);

  const filtres = useMemo(() => {
    const f: Record<string, string> = {};
    if (rechercheDiff.trim()) f.q = rechercheDiff.trim();
    if (dateDu) f.date_du = dateDu;
    if (dateAu) f.date_au = dateAu;
    if (compteId) f.compte_id = compteId;
    if (type) f.type_operation = type;
    if (journal) f.journal = journal;
    return f;
  }, [rechercheDiff, dateDu, dateAu, compteId, type, journal]);

  const charger = useCallback(async () => {
    if (!estAdmin) return;
    setChargement(true);
    setErreur("");
    try {
      setDonnees(await comptaApi.ecritures({ ...filtres, page: String(page), taille: String(taille) }));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [estAdmin, filtres, page, taille]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (estAdmin) comptaApi.comptes().then(setComptes).catch(() => undefined);
  }, [estAdmin]);

  async function supprimer() {
    if (!aSupprimer) return;
    setSuppressionEnCours(true);
    try {
      await api.delete(`/comptabilite/ecritures/${aSupprimer.id}`);
      toast(`Écriture ${aSupprimer.numero_piece} supprimée.`);
      setASupprimer(null);
      charger();
    } catch (e) {
      toast((e as Error).message, "erreur");
      setASupprimer(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header"><h2>Journal comptable</h2></div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  const totalPages = donnees ? Math.max(1, Math.ceil(donnees.total / donnees.taille)) : 1;
  const filtresExport = { ...filtres };
  const periodeImpression = dateDu || dateAu ? `Période : ${dateDu ? fmtDate(dateDu) : "…"} → ${dateAu ? fmtDate(dateAu) : "…"}` : "Toutes périodes";

  return (
    <div>
      <div className="page-header">
        <h2>Journal comptable</h2>
        <button className="btn no-print" onClick={() => setEdition("nouvelle")}>+ Nouvelle écriture</button>
      </div>
      <p className="print-only" style={{ margin: "0 0 0.8rem" }}>EURAFR TOURS — Journal comptable — {periodeImpression}</p>

      <div className="toolbar no-print">
        <input type="search" placeholder="Rechercher (libellé, pièce, tiers, compte…)" value={recherche}
          onChange={(e) => setRecherche(e.target.value)} style={{ minWidth: 260 }} />
        <input type="date" value={dateDu} onChange={(e) => { setDateDu(e.target.value); setPage(1); }} aria-label="Du" title="Du" />
        <input type="date" value={dateAu} onChange={(e) => { setDateAu(e.target.value); setPage(1); }} aria-label="Au" title="Au" />
        <select value={compteId} onChange={(e) => { setCompteId(e.target.value); setPage(1); }} aria-label="Compte">
          <option value="">Tous les comptes</option>
          {comptes.map((c) => <option key={c.id} value={c.id}>{c.numero} — {c.libelle}</option>)}
        </select>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type d'opération">
          <option value="">Tous les types</option>
          {donnees && Object.entries(donnees.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={journal} onChange={(e) => { setJournal(e.target.value); setPage(1); }} aria-label="Journal">
          <option value="">Tous les journaux</option>
          {donnees && Object.entries(donnees.journaux).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
        </select>
        <a className="btn secondary" href={exportJournalUrl("pdf", filtresExport)} target="_blank" rel="noreferrer">Export PDF</a>
        <a className="btn secondary" href={exportJournalUrl("xlsx", filtresExport)}>Export Excel</a>
        <button className="btn secondary" onClick={() => window.print()}>Imprimer</button>
      </div>

      {erreur && <p className="error-msg">{erreur}</p>}

      <div className="data-table-wrap" style={{ opacity: chargement ? 0.55 : 1, transition: "opacity .15s" }}>
        <table className="data-table compta-table">
          <thead>
            <tr>
              <th>Date</th><th>N° pièce</th><th>Libellé</th><th>Compte</th><th>Compte auxiliaire</th>
              <th className="num">Débit</th><th className="num">Crédit</th><th>Référence</th><th>Type</th>
              <th className="no-print" />
            </tr>
          </thead>
          {donnees && donnees.items.length === 0 && (
            <tbody><tr><td colSpan={10} className="empty-cell">{chargement ? "Chargement…" : "Aucune écriture pour ces critères."}</td></tr></tbody>
          )}
          {donnees?.items.map((e) => (
            <tbody key={e.id} className="ecriture">
              {e.lignes.map((l, i) => (
                <tr key={l.id}>
                  {i === 0 ? (
                    <Fragment>
                      <td rowSpan={e.lignes.length}>{fmtDate(e.date)}</td>
                      <td rowSpan={e.lignes.length}><strong>{e.numero_piece}</strong></td>
                      <td rowSpan={e.lignes.length}>
                        {e.libelle}
                        <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <span className={`badge ${e.automatique ? "auto" : "manuelle"}`}>{e.automatique ? "Automatique" : "Manuelle"}</span>
                          {e.cloturee && <span className="badge cloture">Clôturée</span>}
                        </div>
                      </td>
                    </Fragment>
                  ) : null}
                  <td><span className="compte-num">{l.compte_numero}</span>{l.compte_libelle}</td>
                  <td className="muted">{l.compte_auxiliaire || ""}</td>
                  <td className="num">{l.debit ? fmtMontant(l.debit) : ""}</td>
                  <td className="num">{l.credit ? fmtMontant(l.credit) : ""}</td>
                  {i === 0 ? (
                    <Fragment>
                      <td rowSpan={e.lignes.length} className="muted">{e.reference || ""}</td>
                      <td rowSpan={e.lignes.length}>{donnees.types[e.type_operation] ?? e.type_operation}</td>
                      <td rowSpan={e.lignes.length} className="actions no-print">
                        {e.modifiable ? (
                          <>
                            <button className="btn-link" onClick={() => setEdition(e)}>Modifier</button>{" "}
                            <button className="btn-link" style={{ color: "var(--coral)" }} onClick={() => setASupprimer(e)}>Supprimer</button>
                          </>
                        ) : (
                          <span className="muted" title={e.cloturee ? "Période clôturée" : "Générée par une facture, un paiement ou une dépense : modifiez l'opération d'origine"}>
                            {e.cloturee ? "Verrouillée" : "Auto"}
                          </span>
                        )}
                      </td>
                    </Fragment>
                  ) : null}
                </tr>
              ))}
            </tbody>
          ))}
          {donnees && donnees.items.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5}>Total des écritures filtrées ({donnees.total})</td>
                <td className="num">{fmtMontant(donnees.total_debit)}</td>
                <td className="num">{fmtMontant(donnees.total_credit)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {donnees && (
        <div className="compta-pagination no-print">
          <span>{donnees.total} écriture(s) — page {donnees.page} / {totalPages}</span>
          <div className="boutons">
            <select value={taille} onChange={(e) => { setTaille(Number(e.target.value)); setPage(1); }} aria-label="Écritures par page">
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
            <button className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
          </div>
        </div>
      )}

      {edition && donnees && (
        <EditeurEcriture
          ecriture={edition === "nouvelle" ? null : edition}
          comptes={comptes}
          journaux={donnees.journaux}
          onFermer={() => setEdition(null)}
          onEnregistre={(e) => {
            toast(edition === "nouvelle" ? `Écriture ${e.numero_piece} enregistrée.` : `Écriture ${e.numero_piece} modifiée.`);
            setEdition(null);
            charger();
          }}
        />
      )}

      {aSupprimer && (
        <ConfirmModal
          titre="Supprimer l'écriture"
          message={`Supprimer définitivement l'écriture ${aSupprimer.numero_piece} (« ${aSupprimer.libelle} ») ? Cette action est irréversible.`}
          enCours={suppressionEnCours}
          onConfirmer={supprimer}
          onAnnuler={() => setASupprimer(null)}
        />
      )}
      {toastHost}
    </div>
  );
}
