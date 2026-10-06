import { useCallback, useRef, useState } from "react";

type Type = "succes" | "erreur" | "info";
interface ToastItem {
  id: number;
  type: Type;
  message: string;
}

/** Notifications éphémères : `const { toast, toastHost } = useToast();` puis
 * `toast("Enregistré")` / `toast("Erreur…", "erreur")` et `{toastHost}` dans le JSX de la page. */
export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const compteur = useRef(0);

  const toast = useCallback((message: string, type: Type = "succes") => {
    const id = ++compteur.current;
    setItems((l) => [...l, { id, type, message }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), type === "erreur" ? 6000 : 3500);
  }, []);

  const toastHost = (
    <div className="compta-toasts no-print" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`compta-toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );

  return { toast, toastHost };
}
