"""
PayMongo Helper
Handles PayMongo API integration for online payments
"""

import requests
import base64
from typing import Optional, Dict, Any
from config import get_settings


class PayMongoHelper:
    """Helper class for PayMongo API integration"""
    
    BASE_URL = "https://api.paymongo.com/v1"
    ALLOWED_METHOD_TYPES = {"gcash", "grab_pay"}
    
    def __init__(self):
        self.settings = get_settings()
        self.secret_key = self.settings.paymongo_secret_key
        self.public_key = self.settings.paymongo_public_key
        
    def _get_auth_header(self) -> Dict[str, str]:
        """Get basic auth header for API requests"""
        if not self.secret_key:
            raise ValueError("PayMongo secret key not configured")

        if getattr(self.settings, 'paymongo_test_mode_only', True):
            if not str(self.secret_key).startswith('sk_test_'):
                raise ValueError("PayMongo is configured for test mode only. Use sk_test_ key.")
        
        # PayMongo uses basic auth with secret key as username
        credentials = base64.b64encode(f"{self.secret_key}:".encode()).decode()
        return {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
    def create_checkout_session(
        self,
        amount: float,
        description: str,
        order_id: str,
        customer_email: str,
        customer_name: str,
        success_url: str,
        cancel_url: str,
        line_items: list = None,
        payment_method_types: list | None = None,
        customer_phone: str = None,
        billing_address: dict = None,
    ) -> Dict[str, Any]:
        """
        Create a PayMongo checkout session for payment
        
        Args:
            amount: Amount in PHP (will be converted to centavos)
            description: Payment description
            order_id: Order ID for reference
            customer_email: Customer's email
            customer_name: Customer's name
            success_url: URL to redirect after successful payment
            cancel_url: URL to redirect if payment is cancelled
            line_items: Optional list of line items
            
        Returns:
            Dict with checkout session data or error
        """
        try:
            # Convert PHP to centavos (PayMongo requires centavos)
            amount_centavos = int(amount * 100)
            
            # Build line items if not provided
            if not line_items:
                line_items = [{
                    "currency": "PHP",
                    "amount": amount_centavos,
                    "name": description,
                    "quantity": 1,
                }]
            
            selected_methods = payment_method_types or ["gcash", "grab_pay"]
            selected_methods = [m for m in selected_methods if m in self.ALLOWED_METHOD_TYPES]
            if not selected_methods:
                return {
                    "ok": False,
                    "error": "Invalid payment method. Allowed methods: gcash, grab_pay",
                }

            payload = {
                "data": {
                    "attributes": {
                        "billing": {
                            "email": customer_email,
                            "name": customer_name,
                            **({"phone": customer_phone} if customer_phone else {}),
                            **({"address": billing_address} if billing_address else {}),
                        },
                        "send_email_receipt": True,
                        "show_description": True,
                        "show_line_items": True,
                        "description": f"Order #{order_id} - {description}",
                        "line_items": line_items,
                        "payment_method_types": selected_methods,
                        "success_url": success_url,
                        "cancel_url": cancel_url,
                        "reference_number": order_id,
                    }
                }
            }
            
            response = requests.post(
                f"{self.BASE_URL}/checkout_sessions",
                json=payload,
                headers=self._get_auth_header(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "ok": True,
                    "checkout_session": data["data"],
                    "checkout_url": data["data"]["attributes"]["checkout_url"],
                    "checkout_id": data["data"]["id"],
                }
            else:
                error_data = response.json()
                return {
                    "ok": False,
                    "error": error_data.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                    "status_code": response.status_code,
                }
                
        except requests.exceptions.Timeout:
            return {"ok": False, "error": "Request timeout"}
        except requests.exceptions.RequestException as e:
            return {"ok": False, "error": str(e)}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def get_checkout_session(self, checkout_id: str) -> Dict[str, Any]:
        """
        Get checkout session details
        
        Args:
            checkout_id: PayMongo checkout session ID
            
        Returns:
            Dict with checkout session data or error
        """
        try:
            response = requests.get(
                f"{self.BASE_URL}/checkout_sessions/{checkout_id}",
                headers=self._get_auth_header(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "ok": True,
                    "checkout_session": data["data"],
                    "status": data["data"]["attributes"]["status"],
                    "payment_intent_id": data["data"]["attributes"].get("payment_intent", {}).get("id"),
                }
            else:
                error_data = response.json()
                return {
                    "ok": False,
                    "error": error_data.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
                
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def create_payment_intent(
        self,
        amount: float,
        description: str,
        statement_descriptor: str = "BIGNAY",
        payment_method_allowed: list | None = None,
    ) -> Dict[str, Any]:
        """
        Create a PayMongo payment intent
        
        Args:
            amount: Amount in PHP
            description: Payment description
            statement_descriptor: Descriptor shown on bank statement
            
        Returns:
            Dict with payment intent data or error
        """
        try:
            amount_centavos = int(amount * 100)
            
            selected_methods = payment_method_allowed or ["gcash", "grab_pay"]
            selected_methods = [m for m in selected_methods if m in self.ALLOWED_METHOD_TYPES]
            if not selected_methods:
                return {
                    "ok": False,
                    "error": "Invalid payment method. Allowed methods: gcash, grab_pay",
                }

            payload = {
                "data": {
                    "attributes": {
                        "amount": amount_centavos,
                        "payment_method_allowed": selected_methods,
                        "currency": "PHP",
                        "description": description,
                        "statement_descriptor": statement_descriptor,
                    }
                }
            }
            
            response = requests.post(
                f"{self.BASE_URL}/payment_intents",
                json=payload,
                headers=self._get_auth_header(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "ok": True,
                    "payment_intent": data["data"],
                    "payment_intent_id": data["data"]["id"],
                    "client_key": data["data"]["attributes"]["client_key"],
                }
            else:
                error_data = response.json()
                return {
                    "ok": False,
                    "error": error_data.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
                
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def get_payment_intent(self, payment_intent_id: str) -> Dict[str, Any]:
        """
        Get payment intent details
        
        Args:
            payment_intent_id: PayMongo payment intent ID
            
        Returns:
            Dict with payment intent data or error
        """
        try:
            response = requests.get(
                f"{self.BASE_URL}/payment_intents/{payment_intent_id}",
                headers=self._get_auth_header(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "ok": True,
                    "payment_intent": data["data"],
                    "status": data["data"]["attributes"]["status"],
                    "amount": data["data"]["attributes"]["amount"] / 100,  # Convert centavos to PHP
                }
            else:
                error_data = response.json()
                return {
                    "ok": False,
                    "error": error_data.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
                
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def create_source(
        self,
        amount: float,
        source_type: str,  # gcash, grab_pay
        redirect_success: str,
        redirect_failed: str,
        billing_email: str = None,
        billing_name: str = None,
    ) -> Dict[str, Any]:
        """
        Create a payment source for e-wallets (GCash, GrabPay)
        
        Args:
            amount: Amount in PHP
            source_type: Payment source type (gcash, grab_pay)
            redirect_success: Success redirect URL
            redirect_failed: Failed redirect URL
            billing_email: Customer email
            billing_name: Customer name
            
        Returns:
            Dict with source data or error
        """
        try:
            amount_centavos = int(amount * 100)
            
            payload = {
                "data": {
                    "attributes": {
                        "amount": amount_centavos,
                        "redirect": {
                            "success": redirect_success,
                            "failed": redirect_failed,
                        },
                        "type": source_type,
                        "currency": "PHP",
                    }
                }
            }
            
            if billing_email or billing_name:
                payload["data"]["attributes"]["billing"] = {}
                if billing_email:
                    payload["data"]["attributes"]["billing"]["email"] = billing_email
                if billing_name:
                    payload["data"]["attributes"]["billing"]["name"] = billing_name
            
            response = requests.post(
                f"{self.BASE_URL}/sources",
                json=payload,
                headers=self._get_auth_header(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "ok": True,
                    "source": data["data"],
                    "source_id": data["data"]["id"],
                    "checkout_url": data["data"]["attributes"]["redirect"]["checkout_url"],
                }
            else:
                error_data = response.json()
                return {
                    "ok": False,
                    "error": error_data.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
                
        except Exception as e:
            return {"ok": False, "error": str(e)}
    
    def get_source(self, source_id: str) -> Dict[str, Any]:
        """
        Get source details
        
        Args:
            source_id: PayMongo source ID
            
        Returns:
            Dict with source data or error
        """
        try:
            response = requests.get(
                f"{self.BASE_URL}/sources/{source_id}",
                headers=self._get_auth_header(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "ok": True,
                    "source": data["data"],
                    "status": data["data"]["attributes"]["status"],
                }
            else:
                error_data = response.json()
                return {
                    "ok": False,
                    "error": error_data.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
                
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ──────────────────────────────────────────────────────────────────────────
    # Webhook Management
    # ──────────────────────────────────────────────────────────────────────────

    WEBHOOK_EVENTS = [
        "checkout_session.payment.paid",
        "checkout_session.payment.failed",
        "payment.paid",
        "payment.failed",
        "payment.refunded",
        "payment.refund.updated",
        "link.payment.paid",
    ]

    def list_webhooks(self) -> Dict[str, Any]:
        """List all registered webhooks for this account."""
        try:
            response = requests.get(
                f"{self.BASE_URL}/webhooks",
                headers=self._get_auth_header(),
                timeout=30,
            )
            if response.status_code == 200:
                data = response.json()
                webhooks = [
                    {
                        "id": wh["id"],
                        "url": wh["attributes"]["url"],
                        "status": wh["attributes"]["status"],
                        "events": wh["attributes"]["events"],
                        "created_at": wh["attributes"].get("created_at"),
                    }
                    for wh in data.get("data", [])
                ]
                return {"ok": True, "webhooks": webhooks}
            else:
                err = response.json()
                return {
                    "ok": False,
                    "error": err.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def register_webhook(self, url: str, events: list | None = None) -> Dict[str, Any]:
        """
        Register a new webhook URL with PayMongo.

        Args:
            url: The publicly accessible HTTPS URL that PayMongo will POST to.
            events: List of event types to subscribe to. Defaults to all payment events.

        Returns:
            Dict with webhook id and secret, or error.
        """
        try:
            selected_events = events or self.WEBHOOK_EVENTS
            payload = {
                "data": {
                    "attributes": {
                        "url": url,
                        "events": selected_events,
                    }
                }
            }
            response = requests.post(
                f"{self.BASE_URL}/webhooks",
                json=payload,
                headers=self._get_auth_header(),
                timeout=30,
            )
            if response.status_code == 200:
                data = response.json()
                wh = data["data"]
                return {
                    "ok": True,
                    "webhook_id": wh["id"],
                    "url": wh["attributes"]["url"],
                    "status": wh["attributes"]["status"],
                    "events": wh["attributes"]["events"],
                    "secret_key": wh["attributes"].get("secret_key"),  # store this as PAYMONGO_WEBHOOK_SECRET
                }
            else:
                err = response.json()
                return {
                    "ok": False,
                    "error": err.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                    "raw": err,
                }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def enable_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Enable a disabled webhook."""
        try:
            response = requests.post(
                f"{self.BASE_URL}/webhooks/{webhook_id}/enable",
                headers=self._get_auth_header(),
                timeout=30,
            )
            if response.status_code == 200:
                data = response.json()
                return {"ok": True, "status": data["data"]["attributes"]["status"]}
            else:
                err = response.json()
                return {
                    "ok": False,
                    "error": err.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def disable_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Disable an active webhook."""
        try:
            response = requests.post(
                f"{self.BASE_URL}/webhooks/{webhook_id}/disable",
                headers=self._get_auth_header(),
                timeout=30,
            )
            if response.status_code == 200:
                data = response.json()
                return {"ok": True, "status": data["data"]["attributes"]["status"]}
            else:
                err = response.json()
                return {
                    "ok": False,
                    "error": err.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def delete_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Delete (permanently remove) a registered webhook."""
        try:
            response = requests.delete(
                f"{self.BASE_URL}/webhooks/{webhook_id}",
                headers=self._get_auth_header(),
                timeout=30,
            )
            if response.status_code == 200:
                return {"ok": True, "deleted": True}
            else:
                err = response.json()
                return {
                    "ok": False,
                    "error": err.get("errors", [{"detail": "Unknown error"}])[0].get("detail", "Unknown error"),
                }
        except Exception as e:
            return {"ok": False, "error": str(e)}


# Singleton instance
paymongo_helper = PayMongoHelper()
