# Bignay Scanner & Marketplace — System Manual

## Table of Contents

1. System Overview
2. Getting Started
   - Installation & Access
3. Step-by-Step Feature Guide
   - AI Scanner
   - Marketplace (Buyer & Seller)
   - Harvest Map
   - Price Prediction
   - Chatbot
   - Forum
   - Notifications
   - Training Service
4. Admin Features
   - User Management
   - Product & Order Moderation
   - Forum & Content Moderation
   - Analytics
   - Related Studies
5. Troubleshooting & FAQ
6. Security & Best Practices
7. Updates & Maintenance

---

# 1. System Overview

Bignay Scanner & Marketplace is an AI-powered mobile/web platform for Bignay fruit quality assessment, e-commerce, harvest mapping, price prediction, and community features. It is available on Android, iOS, and Web.

---

# 2. Getting Started

## 2.1. Installation & Access

**End-User:**
- Download the app from Expo Go or access the web version.
- Register using email/password, Google, or Firebase.
- Verify your email (6-digit code, valid for 10 minutes).
- Log in to access all features.

**Admin:**
- Admin accounts are assigned via backend (role: `ADMIN`).
- Log in with admin credentials to access management features.

---

# 3. Step-by-Step Feature Guide

## 3.1. AI Scanner
1. Tap the **Scanner** tab.
2. Capture or select a clear, well-lit image of Bignay fruit or leaf.
3. Wait for classification (<10 seconds).
4. View results: ripeness/health, quality grade, suitability.
5. Optionally, contribute your image to improve the AI.

**Troubleshooting:**
- If the image is blurry or dark, retake it as prompted.
- If not Bignay, you’ll be notified and analysis will be rejected.
- If the AI model is unavailable, fallback heuristics are used.

## 3.2. Marketplace

**For Buyers:**
1. Browse products by category, search, or filter.
2. Tap a product for details and reviews.
3. Add items to cart.
4. Checkout: enter shipping address, select payment (COD, GCash, GrabPay).
5. Confirm order. For online payment, complete PayMongo checkout.
6. Receive confirmation and PDF receipt via email.
7. Track order status in-app and via notifications.

**For Sellers:**
1. Go to **My Products**.
2. Tap **Add Product** and fill in details.
3. Save to list the product.
4. Manage inventory and update listings.
5. Fulfill orders and update status.
6. View sales analytics.

**Troubleshooting:**
- Retry payment or use another method if it fails.
- Update inventory if stock is insufficient.
- For upload issues, check internet and image size (<50MB).

## 3.3. Harvest Map
1. Open **Harvest Map**.
2. Browse or add pins (type, description, contact, images).
3. Ensure location is within the Philippines.

**Troubleshooting:**
- Pins outside PH boundaries are rejected.
- For map issues, check internet connection.

## 3.4. Price Prediction
1. Go to **Price Prediction**.
2. View forecast charts for Bignay products.

## 3.5. Chatbot
1. Access **Chatbot** from the menu.
2. Type your question and get instant responses.

## 3.6. Forum
1. Browse news, events, and posts.
2. Search or filter by category.
3. Post questions/comments (moderated).
4. Admins can manage posts.

## 3.7. Notifications
- Receive real-time updates for orders, reviews, and events.
- Tap to view details, mark as read, or clear all.

## 3.8. Training Service
1. Go to **Training Service**.
2. Upload labeled images.
3. Images are validated for quality and uniqueness.
4. AI retrains after enough contributions.

---

# 4. Admin Features

## 4.1. User Management
- View/search users, suspend/unsuspend, promote to admin, reset passwords.

## 4.2. Product & Order Moderation
- Approve/reject/remove listings, override order status, view all orders and analytics.

## 4.3. Forum & Content Moderation
- Create/edit/delete posts, moderate comments.

## 4.4. Analytics
- Access dashboards for sales, user activity, and system health. Export as CSV.

## 4.5. Related Studies
- Upload/manage research studies for users.

---

# 5. Troubleshooting & FAQ

| Issue | Solution |
|-------|----------|
| Can't log in | Check credentials, reset password, or verify email. |
| No verification email | Check spam/junk folder; request resend. |
| Payment failed | Retry, use another method, or check PayMongo status. |
| Image upload fails | Ensure file <50MB, stable internet, supported format. |
| App crashes/freezes | Restart app, update, clear cache. |
| Notifications not received | Enable notifications in device/app settings. |
| Map/images not loading | Check internet connection. |
| Feature missing (admin) | Ensure you are logged in as admin. |
| AI scanner slow/unavailable | Try again later; fallback heuristics may be used. |

---

# 6. Security & Best Practices
- Use strong, unique passwords.
- Do not share your account credentials.
- Report suspicious activity to admins.
- All sensitive data is encrypted and securely stored.
- Content moderation is enforced for all user-generated content.

---

# 7. Updates & Maintenance
- The app checks for updates and may prompt you to update.
- Admins can trigger AI model retraining after enough new data.
- For major issues, contact support or refer to the forum.

---

*For a printable PDF, open this file and export as PDF using your preferred PDF tool (e.g., Microsoft Print to PDF, browser print dialog, or a Markdown-to-PDF converter).*

---

# Generate PDF

pandoc BIGNAY_SYSTEM_MANUAL.md -o BIGNAY_SYSTEM_MANUAL.pdf