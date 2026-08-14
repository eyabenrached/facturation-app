import { useEffect, useState } from "react";
import { api, pdfUrlLocation } from "../api";
import { MouvementLocation, Chauffeur, Vehicule, Agence, FactureLocation, StatutFacture, LABELS_TYPE_VEHICULE } from "../types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { RecapTransporteurs } from "../components/RecapTransporteurs";
import { useAuth } from "../auth/AuthContext";

const VIDE_MOUVEMENT = {
  date: "",
  heure: "",
  client: "",
  circuit: "",
  prix: 0,
  chauffeur_id: null as number | null,
  vehicule_id: null as number | null,
  transporteur_id: null as number | null,
  nb_personnes: null as number | null,
  remarque: "" as string | null,
};

function badgeStatut(s: StatutFacture) {
  const label = s === "payee" ? "Payée" : s === "impayee" ? "Impayée" : "Partielle";
  return <span className={`badge ${s}`}>{label}</span>;
}

export default function MouvementsLocation() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";

  // Référentiels (chauffeur / véhicule / transporteur restent liés ; client et circuit sont libres)
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);

  // Filtres
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [filtreClient, setFiltreClient] = useState("");
  const [filtreStatutMvt, setFiltreStatutMvt] = useState("");
  const [filtreTransporteur, setFiltreTransporteur] = useState("");
  const [filtreChauffeur, setFiltreChauffeur] = useState("");

  const [mouvements, setMouvements] = useState<MouvementLocation[]>([]);
  const [factures, setFactures] = useState<FactureLocation[]>([]);

  // Modal ajout/édition mouvement
  const [modalOuvert, setModalOuvert] = useState(false);
  const [mouvementEnEdition, setMouvementEnEdition] = useState<MouvementLocation | null>(null);
  const [form, setForm] = useState(VIDE_MOUVEMENT);
  const [erreur, setErreur] = useState("");

  // Modal génération facture
  const [modalFactureOuvert, setModalFactureOuvert] = useState(false);
  const [numeroFacture, setNumeroFacture] = useState("");
  const [tauxTvaFacture, setTauxTvaFacture] = useState(19);
  const [erreurFacture, setErreurFacture] = useState("");

  useEffect(() => {
    api.get<Chauffeur[]>("/chauffeurs/").then((data) =>
      setChauffeurs([...data].sort((a, b) => a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" })))
    );
    api.get<Vehicule[]>("/vehicules/").then(setVehicules);
    api.get<Agence[]>("/agences/").then(setAgences);
  }, []);

  async function chargerMouvements() {
    const params = new URLSearchParams();
    if (dateDu) params.set("date_du", dateDu);
    if (dateAu) params.set("date_au", dateAu);
    if (filtreClient) params.set("client", filtreClient);
    if (filtreStatutMvt) params.set("statut", filtreStatutMvt);
    if (filtreTransporteur) params.set("transporteur_id", filtreTransporteur);
    if (filtreChauffeur) params.set("chauffeur_id", filtreChauffeur);
    setMouvements(await api.get<MouvementLocation[]>(`/mouvements-location/?${params.toString()}`));
  }

  async function chargerFactures() {
    if (!estAdmin) return; // Les gestionnaires n'ont pas accès aux factures.
    const params = new URLSearchParams();
    if (filtreClient) params.set("client", filtreClient);
    setFactures(await api.get<FactureLocation[]>(`/factures-location/?${params.toString()}`));
  }

  useEffect(() => {
    chargerMouvements();
    chargerFactures();
  }, [dateDu, dateAu, filtreClient, filtreStatutMvt, filtreTransporteur, filtreChauffeur]);

  function ouvrirAjout() {
    setMouvementEnEdition(null);
    setForm(VIDE_MOUVEMENT);
    setErreur("");
    setModalOuvert(true);
  }

  function ouvrirEdition(m: MouvementLocation) {
    setMouvementEnEdition(m);
    setForm({
      date: m.date,
      heure: m.heure,
      client: m.client,
      circuit: m.circuit,
      prix: m.prix,
      chauffeur_id: m.chauffeur_id,
      vehicule_id: m.vehicule_id,
      transporteur_id: m.transporteur_id,
      nb_personnes: m.nb_personnes,
      remarque: m.remarque,
    });
    setErreur("");
    setModalOuvert(true);
  }

  function dupliquer(m: MouvementLocation) {
    // Toujours en mode "création" : même en partant d'un mouvement déjà
    // facturé, la copie créée est un nouveau mouvement non facturé.
    setMouvementEnEdition(null);
    setForm({
      date: m.date,
      heure: m.heure,
      client: m.client,
      circuit: m.circuit,
      prix: m.prix,
      chauffeur_id: m.chauffeur_id,
      vehicule_id: m.vehicule_id,
      transporteur_id: m.transporteur_id,
      nb_personnes: m.nb_personnes,
      remarque: m.remarque,
    });
    setErreur("");
    setModalOuvert(true);
  }

  function majForm(champs: Partial<typeof form>) {
    setForm({ ...form, ...champs });
  }

  async function enregistrer() {
    setErreur("");
    if (!form.date || !form.heure || !form.client.trim() || !form.circuit.trim()) {
      setErreur("Date, heure, client et circuit sont obligatoires.");
      return;
    }
    try {
      if (mouvementEnEdition) {
        await api.put(`/mouvements-location/${mouvementEnEdition.id}`, form);
      } else {
        await api.post("/mouvements-location/", form);
      }
      setModalOuvert(false);
      chargerMouvements();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function supprimer(m: MouvementLocation) {
    if (!confirm("Supprimer ce mouvement de location ?")) return;
    try {
      await api.delete(`/mouvements-location/${m.id}`);
      chargerMouvements();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ---------- Génération de facture ----------
  const mouvementsNonFactures = mouvements.filter((m) => !m.facture_id && m.client.trim().toLowerCase() === filtreClient.trim().toLowerCase());
  const totalHT = mouvementsNonFactures.reduce((s, m) => s + Number(m.prix), 0);
  const montantTva = Math.round(totalHT * tauxTvaFacture) / 100;
  const totalTTC = Math.round((totalHT + montantTva) * 1000) / 1000;

  async function ouvrirGenerationFacture() {
    if (!filtreClient.trim() || !dateDu || !dateAu) {
      alert("Saisissez le nom exact du client (filtre) et une période (date du / au) avant de générer une facture.");
      return;
    }
    setErreurFacture("");
    const res = await api.get<{ numero_suggere: string }>("/factures-location/next-numero");
    setNumeroFacture(res.numero_suggere); // auto par défaut, modifiable ci-dessous
    setTauxTvaFacture(19);
    setModalFactureOuvert(true);
  }

  async function confirmerFacture() {
    setErreurFacture("");
    try {
      await api.post("/factures-location/", {
        client: filtreClient.trim(),
        date_debut: dateDu,
        date_fin: dateAu,
        numero_facture: numeroFacture,
        taux_tva: tauxTvaFacture,
      });
      setModalFactureOuvert(false);
      chargerMouvements();
      chargerFactures();
    } catch (e) {
      setErreurFacture((e as Error).message);
    }
  }

  async function changerStatutFacture(f: FactureLocation, statut: StatutFacture) {
    await api.patch(`/factures-location/${f.id}/statut`, {
      statut,
      date_paiement: statut === "payee" ? new Date().toISOString().slice(0, 10) : null,
    });
    chargerFactures();
  }

  async function supprimerFacture(f: FactureLocation) {
    if (!confirm(`Supprimer la facture ${f.numero_facture} ? Les mouvements liés redeviendront non facturés.`)) return;
    try {
      await api.delete(`/factures-location/${f.id}`);
      chargerFactures();
      chargerMouvements();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Mouvements Location</h2>
        <button className="btn" onClick={ouvrirAjout}>+ Ajouter un mouvement</button>
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
          <input type="text" placeholder="Rechercher / cibler un client..." value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)} />
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

      <RecapTransporteurs endpoint="/mouvements-location/recap-transporteurs" dateDu={dateDu} dateAu={dateAu} />

      <DataTable<MouvementLocation>
        rows={mouvements}
        columns={[
          { header: "Date", render: (m) => m.date },
          { header: "Heure", render: (m) => m.heure },
          { header: "Client", render: (m) => m.client },
          { header: "Circuit", render: (m) => m.circuit },
          { header: "Transporteur", render: (m) => m.transporteur?.nom_agence || "—" },
          { header: "Chauffeur", render: (m) => (m.chauffeur ? `${m.chauffeur.prenom} ${m.chauffeur.nom}` : "—") },
          { header: "Véhicule", render: (m) => m.vehicule?.matricule || "—" },
          { header: "Nb pers.", render: (m) => m.nb_personnes ?? "—" },
          { header: "Prix", render: (m) => `${m.prix} TND` },
          { header: "Statut", render: (m) => (m.facture_id ? "Facturé" : "Non facturé") },
          {
            header: "Actions",
            render: (m) => (
              <>
                <button className="btn-link" onClick={() => dupliquer(m)}>Dupliquer</button>
                {!m.facture_id && (
                  <>
                    <button className="btn-link" onClick={() => ouvrirEdition(m)}>Modifier</button>
                    <button className="btn-link" onClick={() => supprimer(m)}>Supprimer</button>
                  </>
                )}
              </>
            ),
          },
        ]}
      />

      {estAdmin && filtreClient && dateDu && dateAu && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "#1f3864" }}>
            Récapitulatif — {filtreClient} ({dateDu} → {dateAu})
          </h3>
          <div className="recap-grid">
            <div className="recap-box"><div className="label">Total HT</div><div className="value">{totalHT.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">TVA ({tauxTvaFacture}%)</div><div className="value">{montantTva.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">Total TTC</div><div className="value">{totalTTC.toFixed(3)} TND</div></div>
          </div>
          <div className="form-actions">
            <button className="btn" disabled={mouvementsNonFactures.length === 0} onClick={ouvrirGenerationFacture}>
              Générer la facture ({mouvementsNonFactures.length} mouvement(s) non facturé(s))
            </button>
          </div>
        </div>
      )}

      {estAdmin && (
        <>
          <h3 style={{ marginTop: "2rem", color: "#1f3864" }}>Factures Location</h3>
          <DataTable<FactureLocation>
            rows={factures}
            columns={[
              { header: "N° facture", render: (f) => f.numero_facture },
              { header: "Client", render: (f) => f.client },
              { header: "Période", render: (f) => `${f.date_debut} → ${f.date_fin}` },
              { header: "TTC", render: (f) => `${f.montant_ttc} TND` },
              { header: "Statut", render: (f) => badgeStatut(f.statut) },
              {
                header: "Actions",
                render: (f) => (
                  <>
                    <a className="btn-link" href={pdfUrlLocation(f.id)} target="_blank" rel="noreferrer">Export PDF</a>
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
        </>
      )}

      {/* Modal : ajout/édition d'un mouvement */}
      {modalOuvert && (
        <Modal title={mouvementEnEdition ? "Modifier le mouvement de location" : "Nouveau mouvement de location"} onClose={() => setModalOuvert(false)}>
          {erreur && <p className="error-msg">{erreur}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => majForm({ date: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Heure</label>
              <input type="time" value={form.heure} onChange={(e) => majForm({ heure: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Client (saisie libre)</label>
              <input type="text" value={form.client} onChange={(e) => majForm({ client: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Circuit (saisie libre)</label>
              <input type="text" value={form.circuit} onChange={(e) => majForm({ circuit: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Prix (saisie libre)</label>
              <input
                type="number"
                min={0}
                step="0.001"
                value={form.prix}
                onChange={(e) => majForm({ prix: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Transporteur (optionnel)</label>
              <select value={form.transporteur_id || ""} onChange={(e) => majForm({ transporteur_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {agences.map((a) => <option key={a.id} value={a.id}>{a.nom_agence}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Chauffeur (optionnel)</label>
              <select value={form.chauffeur_id || ""} onChange={(e) => majForm({ chauffeur_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {chauffeurs.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Véhicule (optionnel)</label>
              <select value={form.vehicule_id || ""} onChange={(e) => majForm({ vehicule_id: e.target.value ? Number(e.target.value) : null })}>
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
                value={form.nb_personnes ?? ""}
                onChange={(e) => majForm({ nb_personnes: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>
          <div className="form-field" style={{ marginBottom: "1rem" }}>
            <label>Remarque (optionnel)</label>
            <textarea value={form.remarque ?? ""} onChange={(e) => majForm({ remarque: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrer}>Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* Modal : génération de facture avec numéro auto mais modifiable, et TVA saisie manuellement */}
      {modalFactureOuvert && (
        <Modal title="Générer la facture de location" onClose={() => setModalFactureOuvert(false)}>
          {erreurFacture && <p className="error-msg">{erreurFacture}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Numéro de facture (généré automatiquement — modifiable si besoin)</label>
              <input value={numeroFacture} onChange={(e) => setNumeroFacture(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Taux de TVA (%) — saisie libre</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={tauxTvaFacture}
                onChange={(e) => setTauxTvaFacture(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="recap-grid">
            <div className="recap-box"><div className="label">Total HT</div><div className="value">{totalHT.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">TVA ({tauxTvaFacture}%)</div><div className="value">{montantTva.toFixed(3)} TND</div></div>
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
