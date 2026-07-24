import io
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from . import models
from .num2words_fr import montant_ttc_en_lettres


def generer_facture_pdf(facture: models.Facture) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20 * mm, bottomMargin=20 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleFacture", parent=styles["Heading1"], fontSize=20, textColor=colors.HexColor("#1F3864")
    )
    normal = styles["Normal"]

    elements = []
    elements.append(Paragraph("FACTURE", title_style))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(f"N° {facture.numero_facture}", normal))
    elements.append(Paragraph(f"Période : du {facture.date_debut.strftime('%d/%m/%Y')} au {facture.date_fin.strftime('%d/%m/%Y')}", normal))
    elements.append(Paragraph(f"Client : {facture.client.nom_societe}", normal))
    elements.append(Paragraph(f"Responsable : {facture.client.responsable}", normal))
    elements.append(Spacer(1, 8 * mm))

    data = [["Date", "Heure", "Circuit", "Prix (TND)"]]
    for m in facture.mouvements:
        circuit_txt = f"{m.circuit.point_depart} -> {m.circuit.point_arrivee}"
        data.append([
            m.date.strftime("%d/%m/%Y"),
            m.heure.strftime("%H:%M"),
            circuit_txt,
            f"{float(m.prix_applique):.3f}",
        ])

    table = Table(data, colWidths=[28 * mm, 20 * mm, 85 * mm, 30 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F3864")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F2F2")]),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 8 * mm))

    recap_data = [
        ["Montant HT", f"{float(facture.montant_ht):.3f} TND"],
        [f"TVA ({float(facture.taux_tva):.1f} %)", f"{float(facture.montant_tva):.3f} TND"],
        ["Montant TTC", f"{float(facture.montant_ttc):.3f} TND"],
    ]
    recap = Table(recap_data, colWidths=[120 * mm, 43 * mm])
    recap.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("LINEABOVE", (0, 2), (-1, 2), 1, colors.HexColor("#1F3864")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    elements.append(recap)
    elements.append(Spacer(1, 6 * mm))

    montant_lettres = montant_ttc_en_lettres(float(facture.montant_ttc))
    arrete_style = ParagraphStyle(
        "ArreteFacture", parent=normal, fontName="Helvetica-Oblique", fontSize=10, leading=14
    )
    elements.append(Paragraph(
        f"Arrêtée la présente facture à la somme de : {montant_lettres}.",
        arrete_style,
    ))
    elements.append(Spacer(1, 6 * mm))
    elements.append(Paragraph(f"Statut : {facture.statut.value.upper()}", normal))

    doc.build(elements)
    return buffer.getvalue()