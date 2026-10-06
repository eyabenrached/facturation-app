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
    "BQ": "Banque",
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
}

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
