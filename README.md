# Facturation Transport — Backend FastAPI + Frontend React/TSX

Application de gestion : Chauffeurs, Clients, Agences, Véhicules, Circuits,
Mouvements et Facturation automatique (HT/TVA/TTC + export PDF).

Le numéro de facture est **généré automatiquement** (format `FAC-<année>-0001`)
mais reste **modifiable avant validation** dans le formulaire de génération.

---

## 1. Prérequis à installer sur votre machine

- Python 3.11+ → https://www.python.org/downloads/
- Node.js 18+ → https://nodejs.org/
- PostgreSQL 14+ → https://www.postgresql.org/download/

Vérifiez les installations :
```bash
python3 --version
node --version
psql --version
```

## 2. Créer la base de données PostgreSQL

```bash
psql -U postgres
```
Puis dans l'invite `psql` :
```sql
CREATE DATABASE facturation;
\q
```

## 3. Démarrer le backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# ouvrez .env et adaptez DATABASE_URL si besoin (utilisateur/mot de passe postgres)

uvicorn app.main:app --reload
```

Le backend tourne sur **http://localhost:8000**.
Les tables sont créées automatiquement au démarrage.
Documentation interactive de l'API : http://localhost:8000/docs

## 4. Démarrer le frontend (React/TSX)

Dans un **second terminal** :
```bash
cd frontend
npm install

cp .env.example .env
# par défaut VITE_API_URL=http://localhost:8000, à adapter si besoin

npm run dev
```

Le frontend tourne sur **http://localhost:5173**.

## 5. Utilisation

1. Créez d'abord des **Agences**, puis des **Véhicules** (liés à une agence).
2. Créez des **Clients**.
3. Créez des **Circuits** (ex. Borj Chekir → Zi Kram) avec prix jour/nuit.
4. Créez des **Chauffeurs** (optionnel pour les mouvements).
5. Dans **Mouvements & Facturation** :
   - ajoutez les trajets effectués (date, heure, client, circuit) → le prix est calculé automatiquement ;
   - filtrez par client et par période (date du / au) ;
   - cliquez sur **Générer la facture** : le numéro est pré-rempli automatiquement, modifiable si besoin ;
   - téléchargez la facture en PDF, et marquez-la payée/impayée.

## Structure du projet

```
backend/
  app/
    main.py         → point d'entrée FastAPI
    database.py     → connexion PostgreSQL
    models.py       → tables SQLAlchemy
    schemas.py      → validation Pydantic
    pricing.py      → règles de calcul du prix (client + circuit + heure)
    pdf.py          → génération de la facture PDF
    routers/        → une route par module (chauffeurs, clients, agences, véhicules, circuits, mouvements, factures)
frontend/
  src/
    pages/          → un écran par module
    components/     → tableau et fenêtre modale réutilisables
    api.ts          → appels vers le backend
    types.ts        → types TypeScript partagés
```

## Prochaines étapes possibles

- Authentification (login administrateur / gestionnaire)
- Migrations Alembic (au lieu de `create_all` en développement)
- Export PDF plus personnalisé (logo, mentions légales complètes)
- Espace client, relances automatiques par e-mail
