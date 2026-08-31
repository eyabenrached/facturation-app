import io
import os
from datetime import timedelta
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


from reportlab.platypus import Flowable


class _StampFlowable(Flowable):
    def __init__(self, company_name: str):
        super().__init__()
        self.company_name = company_name
        self.width = 34 * mm
        self.height = 34 * mm

    def draw(self):
        c = self.canv
        cx, cy = self.width / 2, self.height / 2
        radius = 14 * mm
        c.saveState()
        c.setStrokeColor(NAVY)
        c.setLineWidth(1.1)
        c.circle(cx, cy, radius, stroke=1, fill=0)
        c.setLineWidth(0.6)
        c.circle(cx, cy, radius - 3.2 * mm, stroke=1, fill=0)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 7.2)
        c.drawCentredString(cx, cy + 7.5 * mm, self.company_name[:25])
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(cx, cy + 1.5 * mm, "Transport")
        c.drawCentredString(cx, cy - 1.8 * mm, "& Services")
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(cx, cy - 8.2 * mm, "★  TUNISIE  ★")
        c.restoreState()

from . import models
from .num2words_fr import montant_ttc_en_lettres

LABELS_TYPE_VEHICULE = {
    "mini_bus": "Mini bus",
    "quatre_quatre": "4x4",
    "microbus": "Microbus",
    "bus": "Bus",
}

NAVY = colors.HexColor("#173A6A")
NAVY_DARK = colors.HexColor("#0E2850")
BLUE_SOFT = colors.HexColor("#EEF3FB")
BLUE_PALE = colors.HexColor("#F6F8FC")
LINE = colors.HexColor("#CBD3DF")
TEXT = colors.HexColor("#1C2430")
MUTED = colors.HexColor("#667085")
GOLD = colors.HexColor("#C79A3B")
WHITE = colors.white


