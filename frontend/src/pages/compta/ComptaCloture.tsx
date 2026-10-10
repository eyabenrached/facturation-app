import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ConfirmModal } from "../../components/compta/ConfirmModal";
import { useToast } from "../../components/compta/Toast";
import { comptaApi, EtatCloture, fmtDate, isoLocal } from "../../comptaApi";
import "./compta.css";

export default function ComptaCloture() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const { toast, toastHost } = useToast();
  const [etat, setEtat] = useState<EtatCloture | null>(null);
  const [jusquAu, setJusquAu] = useState(isoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 0)));
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = () => comptaApi.cloture().then(setEtat).catch((e) => toast((e as Error).message, "erreur"));
  useEffect(() => { if (estAdmin) charger(); }, [estAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cloturer() {
    setEnCours(true);
    try {
      const r = await api.post<EtatCloture & { cloturees: number }>("/comptabilite/cloture", { jusqu_au: jusquAu });
      setEtat(r);
      toast(`${r.cloturees} écriture(s) clôturée(s).`);
    } catch (e) {
      toast((e as Error).message, "erreur");
    } finally {
      setEnCours(false);
      setConfirmer(false);
    }
  }

  if (!estAdmin) return <p>Cette section est réservée aux administrateurs.</p>;
  return (
    <div>
      <div className="page-header"><h2>🔐 Clôture</h2></div>
      <p className="compta-sous-titre">Une écriture clôturée est verrouillée : elle ne peut plus être modifiée ni supprimée, et aucune écriture ne peut être saisie à une date antérieure. Pour corriger, on crée une écriture de régularisation.</p>
      {etat && (
        <div className="compta-kpis">
          <div className="compta-kpi or"><div className="label">Clôturé jusqu'au</div><div className="value">{etat.cloture_jusqu_au ? fmtDate(etat.cloture_jusqu_au) : "Aucune clôture"}</div></div>
          <div className="compta-kpi"><div className="label">Écritures encore ouvertes</div><div className="value">{etat.ecritures_ouvertes}</div>
            {etat.derniere_ecriture_ouverte && <div className="hint">Dernière : {fmtDate(etat.derniere_ecriture_ouverte)}</div>}</div>
        </div>
      )}
      <div className="card" style={{ marginTop: "1.2rem", maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Clôturer une période</h3>
        <div className="form-field"><label>Clôturer toutes les écritures jusqu'au (inclus)</label><input type="date" value={jusquAu} onChange={(e) => setJusquAu(e.target.value)} /></div>
        <p className="muted" style={{ fontSize: "0.82rem" }}>⚠ Cette action est irréversible depuis l'application.</p>
        <button className="btn" onClick={() => setConfirmer(true)} disabled={!jusquAu || enCours}>Clôturer la période</button>
      </div>
      {confirmer && (
        <ConfirmModal titre="Clôturer la période" libelleConfirmer="Clôturer" enCours={enCours} onConfirmer={cloturer} onAnnuler={() => setConfirmer(false)}
          message={`Verrouiller toutes les écritures jusqu'au ${fmtDate(jusquAu)} ? Elles ne pourront plus être modifiées ni supprimées.`} />
      )}
      {toastHost}
    </div>
  );
}
