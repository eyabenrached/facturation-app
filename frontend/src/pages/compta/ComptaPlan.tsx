import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../components/Modal";
import { ConfirmModal } from "../../components/compta/ConfirmModal";
import { useToast } from "../../components/compta/Toast";
import { useAuth } from "../../auth/AuthContext";
import { Compte, comptaApi, LABELS_CLASSE } from "../../comptaApi";
import "./compta.css";

export default function ComptaPlan() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const { toast, toastHost } = useToast();

  const [comptes, setComptes] = useState<Compte[]>([]);
  const [recherche, setRecherche] = useState("");
  const [classe, setClasse] = useState("");
  const [statut, setStatut] = useState("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const [edition, setEdition] = useState<Compte | "nouveau" | null>(null);
  const [numero, setNumero] = useState("");
  const [libelle, setLibelle] = useState("");
  const [actif, setActif] = useState(true);
  const [erreurForm, setErreurForm] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [aBasculer, setABasculer] = useState<Compte | null>(null);

  const charger = useCallback(async () => {
    if (!estAdmin) return;
    setChargement(true);
    setErreur("");
    try {
      const p: Record<string, string> = {};
      if (recherche.trim()) p.q = recherche.trim();
      if (classe) p.classe = classe;
      if (statut) p.actif = statut;
      setComptes(await comptaApi.comptes(p));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [estAdmin, recherche, classe, statut]);

  useEffect(() => {
    const t = window.setTimeout(charger, 250);
    return () => window.clearTimeout(t);
  }, [charger]);

  function ouvrir(c: Compte | "nouveau") {
    setEdition(c);
    setErreurForm("");
    if (c === "nouveau") {
      setNumero("");
      setLibelle("");
      setActif(true);
    } else {
      setNumero(c.numero);
      setLibelle(c.libelle);
      setActif(c.actif);
    }
  }

  async function enregistrer() {
    setErreurForm("");
    if (!/^[1-9][0-9]{3,9}$/.test(numero)) return setErreurForm("Le numéro doit comporter de 4 à 10 chiffres et ne pas commencer par 0 (ex : 625100).");
    if (libelle.trim().length < 2) return setErreurForm("Le libellé est obligatoire.");
    setEnvoi(true);
    try {
      const payload = { numero, libelle: libelle.trim(), actif };
      if (edition === "nouveau") await api.post("/comptabilite/comptes", payload);
      else if (edition) await api.put(`/comptabilite/comptes/${edition.id}`, payload);
      toast(edition === "nouveau" ? `Compte ${numero} créé.` : `Compte ${numero} modifié.`);
      setEdition(null);
      charger();
    } catch (e) {
      setErreurForm((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function basculer() {
    if (!aBasculer) return;
    setEnvoi(true);
    try {
      const r = await api.patch<Compte>(`/comptabilite/comptes/${aBasculer.id}/actif`, {});
      toast(`Compte ${r.numero} ${r.actif ? "réactivé" : "désactivé"}.`);
      charger();
    } catch (e) {
      toast((e as Error).message, "erreur");
    } finally {
      setEnvoi(false);
      setABasculer(null);
    }
  }

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header"><h2>Plan comptable</h2></div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  // Regroupement par classe pour une lecture "plan comptable".
  const parClasse = new Map<number, Compte[]>();
  comptes.forEach((c) => parClasse.set(c.classe, [...(parClasse.get(c.classe) ?? []), c]));

  return (
    <div>
      <div className="page-header">
        <h2>Plan comptable</h2>
        <button className="btn" onClick={() => ouvrir("nouveau")}>+ Nouveau compte</button>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Rechercher un numéro ou un libellé…" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ minWidth: 280 }} />
        <select value={classe} onChange={(e) => setClasse(e.target.value)} aria-label="Classe">
          <option value="">Toutes les classes</option>
          {Object.entries(LABELS_CLASSE).map(([k, v]) => <option key={k} value={k}>Classe {k} — {v}</option>)}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut">
          <option value="">Actifs et désactivés</option>
          <option value="true">Actifs</option>
          <option value="false">Désactivés</option>
        </select>
      </div>

      {erreur && <p className="error-msg">{erreur}</p>}

      <div className="data-table-wrap" style={{ opacity: chargement ? 0.55 : 1 }}>
        <table className="data-table compta-table" style={{ minWidth: 640 }}>
          <thead>
            <tr><th>Numéro</th><th>Libellé</th><th>Statut</th><th className="num">Écritures</th><th /></tr>
          </thead>
          {comptes.length === 0 && (
            <tbody><tr><td colSpan={5} className="empty-cell">{chargement ? "Chargement…" : "Aucun compte ne correspond."}</td></tr></tbody>
          )}
          {[...parClasse.entries()].map(([k, liste]) => (
            <tbody key={k}>
              <tr>
                <td colSpan={5} style={{ background: "var(--gold-soft)", fontWeight: 700, color: "var(--gold-dark)" }}>
                  Classe {k} — {LABELS_CLASSE[k] ?? ""}
                </td>
              </tr>
              {liste.map((c) => (
                <tr key={c.id} style={c.actif ? undefined : { opacity: 0.6 }}>
                  <td><strong>{c.numero}</strong></td>
                  <td>
                    {c.libelle}{" "}
                    {c.systeme && <span className="badge systeme" title="Utilisé par les écritures automatiques">Système</span>}
                  </td>
                  <td><span className={`badge ${c.actif ? "actif" : "inactif"}`}>{c.actif ? "Actif" : "Désactivé"}</span></td>
                  <td className="num">{c.nb_lignes}</td>
                  <td className="actions">
                    <button className="btn-link" onClick={() => ouvrir(c)}>Modifier</button>{" "}
                    {(!c.systeme || !c.actif) && (
                      <button className="btn-link" onClick={() => setABasculer(c)}>{c.actif ? "Désactiver" : "Réactiver"}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {edition && (
        <Modal title={edition === "nouveau" ? "Nouveau compte" : `Modifier le compte ${edition.numero}`} onClose={() => setEdition(null)}>
          <div className="form-grid">
            <div className="form-field">
              <label>Numéro de compte</label>
              <input value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))} maxLength={10} inputMode="numeric"
                disabled={edition !== "nouveau" && (edition.systeme || edition.nb_lignes > 0)}
                title={edition !== "nouveau" && (edition.systeme || edition.nb_lignes > 0) ? "Numéro verrouillé : compte système ou déjà utilisé" : undefined} />
            </div>
            <div className="form-field">
              <label>Classe</label>
              <input value={numero ? `${numero[0]} — ${LABELS_CLASSE[Number(numero[0])] ?? "—"}` : "—"} disabled />
            </div>
          </div>
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>Libellé</label>
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={150} />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.88rem" }}>
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} disabled={edition !== "nouveau" && edition.systeme} />
            Compte actif (sélectionnable dans les écritures)
          </label>
          {erreurForm && <p className="error-msg">{erreurForm}</p>}
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setEdition(null)} disabled={envoi}>Annuler</button>
            <button className="btn" onClick={enregistrer} disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </Modal>
      )}

      {aBasculer && (
        <ConfirmModal
          titre={aBasculer.actif ? "Désactiver le compte" : "Réactiver le compte"}
          message={aBasculer.actif
            ? `Désactiver le compte ${aBasculer.numero} — ${aBasculer.libelle} ? Il ne sera plus proposé dans les nouvelles écritures (l'historique est conservé).`
            : `Réactiver le compte ${aBasculer.numero} — ${aBasculer.libelle} ?`}
          libelleConfirmer={aBasculer.actif ? "Désactiver" : "Réactiver"}
          enCours={envoi}
          onConfirmer={basculer}
          onAnnuler={() => setABasculer(null)}
        />
      )}
      {toastHost}
    </div>
  );
}
