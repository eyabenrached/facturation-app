"""PDF du dossier hôtelier — mise en page « EURAFR TOURS » :
en-tête avec logo et courbe bleu/or, cartes à coins arrondis (informations
générales, vol, réservations, résumé des statuts, historique), zone
observations/signature et pied de page avec coordonnées.

Le fichier est autonome : il ne dépend de `pdf.py` que pour la lecture des
variables d'environnement et le nettoyage des textes.
"""

import io
import os
from datetime import date
from functools import lru_cache
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, NextPageTemplate, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

from . import models
from .pdf import _env, _safe

# ---------------------------------------------------------------- Couleurs
NAVY = colors.HexColor("#173A6A")
GOLD = colors.HexColor("#C79A3B")
BLUE_SOFT = colors.HexColor("#EEF3FB")
LINE = colors.HexColor("#CBD3DF")
TEXT = colors.HexColor("#1C2430")
MUTED = colors.HexColor("#667085")
WHITE = colors.white

LABELS_ETAT = {
    "en_attente": "En attente",
    "option": "Option",
    "confirmee": "Confirmée",
    "refusee": "Refusée",
    "annulee": "Annulée",
}

# (fond de la pastille, texte de la pastille, couleur du résumé)
COULEURS_ETAT = {
    "confirmee": (colors.HexColor("#DCFCE7"), colors.HexColor("#15803D"), colors.HexColor("#16A34A")),
    "en_attente": (colors.HexColor("#FEF3C7"), colors.HexColor("#B45309"), colors.HexColor("#F59E0B")),
    "option": (colors.HexColor("#DBEAFE"), colors.HexColor("#1D4ED8"), colors.HexColor("#2563EB")),
    "refusee": (colors.HexColor("#FEE2E2"), colors.HexColor("#B91C1C"), colors.HexColor("#EF4444")),
    "annulee": (colors.HexColor("#E5E7EB"), colors.HexColor("#4B5563"), colors.HexColor("#6B7280")),
}

# Statut global du dossier : (libellé, couleur du fond)
STATUTS_GLOBAUX = {
    "en_cours": ("En cours", colors.HexColor("#2563EB")),
    "confirme": ("Confirmé", colors.HexColor("#16A34A")),
    "annule": ("Annulé", colors.HexColor("#6B7280")),
}

# ---------------------------------------------------------------- Société
ADRESSE_LIGNES = ["Licence A", "Av. Abou Dhabi", "B.P. 268", "8050 HAMMAMET"]
ADRESSE_PIED = "Av. Abou Dhabi, 8050 Hammamet"
LIEU_EDITION = "Hammamet"
SLOGAN_HAUT = ("Votre voyage,", "notre passion")
SLOGAN_BAS = "Ensemble vers de nouveaux horizons"

PAGE_W, PAGE_H = A4
MARGE = 14 * mm
LARGEUR = PAGE_W - 2 * MARGE          # 182 mm
HAUT_PAGE1 = 53.5 * mm                  # espace réservé à l'en-tête (page 1)
HAUT_SUITE = 14 * mm
BAS = 20 * mm
MAX_HISTORIQUE = 6                    # entrées affichées dans le PDF
TITRE_CARTE_H = 8.5 * mm


# ================================================================ Utilitaires
def _fmt_date(value) -> str:
    return value.strftime("%d/%m/%Y") if value else "—"


def _fmt_heure(value) -> str:
    return value.strftime("%H:%M") if value else "—"


def _fmt_passage(reservation) -> str:
    return f"{_fmt_date(reservation.date_arrivee)} - {_fmt_date(reservation.date_depart)}"


def _val(v):
    return getattr(v, "value", v)


def _duree_sejour(dossier) -> str:
    debut, fin = dossier.date_arrivee, dossier.date_depart
    if not (debut and fin):
        resas = [r for r in (dossier.reservations or []) if r.date_arrivee and r.date_depart]
        if resas:
            debut = min(r.date_arrivee for r in resas)
            fin = max(r.date_depart for r in resas)
    if not (debut and fin) or fin <= debut:
        return "—"
    nuits = (fin - debut).days
    return f"{nuits} nuit{'s' if nuits > 1 else ''}"


