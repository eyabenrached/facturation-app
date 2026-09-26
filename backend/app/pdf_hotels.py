"""PDF du dossier hôtelier — même habillage visuel que les factures (pdf.py) :
même en-tête société, mêmes badges de section (bleu marine), même style de
tableau, même zone cachet/signature. Fichier séparé de `pdf.py` pour ne pas
toucher à un fichier existant déjà volumineux : tout est réimporté depuis lui.
"""

import io
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import models
from .pdf import (
    NAVY, BLUE_SOFT, BLUE_PALE, LINE, TEXT, MUTED, WHITE,
    _CanvasNumerote, _env, _safe, _company_block, _badge_title,
    _signature_area, _bank_info,
)

LABELS_ETAT = {
    "en_attente": "En attente",
    "option": "Option",
    "confirmee": "Confirmée",
    "refusee": "Refusée",
    "annulee": "Annulée",
}

COULEURS_ETAT = {
    "en_attente": MUTED,
    "option": colors.HexColor("#B7791F"),
    "confirmee": colors.HexColor("#15803D"),
    "refusee": colors.HexColor("#B91C1C"),
    "annulee": colors.HexColor("#6B7280"),
}


def _fmt_date(value) -> str:
    return value.strftime("%d/%m/%Y") if value else "—"


def _fmt_heure(value) -> str:
    return value.strftime("%H:%M") if value else "—"


def _fmt_passage(reservation: "models.ReservationHotel") -> str:
    return f"{_fmt_date(reservation.date_arrivee)} → {_fmt_date(reservation.date_depart)}"


def _dossier_meta(dossier, styles):
    """Cadre d'informations en haut à droite, même gabarit que `_invoice_meta`
    (N° Facture / Date) côté factures."""
    rows = [
        [Paragraph("N° Dossier", styles["meta_label"]), Paragraph(f":  {_safe(dossier.numero_dossier)}", styles["meta_value"])],
        [Paragraph("Date", styles["meta_label"]), Paragraph(f":  {_fmt_date(dossier.date_creation.date())}", styles["meta_value"])],
    ]
    table = Table(rows, colWidths=[38 * mm, 52 * mm])
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBFCFE")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1 * mm),
    ]))
    return table


def _info_row(styles, label: str, valeur):
    return [Paragraph(f"{label}", styles["info_label"]), Paragraph(f":  {_safe(valeur)}", styles["info_value"])]


def _dossier_et_passage_info(dossier, styles):
    """Bloc à deux colonnes sous le même gabarit visuel que `_client_info` :
    deux badges bleu marine ("DOSSIER" / "VOL") côte à côte, avec un cadre
    commun, une ligne de séparation verticale et le même style de lignes
    label/valeur."""
    rows_left = [
        _info_row(styles, "Agence", dossier.agence.nom_agence if dossier.agence else None),
        _info_row(
            styles, "Circuit",
            f"{dossier.circuit.point_depart} → {dossier.circuit.point_arrivee}" if dossier.circuit else None,
        ),
        _info_row(styles, "Nb personnes", dossier.nb_personnes),
        _info_row(styles, "Nb chambres", dossier.nb_chambres),
    ]

    rows_right = [
        _info_row(styles, "Arrivée", f"{_fmt_date(dossier.date_arrivee)}  {_fmt_heure(dossier.heure_arrivee)}"),
        _info_row(styles, "N° Vol / Aér.", f"{_safe(dossier.numero_vol_arrivee)} / {_safe(dossier.compagnie_arrivee)}"),
        _info_row(styles, "Départ", f"{_fmt_date(dossier.date_depart)}  {_fmt_heure(dossier.heure_depart)}"),
        _info_row(styles, "N° Vol / Aér.", f"{_safe(dossier.numero_vol_depart)} / {_safe(dossier.compagnie_depart)}"),
    ]

    left = Table(rows_left, colWidths=[26 * mm, 50 * mm])
    right = Table(rows_right, colWidths=[26 * mm, 50 * mm])
    for t in (left, right):
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1.1 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.1 * mm),
        ]))

    block = Table(
        [
            [_badge_title("Dossier", styles), _badge_title("Vol / Passage", styles)],
            [left, right],
        ],
        colWidths=[84 * mm, 84 * mm],
    )
    block.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("LINEBEFORE", (1, 0), (1, -1), 0.8, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, 0), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 1.5 * mm),
        ("TOPPADDING", (0, 1), (-1, 1), 2 * mm),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 2.5 * mm),
    ]))
    return block


