import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import {
  DossierHotel,
  DossierHotelPayload,
  LABELS_STATUT_DOSSIER_HOTEL,
  StatutDossierHotel,
} from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const STATUTS: StatutDossierHotel[] = ["en_cours", "confirme", "cloture", "annule"];

const VIDE: DossierHotelPayload = {
  agence_nom: "",
  circuit_nom: "",
  date_arrivee: null,
  heure_arrivee: null,
  numero_vol_arrivee: "",
  compagnie_arrivee: "",
  date_depart: null,
  heure_depart: null,
  numero_vol_depart: "",
  compagnie_depart: "",
  nb_personnes: 1,
  nb_chambres: 1,
  observations: "",
};

function badgeStatut(s: string) {
  const label = LABELS_STATUT_DOSSIER_HOTEL[s as StatutDossierHotel] || s;
  return <span className={`badge ${s}`}>{label}</span>;
}

// Les champs vides (texte/heure) sont envoyés à null pour que l'API ne reçoive
// jamais de chaîne vide sur un champ time/date.
function nettoyer(form: DossierHotelPayload): DossierHotelPayload {
  const v = (x: string | null) => (x && x.trim() ? x : null);
  return {
    ...form,
    agence_nom: v(form.agence_nom),
    circuit_nom: v(form.circuit_nom),
    date_arrivee: v(form.date_arrivee),
    heure_arrivee: v(form.heure_arrivee),
    numero_vol_arrivee: v(form.numero_vol_arrivee),
    compagnie_arrivee: v(form.compagnie_arrivee),
    date_depart: v(form.date_depart),
    heure_depart: v(form.heure_depart),
    numero_vol_depart: v(form.numero_vol_depart),
    compagnie_depart: v(form.compagnie_depart),
    observations: v(form.observations),
  };
}

export default function DossiersHotels() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const navigate = useNavigate();
  const [liste, setListe] = useState<DossierHotel[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [form, setForm] = useState<DossierHotelPayload>(VIDE);
  const [numeroSuggere, setNumeroSuggere] = useState("");
  const [erreur, setErreur] = useState("");

  async function charger() {
    const params = new URLSearchParams();
    if (filtreStatut) params.set("statut", filtreStatut);
    setListe(await api.get<DossierHotel[]>(`/dossiers-hotels/?${params.toString()}`));
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreStatut]);

  const listeFiltree = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    if (!t) return liste;
    return liste.filter(
      (d) =>
        d.numero_dossier.toLowerCase().includes(t) ||
        (d.agence_nom || "").toLowerCase().includes(t) ||
        (d.circuit_nom || "").toLowerCase().includes(t)
    );
  }, [liste, recherche]);

  async function ouvrirAjout() {
    setForm(VIDE);
    setErreur("");
    setNumeroSuggere("");
    setModalOuvert(true);
    try {
      const r = await api.get<{ numero_suggere: string }>("/dossiers-hotels/next-numero");
      setNumeroSuggere(r.numero_suggere);
    } catch {
      /* le numéro est attribué par le serveur de toute façon */
    }
  }

  async function enregistrer() {
    setErreur("");
    if (!form.agence_nom || !form.agence_nom.trim()) {
      setErreur("Merci de saisir le nom de l'agence.");
      return;
    }
    if (form.date_arrivee && form.date_depart && form.date_depart <= form.date_arrivee) {
      setErreur("La date de départ doit être postérieure à la date d'arrivée.");
      return;
    }
    try {
      const dossier = await api.post<DossierHotel>(`/dossiers-hotels/`, nettoyer(form));
      setModalOuvert(false);
      navigate(`/dossiers-hotels/${dossier.id}`);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(d: DossierHotel) {
    if (!confirm(`Supprimer le dossier ${d.numero_dossier} et toutes ses réservations ?`)) return;
    try {
      await api.delete(`/dossiers-hotels/${d.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const maj = (patch: Partial<DossierHotelPayload>) => setForm({ ...form, ...patch });

  return (
    <div>
      <div className="page-header">
        <h2>Dossiers hôtels</h2>
        <button className="btn" onClick={ouvrirAjout}>+ Nouveau dossier</button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Recherche n° dossier / agence / circuit"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>{LABELS_STATUT_DOSSIER_HOTEL[s]}</option>
          ))}
        </select>
      </div>

      <DataTable<DossierHotel>
        rows={listeFiltree}
        columns={[
          { header: "N° dossier", render: (d) => <Link to={`/dossiers-hotels/${d.id}`}>{d.numero_dossier}</Link> },
          { header: "Agence", render: (d) => d.agence_nom || "—" },
          { header: "Circuit", render: (d) => d.circuit_nom || "—" },
          { header: "Arrivée", render: (d) => d.date_arrivee || "—" },
          { header: "Départ", render: (d) => d.date_depart || "—" },
          { header: "Pers.", render: (d) => d.nb_personnes ?? "—" },
          { header: "Chambres", render: (d) => d.nb_chambres ?? "—" },
          { header: "Statut", render: (d) => badgeStatut(d.statut_global) },
          {
            header: "Actions",
            render: (d) => (
              <>
                <Link className="btn-link" to={`/dossiers-hotels/${d.id}`}>Fiche</Link>
                {estAdmin && <button className="btn-link" onClick={() => supprimer(d)}>Supprimer</button>}
              </>
            ),
          },
        ]}
      />

      {modalOuvert && (
        <Modal title="Nouveau dossier hôtel" onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>N° dossier (attribué automatiquement)</label>
              <input value={numeroSuggere || "…"} readOnly />
            </div>
            <div className="form-field">
              <label>Agence</label>
              <input
                value={form.agence_nom || ""}
                placeholder="Nom de l'agence"
                onChange={(e) => maj({ agence_nom: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Circuit (optionnel)</label>
              <input
                value={form.circuit_nom || ""}
                placeholder="Ex : Tunis - Douz"
                onChange={(e) => maj({ circuit_nom: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Nombre de personnes</label>
              <input type="number" min={1} value={form.nb_personnes ?? ""} onChange={(e) => maj({ nb_personnes: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="form-field">
              <label>Nombre de chambres</label>
              <input type="number" min={1} value={form.nb_chambres ?? ""} onChange={(e) => maj({ nb_chambres: e.target.value ? Number(e.target.value) : null })} />
            </div>

            <div className="form-field">
              <label>Date d'arrivée</label>
              <input type="date" value={form.date_arrivee || ""} onChange={(e) => maj({ date_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Heure d'arrivée</label>
              <input type="time" value={form.heure_arrivee || ""} onChange={(e) => maj({ heure_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>N° vol arrivée</label>
              <input value={form.numero_vol_arrivee || ""} onChange={(e) => maj({ numero_vol_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Compagnie arrivée</label>
              <input value={form.compagnie_arrivee || ""} onChange={(e) => maj({ compagnie_arrivee: e.target.value })} />
            </div>

            <div className="form-field">
              <label>Date de départ</label>
              <input type="date" value={form.date_depart || ""} onChange={(e) => maj({ date_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Heure de départ</label>
              <input type="time" value={form.heure_depart || ""} onChange={(e) => maj({ heure_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>N° vol départ</label>
              <input value={form.numero_vol_depart || ""} onChange={(e) => maj({ numero_vol_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Compagnie départ</label>
              <input value={form.compagnie_depart || ""} onChange={(e) => maj({ compagnie_depart: e.target.value })} />
            </div>

            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Observations</label>
              <textarea rows={2} value={form.observations || ""} onChange={(e) => maj({ observations: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrer}>Créer le dossier</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
