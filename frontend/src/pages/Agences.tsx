import { useEffect, useState } from "react";
import { api } from "../api";
import { Agence } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const VIDE: Omit<Agence, "id"> = { nom_agence: "", responsable: "", telephone: "", email: "" };

export default function Agences() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [liste, setListe] = useState<Agence[]>([]);
  const [recherche, setRecherche] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Agence | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const params = recherche ? `?recherche=${encodeURIComponent(recherche)}` : "";
    setListe(await api.get<Agence[]>(`/agences/${params}`));
  }

  useEffect(() => {
    charger();
  }, [recherche]);

  function ouvrirAjout() {
    setEnEdition(null);
    setForm(VIDE);
    setErreur("");
    setModalOuvert(true);
  }

  function ouvrirEdition(a: Agence) {
    setEnEdition(a);
    setForm({ ...a });
    setErreur("");
    setModalOuvert(true);
  }

  async function enregistrer() {
    setErreur("");
    try {
      if (enEdition) {
        await api.put(`/agences/${enEdition.id}`, form);
      } else {
        await api.post(`/agences/`, form);
      }
      setModalOuvert(false);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(a: Agence) {
    if (!confirm(`Supprimer l'agence ${a.nom_agence} ?`)) return;
    try {
      await api.delete(`/agences/${a.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Agences</h2>
        {estAdmin && <button className="btn" onClick={ouvrirAjout}>+ Ajouter une agence</button>}
      </div>

      <div className="toolbar">
        <input
          placeholder="Recherche agence / responsable"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <DataTable<Agence>
        rows={liste}
        columns={[
          { header: "Agence", render: (a) => a.nom_agence },
          { header: "Responsable", render: (a) => a.responsable },
          { header: "Téléphone", render: (a) => a.telephone },
          { header: "E-mail", render: (a) => a.email },
          {
            header: "Actions",
            render: (a) => estAdmin && (
              <>
                <button className="btn-link" onClick={() => ouvrirEdition(a)}>Modifier</button>
                <button className="btn-link" onClick={() => supprimer(a)}>Supprimer</button>
              </>
            ),
          },
        ]}
      />

      {modalOuvert && estAdmin && (
        <Modal title={enEdition ? "Modifier l'agence" : "Ajouter une agence"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de l'agence</label>
              <input value={form.nom_agence} onChange={(e) => setForm({ ...form, nom_agence: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Responsable</label>
              <input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Téléphone</label>
              <input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Adresse e-mail</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrer}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