def _historique_visible(dossier):
    """Entrées du journal triées chronologiquement, limitées aux plus
    récentes. Tolérant : relation absente ou non chargée → liste vide.
    Renvoie (entrées affichées, nombre d'entrées masquées)."""
    entrees = getattr(dossier, "historique", None) or []
    entrees = sorted(entrees, key=lambda h: (h.date_action, h.id))
    masquees = max(0, len(entrees) - MAX_HISTORIQUE)
    return entrees[masquees:], masquees


@lru_cache(maxsize=1)
def _logo_reader():
    """Logo rogné de ses marges blanches (le fichier source en a beaucoup)."""
    path = Path(__file__).parent / "static" / "logo.png"
    if not path.exists():
        return None, 1.0
    try:
        from PIL import Image, ImageChops

        im = Image.open(path).convert("RGBA")
        fond = Image.new("RGBA", im.size, (255, 255, 255, 255))
        fond.alpha_composite(im)
        im = fond.convert("RGB")
        bbox = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).getbbox()
        if bbox:
            im = im.crop(bbox)
        im.thumbnail((1100, 1100))
        return ImageReader(im), im.width / im.height
    except Exception:
        return ImageReader(str(path)), 1.0


# ================================================================ Flowables
class _Pill(Flowable):
    """Pastille arrondie avec texte centré (états, statut global)."""

    def __init__(self, texte, fond, couleur_texte, largeur=22 * mm, hauteur=4.9 * mm, taille=7.6):
        super().__init__()
        self.texte, self.fond, self.couleur_texte = texte, fond, couleur_texte
        self.w, self.h, self.taille = largeur, hauteur, taille

    def wrap(self, aw, ah):
        return self.w, self.h

    def draw(self):
        c = self.canv
        c.setFillColor(self.fond)
        c.roundRect(0, 0, self.w, self.h, self.h / 2, stroke=0, fill=1)
        c.setFillColor(self.couleur_texte)
        c.setFont("Helvetica-Bold", self.taille)
        c.drawCentredString(self.w / 2, self.h / 2 - self.taille * 0.35, self.texte)


class _Dot(Flowable):
    def __init__(self, couleur, diametre=3.2 * mm):
        super().__init__()
        self.couleur, self.d = couleur, diametre

    def wrap(self, aw, ah):
        return self.d, self.d

    def draw(self):
        self.canv.setFillColor(self.couleur)
        self.canv.circle(self.d / 2, self.d / 2, self.d / 2, stroke=0, fill=1)


class _Card(Flowable):
    """Carte à coins arrondis : bandeau de titre bleu pâle + contenu.
    `hauteur_min` permet d'aligner deux cartes côte à côte."""

    def __init__(self, titre, corps, largeur, styles, pad=4 * mm):
        super().__init__()
        self.titre, self.corps, self.w, self.pad = titre, corps, largeur, pad
        self.title_par = Paragraph(titre, styles["card_title"])
        self.hauteur_min = 0
        self._bh = 0
        self.pad_top = 1.8 * mm
        self.pad_bottom = 2.6 * mm

    def hauteur_naturelle(self):
        _, bh = self.corps.wrap(self.w - 2 * self.pad, 10000)
        return TITRE_CARTE_H + bh + self.pad_top + self.pad_bottom

    def wrap(self, aw, ah):
        self.h = max(self.hauteur_naturelle(), self.hauteur_min)
        _, self._bh = self.corps.wrap(self.w - 2 * self.pad, 10000)
        return self.w, self.h

    def draw(self):
        c, w, h, r = self.canv, self.w, self.h, 3.2 * mm
        c.saveState()
        p = c.beginPath()
        p.roundRect(0, 0, w, h, r)
        c.clipPath(p, stroke=0, fill=0)
        c.setFillColor(WHITE)
        c.rect(0, 0, w, h, stroke=0, fill=1)
        c.setFillColor(BLUE_SOFT)
        c.rect(0, h - TITRE_CARTE_H, w, TITRE_CARTE_H, stroke=0, fill=1)
        c.restoreState()

        c.setStrokeColor(LINE)
        c.setLineWidth(0.7)
        c.roundRect(0, 0, w, h, r, stroke=1, fill=0)
        c.line(0, h - TITRE_CARTE_H, w, h - TITRE_CARTE_H)

        _, th = self.title_par.wrap(w - 2 * self.pad, TITRE_CARTE_H)
        self.title_par.drawOn(c, self.pad, h - TITRE_CARTE_H + (TITRE_CARTE_H - th) / 2)
        self.corps.drawOn(c, self.pad, h - TITRE_CARTE_H - self.pad_top - self._bh)


