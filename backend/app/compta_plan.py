"""Plan comptable par défaut et correspondances utilisées par l'automatisation."""

# (numero, libelle, systeme) — `systeme` = utilisé par les écritures automatiques.
PLAN_PAR_DEFAUT: list[tuple[str, str, bool]] = [
    # Classe 1 : Capitaux
    ("101000", "Capital social", False),
    ("110000", "Report à nouveau", False),
    ("120000", "Résultat de l'exercice", False),
    # Classe 2 : Immobilisations
    ("218000", "Matériel de transport", False),
    ("215000", "Matériel et outillage", False),
    # Classe 3 : Stocks
    ("310000", "Stocks de fournitures", False),
    # Classe 4 : Tiers
    ("401000", "Fournisseurs", True),
    ("411000", "Clients", True),
    ("421000", "Personnel - rémunérations dues", False),
    ("431000", "CNSS", False),
    ("445660", "TVA déductible", True),
    ("445710", "TVA collectée", True),
    ("445800", "État - TVA à payer", False),
    ("447000", "Droits de timbre fiscal", True),
    # Classe 5 : Trésorerie
    ("512000", "Banque", True),
    ("512100", "Banque - comptes en devises", True),
    ("530000", "Caisse", True),
    # Classe 6 : Charges
    ("601000", "Achats", False),
    ("606000", "Carburant", True),
    ("613000", "Locations", False),
    ("615000", "Entretien et réparations", True),
    ("616000", "Primes d'assurance", True),
    ("625000", "Voyages et déplacements", False),
    ("626000", "Télécommunications", False),
    ("627000", "Services bancaires", False),
    ("628000", "Autres services", True),
    ("635000", "Impôts et taxes", True),
    ("641000", "Rémunérations du personnel", True),
    ("645000", "Charges sociales (CNSS)", True),
    # Classe 7 : Produits
    ("706000", "Prestations de services", True),
    ("707000", "Ventes", False),
]

COMPTE_CLIENTS = "411000"
COMPTE_FOURNISSEURS = "401000"
COMPTE_BANQUE = "512000"
COMPTE_BANQUE_DEVISES = "512100"
COMPTE_REPORT_A_NOUVEAU = "110000"
COMPTE_CAISSE = "530000"
COMPTE_PRODUITS = "706000"
COMPTE_TVA_COLLECTEE = "445710"
COMPTE_TVA_DEDUCTIBLE = "445660"
COMPTE_TIMBRE = "447000"

# Compte de trésorerie crédité lors d'une dépense. Les dépenses de l'application
# n'ont pas de mode de paiement : on les considère payées par la banque.
# Remplacer par COMPTE_CAISSE si la majorité est réglée en espèces.
COMPTE_TRESORERIE_DEPENSES = COMPTE_BANQUE

# Catégorie de dépense (models.CategorieDepense) -> compte de charge.
COMPTE_PAR_CATEGORIE_DEPENSE = {
    "salaire_chauffeur": "641000",
    "cnss": "645000",
    "carburant": "606000",
    "entretien": "615000",
    "assurance": "616000",
    "taxe": "635000",
    "autre": "628000",
}

LABEL_CATEGORIE_DEPENSE = {
    "salaire_chauffeur": "Salaire chauffeur",
    "cnss": "CNSS",
    "carburant": "Carburant",
    "entretien": "Entretien",
    "assurance": "Assurance",
    "taxe": "Taxe",
    "autre": "Dépense",
}

JOURNAUX = {
    "VT": "Ventes",
    "AC": "Achats / charges",
    "BQ": "Banque 1 - TND",
    "BQ2": "Banque 2 - Devises",
    "CA": "Caisse",
    "OD": "Opérations diverses",
}

TYPES_OPERATION = {
    "facture_client": "Facture client",
    "paiement_client": "Paiement client",
    "facture_location": "Facture location",
    "paiement_location": "Paiement location",
    "depense": "Dépense",
    "manuelle": "Écriture manuelle",
    "regularisation": "Régularisation",
    "solde_initial": "Solde initial",
    "facture_fournisseur": "Facture fournisseur",
    "paiement_fournisseur": "Paiement fournisseur",
    "reservation": "Réservation / prestation",
}

# ======================================================================
# ORGANISATION EN DOSSIERS
# ======================================================================
ORIGINE_AUTO = "automatique"
ORIGINE_MANUELLE = "manuelle"

