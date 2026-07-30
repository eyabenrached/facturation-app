import { useEffect, useState } from "react";
import { api, pdfUrl } from "../api";
import { Mouvement, Client, Circuit, Chauffeur, Vehicule, Facture, StatutFacture, LABELS_TYPE_VEHICULE } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";

const VIDE_MOUVEMENT = {
  date: "",
  heure: "",
  client_id: 0,
  circuit_id: 0,
  chauffeur_id: null as number | null,
  vehicule_id: null as number | null,
  nb_personnes: null as number | null,
};

function badgeStatut(s: StatutFacture) {
  const label = s === "payee" ? "Payée" : s === "impayee" ? "Impayée" : "Partielle";
  return <span className={`badge ${s}`}>{label}</span>;
}

export default function MouvementsFacturation() {
  // Référentiels
  const [clients, setClients] = useState<Client[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);

  // Filtres
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [filtreClient, setFiltreClient] = useState("");
  const [filtreStatutMvt, setFiltreStatutMvt] = useState("");

  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);

  // Modal ajout mouvement
  const [modalMvtOuvert, setModalMvtOuvert] = useState(false);
  const [mouvementEnEdition, setMouvementEnEdition] = useState<Mouvement | null>(null);
  const [formMvt, setFormMvt] = useState(VIDE_MOUVEMENT);
  const [prixSuggere, setPrixSuggere] = useState<number | null>(null);
  const [erreurMvt, setErreurMvt] = useState("");

  // Modal génération facture
  const [modalFactureOuvert, setModalFactureOuvert] = useState(false);
  const [numeroFacture, setNumeroFacture] = useState("");
  const [erreurFacture, setErreurFacture] = useState("");

  useEffect(() => {
    api.get<Client[]>("/clients/").then(setClients);
    api.get<Circuit[]>("/circuits/").then(setCircuits);
    api.get<Chauffeur[]>("/chauffeurs/").then(setChauffeurs);
    api.get<Vehicule[]>("/vehicules/").then(setVehicules);
  }, []);

  async function chargerMouvements() {
    const params = new URLSearchParams();
    if (dateDu) params.set("date_du", dateDu);
    if (dateAu) params.set("date_au", dateAu);
    if (filtreClient) params.set("client_id", filtreClient);
    if (filtreStatutMvt) params.set("statut", filtreStatutMvt);
    setMouvements(await api.get<Mouvement[]>(`/mouvements/?${params.toString()}`));
  }

  async function chargerFactures() {
    const params = new URLSearchParams();
    if (filtreClient) params.set("client_id", filtreClient);
    setFactures(await api.get<Facture[]>(`/factures/?${params.toString()}`));
  }

  useEffect(() => {
    chargerMouvements();
    chargerFactures();
  }, [dateDu, dateAu, filtreClient, filtreStatutMvt]);

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
      nb_personnes: m.nb_personnes,
    });
    setPrixSuggere(m.prix_applique);
    setErreurMvt("");
    setModalMvtOuvert(true);
  }

  async function rafraichirPrixSuggere(next: typeof formMvt) {
    if (next.client_id && next.circuit_id && next.heure) {
      try {
        const vehiculeParam = next.vehicule_id ? `&vehicule_id=${next.vehicule_id}` : "";
        const res = await api.get<{ prix_suggere: number }>(
          `/mouvements/prix-suggere?client_id=${next.client_id}&circuit_id=${next.circuit_id}&heure=${next.heure}${vehiculeParam}`
        );
        setPrixSuggere(res.prix_suggere);
      } catch {
        setPrixSuggere(null);
      }
    }
  }

  function majFormMvt(champs: Partial<typeof formMvt>) {
    const next = { ...formMvt, ...champs };
    setFormMvt(next);
    rafraichirPrixSuggere(next);
  }

  async function enregistrerMouvement() {
    setErreurMvt("");
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

  // ---------- Génération de facture ----------
  const mouvementsNonFactures = mouvements.filter((m) => !m.facture_id);
  const totalHT = mouvementsNonFactures.reduce((s, m) => s + Number(m.prix_applique), 0);
  const client = clients.find((c) => c.id === Number(filtreClient));
  const tauxTva = client?.taux_tva ?? 19;
  const montantTva = Math.round(totalHT * tauxTva) / 100;
  const totalTTC = Math.round((totalHT + montantTva) * 1000) / 1000;

  async function ouvrirGenerationFacture() {
    if (!filtreClient || !dateDu || !dateAu) {
      alert("Sélectionnez un client et une période (date du / au) avant de générer une facture.");
      return;
    }
    setErreurFacture("");
    const res = await api.get<{ numero_suggere: string }>("/factures/next-numero");
    setNumeroFacture(res.numero_suggere); // auto par défaut, modifiable ci-dessous
    setModalFactureOuvert(true);
  }

  async function confirmerFacture() {
    setErreurFacture("");
    try {
      await api.post("/factures/", {
        client_id: Number(filtreClient),
        date_debut: dateDu,
        date_fin: dateAu,
        numero_facture: numeroFacture,
      });
      setModalFactureOuvert(false);
      chargerMouvements();
      chargerFactures();
    } catch (e) {
      setErreurFacture((e as Error).message);
    }
  }

  async function changerStatutFacture(f: Facture, statut: StatutFacture) {
    await api.patch(`/factures/${f.id}/statut`, {
      statut,
      date_paiement: statut === "payee" ? new Date().toISOString().slice(0, 10) : null,
    });
    chargerFactures();
  }

  async function supprimerFacture(f: Facture) {
    if (!confirm(`Supprimer la facture ${f.numero_facture} ? Les mouvements liés redeviendront non facturés.`)) return;
    try {
      await api.delete(`/factures/${f.id}`);
      chargerFactures();
      chargerMouvements();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Mouvements &amp; Facturation</h2>
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
      </div>

      <DataTable<Mouvement>
        rows={mouvements}
        columns={[
          { header: "Date", render: (m) => m.date },
          { header: "Heure", render: (m) => m.heure },
          { header: "Client", render: (m) => m.client?.nom_societe || "—" },
          { header: "Circuit", render: (m) => (m.circuit ? `${m.circuit.point_depart} → ${m.circuit.point_arrivee}` : "—") },
          { header: "Chauffeur", render: (m) => (m.chauffeur ? `${m.chauffeur.prenom} ${m.chauffeur.nom}` : "—") },
          { header: "Véhicule", render: (m) => m.vehicule?.matricule || "—" },
          { header: "Nb pers.", render: (m) => m.nb_personnes ?? "—" },
          { header: "Prix", render: (m) => `${m.prix_applique} TND` },
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

      {filtreClient && dateDu && dateAu && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "#1f3864" }}>
            Récapitulatif — {client?.nom_societe} ({dateDu} → {dateAu})
          </h3>
          <div className="recap-grid">
            <div className="recap-box"><div className="label">Total HT</div><div className="value">{totalHT.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">TVA ({tauxTva}%)</div><div className="value">{montantTva.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">Total TTC</div><div className="value">{totalTTC.toFixed(3)} TND</div></div>
          </div>
          <div className="form-actions">
            <button className="btn" disabled={mouvementsNonFactures.length === 0} onClick={ouvrirGenerationFacture}>
              Générer la facture ({mouvementsNonFactures.length} mouvement(s) non facturé(s))
            </button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: "2rem", color: "#1f3864" }}>Factures</h3>
      <DataTable<Facture>
        rows={factures}
        columns={[
          { header: "N° facture", render: (f) => f.numero_facture },
          { header: "Client", render: (f) => f.client?.nom_societe || "—" },
          { header: "Période", render: (f) => `${f.date_debut} → ${f.date_fin}` },
          { header: "TTC", render: (f) => `${f.montant_ttc} TND` },
          { header: "Statut", render: (f) => badgeStatut(f.statut) },
          {
            header: "Actions",
            render: (f) => (
              <>
                <a className="btn-link" href={pdfUrl(f.id)} target="_blank" rel="noreferrer">Export PDF</a>
                {f.statut !== "payee" && (
                  <button className="btn-link" onClick={() => changerStatutFacture(f, "payee")}>Marquer payée</button>
                )}
                {f.statut !== "impayee" && (
                  <button className="btn-link" onClick={() => changerStatutFacture(f, "impayee")}>Marquer impayée</button>
                )}
                <button className="btn-link" onClick={() => supprimerFacture(f)}>Supprimer</button>
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
                    {v.matricule} ({LABELS_TYPE_VEHICULE[v.type_vehicule]})
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
          <div className="recap-box" style={{ marginBottom: "1rem" }}>
            <div className="label">Prix calculé automatiquement</div>
            <div className="value">{prixSuggere !== null ? `${prixSuggere} TND` : "—"}</div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalMvtOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrerMouvement}>Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* Modal : génération de facture avec numéro auto mais modifiable */}
      {modalFactureOuvert && (
        <Modal title="Générer la facture" onClose={() => setModalFactureOuvert(false)}>
          {erreurFacture && <p className="error-msg">{erreurFacture}</p>}
          <div className="form-field" style={{ marginBottom: "1rem" }}>
            <label>Numéro de facture (généré automatiquement — modifiable si besoin)</label>
            <input value={numeroFacture} onChange={(e) => setNumeroFacture(e.target.value)} />
          </div>
          <div className="recap-grid">
            <div className="recap-box"><div className="label">Total HT</div><div className="value">{totalHT.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">TVA ({tauxTva}%)</div><div className="value">{montantTva.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">Total TTC</div><div className="value">{totalTTC.toFixed(3)} TND</div></div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalFactureOuvert(false)}>Annuler</button>
            <button className="btn" onClick={confirmerFacture}>Valider et générer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}