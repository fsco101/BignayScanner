// Terms and Conditions Screen
// Displays full terms and conditions for Bignay Scanner & Marketplace

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../context/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';

const TERMS_SECTIONS = [
  {
    title: '1. Introduction',
    content:
      'Welcome to Bignay Scanner & Marketplace ("the App," "our App," "we," "us," or "our"). These Terms and Conditions ("Terms") govern your access to and use of the Bignay Scanner & Marketplace mobile application, including all features, content, and services offered through the platform. By accessing or using the App, you agree to be bound by these Terms. If you do not agree, you must not use the App.\n\nThe Bignay Scanner & Marketplace is an AI-powered platform designed to support the Philippine Bignay (Antidesma bunius) agricultural ecosystem by providing intelligent fruit and leaf quality assessment, a marketplace for buying and selling Bignay products, community-driven harvest mapping, price prediction tools, and educational resources.',
  },
  {
    title: '2. Definitions',
    content:
      '• "User" refers to any individual who accesses or uses the App, including Buyers, Sellers, and general users.\n• "Buyer" refers to a User who purchases products through the Marketplace.\n• "Seller" refers to a User who lists and sells products through the Marketplace.\n• "Admin" or "Administrator" refers to authorized personnel who manage, moderate, and oversee the operations of the App.\n• "Content" refers to text, images, data, or any other material uploaded, posted, or transmitted through the App.\n• "AI Scanner" refers to the machine learning-powered image classification features of the App.\n• "Marketplace" refers to the e-commerce section where products are listed, bought, and sold.\n• "Services" refers to all features and functionalities provided by the App.',
  },
  {
    title: '3. Eligibility',
    content:
      '3.1. You must be at least 18 years of age or the legal age of majority in your jurisdiction to create an account and use the App.\n\n3.2. By using this App, you represent and warrant that you have the legal capacity to enter into a binding agreement and that all information you provide is accurate, current, and complete.\n\n3.3. Users must be located in or have a valid shipping address within the Republic of the Philippines to participate in marketplace transactions.',
  },
  {
    title: '4. Account Registration and Security',
    content:
      '4.1. To access certain features of the App (e.g., purchasing products, selling products, scanning history, and contributing training data), you must create an account by providing a valid email address and password, or by signing in through Google OAuth or Firebase Authentication.\n\n4.2. You are required to verify your email address using the verification code sent to your registered email before gaining full access to your account.\n\n4.3. You are solely responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.\n\n4.4. You must not share your account with others, create multiple accounts for the same person, or impersonate another individual.\n\n4.5. We reserve the right to suspend or terminate your account if we suspect fraudulent, abusive, or otherwise unauthorized activity.',
  },
  {
    title: '5. User Roles and Responsibilities',
    content:
      'Buyers:\n• Buyers may browse the Marketplace, search for products, add items to a cart, place orders, and leave reviews for products they have purchased.\n• Buyers must provide accurate shipping and billing information during checkout.\n• Buyers acknowledge that product images and descriptions are provided by sellers and may vary from the actual product delivered.\n\nSellers:\n• Sellers may list products for sale, including uploading product images, setting prices, managing stock quantities, and fulfilling orders.\n• Sellers are fully responsible for the accuracy of product descriptions, images, pricing, and availability.\n• Sellers must ensure that all products listed comply with applicable Philippine laws and regulations, including food safety, labeling, and agricultural standards.\n• Sellers must fulfill confirmed orders in a timely manner and update order statuses accordingly.\n• Sellers are responsible for the quality and safety of the products they sell.\n\nAdministrators:\n• Administrators have the authority to moderate products, manage user accounts (including suspension), oversee order disputes, manage forum content, and enforce these Terms.\n• Administrator decisions regarding content moderation, account suspension, and dispute resolution are final.',
  },
  {
    title: '6. AI Scanner and Classification Services',
    content:
      '6.1. The App uses machine learning models to classify Bignay fruit ripeness levels (unripe, ripe, overripe, good, mold), detect leaf health conditions (healthy, mold), and verify whether an image contains Bignay.\n\n6.2. The AI Scanner provides estimations and is not a substitute for professional agricultural or food safety assessment. Classification results, including ripeness indices, quality grades, product suitability scores, and mold severity assessments, are provided for informational and reference purposes only.\n\n6.3. We do not guarantee the accuracy, completeness, or reliability of the AI classification output. Users should exercise their own judgment and consult appropriate professionals when making decisions about food consumption, product quality, or agricultural practices based on scanner results.\n\n6.4. The App may pre-filter images to determine whether they contain Bignay. Images not recognized as Bignay will not be processed further.\n\n6.5. Image quality factors such as blur, brightness, and contrast may affect classification accuracy. The system may provide feedback about image quality to help users capture better images.',
  },
  {
    title: '7. Training Data Contributions',
    content:
      '7.1. Users may voluntarily contribute images to help improve the AI classification models. By uploading images for training purposes, you grant us a non-exclusive, worldwide, royalty-free, perpetual, irrevocable license to use, reproduce, modify, adapt, process, and incorporate the contributed images into our machine learning training datasets.\n\n7.2. You represent and warrant that you own or have the right to submit any images you contribute and that such images do not infringe on the intellectual property rights of any third party.\n\n7.3. Contributed images undergo automated quality validation including resolution, blur detection, brightness, contrast assessment, and duplicate detection. Images that do not meet quality standards may be rejected.\n\n7.4. We reserve the right to use contributed data to retrain and improve our machine learning models without further notification or compensation.',
  },
  {
    title: '8. Marketplace Transactions',
    content:
      'Product Listings:\n• All products listed on the Marketplace must be genuine Bignay-related products or products within the permitted categories of the App.\n• Sellers must not list prohibited, illegal, counterfeit, or unsafe products.\n• We reserve the right to review, approve, reject, or remove any product listing at our discretion.\n\nPricing:\n• All prices are displayed in Philippine Pesos (₱) and are set by individual sellers.\n• We do not control or guarantee the pricing set by sellers.\n• Price prediction features are based on algorithmic forecasting and are estimates only. Actual market prices may vary.\n\nOrders and Payments:\n• An order is created when a Buyer completes checkout with the selected items and payment method.\n• Payment Methods: Cash on Delivery (COD) — payment is made upon receipt of the product. Online Payment — processed through PayMongo, including GCash and GrabPay, subject to PayMongo\'s terms of service and privacy policy.\n• For online payments, stock is reserved during checkout and confirmed upon successful payment verification. Failed or abandoned payments will result in order cancellation and stock release.\n• A confirmation email with a PDF receipt is sent upon successful order placement.\n• Order status progresses through: Pending → Confirmed → Processing → Shipped → Delivered.\n\nOrder Cancellation and Refunds:\n• Orders may be cancelled by Buyers before the order is confirmed by the Seller.\n• Refund policies for online payments are subject to PayMongo\'s terms and applicable Philippine regulations.\n• We are not directly responsible for processing refunds for online payments; these are handled through the payment provider.\n• Sellers are responsible for addressing product-related disputes.\n\nReviews and Ratings:\n• Buyers who have a verified purchase may leave reviews and ratings for products they ordered.\n• Reviews are subject to content filtering. Profane, abusive, or offensive language will be automatically filtered.\n• We reserve the right to remove reviews that violate these Terms, contain spam, or are otherwise inappropriate.\n• Sellers must not manipulate or fabricate reviews.',
  },
  {
    title: '9. Harvest Map',
    content:
      '9.1. The Harvest Map is a community-driven feature that allows users to pin Bignay-related locations (farms, blooming areas, markets, and other points of interest) on an interactive map.\n\n9.2. All harvest pins are validated to be within the geographic boundaries of the Philippines (4.2°–21.5°N latitude, 116°–127.5°E longitude). Pins outside these boundaries will be rejected.\n\n9.3. Users are responsible for the accuracy of the location data, descriptions, and contact information they share on the Harvest Map.\n\n9.4. You must not post misleading, false, or harmful location information. Posting private addresses or sensitive location data without the property owner\'s consent is prohibited.\n\n9.5. We are not liable for any damages, losses, or disputes arising from the use of Harvest Map data.',
  },
  {
    title: '10. Chatbot (AI Assistant)',
    content:
      '10.1. The App includes an AI-powered chatbot that provides general guidance on Bignay-related topics, including farming, recipes, health benefits, market pricing, and app features.\n\n10.2. The chatbot is for informational purposes only and does not constitute professional agricultural, medical, financial, or legal advice.\n\n10.3. Content safety filters are applied to chatbot interactions. The chatbot will not respond to queries related to violence, explicit content, illegal activities, or hate speech.\n\n10.4. We do not guarantee the accuracy, completeness, or appropriateness of chatbot responses. Users should independently verify information provided by the chatbot.',
  },
  {
    title: '11. Forum',
    content:
      '11.1. The Forum is a curated section managed by administrators to publish content about news, events, educational material about Bignay, and organizational updates.\n\n11.2. Forum content is published solely by authorized administrators. General users may view, search, and engage with forum posts (likes, views) but may not create posts.\n\n11.3. All forum content is subject to our content moderation policies. We reserve the right to edit, remove, or restrict any content at our discretion.',
  },
  {
    title: '12. Price Prediction',
    content:
      '12.1. The App provides price forecasts for Bignay products based on seasonal patterns calibrated to Philippine harvest cycles, historical market data, and algorithmic modeling.\n\n12.2. Price predictions are estimates only and should not be relied upon as the sole basis for financial or business decisions. Actual market prices may differ from predictions.\n\n12.3. We are not liable for any financial losses incurred as a result of reliance on price prediction data.',
  },
  {
    title: '13. Notifications',
    content:
      '13.1. By using the App, you consent to receive in-app notifications related to your orders, payments, reviews, forum posts, and system announcements.\n\n13.2. Notifications are delivered in real-time via WebSocket connections when the App is active.\n\n13.3. You may manage your notification preferences through the App settings.',
  },
  {
    title: '14. Prohibited Conduct',
    content:
      'Users must not:\n\n14.1. Use the App for any unlawful purpose or in violation of any applicable Philippine or international laws.\n\n14.2. Upload, post, or transmit any content that is defamatory, obscene, offensive, threatening, harassing, discriminatory, or otherwise objectionable.\n\n14.3. Attempt to gain unauthorized access to other users\' accounts, the App\'s servers, databases, or infrastructure.\n\n14.4. Use automated scripts, bots, or crawlers to access, scrape, or interact with the App without express written permission.\n\n14.5. Manipulate product reviews, ratings, or marketplace metrics through fake accounts, purchases, or incentivized reviews.\n\n14.6. Upload malicious files, viruses, or code designed to disrupt the App\'s functionality.\n\n14.7. Circumvent security measures, content filters, or access controls implemented by the App.\n\n14.8. Use the AI Scanner or Chatbot to process content unrelated to Bignay or the App\'s intended purpose.\n\n14.9. Misrepresent your identity; impersonate other users, sellers, or administrators.\n\n14.10. List or sell counterfeit, expired, contaminated, or prohibited products on the Marketplace.',
  },
  {
    title: '15. Account Suspension and Termination',
    content:
      '15.1. We reserve the right to suspend or terminate user accounts for violations of these Terms, at our sole discretion.\n\n15.2. Suspension Types:\n• Temporary Suspension: 1 hour, 8 hours, 1 day, 15 days, or 1 month, depending on the severity of the violation.\n• Permanent Suspension: For severe or repeated violations.\n\n15.3. Suspended users will be notified with the reason and duration of their suspension.\n\n15.4. Suspended users may not create new accounts to circumvent the suspension.\n\n15.5. Upon permanent termination, all associated data may be retained for legal compliance or deleted in accordance with our Privacy Policy.',
  },
  {
    title: '16. Intellectual Property',
    content:
      '16.1. All rights, title, and interest in and to the App, including but not limited to software, algorithms, machine learning models, designs, logos, trademarks, and content, are owned by or licensed to us and are protected under applicable intellectual property laws.\n\n16.2. You may not reproduce, distribute, modify, create derivative works from, reverse engineer, or decompile any part of the App without our prior written consent.\n\n16.3. User-generated content (product listings, reviews, harvest pins, forum interactions) remains the intellectual property of the respective user, subject to the license granted herein for us to display and use such content within the App.',
  },
  {
    title: '17. Privacy and Data Collection',
    content:
      '17.1. Your use of the App is also governed by our Privacy Policy, which describes how we collect, use, store, and protect your personal information.\n\n17.2. By using the App, you consent to the collection and processing of your data as described in the Privacy Policy and in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).\n\n17.3. We collect and process the following types of data:\n• Account Information: Name, email, phone number, address, profile image.\n• Transaction Data: Order details, payment information, shipping addresses.\n• Usage Data: Scan history, marketplace activity, forum interactions.\n• Location Data: Harvest map pin locations (voluntarily submitted).\n• Image Data: Product images, scan images, training data contributions.\n• Device Data: Device type, operating system, app version for technical support.\n\n17.4. We use industry-standard security measures, including password hashing, JWT-based authentication, and encrypted communications, to protect your data.\n\n17.5. We do not sell your personal information to third parties.',
  },
  {
    title: '18. Third-Party Services',
    content:
      '18.1. The App integrates with third-party services including but not limited to:\n• PayMongo for payment processing\n• Google Gemini for AI chatbot services\n• Cloudinary for image hosting and delivery\n• Firebase for authentication services\n• Google OAuth for sign-in\n\n18.2. Your use of these third-party services is subject to their respective terms of service and privacy policies. We are not responsible for the practices, policies, or actions of third-party service providers.\n\n18.3. We do not guarantee the availability, accuracy, or reliability of third-party services.',
  },
  {
    title: '19. Disclaimers',
    content:
      '19.1. THE APP AND ALL SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR AVAILABILITY.\n\n19.2. We do not warrant that:\n• The AI classification results will be accurate, complete, or error-free.\n• The Marketplace transactions will be free from disputes or issues.\n• The App will be uninterrupted, secure, or free of bugs or errors.\n• Price predictions will accurately reflect actual market conditions.\n• The chatbot will provide correct or comprehensive information.\n\n19.3. The App is designed as a tool to assist users with Bignay-related activities and is not a substitute for professional agricultural, medical, food safety, financial, or legal advice.',
  },
  {
    title: '20. Limitation of Liability',
    content:
      '20.1. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF THE APP.\n\n20.2. We are not liable for:\n• Product quality, safety, or suitability of items purchased through the Marketplace.\n• Disputes between Buyers and Sellers.\n• Financial losses arising from reliance on price prediction data.\n• Decisions made based on AI Scanner outputs or chatbot recommendations.\n• Unauthorized access to your account resulting from your failure to protect your credentials.\n• Actions or omissions of third-party service providers.\n\n20.3. Our total aggregate liability for any claims arising under these Terms shall not exceed the amount paid by you through the App in the twelve (12) months preceding the claim.',
  },
  {
    title: '21. Indemnification',
    content:
      'You agree to indemnify, defend, and hold harmless the App, its developers, affiliates, officers, and agents from and against any claims, liabilities, damages, losses, or expenses (including reasonable legal fees) arising from:\n\n• Your use of or access to the App.\n• Your violation of these Terms.\n• Your violation of any third-party rights, including intellectual property rights.\n• Any content you upload, post, or transmit through the App.\n• Products you list or sell through the Marketplace.',
  },
  {
    title: '22. Governing Law and Dispute Resolution',
    content:
      '22.1. These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines.\n\n22.2. Any disputes arising out of or relating to these Terms or the use of the App shall first be resolved through good-faith negotiation between the parties.\n\n22.3. If the dispute cannot be resolved through negotiation within thirty (30) days, the dispute shall be submitted to mediation under the rules of the Philippine Dispute Resolution Center.\n\n22.4. If mediation fails, the dispute shall be submitted to the exclusive jurisdiction of the courts of the Republic of the Philippines.',
  },
  {
    title: '23. Changes to These Terms',
    content:
      '23.1. We reserve the right to modify or update these Terms at any time. Changes will be effective upon posting the updated Terms within the App with a revised "Last Updated" date.\n\n23.2. Continued use of the App after any changes constitutes your acceptance of the revised Terms.\n\n23.3. We will make reasonable efforts to notify users of material changes to these Terms through in-app notifications or email.',
  },
  {
    title: '24. Contact Information',
    content:
      'For questions, concerns, or feedback regarding these Terms and Conditions, please contact us through the in-app Chatbot or contact support through the App.',
  },
  {
    title: '25. Severability',
    content:
      'If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction, the remaining provisions shall remain in full force and effect.',
  },
  {
    title: '26. Entire Agreement',
    content:
      'These Terms, together with the Privacy Policy and any other legal notices or agreements published by us through the App, constitute the entire agreement between you and us regarding the use of the App and supersede all prior agreements, understandings, and communications.\n\nBy creating an account or using the Bignay Scanner & Marketplace App, you acknowledge that you have read, understood, and agreed to be bound by these Terms and Conditions.',
  },
];