# ================================================================ Styles
def _build_styles():
    base = getSampleStyleSheet()

    def ps(name, **kw):
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        "title": ps("title", fontName="Helvetica-Bold", fontSize=21, leading=24, textColor=NAVY),
        "subtitle": ps("subtitle", fontName="Helvetica", fontSize=11, leading=14, textColor=TEXT),
        "meta_label": ps("meta_label", fontName="Helvetica", fontSize=8.6, leading=11, textColor=TEXT),
        "meta_value": ps("meta_value", fontName="Helvetica", fontSize=8.6, leading=11, textColor=TEXT),
        "meta_value_big": ps("meta_value_big", fontName="Helvetica-Bold", fontSize=10.5, leading=12, textColor=NAVY),
        "card_title": ps("card_title", fontName="Helvetica-Bold", fontSize=9.6, leading=11.5, textColor=NAVY),
        "info_label": ps("info_label", fontName="Helvetica-Bold", fontSize=8.4, leading=10.5, textColor=NAVY),
        "info_value": ps("info_value", fontName="Helvetica", fontSize=8.4, leading=10.5, textColor=TEXT),
        "sub_title": ps("sub_title", fontName="Helvetica-Bold", fontSize=9.6, leading=11.5, textColor=NAVY),
        "th": ps("th", fontName="Helvetica-Bold", fontSize=7.8, leading=9.5, textColor=NAVY),
        "td": ps("td", fontName="Helvetica", fontSize=8.1, leading=10, textColor=TEXT),
        "td_bold": ps("td_bold", fontName="Helvetica-Bold", fontSize=8.1, leading=10, textColor=TEXT),
        "sum_label": ps("sum_label", fontName="Helvetica", fontSize=7.2, leading=9, textColor=MUTED, alignment=TA_CENTER),
        "hist": ps("hist", fontName="Helvetica", fontSize=7.4, leading=9, textColor=TEXT),
        "hist_muted": ps("hist_muted", fontName="Helvetica-Oblique", fontSize=7.2, leading=9, textColor=MUTED),
        "obs_title": ps("obs_title", fontName="Helvetica-Bold", fontSize=9.4, leading=11.5, textColor=NAVY),
        "obs_text": ps("obs_text", fontName="Helvetica", fontSize=8.4, leading=11, textColor=TEXT),
        "fait": ps("fait", fontName="Helvetica", fontSize=8.4, leading=11, textColor=TEXT, alignment=TA_RIGHT),
        "sign": ps("sign", fontName="Helvetica", fontSize=8.6, leading=11, textColor=TEXT, alignment=TA_CENTER),
    }


def _no_pad(extra=None):
    cmds = [
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]
    return TableStyle(cmds + (extra or []))


