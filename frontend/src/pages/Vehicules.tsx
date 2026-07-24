import { useEffect, useState } from "react";
import { api } from "../api";
import { Vehicule, Agence } from "../types";
import { DataTable } from "../components/DataTable";
import { useAuth } from "../auth/AuthContext";

const VIDE: Omit<Vehicule, "id"> = {
  matricule: "",
  agence_id: 0,
  ambiance_voyage: "",
  remarque: "",
};

export default function Vehicules() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [liste, setListe] = useState<Vehicule[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [filtreAgence, setFiltreAgence] = useState<string>("");
  const [enEdition, setEnEdition] = useState<Vehicule | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const params = filtreAgence ? `?agence_id=${filtreAgence}` : "";
    setListe(await api.get<Vehicule[]>(`/vehicules/${params}`));
  }

  useEffect(() => {
    api.get<Agence[]>("/agences/").then(setAgences);
  }, []);

  useEffect(() => {
    charger();
  }, [filtreAgence]);

  function nouveauFormulaire() {
    setEnEdition(null);
    setForm(VIDE);
    setErreur("");
  }

  function editer(v: Vehicule) {
    setEnEdition(v);
    setForm({ ...v, ambiance_voyage: v.ambiance_voyage || "", remarque: v.remarque || "" });
    setErreur("");
  }

  async function enregistrer() {
    setErreur("");
    if (!form.agence_id) {
      setErreur("Merci de sélectionner une agence.");
      return;
    }
    try {
      if (enEdition) {
        await api.put(`/vehicules/${enEdition.id}`, form);
      } else {
        await api.post(`/vehicules/`, form);
      }
      nouveauFormulaire();
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(v: Vehicule) {
    if (!confirm(`Supprimer le véhicule ${v.matricule} ?`)) return;
    try {
      await api.delete(`/vehicules/${v.id}`);
      if (enEdition?.id === v.id) nouveauFormulaire();
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Véhicules</h2>
      </div>

      {estAdmin && (
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        {erreur && <p className="error-msg">{erreur}</p>}
        <div className="form-grid">
          <div className="form-field">
            <label>Matricule</label>
            <input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Agence</label>
            <select
              value={form.agence_id || ""}
              onChange={(e) => setForm({ ...form, agence_id: Number(e.target.value) })}
            >
              <option value="">— Sélectionner —</option>
              {agences.map((a) => (
                <option key={a.id} value={a.id}>{a.nom_agence}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Ambiance / type de voyage</label>
            <input
              placeholder="ex. climatisé, VIP, standard"
              value={form.ambiance_voyage || ""}
              onChange={(e) => setForm({ ...form, ambiance_voyage: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Remarque</label>
            <input value={form.remarque || ""} onChange={(e) => setForm({ ...form, remarque: e.target.value })} />
          </div>
        </div>
        <div className="form-actions">
          {enEdition && <button className="btn secondary" onClick={nouveauFormulaire}>Annuler la modification</button>}
          <button className="btn" onClick={enregistrer}>{enEdition ? "Enregistrer les modifications" : "+ Ajouter le véhicule"}</button>
        </div>
      </div>
      )}

      <div className="toolbar">
        <select value={filtreAgence} onChange={(e) => setFiltreAgence(e.target.value)}>
          <option value="">Toutes les agences</option>
          {agences.map((a) => (
            <option key={a.id} value={a.id}>{a.nom_agence}</option>
          ))}
        </select>
      </div>

      <DataTable<Vehicule>
        rows={liste}
        columns={[
          { header: "Matricule", render: (v) => v.matricule },
          { header: "Agence", render: (v) => v.agence?.nom_agence || "—" },
          { header: "Ambiance", render: (v) => v.ambiance_voyage || "—" },
          { header: "Remarque", render: (v) => v.remarque || "—" },
          {
            header: "Actions",
            render: (v) => estAdmin && (
              <>
                <button className="btn-link" onClick={() => editer(v)}>Modifier</button>
                <button className="btn-link" onClick={() => supprimer(v)}>Supprimer</button>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
