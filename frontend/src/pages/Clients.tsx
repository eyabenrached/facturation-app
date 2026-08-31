import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Client } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const VIDE: Omit<Client, "id"> = {
  nom_societe: "",
  responsable: "",
  telephone: "",
  email: "",
  adresse: "",
  matricule_fiscal: "",
  taux_tva: 19,
  remise: 0,
};

export default function Clients() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [liste, setListe] = useState<Client[]>([]);
  const [recherche, setRecherche] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Client | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const params = recherche ? `?recherche=${encodeURIComponent(recherche)}` : "";
    setListe(await api.get<Client[]>(`/clients/${params}`));
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

  function ouvrirEdition(c: Client) {
    setEnEdition(c);
    setForm({ ...c });
    setErreur("");
    setModalOuvert(true);
  }

  async function enregistrer() {
    setErreur("");
    try {
      if (enEdition) {
        await api.put(`/clients/${enEdition.id}`, form);
      } else {
        await api.post(`/clients/`, form);
      }
      setModalOuvert(false);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(c: Client) {
    if (!confirm(`Supprimer le client ${c.nom_societe} ?`)) return;
    try {
      await api.delete(`/clients/${c.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Clients</h2>
        {estAdmin && <button className="btn" onClick={ouvrirAjout}>+ Ajouter un client</button>}
      </div>

      <div className="toolbar">
        <input
          placeholder="Recherche société / responsable"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <DataTable<Client>
        rows={liste}
        columns={[
          { header: "Société", render: (c) => <Link to={`/clients/${c.id}`}>{c.nom_societe}</Link> },
          { header: "Responsable", render: (c) => c.responsable },
          { header: "Téléphone", render: (c) => c.telephone },
          { header: "E-mail", render: (c) => c.email },
          { header: "TVA %", render: (c) => `${c.taux_tva}%` },
          {
            header: "Actions",
            render: (c) => (
              <>
                <Link className="btn-link" to={`/clients/${c.id}`}>Fiche</Link>
                {estAdmin && (
                  <>
                    <button className="btn-link" onClick={() => ouvrirEdition(c)}>Modifier</button>
                    <button className="btn-link" onClick={() => supprimer(c)}>Supprimer</button>
                  </>
                )}
              </>
            ),
          },
        ]}
      />

      {modalOuvert && estAdmin && (
        <Modal title={enEdition ? "Modifier le client" : "Ajouter un client"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de la société</label>
              <input value={form.nom_societe} onChange={(e) => setForm({ ...form, nom_societe: e.target.value })} />
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
            <div className="form-field">
              <label>Adresse</label>
              <input value={form.adresse ?? ""} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="Ex : 45, Rue de la République, 1002 Tunis" />
            </div>
            <div className="form-field">
              <label>Matricule fiscal</label>
              <input value={form.matricule_fiscal ?? ""} onChange={(e) => setForm({ ...form, matricule_fiscal: e.target.value })} placeholder="Ex : 9876543/A/M/000" />
            </div>
            <div className="form-field">
              <label>Taux TVA (%)</label>
              <input type="number" value={form.taux_tva} onChange={(e) => setForm({ ...form, taux_tva: Number(e.target.value) })} />
            </div>
            <div className="form-field">
              <label>Remise (%)</label>
              <input type="number" value={form.remise} onChange={(e) => setForm({ ...form, remise: Number(e.target.value) })} />
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