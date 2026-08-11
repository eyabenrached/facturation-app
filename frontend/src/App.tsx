import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Chauffeurs from "./pages/Chauffeurs";
import Clients from "./pages/Clients";
import Agences from "./pages/Agences";
import Vehicules from "./pages/Vehicules";
import Circuits from "./pages/Circuits";
import MouvementsFacturation from "./pages/MouvementsFacturation";
import Utilisateurs from "./pages/Utilisateurs";

function Sidebar() {
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
    <aside className="sidebar">
      <h1>Facturation Transport</h1>
      <nav>
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
          Mouvements &amp; Facturation
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

  if (chargement) return null;
  if (!utilisateur) return <Login />;

  const estAdmin = utilisateur.role === "administrateur";

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to={estAdmin ? "/dashboard" : "/mouvements"} replace />} />
          {estAdmin && <Route path="/dashboard" element={<Dashboard />} />}
          <Route path="/chauffeurs" element={<Chauffeurs />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/agences" element={<Agences />} />
          <Route path="/vehicules" element={<Vehicules />} />
          <Route path="/circuits" element={<Circuits />} />
          <Route path="/mouvements" element={<MouvementsFacturation />} />
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