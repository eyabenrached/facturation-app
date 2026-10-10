import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ConfirmModal } from "../../components/compta/ConfirmModal";
import { DetailEcriture } from "../../components/compta/DetailEcriture";
import { EditeurEcriture, nombre } from "../../components/compta/EditeurEcriture";
import { TableEcritures } from "../../components/compta/TableEcritures";
import { useToast } from "../../components/compta/Toast";
import { Modal } from "../../components/Modal";
import {
  Compte, comptaApi, DOSSIERS_MANUELS_CLES, DossierCle, DossierManuel, Ecriture, exportJournalUrl, fmtMontant,
  ICONES_DEVISE, isoLocal, PageEcritures, ResumeTresorerie, SoldeDevise,
} from "../../comptaApi";
import "./compta.css";

type DossierTreso = "banque1" | "banque2" | "caisse";
const DEVISES_B2 = ["EUR", "USD", "GBP"];

/** Types d'opérations proposés à la saisie : ils règlent le sens et le compte de contrepartie. */
const PRESETS: Record<DossierTreso, { label: string; sens: "entree" | "sortie"; compte?: string }[]> = {
  banque1: [
    { label: "Virement reçu", sens: "entree", compte: "411000" },
    { label: "Encaissement", sens: "entree" },
    { label: "Dépôt (versement d'espèces)", sens: "entree", compte: "530000" },
    { label: "Virement émis (fournisseur)", sens: "sortie", compte: "401000" },
    { label: "Retrait (espèces)", sens: "sortie", compte: "530000" },
    { label: "Frais bancaires", sens: "sortie", compte: "627000" },
    { label: "Décaissement", sens: "sortie" },
    { label: "Régularisation", sens: "entree" },
  ],
  banque2: [
    { label: "Virement reçu", sens: "entree", compte: "411000" },
    { label: "Encaissement", sens: "entree" },
    { label: "Virement émis (fournisseur)", sens: "sortie", compte: "401000" },
    { label: "Frais bancaires", sens: "sortie", compte: "627000" },
    { label: "Décaissement", sens: "sortie" },
    { label: "Régularisation", sens: "entree" },
  ],
  caisse: [
    { label: "Entrée caisse", sens: "entree" },
    { label: "Sortie caisse", sens: "sortie" },
    { label: "Paiement client", sens: "entree", compte: "411000" },
    { label: "Paiement fournisseur", sens: "sortie", compte: "401000" },
    { label: "Avance", sens: "sortie", compte: "421000" },
    { label: "Remboursement", sens: "entree" },
    { label: "Régularisation", sens: "entree" },
  ],
};

const COMPTE_TRESO: Record<DossierTreso, string> = { banque1: "512000", banque2: "512100", caisse: "530000" };

function montantAvecDevise(v: number, devise: string): string {
  return `${fmtMontant(v)} ${devise}`;
}

