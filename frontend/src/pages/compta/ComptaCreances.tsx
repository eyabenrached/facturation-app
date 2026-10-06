import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
import { ConfirmModal } from "../../components/compta/ConfirmModal";
import { useToast } from "../../components/compta/Toast";
import { useAuth } from "../../auth/AuthContext";
import {
  comptaApi, CreancesData, DetailClient, FactureClient, fmtDate, fmtMontant, fmtTND, isoLocal, LABELS_STATUT_CREANCE,
  LABELS_STATUT_FACTURE, PaiementClient, relanceClientUrl, releveClientUrl,
} from "../../comptaApi";
import "./compta.css";

const CLASSE_STATUT: Record<string, string> = {
  solde: "payee", en_cours: "partielle", en_retard: "impayee",
  payee: "payee", partielle: "partielle", en_attente: "en_attente",
};

// ---------------------------------------------------------- saisie d'un règlement
function ModaleReglement({
  facture, modes, onFermer, onEnregistre,
}: { facture: FactureClient; modes: Record<string, string>; onFermer: () => void; onEnregistre: () => void }) {
  const [montant, setMontant] = useState(String(facture.reste));
  const [date, setDate] = useState(isoLocal(new Date()));
  const [mode, setMode] = useState("virement");
  const [reference, setReference] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const valeur = parseFloat(montant.replace(",", "."));

  async function valider() {
    setErreur("");
    if (!Number.isFinite(valeur) || valeur <= 0) return setErreur("Saisissez un montant supérieur à 0.");
    if (valeur > facture.reste + 0.0005) return setErreur(`Le montant dépasse le reste à payer (${fmtMontant(facture.reste)} TND).`);
    setEnvoi(true);
    try {
      await api.post("/comptabilite/paiements", {
        type_facture: facture.type, facture_id: facture.id, montant: valeur, date, mode, reference: reference.trim() || null,
      });
      onEnregistre();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal title={`Enregistrer un règlement — ${facture.numero}`} onClose={onFermer}>
      <p style={{ marginTop: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
        Total TTC {fmtTND(facture.ttc)} · déjà réglé {fmtTND(facture.paye)} · <strong>reste {fmtTND(facture.reste)}</strong>
      </p>
      <div className="form-grid">
        <div className="form-field">
          <label>Montant (TND)</label>
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus />
        </div>
        <div className="form-field">
          <label>Date du règlement</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Mode de règlement</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {Object.entries(modes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Référence (n° chèque, virement…)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </div>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0 0 0.4rem" }}>
        {mode === "especes" ? "Encaissement en espèces : écriture au débit de la caisse (530000)." : "Encaissement bancaire : écriture au débit de la banque (512000)."}
      </p>
      {erreur && <p className="error-msg">{erreur}</p>}
      <div className="form-actions">
        <button className="btn secondary" onClick={onFermer} disabled={envoi}>Annuler</button>
        <button className="btn" onClick={valider} disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer le règlement"}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ fiche client
function FicheClient({ nom, onFermer, onChange }: { nom: string; onFermer: () => void; onChange: () => void }) {
  const { toast, toastHost } = useToast();
  const [d, setD] = useState<DetailClient | null>(null);
  const [erreur, setErreur] = useState("");
  const [aRegler, setARegler] = useState<FactureClient | null>(null);
  const [aSupprimer, setASupprimer] = useState<PaiementClient | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");

  const charger = useCallback(async () => {
    try {
      setD(await comptaApi.detailClient(nom));
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [nom]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function supprimerReglement() {
    if (!aSupprimer) return;
    setEnCours(true);
    try {
      await api.delete(`/comptabilite/paiements/${aSupprimer.id}`);
      toast("Règlement supprimé.");
      await charger();
      onChange();
    } catch (e) {
      toast((e as Error).message, "erreur");
    } finally {
      setEnCours(false);
      setASupprimer(null);
    }
  }

  function relancerParMail() {
    if (!d) return;
    const impayees = d.factures.filter((f) => f.reste > 0);
    const lignes = impayees.map((f) => `- ${f.numero} : reste ${fmtMontant(f.reste)} TND (échéance ${fmtDate(f.echeance)})`).join("\n");
    const corps =
      `Madame, Monsieur,\n\nSauf erreur de notre part, les factures suivantes restent à régler :\n\n${lignes}\n\n` +
      `Total dû : ${fmtMontant(d.reste)} TND.\n\nMerci de procéder au règlement dans les meilleurs délais, ou de nous contacter si celui-ci a déjà été effectué.\n\nCordialement,\nEURAFR TOURS`;
    window.location.href = `mailto:${d.email ?? ""}?subject=${encodeURIComponent("Relance — factures en attente de règlement")}&body=${encodeURIComponent(corps)}`;
  }

  return (
    <Modal title={`Compte client — ${nom}`} onClose={onFermer}>
      <div style={{ width: "min(860px, 86vw)" }}>
        {erreur && <p className="error-msg">{erreur}</p>}
        {!d && !erreur && <div className="compta-chargement">Chargement…</div>}
        {d && (
          <>
            <div className="compta-kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div className="compta-kpi"><div className="label">Total facturé</div><div className="value">{fmtMontant(d.total_facture)}<small>TND</small></div></div>
              <div className="compta-kpi vert"><div className="label">Total payé</div><div className="value">{fmtMontant(d.total_paye)}<small>TND</small></div></div>
              <div className={`compta-kpi ${d.reste > 0 ? "rouge" : "vert"}`}><div className="label">Reste à payer</div><div className="value">{fmtMontant(d.reste)}<small>TND</small></div></div>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              {d.email ? `E-mail : ${d.email}` : "E-mail non renseigné (client de location)"}{d.telephone ? ` · Tél. ${d.telephone}` : ""}
            </p>

            <div className="toolbar" style={{ marginBottom: "0.8rem" }}>
              <input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Relevé du" title="Relevé du" />
              <input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Relevé au" title="Relevé au" />
              <a className="btn secondary" href={releveClientUrl(nom, du, au)} target="_blank" rel="noreferrer">Relevé de compte (PDF)</a>
              {d.reste > 0 && (
                <>
                  <a className="btn secondary" href={relanceClientUrl(nom)} target="_blank" rel="noreferrer">Lettre de relance (PDF)</a>
                  <button className="btn" onClick={relancerParMail}>Relancer par e-mail</button>
                </>
              )}
            </div>

            <h4 style={{ margin: "0.6rem 0 0.4rem" }}>Factures</h4>
            <div className="data-table-wrap">
              <table className="data-table compta-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr><th>Facture</th><th>Date</th><th>Échéance</th><th className="num">Total TTC</th><th className="num">Payé</th><th className="num">Reste</th><th>Statut</th><th /></tr>
                </thead>
                <tbody>
                  {d.factures.map((f) => (
                    <tr key={`${f.type}-${f.id}`}>
                      <td><strong>{f.numero}</strong>{f.type === "location" && <span className="badge manuelle" style={{ marginLeft: 6 }}>Location</span>}</td>
                      <td>{fmtDate(f.date)}</td>
                      <td>{fmtDate(f.echeance)}{f.jours_retard > 0 && <div style={{ color: "var(--coral)", fontSize: "0.72rem" }}>{f.jours_retard} j de retard</div>}</td>
                      <td className="num">{fmtMontant(f.ttc)}</td>
                      <td className="num">{fmtMontant(f.paye)}</td>
                      <td className="num"><strong>{fmtMontant(f.reste)}</strong></td>
                      <td><span className={`badge ${CLASSE_STATUT[f.statut]}`}>{LABELS_STATUT_FACTURE[f.statut]}</span></td>
                      <td className="actions">{f.reste > 0 && <button className="btn-link" onClick={() => setARegler(f)}>Encaisser</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ margin: "1rem 0 0.4rem" }}>Historique des règlements</h4>
            <div className="data-table-wrap">
              <table className="data-table compta-table" style={{ minWidth: 600 }}>
                <thead><tr><th>Date</th><th>Facture</th><th>Mode</th><th>Référence</th><th className="num">Montant</th><th /></tr></thead>
                <tbody>
                  {d.paiements.length === 0 && <tr><td colSpan={6} className="empty-cell">Aucun règlement enregistré.</td></tr>}
                  {d.paiements.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.date)}</td>
                      <td>{p.facture_numero}</td>
                      <td>{p.mode_label}</td>
                      <td className="muted">{p.reference || p.note || ""}</td>
                      <td className="num">{fmtMontant(p.montant)}</td>
                      <td className="actions"><button className="btn-link" style={{ color: "var(--coral)" }} onClick={() => setASupprimer(p)}>Supprimer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "0.76rem", color: "var(--muted)" }}>Échéance = date de la facture + {d.delai_jours} jours.</p>
          </>
        )}
      </div>

      {aRegler && d && (
        <ModaleReglement
          facture={aRegler}
          modes={d.modes}
          onFermer={() => setARegler(null)}
          onEnregistre={async () => {
            toast("Règlement enregistré et comptabilisé.");
            setARegler(null);
            await charger();
            onChange();
          }}
        />
      )}
      {aSupprimer && (
        <ConfirmModal
          titre="Supprimer le règlement"
          message={`Supprimer le règlement de ${fmtTND(aSupprimer.montant)} du ${fmtDate(aSupprimer.date)} (facture ${aSupprimer.facture_numero}) ? L'écriture comptable associée sera supprimée et la facture redeviendra impayée ou partielle.`}
          enCours={enCours}
          onConfirmer={supprimerReglement}
          onAnnuler={() => setASupprimer(null)}
        />
      )}
      {toastHost}
    </Modal>
  );
}

// ----------------------------------------------------------------------- page
export default function ComptaCreances() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CreancesData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [clientOuvert, setClientOuvert] = useState<string | null>(null);
  const TAILLE = 20;

  const charger = useCallback(async () => {
    if (!estAdmin) return;
    setChargement(true);
    setErreur("");
    try {
      const p: Record<string, string> = {};
      if (recherche.trim()) p.q = recherche.trim();
      if (statut) p.statut = statut;
      setData(await comptaApi.creances(p));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [estAdmin, recherche, statut]);

  useEffect(() => {
    const t = window.setTimeout(charger, 250);
    return () => window.clearTimeout(t);
  }, [charger]);

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header"><h2>Clients / Créances</h2></div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / TAILLE));
  const pageCourante = Math.min(page, totalPages);
  const visibles = items.slice((pageCourante - 1) * TAILLE, pageCourante * TAILLE);

  return (
    <div>
      <div className="page-header"><h2>Clients / Créances</h2></div>

      {data && (
        <div className="compta-kpis" style={{ marginBottom: "1rem" }}>
          <div className="compta-kpi"><div className="label">Total facturé</div><div className="value">{fmtMontant(data.total_facture)}<small>TND</small></div></div>
          <div className="compta-kpi vert"><div className="label">Total encaissé</div><div className="value">{fmtMontant(data.total_paye)}<small>TND</small></div></div>
          <div className="compta-kpi or"><div className="label">Reste à encaisser</div><div className="value">{fmtMontant(data.total_reste)}<small>TND</small></div></div>
          <div className="compta-kpi rouge">
            <div className="label">Dont en retard</div>
            <div className="value">{fmtMontant(data.total_en_retard)}<small>TND</small></div>
            <div className="hint">{data.nb_clients_en_retard} client(s)</div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Rechercher un client…" value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} style={{ minWidth: 260 }} />
        <select value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }} aria-label="Statut">
          <option value="">Tous les statuts</option>
          <option value="en_retard">En retard</option>
          <option value="en_cours">En cours</option>
          <option value="solde">Soldés</option>
        </select>
      </div>

      {erreur && <p className="error-msg">{erreur}</p>}

      <div className="data-table-wrap" style={{ opacity: chargement ? 0.55 : 1, transition: "opacity .15s" }}>
        <table className="data-table compta-table" style={{ minWidth: 780 }}>
          <thead>
            <tr><th>Client</th><th className="num">Total facturé</th><th className="num">Total payé</th><th className="num">Reste à payer</th><th>Échéance</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={6} className="empty-cell">{chargement ? "Chargement…" : "Aucun client."}</td></tr>}
            {visibles.map((c) => (
              <tr key={c.client} style={{ cursor: "pointer" }} onClick={() => setClientOuvert(c.client)}>
                <td>
                  <button className="btn-link" style={{ fontWeight: 600 }}>{c.client}</button>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{c.nb_factures} facture(s){c.nb_impayees > 0 ? ` · ${c.nb_impayees} impayée(s)` : ""}</div>
                </td>
                <td className="num">{fmtMontant(c.total_facture)}</td>
                <td className="num">{fmtMontant(c.total_paye)}</td>
                <td className="num"><strong>{fmtMontant(c.reste)}</strong></td>
                <td>
                  {c.echeance ? fmtDate(c.echeance) : "—"}
                  {c.jours_retard > 0 && <div style={{ color: "var(--coral)", fontSize: "0.72rem" }}>{c.jours_retard} j de retard</div>}
                </td>
                <td><span className={`badge ${CLASSE_STATUT[c.statut]}`}>{LABELS_STATUT_CREANCE[c.statut]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="compta-pagination">
        <span>{items.length} client(s) — page {pageCourante} / {totalPages}</span>
        <div className="boutons">
          <button className="btn secondary" disabled={pageCourante <= 1} onClick={() => setPage(pageCourante - 1)}>Précédent</button>
          <button className="btn secondary" disabled={pageCourante >= totalPages} onClick={() => setPage(pageCourante + 1)}>Suivant</button>
        </div>
      </div>

      {clientOuvert && <FicheClient nom={clientOuvert} onFermer={() => setClientOuvert(null)} onChange={charger} />}
    </div>
  );
}
