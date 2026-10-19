import PageHero from "./PageHero";
import { IcClock, IcShield, IcHandshake } from "./icons";

export default function APropos() {
  return (
    <>
      <PageHero titre="À propos" sous="Un trait d'union entre l'Europe et l'Afrique." />
      <section className="pub-section pub-narrow">
        <p className="pub-lead">
          Basée à Hammamet, EURAFR TOURS accompagne agences de voyages, tour-opérateurs, entreprises
          et particuliers dans l'organisation de leurs transports et séjours en Tunisie.
        </p>
        <p>
          Notre équipe mise sur la ponctualité, la sécurité et la transparence : chauffeurs qualifiés,
          véhicules entretenus, et une gestion rigoureuse de chaque mouvement, de la réservation à la facture.
        </p>
        <div className="pub-values" style={{ marginTop: "2.5rem" }}>
          <div className="pub-value"><div className="pub-ico pub-ico-gold"><IcClock /></div><h3>Fiabilité</h3><p>Des services assurés en temps et en heure.</p></div>
          <div className="pub-value"><div className="pub-ico pub-ico-gold"><IcHandshake /></div><h3>Proximité</h3><p>Une équipe locale, joignable et réactive.</p></div>
          <div className="pub-value"><div className="pub-ico pub-ico-gold"><IcShield /></div><h3>Transparence</h3><p>Tarifs clairs et facturation détaillée.</p></div>
        </div>
      </section>
    </>
  );
}