# ---- Comptabilité MANUELLE : exactement 5 dossiers.
# tresorerie = compte de trésorerie suivi par le dossier (None pour les tiers).
# tiers_compte = compte de tiers obligatoirement mouvementé (None pour la trésorerie).
DOSSIERS_MANUELS: dict[str, dict] = {
    "client": {
        "numero": "01", "label": "Clients", "titre": "01 - CLIENTS", "icone": "👤",
        "journal": "OD", "tresorerie": None, "tiers_compte": COMPTE_CLIENTS,
        "description": "Régularisations, corrections, avoirs, différences de paiement et opérations exceptionnelles concernant les clients.",
    },
    "fournisseur": {
        "numero": "02", "label": "Fournisseurs", "titre": "02 - FOURNISSEURS", "icone": "🏢",
        "journal": "OD", "tresorerie": None, "tiers_compte": COMPTE_FOURNISSEURS,
        "description": "Hôtels, transporteurs, compagnies aériennes, guides, restaurants, agences partenaires et autres prestataires.",
    },
    "banque1": {
        "numero": "03", "label": "Banque 1 - TND", "titre": "03 - BANQUE 1 - TND", "icone": "🏦",
        "journal": "BQ", "tresorerie": COMPTE_BANQUE, "tiers_compte": None,
        "description": "Compte bancaire principal en dinars : virements, frais, dépôts, retraits, encaissements et décaissements.",
    },
    "banque2": {
        "numero": "04", "label": "Banque 2 - Devises", "titre": "04 - BANQUE 2 - DEVISES", "icone": "🌍",
        "journal": "BQ2", "tresorerie": COMPTE_BANQUE_DEVISES, "tiers_compte": None,
        "description": "Compte bancaire en devises. Chaque devise a son propre solde : jamais de mélange EUR / USD / GBP / TND.",
    },
    "caisse": {
        "numero": "05", "label": "Caisse", "titre": "05 - CAISSE", "icone": "💵",
        "journal": "CA", "tresorerie": COMPTE_CAISSE, "tiers_compte": None,
        "description": "Caisse physique de l'agence : entrées, sorties, avances, remboursements et régularisations.",
    },
}

DEVISES = {"EUR": "Euro", "USD": "Dollar US", "GBP": "Livre sterling"}
ICONES_DEVISE = {"EUR": "💶", "USD": "💵", "GBP": "💷"}

# Libellé court du dossier, utilisé dans les filtres du journal (manuel ET automatique).
LABELS_DOSSIER = {k: v["label"] for k, v in DOSSIERS_MANUELS.items()}

# ---- Comptabilité AUTOMATIQUE : un dossier par famille d'opérations.
# `types` = valeurs de EcritureComptable.type_operation rangées dans ce dossier.
# `source` = False si aucun module de l'application n'alimente encore ce dossier.
DOSSIERS_AUTO: dict[str, dict] = {
    "factures_clients": {
        "label": "Factures clients", "icone": "📄", "types": ["facture_client", "facture_location"], "source": True,
        "description": "Écriture générée à la création d'une facture de transport ou de location : 411 / 706 / TVA / timbre.",
    },
    "paiements_clients": {
        "label": "Paiements clients", "icone": "💳", "types": ["paiement_client", "paiement_location"], "source": True,
        "description": "Écriture générée à chaque règlement : banque ou caisse au débit, 411 Clients au crédit.",
    },
    "factures_fournisseurs": {
        "label": "Factures fournisseurs", "icone": "🧾", "types": ["facture_fournisseur"], "source": False,
        "description": "Aucun module de l'application ne produit encore de facture fournisseur.",
    },
    "paiements_fournisseurs": {
        "label": "Paiements fournisseurs", "icone": "💸", "types": ["paiement_fournisseur"], "source": False,
        "description": "Aucun module de l'application ne produit encore de paiement fournisseur.",
    },
    "depenses": {
        "label": "Dépenses", "icone": "💰", "types": ["depense"], "source": True,
        "description": "Écriture générée à chaque dépense : compte de charge au débit, trésorerie au crédit.",
    },
    "reservations": {
        "label": "Réservations / prestations", "icone": "🏨", "types": ["reservation"], "source": False,
        "description": "Les réservations hôtelières n'ont pas de montant : aucune écriture n'est générée pour l'instant.",
    },
    "autres": {
        "label": "Autres opérations automatiques", "icone": "📋", "types": [], "source": True,
        "description": "Toute autre écriture générée automatiquement par l'application.",
    },
}


def dossier_auto_de(type_operation: str) -> str:
    for cle, d in DOSSIERS_AUTO.items():
        if type_operation in d["types"]:
            return cle
    return "autres"


def dossier_comptable_auto(type_operation: str, journal: str) -> str:
    """Dossier comptable (client / banque1 / caisse...) d'une écriture automatique,
    pour que la traçabilité et les filtres du journal fonctionnent aussi pour elles."""
    if type_operation in ("facture_client", "facture_location", "paiement_client", "paiement_location"):
        if type_operation.startswith("paiement"):
            return "caisse" if journal == "CA" else "banque1"
        return "client"
    if type_operation in ("facture_fournisseur", "paiement_fournisseur"):
        return "fournisseur"
    if type_operation == "depense":
        return "caisse" if COMPTE_TRESORERIE_DEPENSES == COMPTE_CAISSE else "banque1"
    return "client"

# ---- Règlements clients
# Délai de paiement appliqué pour calculer l'échéance d'une facture (jours après
# la date de fin de facturation). Les factures de l'application n'ont pas de
# date d'échéance propre.
DELAI_PAIEMENT_JOURS = 30

MODES_PAIEMENT = {
    "virement": "Virement bancaire",
    "especes": "Espèces",
    "cheque": "Chèque",
    "carte": "Carte bancaire",
}

# Mode de règlement -> (compte de trésorerie débité, journal)
TRESORERIE_PAR_MODE = {
    "virement": (COMPTE_BANQUE, "BQ"),
    "cheque": (COMPTE_BANQUE, "BQ"),
    "carte": (COMPTE_BANQUE, "BQ"),
    "especes": (COMPTE_CAISSE, "CA"),
}