# ================================================================ Blocs
def _bloc_titre(dossier, styles):
    """Titre à gauche, cadre N° dossier / date / statut à droite."""
    gauche = [
        Spacer(1, 3 * mm),
        Paragraph("DOSSIER HÔTELS", styles["title"]),
        Paragraph("Réservations et hébergements", styles["subtitle"]),
    ]
    libelle, fond = STATUTS_GLOBAUX.get(dossier.statut_global, STATUTS_GLOBAUX["en_cours"])
    cree = dossier.date_creation.date() if getattr(dossier, "date_creation", None) else date.today()
    rows = [
        [Paragraph("N° Dossier :", styles["meta_label"]), Paragraph(_safe(dossier.numero_dossier), styles["meta_value_big"])],
        [Paragraph("Date de création :", styles["meta_label"]), Paragraph(_fmt_date(cree), styles["meta_value"])],
        [Paragraph("Statut global :", styles["meta_label"]), _Pill(libelle, fond, WHITE, largeur=28 * mm, hauteur=5 * mm, taille=7.6)],
    ]
    meta = Table(rows, colWidths=[34 * mm, 42 * mm])
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLUE_SOFT),
        ("ROUNDEDCORNERS", [10, 10, 10, 10]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, -1), 4.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.4 * mm),
    ]))
    t = Table([[gauche, meta]], colWidths=[LARGEUR - 76 * mm, 76 * mm])
    t.setStyle(_no_pad([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    return t


def _carte_infos_generales(dossier, styles, largeur):
    def ligne(label, valeur):
        return [Paragraph(label, styles["info_label"]), Paragraph(_safe(valeur), styles["info_value"])]

    rows = [
        ligne("Agence :", dossier.agence_nom),
        ligne("Circuit :", dossier.circuit_nom),
        ligne("Nombre de personnes :", dossier.nb_personnes),
        ligne("Nombre de chambres :", dossier.nb_chambres),
        ligne("Durée du séjour :", _duree_sejour(dossier)),
    ]
    corps = Table(rows, colWidths=[36 * mm, largeur - 8 * mm - 36 * mm])
    corps.setStyle(_no_pad([("TOPPADDING", (0, 0), (-1, -1), 1.0 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.0 * mm),
                            ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return _Card("1. Informations générales", corps, largeur, styles)


def _carte_vol(dossier, styles, largeur):
    def colonne(titre, d, h, vol, comp):
        rows = [
            [Paragraph(titre, styles["sub_title"]), ""],
            [Paragraph("Date :", styles["info_label"]), Paragraph(_fmt_date(d), styles["info_value"])],
            [Paragraph("Heure :", styles["info_label"]), Paragraph(_fmt_heure(h), styles["info_value"])],
            [Paragraph("N° Vol :", styles["info_label"]), Paragraph(_safe(vol), styles["info_value"])],
            [Paragraph("Compagnie :", styles["info_label"]), Paragraph(_safe(comp), styles["info_value"])],
        ]
        t = Table(rows, colWidths=[19 * mm, 18.5 * mm])
        t.setStyle(_no_pad([("SPAN", (0, 0), (1, 0)), ("BOTTOMPADDING", (0, 0), (-1, 0), 1.2 * mm),
                            ("TOPPADDING", (0, 1), (-1, -1), 1.0 * mm), ("BOTTOMPADDING", (0, 1), (-1, -1), 1.0 * mm),
                            ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        return t

    corps = Table(
        [[colonne("Arrivée", dossier.date_arrivee, dossier.heure_arrivee, dossier.numero_vol_arrivee, dossier.compagnie_arrivee),
          colonne("Départ", dossier.date_depart, dossier.heure_depart, dossier.numero_vol_depart, dossier.compagnie_depart)]],
        colWidths=[(largeur - 8 * mm) / 2] * 2,
    )
    corps.setStyle(_no_pad([("LINEAFTER", (0, 0), (0, 0), 0.6, LINE), ("LEFTPADDING", (1, 0), (1, 0), 3 * mm),
                            ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return _Card("2. Informations du vol", corps, largeur, styles)


def _tableau_reservations(dossier, styles):
    """Un seul tableau (titre + en-têtes + lignes) : peut se couper sur
    plusieurs pages si le dossier compte beaucoup de réservations."""
    widths = [37.7 * mm, 38.6 * mm, 27.3 * mm, 36.4 * mm, 42 * mm]
    entetes = ["Hôtel", "Passage", "État", "Hôtel de remplacement", "Observations"]
    data = [
        [Paragraph("3. Tableau des réservations hôtelières", styles["card_title"]), "", "", "", ""],
        [Paragraph(h, styles["th"]) for h in entetes],
    ]
    if not dossier.reservations:
        data.append([Paragraph("Aucune réservation pour ce dossier.", styles["td"]), "", "", "", ""])
    for r in dossier.reservations:
        etat = _val(r.etat)
        fond, texte, _ = COULEURS_ETAT.get(etat, COULEURS_ETAT["en_attente"])
        pension = _val(r.type_pension)
        obs = (r.observations or "").strip() or (str(pension).replace("_", " ").capitalize() if pension else "")
        data.append([
            Paragraph(_safe(r.hotel.nom if r.hotel else None), styles["td_bold"]),
            Paragraph(_fmt_passage(r), styles["td"]),
            _Pill(LABELS_ETAT.get(etat, str(etat)), fond, texte),
            Paragraph(_safe(r.hotel_remplacement.nom if r.hotel_remplacement else None, "-"), styles["td"]),
            Paragraph(_safe(obs, "-"), styles["td"]),
        ])
    t = Table(data, colWidths=widths, repeatRows=2)
    style = [
        ("SPAN", (0, 0), (-1, 0)),
        *([("SPAN", (0, 2), (-1, 2))] if not dossier.reservations else []),
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_SOFT),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, LINE),
        ("LINEBELOW", (0, 1), (-1, 1), 0.6, LINE),
        ("INNERGRID", (0, 1), (-1, -1), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("ROUNDEDCORNERS", [9, 9, 9, 9]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 2), (2, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, 0), 0), ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 1.6 * mm), ("BOTTOMPADDING", (0, 1), (-1, 1), 1.6 * mm),
        ("TOPPADDING", (0, 2), (-1, -1), 1.15 * mm), ("BOTTOMPADDING", (0, 2), (-1, -1), 1.15 * mm),
    ]
    t.setStyle(TableStyle(style))
    t._argH[0] = TITRE_CARTE_H
    return t


def _carte_resume(dossier, styles, largeur):
    compte = {k: 0 for k in LABELS_ETAT}
    for r in dossier.reservations or []:
        k = _val(r.etat)
        if k in compte:
            compte[k] += 1
    ordre = [("confirmee", "Confirmées"), ("en_attente", "En attente"), ("option", "Options"),
             ("refusee", "Refusées"), ("annulee", "Annulées")]
    dots, labels, nombres = [], [], []
    for cle, label in ordre:
        coul = COULEURS_ETAT[cle][2]
        dots.append(_Dot(coul))
        labels.append(Paragraph(label, styles["sum_label"]))
        nombres.append(Paragraph(
            str(compte[cle]),
            ParagraphStyle(f"n_{cle}", parent=styles["sum_label"], fontName="Helvetica-Bold", fontSize=13, leading=16,
                           textColor=coul if compte[cle] else TEXT),
        ))
    w = (largeur - 8 * mm) / 5
    corps = Table([dots, labels, nombres], colWidths=[w] * 5)
    corps.setStyle(_no_pad([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEAFTER", (0, 0), (3, -1), 0.5, LINE),
        ("TOPPADDING", (0, 1), (-1, 1), 1.6 * mm), ("TOPPADDING", (0, 2), (-1, 2), 1 * mm),
    ]))
    return _Card("4. Résumé des statuts", corps, largeur, styles)


def _carte_historique(dossier, styles, largeur):
    entrees, masquees = _historique_visible(dossier)
    rows = []
    if masquees:
        rows.append(["", Paragraph(f"… {masquees} entrée{'s' if masquees > 1 else ''} plus ancienne{'s' if masquees > 1 else ''}", styles["hist_muted"]), "", ""])
    for h in entrees:
        nom = getattr(getattr(h, "utilisateur", None), "nom", None) or ""
        prenom = nom.split()[0] if nom.strip() else "—"
        texte = _safe(h.action) + (f" ({h.details})" if getattr(h, "details", None) else "")
        rows.append([
            _Dot(NAVY, 1.8 * mm),
            Paragraph(h.date_action.strftime("%d/%m/%Y %H:%M") if h.date_action else "—", styles["hist"]),
            Paragraph(_safe(prenom), styles["hist"]),
            Paragraph(texte, styles["hist"]),
        ])
    if not entrees:
        rows.append(["", Paragraph("Aucune modification enregistrée.", styles["hist_muted"]), "", ""])
    inner = largeur - 8 * mm
    corps = Table(rows, colWidths=[4 * mm, 25.5 * mm, 11 * mm, inner - 40.5 * mm])
    corps.setStyle(_no_pad([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 0.9 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.9 * mm),
                            ("SPAN", (1, 0), (3, 0)) if (masquees or not entrees) else ("NOP", (0, 0), (0, 0))]))
    return _Card("5. Historique des modifications", corps, largeur, styles)


def _deux_cartes(gauche, droite, gap=6 * mm):
    """Range deux cartes côte à côte, à hauteur égale."""
    hauteur = max(gauche.hauteur_naturelle(), droite.hauteur_naturelle())
    gauche.hauteur_min = droite.hauteur_min = hauteur
    t = Table([[gauche, "", droite]], colWidths=[gauche.w, gap, droite.w])
    t.setStyle(_no_pad([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def _bloc_observations(dossier, styles):
    gauche = [
        Table([[_Dot(NAVY, 2.6 * mm), Paragraph("Observations générales", styles["obs_title"])]],
              colWidths=[5.5 * mm, 90 * mm],
              style=_no_pad([("VALIGN", (0, 0), (-1, -1), "MIDDLE")])),
        Spacer(1, 1 * mm),
        Table([["", Paragraph(_safe(dossier.observations, "Aucune observation."), styles["obs_text"])]],
              colWidths=[5.5 * mm, 90 * mm], style=_no_pad()),
    ]
    droite = [
        Paragraph(f"Fait à {LIEU_EDITION}, le {_fmt_date(date.today())}", styles["fait"]),
        Spacer(1, 2 * mm),
        Table([[Paragraph("Signature / Validation", styles["sign"])]], colWidths=[62 * mm],
              style=_no_pad([("LINEBELOW", (0, 0), (-1, -1), 0.9, NAVY), ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm)])),
    ]
    t = Table([[gauche, droite]], colWidths=[LARGEUR - 66 * mm, 66 * mm])
    t.setStyle(_no_pad([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                        ("LINEABOVE", (0, 0), (-1, 0), 0.6, LINE), ("TOPPADDING", (0, 0), (-1, -1), 2.8 * mm)]))
    return t


# ================================================================ Canvas
class _CanvasHotel(pdfcanvas.Canvas):
    """Dessine l'en-tête (page 1) et le pied de page « Page X/Y »."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._page_states = []

    def showPage(self):
        self._page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._page_states)
        for state in self._page_states:
            self.__dict__.update(state)
            if self._pageNumber == 1:
                self._draw_header()
            self._draw_footer(total)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    # -- helpers coordonnées : y mesuré depuis le haut de la page
    @staticmethod
    def _top(depuis_haut):
        return PAGE_H - depuis_haut

    def _draw_header(self):
        c = self
        # Courbe bleu marine + filet or (coin haut droit)
        c.saveState()
        c.setFillColor(NAVY)
        p = c.beginPath()
        p.moveTo(146 * mm, self._top(34.6 * mm))
        p.curveTo(172 * mm, self._top(33 * mm), 193 * mm, self._top(19 * mm), 204 * mm, self._top(0))
        p.lineTo(PAGE_W, self._top(0))
        p.lineTo(PAGE_W, self._top(17 * mm))
        p.curveTo(190 * mm, self._top(27 * mm), 168 * mm, self._top(34.8 * mm), 146 * mm, self._top(34.6 * mm))
        p.close()
        c.drawPath(p, stroke=0, fill=1)
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.3)
        g = c.beginPath()
        g.moveTo(131 * mm, self._top(33.6 * mm))
        g.curveTo(168 * mm, self._top(31.5 * mm), 190 * mm, self._top(17 * mm), 200 * mm, self._top(0))
        c.drawPath(g, stroke=1, fill=0)
        c.restoreState()

        # Slogan incliné
        c.saveState()
        c.translate(132 * mm, self._top(24.5 * mm))
        c.rotate(9)
        c.setFillColor(NAVY)
        c.setFont("Times-BoldItalic", 15)
        c.drawString(0, 6.5 * mm, SLOGAN_HAUT[0])
        c.drawString(6 * mm, 0, SLOGAN_HAUT[1])
        c.restoreState()

        # Logo
        reader, ratio = _logo_reader()
        if reader is not None:
            lw = 32 * mm
            lh = lw / ratio
            c.drawImage(reader, MARGE + 1 * mm, self._top(9 * mm + lh), width=lw, height=lh, mask="auto")

        # Nom + baseline
        nom = _env("INVOICE_COMPANY_NAME", "EURAFR TOURS")
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 24.5)
        c.drawString(51.5 * mm, self._top(22.6 * mm), nom)
        c.setFillColor(GOLD)
        c.setFont("Times-Italic", 13)
        c.drawString(52 * mm, self._top(28.6 * mm), "Agence de Voyages")

        # Adresse à puces
        c.setFont("Helvetica", 8.8)
        y = 34.6 * mm
        for ligne in ADRESSE_LIGNES:
            c.setFillColor(NAVY)
            c.circle(MARGE + 2.3 * mm, self._top(y - 1 * mm), 1.15 * mm, stroke=0, fill=1)
            c.setFillColor(TEXT)
            c.drawString(MARGE + 6.6 * mm, self._top(y), ligne)
            y += 3.65 * mm

        # Filet de séparation
        c.setStrokeColor(NAVY)
        c.setLineWidth(0.9)
        c.line(MARGE, self._top(51.2 * mm), PAGE_W - MARGE, self._top(51.2 * mm))

    def _draw_footer(self, total):
        c = self
        c.setStrokeColor(NAVY)
        c.setLineWidth(0.9)
        c.line(MARGE, 16 * mm, PAGE_W - MARGE, 16 * mm)
        c.setFont("Helvetica", 7.4)
        x = MARGE + 1 * mm
        for texte in (_env("INVOICE_COMPANY_PHONE", "+216 72 266 899"),
                      _env("INVOICE_COMPANY_EMAIL", "eurafr.tours@orange.tn"),
                      ADRESSE_PIED):
            c.setFillColor(NAVY)
            c.circle(x + 0.9 * mm, 12.2 * mm, 0.9 * mm, stroke=0, fill=1)
            c.setFillColor(TEXT)
            c.drawString(x + 3.2 * mm, 11.4 * mm, texte)
            x += 3.2 * mm + c.stringWidth(texte, "Helvetica", 7.4) + 6 * mm
        c.setFillColor(NAVY)
        c.setFont("Times-Italic", 10)
        c.drawRightString(PAGE_W - MARGE, 11.4 * mm, SLOGAN_BAS)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.2)
        c.drawCentredString(PAGE_W / 2, 6.6 * mm, f"Page {self._pageNumber}/{total}")


# ================================================================ Génération
def generer_dossier_hotel_pdf(dossier: "models.DossierHotel") -> bytes:
    buffer = io.BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        title=f"Dossier hôtelier {dossier.numero_dossier}",
        author=_env("INVOICE_COMPANY_NAME", "EURAFR TOURS"),
    )
    frame_1 = Frame(MARGE, BAS, LARGEUR, PAGE_H - HAUT_PAGE1 - BAS, id="p1",
                    leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame_n = Frame(MARGE, BAS, LARGEUR, PAGE_H - HAUT_SUITE - BAS, id="pn",
                    leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="premiere", frames=[frame_1]),
        PageTemplate(id="suite", frames=[frame_n]),
    ])

    styles = _build_styles()
    gap = 6 * mm
    col = (LARGEUR - gap) / 2

    elements = [
        NextPageTemplate("suite"),
        _bloc_titre(dossier, styles),
        Spacer(1, 3.2 * mm),
        _deux_cartes(_carte_infos_generales(dossier, styles, col), _carte_vol(dossier, styles, col), gap),
        Spacer(1, 3.2 * mm),
        _tableau_reservations(dossier, styles),
        Spacer(1, 3.2 * mm),
        _bloc_observations(dossier, styles),
    ]
    doc.build(elements, canvasmaker=_CanvasHotel)
    return buffer.getvalue()
