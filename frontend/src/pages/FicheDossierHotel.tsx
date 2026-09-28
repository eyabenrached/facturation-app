import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, pdfUrlDossierHotel } from "../api";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import {
  DossierHotel,
  DossierHotelPayload,
  ReservationHotel,
  ReservationHotelPayload,
  Hotel,
  Agence,
  Circuit,
  EtatReservation,
  LABELS_ETAT_RESERVATION,
  TypePension,
  LABELS_TYPE_PENSION,
  StatutDossierHotel,
  LABELS_STATUT_DOSSIER_HOTEL,
} from "../types";

const ETATS: EtatReservation[] = ["en_attente", "option", "confirmee", "refusee", "annulee"];
const PENSIONS: TypePension[] = ["sans_pension", "petit_dejeuner", "demi_pension", "pension_complete", "all_inclusive"];

const VIDE_RESERVATION: ReservationHotelPayload = {
  hotel_id: 0,
  date_arrivee: "",
  date_depart: "",
  nb_personnes: 1,
  nb_chambres: 1,
  chambres_single: 0,
  chambres_double: 0,
  chambres_twin: 0,
  chambres_triple: 0,
  type_pension: "demi_pension",
  etat: "en_attente",
  hotel_remplacement_id: null,
  observations: "",
};

function badgeEtat(e: EtatReservation) {
  return <span className={`badge ${e}`}>{LABELS_ETAT_RESERVATION[e]}</span>;
}

function badgeStatutDossier(s: string) {
  const label = LABELS_STATUT_DOSSIER_HOTEL[s as StatutDossierHotel] || s;
  return <span className={`badge ${s}`}>{label}</span>;
}

