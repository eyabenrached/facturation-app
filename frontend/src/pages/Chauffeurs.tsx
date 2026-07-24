import { useEffect, useState } from "react";
import { api } from "../api";
import { Chauffeur } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const VIDE: Omit<Chauffeur, "id"> = {
  nom: "",
  prenom: "",
  cin: "",
  telephone: "",
  date_embauche: "",
  date_fin_contrat: null,
};

export default function Chauffeurs() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [liste, setListe] = useState<Chauffeur[]>([]);
  const [recherche, setRecherche] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Chauffeur | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const params = recherche ? `?recherche=${encodeURIComponent(recherche)}` : "";
    setListe(await api.get<Chauffeur[]>(`/chauffeurs/${params}`));
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

  function ouvrirEdition(c: Chauffeur) {
    setEnEdition(c);
    setForm({ ...c });
    setErreur("");
    setModalOuvert(true);
  }

  async function enregistrer() {
    setErreur("");
    try {
      if (enEdition) {
        await api.put(`/chauffeurs/${enEdition.id}`, form);
      } else {
        await api.post(`/chauffeurs/`, form);
      }
      setModalOuvert(false);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(c: Chauffeur) {
    if (!confirm(`Supprimer ${c.prenom} ${c.nom} ?`)) return;
    try {
      await api.delete(`/chauffeurs/${c.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Chauffeurs</h2>
        {estAdmin && <button className="btn" onClick={ouvrirAjout}>+ Ajouter un chauffeur</button>}
      </div>

      <div className="toolbar">
        <input
          placeholder="Recherche nom / prénom / CIN"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <DataTable<Chauffeur>
        rows={liste}
        columns={[
          { header: "Nom", render: (c) => c.nom },
          { header: "Prénom", render: (c) => c.prenom },
          { header: "CIN", render: (c) => c.cin },
          { header: "Téléphone", render: (c) => c.telephone },
          { header: "Embauche", render: (c) => c.date_embauche },
          { header: "Fin contrat", render: (c) => c.date_fin_contrat || "—" },
          {
            header: "Actions",
            render: (c) => estAdmin && (
              <>
                <button className="btn-link" onClick={() => ouvrirEdition(c)}>Modifier</button>
                <button className="btn-link" onClick={() => supprimer(c)}>Supprimer</button>
              </>
            ),
          },
        ]}
      />

      {modalOuvert && estAdmin && (
        <Modal title={enEdition ? "Modifier le chauffeur" : "Ajouter un chauffeur"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Nom</label>
              <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Prénom</label>
              <input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </div>
            <div className="form-field">
              <label>CIN</label>
              <input value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Téléphone</label>
              <input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Date d'embauche</label>
              <input type="date" value={form.date_embauche} onChange={(e) => setForm({ ...form, date_embauche: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Date fin de contrat</label>
              <input
                type="date"
                value={form.date_fin_contrat || ""}
                onChange={(e) => setForm({ ...form, date_fin_contrat: e.target.value || null })}
              />
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
