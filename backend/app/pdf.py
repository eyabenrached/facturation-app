import io
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from . import models
from .num2words_fr import montant_ttc_en_lettres

LABELS_TYPE_VEHICULE = {
    "mini_bus": "Mini bus",
    "quatre_quatre": "4x4",
    "microbus": "Microbus",
    "bus": "Bus",
}


def _label_vehicule(vehicule) -> str:
    """Formate '<matricule> (<type>)' à partir d'un objet Vehicule, ou '—' si absent."""
    if not vehicule:
        return "—"
    valeur_type = vehicule.type_vehicule.value if hasattr(vehicule.type_vehicule, "value") else vehicule.type_vehicule
    label_type = LABELS_TYPE_VEHICULE.get(valeur_type, valeur_type)
    return f"{vehicule.matricule} ({label_type})"


class _CanvasNumerote(pdfcanvas.Canvas):
    """Canvas ReportLab qui ajoute un pied de page 'Page X/Y' sur chaque page,
    en mémorisant l'état de chaque page avant de connaître le total (nécessaire
    pour afficher le nombre total de pages, connu seulement à la fin du document)."""

    def __init__(self, *args, **kwargs):
        pdfcanvas.Canvas.__init__(self, *args, **kwargs)
        self._etats_pages = []

    def showPage(self):
        self._etats_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_pages = len(self._etats_pages)
        for etat in self._etats_pages:
            self.__dict__.update(etat)
            self._dessiner_pied_de_page(total_pages)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _dessiner_pied_de_page(self, total_pages):
        page_width, _ = A4
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#667085"))
        texte = f"Page {self._pageNumber}/{total_pages}"
        self.drawRightString(page_width - 18 * mm, 12 * mm, texte)
        self.setStrokeColor(colors.HexColor("#E3E6EC"))
        self.line(18 * mm, 16 * mm, page_width - 18 * mm, 16 * mm)


def _generer_facture_pdf_generique(
    buffer, *, numero_facture, date_debut, date_fin, client_nom, client_responsable,
    lignes, montant_ht, taux_tva, montant_tva, montant_ttc,
):
    """Coeur commun aux factures classiques et aux factures location : construit le
    PDF à partir de valeurs déjà "aplaties" (pas de dépendance à un modèle précis)."""
    page_width, page_height = A4
    logo_path = os.path.join(os.path.dirname(__file__), "static", "logo.png")
    logo_exists = os.path.exists(logo_path)
    logo_w = 40 * mm
    logo_h = 40 * mm

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20 * mm, bottomMargin=26 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleFacture", parent=styles["Heading1"], fontSize=20, textColor=colors.HexColor("#1F3864")
    )
    normal = styles["Normal"]

    elements = []

    meta_lines = [
        f"N° {numero_facture}",
        f"Période : du {date_debut.strftime('%d/%m/%Y')} au {date_fin.strftime('%d/%m/%Y')}",
        f"Client : {client_nom}",
    ]
    if client_responsable:
        meta_lines.append(f"Responsable : {client_responsable}")

    if logo_exists:
        usable_width = page_width - doc.leftMargin - doc.rightMargin
        col1_w = logo_w + 4 * mm
        col2_w = usable_width - col1_w

        left_img = Image(logo_path, width=logo_w, height=logo_h)

        right_flow = [Paragraph("FACTURE", title_style), Spacer(1, 4 * mm)]
        right_flow += [Paragraph(ligne, normal) for ligne in meta_lines]

        header_table = Table([[left_img, right_flow]], colWidths=[col1_w, col2_w])
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 6 * mm))
    else:
        elements.append(Paragraph("FACTURE", title_style))
        elements.append(Spacer(1, 4 * mm))
        for ligne in meta_lines:
            elements.append(Paragraph(ligne, normal))
        elements.append(Spacer(1, 8 * mm))

    data = [["Date", "Heure", "Circuit", "Véhicule", "Prix (TND)"]]
    for ligne in lignes:
        data.append([
            ligne["date"].strftime("%d/%m/%Y"),
            ligne["heure"].strftime("%H:%M"),
            ligne["circuit"],
            ligne.get("vehicule", "—"),
            f"{ligne['prix']:.3f}",
        ])

    table = Table(data, colWidths=[22 * mm, 16 * mm, 62 * mm, 32 * mm, 28 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F3864")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F2F2")]),
        ("ALIGN", (4, 0), (4, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 8 * mm))

    recap_data = [
        ["Montant HT", f"{montant_ht:.3f} TND"],
        [f"TVA ({taux_tva:.1f} %)", f"{montant_tva:.3f} TND"],
        ["Montant TTC", f"{montant_ttc:.3f} TND"],
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

    montant_lettres = montant_ttc_en_lettres(montant_ttc)
    arrete_style = ParagraphStyle(
        "ArreteFacture", parent=normal, fontName="Helvetica-Oblique", fontSize=10, leading=14
    )
    elements.append(Paragraph(
        f"Arrêtée la présente facture à la somme de : {montant_lettres}.",
        arrete_style,
    ))
    elements.append(Spacer(1, 6 * mm))

    doc.build(elements, canvasmaker=_CanvasNumerote)


def generer_facture_pdf(facture: models.Facture) -> bytes:
    buffer = io.BytesIO()
    lignes = [
        {
            "date": m.date,
            "heure": m.heure,
            "circuit": f"{m.circuit.point_depart} -> {m.circuit.point_arrivee}",
            "vehicule": _label_vehicule(m.vehicule),
            "prix": float(m.prix_applique),
        }
        for m in facture.mouvements
    ]
    _generer_facture_pdf_generique(
        buffer,
        numero_facture=facture.numero_facture,
        date_debut=facture.date_debut,
        date_fin=facture.date_fin,
        client_nom=facture.client.nom_societe,
        client_responsable=facture.client.responsable,
        lignes=lignes,
        montant_ht=float(facture.montant_ht),
        taux_tva=float(facture.taux_tva),
        montant_tva=float(facture.montant_tva),
        montant_ttc=float(facture.montant_ttc),
    )
    return buffer.getvalue()


def generer_facture_location_pdf(facture: "models.FactureLocation") -> bytes:
    buffer = io.BytesIO()
    lignes = [
        {
            "date": m.date,
            "heure": m.heure,
            "circuit": m.circuit,
            "vehicule": _label_vehicule(m.vehicule),
            "prix": float(m.prix),
        }
        for m in facture.mouvements
    ]
    _generer_facture_pdf_generique(
        buffer,
        numero_facture=facture.numero_facture,
        date_debut=facture.date_debut,
        date_fin=facture.date_fin,
        client_nom=facture.client,
        client_responsable=None,
        lignes=lignes,
        montant_ht=float(facture.montant_ht),
        taux_tva=float(facture.taux_tva),
        montant_tva=float(facture.montant_tva),
        montant_ttc=float(facture.montant_ttc),
    )
    return buffer.getvalue()