function nbNuits(arrivee: string, depart: string) {
  if (!arrivee || !depart) return 0;
  const diff = Math.round((new Date(depart).getTime() - new Date(arrivee).getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

function versPayloadDossier(d: DossierHotel): DossierHotelPayload {
  return {
    agence_id: d.agence_id,
    circuit_id: d.circuit_id,
    date_arrivee: d.date_arrivee,
    heure_arrivee: d.heure_arrivee ? d.heure_arrivee.slice(0, 5) : null,
    numero_vol_arrivee: d.numero_vol_arrivee,
    compagnie_arrivee: d.compagnie_arrivee,
    date_depart: d.date_depart,
    heure_depart: d.heure_depart ? d.heure_depart.slice(0, 5) : null,
    numero_vol_depart: d.numero_vol_depart,
    compagnie_depart: d.compagnie_depart,
    nb_personnes: d.nb_personnes,
    nb_chambres: d.nb_chambres,
    observations: d.observations,
  };
}

export default function FicheDossierHotel() {
  const { id } = useParams<{ id: string }>();
  const [dossier, setDossier] = useState<DossierHotel | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  // Réservation
  const [modalReservationOuvert, setModalReservationOuvert] = useState(false);
  const [reservationEnEdition, setReservationEnEdition] = useState<ReservationHotel | null>(null);
  const [formReservation, setFormReservation] = useState<ReservationHotelPayload>(VIDE_RESERVATION);
  const [erreurReservation, setErreurReservation] = useState("");

  // Dossier
  const [modalDossierOuvert, setModalDossierOuvert] = useState(false);
  const [formDossier, setFormDossier] = useState<DossierHotelPayload | null>(null);
  const [erreurDossier, setErreurDossier] = useState("");

  async function charger() {
    if (!id) return;
    setChargement(true);
    setErreur("");
    try {
      setDossier(await api.get<DossierHotel>(`/dossiers-hotels/${id}`));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    api.get<Hotel[]>("/hotels/").then(setHotels);
    api.get<Agence[]>("/agences/").then(setAgences);
    api.get<Circuit[]>("/circuits/").then(setCircuits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function hotelLabel(h: Hotel | null | undefined, hotelId?: number | null) {
    if (h) return `${h.nom} (${h.ville})`;
    if (!hotelId) return "—";
    const t = hotels.find((x) => x.id === hotelId);
    return t ? `${t.nom} (${t.ville})` : `#${hotelId}`;
  }

  // ---------- Réservations ----------
  function ouvrirAjoutReservation() {
    if (!dossier) return;
    setReservationEnEdition(null);
    setFormReservation({
      ...VIDE_RESERVATION,
      date_arrivee: dossier.date_arrivee || "",
      date_depart: dossier.date_depart || "",
      nb_personnes: dossier.nb_personnes ?? 1,
      nb_chambres: dossier.nb_chambres ?? 1,
    });
    setErreurReservation("");
    setModalReservationOuvert(true);
  }

  function ouvrirEditionReservation(r: ReservationHotel) {
    setReservationEnEdition(r);
    setFormReservation({
      hotel_id: r.hotel_id,
      date_arrivee: r.date_arrivee,
      date_depart: r.date_depart,
      nb_personnes: r.nb_personnes,
      nb_chambres: r.nb_chambres,
      chambres_single: r.chambres_single,
      chambres_double: r.chambres_double,
      chambres_twin: r.chambres_twin,
      chambres_triple: r.chambres_triple,
      type_pension: r.type_pension,
      etat: r.etat,
      hotel_remplacement_id: r.hotel_remplacement_id,
      observations: r.observations || "",
    });
    setErreurReservation("");
    setModalReservationOuvert(true);
  }

  async function enregistrerReservation() {
    if (!dossier) return;
    setErreurReservation("");
    const f = formReservation;
    if (!f.hotel_id) return setErreurReservation("Merci de sélectionner un hôtel.");
    if (!f.date_arrivee || !f.date_depart) return setErreurReservation("Les dates sont obligatoires.");
    if (f.date_depart <= f.date_arrivee) return setErreurReservation("La date de départ doit être postérieure à la date d'arrivée.");
    if (f.etat === "refusee" && !f.hotel_remplacement_id) {
      return setErreurReservation("Sélectionnez un hôtel de remplacement pour une réservation refusée.");
    }
    const payload: ReservationHotelPayload = {
      ...f,
      // l'hôtel de remplacement n'a de sens que pour une réservation refusée
      hotel_remplacement_id: f.etat === "refusee" ? f.hotel_remplacement_id : null,
      observations: f.observations && f.observations.trim() ? f.observations : null,
    };
    try {
      // Les routes imbriquées renvoient le dossier complet mis à jour.
      const maj = reservationEnEdition
        ? await api.put<DossierHotel>(`/dossiers-hotels/${dossier.id}/reservations/${reservationEnEdition.id}`, payload)
        : await api.post<DossierHotel>(`/dossiers-hotels/${dossier.id}/reservations`, payload);
      setDossier(maj);
      setModalReservationOuvert(false);
    } catch (e) {
      setErreurReservation((e as Error).message);
    }
  }

  async function supprimerReservation(r: ReservationHotel) {
    if (!dossier) return;
    if (!confirm(`Supprimer la réservation à ${r.hotel?.nom || "cet hôtel"} ?`)) return;
    try {
      setDossier(await api.delete<DossierHotel>(`/dossiers-hotels/${dossier.id}/reservations/${r.id}`));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ---------- Dossier ----------
  function ouvrirEditionDossier() {
    if (!dossier) return;
    setFormDossier(versPayloadDossier(dossier));
    setErreurDossier("");
    setModalDossierOuvert(true);
  }

  async function enregistrerDossier() {
    if (!dossier || !formDossier) return;
    setErreurDossier("");
    if (formDossier.date_arrivee && formDossier.date_depart && formDossier.date_depart <= formDossier.date_arrivee) {
      return setErreurDossier("La date de départ doit être postérieure à la date d'arrivée.");
    }
    const v = (x: string | null) => (x && x.trim() ? x : null);
    const payload: DossierHotelPayload = {
      ...formDossier,
      date_arrivee: v(formDossier.date_arrivee),
      heure_arrivee: v(formDossier.heure_arrivee),
      numero_vol_arrivee: v(formDossier.numero_vol_arrivee),
      compagnie_arrivee: v(formDossier.compagnie_arrivee),
      date_depart: v(formDossier.date_depart),
      heure_depart: v(formDossier.heure_depart),
      numero_vol_depart: v(formDossier.numero_vol_depart),
      compagnie_depart: v(formDossier.compagnie_depart),
      observations: v(formDossier.observations),
    };
    try {
      setDossier(await api.put<DossierHotel>(`/dossiers-hotels/${dossier.id}`, payload));
      setModalDossierOuvert(false);
    } catch (e) {
      setErreurDossier((e as Error).message);
    }
  }

  if (chargement) return <p>Chargement…</p>;
  if (erreur) return <p className="error-msg">{erreur}</p>;
  if (!dossier) return null;

  const reservations = dossier.reservations;
  const compteurs = ETATS.reduce((acc, e) => {
    acc[e] = reservations.filter((r) => r.etat === e).length;
    return acc;
  }, {} as Record<EtatReservation, number>);

  const majR = (patch: Partial<ReservationHotelPayload>) => setFormReservation({ ...formReservation, ...patch });
  const majD = (patch: Partial<DossierHotelPayload>) => formDossier && setFormDossier({ ...formDossier, ...patch });

  return (
    <div>
      <div className="page-header">
        <div>
          <p style={{ margin: 0 }}>
            <Link to="/dossiers-hotels">← Retour aux dossiers hôtels</Link>
          </p>
          <h2 style={{ marginTop: "0.3rem" }}>
            Dossier {dossier.numero_dossier} {badgeStatutDossier(dossier.statut_global)}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button className="btn secondary" onClick={ouvrirEditionDossier}>Modifier</button>
          <a className="btn" href={pdfUrlDossierHotel(dossier.id)} target="_blank" rel="noreferrer">
            Générer le PDF
          </a>
        </div>
      </div>

      {/* Informations générales + vols */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div className="card" style={{ flex: "1 1 260px", minWidth: "260px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>Informations générales</p>
          <p style={{ margin: "0.5rem 0 0" }}><strong>Agence :</strong> {dossier.agence?.nom_agence || "—"}</p>
          <p style={{ margin: "0.3rem 0 0" }}>
            <strong>Circuit :</strong> {dossier.circuit ? `${dossier.circuit.point_depart} → ${dossier.circuit.point_arrivee}` : "—"}
          </p>
          <p style={{ margin: "0.3rem 0 0" }}>
            <strong>Personnes :</strong> {dossier.nb_personnes ?? "—"} · <strong>Chambres :</strong> {dossier.nb_chambres ?? "—"}
          </p>
          {dossier.observations && (
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>{dossier.observations}</p>
          )}
        </div>
        <div className="card" style={{ flex: "1 1 260px", minWidth: "260px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>Arrivée</p>
          <p style={{ margin: "0.5rem 0 0" }}>
            {dossier.date_arrivee || "—"} {dossier.heure_arrivee && `à ${dossier.heure_arrivee.slice(0, 5)}`}
          </p>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
            Vol {dossier.numero_vol_arrivee || "—"} · {dossier.compagnie_arrivee || "—"}
          </p>
        </div>
        <div className="card" style={{ flex: "1 1 260px", minWidth: "260px" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280", fontWeight: 600 }}>Départ</p>
          <p style={{ margin: "0.5rem 0 0" }}>
            {dossier.date_depart || "—"} {dossier.heure_depart && `à ${dossier.heure_depart.slice(0, 5)}`}
          </p>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
            Vol {dossier.numero_vol_depart || "—"} · {dossier.compagnie_depart || "—"}
          </p>
        </div>
      </div>

      {/* Tableau des réservations */}
      <div className="page-header" style={{ marginTop: 0 }}>
        <h3 style={{ margin: 0 }}>Tableau des réservations hôtelières</h3>
        <button className="btn" onClick={ouvrirAjoutReservation}>+ Ajouter une réservation</button>
      </div>

      <DataTable<ReservationHotel>
        rows={reservations}
        columns={[
          { header: "Hôtel", render: (r) => hotelLabel(r.hotel, r.hotel_id) },
          { header: "Passage", render: (r) => `${r.date_arrivee} → ${r.date_depart}` },
          { header: "Nuits", render: (r) => r.nb_nuits },
          { header: "Chambres", render: (r) => r.nb_chambres ?? "—" },
          { header: "Pension", render: (r) => (r.type_pension ? LABELS_TYPE_PENSION[r.type_pension] : "—") },
          { header: "État", render: (r) => badgeEtat(r.etat) },
          { header: "Hôtel remplacement", render: (r) => hotelLabel(r.hotel_remplacement, r.hotel_remplacement_id) },
          { header: "Observations", render: (r) => r.observations || "—" },
          {
            header: "Actions",
            render: (r) => (
              <>
                <button className="btn-link" onClick={() => ouvrirEditionReservation(r)}>Modifier</button>
                <button className="btn-link" onClick={() => supprimerReservation(r)}>Supprimer</button>
              </>
            ),
          },
        ]}
      />

      {/* Résumé des statuts */}
      <h3 style={{ marginTop: "2rem" }}>Résumé des statuts</h3>
      <div className="recap-grid recap-grid-4" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {ETATS.map((e) => (
          <div className="recap-box" key={e}>
            <p className="label">{LABELS_ETAT_RESERVATION[e]}</p>
            <p className="value">{compteurs[e]}</p>
          </div>
        ))}
      </div>

      {/* Modale réservation */}
      {modalReservationOuvert && (
        <Modal
          title={reservationEnEdition ? "Modifier la réservation" : "Ajouter une réservation"}
          onClose={() => setModalReservationOuvert(false)}
        >
          {erreurReservation && <p className="error-msg">{erreurReservation}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Hôtel</label>
              <select value={formReservation.hotel_id || ""} onChange={(e) => majR({ hotel_id: Number(e.target.value) })}>
                <option value="">— Sélectionner —</option>
                {hotels.filter((h) => h.actif || h.id === formReservation.hotel_id).map((h) => (
                  <option key={h.id} value={h.id}>{h.nom} ({h.ville})</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>État</label>
              <select value={formReservation.etat} onChange={(e) => majR({ etat: e.target.value as EtatReservation })}>
                {ETATS.map((e2) => (
                  <option key={e2} value={e2}>{LABELS_ETAT_RESERVATION[e2]}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Date d'arrivée</label>
              <input type="date" value={formReservation.date_arrivee} onChange={(e) => majR({ date_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Date de départ</label>
              <input type="date" value={formReservation.date_depart} onChange={(e) => majR({ date_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Nombre de nuits</label>
              <input value={nbNuits(formReservation.date_arrivee, formReservation.date_depart)} readOnly />
            </div>
            <div className="form-field">
              <label>Nombre de personnes</label>
              <input type="number" min={1} value={formReservation.nb_personnes ?? ""} onChange={(e) => majR({ nb_personnes: e.target.value ? Number(e.target.value) : null })} />
            </div>

            <div className="form-field">
              <label>Nombre de chambres (total)</label>
              <input type="number" min={0} value={formReservation.nb_chambres ?? ""} onChange={(e) => majR({ nb_chambres: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="form-field">
              <label>Type de pension</label>
              <select value={formReservation.type_pension || ""} onChange={(e) => majR({ type_pension: (e.target.value || null) as TypePension | null })}>
                <option value="">—</option>
                {PENSIONS.map((p) => (
                  <option key={p} value={p}>{LABELS_TYPE_PENSION[p]}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Chambres single</label>
              <input type="number" min={0} value={formReservation.chambres_single} onChange={(e) => majR({ chambres_single: Number(e.target.value) })} />
            </div>
            <div className="form-field">
              <label>Chambres double</label>
              <input type="number" min={0} value={formReservation.chambres_double} onChange={(e) => majR({ chambres_double: Number(e.target.value) })} />
            </div>
            <div className="form-field">
              <label>Chambres twin</label>
              <input type="number" min={0} value={formReservation.chambres_twin} onChange={(e) => majR({ chambres_twin: Number(e.target.value) })} />
            </div>
            <div className="form-field">
              <label>Chambres triple</label>
              <input type="number" min={0} value={formReservation.chambres_triple} onChange={(e) => majR({ chambres_triple: Number(e.target.value) })} />
            </div>

            {formReservation.etat === "refusee" && (
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Hôtel de remplacement</label>
                <select
                  value={formReservation.hotel_remplacement_id || ""}
                  onChange={(e) => majR({ hotel_remplacement_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Sélectionner —</option>
                  {hotels
                    .filter((h) => h.id !== formReservation.hotel_id && (h.actif || h.id === formReservation.hotel_remplacement_id))
                    .map((h) => (
                      <option key={h.id} value={h.id}>{h.nom} ({h.ville})</option>
                    ))}
                </select>
              </div>
            )}

            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Observations</label>
              <textarea rows={2} value={formReservation.observations || ""} onChange={(e) => majR({ observations: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalReservationOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrerReservation}>
              {reservationEnEdition ? "Enregistrer" : "+ Ajouter la réservation"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modale dossier */}
      {modalDossierOuvert && formDossier && (
        <Modal title={`Modifier le dossier ${dossier.numero_dossier}`} onClose={() => setModalDossierOuvert(false)}>
          {erreurDossier && <p className="error-msg">{erreurDossier}</p>}
          <div className="form-grid">
            <div className="form-field">
              <label>Agence</label>
              <select value={formDossier.agence_id || ""} onChange={(e) => majD({ agence_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Sélectionner —</option>
                {agences.map((a) => (
                  <option key={a.id} value={a.id}>{a.nom_agence}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Circuit</label>
              <select value={formDossier.circuit_id || ""} onChange={(e) => majD({ circuit_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Aucun —</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>{c.point_depart} → {c.point_arrivee}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Date d'arrivée</label>
              <input type="date" value={formDossier.date_arrivee || ""} onChange={(e) => majD({ date_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Heure d'arrivée</label>
              <input type="time" value={formDossier.heure_arrivee || ""} onChange={(e) => majD({ heure_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>N° vol arrivée</label>
              <input value={formDossier.numero_vol_arrivee || ""} onChange={(e) => majD({ numero_vol_arrivee: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Compagnie arrivée</label>
              <input value={formDossier.compagnie_arrivee || ""} onChange={(e) => majD({ compagnie_arrivee: e.target.value })} />
            </div>

            <div className="form-field">
              <label>Date de départ</label>
              <input type="date" value={formDossier.date_depart || ""} onChange={(e) => majD({ date_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Heure de départ</label>
              <input type="time" value={formDossier.heure_depart || ""} onChange={(e) => majD({ heure_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>N° vol départ</label>
              <input value={formDossier.numero_vol_depart || ""} onChange={(e) => majD({ numero_vol_depart: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Compagnie départ</label>
              <input value={formDossier.compagnie_depart || ""} onChange={(e) => majD({ compagnie_depart: e.target.value })} />
            </div>

            <div className="form-field">
              <label>Nombre de personnes</label>
              <input type="number" min={1} value={formDossier.nb_personnes ?? ""} onChange={(e) => majD({ nb_personnes: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="form-field">
              <label>Nombre de chambres</label>
              <input type="number" min={1} value={formDossier.nb_chambres ?? ""} onChange={(e) => majD({ nb_chambres: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Observations</label>
              <textarea rows={2} value={formDossier.observations || ""} onChange={(e) => majD({ observations: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setModalDossierOuvert(false)}>Annuler</button>
            <button className="btn" onClick={enregistrerDossier}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
