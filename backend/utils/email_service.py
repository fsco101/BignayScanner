"""
Email Service
Handles sending order receipts via SMTP with PDF attachments
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from datetime import datetime
from io import BytesIO
from typing import Optional, Dict, Any, List
from pathlib import Path

# ============================================================================
# DIRECT .ENV FILE LOADING
# ============================================================================

_UTILS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _UTILS_DIR.parent
_ENV_FILE = _BACKEND_DIR / ".env"

def _load_env_file():
    """Load and parse .env file directly"""
    env_vars = {}
    if _ENV_FILE.exists():
        try:
            with open(_ENV_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        key, _, value = line.partition('=')
                        key = key.strip()
                        value = value.strip()
                        if (value.startswith('"') and value.endswith('"')) or \
                           (value.startswith("'") and value.endswith("'")):
                            value = value[1:-1]
                        env_vars[key] = value
        except Exception as e:
            print(f"[EmailService] Error reading .env: {e}")
    return env_vars

_ENV_VARS = _load_env_file()

# SMTP Configuration from .env
SMTP_HOST = _ENV_VARS.get('SMTP_HOST', '') or os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(_ENV_VARS.get('SMTP_PORT', '') or os.environ.get('SMTP_PORT', '587'))
SMTP_USER = _ENV_VARS.get('SMTP_USER', '') or os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = _ENV_VARS.get('SMTP_PASSWORD', '') or os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM_EMAIL = _ENV_VARS.get('SMTP_FROM_EMAIL', '') or os.environ.get('SMTP_FROM_EMAIL', SMTP_USER)
SMTP_FROM_NAME = _ENV_VARS.get('SMTP_FROM_NAME', '') or os.environ.get('SMTP_FROM_NAME', 'Bignay Marketplace')

print(f"[EmailService] SMTP Config loaded:")
print(f"  - Host: {SMTP_HOST}")
print(f"  - Port: {SMTP_PORT}")
print(f"  - User: {SMTP_USER[:10]}..." if SMTP_USER else "  - User: NOT SET")
print(f"  - Password: {'*' * 8}" if SMTP_PASSWORD else "  - Password: NOT SET")

# Try to import reportlab for PDF generation
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    REPORTLAB_AVAILABLE = True
    print("[EmailService] ✓ reportlab available - PDF generation enabled")
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("[EmailService] ✗ reportlab not installed - PDF generation disabled")
_LOGO_PATH = Path(__file__).resolve().parent.parent / 'assets' / 'bignay-logo.png'

class EmailService:
    """Service for sending emails with SMTP"""
    
    def __init__(self):
        """Initialize email service with environment configuration"""
        # Use module-level constants loaded from .env
        self.smtp_host = SMTP_HOST
        self.smtp_port = SMTP_PORT
        self.smtp_user = SMTP_USER
        self.smtp_password = SMTP_PASSWORD
        self.from_email = SMTP_FROM_EMAIL or self.smtp_user
        self.from_name = SMTP_FROM_NAME
        self.enabled = bool(self.smtp_user and self.smtp_password)
        
        if not self.enabled:
            print("[EmailService] ✗ SMTP credentials not configured - email disabled")
        else:
            print(f"[EmailService] ✓ Configured with {self.smtp_host}:{self.smtp_port}")
    
    def _load_logo_bytes(self):
        """Load logo image bytes for inline email embedding"""
        if _LOGO_PATH.exists():
            try:
                return _LOGO_PATH.read_bytes()
            except Exception:
                pass
        return None

    def _get_smtp_connection(self):
        """Create and return SMTP connection"""
        try:
            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            return server
        except Exception as e:
            print(f"[EmailService] SMTP connection failed: {e}")
            return None
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        inline_images: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        """
        Send an email
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_body: HTML content
            text_body: Plain text fallback (optional)
            attachments: List of dicts with 'filename', 'content' (bytes), 'content_type'
        
        Returns:
            bool: True if sent successfully
        """
        if not self.enabled:
            print(f"[EmailService] Email disabled - would send to {to_email}: {subject}")
            return False
        
        try:
            has_attachments = bool(attachments)
            has_inline = bool(inline_images)

            if has_attachments or has_inline:
                msg = MIMEMultipart('mixed')

                # Build the content part (related > alternative for CID images)
                if has_inline:
                    msg_related = MIMEMultipart('related')
                    msg_alt = MIMEMultipart('alternative')
                    if text_body:
                        msg_alt.attach(MIMEText(text_body, 'plain'))
                    msg_alt.attach(MIMEText(html_body, 'html'))
                    msg_related.attach(msg_alt)
                    for img in inline_images:
                        mime_img = MIMEImage(img['content'])
                        mime_img.add_header('Content-ID', f'<{img["cid"]}>')
                        mime_img.add_header('Content-Disposition', 'inline', filename=img.get('filename', 'image.png'))
                        msg_related.attach(mime_img)
                    msg.attach(msg_related)
                else:
                    msg_alt = MIMEMultipart('alternative')
                    if text_body:
                        msg_alt.attach(MIMEText(text_body, 'plain'))
                    msg_alt.attach(MIMEText(html_body, 'html'))
                    msg.attach(msg_alt)

                if has_attachments:
                    for attachment in attachments:
                        part = MIMEApplication(attachment['content'], Name=attachment['filename'])
                        part['Content-Disposition'] = f'attachment; filename="{attachment["filename"]}"'
                        msg.attach(part)
            else:
                msg = MIMEMultipart('alternative')
                if text_body:
                    msg.attach(MIMEText(text_body, 'plain'))
                msg.attach(MIMEText(html_body, 'html'))

            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Send email
            server = self._get_smtp_connection()
            if server:
                server.sendmail(self.from_email, to_email, msg.as_string())
                server.quit()
                print(f"[EmailService] Email sent to {to_email}: {subject}")
                return True
            return False
            
        except Exception as e:
            print(f"[EmailService] Failed to send email: {e}")
            return False
    
    def generate_order_pdf(self, order: Dict[str, Any]) -> Optional[bytes]:
        """
        Generate PDF receipt for an order
        
        Args:
            order: Order dictionary with all details
        
        Returns:
            bytes: PDF content or None if generation fails
        """
        if not REPORTLAB_AVAILABLE:
            print("[EmailService] PDF generation unavailable - reportlab not installed")
            return None
        
        try:
            buffer = BytesIO()
            doc = SimpleDocTemplate(
                buffer,
                pagesize=A4,
                rightMargin=50,
                leftMargin=50,
                topMargin=50,
                bottomMargin=50
            )
            
            styles = getSampleStyleSheet()
            
            # Custom styles
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                alignment=TA_CENTER,
                spaceAfter=20,
                textColor=colors.HexColor('#2E7D32')
            )
            
            subtitle_style = ParagraphStyle(
                'Subtitle',
                parent=styles['Normal'],
                fontSize=12,
                alignment=TA_CENTER,
                textColor=colors.grey,
                spaceAfter=30
            )
            
            heading_style = ParagraphStyle(
                'CustomHeading',
                parent=styles['Heading2'],
                fontSize=14,
                textColor=colors.HexColor('#2E7D32'),
                spaceBefore=20,
                spaceAfter=10
            )
            
            normal_style = ParagraphStyle(
                'CustomNormal',
                parent=styles['Normal'],
                fontSize=11,
                spaceAfter=5
            )
            
            elements = []
            
            # Header with logo
            logo_path = Path(__file__).resolve().parent.parent / 'assets' / 'bignay-logo.png'
            if logo_path.exists():
                try:
                    logo = Image(str(logo_path), width=50, height=50)
                    logo.hAlign = 'CENTER'
                    header_data = [[logo, Paragraph("Bignay Marketplace", title_style)]]
                    header_table = Table(header_data, colWidths=[60, A4[0] - 160])
                    header_table.setStyle(TableStyle([
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 0),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                        ('TOPPADDING', (0, 0), (-1, -1), 0),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                    ]))
                    elements.append(header_table)
                except Exception:
                    elements.append(Paragraph("Bignay Marketplace", title_style))
            else:
                elements.append(Paragraph("Bignay Marketplace", title_style))
            elements.append(Paragraph("Order Receipt", subtitle_style))
            
            # Order Info
            order_number = order.get('order_number', order.get('_id', 'N/A'))
            order_date = order.get('created_at', datetime.now())
            if isinstance(order_date, str):
                try:
                    order_date = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
                except:
                    order_date = datetime.now()
            
            elements.append(Paragraph("Order Information", heading_style))
            elements.append(Paragraph(f"<b>Order Number:</b> #{order_number}", normal_style))
            elements.append(Paragraph(f"<b>Date:</b> {order_date.strftime('%B %d, %Y at %I:%M %p')}", normal_style))
            elements.append(Paragraph(f"<b>Status:</b> {order.get('status', 'N/A').upper()}", normal_style))
            
            elements.append(Spacer(1, 10))
            
            # Customer Info
            elements.append(Paragraph("Customer Details", heading_style))
            elements.append(Paragraph(f"<b>Name:</b> {order.get('user_name', 'N/A')}", normal_style))
            elements.append(Paragraph(f"<b>Email:</b> {order.get('user_email', 'N/A')}", normal_style))
            elements.append(Paragraph(f"<b>Phone:</b> {order.get('shipping_phone', 'N/A')}", normal_style))
            elements.append(Paragraph(f"<b>Address:</b> {order.get('shipping_address', 'N/A')}", normal_style))
            elements.append(Paragraph(f"<b>City:</b> {order.get('shipping_city', 'N/A')}", normal_style))
            
            elements.append(Spacer(1, 20))
            
            # Order Items Table
            elements.append(Paragraph("Order Items", heading_style))
            
            items = order.get('items', [])
            table_data = [['Product', 'Qty', 'Unit Price', 'Subtotal']]
            
            for item in items:
                sold_by = item.get('sold_by', 'piece')
                qty = item.get('quantity', 0)
                qty_display = f"{qty} {'kg' if sold_by == 'kg' else 'pc' if qty == 1 else 'pcs'}"
                unit_price = item.get('unit_price', 0)
                unit_label = item.get('unit', 'per item')
                price_display = f"₱{unit_price:.2f}"
                if sold_by == 'kg':
                    price_display += ' /kg'
                elif unit_label and unit_label != 'per item':
                    price_display += f' /{unit_label}'
                table_data.append([
                    item.get('product_name', 'Unknown'),
                    qty_display,
                    price_display,
                    f"₱{item.get('subtotal', 0):.2f}"
                ])
            
            # Add total row
            total = order.get('total_amount', 0)
            table_data.append(['', '', 'Total:', f"₱{total:.2f}"])
            
            table = Table(table_data, colWidths=[250, 50, 80, 80])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2E7D32')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('TOPPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#E8F5E9')),
                ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F5F5F5')]),
            ]))
            elements.append(table)
            
            elements.append(Spacer(1, 30))
            
            # Notes if any
            notes = order.get('notes')
            if notes:
                elements.append(Paragraph("Notes", heading_style))
                elements.append(Paragraph(notes, normal_style))
                elements.append(Spacer(1, 20))
            
            # Footer
            footer_style = ParagraphStyle(
                'Footer',
                parent=styles['Normal'],
                fontSize=10,
                alignment=TA_CENTER,
                textColor=colors.grey,
                spaceBefore=30
            )
            elements.append(Paragraph("Thank you for shopping with Bignay Marketplace!", footer_style))
            elements.append(Paragraph("For inquiries, please contact us at support@bignay.com", footer_style))
            
            doc.build(elements)
            pdf_content = buffer.getvalue()
            buffer.close()
            
            return pdf_content
            
        except Exception as e:
            print(f"[EmailService] PDF generation failed: {e}")
            return None
    
    def send_order_receipt(self, order: Dict[str, Any], status_changed: bool = False) -> bool:
        """
        Send order receipt email with PDF attachment
        
        Args:
            order: Order dictionary
            status_changed: Whether this is a status change notification
        
        Returns:
            bool: True if email sent successfully
        """
        user_email = order.get('user_email')
        if not user_email:
            print("[EmailService] No user email found in order")
            return False
        
        order_number = order.get('order_number', order.get('_id', 'N/A'))
        status = order.get('status', 'unknown').upper()
        user_name = order.get('user_name', 'Valued Customer')
        total = order.get('total_amount', 0)
        
        # Email subject
        if status_changed:
            subject = f"Order #{order_number} - Status Update: {status}"
        else:
            subject = f"Order #{order_number} - Confirmation"
        
        # Status-specific message and color
        status_messages = {
            'PENDING': ('Your order has been received and is awaiting confirmation.', '#FFA000'),
            'PROCESSING': ('Great news! Your order is now being prepared.', '#2196F3'),
            'SHIPPED': ('Your order is on its way! 🚚', '#9C27B0'),
            'DELIVERED': ('Your order has been delivered! Thank you for shopping with us. 🎉', '#4CAF50'),
            'CANCELLED': ('Your order has been cancelled. If you have questions, please contact us.', '#D32F2F'),
        }
        
        status_msg, status_color = status_messages.get(status, ('Your order status has been updated.', '#757575'))
        
        # Generate HTML email
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                <!-- Header -->
                <tr>
                    <td style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 30px; text-align: center;">
                        <img src="cid:bignay_logo" alt="Bignay" style="width: 60px; height: 60px; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto; border-radius: 8px;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Bignay Marketplace</h1>
                    </td>
                </tr>
                
                <!-- Status Banner -->
                <tr>
                    <td style="background-color: {status_color}; padding: 20px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Order {status}</h2>
                    </td>
                </tr>
                
                <!-- Content -->
                <tr>
                    <td style="padding: 30px;">
                        <p style="font-size: 16px; color: #212121; margin-bottom: 20px;">
                            Hi <strong>{user_name}</strong>,
                        </p>
                        
                        <p style="font-size: 15px; color: #424242; line-height: 1.6;">
                            {status_msg}
                        </p>
                        
                        <!-- Order Summary Box -->
                        <div style="background-color: #f5f5f5; border-radius: 12px; padding: 20px; margin: 25px 0;">
                            <h3 style="margin: 0 0 15px 0; color: #2E7D32; font-size: 16px;">Order Summary</h3>
                            <table width="100%" style="font-size: 14px;">
                                <tr>
                                    <td style="padding: 8px 0; color: #757575;">Order Number:</td>
                                    <td style="padding: 8px 0; color: #212121; text-align: right; font-weight: bold;">#{order_number}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #757575;">Status:</td>
                                    <td style="padding: 8px 0; text-align: right;">
                                        <span style="background-color: {status_color}; color: #fff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">{status}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #757575;">Total Amount:</td>
                                    <td style="padding: 8px 0; color: #2E7D32; text-align: right; font-weight: bold; font-size: 18px;">₱{total:.2f}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <!-- Items -->
                        <h3 style="color: #2E7D32; font-size: 16px; margin-bottom: 15px;">Items Ordered</h3>
                        <table width="100%" style="font-size: 14px; border-collapse: collapse;">
                            <tr style="background-color: #2E7D32; color: #fff;">
                                <th style="padding: 12px; text-align: left; border-radius: 8px 0 0 0;">Product</th>
                                <th style="padding: 12px; text-align: center;">Qty</th>
                                <th style="padding: 12px; text-align: right; border-radius: 0 8px 0 0;">Subtotal</th>
                            </tr>
        """
        
        # Add items
        for item in order.get('items', []):
            sold_by = item.get('sold_by', 'piece')
            qty = item.get('quantity', 0)
            qty_display = f"{qty} {'kg' if sold_by == 'kg' else 'pc' if qty == 1 else 'pcs'}"
            html_body += f"""
                            <tr style="border-bottom: 1px solid #e0e0e0;">
                                <td style="padding: 12px; color: #212121;">{item.get('product_name', 'Unknown')}</td>
                                <td style="padding: 12px; text-align: center; color: #757575;">{qty_display}</td>
                                <td style="padding: 12px; text-align: right; color: #2E7D32; font-weight: bold;">₱{item.get('subtotal', 0):.2f}</td>
                            </tr>
            """
        
        html_body += f"""
                        </table>
                        
                        <!-- Shipping Info -->
                        <div style="margin-top: 25px; padding: 20px; background-color: #E8F5E9; border-radius: 12px;">
                            <h3 style="margin: 0 0 10px 0; color: #2E7D32; font-size: 14px;">📍 Delivery Address</h3>
                            <p style="margin: 0; color: #424242; line-height: 1.5;">
                                {order.get('shipping_address', 'N/A')}<br>
                                {order.get('shipping_city', '')}<br>
                                Phone: {order.get('shipping_phone', 'N/A')}
                            </p>
                        </div>
                        
                        <p style="font-size: 14px; color: #757575; margin-top: 25px; text-align: center;">
                            A PDF receipt is attached to this email for your records.
                        </p>
                    </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                    <td style="background-color: #f5f5f5; padding: 25px; text-align: center; border-top: 1px solid #e0e0e0;">
                        <p style="margin: 0; font-size: 14px; color: #757575;">
                            Thank you for shopping with <strong style="color: #2E7D32;">Bignay Marketplace</strong>!
                        </p>
                        <p style="margin: 10px 0 0 0; font-size: 12px; color: #9e9e9e;">
                            © 2025 Bignay Project. All rights reserved.
                        </p>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        # Plain text fallback
        text_body = f"""
        Bignay Marketplace - Order {status}
        
        Hi {user_name},
        
        {status_msg}
        
        Order Number: #{order_number}
        Total: ₱{total:.2f}
        Status: {status}
        
        Thank you for shopping with Bignay Marketplace!
        """
        
        # Generate PDF attachment
        attachments = []
        pdf_content = self.generate_order_pdf(order)
        if pdf_content:
            attachments.append({
                'filename': f'order_{order_number}_receipt.pdf',
                'content': pdf_content,
                'content_type': 'application/pdf'
            })
        
        # Load logo for inline embedding in HTML email
        inline_images = []
        logo_bytes = self._load_logo_bytes()
        if logo_bytes:
            inline_images.append({
                'content': logo_bytes,
                'cid': 'bignay_logo',
                'filename': 'bignay-logo.png'
            })

        return self.send_email(
            to_email=user_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            attachments=attachments if attachments else None,
            inline_images=inline_images if inline_images else None
        )


    def send_verification_code(self, to_email: str, code: str, purpose: str = 'verify') -> bool:
        """
        Send a verification code email for registration or password reset
        
        Args:
            to_email: Recipient email address
            code: The verification code
            purpose: 'verify' for registration, 'reset' for password reset
        
        Returns:
            bool: True if sent successfully
        """
        if purpose == 'reset':
            subject = "Reset Your Password - Bignay Marketplace"
            heading = "Password Reset Request"
            message = "You requested a password reset for your Bignay Marketplace account. Use the verification code below to reset your password."
            sub_message = "If you did not request a password reset, please ignore this email. Your account is safe."
        else:
            subject = "Verify Your Email - Bignay Marketplace"
            heading = "Email Verification"
            message = "Thank you for registering with Bignay Marketplace! Please use the verification code below to verify your email address."
            sub_message = "If you did not create an account, please ignore this email."
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                    <td style="background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #4CAF50 100%); padding: 40px 30px; text-align: center;">
                        <img src="cid:bignay_logo" alt="Bignay" style="width: 64px; height: 64px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; border-radius: 8px;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Bignay Marketplace</h1>
                    </td>
                </tr>
                
                <!-- Content -->
                <tr>
                    <td style="padding: 40px 36px;">
                        <h2 style="color: #1B5E20; font-size: 22px; margin: 0 0 16px 0; font-weight: 700;">{heading}</h2>
                        
                        <p style="font-size: 15px; color: #424242; line-height: 1.7; margin: 0 0 28px 0;">
                            {message}
                        </p>
                        
                        <!-- Code Box -->
                        <div style="background: linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%); border-radius: 16px; padding: 32px; text-align: center; margin: 0 0 28px 0; border: 2px dashed #4CAF50;">
                            <p style="font-size: 13px; color: #2E7D32; margin: 0 0 12px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Your Verification Code</p>
                            <div style="font-size: 40px; font-weight: 800; color: #1B5E20; letter-spacing: 10px; font-family: 'Courier New', monospace; margin: 0;">
                                {code}
                            </div>
                        </div>
                        
                        <!-- Timer Warning -->
                        <div style="background-color: #FFF3E0; border-radius: 12px; padding: 16px 20px; margin: 0 0 24px 0; display: flex; align-items: center;">
                            <p style="font-size: 14px; color: #E65100; margin: 0; line-height: 1.5;">
                                ⏱️ <strong>This code expires in 10 minutes.</strong> Please enter it promptly.
                            </p>
                        </div>
                        
                        <p style="font-size: 13px; color: #9E9E9E; line-height: 1.6; margin: 0;">
                            {sub_message}
                        </p>
                    </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                    <td style="background-color: #FAFAFA; padding: 24px 36px; text-align: center; border-top: 1px solid #E0E0E0;">
                        <p style="margin: 0 0 6px 0; font-size: 13px; color: #9E9E9E;">
                            &copy; 2026 Bignay Marketplace. All rights reserved.
                        </p>
                        <p style="margin: 0; font-size: 12px; color: #BDBDBD;">
                            This is an automated message. Please do not reply to this email.
                        </p>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        text_body = f"""
        {heading}
        
        {message}
        
        Your verification code: {code}
        
        This code expires in 10 minutes.
        
        {sub_message}
        """
        
        # Load logo for inline embedding in HTML email
        inline_images = []
        logo_bytes = self._load_logo_bytes()
        if logo_bytes:
            inline_images.append({
                'content': logo_bytes,
                'cid': 'bignay_logo',
                'filename': 'bignay-logo.png'
            })

        return self.send_email(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            inline_images=inline_images if inline_images else None
        )


# Singleton instance
_email_service = None

def get_email_service() -> EmailService:
    """Get or create email service singleton"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
