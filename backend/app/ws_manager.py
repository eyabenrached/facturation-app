"""Gestionnaire simple des connexions WebSocket actives de la messagerie
interne. Un même utilisateur peut avoir plusieurs connexions ouvertes
(plusieurs onglets / appareils) : on diffuse à toutes."""

from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.connexions: dict[int, list[WebSocket]] = defaultdict(list)

    async def connecter(self, utilisateur_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.connexions[utilisateur_id].append(ws)

    def deconnecter(self, utilisateur_id: int, ws: WebSocket) -> None:
        connexions = self.connexions.get(utilisateur_id)
        if connexions and ws in connexions:
            connexions.remove(ws)
        if connexions is not None and not connexions:
            self.connexions.pop(utilisateur_id, None)

    async def envoyer_a_utilisateur(self, utilisateur_id: int, data: dict) -> None:
        for ws in list(self.connexions.get(utilisateur_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                # Connexion morte : on l'ignore, elle sera nettoyée à la
                # prochaine déconnexion détectée par FastAPI.
                pass

    async def diffuser(self, utilisateur_ids: list[int], data: dict) -> None:
        for uid in utilisateur_ids:
            await self.envoyer_a_utilisateur(uid, data)


manager = ConnectionManager()
