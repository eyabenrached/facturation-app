import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ReservationHotel, Hotel, EtatReservation, LABELS_ETAT_RESERVATION, LABELS_TYPE_PENSION } from "../types";
import { DataTable } from "../components/DataTable";

const ETATS: EtatReservation[] = ["en_attente", "option", "confirmee", "refusee", "annulee"];

function badgeEtat(e: EtatReservation) {
  return <span className={`badge ${e}`}>{LABELS_ETAT_RESERVATION[e]}</span>;
}

export default function ReservationsHotels() {
  const [liste, setListe] = useState<ReservationHotel[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filtreEtat, setFiltreEtat] = useState("");
  const [filtreHotel, setFiltreHotel] = useState("");

  async function charger() {
    const params = new URLSearchParams();
    if (filtreEtat) params.set("etat", filtreEtat);
    if (filtreHotel) params.set("hotel_id", filtreHotel);
    setListe(await api.get<ReservationHotel[]>(`/reservations-hotels/?${params.toString()}`));
  }

  useEffect(() => {
    api.get<Hotel[]>("/hotels/").then(setHotels);
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreEtat, filtreHotel]);

  return (
    <div>
      <div className="page-header">
        <h2>Réservations hôtels</h2>
      </div>

      <div className="toolbar">
        <select value={filtreEtat} onChange={(e) => setFiltreEtat(e.target.value)}>
          <option value="">Tous les états</option>
          {ETATS.map((e) => (
            <option key={e} value={e}>{LABELS_ETAT_RESERVATION[e]}</option>
          ))}
        </select>
        <select value={filtreHotel} onChange={(e) => setFiltreHotel(e.target.value)}>
          <option value="">Tous les hôtels</option>
          {hotels.map((h) => (
            <option key={h.id} value={h.id}>{h.nom} ({h.ville})</option>
          ))}
        </select>
      </div>

      <DataTable<ReservationHotel>
        rows={liste}
        emptyMessage="Aucune réservation hôtelière trouvée."
        columns={[
          {
            header: "Dossier",
            render: (r) => <Link to={`/dossiers-hotels/${r.dossier_id}`}>Dossier #{r.dossier_id}</Link>,
          },
          { header: "Hôtel", render: (r) => r.hotel?.nom || `#${r.hotel_id}` },
          { header: "Passage", render: (r) => `${r.date_arrivee} → ${r.date_depart}` },
          { header: "Nuits", render: (r) => r.nb_nuits },
          { header: "Chambres", render: (r) => r.nb_chambres },
          { header: "Pension", render: (r) => (r.type_pension ? LABELS_TYPE_PENSION[r.type_pension] : "—") },
          { header: "État", render: (r) => badgeEtat(r.etat) },
          { header: "Hôtel remplacement", render: (r) => r.hotel_remplacement?.nom || "—" },
          { header: "Observations", render: (r) => r.observations || "—" },
        ]}
      />
    </div>
  );
}
