import { Component, ReactNode } from "react";

/** Évite la page blanche : affiche l'erreur et permet de réinitialiser la session. */
export default class ErreurGlobale extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: "15vh auto", padding: "0 1.5rem", fontFamily: "Inter, sans-serif" }}>
        <h2>Une erreur est survenue</h2>
        <p style={{ color: "#6b7280" }}>
          La page n'a pas pu s'afficher. Essayez de recharger ; si le problème continue, réinitialisez la session.
        </p>
        <pre style={{ background: "#f6f5f1", padding: "1rem", borderRadius: 8, whiteSpace: "pre-wrap", fontSize: ".85rem" }}>
          {this.state.erreur.message}
        </pre>
        <div style={{ display: "flex", gap: ".75rem" }}>
          <button className="btn" onClick={() => window.location.reload()}>Recharger</button>
          <button
            className="btn"
            onClick={() => { localStorage.removeItem("token"); window.location.href = "/"; }}
          >
            Réinitialiser la session
          </button>
        </div>
      </div>
    );
  }
}
