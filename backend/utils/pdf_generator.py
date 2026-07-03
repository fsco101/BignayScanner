"""
PDF Generator Module
Generates professional PDF receipts for orders that can be downloaded or printed
"""

import os
from datetime import datetime, timezone, timedelta
from io import BytesIO
from typing import Dict, Any, Optional
from pathlib import Path
from xml.sax.saxutils import escape

# Philippine Standard Time (UTC+8)
PHT = timezone(timedelta(hours=8))

# Try to import reportlab for PDF generation
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    REPORTLAB_AVAILABLE = True
    print("[PDFGenerator] reportlab available")
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("[PDFGenerator] reportlab not installed - run: pip install reportlab")


# Color palette
BRAND_GREEN = '#2E7D32'
BRAND_GREEN_LIGHT = '#E8F5E9'
TEXT_DARK = '#212121'
TEXT_MED = '#424242'
TEXT_LIGHT = '#757575'
BORDER_COLOR = '#E0E0E0'
ROW_ALT = '#FAFAFA'

STATUS_COLORS = {
    'PENDING': '#F57C00',
    'PROCESSING': '#1976D2',
    'SHIPPED': '#7B1FA2',
    'DELIVERED': '#388E3C',
    'CANCELLED': '#D32F2F',
    'READY_FOR_PICKUP': '#00796B',
}


def _to_pht(dt) -> datetime:
    """Convert a datetime to Philippine Standard Time"""
    if dt is None:
        return datetime.now(PHT)
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except Exception:
            return datetime.now(PHT)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(PHT)


def _fmt_currency(amount) -> str:
    """Format as Philippine Peso"""
    try:
        return f"PHP {float(amount):,.2f}"
    except (ValueError, TypeError):
        return "PHP 0.00"


