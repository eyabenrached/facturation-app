import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, pdfUrl } from "../api";
import { ClientFiche, StatutFacture, LABELS_TYPE_VEHICULE } from "../types";
import { DataTable } from "../components/DataTable";

function badgeStatut(s: StatutFacture) {
  const label = s === "payee" ? "Payée" : s === "impayee" ? "Impayée" : "Partielle";
  return <span className={`badge ${s}`}>{label}</span>;
}

function formatMontant(v: number) {
  return `${v.toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
}

export default function FicheClient() {
  const { id } = useParams<{ id: string }>();
  const [fiche, setFiche] = useState<ClientFiche | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      <h3>Tarifs spécifiques</h3>
      <DataTable
        rows={tarifs}
        emptyMessage="Aucun tarif spécifique pour ce client."
        columns={[
          { header: "Circuit", render: (t) => (t.circuit ? `${t.circuit.point_depart} → ${t.circuit.point_arrivee}` : "—") },
          { header: "Type véhicule", render: (t) => (t.type_vehicule ? LABELS_TYPE_VEHICULE[t.type_vehicule] : "Tous types") },
          { header: "Heure", render: (t) => (t.heure_debut ? t.heure_debut : "Toute heure") },
          { header: "Prix", render: (t) => formatMontant(t.prix) },
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
    </div>
  );
}