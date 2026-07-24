import { useState, FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { connecter } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      await connecter(email, password);
    } catch (err) {
      setErreur((err as Error).message || "Connexion impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={soumettre}>
        <h1>Facturation Transport</h1>
        <p className="login-subtitle">Connectez-vous pour accéder à l'application</p>

        {erreur && <p className="error-msg">{erreur}</p>}

        <div className="form-field" style={{ marginBottom: "0.9rem" }}>
          <label>Adresse e-mail</label>
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-field" style={{ marginBottom: "1.25rem" }}>
          <label>Mot de passe</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn" type="submit" disabled={enCours} style={{ width: "100%" }}>
          {enCours ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
