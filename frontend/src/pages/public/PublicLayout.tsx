import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import "./public.css";

export const SOCIETE = {
  nom: "EURAFR TOURS",
  adresse: "Avenue Abou Dhabi, Hammamet 8050, Tunisie — BP 268",
  tel: "+216 72 266 899",
  email: "eurafr.tours@orange.tn",
};

export default function PublicLayout() {
  const [ouvert, setOuvert] = useState(false);
  const [defile, setDefile] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const f = () => setDefile(window.scrollY > 40);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const fermer = () => setOuvert(false);
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

  return (
    <div className="pub">
      <header className={`pub-header${defile || ouvert ? " solide" : ""}`}>
        <Link to="/" className="pub-brand" onClick={fermer}>
          <img src="/logo.png" alt="" />
          <span>EURAFR TOURS</span>
        </Link>
        <button className="pub-burger" aria-label="Menu" onClick={() => setOuvert((v) => !v)}>
          ☰
        </button>
        <nav className={`pub-nav${ouvert ? " ouvert" : ""}`} onClick={fermer}>
          <NavLink to="/" end className={cls}>Accueil</NavLink>
          <NavLink to="/services" className={cls}>Services</NavLink>
          <NavLink to="/a-propos" className={cls}>À propos</NavLink>
          <NavLink to="/contact" className={cls}>Contact</NavLink>
          <Link to="/connexion" className="pub-btn pub-btn-sm">Espace professionnel</Link>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="pub-footer">
        <div className="pub-foot-brand">
          <img src="/logo.png" alt="" />
          <div><strong>{SOCIETE.nom}</strong><p>Agence de voyages & transport touristique</p></div>
        </div>
        <div>
          <p>{SOCIETE.adresse}</p>
          <p>Tél : {SOCIETE.tel}</p>
          <p>{SOCIETE.email}</p>
        </div>
        <p className="pub-copy">© {new Date().getFullYear()} {SOCIETE.nom}. Tous droits réservés.</p>
      </footer>
    </div>
  );
}
