import { useEffect, useState } from "react";
import { api, pdfUrl } from "../api";
import { Client, Facture, StatutFacture } from "../types";
import { Modal } from "../components/Modal";
import { DataTable } from "../components/DataTable";
import { useAuth } from "../auth/AuthContext";

function badgeStatut(s: StatutFacture) {
  const label = s === "payee" ? "Payée" : s === "impayee" ? "Impayée" : "Partielle";
  return <span className={`badge ${s}`}>{label}</span>;
}

/**
 * Ouvre le PDF de la facture dans un iframe invisible puis déclenche
 * directement l'impression du navigateur sur ce PDF (sans passer par un
 * nouvel onglet à fermer manuellement).
 */
function imprimerPdf(factureId: number) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = pdfUrl(factureId);
  iframe.onload = () => {
    // Laisse au visualiseur PDF du navigateur le temps de s'initialiser
    // avant de déclencher l'impression, sinon certains navigateurs
    // ouvrent la boîte de dialogue sur une page vide.
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // Repli : si l'impression directe échoue (ex. restrictions du
        // navigateur), on ouvre le PDF dans un nouvel onglet à la place.
        window.open(pdfUrl(factureId), "_blank");
      }
    }, 300);
  };
  document.body.appendChild(iframe);
  // Nettoie l'iframe une fois l'impression lancée (le navigateur garde sa
  // propre copie du document dans la boîte de dialogue d'impression).
  setTimeout(() => iframe.remove(), 60000);
}

export default function Factures() {
  const { utilisateur } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";

  const [clients, setClients] = useState<Client[]>([]);
  const [filtreClient, setFiltreClient] = useState("");

  const [factures, setFactures] = useState<Facture[]>([]);

  // Génération : période + total des mouvements non facturés sur cette période/client
  const [dateDu, setDateDu] = useState("");
  const [dateAu, setDateAu] = useState("");
  const [nonFactures, setNonFactures] = useState<{ prix_applique: number }[]>([]);

  const [modalFactureOuvert, setModalFactureOuvert] = useState(false);
  const [numeroFacture, setNumeroFacture] = useState("");
  const [erreurFacture, setErreurFacture] = useState("");

  useEffect(() => {
    api.get<Client[]>("/clients/").then(setClients);
  }, []);

  async function chargerFactures() {
    if (!estAdmin) return; // Les gestionnaires n'ont pas accès aux factures.
    const params = new URLSearchParams();
    if (filtreClient) params.set("client_id", filtreClient);
    const data = await api.get<Facture[]>(`/factures/?${params.toString()}`);
    setFactures(data);
  }

  async function chargerNonFactures() {
    if (!estAdmin || !filtreClient || !dateDu || !dateAu) {
      setNonFactures([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("client_id", filtreClient);
    params.set("date_du", dateDu);
    params.set("date_au", dateAu);
    params.set("statut", "non_facture");
    const data = await api.get<{ prix_applique: number }[]>(`/mouvements/?${params.toString()}`);
    setNonFactures(data);
  }

  useEffect(() => {
    chargerFactures();
  }, [filtreClient]);

  useEffect(() => {
    chargerNonFactures();
  }, [filtreClient, dateDu, dateAu]);

  const client = clients.find((c) => c.id === Number(filtreClient));
  const tauxTva = client?.taux_tva ?? 19;
  const totalHT = nonFactures.reduce((s, m) => s + Number(m.prix_applique), 0);
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
      chargerFactures();
      chargerNonFactures();
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
      chargerNonFactures();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (!estAdmin) {
    return (
      <div>
        <div className="page-header">
          <h2>Factures</h2>
        </div>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Factures</h2>
      </div>

      <div className="toolbar">
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
          <label>Date du</label>
          <input type="date" value={dateDu} onChange={(e) => setDateDu(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date au</label>
          <input type="date" value={dateAu} onChange={(e) => setDateAu(e.target.value)} />
        </div>
      </div>

      {filtreClient && dateDu && dateAu && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0, color: "#1f3864" }}>
            Générer une facture — {client?.nom_societe} ({dateDu} → {dateAu})
          </h3>
          <div className="recap-grid">
            <div className="recap-box"><div className="label">Total HT</div><div className="value">{totalHT.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">TVA ({tauxTva}%)</div><div className="value">{montantTva.toFixed(3)} TND</div></div>
            <div className="recap-box"><div className="label">Total TTC</div><div className="value">{totalTTC.toFixed(3)} TND</div></div>
          </div>
          <div className="form-actions">
            <button className="btn" disabled={nonFactures.length === 0} onClick={ouvrirGenerationFacture}>
              Générer la facture ({nonFactures.length} mouvement(s) non facturé(s))
            </button>
          </div>
        </div>
      )}

      <DataTable<Facture>
        rows={factures}
        columns={[
          { header: "N° facture", render: (f) => f.numero_facture },
          { header: "Client", render: (f) => f.client?.nom_societe || "—" },
          { header: "Période", render: (f) => `${f.date_debut} → ${f.date_fin}` },
          { header: "Total TTC", render: (f) => `${Number(f.montant_ttc).toFixed(3)} TND` },
          { header: "Statut", render: (f) => badgeStatut(f.statut) },
          {
            header: "Actions",
            render: (f) => (
              <>
                <button className="btn-link" onClick={() => imprimerPdf(f.id)}>Imprimer</button>
                <a className="btn-link" href={pdfUrl(f.id)} target="_blank" rel="noreferrer">PDF</a>
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