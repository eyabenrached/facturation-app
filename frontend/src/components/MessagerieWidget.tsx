import { useCallback, useEffect, useRef, useState } from "react";
import { api, messagerieWsUrl } from "../api";
import { useAuth } from "../auth/AuthContext";
import { ConversationChat, MessageChat, Utilisateur } from "../types";
import { Modal } from "./Modal";

function nomConversation(conv: ConversationChat, monId: number | undefined): string {
  if (conv.type === "generale") return conv.nom || "Général";
  const autre = conv.membres.find((m) => m.id !== monId);
  return autre?.nom || "Conversation";
}

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/);
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

function formatHeure(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateJour(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

interface Toast {
  id: number;
  conversationId: number;
  nom: string;
  contenu: string;
}

let compteurToast = 0;

export default function MessagerieWidget() {
  const { utilisateur } = useAuth();

  const [panelOuvert, setPanelOuvert] = useState(false);
  const [vue, setVue] = useState<"liste" | "chat">("liste");

  const [conversations, setConversations] = useState<ConversationChat[]>([]);
  const [conversationActiveId, setConversationActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageChat[]>([]);
  const [texte, setTexte] = useState("");
  const [chargementMessages, setChargementMessages] = useState(false);
  const [connecte, setConnecte] = useState(false);

  const [modalNouvelle, setModalNouvelle] = useState(false);
  const [collegues, setCollegues] = useState<Utilisateur[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const panelOuvertRef = useRef(false);
  const vueRef = useRef<"liste" | "chat">("liste");
  const conversationActiveIdRef = useRef<number | null>(null);
  const finMessagesRef = useRef<HTMLDivElement | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    panelOuvertRef.current = panelOuvert;
  }, [panelOuvert]);
  useEffect(() => {
    vueRef.current = vue;
  }, [vue]);
  useEffect(() => {
    conversationActiveIdRef.current = conversationActiveId;
  }, [conversationActiveId]);

  const chargerConversations = useCallback(async () => {
    try {
      const data = await api.get<ConversationChat[]>("/messagerie/conversations");
      setConversations(data);
      return data;
    } catch {
      return [];
    }
  }, []);

  const ouvrirConversation = useCallback(
    (id: number) => {
      setConversationActiveId(id);
      setVue("chat");
      setChargementMessages(true);
      api
        .get<MessageChat[]>(`/messagerie/conversations/${id}/messages`)
        .then(setMessages)
        .catch(() => setMessages([]))
        .finally(() => setChargementMessages(false));
      api.patch(`/messagerie/conversations/${id}/lu`, {}).then(() => {
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, non_lus: 0 } : c)));
      });
    },
    []
  );

  function retirerToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function ouvrirDepuisToast(t: Toast) {
    retirerToast(t.id);
    setPanelOuvert(true);
    ouvrirConversation(t.conversationId);
  }

  // Chargement initial des conversations (pour le badge de non-lus), dès la connexion.
  useEffect(() => {
    if (!utilisateur) return;
    chargerConversations();
  }, [utilisateur, chargerConversations]);

  // Connexion WebSocket temps réel, active en permanence tant que l'utilisateur est connecté.
  useEffect(() => {
    if (!utilisateur) return;
    const monId = utilisateur.id;
    let annule = false;

    function connecter() {
      const ws = new WebSocket(messagerieWsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnecte(true);
      ws.onclose = () => {
        setConnecte(false);
        if (!annule) {
          reconnectRef.current = window.setTimeout(connecter, 3000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type !== "nouveau_message") return;
          const msg: MessageChat = data.message;
          const estMoi = msg.expediteur_id === monId;
          const vueSurCetteConv =
            panelOuvertRef.current &&
            vueRef.current === "chat" &&
            conversationActiveIdRef.current === msg.conversation_id;

          if (vueSurCetteConv) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            if (!estMoi) {
              api.patch(`/messagerie/conversations/${msg.conversation_id}/lu`, {}).catch(() => {});
            }
          } else if (!estMoi) {
            const id = ++compteurToast;
            const nom = msg.expediteur?.nom || "Nouveau message";
            setToasts((prev) => [...prev.slice(-2), { id, conversationId: msg.conversation_id, nom, contenu: msg.contenu }]);
            window.setTimeout(() => retirerToast(id), 6000);
          }

          chargerConversations();
        } catch {
          /* message non JSON ignoré */
        }
      };
    }

    connecter();
    return () => {
      annule = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utilisateur]);

  useEffect(() => {
    finMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function envoyer() {
    const contenu = texte.trim();
    if (!contenu || conversationActiveId === null) return;
    setTexte("");
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ conversation_id: conversationActiveId, contenu }));
    } else {
      api
        .post<MessageChat>(`/messagerie/conversations/${conversationActiveId}/messages`, { contenu })
        .then((msg) => setMessages((prev) => [...prev, msg]))
        .catch(() => setTexte(contenu));
    }
  }

  function ouvrirNouvelleConversation() {
    api
      .get<Utilisateur[]>("/messagerie/utilisateurs")
      .then(setCollegues)
      .catch(() => setCollegues([]));
    setModalNouvelle(true);
  }

  async function demarrerConversationAvec(u: Utilisateur) {
    const conv = await api.post<ConversationChat>("/messagerie/conversations/privee", { utilisateur_id: u.id });
    setModalNouvelle(false);
    await chargerConversations();
    ouvrirConversation(conv.id);
  }

  function togglePanel() {
    setPanelOuvert((v) => {
      const nouveau = !v;
      if (nouveau) setVue((vActuelle) => (conversationActiveId ? vActuelle : "liste"));
      return nouveau;
    });
  }

  if (!utilisateur) return null;

  const conversationActive = conversations.find((c) => c.id === conversationActiveId) || null;
  const totalNonLus = conversations.reduce((s, c) => s + c.non_lus, 0);

  return (
    <>
      <div className="msg-toast-pile">
        {toasts.map((t) => (
          <button key={t.id} className="msg-toast" onClick={() => ouvrirDepuisToast(t)}>
            <span className="avatar">{initiales(t.nom)}</span>
            <span className="msg-toast-corps">
              <span className="msg-toast-nom">{t.nom}</span>
              <span className="msg-toast-texte">{t.contenu}</span>
            </span>
            <span
              className="msg-toast-fermer"
              onClick={(e) => {
                e.stopPropagation();
                retirerToast(t.id);
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>

      {panelOuvert && (
        <div className="msg-panel">
          {vue === "liste" ? (
            <>
              <div className="msg-panel-header">
                <span className={`statut-connexion ${connecte ? "en-ligne" : "hors-ligne"}`}>
                  <span className="pastille" /> {connecte ? "Connecté" : "Reconnexion…"}
                </span>
                <div className="msg-panel-header-actions">
                  <button className="msg-icon-btn" title="Nouveau message" onClick={ouvrirNouvelleConversation}>
                    ✎
                  </button>
                  <button className="msg-icon-btn" title="Fermer" onClick={() => setPanelOuvert(false)}>
                    ×
                  </button>
                </div>
              </div>
              <div className="msg-panel-liste">
                {conversations.length === 0 && <p className="empty-cell">Aucune conversation pour le moment.</p>}
                {conversations.map((c) => {
                  const nom = nomConversation(c, utilisateur.id);
                  return (
                    <button key={c.id} className="messagerie-item" onClick={() => ouvrirConversation(c.id)}>
                      <span className={`avatar${c.type === "generale" ? " avatar-generale" : ""}`}>
                        {c.type === "generale" ? "★" : initiales(nom)}
                      </span>
                      <span className="messagerie-item-corps">
                        <span className="messagerie-item-haut">
                          <span className="messagerie-item-nom">{nom}</span>
                          {c.dernier_message && (
                            <span className="messagerie-item-heure">{formatDateJour(c.dernier_message.date_envoi)}</span>
                          )}
                        </span>
                        <span className="messagerie-item-bas">
                          <span className="messagerie-item-apercu">
                            {c.dernier_message
                              ? `${c.dernier_message.expediteur_id === utilisateur.id ? "Vous : " : ""}${c.dernier_message.contenu}`
                              : "Aucun message pour l'instant"}
                          </span>
                          {c.non_lus > 0 && <span className="messagerie-badge">{c.non_lus}</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            conversationActive && (
              <>
                <div className="msg-panel-header">
                  <button className="msg-icon-btn" title="Retour" onClick={() => setVue("liste")}>
                    ←
                  </button>
                  <span className={`avatar${conversationActive.type === "generale" ? " avatar-generale" : ""}`}>
                    {conversationActive.type === "generale" ? "★" : initiales(nomConversation(conversationActive, utilisateur.id))}
                  </span>
                  <div className="msg-panel-titre">
                    <div className="messagerie-fil-titre">{nomConversation(conversationActive, utilisateur.id)}</div>
                    <div className="messagerie-fil-sous-titre">
                      {conversationActive.type === "generale"
                        ? `${conversationActive.membres.length} membre${conversationActive.membres.length > 1 ? "s" : ""}`
                        : "Conversation privée"}
                    </div>
                  </div>
                  <button className="msg-icon-btn" title="Fermer" onClick={() => setPanelOuvert(false)}>
                    ×
                  </button>
                </div>

                <div className="messagerie-messages">
                  {chargementMessages && <p className="empty-cell">Chargement…</p>}
                  {!chargementMessages && messages.length === 0 && (
                    <p className="empty-cell">Aucun message. Dites bonjour !</p>
                  )}
                  {messages.map((m) => {
                    const estMoi = m.expediteur_id === utilisateur.id;
                    return (
                      <div key={m.id} className={`bulle-ligne${estMoi ? " moi" : ""}`}>
                        <div className={`bulle${estMoi ? " bulle-moi" : ""}`}>
                          {!estMoi && conversationActive.type === "generale" && (
                            <div className="bulle-auteur">{m.expediteur?.nom}</div>
                          )}
                          <div className="bulle-texte">{m.contenu}</div>
                          <div className="bulle-heure">{formatHeure(m.date_envoi)}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={finMessagesRef} />
                </div>

                <form
                  className="messagerie-saisie"
                  onSubmit={(e) => {
                    e.preventDefault();
                    envoyer();
                  }}
                >
                  <input
                    type="text"
                    placeholder="Écrire un message…"
                    value={texte}
                    onChange={(e) => setTexte(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="submit" className="btn" disabled={!texte.trim()}>
                    Envoyer
                  </button>
                </form>
              </>
            )
          )}
        </div>
      )}

      <button
        className="msg-bouton-flottant"
        onClick={togglePanel}
        title="Messagerie"
        aria-label="Ouvrir la messagerie"
      >
        {panelOuvert ? "×" : "💬"}
        {!panelOuvert && totalNonLus > 0 && <span className="msg-bouton-badge">{totalNonLus}</span>}
      </button>

      {modalNouvelle && (
        <Modal title="Nouvelle conversation" onClose={() => setModalNouvelle(false)}>
          {collegues.length === 0 ? (
            <p className="empty-cell">Aucun autre utilisateur disponible.</p>
          ) : (
            <div className="messagerie-collegues">
              {collegues.map((u) => (
                <button key={u.id} className="messagerie-collegue" onClick={() => demarrerConversationAvec(u)}>
                  <span className="avatar">{initiales(u.nom)}</span>
                  <span>
                    <span className="messagerie-item-nom">{u.nom}</span>
                    <span className={`role-badge ${u.role}`} style={{ marginLeft: "0.5rem" }}>
                      {u.role}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