class _CanvasNumerote(pdfcanvas.Canvas):
    """Canvas qui permet d'afficher Page X/Y avec un pied de page discret."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._page_states = []

    def showPage(self):
        self._page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_pages = len(self._page_states)
        for state in self._page_states:
            self.__dict__.update(state)
            self._draw_footer(total_pages)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _draw_footer(self, total_pages):
        page_width, _ = A4
        self.setStrokeColor(LINE)
        self.setLineWidth(0.5)
        self.line(16 * mm, 15 * mm, page_width - 16 * mm, 15 * mm)
        self.setFillColor(MUTED)
        self.setFont("Helvetica", 7.5)
        self.drawString(16 * mm, 10.5 * mm, "Document généré automatiquement par le système de facturation")
        self.drawRightString(page_width - 16 * mm, 10.5 * mm, f"Page {self._pageNumber}/{total_pages}")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _label_vehicule(vehicule) -> str:
    if not vehicule:
        return "—"
    valeur_type = getattr(vehicule.type_vehicule, "value", vehicule.type_vehicule)
    label_type = LABELS_TYPE_VEHICULE.get(valeur_type, valeur_type)
    return f"{vehicule.matricule} ({label_type})"


def _fmt_money(value: float) -> str:
    return f"{float(value):,.3f}".replace(",", " ")


def _fmt_date(value) -> str:
    return value.strftime("%d/%m/%Y")


def _safe(value, fallback="—"):
    if value is None:
        return fallback
    value = str(value).strip()
    return value or fallback


def _paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(str(text).replace("&", "&amp;"), style)


def _company_block(logo_path: str, styles):
    """Bloc société stable et parfaitement aligné."""
    company_name = _env("INVOICE_COMPANY_NAME", "EURAFR TOURS")
    company_activity = _env("INVOICE_COMPANY_ACTIVITY", "Transport & Services")
    address = _env("INVOICE_COMPANY_ADDRESS", "Avenue Abou Dhabi - hammamet, Tunisie")
    phone = _env("INVOICE_COMPANY_PHONE", "+216 29 647 607")
    email = _env("INVOICE_COMPANY_EMAIL", "eurafr.tours@orange.tn")
    fiscal = _env("INVOICE_COMPANY_FISCAL_ID", "1289488S/A/M/000")

    if Path(logo_path).exists():
        logo = Image(logo_path, width=25 * mm, height=25 * mm, kind="proportional")
    else:
        logo = Spacer(25 * mm, 25 * mm)

    info = [
        Paragraph(_safe(company_name), styles["company_name"]),
        Paragraph(_safe(company_activity), styles["company_activity"]),
        Spacer(1, 1.5 * mm),
        Paragraph(f"<b>Adresse :</b> {_safe(address)}", styles["company_info"]),
        Paragraph(f"<b>Tél :</b> {_safe(phone)}", styles["company_info"]),
        Paragraph(f"<b>Email :</b> {_safe(email)}", styles["company_info"]),
        Paragraph(f"<b>Matricule fiscal :</b> {_safe(fiscal)}", styles["company_info"]),
    ]

    table = Table([[logo, info]], colWidths=[28 * mm, 66 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table

def _invoice_meta(facture, styles):
    """Cadre des informations de facture."""
    date_facture = facture.date_fin
    echeance_days = int(_env("INVOICE_PAYMENT_TERMS_DAYS", "7") or 7)

    rows = [
        [Paragraph("N° Facture", styles["meta_label"]), Paragraph(f":  {_safe(facture.numero_facture)}", styles["meta_value"])],
        [Paragraph("Date", styles["meta_label"]), Paragraph(f":  {_fmt_date(date_facture)}", styles["meta_value"])],
    ]

    table = Table(rows, colWidths=[38 * mm, 52 * mm])
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBFCFE")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]))
    return table

def _badge_title(text: str, styles):
    return Table([[Paragraph(text.upper(), styles["section_badge"])]], colWidths=[31 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.6 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6 * mm),
    ]))

def _client_info(facture, styles):
    client = facture.client

    responsible = _safe(getattr(client, "responsable", None))
    adresse = _safe(getattr(client, "adresse", None))
    matricule_fiscal = _safe(getattr(client, "matricule_fiscal", None))

    # Informations client
    rows_left = [
        [
            Paragraph("Nom du client", styles["info_label"]),
            Paragraph(
                f":  {_safe(client.nom_societe)}",
                styles["info_value"]
            ),
        ],
        [
            Paragraph("Adresse", styles["info_label"]),
            Paragraph(
                f":  {adresse}",
                styles["info_value"]
            ),
        ],
        [
            Paragraph("Matricule fiscal", styles["info_label"]),
            Paragraph(
                f":  {matricule_fiscal}",
                styles["info_value"]
            ),
        ],

    ]

    # Informations facture
    period = (
        f"{_fmt_date(facture.date_debut)}  →  "
        f"{_fmt_date(facture.date_fin)}"
    )

    service = _env(
        "INVOICE_SERVICE_LABEL",
        "Transport de personnel"
    )

    rows_right = [
        [
            Paragraph("Période", styles["info_label"]),
            Paragraph(
                f":  {period}",
                styles["info_value"]
            ),
        ],
        [
            Paragraph("Service", styles["info_label"]),
            Paragraph(
                f":  {service}",
                styles["info_value"]
            ),
        ],
    ]

    left = Table(
        rows_left,
        colWidths=[26 * mm, 50 * mm]
    )

    right = Table(
        rows_right,
        colWidths=[26 * mm, 50 * mm]
    )

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
            [
                _badge_title("Facturé à", styles),
                _badge_title("Informations", styles)
            ],
            [
                left,
                right
            ],
        ],
        colWidths=[84 * mm, 84 * mm]
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

def _detail_rows(facture, styles):
    mouvements = sorted(facture.mouvements, key=lambda m: (m.date, m.heure))
    rows = []
    for m in mouvements:
        if hasattr(m.circuit, "point_depart"):
            circuit = f"{_safe(m.circuit.point_depart)} → {_safe(m.circuit.point_arrivee)}"
        else:
            circuit = _safe(getattr(m, "circuit", None))
        designation = f"Transport / location<br/><b>{circuit}</b>"
        rows.append([
            Paragraph(_fmt_date(m.date), styles["table_cell"]),
            Paragraph(m.heure.strftime("%H:%M"), styles["table_cell"]),
            Paragraph(designation, styles["table_cell"]),
            Paragraph(_label_vehicule(m.vehicule), styles["table_cell"]),
            Paragraph(_fmt_money(m.prix_applique), styles["table_cell_right"]),
        ])
    return rows


def _recap_rows(facture, styles):
    groupes = {}
    for m in facture.mouvements:
        groupes.setdefault(m.heure, []).append(m)

    rows = []
    for heure in sorted(groupes):
        mouvements = groupes[heure]
        total = sum(float(m.prix_applique) for m in mouvements)
        nb = len(mouvements)
        unit = total / nb if nb else 0
        heure_txt = heure.strftime("%Hh%M")
        rows.append([
            Paragraph(f"Transport de personnel<br/><b>Départ {heure_txt}</b>", styles["table_cell"]),
            Paragraph(heure_txt, styles["table_cell_center"]),
            Paragraph(str(nb), styles["table_cell_center"]),
            Paragraph(_fmt_money(unit), styles["table_cell_right"]),
            Paragraph(_fmt_money(total), styles["table_cell_right_bold"]),
        ])
    return rows


def _table_facture(facture, recap: bool, styles):
    if recap:
        headers = ["DÉSIGNATION", "SHIFT / PÉRIODE", "NOMBRE DE MOUVEMENTS", "PRIX UNIT. (DT)", "MONTANT (DT)"]
        rows = _recap_rows(facture, styles)
        widths = [49 * mm, 34 * mm, 37 * mm, 27 * mm, 27 * mm]
    else:
        headers = ["DATE", "HEURE", "CIRCUIT", "VÉHICULE", "PRIX (DT)"]
        rows = _detail_rows(facture, styles)
        widths = [22 * mm, 18 * mm, 63 * mm, 34 * mm, 37 * mm]

    header_paragraphs = [Paragraph(h, styles["table_header"]) for h in headers]
    data = [header_paragraphs] + rows
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


def _totals_and_summary(facture, styles):
    total_mouvements = len(facture.mouvements)
    par_heure = {}
    for m in facture.mouvements:
        par_heure.setdefault(m.heure, 0)
        par_heure[m.heure] += 1

    summary_lines = [
        [Paragraph("ARRÊTÉ DE LA FACTURE", styles["summary_title"])],
        [Paragraph(f"<b>Nombre total de mouvements :</b> {total_mouvements}", styles["summary_text"])],
    ]
    for heure in sorted(par_heure):
        summary_lines.append([Paragraph(f"- Départ {heure.strftime('%Hh%M')} : <b>{par_heure[heure]} mouvement(s)</b>", styles["summary_text"])])
    summary = Table(summary_lines, colWidths=[86 * mm])
    summary.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_PALE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]))

    totals_data = [
        [Paragraph("SOUS-TOTAL", styles["total_label"]), Paragraph(_fmt_money(facture.montant_ht), styles["total_value"])],
        [Paragraph(f"TVA ({float(facture.taux_tva):.0f}%)", styles["total_label"]), Paragraph(_fmt_money(facture.montant_tva), styles["total_value"])],
        [Paragraph("TOTAL TTC", styles["total_ttc_label"]), Paragraph(f"{_fmt_money(facture.montant_ttc)} DT", styles["total_ttc_value"])],
    ]
    totals = Table(totals_data, colWidths=[42 * mm, 45 * mm])
    totals.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3.3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.3 * mm),
        ("BACKGROUND", (0, 2), (-1, 2), BLUE_SOFT),
    ]))

    return Table([[summary, totals]], colWidths=[86 * mm, 87 * mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))


def _amount_in_words(facture, styles):
    words = montant_ttc_en_lettres(float(facture.montant_ttc))
    table = Table([
        [Paragraph("ARRÊTÉ LA PRÉSENTE FACTURE À LA SOMME DE :", styles["summary_title"])],
        [Paragraph(words.capitalize() + ".", styles["amount_words"])],
    ], colWidths=[86 * mm])
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_PALE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    return table


def _signature_area(styles):
    company_name = _env("INVOICE_COMPANY_NAME", "EURAFR TOURS")
    stamp = _StampFlowable(company_name)

    left = [
        Paragraph("Cachet &amp; Signature", styles["signature_title"]),
        Paragraph(company_name, styles["signature_text"]),
    ]
    right = [
        Paragraph("Signature Client", styles["signature_title"]),
        Spacer(1, 11 * mm),
        Paragraph("........................................", styles["signature_text"]),
    ]
    block = Table([[left, stamp, right]], colWidths=[56 * mm, 61 * mm, 56 * mm], rowHeights=[35 * mm])
    block.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return block


def _build_invoice_pdf(facture: models.Facture, *, recap: bool) -> bytes:
    buffer = io.BytesIO()
    logo_path = os.path.join(os.path.dirname(__file__), "static", "logo.png")

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=9 * mm,
        bottomMargin=21 * mm,
        title=f"Facture {facture.numero_facture}",
        author=_env("INVOICE_COMPANY_NAME", "EURAFR TOURS"),
    )

    base = getSampleStyleSheet()
    styles = {
        "company_name": ParagraphStyle("company_name", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=15.5, leading=17, textColor=NAVY),
        "company_activity": ParagraphStyle("company_activity", parent=base["Normal"], fontName="Helvetica", fontSize=10.5, leading=12, textColor=TEXT),
        "company_info": ParagraphStyle("company_info", parent=base["Normal"], fontName="Helvetica", fontSize=8.4, leading=11.2, textColor=TEXT),
        "invoice_title": ParagraphStyle("invoice_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=28, leading=29, textColor=NAVY, alignment=TA_RIGHT),
        "meta_label": ParagraphStyle("meta_label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.6, leading=10.5, textColor=TEXT),
        "meta_value": ParagraphStyle("meta_value", parent=base["Normal"], fontName="Helvetica", fontSize=8.6, leading=10.5, textColor=TEXT),
        "section_badge": ParagraphStyle("section_badge", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.8, leading=10, textColor=WHITE, alignment=TA_CENTER),
        "info_label": ParagraphStyle("info_label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=10.5, textColor=TEXT),
        "info_value": ParagraphStyle("info_value", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=10.5, textColor=TEXT),
        "table_header": ParagraphStyle("table_header", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.4, leading=8.8, textColor=NAVY, alignment=TA_CENTER),
        "table_cell": ParagraphStyle("table_cell", parent=base["Normal"], fontName="Helvetica", fontSize=8.1, leading=10.2, textColor=TEXT),
        "table_cell_center": ParagraphStyle("table_cell_center", parent=base["Normal"], fontName="Helvetica", fontSize=8.1, leading=10.2, textColor=TEXT, alignment=TA_CENTER),
        "table_cell_right": ParagraphStyle("table_cell_right", parent=base["Normal"], fontName="Helvetica", fontSize=8.1, leading=10.2, textColor=TEXT, alignment=TA_RIGHT),
        "table_cell_right_bold": ParagraphStyle("table_cell_right_bold", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.1, leading=10.2, textColor=TEXT, alignment=TA_RIGHT),
        "summary_title": ParagraphStyle("summary_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.3, leading=10.5, textColor=NAVY),
        "summary_text": ParagraphStyle("summary_text", parent=base["Normal"], fontName="Helvetica", fontSize=8.2, leading=11, textColor=TEXT),
        "amount_words": ParagraphStyle("amount_words", parent=base["Normal"], fontName="Helvetica-Oblique", fontSize=8.6, leading=12, textColor=TEXT),
        "total_label": ParagraphStyle("total_label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.8, leading=10.5, textColor=TEXT),
        "total_value": ParagraphStyle("total_value", parent=base["Normal"], fontName="Helvetica", fontSize=9, leading=10.5, textColor=TEXT, alignment=TA_RIGHT),
        "total_ttc_label": ParagraphStyle("total_ttc_label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=NAVY),
        "total_ttc_value": ParagraphStyle("total_ttc_value", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10.5, leading=12, textColor=NAVY, alignment=TA_RIGHT),
        "signature_title": ParagraphStyle("signature_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=TEXT, alignment=TA_CENTER),
        "signature_text": ParagraphStyle("signature_text", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, textColor=TEXT, alignment=TA_CENTER),
        "stamp_big": ParagraphStyle("stamp_big", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=9, textColor=NAVY, alignment=TA_CENTER),
        "stamp_small": ParagraphStyle("stamp_small", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=6.8, leading=8, textColor=NAVY, alignment=TA_CENTER),
    }

    # ============================================================
    # EN-TÊTE PROFESSIONNEL DE LA FACTURE
    # Largeur utile A4 = 210 - 16 - 16 = 178 mm
    # ============================================================
    company = _company_block(logo_path, styles)

    invoice_title = Paragraph("FACTURE", styles["invoice_title"])
    invoice_meta = _invoice_meta(facture, styles)

    right_header = Table(
        [
            [invoice_title],
            [Spacer(1, 2 * mm)],
            [invoice_meta],
        ],
        colWidths=[90 * mm],
    )
    right_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    header = Table(
        [[company, "", right_header]],
        colWidths=[82 * mm, 6 * mm, 90 * mm],
    )
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
        Spacer(1, 5 * mm),
        _client_info(facture, styles),
        Spacer(1, 3.5 * mm),
        _table_facture(facture, recap=recap, styles=styles),
        Spacer(1, 3.5 * mm),
        KeepTogether([
            _totals_and_summary(facture, styles),
            Spacer(1, 3 * mm),
            _amount_in_words(facture, styles),
        ]),
        Spacer(1, 4 * mm),
        _signature_area(styles),
        Spacer(1, 1.5 * mm),
        Table([[Paragraph("Merci pour votre confiance.", ParagraphStyle("thanks", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.5, textColor=TEXT, alignment=TA_CENTER))]], colWidths=[178 * mm], style=TableStyle([
            ("LINEABOVE", (0, 0), (-1, 0), 0.8, NAVY),
            ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ])),
    ]

    doc.build(elements, canvasmaker=_CanvasNumerote)
    return buffer.getvalue()


def generer_facture_pdf(facture: models.Facture) -> bytes:
    """Facture transport détaillée, avec le nouveau design professionnel."""
    return _build_invoice_pdf(facture, recap=False)


def generer_facture_recap_heures_pdf(facture: models.Facture) -> bytes:
    """Facture transport récapitulative par heure, proche de la maquette fournie."""
    return _build_invoice_pdf(facture, recap=True)


def generer_facture_location_pdf(facture: "models.FactureLocation") -> bytes:
    """Facture location utilisant le même habillage visuel professionnel."""
    # Les factures location n'ont pas de relation Client ; on conserve leur flux existant
    # en construisant un objet minimal compatible avec le rendu commun.
    class _ClientProxy:
        nom_societe = facture.client
        responsable = None
        telephone = None
        email = None

    class _FactureProxy:
        pass

    proxy = _FactureProxy()
    proxy.client = _ClientProxy()
    proxy.numero_facture = facture.numero_facture
    proxy.date_debut = facture.date_debut
    proxy.date_fin = facture.date_fin
    proxy.montant_ht = facture.montant_ht
    proxy.taux_tva = facture.taux_tva
    proxy.montant_tva = facture.montant_tva
    proxy.montant_ttc = facture.montant_ttc
    proxy.mouvements = facture.mouvements
    return _build_invoice_pdf(proxy, recap=False)