def generate_order_receipt_pdf(order: Dict[str, Any]) -> Optional[bytes]:
    """
    Generate a professional one-page PDF receipt for an order.

    Args:
        order: Order dictionary with all details

    Returns:
        bytes: PDF content or None if generation fails
    """
    if not REPORTLAB_AVAILABLE:
        print("[PDFGenerator] PDF generation unavailable - reportlab not installed")
        return None

    try:
        buffer = BytesIO()
        left_margin = 50
        right_margin = 50
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=right_margin,
            leftMargin=left_margin,
            topMargin=36,
            bottomMargin=36,
        )

        page_width = A4[0] - left_margin - right_margin  # usable width after margins
        styles = getSampleStyleSheet()

        # ── Custom styles ────────────────────────────────────
        brand_title = ParagraphStyle(
            'BrandTitle', parent=styles['Heading1'],
            fontSize=22, alignment=TA_CENTER,
            textColor=colors.HexColor(BRAND_GREEN),
            spaceAfter=2, fontName='Helvetica-Bold',
        )
        receipt_label = ParagraphStyle(
            'ReceiptLabel', parent=styles['Normal'],
            fontSize=11, alignment=TA_CENTER,
            textColor=colors.HexColor(TEXT_LIGHT),
            spaceAfter=8,
        )
        section_header = ParagraphStyle(
            'SectionHeader', parent=styles['Heading2'],
            fontSize=11, fontName='Helvetica-Bold',
            textColor=colors.HexColor(BRAND_GREEN),
            spaceBefore=14, spaceAfter=6,
            borderPadding=0,
        )
        label_style = ParagraphStyle(
            'Label', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor(TEXT_LIGHT),
            leading=12, spaceAfter=1,
        )
        value_style = ParagraphStyle(
            'Value', parent=styles['Normal'],
            fontSize=10, textColor=colors.HexColor(TEXT_DARK),
            leading=13, spaceAfter=3, fontName='Helvetica-Bold',
        )
        normal_sm = ParagraphStyle(
            'NormalSm', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor(TEXT_MED),
            leading=12, spaceAfter=2,
        )
        footer_style = ParagraphStyle(
            'Footer', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER,
            textColor=colors.HexColor(TEXT_LIGHT),
            spaceBefore=4, leading=11,
        )

        elements = []

        # ── HEADER WITH LOGO ────────────────────────────────
        logo_path = Path(__file__).parent.parent / 'assets' / 'bignay-logo.png'
        if logo_path.exists():
            try:
                logo = Image(str(logo_path), width=60, height=60)
                logo.hAlign = 'CENTER'
                # Create header with logo and title side by side
                header_data = [[logo, Paragraph("Bignay Marketplace", brand_title)]]
                header_table = Table(header_data, colWidths=[80, page_width - 80])
                header_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING', (0, 0), (-1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ]))
                elements.append(header_table)
            except Exception:
                elements.append(Paragraph("Bignay Marketplace", brand_title))
        else:
            elements.append(Paragraph("Bignay Marketplace", brand_title))
        elements.append(Paragraph("ORDER RECEIPT", receipt_label))
        elements.append(HRFlowable(
            width="100%", thickness=1.5,
            color=colors.HexColor(BRAND_GREEN),
            spaceAfter=10, spaceBefore=2,
        ))

        # ── ORDER META (two-column) ─────────────────────────
        order_number = order.get('order_number', order.get('_id', 'N/A'))
        order_date = _to_pht(order.get('created_at'))
        status = order.get('status', 'N/A').upper()
        status_color = STATUS_COLORS.get(status, TEXT_LIGHT)
        payment_method = order.get('payment_method', 'Cash on Delivery').replace('_', ' ').title()
        payment_status = order.get('payment_status', 'Pending').title()

        meta_left = [
            [Paragraph('Order Number', label_style),
             Paragraph(f'#{order_number}', value_style)],
            [Paragraph('Order Date', label_style),
             Paragraph(order_date.strftime('%b %d, %Y  %I:%M %p PHT'), value_style)],
        ]
        meta_right = [
            [Paragraph('Status', label_style),
             Paragraph(f'<font color="{status_color}"><b>{status}</b></font>', value_style)],
            [Paragraph('Payment', label_style),
             Paragraph(f'{payment_method} ({payment_status})', value_style)],
        ]
        meta_left_tbl = Table(meta_left, colWidths=[page_width / 2])
        meta_right_tbl = Table(meta_right, colWidths=[page_width / 2])
        for t in (meta_left_tbl, meta_right_tbl):
            t.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))

        meta_wrapper = Table([[meta_left_tbl, meta_right_tbl]], colWidths=[page_width / 2, page_width / 2])
        meta_wrapper.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(meta_wrapper)
        elements.append(Spacer(1, 6))

        # ── CUSTOMER & DELIVERY (two-column) ─────────────────
        elements.append(HRFlowable(
            width="100%", thickness=0.5,
            color=colors.HexColor(BORDER_COLOR),
            spaceAfter=4, spaceBefore=2,
        ))

        # Build address string
        address_parts = [
            order.get('shipping_address', ''),
        ]
        city_prov = ', '.join(filter(None, [
            order.get('shipping_city', ''),
            order.get('shipping_province', ''),
        ]))
        if city_prov:
            address_parts.append(city_prov)
        postal = order.get('shipping_postal_code', '')
        if postal:
            address_parts.append(postal)
        full_address = ', '.join(filter(None, address_parts)) or 'N/A'

        cust_data = [
            [Paragraph('<b>Customer</b>', ParagraphStyle('', parent=section_header, spaceBefore=0, spaceAfter=4))],
            [Paragraph(order.get('user_name', 'N/A'), value_style)],
            [Paragraph(order.get('user_email', 'N/A'), normal_sm)],
        ]
        ship_data = [
            [Paragraph('<b>Deliver To</b>', ParagraphStyle('', parent=section_header, spaceBefore=0, spaceAfter=4))],
            [Paragraph(full_address, value_style)],
            [Paragraph(f"Phone: {order.get('shipping_phone', 'N/A')}", normal_sm)],
        ]

        cust_tbl = Table(cust_data, colWidths=[page_width / 2])
        ship_tbl = Table(ship_data, colWidths=[page_width / 2])
        for t in (cust_tbl, ship_tbl):
            t.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ]))

        info_wrapper = Table([[cust_tbl, ship_tbl]], colWidths=[page_width / 2, page_width / 2])
        info_wrapper.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(info_wrapper)
        elements.append(Spacer(1, 6))

        # ── ORDER ITEMS TABLE ─────────────────────────────────
        elements.append(HRFlowable(
            width="100%", thickness=0.5,
            color=colors.HexColor(BORDER_COLOR),
            spaceAfter=4, spaceBefore=2,
        ))
        elements.append(Paragraph('<b>Order Items</b>', section_header))

        items = order.get('items', [])
        product_cell_style = ParagraphStyle(
            'ItemProductCell', parent=normal_sm,
            fontSize=8.5, leading=10,
            textColor=colors.HexColor(TEXT_DARK),
            spaceAfter=0,
        )
        seller_cell_style = ParagraphStyle(
            'ItemSellerCell', parent=normal_sm,
            fontSize=8, leading=9.5,
            textColor=colors.HexColor(TEXT_MED),
            spaceAfter=0,
        )
        # Dynamically calculate column widths to fill the full page width
        # Proportions: # (5%), Product (34%), Seller (17%), Qty (7%), Unit Price (17%), Subtotal (20%)
        col_widths = [
            round(page_width * 0.05),   # #
            round(page_width * 0.34),   # Product
            round(page_width * 0.17),   # Seller
            round(page_width * 0.07),   # Qty
            round(page_width * 0.17),   # Unit Price
            round(page_width * 0.20),   # Subtotal
        ]
        # Adjust last column to absorb any rounding remainder
        col_widths[-1] = page_width - sum(col_widths[:-1])
        header_row = ['#', 'Product', 'Seller', 'Qty', 'Unit Price', 'Subtotal']
        table_data = [header_row]

        for i, item in enumerate(items, 1):
            unit_price = float(item.get('unit_price', 0))
            quantity = int(item.get('quantity', 0))
            subtotal = float(item.get('subtotal', unit_price * quantity))
            product_name = escape(str(item.get('product_name', 'Unknown')))
            seller_name = escape(str(item.get('seller_name', 'N/A')))
            # Show unit info (per kg / per piece)
            sold_by = item.get('sold_by', 'piece')
            unit_label = item.get('unit', 'per item')
            unit_suffix = f" / {unit_label}" if unit_label and unit_label != 'per item' else ''
            if sold_by == 'kg':
                unit_suffix = ' / kg'
            qty_display = f"{quantity} {'kg' if sold_by == 'kg' else 'pc' if quantity == 1 else 'pcs'}"
            table_data.append([
                str(i),
                Paragraph(product_name, product_cell_style),
                Paragraph(seller_name, seller_cell_style),
                qty_display,
                _fmt_currency(unit_price) + unit_suffix,
                _fmt_currency(subtotal),
            ])

        items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        items_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(BRAND_GREEN)),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            # Data rows
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),
            ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 1), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 1), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            # Alternating rows
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(ROW_ALT)]),
            # Grid
            ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor(BRAND_GREEN)),
            ('LINEBELOW', (0, 1), (-1, -2), 0.25, colors.HexColor(BORDER_COLOR)),
            ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.HexColor(BORDER_COLOR)),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 10))

        # ── TOTALS ────────────────────────────────────────────
        total = float(order.get('total_amount', 0))
        totals_data = [
            ['Payment Method', payment_method],
            ['', ''],  # spacer row
            ['TOTAL', _fmt_currency(total)],
        ]

        totals_table = Table(totals_data, colWidths=[page_width - 140, 140])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -2), 9),
            ('TEXTCOLOR', (0, 0), (-1, -2), colors.HexColor(TEXT_MED)),
            # Total row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 13),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor(BRAND_GREEN)),
            ('LINEABOVE', (0, -1), (-1, -1), 1.5, colors.HexColor(BRAND_GREEN)),
            ('TOPPADDING', (0, -1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -2), 3),
            # Hide spacer row
            ('FONTSIZE', (0, -2), (-1, -2), 2),
        ]))
        elements.append(totals_table)

        # ── NOTES ────────────────────────────────────────────
        notes = order.get('notes')
        if notes:
            elements.append(Spacer(1, 8))
            elements.append(Paragraph('<b>Notes</b>', section_header))
            elements.append(Paragraph(notes, normal_sm))

        # ── CANCELLATION REASON ───────────────────────────────
        if status == 'CANCELLED':
            cancel_reason = order.get('cancel_reason', 'No reason provided')
            elements.append(Spacer(1, 8))
            cancel_style = ParagraphStyle(
                'CancelReason', parent=section_header,
                textColor=colors.HexColor('#D32F2F'),
            )
            elements.append(Paragraph('<b>Cancellation Reason</b>', cancel_style))
            elements.append(Paragraph(cancel_reason, normal_sm))

        # ── FOOTER ────────────────────────────────────────────
        elements.append(Spacer(1, 20))
        elements.append(HRFlowable(
            width="100%", thickness=0.5,
            color=colors.HexColor(BORDER_COLOR),
            spaceAfter=8, spaceBefore=0,
        ))

        now_pht = datetime.now(PHT)
        elements.append(Paragraph(
            "Thank you for shopping with Bignay Marketplace!",
            footer_style,
        ))
        elements.append(Paragraph(
            f"Receipt generated: {now_pht.strftime('%b %d, %Y %I:%M %p PHT')}",
            footer_style,
        ))
        elements.append(Paragraph(
            "For inquiries, contact: support@bignay.com",
            footer_style,
        ))

        doc.build(elements)
        pdf_content = buffer.getvalue()
        buffer.close()

        print(f"[PDFGenerator] Generated PDF for order #{order_number}")
        return pdf_content

    except Exception as e:
        print(f"[PDFGenerator] PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def generate_prediction_report_pdf(prediction: Dict[str, Any], compare_prediction: Dict[str, Any] = None) -> Optional[bytes]:
    """
    Generate a professional PDF report for a scan prediction result.
    Supports both single scan and side-by-side comparison reports.

    Args:
        prediction: Primary prediction dictionary
        compare_prediction: Optional second prediction for comparison

    Returns:
        bytes: PDF content or None if generation fails
    """
    if not REPORTLAB_AVAILABLE:
        print("[PDFGenerator] PDF generation unavailable - reportlab not installed")
        return None

    try:
        buffer = BytesIO()
        left_margin = 45
        right_margin = 45
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=right_margin,
            leftMargin=left_margin,
            topMargin=36,
            bottomMargin=36,
        )
        page_width = A4[0] - left_margin - right_margin

        styles = getSampleStyleSheet()

        # ── Custom styles ────────────────────────────────────
        brand_title = ParagraphStyle(
            'BrandTitle', parent=styles['Heading1'],
            fontSize=20, alignment=TA_CENTER,
            textColor=colors.HexColor(BRAND_GREEN),
            spaceAfter=2, fontName='Helvetica-Bold',
        )
        report_label = ParagraphStyle(
            'ReportLabel', parent=styles['Normal'],
            fontSize=11, alignment=TA_CENTER,
            textColor=colors.HexColor(TEXT_LIGHT),
            spaceAfter=8,
        )
        section_header = ParagraphStyle(
            'SectionHeader', parent=styles['Heading2'],
            fontSize=11, fontName='Helvetica-Bold',
            textColor=colors.HexColor(BRAND_GREEN),
            spaceBefore=12, spaceAfter=6,
            borderPadding=0,
        )
        label_style = ParagraphStyle(
            'Label', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor(TEXT_LIGHT),
            leading=12, spaceAfter=1,
        )
        value_style = ParagraphStyle(
            'Value', parent=styles['Normal'],
            fontSize=10, textColor=colors.HexColor(TEXT_DARK),
            leading=13, spaceAfter=3, fontName='Helvetica-Bold',
        )
        normal_sm = ParagraphStyle(
            'NormalSm', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor(TEXT_MED),
            leading=12, spaceAfter=2,
        )
        footer_style = ParagraphStyle(
            'Footer', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER,
            textColor=colors.HexColor(TEXT_LIGHT),
            spaceBefore=4, leading=11,
        )
        bullet_style = ParagraphStyle(
            'Bullet', parent=styles['Normal'],
            fontSize=9, textColor=colors.HexColor(TEXT_MED),
            leading=12, spaceAfter=1, leftIndent=12,
            bulletIndent=0, bulletFontSize=9,
        )

        elements = []

        # ── Helper functions ─────────────────────────────────
        def _safe_pct(val):
            """Convert 0-1 float or 0-100 number to a rounded percentage string."""
            if val is None or not isinstance(val, (int, float)):
                return 'N/A'
            if val <= 1:
                return f"{val * 100:.1f}%"
            return f"{val:.1f}%"

        def _score_color(val):
            """Return a color hex based on score value (0-1 or 0-100)."""
            if val is None:
                return TEXT_LIGHT
            n = val if val > 1 else val * 100
            if n >= 70:
                return '#388E3C'
            if n >= 40:
                return '#F57C00'
            return '#D32F2F'

        def _add_score_row(elems, label_text, value, accent=None):
            """Add a label-value row."""
            if value is None:
                return
            color = accent or _score_color(value) if isinstance(value, (int, float)) else TEXT_DARK
            val_str = _safe_pct(value) if isinstance(value, (int, float)) else str(value)
            row_data = [[
                Paragraph(escape(str(label_text)), label_style),
                Paragraph(f'<font color="{color}"><b>{escape(val_str)}</b></font>', value_style),
            ]]
            t = Table(row_data, colWidths=[page_width * 0.55, page_width * 0.45])
            t.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            elems.append(t)

        def _render_scan_section(elems, item, accent_color=BRAND_GREEN, label_prefix=""):
            """Render all analysis sections for a single scan prediction."""
            subject = (item.get('subject') or 'unknown').capitalize()
            result = item.get('result') or 'Unknown'
            confidence = item.get('confidence')
            timestamp = item.get('time') or item.get('timestamp') or item.get('createdAt')

            # ── Hero ─────────────────────────────────────────
            hero_title_style = ParagraphStyle(
                f'{label_prefix}HeroTitle', parent=styles['Heading2'],
                fontSize=14, fontName='Helvetica-Bold',
                textColor=colors.HexColor(accent_color),
                spaceBefore=0, spaceAfter=2,
            )
            if label_prefix:
                elems.append(Paragraph(f'<b>{escape(label_prefix)}</b>', ParagraphStyle(
                    f'{label_prefix}Label', parent=section_header,
                    textColor=colors.HexColor(accent_color),
                    fontSize=12, spaceBefore=10,
                )))
                elems.append(HRFlowable(
                    width="100%", thickness=1,
                    color=colors.HexColor(accent_color),
                    spaceAfter=6, spaceBefore=2,
                ))

            elems.append(Paragraph(f"{subject} Analysis — {escape(result)}", hero_title_style))
            if timestamp:
                ts = _to_pht(timestamp) if timestamp else None
                if ts:
                    elems.append(Paragraph(
                        f"Scanned: {ts.strftime('%b %d, %Y  %I:%M %p PHT')}",
                        normal_sm
                    ))
            _add_score_row(elems, 'Confidence', confidence, accent_color)

            det_level = item.get('detection', {}).get('confidence_level')
            det_reason = item.get('detection', {}).get('reason')
            if det_level:
                _add_score_row(elems, 'Detection Level', det_level)
            if det_reason:
                _add_score_row(elems, 'Detection Reason', det_reason)

            elems.append(Spacer(1, 6))

            # ── Image Quality ────────────────────────────────
            iq = item.get('image_quality') or {}
            if iq:
                elems.append(Paragraph('<b>Image Quality</b>', section_header))
                _add_score_row(elems, 'Overall Quality', iq.get('overall_quality'))
                _add_score_row(elems, 'Overall Score', iq.get('overall_score'))
                _add_score_row(elems, 'Blur Score', iq.get('blur_score'), '#7C3AED')
                _add_score_row(elems, 'Brightness Score', iq.get('brightness_score'), '#2563EB')
                _add_score_row(elems, 'Contrast Score', iq.get('contrast_score'), '#D97706')
                _add_score_row(elems, 'Subject Size Score', iq.get('subject_size_score'), '#16A34A')

                issues = iq.get('issues', [])
                if issues:
                    elems.append(Paragraph('<i>Issues:</i>', label_style))
                    for iss in issues:
                        elems.append(Paragraph(f"• {escape(str(iss))}", bullet_style))

                recs = iq.get('recommendations', [])
                if recs:
                    elems.append(Paragraph('<i>Quality Recommendations:</i>', label_style))
                    for r in recs:
                        elems.append(Paragraph(f"• {escape(str(r))}", bullet_style))

                elems.append(Spacer(1, 4))

            # ── Fruit / Leaf Details ─────────────────────────
            fruit = item.get('fruit') or {}
            leaf = item.get('leaf') or {}
            if fruit or leaf:
                elems.append(Paragraph('<b>Classification Details</b>', section_header))
                if fruit:
                    _add_score_row(elems, 'Quality', fruit.get('quality'))
                    _add_score_row(elems, 'Ripeness Stage', fruit.get('ripeness_stage'))
                    mold = fruit.get('mold_present') or fruit.get('mold_detected')
                    if mold is not None:
                        _add_score_row(elems, 'Mold Present', 'Yes' if mold else 'No')
                if leaf:
                    _add_score_row(elems, 'Leaf Class', leaf.get('class'))
                    mold = leaf.get('mold_detected')
                    if mold is not None:
                        _add_score_row(elems, 'Mold Detected', 'Yes' if mold else 'No')

                # HSV Color
                hsv = (item.get('color') or {}).get('hsv_mean')
                if hsv and isinstance(hsv, (list, tuple)) and len(hsv) >= 3:
                    _add_score_row(elems, 'HSV Mean', f"H:{hsv[0]:.0f}  S:{hsv[1]:.0f}  V:{hsv[2]:.0f}")

                elems.append(Spacer(1, 4))

            # ── Fruit Detection (YOLO) ───────────────────────
            fd = item.get('fruit_detection') or {}
            total = fd.get('total_detected', 0)
            if total and total > 0:
                elems.append(Paragraph(f'<b>Fruit Detection ({total} detected)</b>', section_header))
                summary = fd.get('summary') or {}
                for key in ('ripe', 'unripe', 'overripe', 'mold'):
                    cnt = summary.get(key, 0)
                    if cnt > 0:
                        _add_score_row(elems, key.capitalize(), str(cnt))
                elems.append(Spacer(1, 4))

            # ── Analytics ───────────────────────────────────
            analytics = item.get('analytics') or {}

            # Ripeness Analysis (fruit)
            ripeness = analytics.get('ripeness_analysis') or {}
            if ripeness:
                elems.append(Paragraph('<b>Ripeness Analysis</b>', section_header))
                _add_score_row(elems, 'Ripe', ripeness.get('ripe_pct'), '#388E3C')
                _add_score_row(elems, 'Unripe', ripeness.get('unripe_pct'), '#F57C00')
                _add_score_row(elems, 'Overripe', ripeness.get('overripe_pct'), '#D97706')
                _add_score_row(elems, 'Mold', ripeness.get('mold_pct'), '#D32F2F')
                ri = ripeness.get('ripeness_index')
                if ri is not None:
                    _add_score_row(elems, 'Ripeness Index', ri)
                source = ripeness.get('source')
                if source:
                    _add_score_row(elems, 'Source', source)
                elems.append(Spacer(1, 4))

            # Mold Detection
            mold_det = analytics.get('mold_detection') or {}
            if mold_det:
                elems.append(Paragraph('<b>Mold Detection</b>', section_header))
                _add_score_row(elems, 'Status', mold_det.get('status'))
                _add_score_row(elems, 'Severity', mold_det.get('severity'))
                _add_score_row(elems, 'Mold Probability', mold_det.get('mold_probability'))
                _add_score_row(elems, 'Clean Probability', mold_det.get('clean_probability'))
                elems.append(Spacer(1, 4))

            # Quality Assessment
            qa = analytics.get('quality_assessment') or {}
            if qa:
                grade = qa.get('grade', '')
                elems.append(Paragraph(f'<b>Quality Assessment — Grade {escape(str(grade))}</b>', section_header))
                suitability = qa.get('product_suitability') or {}
                for prod, score in suitability.items():
                    _add_score_row(elems, prod, score)
                summary_text = qa.get('summary')
                if summary_text:
                    elems.append(Paragraph(escape(str(summary_text)), normal_sm))
                elems.append(Spacer(1, 4))

            # Leaf Health Analysis
            health_score = analytics.get('health_score')
            health_assessment = analytics.get('health_assessment') or {}
            if health_score is not None or health_assessment:
                elems.append(Paragraph('<b>Leaf Health Analysis</b>', section_header))
                if health_assessment.get('status'):
                    _add_score_row(elems, 'Health Status', health_assessment['status'])
                if health_score is not None:
                    _add_score_row(elems, 'Health Score', health_score)
                details = analytics.get('details') or []
                for d in details:
                    elems.append(Paragraph(f"• {escape(str(d))}", bullet_style))
                leaf_recs = analytics.get('recommendations') or []
                if leaf_recs:
                    elems.append(Paragraph('<i>Recommendations:</i>', label_style))
                    for r in leaf_recs:
                        elems.append(Paragraph(f"• {escape(str(r))}", bullet_style))
                elems.append(Spacer(1, 4))

            # ── Recommendation ───────────────────────────────
            rec = item.get('recommendation') or {}
            if rec:
                elems.append(Paragraph('<b>Recommendation</b>', section_header))
                if rec.get('primary'):
                    _add_score_row(elems, 'Primary', rec['primary'])
                if rec.get('alternatives'):
                    _add_score_row(elems, 'Alternatives', rec['alternatives'])
                if rec.get('reason'):
                    elems.append(Paragraph(f"<i>Reason:</i> {escape(str(rec['reason']))}", normal_sm))
                tips = rec.get('tips') or []
                if tips:
                    elems.append(Paragraph('<i>Tips:</i>', label_style))
                    for tip in tips:
                        elems.append(Paragraph(f"• {escape(str(tip))}", bullet_style))
                elems.append(Spacer(1, 4))

        # ────────────────────────────────────────────────────
        # Build the document
        # ────────────────────────────────────────────────────

        # ── Header ───────────────────────────────────────────
        logo_path = Path(__file__).parent.parent / 'assets' / 'bignay-logo.png'
        if logo_path.exists():
            try:
                logo = Image(str(logo_path), width=50, height=50)
                logo.hAlign = 'CENTER'
                header_data = [[logo, Paragraph("Bignay Scanner", brand_title)]]
                header_table = Table(header_data, colWidths=[70, page_width - 70])
                header_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING', (0, 0), (-1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ]))
                elements.append(header_table)
            except Exception:
                elements.append(Paragraph("Bignay Scanner", brand_title))
        else:
            elements.append(Paragraph("Bignay Scanner", brand_title))

        is_compare = compare_prediction is not None
        report_type = "SCAN COMPARISON REPORT" if is_compare else "SCAN ANALYSIS REPORT"
        elements.append(Paragraph(report_type, report_label))
        elements.append(HRFlowable(
            width="100%", thickness=1.5,
            color=colors.HexColor(BRAND_GREEN),
            spaceAfter=10, spaceBefore=2,
        ))

        # ── Primary Scan ─────────────────────────────────────
        if is_compare:
            _render_scan_section(elements, prediction, BRAND_GREEN, "Current Scan")

            # ── Comparison Delta Summary ─────────────────────
            elements.append(Spacer(1, 8))
            elements.append(HRFlowable(
                width="100%", thickness=1,
                color=colors.HexColor(BORDER_COLOR),
                spaceAfter=6, spaceBefore=4,
            ))
            elements.append(Paragraph('<b>Comparison Summary</b>', section_header))

            curr_conf = prediction.get('confidence')
            prev_conf = compare_prediction.get('confidence')
            if isinstance(curr_conf, (int, float)) and isinstance(prev_conf, (int, float)):
                delta = (curr_conf - prev_conf) * 100
                sign = '+' if delta > 0 else ''
                delta_color = '#388E3C' if delta >= 0 else '#D32F2F'
                _add_score_row(elements, 'Confidence Change', f"{sign}{delta:.1f}%")

            curr_result = prediction.get('result', 'Unknown')
            prev_result = compare_prediction.get('result', 'Unknown')
            if curr_result != prev_result:
                _add_score_row(elements, 'Result Change', f"{prev_result} → {curr_result}")
            else:
                _add_score_row(elements, 'Result', f"Same ({curr_result})")

            curr_quality = (prediction.get('image_quality') or {}).get('overall_quality')
            prev_quality = (compare_prediction.get('image_quality') or {}).get('overall_quality')
            if curr_quality and prev_quality:
                if curr_quality != prev_quality:
                    _add_score_row(elements, 'Quality Change', f"{prev_quality} → {curr_quality}")
                else:
                    _add_score_row(elements, 'Quality', f"Same ({curr_quality})")

            elements.append(Spacer(1, 8))

            # ── Compare Scan ────────────────────────────────
            _render_scan_section(elements, compare_prediction, '#7B1FA2', "Compared Scan")
        else:
            _render_scan_section(elements, prediction)

        # ── Footer ─────────────────────────────────────────
        elements.append(Spacer(1, 16))
        elements.append(HRFlowable(
            width="100%", thickness=0.5,
            color=colors.HexColor(BORDER_COLOR),
            spaceAfter=8, spaceBefore=0,
        ))

        now_pht = datetime.now(PHT)
        elements.append(Paragraph(
            "Generated by Bignay Scanner — Prediction Analysis Report",
            footer_style,
        ))
        elements.append(Paragraph(
            f"Report generated: {now_pht.strftime('%b %d, %Y %I:%M %p PHT')}",
            footer_style,
        ))

        doc.build(elements)
        pdf_content = buffer.getvalue()
        buffer.close()

        subject = (prediction.get('subject') or 'scan').capitalize()
        print(f"[PDFGenerator] Generated prediction report PDF ({subject}, compare={is_compare})")
        return pdf_content

    except Exception as e:
        print(f"[PDFGenerator] Prediction report PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def is_pdf_generation_available() -> bool:
    """Check if PDF generation is available"""
    return REPORTLAB_AVAILABLE
