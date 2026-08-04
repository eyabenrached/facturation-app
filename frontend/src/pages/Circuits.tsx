import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import { Circuit, Client, TarifClient, TypeVehicule, LABELS_TYPE_VEHICULE } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const VIDE: Omit<Circuit, "id"> = {
  point_depart: "",
  point_arrivee: "",
  prix_jour: 0,
  prix_nuit: 0,
};

const TYPES_VEHICULE: TypeVehicule[] = ["mini_bus", "quatre_quatre", "microbus", "bus"];

const VIDE_TARIF = {
  client_id: 0,
  type_vehicule: "" as TypeVehicule | "",
  heure_debut: "",
  heure_fin: "",
  prix: 0,
};

export default function Circuits() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [liste, setListe] = useState<Circuit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Circuit | null>(null);
  const [form, setForm] = useState(VIDE);
  const [erreur, setErreur] = useState("");
  const [rechercheTexte, setRechercheTexte] = useState<string>("");

  // ---------- Tarifs spécifiques (client + circuit + heure) ----------
  const [circuitTarifs, setCircuitTarifs] = useState<Circuit | null>(null);
  const [tarifs, setTarifs] = useState<TarifClient[]>([]);
  const [formTarif, setFormTarif] = useState(VIDE_TARIF);
  const [erreurTarif, setErreurTarif] = useState("");
  
  // Nouveaux états pour la modification d'un tarif
  const [tarifEnEdition, setTarifEnEdition] = useState<TarifClient | null>(null);
  const [modalTarifOuvert, setModalTarifOuvert] = useState(false);

  async function charger() {
    setListe(await api.get<Circuit[]>("/circuits/"));
  }

  useEffect(() => {
    charger();
    api.get<Client[]>("/clients/").then(setClients);
  }, []);

  // Filtrage côté client sur départ, arrivée et prix
  const listeFiltree = useMemo(() => {
    const terme = rechercheTexte.trim().toLowerCase();
    if (!terme) return liste;
    return liste.filter((c) =>
      c.point_depart.toLowerCase().includes(terme) ||
      c.point_arrivee.toLowerCase().includes(terme) ||
      String(c.prix_jour).includes(terme) ||
      String(c.prix_nuit).includes(terme)
    );
  }, [liste, rechercheTexte]);

  function ouvrirAjout() {
    setEnEdition(null);
    setForm(VIDE);
    setErreur("");
    setModalOuvert(true);
  }

  function ouvrirEdition(c: Circuit) {
    setEnEdition(c);
    setForm({ ...c });
    setErreur("");
    setModalOuvert(true);
  }

  async function enregistrer() {
    setErreur("");
    try {
      if (enEdition) {
        await api.put(`/circuits/${enEdition.id}`, form);
      } else {
        await api.post(`/circuits/`, form);
      }
      setModalOuvert(false);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(c: Circuit) {
    if (!confirm(`Supprimer le circuit ${c.point_depart} → ${c.point_arrivee} ?`)) return;
    try {
      await api.delete(`/circuits/${c.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function ouvrirTarifs(c: Circuit) {
    setCircuitTarifs(c);
    setFormTarif(VIDE_TARIF);
    setErreurTarif("");
    setTarifs(await api.get<TarifClient[]>(`/circuits/tarifs/?circuit_id=${c.id}`));
  }

  async function ajouterTarif() {
    if (!circuitTarifs) return;
    setErreurTarif("");
    if (!formTarif.client_id) {
      setErreurTarif("Merci de sélectionner un client.");
      return;
    }
    try {
      await api.post("/circuits/tarifs/", {
        client_id: formTarif.client_id,
        circuit_id: circuitTarifs.id,
        type_vehicule: formTarif.type_vehicule || null,
        heure_debut: formTarif.heure_debut || null,
        heure_fin: formTarif.heure_fin || null,
        prix: formTarif.prix,
      });
      setFormTarif(VIDE_TARIF);
      setTarifs(await api.get<TarifClient[]>(`/circuits/tarifs/?circuit_id=${circuitTarifs.id}`));
    } catch (e) {
      setErreurTarif((e as Error).message);
    }
  }

  async function supprimerTarif(t: TarifClient) {
    if (!confirm("Supprimer ce tarif spécifique ?")) return;
    await api.delete(`/circuits/tarifs/${t.id}`);
    if (circuitTarifs) {
      setTarifs(await api.get<TarifClient[]>(`/circuits/tarifs/?circuit_id=${circuitTarifs.id}`));
    }
  }

  // Nouvelle fonction pour ouvrir la modification d'un tarif
  function ouvrirEditionTarif(t: TarifClient) {
    setTarifEnEdition(t);
    setFormTarif({
      client_id: t.client_id,
      type_vehicule: t.type_vehicule || "",
      heure_debut: t.heure_debut || "",
      heure_fin: t.heure_fin || "",
      prix: t.prix,
    });
    setErreurTarif("");
    setModalTarifOuvert(true);
  }

  // Nouvelle fonction pour enregistrer la modification d'un tarif
  async function enregistrerTarif() {
    if (!tarifEnEdition || !circuitTarifs) return;
    setErreurTarif("");
    if (!formTarif.client_id) {
      setErreurTarif("Merci de sélectionner un client.");
      return;
    }
    try {
      await api.put(`/circuits/tarifs/${tarifEnEdition.id}`, {
        client_id: formTarif.client_id,
        circuit_id: circuitTarifs.id,
        type_vehicule: formTarif.type_vehicule || null,
        heure_debut: formTarif.heure_debut || null,
        heure_fin: formTarif.heure_fin || null,
        prix: formTarif.prix,
      });
      setModalTarifOuvert(false);
      setTarifEnEdition(null);
      setFormTarif(VIDE_TARIF);
      setTarifs(await api.get<TarifClient[]>(`/circuits/tarifs/?circuit_id=${circuitTarifs.id}`));
    } catch (e) {
      setErreurTarif((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Circuits</h2>
        {estAdmin && <button className="btn" onClick={ouvrirAjout}>+ Ajouter un circuit</button>}
      </div>

      {/* Barre de recherche */}
      <div className="toolbar">
        <input
          type="search"
          placeholder="Rechercher par départ, arrivée ou prix..."
          value={rechercheTexte}
          onChange={(e) => setRechercheTexte(e.target.value)}
          style={{ flex: 1, minWidth: "200px" }}
        />
      </div>

      <DataTable<Circuit>
        rows={listeFiltree}
        columns={[
          { header: "Départ", render: (c) => c.point_depart },
          { header: "Arrivée", render: (c) => c.point_arrivee },
          { header: "Prix jour (06h-19h)", render: (c) => `${c.prix_jour} TND` },
          { header: "Prix nuit", render: (c) => `${c.prix_nuit} TND` },
          {
            header: "Actions",
            render: (c) => (
              <>
                {estAdmin && <button className="btn-link" onClick={() => ouvrirEdition(c)}>Modifier</button>}
                <button className="btn-link" onClick={() => ouvrirTarifs(c)}>Tarifs clients</button>
                {estAdmin && <button className="btn-link" onClick={() => supprimer(c)}>Supprimer</button>}
              </>
            ),
          },
        ]}
      />

      {modalOuvert && estAdmin && (
        <Modal title={enEdition ? "Modifier le circuit" : "Nouveau circuit"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>Point de départ</label>
            <input
              placeholder="ex. Borj Chekir"
              value={form.point_depart}
              onChange={(e) => setForm({ ...form, point_depart: e.target.value })}
            />
          </div>
          <div className="form-field" style={{ marginBottom: "0.9rem" }}>
            <label>Point d'arrivée</label>
            <input
              placeholder="ex. Zi Kram"
              value={form.point_arrivee}
              onChange={(e) => setForm({ ...form, point_arrivee: e.target.value })}
            />
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Prix de jour (06h–19h)</label>
              <input
                type="number"
                step="0.001"
                value={form.prix_jour}
                onChange={(e) => setForm({ ...form, prix_jour: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Prix de nuit</label>
              <input
                type="number"
                step="0.001"
                value={form.prix_nuit}
                onChange={(e) => setForm({ ...form, prix_nuit: Number(e.target.value) })}
              />
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "#6b7280" }}>
            Astuce : pour un tarif spécifique à un client précis, utilisez le bouton
            « Tarifs clients » depuis la liste des circuits (une fois ce circuit enregistré).
          </p>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrer}>Enregistrer</button>
          </div>
        </Modal>
      )}

      {circuitTarifs && (
        <Modal
          title={`Tarifs spécifiques — ${circuitTarifs.point_depart} → ${circuitTarifs.point_arrivee}`}
          onClose={() => setCircuitTarifs(null)}
        >
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 0 }}>
            Définissez ici un prix particulier pour un client donné, valable sur tout le circuit
            ou seulement sur un créneau horaire précis. Ce tarif remplace le prix standard
            (jour/nuit) du circuit lors du calcul automatique.
          </p>

          {erreurTarif && <p className="error-msg">{erreurTarif}</p>}

          <table className="data-table" style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Type véhicule</th>
                <th>Créneau horaire</th>
                <th>Prix</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tarifs.length === 0 ? (
                <tr><td colSpan={5} className="empty-cell">Aucun tarif spécifique pour ce circuit.</td></tr>
              ) : (
                tarifs.map((t) => (
                  <tr key={t.id}>
                    <td>{clients.find((c) => c.id === t.client_id)?.nom_societe || t.client_id}</td>
                    <td>{t.type_vehicule ? LABELS_TYPE_VEHICULE[t.type_vehicule] : "Tous types"}</td>
                    <td>{t.heure_debut && t.heure_fin ? `${t.heure_debut} – ${t.heure_fin}` : "Toute heure"}</td>
                    <td>{t.prix} TND</td>
                    <td>
                      {estAdmin && (
                        <>
                          <button className="btn-link" onClick={() => ouvrirEditionTarif(t)}>Modifier</button>
                          <button className="btn-link" onClick={() => supprimerTarif(t)}>Supprimer</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {estAdmin && (
            <>
              <h4 style={{ marginBottom: "0.5rem", color: "#1f3864" }}>Ajouter un tarif</h4>
              <div className="form-grid">
                <div className="form-field">
                  <label>Client</label>
                  <select
                    value={formTarif.client_id || ""}
                    onChange={(e) => setFormTarif({ ...formTarif, client_id: Number(e.target.value) })}
                  >
                    <option value="">— Sélectionner —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.nom_societe}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Type de véhicule (optionnel)</label>
                  <select
                    value={formTarif.type_vehicule}
                    onChange={(e) => setFormTarif({ ...formTarif, type_vehicule: e.target.value as TypeVehicule | "" })}
                  >
                    <option value="">Tous types</option>
                    {TYPES_VEHICULE.map((t) => (
                      <option key={t} value={t}>{LABELS_TYPE_VEHICULE[t]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Prix spécifique (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formTarif.prix}
                    onChange={(e) => setFormTarif({ ...formTarif, prix: Number(e.target.value) })}
                  />
                </div>
                <div className="form-field">
                  <label>Heure début (optionnel)</label>
                  <input
                    type="time"
                    value={formTarif.heure_debut}
                    onChange={(e) => setFormTarif({ ...formTarif, heure_debut: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Heure fin (optionnel)</label>
                  <input
                    type="time"
                    value={formTarif.heure_fin}
                    onChange={(e) => setFormTarif({ ...formTarif, heure_fin: e.target.value })}
                  />
                </div>
              </div>
              <p style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                Laissez les heures vides pour un tarif valable à toute heure pour ce client.
              </p>
            </>
          )}
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setCircuitTarifs(null)}>Fermer</button>
            {estAdmin && <button className="btn" onClick={ajouterTarif}>+ Ajouter ce tarif</button>}
          </div>
        </Modal>
      )}

      {/* Modal de modification d'un tarif */}
      {modalTarifOuvert && tarifEnEdition && (
        <Modal
          title={`Modifier le tarif — ${clients.find(c => c.id === tarifEnEdition.client_id)?.nom_societe || "Client"}`}
          onClose={() => {
            setModalTarifOuvert(false);
            setTarifEnEdition(null);
            setFormTarif(VIDE_TARIF);
          }}
        >
          {erreurTarif && <p className="error-msg">{erreurTarif}</p>}
          
          <div className="form-grid">
            <div className="form-field">
              <label>Client</label>
              <select
                value={formTarif.client_id || ""}
                onChange={(e) => setFormTarif({ ...formTarif, client_id: Number(e.target.value) })}
              >
                <option value="">— Sélectionner —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom_societe}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Type de véhicule (optionnel)</label>
              <select
                value={formTarif.type_vehicule}
                onChange={(e) => setFormTarif({ ...formTarif, type_vehicule: e.target.value as TypeVehicule | "" })}
              >
                <option value="">Tous types</option>
                {TYPES_VEHICULE.map((t) => (
                  <option key={t} value={t}>{LABELS_TYPE_VEHICULE[t]}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Prix spécifique (TND)</label>
              <input
                type="number"
                step="0.001"
                value={formTarif.prix}
                onChange={(e) => setFormTarif({ ...formTarif, prix: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Heure début (optionnel)</label>
              <input
                type="time"
                value={formTarif.heure_debut}
                onChange={(e) => setFormTarif({ ...formTarif, heure_debut: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Heure fin (optionnel)</label>
              <input
                type="time"
                value={formTarif.heure_fin}
                onChange={(e) => setFormTarif({ ...formTarif, heure_fin: e.target.value })}
              />
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.5rem" }}>
            Laissez les heures vides pour un tarif valable à toute heure pour ce client.
          </p>
          
          <div className="form-actions">
            <button 
              className="btn secondary" 
              onClick={() => {
                setModalTarifOuvert(false);
                setTarifEnEdition(null);
                setFormTarif(VIDE_TARIF);
              }}
            >
              Annuler
            </button>
            <button className="btn" onClick={enregistrerTarif}>Enregistrer les modifications</button>
          </div>
        </Modal>
      )}
    </div>
  );
}