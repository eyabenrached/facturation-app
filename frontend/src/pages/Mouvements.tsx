import { useEffect, useState } from "react";
import { api } from "../api";
import { Mouvement, Client, Circuit, Chauffeur, Vehicule, Agence } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { RecapTransporteurs } from "../components/RecapTransporteurs";
import { useAuth } from "../auth/AuthContext";

const LISTE_PRIX = [70, 80, 90, 100, 110, 120, 125, 130, 135, 150, 160, 180];

const VIDE_MOUVEMENT = {
  date: "",
  heure: "",
  client_id: 0,
  circuit_id: 0,
  chauffeur_id: null as number | null,
  vehicule_id: null as number | null,
  transporteur_id: null as number | null,
  nb_personnes: null as number | null,
};

export default function Mouvements() {
  useAuth();

  // Référentiels
  const [clients, setClients] = useState<Client[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);

  // Filtres
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [filtreClient, setFiltreClient] = useState("");
  const [filtreStatutMvt, setFiltreStatutMvt] = useState("");
  const [filtreHeure, setFiltreHeure] = useState("");
  const [filtreTransporteur, setFiltreTransporteur] = useState("");
  const [filtreChauffeur, setFiltreChauffeur] = useState("");

  const [mouvements, setMouvements] = useState<Mouvement[]>([]);

  // Modal ajout mouvement
  const [modalMvtOuvert, setModalMvtOuvert] = useState(false);
  const [mouvementEnEdition, setMouvementEnEdition] = useState<Mouvement | null>(null);
  const [formMvt, setFormMvt] = useState(VIDE_MOUVEMENT);
  const [prixSuggere, setPrixSuggere] = useState<number | null>(null);
  const [erreurMvt, setErreurMvt] = useState("");

  useEffect(() => {
    api.get<Client[]>("/clients/").then(setClients);
    api.get<Circuit[]>("/circuits/").then((data) =>
      setCircuits(
        [...data].sort((a, b) =>
          `${a.point_depart} ${a.point_arrivee}`.localeCompare(`${b.point_depart} ${b.point_arrivee}`, "fr", { sensitivity: "base" })
        )
      )
    );
    api.get<Chauffeur[]>("/chauffeurs/").then((data) =>
      setChauffeurs(
        [...data].sort((a, b) =>
          a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" })
        )
      )
    );
    api.get<Vehicule[]>("/vehicules/").then(setVehicules);
    api.get<Agence[]>("/agences/").then(setAgences);
  }, []);

  async function chargerMouvements() {
    const params = new URLSearchParams();
    if (dateDu) params.set("date_du", dateDu);
    if (dateAu) params.set("date_au", dateAu);
    if (filtreClient) params.set("client_id", filtreClient);
    if (filtreStatutMvt) params.set("statut", filtreStatutMvt);
    if (filtreHeure) params.set("heure", filtreHeure);
    if (filtreTransporteur) params.set("transporteur_id", filtreTransporteur);
    if (filtreChauffeur) params.set("chauffeur_id", filtreChauffeur);
    setMouvements(await api.get<Mouvement[]>(`/mouvements/?${params.toString()}`));
  }

  useEffect(() => {
    chargerMouvements();
  }, [dateDu, dateAu, filtreClient, filtreStatutMvt, filtreHeure, filtreTransporteur, filtreChauffeur]);

  // ---------- Ajout d'un mouvement ----------
  function ouvrirAjoutMouvement() {
    setMouvementEnEdition(null);
    setFormMvt(VIDE_MOUVEMENT);
    setPrixSuggere(null);
    setErreurMvt("");
    setModalMvtOuvert(true);
  }

  function ouvrirEditionMouvement(m: Mouvement) {
    setMouvementEnEdition(m);
    setFormMvt({
      date: m.date,
      heure: m.heure,
      client_id: m.client_id,
      circuit_id: m.circuit_id,
      chauffeur_id: m.chauffeur_id,
      vehicule_id: m.vehicule_id,
      transporteur_id: m.transporteur_id,
      nb_personnes: m.nb_personnes,
    });
    setPrixSuggere(m.prix_applique);
    setErreurMvt("");
    setModalMvtOuvert(true);
  }

  function dupliquerMouvement(m: Mouvement) {
    // Toujours en mode "création" : même en partant d'un mouvement déjà
    // facturé, la copie créée est un nouveau mouvement non facturé.
    setMouvementEnEdition(null);
    setFormMvt({
      date: m.date,
      heure: m.heure,
      client_id: m.client_id,
      circuit_id: m.circuit_id,
      chauffeur_id: m.chauffeur_id,
      vehicule_id: m.vehicule_id,
      transporteur_id: m.transporteur_id,
      nb_personnes: m.nb_personnes,
    });
    setPrixSuggere(m.prix_applique);
    setErreurMvt("");
    setModalMvtOuvert(true);
  }

  function majFormMvt(champs: Partial<typeof formMvt>) {
    setFormMvt({ ...formMvt, ...champs });
  }

  async function enregistrerMouvement() {
    setErreurMvt("");
    if (prixSuggere === null) {
      setErreurMvt("Veuillez sélectionner un prix dans la liste avant d'enregistrer.");
      return;
    }
    try {
      if (mouvementEnEdition) {
        await api.put(`/mouvements/${mouvementEnEdition.id}`, { ...formMvt, prix_applique: prixSuggere });
      } else {
        await api.post("/mouvements/", { ...formMvt, prix_applique: prixSuggere });
      }
      setModalMvtOuvert(false);
      chargerMouvements();
    } catch (e) {
      setErreurMvt((e as Error).message);
    }
  }

  async function supprimerMouvement(m: Mouvement) {
    if (!confirm("Supprimer ce mouvement ?")) return;
    try {
      await api.delete(`/mouvements/${m.id}`);
      chargerMouvements();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Mouvements</h2>
        <button className="btn" onClick={ouvrirAjoutMouvement}>+ Ajouter un mouvement</button>
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
          <label>Client</label>
          <select value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)}>
            <option value="">Tous les clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.nom_societe}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Statut</label>
          <select value={filtreStatutMvt} onChange={(e) => setFiltreStatutMvt(e.target.value)}>
            <option value="">Tous</option>
            <option value="non_facture">Non facturés</option>
            <option value="facture">Déjà facturés</option>
          </select>
        </div>
        <div className="form-field">
          <label>Heure</label>
          <input type="time" value={filtreHeure} onChange={(e) => setFiltreHeure(e.target.value)} />
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
        <div className="form-field">
          <label>Chauffeur</label>
          <select value={filtreChauffeur} onChange={(e) => setFiltreChauffeur(e.target.value)}>
            <option value="">Tous les chauffeurs</option>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
            ))}
          </select>
        </div>
      </div>

      <RecapTransporteurs endpoint="/mouvements/recap-transporteurs" dateDu={dateDu} dateAu={dateAu} />

      <DataTable<Mouvement>
        rows={mouvements}
        columns={[
          { header: "Date", render: (m) => m.date },
          { header: "Heure", render: (m) => m.heure },
          { header: "Client", render: (m) => m.client?.nom_societe || "—" },
          { header: "Circuit", render: (m) => (m.circuit ? `${m.circuit.point_depart} → ${m.circuit.point_arrivee}` : "—") },
          { header: "Transporteur", render: (m) => m.transporteur?.nom_agence || "—" },
          { header: "Chauffeur", render: (m) => (m.chauffeur ? `${m.chauffeur.prenom} ${m.chauffeur.nom}` : "—") },
          { header: "Véhicule", render: (m) => m.vehicule?.matricule || "—" },
          { header: "Nb pers.", render: (m) => m.nb_personnes ?? "—" },
          { header: "Prix", render: (m: Mouvement) => `${m.prix_applique} TND` },
          { header: "Statut", render: (m) => (m.facture_id ? "Facturé" : "Non facturé") },
          {
            header: "Actions",
            render: (m) => (
              <>
                <button className="btn-link" onClick={() => dupliquerMouvement(m)}>Dupliquer</button>
                {!m.facture_id && (
                  <>
                    <button className="btn-link" onClick={() => ouvrirEditionMouvement(m)}>Modifier</button>
                    <button className="btn-link" onClick={() => supprimerMouvement(m)}>Supprimer</button>
                  </>
                )}
              </>
            ),
          },
        ]}
      />

      {/* Modal : ajout d'un mouvement */}
      {modalMvtOuvert && (
        <Modal title={mouvementEnEdition ? "Modifier le mouvement" : "Nouveau mouvement"} onClose={() => setModalMvtOuvert(false)}>
          {erreurMvt && <p className="error-msg">{erreurMvt}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={formMvt.date} onChange={(e) => majFormMvt({ date: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Heure</label>
              <input type="time" value={formMvt.heure} onChange={(e) => majFormMvt({ heure: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Client (sélection)</label>
              <select value={formMvt.client_id || ""} onChange={(e) => majFormMvt({ client_id: Number(e.target.value) })}>
                <option value="">— Sélectionner —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom_societe}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Circuit / destination (sélection)</label>
              <select value={formMvt.circuit_id || ""} onChange={(e) => majFormMvt({ circuit_id: Number(e.target.value) })}>
                <option value="">— Sélectionner —</option>
                {circuits.map((c) => <option key={c.id} value={c.id}>{c.point_depart} → {c.point_arrivee}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Transporteur (optionnel)</label>
              <select value={formMvt.transporteur_id || ""} onChange={(e) => setFormMvt({ ...formMvt, transporteur_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {agences.map((a) => <option key={a.id} value={a.id}>{a.nom_agence}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Chauffeur (optionnel)</label>
              <select value={formMvt.chauffeur_id || ""} onChange={(e) => majFormMvt({ chauffeur_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {chauffeurs.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Véhicule (optionnel)</label>
              <select value={formMvt.vehicule_id || ""} onChange={(e) => majFormMvt({ vehicule_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {vehicules.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.matricule} ({v.type_vehicule})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Nombre de personnes (optionnel)</label>
              <input
                type="number"
                min={0}
                value={formMvt.nb_personnes ?? ""}
                onChange={(e) => setFormMvt({ ...formMvt, nb_personnes: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>
          <div className="form-field" style={{ marginBottom: "1rem" }}>
            <label>Prix *</label>
            <select
              value={prixSuggere !== null ? prixSuggere : ""}
              onChange={(e) => setPrixSuggere(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Sélectionner —</option>
              {LISTE_PRIX.map((p) => (
                <option key={p} value={p}>{p} TND</option>
              ))}
              {prixSuggere !== null && !LISTE_PRIX.includes(prixSuggere) && (
                <option value={prixSuggere}>{prixSuggere} TND</option>
              )}
            </select>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalMvtOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrerMouvement}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}