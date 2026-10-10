import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { ConfirmModal } from "../../components/compta/ConfirmModal";
import { DetailEcriture } from "../../components/compta/DetailEcriture";
import { EditeurEcriture } from "../../components/compta/EditeurEcriture";
import { TableEcritures } from "../../components/compta/TableEcritures";
import { useToast } from "../../components/compta/Toast";
import { useAuth } from "../../auth/AuthContext";
import { Compte, comptaApi, DOSSIERS_MANUELS_CLES, Ecriture, exportJournalUrl, fmtDate, PageEcritures } from "../../comptaApi";
import "./compta.css";

const ORIGINES: { cle: string; label: string }[] = [
  { cle: "", label: "Toutes" },
  { cle: "automatique", label: "🤖 Automatique" },
  { cle: "manuelle", label: "✍️ Manuelle" },
];

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
  const [origine, setOrigine] = useState("");
  const [dossier, setDossier] = useState("");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(25);

  const [donnees, setDonnees] = useState<PageEcritures | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [edition, setEdition] = useState<Ecriture | "nouvelle" | null>(null);
  const [detail, setDetail] = useState<Ecriture | null>(null);
  const [aSupprimer, setASupprimer] = useState<Ecriture | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const minuteur = useRef<number>();
  useEffect(() => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => { setRechercheDiff(recherche); setPage(1); }, 300);
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
    if (origine) f.origine = origine;
    if (dossier) f.dossier = dossier;
    return f;
  }, [rechercheDiff, dateDu, dateAu, compteId, type, journal, origine, dossier]);

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
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (estAdmin) comptaApi.comptes().then(setComptes).catch(() => undefined); }, [estAdmin]);

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
  const periodeImpression = dateDu || dateAu ? `Période : ${dateDu ? fmtDate(dateDu) : "…"} → ${dateAu ? fmtDate(dateAu) : "…"}` : "Toutes périodes";
  const dossiers = donnees?.dossiers ?? {};

  return (
    <div>
      <div className="page-header">
        <h2>📒 Journal comptable</h2>
        <button className="btn no-print" onClick={() => setEdition("nouvelle")}>+ Nouvelle écriture manuelle</button>
      </div>
      <p className="compta-sous-titre">Toutes les écritures, automatiques et manuelles, au même endroit. Cliquez sur un n° de pièce pour voir d'où elle vient.</p>
      <p className="print-only" style={{ margin: "0 0 0.8rem" }}>EURAFR TOURS — Journal comptable — {periodeImpression}</p>

      <div className="filtres-pills no-print">
        <div className="pills" role="group" aria-label="Origine">
          <span className="pills-titre">Origine</span>
          {ORIGINES.map((o) => (
            <button key={o.cle} className={`compta-chip${origine === o.cle ? " actif" : ""}`} onClick={() => { setOrigine(o.cle); setPage(1); }}>{o.label}</button>
          ))}
        </div>
        <div className="pills" role="group" aria-label="Dossier">
          <span className="pills-titre">Dossier</span>
          <button className={`compta-chip${dossier === "" ? " actif" : ""}`} onClick={() => { setDossier(""); setPage(1); }}>Tous</button>
          {DOSSIERS_MANUELS_CLES.map((k) => (
            <button key={k} className={`compta-chip${dossier === k ? " actif" : ""}`} onClick={() => { setDossier(k); setPage(1); }}>{dossiers[k] ?? k}</button>
          ))}
        </div>
      </div>

      <div className="toolbar no-print">
        <input type="search" placeholder="Rechercher (libellé, pièce, tiers, compte…)" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ minWidth: 260 }} />
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
        <a className="btn secondary" href={exportJournalUrl("pdf", filtres)} target="_blank" rel="noreferrer">Export PDF</a>
        <a className="btn secondary" href={exportJournalUrl("xlsx", filtres)}>Export Excel</a>
        <button className="btn secondary" onClick={() => window.print()}>Imprimer</button>
      </div>

      {erreur && <p className="error-msg">{erreur}</p>}

      <TableEcritures
        items={donnees?.items ?? []} types={donnees?.types ?? {}} chargement={chargement} libelleTiers="Tiers"
        vide="Aucune écriture pour ces critères."
        onDetail={setDetail}
        actions={(e) =>
          e.modifiable ? (
            <>
              <button className="btn-link" onClick={() => setEdition(e)}>Modifier</button>{" "}
              <button className="btn-link" style={{ color: "var(--coral)" }} onClick={() => setASupprimer(e)}>Supprimer</button>
            </>
          ) : (
            <button className="btn-link" onClick={() => setDetail(e)} title={e.cloturee ? "Période clôturée" : "Écriture automatique : consulter ou régulariser"}>
              {e.cloturee ? "🔒 Verrouillée" : e.automatique ? "🔒 Auto" : "Détail"}
            </button>
          )
        }
        pied={donnees ? { total: donnees.total, debit: donnees.total_debit, credit: donnees.total_credit } : undefined}
      />

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
          ecriture={edition === "nouvelle" ? null : edition} comptes={comptes} journaux={donnees.journaux} dossiers={dossiers}
          onFermer={() => setEdition(null)}
          onEnregistre={(e) => {
            toast(edition === "nouvelle" ? `Écriture ${e.numero_piece} enregistrée dans ${e.dossier_label}.` : `Écriture ${e.numero_piece} modifiée.`);
            setEdition(null);
            charger();
          }}
        />
      )}
      {detail && donnees && (
        <DetailEcriture
          ecriture={detail} types={donnees.types} onFermer={() => setDetail(null)}
          onRegularisee={(n) => { toast(`Régularisation ${n.numero_piece} créée.`); setDetail(null); charger(); }}
        />
      )}
      {aSupprimer && (
        <ConfirmModal
          titre="Supprimer l'écriture"
          message={`Supprimer définitivement l'écriture ${aSupprimer.numero_piece} (« ${aSupprimer.libelle} ») ? Cette action est irréversible.`}
          enCours={suppressionEnCours} onConfirmer={supprimer} onAnnuler={() => setASupprimer(null)}
        />
      )}
      {toastHost}
    </div>
  );
}
