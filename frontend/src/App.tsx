import { useEffect, useState } from "react";
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
import Hotels from "./pages/Hotels";
import DossiersHotels from "./pages/DossiersHotels";
import FicheDossierHotel from "./pages/FicheDossierHotel";
import ReservationsHotels from "./pages/ReservationsHotels";
import MessagerieWidget from "./components/MessagerieWidget";
import ComptaDashboard from "./pages/compta/ComptaDashboard";
import ComptaJournal from "./pages/compta/ComptaJournal";
import ComptaPlan from "./pages/compta/ComptaPlan";
import ComptaCreances from "./pages/compta/ComptaCreances";
import ComptaAutomatique from "./pages/compta/ComptaAutomatique";
import ComptaManuel from "./pages/compta/ComptaManuel";
import ComptaTva from "./pages/compta/ComptaTva";
import ComptaRapports from "./pages/compta/ComptaRapports";
import ComptaCloture from "./pages/compta/ComptaCloture";
import "./pages/compta/compta.css";

function Sidebar({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { utilisateur, deconnecter } = useAuth();
  const estAdmin = utilisateur?.role === "administrateur";

  // Sous-menu Comptabilité : ouvert automatiquement quand on est dans /comptabilite/*.
  const { pathname } = useLocation();
  const dansCompta = pathname.startsWith("/comptabilite");
  const [comptaOuverte, setComptaOuverte] = useState(dansCompta);
  useEffect(() => {
    if (dansCompta) setComptaOuverte(true);
  }, [dansCompta]);
  const enAuto = pathname.startsWith("/comptabilite/automatique");
  const enManuel = pathname.startsWith("/comptabilite/manuel");
  const sousAuto = [
    { to: "/comptabilite/automatique/factures_clients", label: "Factures clients" },
    { to: "/comptabilite/automatique/paiements_clients", label: "Paiements clients" },
    { to: "/comptabilite/automatique/factures_fournisseurs", label: "Factures fournisseurs" },
    { to: "/comptabilite/automatique/paiements_fournisseurs", label: "Paiements fournisseurs" },
    { to: "/comptabilite/automatique/depenses", label: "Dépenses" },
    { to: "/comptabilite/automatique/reservations", label: "Réservations" },
  ];
  const sousManuel = [
    { to: "/comptabilite/manuel/client", label: "Clients" },
    { to: "/comptabilite/manuel/fournisseur", label: "Fournisseurs" },
    { to: "/comptabilite/manuel/banque1", label: "Banque 1 - TND" },
    { to: "/comptabilite/manuel/banque2", label: "Banque 2 - Devises" },
    { to: "/comptabilite/manuel/caisse", label: "Caisse" },
  ];

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
        {estAdmin && (
          <>
            <button
              type="button"
              className={`nav-group-btn${dansCompta ? " actif" : ""}`}
              onClick={(e) => { e.stopPropagation(); setComptaOuverte((v) => !v); }}
              aria-expanded={comptaOuverte}
            >
              <span>📊 Comptabilité</span>
              <span className="nav-caret">{comptaOuverte ? "▾" : "▸"}</span>
            </button>
            {comptaOuverte && (
              <div className="nav-sub">
                <NavLink to="/comptabilite" end className={({ isActive }) => (isActive ? "active" : "")}>Tableau de bord</NavLink>

                <NavLink to="/comptabilite/automatique" end className={({ isActive }) => (isActive ? "active" : "")}>🤖 Comptabilité automatique</NavLink>
                {enAuto && (
                  <div className="nav-sub nav-sub-2">
                    {sousAuto.map((l) => (
                      <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>{l.label}</NavLink>
                    ))}
                  </div>
                )}

                <NavLink to="/comptabilite/manuel" end className={({ isActive }) => (isActive ? "active" : "")}>✍️ Comptabilité manuelle</NavLink>
                {enManuel && (
                  <div className="nav-sub nav-sub-2">
                    {sousManuel.map((l) => (
                      <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>{l.label}</NavLink>
                    ))}
                  </div>
                )}

                <NavLink to="/comptabilite/journal" className={({ isActive }) => (isActive ? "active" : "")}>📒 Journal comptable</NavLink>
                <NavLink to="/comptabilite/plan" className={({ isActive }) => (isActive ? "active" : "")}>📚 Plan comptable</NavLink>
                <NavLink to="/comptabilite/tva" className={({ isActive }) => (isActive ? "active" : "")}>🧾 TVA</NavLink>
                <NavLink to="/comptabilite/rapports" className={({ isActive }) => (isActive ? "active" : "")}>📊 Rapports</NavLink>
                <NavLink to="/comptabilite/cloture" className={({ isActive }) => (isActive ? "active" : "")}>🔐 Clôture</NavLink>
                <NavLink to="/comptabilite/creances" className={({ isActive }) => (isActive ? "active" : "")}>👥 Clients / Créances</NavLink>
              </div>
            )}
          </>
        )}
        <NavLink to="/mouvements-location" className={({ isActive }) => (isActive ? "active" : "")}>
          Mouvements Location
        </NavLink>
        <NavLink to="/hotels" className={({ isActive }) => (isActive ? "active" : "")}>
          Hôtels
        </NavLink>
        <NavLink to="/dossiers-hotels" className={({ isActive }) => (isActive ? "active" : "")}>
          Dossiers hôtels
        </NavLink>
        <NavLink to="/reservations-hotels" className={({ isActive }) => (isActive ? "active" : "")}>
          Réservations hôtels
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
  useEffect(() => {
    setMenuOuvert(false);
  }, [location.pathname]);

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
          {estAdmin && <Route path="/comptabilite" element={<ComptaDashboard />} />}
          {estAdmin && <Route path="/comptabilite/journal" element={<ComptaJournal />} />}
          {estAdmin && <Route path="/comptabilite/plan" element={<ComptaPlan />} />}
          {estAdmin && <Route path="/comptabilite/creances" element={<ComptaCreances />} />}
          {estAdmin && <Route path="/comptabilite/automatique" element={<ComptaAutomatique />} />}
          {estAdmin && <Route path="/comptabilite/automatique/:dossier" element={<ComptaAutomatique />} />}
          {estAdmin && <Route path="/comptabilite/manuel" element={<ComptaManuel />} />}
          {estAdmin && <Route path="/comptabilite/manuel/:dossier" element={<ComptaManuel />} />}
          {estAdmin && <Route path="/comptabilite/tva" element={<ComptaTva />} />}
          {estAdmin && <Route path="/comptabilite/rapports" element={<ComptaRapports />} />}
          {estAdmin && <Route path="/comptabilite/cloture" element={<ComptaCloture />} />}
          <Route path="/mouvements-location" element={<MouvementsLocation />} />
          <Route path="/hotels" element={<Hotels />} />
          <Route path="/dossiers-hotels" element={<DossiersHotels />} />
          <Route path="/dossiers-hotels/:id" element={<FicheDossierHotel />} />
          <Route path="/reservations-hotels" element={<ReservationsHotels />} />
          {estAdmin && <Route path="/utilisateurs" element={<Utilisateurs />} />}
          <Route path="*" element={<Navigate to="/mouvements" replace />} />
        </Routes>
      </main>

      <MessagerieWidget />
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