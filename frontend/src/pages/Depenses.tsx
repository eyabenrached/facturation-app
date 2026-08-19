import { useEffect, useState } from "react";
import { api } from "../api";
import { Depense, CategorieDepense, LABELS_CATEGORIE_DEPENSE, Vehicule, Chauffeur, Agence } from "../types";
import { DataTable } from "../components/DataTable";
import { useAuth } from "../auth/AuthContext";

const CATEGORIES: CategorieDepense[] = [
  "carburant", "entretien", "assurance", "salaire_chauffeur", "cnss", "taxe", "autre",
];

const VIDE = {
  categorie: "carburant" as CategorieDepense,
  date: new Date().toISOString().slice(0, 10),
  montant: 0,
  description: "",
  vehicule_id: null as number | null,
  chauffeur_id: null as number | null,
  transporteur_id: null as number | null,
};

export default function Depenses() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";

  const [liste, setListe] = useState<Depense[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);

  // Filtres
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState<string>("");
  const [filtreVehicule, setFiltreVehicule] = useState("");
  const [filtreChauffeur, setFiltreChauffeur] = useState("");
  const [filtreTransporteur, setFiltreTransporteur] = useState("");

  const [enEdition, setEnEdition] = useState<Depense | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api.get<Vehicule[]>("/vehicules/").then(setVehicules);
    api.get<Chauffeur[]>("/chauffeurs/").then(setChauffeurs);
    api.get<Agence[]>("/agences/").then(setAgences);
  }, []);

  async function charger() {
    if (!estAdmin) return;
    const params = new URLSearchParams();
    if (dateDu) params.set("date_du", dateDu);
    if (dateAu) params.set("date_au", dateAu);
    if (filtreCategorie) params.set("categorie", filtreCategorie);
    if (filtreVehicule) params.set("vehicule_id", filtreVehicule);
    if (filtreChauffeur) params.set("chauffeur_id", filtreChauffeur);
    if (filtreTransporteur) params.set("transporteur_id", filtreTransporteur);
    setListe(await api.get<Depense[]>(`/depenses/?${params.toString()}`));
  }

  useEffect(() => {
    charger();
  }, [dateDu, dateAu, filtreCategorie, filtreVehicule, filtreChauffeur, filtreTransporteur]);

  function nouveauFormulaire() {
    setEnEdition(null);
    setForm(VIDE);
    setErreur("");
  }

  function editer(d: Depense) {
    setEnEdition(d);
    setForm({
      categorie: d.categorie,
      date: d.date,
      montant: d.montant,
      description: d.description || "",
      vehicule_id: d.vehicule_id,
      chauffeur_id: d.chauffeur_id,
      transporteur_id: d.transporteur_id,
    });
    setErreur("");
  }

  async function enregistrer() {
    setErreur("");
    if (!form.montant || form.montant <= 0) {
      setErreur("Merci de saisir un montant supérieur à 0.");
      return;
    }
    try {
      const payload = { ...form, description: form.description || null };
      if (enEdition) {
        await api.put(`/depenses/${enEdition.id}`, payload);
      } else {
        await api.post("/depenses/", payload);
      }
      nouveauFormulaire();
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(d: Depense) {
    if (!confirm("Supprimer cette dépense ?")) return;
    try {
      await api.delete(`/depenses/${d.id}`);
      if (enEdition?.id === d.id) nouveauFormulaire();
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header">
          <h2>Dépenses</h2>
        </div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  const totalAffiche = liste.reduce((s, d) => s + Number(d.montant), 0);

  return (
    <div>
      <div className="page-header">
        <h2>Dépenses</h2>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        {erreur && <p className="error-msg">{erreur}</p>}
        <div className="form-grid">
          <div className="form-field">
            <label>Catégorie</label>
            <select
              value={form.categorie}
              onChange={(e) => setForm({ ...form, categorie: e.target.value as CategorieDepense })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{LABELS_CATEGORIE_DEPENSE[c]}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Montant (TND)</label>
            <input
              type="number"
              min={0}
              step="0.001"
              value={form.montant || ""}
              onChange={(e) => setForm({ ...form, montant: Number(e.target.value) })}
            />
          </div>
          <div className="form-field">
            <label>Véhicule (optionnel)</label>
            <select
              value={form.vehicule_id || ""}
              onChange={(e) => setForm({ ...form, vehicule_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {vehicules.map((v) => (
                <option key={v.id} value={v.id}>{v.matricule}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Chauffeur (optionnel)</label>
            <select
              value={form.chauffeur_id || ""}
              onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {chauffeurs.map((c) => (
                <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Transporteur / Agence (optionnel)</label>
            <select
              value={form.transporteur_id || ""}
              onChange={(e) => setForm({ ...form, transporteur_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {agences.map((a) => (
                <option key={a.id} value={a.id}>{a.nom_agence}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Description (optionnel)</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="ex. plein carburant, vidange, prime chauffeur..."
            />
          </div>
        </div>
        <div className="form-actions">
          {enEdition && (
            <button className="btn secondary" onClick={nouveauFormulaire}>Annuler la modification</button>
          )}
          <button className="btn" onClick={enregistrer}>
            {enEdition ? "Enregistrer les modifications" : "+ Ajouter la dépense"}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="form-field">
          <label>Date du</label>
          <input type="date" value={dateDu} onChange={(e) => setDateDu(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date au</label>
          <input type="date" value={dateAu} onChange={(e) => setDateAu(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Catégorie</label>
          <select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{LABELS_CATEGORIE_DEPENSE[c]}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Véhicule</label>
          <select value={filtreVehicule} onChange={(e) => setFiltreVehicule(e.target.value)}>
            <option value="">Tous les véhicules</option>
            {vehicules.map((v) => (
              <option key={v.id} value={v.id}>{v.matricule}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Chauffeur</label>
          <select value={filtreChauffeur} onChange={(e) => setFiltreChauffeur(e.target.value)}>
            <option value="">Tous les chauffeurs</option>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Transporteur</label>
          <select value={filtreTransporteur} onChange={(e) => setFiltreTransporteur(e.target.value)}>
            <option value="">Tous les transporteurs</option>
            {agences.map((a) => (
              <option key={a.id} value={a.id}>{a.nom_agence}</option>
            ))}
          </select>
        </div>
      </div>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        Total affiché : <strong>{totalAffiche.toFixed(3)} TND</strong> ({liste.length} dépense{liste.length > 1 ? "s" : ""})
      </p>

      <DataTable<Depense>
        rows={liste}
        columns={[
          { header: "Date", render: (d) => d.date },
          { header: "Catégorie", render: (d) => LABELS_CATEGORIE_DEPENSE[d.categorie] },
          { header: "Montant", render: (d) => `${Number(d.montant).toFixed(3)} TND` },
          { header: "Véhicule", render: (d) => d.vehicule?.matricule || "—" },
          { header: "Chauffeur", render: (d) => (d.chauffeur ? `${d.chauffeur.prenom} ${d.chauffeur.nom}` : "—") },
          { header: "Transporteur", render: (d) => d.transporteur?.nom_agence || "—" },
          { header: "Description", render: (d) => d.description || "—" },
          {
            header: "Actions",
            render: (d) => (
              <>
                <button className="btn-link" onClick={() => editer(d)}>Modifier</button>
                <button className="btn-link" onClick={() => supprimer(d)}>Supprimer</button>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