// ------------------------------------------------------------------ formulaires
function FormMouvement({
  dossier, comptes, deviseInitiale, onFermer, onEnregistre,
}: { dossier: DossierTreso; comptes: Compte[]; deviseInitiale: string; onFermer: () => void; onEnregistre: (e: Ecriture) => void }) {
  const presets = PRESETS[dossier];
  const [type, setType] = useState(presets[0].label);
  const [sens, setSens] = useState<"entree" | "sortie">(presets[0].sens);
  const [date, setDate] = useState(isoLocal(new Date()));
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState(dossier === "banque2" ? deviseInitiale : "TND");
  const [taux, setTaux] = useState("");
  const [contrepartie, setContrepartie] = useState("");
  const [tiers, setTiers] = useState("");
  const [libelle, setLibelle] = useState(presets[0].label);
  const [reference, setReference] = useState("");
  const [observation, setObservation] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const comptesChoix = useMemo(() => comptes.filter((c) => c.actif && c.numero !== COMPTE_TRESO[dossier]), [comptes, dossier]);

  function appliquerType(label: string) {
    const p = presets.find((x) => x.label === label);
    if (!p) return;
    setType(label);
    setSens(p.sens);
    if (!libelle.trim() || presets.some((x) => x.label === libelle)) setLibelle(label);
    const c = p.compte ? comptes.find((x) => x.numero === p.compte) : undefined;
    setContrepartie(c ? String(c.id) : "");
  }

  const montantTnd = dossier === "banque2" ? Math.round(nombre(montant) * nombre(taux) * 1000) / 1000 : nombre(montant);

  async function valider() {
    setErreur("");
    if (nombre(montant) === 0) return setErreur("Saisissez un montant supérieur à 0.");
    if (dossier === "banque2" && nombre(taux) === 0) return setErreur("Indiquez le taux de change (valeur d'une unité de devise en TND).");
    if (!contrepartie) return setErreur("Choisissez le compte de contrepartie.");
    if (libelle.trim().length < 2) return setErreur("Le libellé est obligatoire.");
    setEnvoi(true);
    try {
      const e = await api.post<Ecriture>("/comptabilite/manuel/mouvements", {
        dossier, sens, date, montant: nombre(montant), devise, taux: dossier === "banque2" ? nombre(taux) : null,
        contrepartie_id: Number(contrepartie), libelle: libelle.trim(), reference: reference.trim() || null,
        tiers: tiers.trim() || null, observation: observation.trim() || null,
      });
      onEnregistre(e);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal title="Nouvelle opération" onClose={onFermer}>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="form-field">
          <label>Type d'opération</label>
          <select value={type} onChange={(e) => appliquerType(e.target.value)}>
            {presets.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Sens</label>
          <div className="segment">
            <button type="button" className={sens === "entree" ? "actif entree" : ""} onClick={() => setSens("entree")}>＋ Entrée</button>
            <button type="button" className={sens === "sortie" ? "actif sortie" : ""} onClick={() => setSens("sortie")}>－ Sortie</button>
          </div>
        </div>
        <div className="form-field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="form-field">
          <label>Montant{dossier === "banque2" ? ` en ${devise}` : " (TND)"}</label>
          <input className="montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0,000" autoFocus />
        </div>
        {dossier === "banque2" && (
          <>
            <div className="form-field">
              <label>Devise</label>
              <select value={devise} onChange={(e) => setDevise(e.target.value)}>
                {DEVISES_B2.map((d) => <option key={d} value={d}>{ICONES_DEVISE[d]} {d}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Taux de change (1 {devise} = ? TND)</label>
              <input className="montant" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="3,400" />
            </div>
          </>
        )}
        <div className="form-field" style={{ gridColumn: "1 / -1" }}>
          <label>Compte de contrepartie *</label>
          <select value={contrepartie} onChange={(e) => setContrepartie(e.target.value)}>
            <option value="">— Choisir un compte —</option>
            {comptesChoix.map((c) => <option key={c.id} value={c.id}>{c.numero} — {c.libelle}</option>)}
          </select>
        </div>
        <div className="form-field"><label>Tiers (client, fournisseur…)</label><input value={tiers} onChange={(e) => setTiers(e.target.value)} maxLength={150} /></div>
        <div className="form-field"><label>Référence</label><input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="N° de virement, de chèque…" /></div>
        <div className="form-field" style={{ gridColumn: "1 / -1" }}><label>Libellé *</label><input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={255} /></div>
        <div className="form-field" style={{ gridColumn: "1 / -1" }}><label>Observation</label><input value={observation} onChange={(e) => setObservation(e.target.value)} maxLength={500} /></div>
      </div>
      <div className="compta-equilibre">
        {dossier === "banque2" && montantTnd > 0 && <span>Équivalent comptable : <strong>{fmtMontant(montantTnd)} TND</strong></span>}
        <span>{sens === "entree" ? "Débit" : "Crédit"} {COMPTE_TRESO[dossier]} / {sens === "entree" ? "Crédit" : "Débit"} contrepartie</span>
        <span className="etat ok">✓ Écriture équilibrée automatiquement</span>
      </div>
      {erreur && <p className="error-msg">{erreur}</p>}
      <div className="form-actions">
        <button className="btn secondary" onClick={onFermer} disabled={envoi}>Annuler</button>
        <button className="btn" onClick={valider} disabled={envoi}>{envoi ? "Enregistrement…" : "Valider"}</button>
      </div>
    </Modal>
  );
}

function FormSoldeInitial({
  dossier, devise, actuel, onFermer, onEnregistre,
}: { dossier: DossierTreso; devise: string; actuel: number; onFermer: () => void; onEnregistre: () => void }) {
  const [montant, setMontant] = useState(actuel ? String(actuel).replace(".", ",") : "");
  const [date, setDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [taux, setTaux] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    setErreur("");
    const brut = parseFloat(montant.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(brut)) return setErreur("Saisissez un montant valide (0 pour supprimer le solde initial).");
    if (dossier === "banque2" && brut !== 0 && nombre(taux) === 0) return setErreur("Indiquez le taux de change.");
    setEnvoi(true);
    try {
      await api.put("/comptabilite/manuel/solde-initial", { dossier, montant: brut, date, devise, taux: dossier === "banque2" ? nombre(taux) || null : null });
      onEnregistre();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal title={`Solde initial — ${devise}`} onClose={onFermer}>
      <p style={{ marginTop: 0 }} className="muted">
        Le solde initial est enregistré comme une écriture d'ouverture (contrepartie 110000 Report à nouveau). Une nouvelle saisie remplace la précédente.
      </p>
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="form-field"><label>Montant ({devise})</label><input className="montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus /></div>
        <div className="form-field"><label>Date d'ouverture</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {dossier === "banque2" && (
          <div className="form-field"><label>Taux de change (1 {devise} = ? TND)</label><input className="montant" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="3,400" /></div>
        )}
      </div>
      {erreur && <p className="error-msg">{erreur}</p>}
      <div className="form-actions">
        <button className="btn secondary" onClick={onFermer} disabled={envoi}>Annuler</button>
        <button className="btn" onClick={valider} disabled={envoi}>{envoi ? "…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ soldes
function KpiSolde({ r }: { r: SoldeDevise }) {
  const f = (v: number) => montantAvecDevise(v, r.devise);
  const auto = r.dont_auto_entrees + r.dont_auto_sorties > 0;
  return (
    <>
      <div className="compta-kpis solde-kpis">
        <div className="compta-kpi"><div className="label">Solde initial</div><div className="value">{f(r.solde_initial)}</div></div>
        <div className="compta-kpi vert"><div className="label">Entrées</div><div className="value valeur-positive">+ {f(r.entrees)}</div>
          {r.dont_auto_entrees > 0 && <div className="hint">dont {f(r.dont_auto_entrees)} automatiques</div>}</div>
        <div className="compta-kpi rouge"><div className="label">Sorties</div><div className="value valeur-negative">− {f(r.sorties)}</div>
          {r.dont_auto_sorties > 0 && <div className="hint">dont {f(r.dont_auto_sorties)} automatiques</div>}</div>
        <div className="compta-kpi or"><div className="label">Solde actuel</div><div className={`value ${r.solde < 0 ? "valeur-negative" : ""}`}>{f(r.solde)}</div></div>
      </div>
      {auto && <p className="compta-sous-titre" style={{ margin: "0.5rem 0 0" }}>Le solde inclut aussi les règlements et dépenses enregistrés automatiquement.</p>}
    </>
  );
}

// ------------------------------------------------------------------ vue d'ensemble
function VueDossiers() {
  const [dossiers, setDossiers] = useState<DossierManuel[] | null>(null);
  const [erreur, setErreur] = useState("");
  useEffect(() => {
    comptaApi.dossiersManuels().then((r) => setDossiers(r.dossiers)).catch((e) => setErreur((e as Error).message));
  }, []);
  return (
    <div>
      <div className="page-header"><h2>✍️ Comptabilité manuelle</h2></div>
      <p className="compta-sous-titre">Opérations saisies par le comptable, rangées dans 5 dossiers. Tout ce qui est déjà créé par l'application (factures, paiements, dépenses) se trouve dans la comptabilité automatique : ne le ressaisissez pas.</p>
      {erreur && <p className="error-msg">{erreur}</p>}
      <div className="dossier-grille">
        {dossiers?.map((d) => (
          <Link key={d.cle} to={`/comptabilite/manuel/${d.cle}`} className="dossier-carte manuel">
            <div className="dossier-numero">{d.numero}</div>
            <div className="dossier-icone">{d.icone}</div>
            <div className="dossier-titre">{d.label}</div>
            <div className="dossier-desc">{d.description}</div>
            {d.tresorerie ? (
              <ul className="dossier-soldes">
                {d.tresorerie.map((s) => (
                  <li key={s.devise}><span>{ICONES_DEVISE[s.devise]} {s.devise}</span><b className={s.solde < 0 ? "valeur-negative" : ""}>{fmtMontant(s.solde)}</b></li>
                ))}
              </ul>
            ) : null}
            <div className="dossier-pied">{d.nb_ecritures} opération(s) manuelle(s)</div>
          </Link>
        ))}
      </div>
      <div className="schema-flux">
        <span>Choix du dossier</span><i>→</i><span>Saisie</span><i>→</i><span>Validation</span><i>→</i><span>📒 Journal comptable</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ un dossier
function VueDossier({ cle }: { cle: DossierCle }) {
  const { toast, toastHost } = useToast();
  const tresorerie = cle === "banque1" || cle === "banque2" || cle === "caisse";
  const libelleTiers = cle === "client" ? "Client" : cle === "fournisseur" ? "Fournisseur" : "Tiers";

  const [infos, setInfos] = useState<DossierManuel | null>(null);
  const [resume, setResume] = useState<ResumeTresorerie | null>(null);
  const [devise, setDevise] = useState("EUR");
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [recherche, setRecherche] = useState("");
  const [rechercheDiff, setRechercheDiff] = useState("");
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState<PageEcritures | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [saisie, setSaisie] = useState(false);
  const [saisieAvancee, setSaisieAvancee] = useState<Ecriture | "nouvelle" | null>(null);
  const [soldeInitial, setSoldeInitial] = useState(false);
  const [detail, setDetail] = useState<Ecriture | null>(null);
  const [aSupprimer, setASupprimer] = useState<Ecriture | null>(null);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    comptaApi.dossiersManuels().then((r) => setInfos(r.dossiers.find((d) => d.cle === cle) ?? null)).catch(() => undefined);
    comptaApi.comptes().then(setComptes).catch(() => undefined);
  }, [cle]);

  const chargerResume = useCallback(() => {
    if (tresorerie) comptaApi.tresorerie(cle).then(setResume).catch((e) => setErreur((e as Error).message));
  }, [cle, tresorerie]);
  useEffect(chargerResume, [chargerResume]);

  const minuteur = useRef<number>();
  useEffect(() => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => { setRechercheDiff(recherche); setPage(1); }, 300);
    return () => window.clearTimeout(minuteur.current);
  }, [recherche]);

  const filtres = useMemo(() => {
    const f: Record<string, string> = { origine: "manuelle", dossier: cle };
    if (cle === "banque2") f.devise = devise;
    if (rechercheDiff.trim()) f.q = rechercheDiff.trim();
    if (dateDu) f.date_du = dateDu;
    if (dateAu) f.date_au = dateAu;
    return f;
  }, [cle, devise, rechercheDiff, dateDu, dateAu]);

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

  function apresChangement(message: string) {
    toast(message);
    setSaisie(false);
    setSaisieAvancee(null);
    setSoldeInitial(false);
    setDetail(null);
    charger();
    chargerResume();
    comptaApi.dossiersManuels().then((r) => setInfos(r.dossiers.find((d) => d.cle === cle) ?? null)).catch(() => undefined);
  }

  async function supprimer() {
    if (!aSupprimer) return;
    setSuppression(true);
    try {
      await api.delete(`/comptabilite/ecritures/${aSupprimer.id}`);
      setASupprimer(null);
      apresChangement(`Écriture ${aSupprimer.numero_piece} supprimée.`);
    } catch (e) {
      toast((e as Error).message, "erreur");
      setASupprimer(null);
    } finally {
      setSuppression(false);
    }
  }

  const totalPages = donnees ? Math.max(1, Math.ceil(donnees.total / donnees.taille)) : 1;
  const soldeCourant = resume?.devises.find((d) => d.devise === (cle === "banque2" ? devise : "TND"));
  const deviseSolde = cle === "banque2" ? devise : "TND";

  return (
    <div>
      <p className="fil-ariane"><Link to="/comptabilite/manuel">✍️ Comptabilité manuelle</Link> › {infos?.titre ?? cle}</p>
      <div className="page-header">
        <h2>{infos?.icone} {infos?.titre ?? cle}</h2>
        <div className="actions-entete no-print">
          {tresorerie && <button className="btn secondary" onClick={() => setSoldeInitial(true)}>Solde initial</button>}
          {tresorerie && <button className="btn secondary" onClick={() => setSaisieAvancee("nouvelle")}>Saisie avancée</button>}
          <button className="btn" onClick={() => (tresorerie ? setSaisie(true) : setSaisieAvancee("nouvelle"))}>+ Nouvelle opération</button>
        </div>
      </div>
      {infos && <p className="compta-sous-titre">{infos.description}</p>}
      {erreur && <p className="error-msg">{erreur}</p>}

      {cle === "banque2" && resume && (
        <div className="devises-grille">
          {resume.devises.map((s) => (
            <button key={s.devise} type="button" className={`devise-carte${devise === s.devise ? " actif" : ""}`} onClick={() => { setDevise(s.devise); setPage(1); }}>
              <span className="devise-nom">{ICONES_DEVISE[s.devise]} {s.devise}</span>
              <span className={`devise-solde ${s.solde < 0 ? "valeur-negative" : ""}`}>{fmtMontant(s.solde)}</span>
              <span className="devise-sous">Valeur comptable : {fmtMontant(s.valeur_tnd)} TND</span>
            </button>
          ))}
        </div>
      )}
      {tresorerie && soldeCourant && <KpiSolde r={soldeCourant} />}
      {cle === "banque2" && <p className="compta-sous-titre" style={{ marginTop: "0.5rem" }}>Chaque devise a son propre solde : aucun total entre EUR, USD, GBP et TND n'est jamais calculé.</p>}

      <div className="toolbar no-print" style={{ marginTop: "1.2rem" }}>
        <input type="search" placeholder="Rechercher (libellé, pièce, tiers, référence…)" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ minWidth: 260 }} />
        <input type="date" value={dateDu} onChange={(e) => { setDateDu(e.target.value); setPage(1); }} title="Du" aria-label="Du" />
        <input type="date" value={dateAu} onChange={(e) => { setDateAu(e.target.value); setPage(1); }} title="Au" aria-label="Au" />
        <a className="btn secondary" href={exportJournalUrl("xlsx", filtres)}>Export Excel</a>
        <a className="btn secondary" href={exportJournalUrl("pdf", filtres)} target="_blank" rel="noreferrer">Export PDF</a>
      </div>

      <TableEcritures
        items={donnees?.items ?? []} types={donnees?.types ?? {}} chargement={chargement} libelleTiers={libelleTiers}
        vide="Aucune opération manuelle dans ce dossier. Utilisez « + Nouvelle opération »."
        onDetail={setDetail}
        actions={(e) => (
          <>
            <button className="btn-link" onClick={() => setDetail(e)}>Détail</button>{" "}
            {e.modifiable && <button className="btn-link" onClick={() => setSaisieAvancee(e)}>Modifier</button>}{" "}
            {e.modifiable && <button className="btn-link" style={{ color: "var(--coral)" }} onClick={() => setASupprimer(e)}>Supprimer</button>}
          </>
        )}
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

      {saisie && tresorerie && (
        <FormMouvement dossier={cle as DossierTreso} comptes={comptes} deviseInitiale={devise} onFermer={() => setSaisie(false)}
          onEnregistre={(e) => apresChangement(`Opération ${e.numero_piece} enregistrée et envoyée au journal.`)} />
      )}
      {saisieAvancee && donnees && (
        <EditeurEcriture
          ecriture={saisieAvancee === "nouvelle" ? null : saisieAvancee} comptes={comptes} journaux={donnees.journaux} dossiers={donnees.dossiers}
          dossierFixe={cle} onFermer={() => setSaisieAvancee(null)}
          onEnregistre={(e) => apresChangement(`Écriture ${e.numero_piece} validée et envoyée au journal.`)}
        />
      )}
      {soldeInitial && tresorerie && (
        <FormSoldeInitial dossier={cle as DossierTreso} devise={deviseSolde} actuel={soldeCourant?.solde_initial ?? 0}
          onFermer={() => setSoldeInitial(false)} onEnregistre={() => apresChangement("Solde initial enregistré.")} />
      )}
      {detail && donnees && (
        <DetailEcriture ecriture={detail} types={donnees.types} onFermer={() => setDetail(null)}
          onRegularisee={(n) => apresChangement(`Régularisation ${n.numero_piece} créée.`)} />
      )}
      {aSupprimer && (
        <ConfirmModal titre="Supprimer l'écriture" enCours={suppression} onConfirmer={supprimer} onAnnuler={() => setASupprimer(null)}
          message={`Supprimer définitivement l'écriture ${aSupprimer.numero_piece} (« ${aSupprimer.libelle} ») ? Cette action est irréversible.`} />
      )}
      {toastHost}
    </div>
  );
}

export default function ComptaManuel() {
  const { utilisateur } = useAuth();
  const { dossier } = useParams();
  if (utilisateur?.role !== "administrateur") return <p>Cette section est réservée aux administrateurs.</p>;
  if (!dossier) return <VueDossiers />;
  if (!DOSSIERS_MANUELS_CLES.includes(dossier as DossierCle)) return <p className="error-msg">Dossier inconnu.</p>;
  return <VueDossier key={dossier} cle={dossier as DossierCle} />;
}
