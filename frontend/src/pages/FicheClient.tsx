import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, pdfUrl } from "../api";
import { ClientFiche, StatutFacture, LABELS_TYPE_VEHICULE, Circuit, TarifClient, TypeVehicule, Client } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";

const TYPES_VEHICULE: TypeVehicule[] = ["mini_bus", "quatre_quatre", "microbus", "bus"];

const VIDE_TARIF = {
  circuit_id: 0,
  type_vehicule: "" as TypeVehicule | "",
  heure: "",
  prix: 0,
};

function badgeStatut(s: StatutFacture) {
  const label = s === "payee" ? "Payée" : s === "impayee" ? "Impayée" : "Partielle";
  return <span className={`badge ${s}`}>{label}</span>;
}

function formatMontant(v: number) {
  return `${v.toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
}

export default function FicheClient() {
  const { id } = useParams<{ id: string }>();
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";
  const [fiche, setFiche] = useState<ClientFiche | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  // ---------- Modification des informations client ----------
  const [modalClientOuvert, setModalClientOuvert] = useState(false);
  const [formClient, setFormClient] = useState<Omit<Client, "id"> | null>(null);
  const [erreurClient, setErreurClient] = useState("");

  // ---------- Tarifs spécifiques (ajout / modification) ----------
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [modalTarifOuvert, setModalTarifOuvert] = useState(false);
  const [tarifEnEdition, setTarifEnEdition] = useState<TarifClient | null>(null);
  const [formTarif, setFormTarif] = useState(VIDE_TARIF);
  const [erreurTarif, setErreurTarif] = useState("");

  async function charger() {
    if (!id) return;
    setChargement(true);
    setErreur("");
    try {
      setFiche(await api.get<ClientFiche>(`/clients/${id}/fiche`));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    api.get<Circuit[]>("/circuits/").then(setCircuits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function circuitLabel(circuitId: number) {
    const c = circuits.find((x) => x.id === circuitId);
    return c ? `${c.point_depart} → ${c.point_arrivee}` : `#${circuitId}`;
  }

  // ---------- Client ----------
  function ouvrirEditionClient() {
    if (!fiche) return;
    const { id: _id, ...reste } = fiche.client;
    setFormClient(reste);
    setErreurClient("");
    setModalClientOuvert(true);
  }

  async function enregistrerClient() {
    if (!fiche || !formClient) return;
    setErreurClient("");
    try {
      await api.put(`/clients/${fiche.client.id}`, formClient);
      setModalClientOuvert(false);
      charger();
    } catch (e) {
      setErreurClient((e as Error).message);
    }
  }

  // ---------- Tarifs spécifiques ----------
  function ouvrirAjoutTarif() {
    setTarifEnEdition(null);
    setFormTarif(VIDE_TARIF);
    setErreurTarif("");
    setModalTarifOuvert(true);
  }

  function ouvrirEditionTarif(t: TarifClient) {
    setTarifEnEdition(t);
    setFormTarif({
      circuit_id: t.circuit_id,
      type_vehicule: t.type_vehicule || "",
      heure: t.heure_debut || "",
      prix: t.prix,
    });
    setErreurTarif("");
    setModalTarifOuvert(true);
  }

  async function enregistrerTarif() {
    if (!fiche) return;
    setErreurTarif("");
    if (!formTarif.circuit_id) {
      setErreurTarif("Merci de sélectionner un circuit.");
      return;
    }
    const payload = {
      client_id: fiche.client.id,
      circuit_id: formTarif.circuit_id,
      type_vehicule: formTarif.type_vehicule || null,
      heure_debut: formTarif.heure || null,
      heure_fin: formTarif.heure || null,
      prix: formTarif.prix,
    };
    try {
      if (tarifEnEdition) {
        await api.put(`/circuits/tarifs/${tarifEnEdition.id}`, payload);
      } else {
        await api.post("/circuits/tarifs/", payload);
      }
      setModalTarifOuvert(false);
      setTarifEnEdition(null);
      setFormTarif(VIDE_TARIF);
      charger();
    } catch (e) {
      setErreurTarif((e as Error).message);
    }
  }

  async function supprimerTarif(t: TarifClient) {
    if (!confirm("Supprimer ce tarif spécifique ?")) return;
    try {
      await api.delete(`/circuits/tarifs/${t.id}`);
      charger();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (chargement) return <p>Chargement…</p>;
  if (erreur) return <p className="error-msg">{erreur}</p>;
  if (!fiche) return null;

  const { client, tarifs, mouvements, factures } = fiche;

  return (
    <div>
      <div className="page-header">
        <div>
          <p style={{ margin: 0 }}>
            <Link to="/clients">← Retour aux clients</Link>
          </p>
          <h2 style={{ marginTop: "0.3rem" }}>{client.nom_societe}</h2>
        </div>
        {estAdmin && (
          <button className="btn secondary" onClick={ouvrirEditionClient}>Modifier</button>
        )}
      </div>

      {/* ---------- Informations générales + chiffre d'affaires ---------- */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div className="card" style={{ flex: "1 1 200px", minWidth: "200px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>Responsable</p>
          <p style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>{client.responsable || "—"}</p>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.3rem 0 0" }}>
            {client.telephone} {client.email && `· ${client.email}`}
          </p>
        </div>
        <div className="card" style={{ flex: "1 1 160px", minWidth: "160px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>Nombre de navettes</p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "1.4rem", fontWeight: 700 }}>{fiche.nb_mouvements}</p>
        </div>
        <div className="card" style={{ flex: "1 1 200px", minWidth: "200px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>CA facturé (TTC)</p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "1.3rem", fontWeight: 700 }}>{formatMontant(fiche.chiffre_affaires_facture)}</p>
        </div>
        <div className="card" style={{ flex: "1 1 200px", minWidth: "200px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>CA encaissé</p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "1.3rem", fontWeight: 700, color: "#15803d" }}>{formatMontant(fiche.chiffre_affaires_encaisse)}</p>
        </div>
        <div className="card" style={{ flex: "1 1 200px", minWidth: "200px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>CA impayé</p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "1.3rem", fontWeight: 700, color: "#b91c1c" }}>{formatMontant(fiche.chiffre_affaires_impaye)}</p>
        </div>
      </div>

      {/* ---------- Tarifs spécifiques ---------- */}
      <div className="page-header" style={{ marginTop: "0" }}>
        <h3 style={{ margin: 0 }}>Tarifs spécifiques</h3>
        {estAdmin && (
          <button className="btn" onClick={ouvrirAjoutTarif}>+ Ajouter un tarif</button>
        )}
      </div>
      <DataTable
        rows={tarifs}
        emptyMessage="Aucun tarif spécifique pour ce client."
        columns={[
          { header: "Circuit", render: (t) => (t.circuit ? `${t.circuit.point_depart} → ${t.circuit.point_arrivee}` : "—") },
          { header: "Type véhicule", render: (t) => (t.type_vehicule ? LABELS_TYPE_VEHICULE[t.type_vehicule] : "Tous types") },
          { header: "Heure", render: (t) => (t.heure_debut ? t.heure_debut : "Toute heure") },
          { header: "Prix", render: (t) => formatMontant(t.prix) },
          ...(estAdmin
            ? [
                {
                  header: "",
                  render: (t: TarifClient) => (
                    <>
                      <button className="btn-link" onClick={() => ouvrirEditionTarif(t)}>Modifier</button>
                      <button className="btn-link" onClick={() => supprimerTarif(t)}>Supprimer</button>
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />

      {/* ---------- Factures ---------- */}
      <h3 style={{ marginTop: "2rem" }}>Factures</h3>
      <DataTable
        rows={factures}
        emptyMessage="Aucune facture pour ce client."
        columns={[
          { header: "N°", render: (f) => f.numero_facture },
          { header: "Période", render: (f) => `${f.date_debut} → ${f.date_fin}` },
          { header: "Montant TTC", render: (f) => formatMontant(f.montant_ttc) },
          { header: "Statut", render: (f) => badgeStatut(f.statut) },
          {
            header: "",
            render: (f) => (
              <a className="btn-link" href={pdfUrl(f.id)} target="_blank" rel="noreferrer">
                PDF
              </a>
            ),
          },
        ]}
      />

      {/* ---------- Historique des mouvements ---------- */}
      <h3 style={{ marginTop: "2rem" }}>Historique des navettes</h3>
      <DataTable
        rows={mouvements}
        emptyMessage="Aucune navette pour ce client."
        columns={[
          { header: "Date", render: (m) => m.date },
          { header: "Heure", render: (m) => m.heure },
          { header: "Circuit", render: (m) => (m.circuit ? `${m.circuit.point_depart} → ${m.circuit.point_arrivee}` : "—") },
          { header: "Chauffeur", render: (m) => (m.chauffeur ? `${m.chauffeur.prenom} ${m.chauffeur.nom}` : "—") },
          { header: "Véhicule", render: (m) => m.vehicule?.matricule || "—" },
          { header: "Prix", render: (m) => formatMontant(m.prix_applique) },
          { header: "Facturé", render: (m) => (m.facture_id ? "Oui" : "Non") },
        ]}
      />

      {/* ---------- Modale : modification des informations client ---------- */}
      {modalClientOuvert && formClient && (
        <Modal title="Modifier le client" onClose={() => setModalClientOuvert(false)}>
          {erreurClient && <p className="error-msg">{erreurClient}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de la société</label>
              <input
                value={formClient.nom_societe}
                onChange={(e) => setFormClient({ ...formClient, nom_societe: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Responsable</label>
              <input
                value={formClient.responsable}
                onChange={(e) => setFormClient({ ...formClient, responsable: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Téléphone</label>
              <input
                value={formClient.telephone}
                onChange={(e) => setFormClient({ ...formClient, telephone: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Adresse e-mail</label>
              <input
                type="email"
                value={formClient.email}
                onChange={(e) => setFormClient({ ...formClient, email: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Adresse</label>
              <input
                value={formClient.adresse ?? ""}
                onChange={(e) => setFormClient({ ...formClient, adresse: e.target.value })}
                placeholder="Ex : 45, Rue de la République, 1002 Tunis"
              />
            </div>
            <div className="form-field">
              <label>Matricule fiscal</label>
              <input
                value={formClient.matricule_fiscal ?? ""}
                onChange={(e) => setFormClient({ ...formClient, matricule_fiscal: e.target.value })}
                placeholder="Ex : 9876543/A/M/000"
              />
            </div>
            <div className="form-field">
              <label>Taux TVA (%)</label>
              <input
                type="number"
                value={formClient.taux_tva}
                onChange={(e) => setFormClient({ ...formClient, taux_tva: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Remise (%)</label>
              <input
                type="number"
                value={formClient.remise}
                onChange={(e) => setFormClient({ ...formClient, remise: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalClientOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrerClient}>Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* ---------- Modale : ajout / modification d'un tarif spécifique ---------- */}
      {modalTarifOuvert && (
        <Modal
          title={tarifEnEdition ? "Modifier le tarif" : "Ajouter un tarif spécifique"}
          onClose={() => {
            setModalTarifOuvert(false);
            setTarifEnEdition(null);
            setFormTarif(VIDE_TARIF);
          }}
        >
          {erreurTarif && <p className="error-msg">{erreurTarif}</p>}

          {tarifEnEdition && (
            <p style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 0 }}>
              Circuit actuel : {circuitLabel(tarifEnEdition.circuit_id)}
            </p>
          )}

          <div className="form-grid">
            <div className="form-field">
              <label>Circuit</label>
              <select
                value={formTarif.circuit_id || ""}
                onChange={(e) => setFormTarif({ ...formTarif, circuit_id: Number(e.target.value) })}
              >
                <option value="">— Sélectionner —</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>{c.point_depart} → {c.point_arrivee}</option>
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
              <label>Heure (optionnel)</label>
              <input
                type="time"
                value={formTarif.heure}
                onChange={(e) => setFormTarif({ ...formTarif, heure: e.target.value })}
              />
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "#6b7280" }}>
            Laissez l'heure vide pour un tarif valable à toute heure pour ce client.
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
            <button className="btn" onClick={enregistrerTarif}>
              {tarifEnEdition ? "Enregistrer les modifications" : "+ Ajouter ce tarif"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}