const TermsAndConditionsScreen = ({ navigation }) => {
  const COLORS = useThemeColors();
  const { sp, fp, responsive, isMobile, isDesktop, maxContentWidth, wp } = useResponsive();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const dynamicStyles = useMemo(() => ({
    container: {
      padding: responsive({ mobile: sp(16), tablet: sp(24), desktop: sp(32) }),
    },
    contentWrapper: {
      width: isDesktop ? Math.min(wp(700), maxContentWidth * 0.6) : '100%',
      maxWidth: 800,
      alignSelf: 'center',
    },
    title: {
      fontSize: responsive({ mobile: fp(22), tablet: fp(26), desktop: fp(28) }),
    },
    subtitle: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }),
    },
    sectionTitle: {
      fontSize: responsive({ mobile: fp(15), tablet: fp(16), desktop: fp(17) }),
    },
    sectionContent: {
      fontSize: responsive({ mobile: fp(13), tablet: fp(14), desktop: fp(15) }),
    },
  }), [sp, fp, responsive, isMobile, isDesktop, maxContentWidth, wp]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={sp(22)} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="document-text" size={sp(20)} color={COLORS.primary} />
          <Text style={[styles.headerTitle, { fontSize: fp(16) }]}>Terms and Conditions</Text>
        </View>
        <View style={{ width: sp(34) }} />
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[dynamicStyles.container, { paddingBottom: sp(40) }]}
        showsVerticalScrollIndicator={true}
      >
        <View style={dynamicStyles.contentWrapper}>
          {/* Title Section */}
          <View style={styles.titleSection}>
            <Ionicons name="shield-checkmark" size={sp(40)} color={COLORS.primary} />
            <Text style={[styles.title, dynamicStyles.title]}>Terms and Conditions</Text>
            <Text style={[styles.appName, { fontSize: fp(14) }]}>Bignay Scanner & Marketplace</Text>
            <Text style={[styles.dateText, dynamicStyles.subtitle]}>
              Effective Date: March 6, 2026  •  Last Updated: March 6, 2026
            </Text>
          </View>

          {/* Sections */}
          {TERMS_SECTIONS.map((section, index) => (
            <View key={index} style={styles.section}>
              <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{section.title}</Text>
              <Text style={[styles.sectionContent, dynamicStyles.sectionContent]}>{section.content}</Text>
            </View>
          ))}

          {/* Bottom acknowledgment */}
          <View style={styles.acknowledgment}>
            <Ionicons name="information-circle" size={sp(18)} color={COLORS.primary} />
            <Text style={[styles.acknowledgmentText, { fontSize: fp(12) }]}>
              By creating an account or using the Bignay Scanner & Marketplace App, you acknowledge that you have read, understood, and agreed to be bound by these Terms and Conditions.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : Platform.OS === 'web' ? 12 : 40,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontWeight: '700',
    color: COLORS.text,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: 8,
  },
  title: {
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 12,
    textAlign: 'center',
  },
  appName: {
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 4,
  },
  dateText: {
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  sectionContent: {
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  acknowledgment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.primaryLight + '15',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  acknowledgmentText: {
    flex: 1,
    color: COLORS.text,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

export default TermsAndConditionsScreen;