def _tableau_reservations(dossier, styles):
    """Même gabarit visuel que `_table_facture` : en-tête BLUE_SOFT / texte
    NAVY, grille fine, lignes alternées blanc/bleu très pâle."""
    entetes = ["HÔTEL", "PASSAGE", "ÉTAT", "HÔTEL REMPLACEMENT", "OBSERVATIONS"]
    data = [[Paragraph(h, styles["table_header"]) for h in entetes]]

    if not dossier.reservations:
        data.append([
            Paragraph("Aucune réservation pour ce dossier.", styles["table_cell"]), "", "", "", ""
        ])
    else:
        for r in dossier.reservations:
            etat_val = getattr(r.etat, "value", r.etat)
            etat_style = ParagraphStyle(
                f"etat_{etat_val}", parent=styles["table_cell"],
                textColor=COULEURS_ETAT.get(etat_val, TEXT), fontName="Helvetica-Bold",
            )
            data.append([
                Paragraph(_safe(r.hotel.nom if r.hotel else None), styles["table_cell"]),
                Paragraph(_fmt_passage(r), styles["table_cell_center"]),
                Paragraph(LABELS_ETAT.get(etat_val, etat_val), etat_style),
                Paragraph(_safe(r.hotel_remplacement.nom if r.hotel_remplacement else None, "—"), styles["table_cell"]),
                Paragraph(_safe(r.observations, "—"), styles["table_cell"]),
            ])

    widths = [34 * mm, 32 * mm, 22 * mm, 42 * mm, 48 * mm]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_SOFT),
        ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.55, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#FBFCFE")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, 0), 3.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 3.2 * mm),
        ("TOPPADDING", (0, 1), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3 * mm),
    ]))
    return table


def _observations_block(dossier, styles):
    """Même gabarit visuel que le cadre 'ARRÊTÉ LA PRÉSENTE FACTURE...' côté
    factures (titre bleu marine + fond bleu pâle)."""
    table = Table([
        [Paragraph("OBSERVATIONS GÉNÉRALES", styles["summary_title"])],
        [Paragraph(_safe(dossier.observations, "Aucune observation."), styles["amount_words"])],
    ], colWidths=[178 * mm])
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_PALE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    return table


def generer_dossier_hotel_pdf(dossier: "models.DossierHotel") -> bytes:
    buffer = io.BytesIO()
    logo_path = os.path.join(os.path.dirname(__file__), "static", "logo.png")

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=9 * mm,
        bottomMargin=21 * mm,
        title=f"Dossier hôtelier {dossier.numero_dossier}",
        author=_env("INVOICE_COMPANY_NAME", "EURAFR TOURS"),
    )

    # Dictionnaire de styles strictement identique (mêmes clés, mêmes
    # tailles/couleurs) à celui de `_build_invoice_pdf` dans pdf.py, pour un
    # rendu visuel indissociable des factures.
    base = getSampleStyleSheet()
    styles = {
        "company_name": ParagraphStyle("company_name", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=14.5, leading=15.5, textColor=NAVY),
        "company_info": ParagraphStyle("company_info", parent=base["Normal"], fontName="Helvetica", fontSize=8.2, leading=10, textColor=TEXT),
        "invoice_title": ParagraphStyle("invoice_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=22, leading=23, textColor=NAVY, alignment=TA_RIGHT),
        "meta_label": ParagraphStyle("meta_label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.6, leading=10.5, textColor=TEXT),
        "meta_value": ParagraphStyle("meta_value", parent=base["Normal"], fontName="Helvetica", fontSize=8.6, leading=10.5, textColor=TEXT),
        "section_badge": ParagraphStyle("section_badge", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.8, leading=10, textColor=WHITE, alignment=TA_CENTER),
        "info_label": ParagraphStyle("info_label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=10.5, textColor=TEXT),
        "info_value": ParagraphStyle("info_value", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=10.5, textColor=TEXT),
        "table_header": ParagraphStyle("table_header", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.4, leading=8.8, textColor=NAVY, alignment=TA_CENTER),
        "table_cell": ParagraphStyle("table_cell", parent=base["Normal"], fontName="Helvetica", fontSize=8.1, leading=10.2, textColor=TEXT),
        "table_cell_center": ParagraphStyle("table_cell_center", parent=base["Normal"], fontName="Helvetica", fontSize=8.1, leading=10.2, textColor=TEXT, alignment=TA_CENTER),
        "summary_title": ParagraphStyle("summary_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.3, leading=10.5, textColor=NAVY),
        "amount_words": ParagraphStyle("amount_words", parent=base["Normal"], fontName="Helvetica-Oblique", fontSize=8.6, leading=12, textColor=TEXT),
        "signature_title": ParagraphStyle("signature_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=TEXT, alignment=TA_CENTER),
        "signature_text": ParagraphStyle("signature_text", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, textColor=TEXT, alignment=TA_CENTER),
    }

    # ============================================================
    # EN-TÊTE — identique en structure à celui des factures :
    # bloc société à gauche, titre + cadre méta à droite.
    # ============================================================
    company = _company_block(logo_path, styles)
    title = Paragraph("DOSSIER HÔTELIER", styles["invoice_title"])
    meta = _dossier_meta(dossier, styles)

    right_header = Table([[title], [Spacer(1, 1 * mm)], [meta]], colWidths=[90 * mm])
    right_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    header = Table([[company, "", right_header]], colWidths=[82 * mm, 6 * mm, 90 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    elements = [
        header,
        Spacer(1, 1.5 * mm),
        _dossier_et_passage_info(dossier, styles),
        Spacer(1, 3.5 * mm),
        _tableau_reservations(dossier, styles),
        Spacer(1, 3.5 * mm),
        _observations_block(dossier, styles),
        Spacer(1, 4 * mm),
        _signature_area(styles),
        Spacer(1, 1.5 * mm),
        _bank_info(base),
    ]

    doc.build(elements, canvasmaker=_CanvasNumerote)
    return buffer.getvalue()