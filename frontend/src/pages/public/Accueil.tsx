import { Link } from "react-router-dom";
import { IcPlane, IcMap, IcBus, IcHotel, IcShield, IcClock, IcHandshake, IcStar } from "./icons";

const services = [
  { i: <IcPlane />, t: "Transferts", d: "Aéroports, hôtels et gares : accueil à l'arrivée, reconduite au départ, à l'heure." },
  { i: <IcMap />, t: "Circuits & excursions", d: "Sahara, Carthage, Kairouan, Djerba… des programmes guidés, sur mesure." },
  { i: <IcBus />, t: "Location avec chauffeur", d: "Voitures, minibus et autocars pour vos groupes, séminaires et événements." },
  { i: <IcHotel />, t: "Hôtels & réservations", d: "Une sélection d'hôtels en Tunisie et une gestion rigoureuse de vos dossiers." },
];

const destinations = [
  { k: "hammamet", t: "Hammamet", s: "Plages & thalasso" },
  { k: "sahara", t: "Sahara", s: "Dunes & oasis" },
  { k: "carthage", t: "Carthage & Sidi Bou Saïd", s: "Histoire & architecture" },
  { k: "djerba", t: "Djerba", s: "Île & traditions" },
  { k: "kairouan", t: "Kairouan", s: "Ville sainte" },
];

const valeurs = [
  { i: <IcClock />, t: "Ponctualité", d: "Chaque mouvement est planifié et suivi." },
  { i: <IcShield />, t: "Sécurité", d: "Chauffeurs qualifiés, véhicules entretenus." },
  { i: <IcHandshake />, t: "Partenariat", d: "Tarifs professionnels pour les agences." },
  { i: <IcStar />, t: "Qualité de service", d: "Une équipe locale, réactive et attentive." },
];

export default function Accueil() {
  return (
    <>
      <section className="pub-hero">
        <div className="pub-hero-in">
          <span className="pub-eyebrow">Agence de voyages · Hammamet, Tunisie</span>
          <h1>
            Entre Europe et Afrique,<br />
            <em>chaque voyage est une escale d'exception.</em>
          </h1>
          <p>
            Transferts, circuits, location de véhicules et réservations hôtelières : EURAFR TOURS
            conçoit et accompagne vos déplacements en Tunisie avec exigence et élégance.
          </p>
          <div className="pub-actions">
            <Link to="/contact" className="pub-btn">Demander un devis</Link>
            <Link to="/services" className="pub-btn pub-btn-light">Découvrir nos services</Link>
          </div>
        </div>
        <div className="pub-scroll" aria-hidden>↓</div>
      </section>

      <section className="pub-section">
        <header className="pub-head">
          <span className="pub-eyebrow pub-eyebrow-dark">Nos savoir-faire</span>
          <h2>Un service complet, de l'arrivée au départ</h2>
          <div className="pub-rule" />
        </header>
        <div className="pub-grid">
          {services.map((s) => (
            <article key={s.t} className="pub-card">
              <div className="pub-ico">{s.i}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <header className="pub-head">
          <span className="pub-eyebrow pub-eyebrow-dark">Destinations</span>
          <h2>La Tunisie, sous tous ses visages</h2>
          <div className="pub-rule" />
        </header>
        <div className="pub-dest">
          {destinations.map((d) => (
            <Link to="/contact" key={d.k} className="pub-dest-card" style={{
              backgroundImage: `linear-gradient(180deg, rgba(8,20,38,0) 30%, rgba(8,20,38,.92)), url(/images/dest-${d.k}.jpg), url(/images/dest-${d.k}.svg)`,
            }}>
              <span>{d.s}</span>
              <strong>{d.t}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="pub-section">
        <header className="pub-head">
          <span className="pub-eyebrow pub-eyebrow-dark">Nos engagements</span>
          <h2>Pourquoi choisir EURAFR TOURS</h2>
          <div className="pub-rule" />
        </header>
        <div className="pub-values">
          {valeurs.map((v) => (
            <div key={v.t} className="pub-value">
              <div className="pub-ico pub-ico-gold">{v.i}</div>
              <h3>{v.t}</h3>
              <p>{v.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pub-cta">
        <div className="pub-cta-in">
          <h2>Un projet de voyage ou de transport ?</h2>
          <p>Parlez-nous de vos dates, de votre groupe et de vos envies. Nous vous répondons rapidement.</p>
          <Link to="/contact" className="pub-btn">Nous contacter</Link>
        </div>
      </section>
    </>
  );
}
