import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, definirReactionNonAutorise } from "../api";
import { Utilisateur } from "../types";

interface AuthContextValue {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  connecter: (email: string, password: string) => Promise<void>;
  deconnecter: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  function deconnecter() {
    localStorage.removeItem("token");
    setUtilisateur(null);
  }

  useEffect(() => {
    definirReactionNonAutorise(deconnecter);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setChargement(false);
      return;
    }
    api
      .get<Utilisateur>("/auth/me")
      .then(setUtilisateur)
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setChargement(false));
  }, []);

  async function connecter(email: string, password: string) {
    const res = await api.post<{ access_token: string; utilisateur: Utilisateur }>(
      "/auth/login",
      { email, password }
    );
    localStorage.setItem("token", res.access_token);
    setUtilisateur(res.utilisateur);
  }

  return (
    <AuthContext.Provider value={{ utilisateur, chargement, connecter, deconnecter }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
