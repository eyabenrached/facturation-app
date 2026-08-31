import { useEffect, useState } from "react";
import { api } from "../api";
import { Utilisateur, Role } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const VIDE = { nom: "", email: "", password: "", role: "gestionnaire" as Role };

export default function Utilisateurs() {
  const { utilisateur: moi } = useAuth();
  const [liste, setListe] = useState<Utilisateur[]>([]);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Utilisateur | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  async function charger() {
    setListe(await api.get<Utilisateur[]>("/utilisateurs/"));
  }

  useEffect(() => {
    charger();
  }, []);

  function ouvrirAjout() {
    setEnEdition(null);
    setForm(VIDE);
    setErreur("");
    setModalOuvert(true);
  }

  function ouvrirEdition(u: Utilisateur) {
    setEnEdition(u);
    setForm({ nom: u.nom, email: u.email, password: "", role: u.role });
    setErreur("");
    setModalOuvert(true);
  }

  async function enregistrer() {
    setErreur("");
    try {
      if (enEdition) {
        const payload: any = { nom: form.nom, email: form.email, role: form.role };
        if (form.password) payload.password = form.password;
        await api.put(`/utilisateurs/${enEdition.id}`, payload);
      } else {
        await api.post("/utilisateurs/", form);
      }
      setModalOuvert(false);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function desactiver(u: Utilisateur) {
    if (!confirm(`Désactiver le compte de ${u.nom} ?`)) return;
    await api.patch(`/utilisateurs/${u.id}/desactiver`, {});
    charger();
  }

  async function reactiver(u: Utilisateur) {
    await api.patch(`/utilisateurs/${u.id}/reactiver`, {});
    charger();
  }

  async function supprimer(u: Utilisateur) {
    if (!confirm(`Supprimer définitivement le compte de ${u.nom} ? Cette action est irréversible.`)) return;
    try {
      await api.delete(`/utilisateurs/${u.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Utilisateurs</h2>
        <button className="btn" onClick={ouvrirAjout}>+ Ajouter un utilisateur</button>
      </div>

      <DataTable<Utilisateur>
        rows={liste}
        columns={[
          { header: "Nom", render: (u) => u.nom },
          { header: "E-mail", render: (u) => u.email },
          { header: "Rôle", render: (u) => <span className={`role-badge ${u.role}`}>{u.role}</span> },
          { header: "Statut", render: (u) => (u.actif ? "Actif" : "Désactivé") },
          {
            header: "Actions",
            render: (u) =>
              u.id !== moi?.id && (
                <>
                  <button className="btn-link" onClick={() => ouvrirEdition(u)}>Modifier</button>
                  {u.actif ? (
                    <button className="btn-link" onClick={() => desactiver(u)}>Désactiver</button>
                  ) : (
                    <button className="btn-link" onClick={() => reactiver(u)}>Réactiver</button>
                  )}
                  <button className="btn-link" onClick={() => supprimer(u)}>Supprimer</button>
                </>
              ),
          },
        ]}
      />

      {modalOuvert && (
        <Modal title={enEdition ? "Modifier l'utilisateur" : "Ajouter un utilisateur"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>Nom</label>
            <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </div>
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>Adresse e-mail</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>{enEdition ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe"}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>Rôle</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="gestionnaire">Gestionnaire (navettes &amp; facturation)</option>
              <option value="administrateur">Administrateur (accès complet)</option>
            </select>
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