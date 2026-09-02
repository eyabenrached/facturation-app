import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Chauffeurs from "./pages/Chauffeurs";
import Clients from "./pages/Clients";
import FicheClient from "./pages/FicheClient";
import Agences from "./pages/Agences";
import Vehicules from "./pages/Vehicules";
import Circuits from "./pages/Circuits";
import Mouvements from "./pages/Mouvements";
import Factures from "./pages/Factures";
import Depenses from "./pages/Depenses";
import Finances from "./pages/Finances";
import MouvementsLocation from "./pages/MouvementsLocation";
import Utilisateurs from "./pages/Utilisateurs";

function Sidebar({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { utilisateur, deconnecter } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";

  const liensReferentiels = [
    { to: "/chauffeurs", label: "Chauffeurs" },
    { to: "/clients", label: "Clients" },
    { to: "/agences", label: "Agences" },
    { to: "/vehicules", label: "Véhicules" },
    { to: "/circuits", label: "Circuits" },
  ];

  return (
    <aside className={`sidebar${ouverte ? " sidebar-ouverte" : ""}`}>
      <h1>Facturation Transport</h1>
      <nav onClick={onFermer}>
        {estAdmin && (
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
            Tableau de bord
          </NavLink>
        )}
        {/* Les référentiels restent visibles en lecture pour tous ;
            le backend bloque déjà la création/modification aux gestionnaires. */}
        {liensReferentiels.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {l.label}
          </NavLink>
        ))}
        <NavLink to="/mouvements" className={({ isActive }) => (isActive ? "active" : "")}>
          Mouvements
        </NavLink>
        {estAdmin && (
          <NavLink to="/factures" className={({ isActive }) => (isActive ? "active" : "")}>
            Factures
          </NavLink>
        )}
        {estAdmin && (
          <NavLink to="/depenses" className={({ isActive }) => (isActive ? "active" : "")}>
            Dépenses
          </NavLink>
        )}
        {estAdmin && (
          <NavLink to="/finances" className={({ isActive }) => (isActive ? "active" : "")}>
            Finances
          </NavLink>
        )}
        <NavLink to="/mouvements-location" className={({ isActive }) => (isActive ? "active" : "")}>
          Mouvements Location
        </NavLink>
        {estAdmin && (
          <NavLink to="/utilisateurs" className={({ isActive }) => (isActive ? "active" : "")}>
            Utilisateurs
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <p className="nom-utilisateur">{utilisateur?.nom}</p>
        <p className="role-utilisateur">{utilisateur?.role}</p>
        <button onClick={deconnecter}>Se déconnecter</button>
      </div>
    </aside>
  );
}

function RoutesProtegees() {
  const { utilisateur, chargement } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const location = useLocation();

  // Referme automatiquement le menu mobile à chaque changement de page.
  const cheminPrecedent = useState(location.pathname)[0];
  if (menuOuvert && location.pathname !== cheminPrecedent) {
    setMenuOuvert(false);
  }

  if (chargement) return null;
  if (!utilisateur) return <Login />;

  const estAdmin = utilisateur.role === "administrateur";

  return (
    <div className="app-layout">
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOuvert}
          onClick={() => setMenuOuvert((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="mobile-header-title">Facturation Transport</span>
      </header>

      {menuOuvert && <div className="sidebar-overlay" onClick={() => setMenuOuvert(false)} />}

      <Sidebar ouverte={menuOuvert} onFermer={() => setMenuOuvert(false)} />
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to={estAdmin ? "/dashboard" : "/mouvements"} replace />} />
          {estAdmin && <Route path="/dashboard" element={<Dashboard />} />}
          <Route path="/chauffeurs" element={<Chauffeurs />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<FicheClient />} />
          <Route path="/agences" element={<Agences />} />
          <Route path="/vehicules" element={<Vehicules />} />
          <Route path="/circuits" element={<Circuits />} />
          <Route path="/mouvements" element={<Mouvements />} />
          {estAdmin && <Route path="/factures" element={<Factures />} />}
          {estAdmin && <Route path="/depenses" element={<Depenses />} />}
          {estAdmin && <Route path="/finances" element={<Finances />} />}
          <Route path="/mouvements-location" element={<MouvementsLocation />} />
          {estAdmin && <Route path="/utilisateurs" element={<Utilisateurs />} />}
          <Route path="*" element={<Navigate to="/mouvements" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutesProtegees />
      </AuthProvider>
    </BrowserRouter>
  );
}