"""
Conversion d'un nombre entier en toutes lettres, en français.
Aucune dépendance externe (pur Python), pour éviter tout souci d'installation.
"""

UNITES = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]
DIX_A_SEIZE = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"]
DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"]


def _moins_de_cent(n: int) -> str:
    if n < 10:
        return UNITES[n]
    if n < 17:
        return DIX_A_SEIZE[n - 10]
    if n < 20:
        return "dix-" + UNITES[n - 10]
    if n < 100:
        dizaine, unite = divmod(n, 10)
        if dizaine in (7, 9):
            # soixante-dix, quatre-vingt-dix
            base = DIZAINES[dizaine]
            reste = 10 + unite
            if reste < 17:
                mot_reste = DIX_A_SEIZE[reste - 10] if reste >= 10 else UNITES[reste]
            else:
                mot_reste = "dix-" + UNITES[reste - 10]
            return f"{base}-{mot_reste}"
        base = DIZAINES[dizaine]
        if unite == 0:
            return base + ("s" if dizaine == 8 else "")
        if unite == 1 and dizaine not in (8,):
            return f"{base} et un"
        return f"{base}-{UNITES[unite]}"
    return ""


def _moins_de_mille(n: int) -> str:
    if n < 100:
        return _moins_de_cent(n)
    centaine, reste = divmod(n, 100)
    mot = ("cent" if centaine == 1 else f"{UNITES[centaine]} cent")
    if reste == 0:
        if centaine > 1:
            mot += "s"
        return mot
    return f"{mot} {_moins_de_cent(reste)}"


def nombre_en_lettres(n: int) -> str:
    """Convertit un entier positif en toutes lettres (français)."""
    if n == 0:
        return "zéro"
    if n < 0:
        return "moins " + nombre_en_lettres(-n)

    milliards, reste = divmod(n, 1_000_000_000)
    millions, reste = divmod(reste, 1_000_000)
    milliers, reste = divmod(reste, 1_000)
    unites = reste

    parties = []
    if milliards:
        parties.append(f"{_moins_de_mille(milliards)} milliard{'s' if milliards > 1 else ''}")
    if millions:
        parties.append(f"{_moins_de_mille(millions)} million{'s' if millions > 1 else ''}")
    if milliers:
        if milliers == 1:
            parties.append("mille")
        else:
            parties.append(f"{_moins_de_mille(milliers)} mille")
    if unites:
        parties.append(_moins_de_mille(unites))

    return " ".join(parties)


def montant_ttc_en_lettres(montant: float, devise: str = "dinar", sous_unite: str = "millime") -> str:
    """
    Ex : 190.400 -> "cent quatre-vingt-dix dinars et quatre cents millimes"
    Adapté au dinar tunisien (3 décimales = millimes), mais fonctionne pour
    toute devise à 3 décimales.
    """
    entier = int(montant)
    decimales = round((montant - entier) * 1000)  # 3 décimales -> millimes
    if decimales == 1000:  # arrondi de sécurité
        entier += 1
        decimales = 0

    texte = f"{nombre_en_lettres(entier)} {devise}{'s' if entier > 1 else ''}"
    if decimales > 0:
        texte += f" et {nombre_en_lettres(decimales)} {sous_unite}{'s' if decimales > 1 else ''}"
    return texte[0].upper() + texte[1:]