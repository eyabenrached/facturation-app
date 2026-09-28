import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import { Hotel } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const VIDE: Omit<Hotel, "id"> = {
  nom: "",
  ville: "",
  pays: "Tunisie",
  categorie_etoiles: 3,
  adresse: "",
  telephone: "",
  email: "",
  contact_reservation: "",
  observations: "",
  actif: true,
};

function etoiles(n: number) {
  return "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(5 - Math.max(0, Math.min(5, n)));
}

export default function Hotels() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [liste, setListe] = useState<Hotel[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtreVille, setFiltreVille] = useState("");
  const [afficherInactifs, setAfficherInactifs] = useState(false);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Hotel | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const params = new URLSearchParams();
    if (recherche) params.set("recherche", recherche);
    if (!afficherInactifs) params.set("actif", "true");
    setListe(await api.get<Hotel[]>(`/hotels/?${params.toString()}`));
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, afficherInactifs]);

  const villes = useMemo(
    () => Array.from(new Set(liste.map((h) => h.ville).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr")),
    [liste]
  );

  const listeFiltree = useMemo(() => {
    if (!filtreVille) return liste;
    return liste.filter((h) => h.ville === filtreVille);
  }, [liste, filtreVille]);

  function ouvrirAjout() {
    setEnEdition(null);
    setForm(VIDE);
    setErreur("");
    setModalOuvert(true);
  }

  function ouvrirEdition(h: Hotel) {
    setEnEdition(h);
    setForm({
      ...h,
      adresse: h.adresse || "",
      telephone: h.telephone || "",
      email: h.email || "",
      contact_reservation: h.contact_reservation || "",
      observations: h.observations || "",
    });
    setErreur("");
    setModalOuvert(true);
  }

  async function enregistrer() {
    setErreur("");
    if (!form.nom.trim()) {
      setErreur("Le nom de l'hôtel est obligatoire.");
      return;
    }
    try {
      if (enEdition) {
        await api.put(`/hotels/${enEdition.id}`, form);
      } else {
        await api.post(`/hotels/`, form);
      }
      setModalOuvert(false);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(h: Hotel) {
    if (!confirm(`Supprimer l'hôtel ${h.nom} ?`)) return;
    try {
      await api.delete(`/hotels/${h.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function basculerActif(h: Hotel) {
    try {
      await api.put(`/hotels/${h.id}`, { ...h, actif: !h.actif });
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Hôtels</h2>
        <button className="btn" onClick={ouvrirAjout}>+ Ajouter un hôtel</button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Recherche nom / ville / contact"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select value={filtreVille} onChange={(e) => setFiltreVille(e.target.value)}>
          <option value="">Toutes les villes</option>
          {villes.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
          <input
            type="checkbox"
            checked={afficherInactifs}
            onChange={(e) => setAfficherInactifs(e.target.checked)}
          />
          Afficher aussi les hôtels désactivés
        </label>
      </div>

      <DataTable<Hotel>
        rows={listeFiltree}
        columns={[
          { header: "Nom", render: (h) => h.nom },
          { header: "Ville", render: (h) => h.ville },
          { header: "Pays", render: (h) => h.pays },
          { header: "Catégorie", render: (h) => <span title={`${h.categorie_etoiles ?? 0} étoiles`}>{etoiles(h.categorie_etoiles ?? 0)}</span> },
          { header: "Contact réservation", render: (h) => h.contact_reservation || "—" },
          { header: "Téléphone", render: (h) => h.telephone || "—" },
          {
            header: "Statut",
            render: (h) => (
              <span style={{ color: h.actif ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                {h.actif ? "Actif" : "Désactivé"}
              </span>
            ),
          },
          {
            header: "Actions",
            render: (h) =>
              estAdmin && (
                <>
                  <button className="btn-link" onClick={() => ouvrirEdition(h)}>Modifier</button>
                  <button className="btn-link" onClick={() => basculerActif(h)}>
                    {h.actif ? "Désactiver" : "Réactiver"}
                  </button>
                  <button className="btn-link" onClick={() => supprimer(h)}>Supprimer</button>
                </>
              ),
          },
        ]}
      />

      {modalOuvert && (
        <Modal title={enEdition ? "Modifier l'hôtel" : "Ajouter un hôtel"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de l'hôtel</label>
              <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Ville</label>
              <input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Pays</label>
              <input value={form.pays} onChange={(e) => setForm({ ...form, pays: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Catégorie (étoiles)</label>
              <select value={form.categorie_etoiles ?? 3} onChange={(e) => setForm({ ...form, categorie_etoiles: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{etoiles(n)} ({n})</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Téléphone</label>
              <input value={form.telephone || ""} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </div>
            <div className="form-field">
              <label>E-mail</label>
              <input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Contact réservation</label>
              <input
                value={form.contact_reservation || ""}
                onChange={(e) => setForm({ ...form, contact_reservation: e.target.value })}
                placeholder="Nom / téléphone du référent réservation"
              />
            </div>
            <div className="form-field">
              <label>Adresse</label>
              <input value={form.adresse || ""} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
            </div>
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Observations</label>
              <textarea
                rows={2}
                value={form.observations || ""}
                onChange={(e) => setForm({ ...form, observations: e.target.value })}
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
