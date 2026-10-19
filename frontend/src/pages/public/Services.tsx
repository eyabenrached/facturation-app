import { Link } from "react-router-dom";
import PageHero from "./PageHero";
import { IcPlane, IcMap, IcBus, IcHotel, IcHandshake } from "./icons";

const services = [
  { i: <IcPlane />, t: "Transferts", d: "Aéroports (Enfidha, Tunis-Carthage, Monastir, Djerba), hôtels, gares et sites touristiques. Navettes régulières ou à la demande, accueil personnalisé." },
  { i: <IcMap />, t: "Circuits & excursions", d: "Programmes d'une journée ou de plusieurs jours, guidés, adaptés aux groupes, familles et séminaires." },
  { i: <IcBus />, t: "Location de véhicules", d: "Voitures, minibus et autocars avec chauffeur, à la journée, à la semaine ou pour un événement." },
  { i: <IcHotel />, t: "Hôtels & réservations", d: "Sélection d'hôtels en Tunisie, gestion des dossiers et des réservations pour agences partenaires." },
  { i: <IcHandshake />, t: "Partenariats agences", d: "Tarifs professionnels, facturation claire et suivi des mouvements pour les tour-opérateurs." },
];

export default function Services() {
  return (
    <>
      <PageHero titre="Nos services" sous="Une offre complète pour vos déplacements et séjours en Tunisie." />
      <section className="pub-section">
        <div className="pub-rows">
          {services.map((s, n) => (
            <article key={s.t} className={`pub-row${n % 2 ? " inv" : ""}`}>
              <div className="pub-ico pub-ico-big">{s.i}</div>
              <div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </article>
          ))}
        </div>
        <p style={{ textAlign: "center", marginTop: "2.5rem" }}>
          <Link to="/contact" className="pub-btn">Demander un devis</Link>
        </p>
      </section>
    </>
  );
}
