import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { DetailEcriture } from "../../components/compta/DetailEcriture";
import { TableEcritures } from "../../components/compta/TableEcritures";
import { useToast } from "../../components/compta/Toast";
import { comptaApi, DiagnosticCompta, DossierAuto, Ecriture, exportJournalUrl, fmtDate, fmtTND, PageEcritures } from "../../comptaApi";
import "./compta.css";

// ------------------------------------------------------------ vue d'ensemble
function VueDossiers() {
  const { toast, toastHost } = useToast();
  const [dossiers, setDossiers] = useState<DossierAuto[] | null>(null);
  const [diag, setDiag] = useState<DiagnosticCompta | null>(null);
  const [erreur, setErreur] = useState("");
  const [rattrapage, setRattrapage] = useState(false);

  const charger = useCallback(() => {
    comptaApi.dossiersAuto().then((r) => { setDossiers(r.dossiers); setDiag(r.diagnostic); }).catch((e) => setErreur((e as Error).message));
  }, []);
  useEffect(charger, [charger]);

  async function generer() {
    setRattrapage(true);
    try {
      await comptaApi.rattrapage();
      toast("Écritures manquantes générées.");
      charger();
    } catch (e) {
      toast((e as Error).message, "erreur");
    } finally {
      setRattrapage(false);
    }
  }

  const total = dossiers?.reduce((s, d) => s + d.nb_ecritures, 0) ?? 0;
  return (
    <div>
      <div className="page-header"><h2>🤖 Comptabilité automatique</h2></div>
      <p className="compta-sous-titre">
        Ces écritures sont créées toutes seules par l'application : il ne faut jamais les ressaisir. {total > 0 && `${total} écriture(s) au total.`}
      </p>
      {erreur && <p className="error-msg">{erreur}</p>}
      {diag && diag.total > 0 && (
        <div className="compta-bandeau">
          <span>{diag.total} opération(s) existante(s) n'ont pas encore d'écriture comptable.</span>
          <button className="btn" onClick={generer} disabled={rattrapage}>{rattrapage ? "Génération…" : "Générer les écritures manquantes"}</button>
        </div>
      )}
      <div className="dossier-grille">
        {dossiers?.map((d) => (
          <Link key={d.cle} to={`/comptabilite/automatique/${d.cle}`} className={`dossier-carte auto${d.source ? "" : " inactif"}`}>
            <div className="dossier-icone">{d.icone}</div>
            <div className="dossier-titre">{d.label}</div>
            <div className="dossier-desc">{d.description}</div>
            <div className="dossier-chiffres">
              <span><b>{d.nb_ecritures}</b> écriture(s)</span>
              {d.nb_ecritures > 0 && <span>{fmtTND(d.total)}</span>}
            </div>
            {d.derniere_date && <div className="dossier-pied">Dernière : {fmtDate(d.derniere_date)}</div>}
            {!d.source && <div className="dossier-pied">Dossier prêt, en attente de module source</div>}
          </Link>
        ))}
      </div>
      <div className="schema-flux">
        <span>Facture / Paiement / Dépense</span><i>→</i><span>Écriture automatique</span><i>→</i><span>Dossier automatique</span><i>→</i><span>📒 Journal comptable</span>
      </div>
      {toastHost}
    </div>
  );
}

// ------------------------------------------------------------ contenu d'un dossier
function VueDossier({ cle }: { cle: string }) {
  const { toast, toastHost } = useToast();
  const [infos, setInfos] = useState<DossierAuto | null>(null);
  const [recherche, setRecherche] = useState("");
  const [rechercheDiff, setRechercheDiff] = useState("");
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState<PageEcritures | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [detail, setDetail] = useState<Ecriture | null>(null);

  useEffect(() => {
    comptaApi.dossiersAuto().then((r) => setInfos(r.dossiers.find((d) => d.cle === cle) ?? null)).catch(() => undefined);
  }, [cle]);

  const minuteur = useRef<number>();
  useEffect(() => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => { setRechercheDiff(recherche); setPage(1); }, 300);
    return () => window.clearTimeout(minuteur.current);
  }, [recherche]);

  const filtres = useMemo(() => {
    const f: Record<string, string> = { origine: "automatique", categorie: cle };
    if (rechercheDiff.trim()) f.q = rechercheDiff.trim();
    if (dateDu) f.date_du = dateDu;
    if (dateAu) f.date_au = dateAu;
    return f;
  }, [cle, rechercheDiff, dateDu, dateAu]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      setDonnees(await comptaApi.ecritures({ ...filtres, page: String(page), taille: "25" }));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [filtres, page]);
  useEffect(() => { charger(); }, [charger]);

  const totalPages = donnees ? Math.max(1, Math.ceil(donnees.total / donnees.taille)) : 1;
  return (
    <div>
      <p className="fil-ariane"><Link to="/comptabilite/automatique">🤖 Comptabilité automatique</Link> › {infos?.label ?? cle}</p>
      <div className="page-header"><h2>{infos?.icone} {infos?.label ?? cle}</h2></div>
      {infos && <p className="compta-sous-titre">{infos.description}</p>}
      <div className="compta-bandeau lecture-seule">
        <span>🔒 Dossier en lecture seule : une écriture automatique ne se modifie pas. Pour corriger, ouvrez l'écriture puis « Régulariser ».</span>
      </div>
      <div className="toolbar no-print">
        <input type="search" placeholder="Rechercher (libellé, pièce, client, référence…)" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ minWidth: 260 }} />
        <input type="date" value={dateDu} onChange={(e) => { setDateDu(e.target.value); setPage(1); }} title="Du" aria-label="Du" />
        <input type="date" value={dateAu} onChange={(e) => { setDateAu(e.target.value); setPage(1); }} title="Au" aria-label="Au" />
        <a className="btn secondary" href={exportJournalUrl("xlsx", filtres)}>Export Excel</a>
        <a className="btn secondary" href={exportJournalUrl("pdf", filtres)} target="_blank" rel="noreferrer">Export PDF</a>
      </div>
      {erreur && <p className="error-msg">{erreur}</p>}
      <TableEcritures
        items={donnees?.items ?? []} types={donnees?.types ?? {}} chargement={chargement} libelleTiers="Tiers"
        vide={infos && !infos.source ? infos.description : "Aucune écriture dans ce dossier."}
        onDetail={setDetail}
        actions={(e) => <button className="btn-link" onClick={() => setDetail(e)}>Détail</button>}
        pied={donnees ? { total: donnees.total, debit: donnees.total_debit, credit: donnees.total_credit } : undefined}
      />
      {donnees && (
        <div className="compta-pagination no-print">
          <span>{donnees.total} écriture(s) — page {donnees.page} / {totalPages}</span>
          <div className="boutons">
            <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
            <button className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
          </div>
        </div>
      )}
      {detail && donnees && (
        <DetailEcriture
          ecriture={detail} types={donnees.types} onFermer={() => setDetail(null)}
          onRegularisee={(n) => { toast(`Régularisation ${n.numero_piece} créée (comptabilité manuelle › ${n.dossier_label}).`); setDetail(null); charger(); }}
        />
      )}
      {toastHost}
    </div>
  );
}

export default function ComptaAutomatique() {
  const { utilisateur } = useAuth();
  const { dossier } = useParams();
  if (utilisateur?.role !== "administrateur") return <p>Cette section est réservée aux administrateurs.</p>;
  return dossier ? <VueDossier cle={dossier} /> : <VueDossiers />;
}
