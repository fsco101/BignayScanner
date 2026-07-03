import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_CONFIG, buildApiUrl, getDefaultApiHeaders } from '../../config/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors } from '../../context/ThemeContext';
import SweetAlert, { useSweetAlert } from '../../components/SweetAlert';

const INITIAL_MESSAGES = [
  {
    id: '1',
    type: 'bot',
    text: 'Hello! 👋 I\'m your **Gemini-powered Bignay AI** assistant.\n\nI can help you with everything about Bignay:\n• 🍇 Fruit identification & ripeness stages\n• 🌱 Growing, harvesting & cultivation\n• 🍷 Recipes — wine, jam, vinegar & more\n• 💰 Market prices & selling tips\n• 🍃 Leaf health benefits & herbal tea\n• 📸 App feature guidance\n\n⚠️ I only answer questions related to **Bignay**.\n\nWhat would you like to know?',
    timestamp: new Date(),
  },
];

const QUICK_REPLIES = [
  { id: 'q1', text: '🍇 How to identify ripe Bignay?', topic: 'ripeness' },
  { id: 'q2', text: '🌱 Growing tips for beginners', topic: 'growing' },
  { id: 'q3', text: '🍷 How to make Bignay wine?', topic: 'wine' },
  { id: 'q4', text: '💰 Current market prices', topic: 'price' },
  { id: 'q5', text: '📸 How to use the Scanner?', topic: 'scanner' },
  { id: 'q6', text: '💚 Health benefits of Bignay', topic: 'health' },
];

// Fallback knowledge base for offline responses
const KNOWLEDGE_BASE = {
  'ripe': {
    keywords: ['ripe', 'ripeness', 'identify', 'tell', 'know', 'ready'],
    response: '🍇 **Identifying Ripe Bignay:**\n\n• **Color:** Ripe bignay turns deep purple to black\n• **Texture:** Slightly soft when gently pressed\n• **Taste:** Sweet with mild tartness\n• **Clusters:** Most berries in the cluster are uniformly colored\n\n**Tip:** Harvest when 80% of berries in a cluster are dark purple for best flavor!',
  },
  'growing': {
    keywords: ['grow', 'plant', 'cultivation', 'care', 'soil', 'water'],
    response: '🌱 **Bignay Growing Tips:**\n\n• **Soil:** Well-draining loamy soil, pH 5.5-6.5\n• **Sunlight:** Full sun to partial shade\n• **Watering:** Regular watering, but avoid waterlogging\n• **Spacing:** 6-8 meters apart for mature trees\n• **Fertilizer:** Apply organic compost during growing season\n\nBignay trees are hardy and can tolerate various conditions once established!',
  },
  'wine': {
    keywords: ['wine', 'ferment', 'alcohol', 'brew', 'making'],
    response: '🍷 **Bignay Wine Making:**\n\n1. **Harvest:** Use fully ripe (dark purple) berries\n2. **Clean:** Wash and remove stems\n3. **Crush:** Mash berries to release juice\n4. **Ferment:** Add yeast, sugar (optional), ferment 2-3 weeks\n5. **Strain:** Remove solids after primary fermentation\n6. **Age:** Let it clarify for 2-4 months\n\n**Result:** A beautiful red wine with unique berry flavor!',
  },
  'price': {
    keywords: ['price', 'cost', 'market', 'sell', 'buy', 'worth'],
    response: '💰 **Bignay Market Information:**\n\n• **Fresh Fruit:** ₱150-200 per kilo\n• **Bignay Wine:** ₱200-400 per bottle\n• **Bignay Jam:** ₱120-180 per jar\n• **Dried Leaves:** ₱80-120 per pack\n\n*Prices vary by season and location. Peak season (March-May) typically has lower prices due to abundance.*',
  },
  'mold': {
    keywords: ['mold', 'disease', 'fungus', 'rot', 'spoil'],
    response: '⚠️ **Handling Moldy Bignay:**\n\n• **Discard** any berries with visible mold\n• **Don\'t use** for consumption or processing\n• Mold can spread quickly - separate affected berries\n• Store properly in cool, dry place\n• Check regularly during storage\n\n**Prevention:** Harvest in dry weather and ensure good air circulation!',
  },
  'health': {
    keywords: ['health', 'benefit', 'nutrition', 'vitamin', 'medicinal'],
    response: '💚 **Bignay Health Benefits:**\n\n• **Rich in Antioxidants:** Helps fight free radicals\n• **Vitamin C:** Boosts immune system\n• **Anti-inflammatory:** Traditional medicine uses\n• **Digestive Aid:** High in dietary fiber\n• **Blood Sugar:** May help regulate glucose levels\n\n*The leaves are also used in traditional herbal tea!*',
  },
  'scanner': {
    keywords: ['scan', 'scanner', 'camera', 'detect', 'analyze', 'app', 'use'],
    response: '📸 **Using the Bignay Scanner:**\n\n**How to Use:**\n1. Open Scanner from the menu\n2. Choose Camera or Gallery mode\n3. Select "Fruit" or "Leaf" type\n4. Capture or upload image\n5. Tap "Analyze" for results\n\n**Best Results Tips:**\n• Good lighting (natural light preferred)\n• Clear, focused image\n• Center the subject in frame',
  },
};

function findFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  for (const [topic, data] of Object.entries(KNOWLEDGE_BASE)) {
    if (data.keywords.some(keyword => lowerMessage.includes(keyword))) {
      return data.response;
    }
  }
  
  return '🤔 I\'m not sure about that specific topic. Try asking about:\n\n• Ripeness identification\n• Growing tips\n• Wine/jam making\n• Market prices\n• Health benefits\n• Scanner usage\n\nOr use the scanner to analyze your Bignay!';
}

export function ChatContent({ isModal = false, onClose }) {
  const COLORS = useThemeColors();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const { isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const { alertConfig, showWarning, hideAlert } = useSweetAlert();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const flatListRef = useRef(null);

  // Use responsive hook for dynamic sizing
  const {
    width: screenWidth,
    isMobile,
    isTablet,
    isDesktop,
    sp,
    fp,
    responsive,
    maxContentWidth,
  } = useResponsive();

  // When rendered as a modal (floating widget), force mobile-like compact layout
  const useDesktopLayout = isDesktop && !isModal;
  
  // Dynamic responsive styles
  const dynamicStyles = useMemo(() => ({
    container: {
      paddingHorizontal: responsive({ mobile: sp(8), tablet: sp(16), desktop: sp(24) }),
    },
    contentWidth: {
      maxWidth: useDesktopLayout ? Math.min(screenWidth * 0.7, 800) : '100%',
      alignSelf: 'center',
      width: '100%',
    },
    messageBubble: {
      maxWidth: responsive({ mobile: '85%', tablet: '75%', desktop: '70%' }),
      padding: responsive({ mobile: sp(12), tablet: sp(14), desktop: sp(16) }),
      borderRadius: responsive({ mobile: sp(16), tablet: sp(18), desktop: sp(20) }),
    },
    messageText: {
      fontSize: responsive({ mobile: fp(14), tablet: fp(15), desktop: fp(16) }),
    },
    inputContainer: {
      padding: responsive({ mobile: sp(8), tablet: sp(12), desktop: sp(16) }),
    },
    inputHeight: responsive({ mobile: sp(44), tablet: sp(48), desktop: sp(52) }),
    quickReplyText: {
      fontSize: responsive({ mobile: fp(12), tablet: fp(13), desktop: fp(14) }),
    },
    iconSize: responsive({ mobile: sp(22), tablet: sp(24), desktop: sp(26) }),
    timestampText: {
      fontSize: responsive({ mobile: fp(10), tablet: fp(11), desktop: fp(12) }),
    },
  }), [screenWidth, isMobile, isTablet, useDesktopLayout, sp, fp, responsive, maxContentWidth]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      type: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      // Build URL and prepare request with proper headers & timeout
      const apiUrl = buildApiUrl('/api/chatbot/chat');
      console.log('[Chatbot] Sending request to:', apiUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT || 15000);

      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: getDefaultApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ 
            message: text.trim(),
            context: messages.slice(-8).map(m => ({ type: m.type, text: m.text }))
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

      if (response.ok) {
        const data = await response.json();
        setIsOnline(true);
        
        const botResponse = {
          id: (Date.now() + 1).toString(),
          type: 'bot',
          text: data.response,
          filtered: data.filtered,
          source: data.source || 'unknown',
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, botResponse]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.log('[Chatbot] API returned error:', response.status, errorData);
        throw new Error(errorData.error || `API error (${response.status})`);
      }
    } catch (error) {
      // Fallback to local knowledge base (offline mode only)
      console.log('[Chatbot] Connection failed, using offline fallback:', error.message);
      setIsOnline(false);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const botResponse = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        text: findFallbackResponse(text),
        source: 'offline',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickReply = (quickReply) => {
    sendMessage(quickReply.text);
  };

  const clearChat = () => {
    setMessages(INITIAL_MESSAGES);
  };

  const formatMessageText = (text) => {
    if (!text) return null;
    // Split by bold markers (**)
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    
    return (
      <Text>
        {parts.map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <Text key={index} style={{ fontWeight: 'bold' }}>
                {part.slice(2, -2)}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  const renderMessage = ({ item }) => {
    const isBot = item.type === 'bot';

    const sourceLabel = isBot && item.source && item.source !== 'gemini'
      ? item.source === 'offline' ? '📡 Offline'
        : item.source === 'knowledge_base' ? '📚 Knowledge Base'
        : null
      : null;
    
    return (
      <View style={[
        styles.messageContainer, 
        isBot ? styles.botMessage : styles.userMessage,
        useDesktopLayout && styles.messageContainerDesktop
      ]}>
        {isBot && (
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarEmoji}>🌿</Text>
          </View>
        )}
        <View style={[
          styles.messageBubble, 
          isBot ? styles.botBubble : styles.userBubble,
          useDesktopLayout && styles.messageBubbleDesktop
        ]}>
          <Text style={[styles.messageText, isBot ? styles.botText : styles.userText]}>
            {isBot ? formatMessageText(item.text) : item.text}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={[styles.timestamp, isBot ? styles.botTimestamp : styles.userTimestamp, { marginTop: 0 }]}>
              {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {sourceLabel && (
              <Text style={styles.sourceLabel}>{sourceLabel}</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  useEffect(() => {
    if (!isAuthenticated) {
      showWarning('Login Required', 'You must be logged in to access the AI Assistant.', {
        onConfirm: () => {
          hideAlert();
          navigation.getParent()?.navigate('Auth', { screen: 'Login' });
        },
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loginPrompt}>
          <View style={styles.loginPromptIcon}>
            <Ionicons name="lock-closed" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.loginPromptTitle}>Login Required</Text>
          <Text style={styles.loginPromptText}>
            Please login to access the Gemini-powered Bignay AI assistant.
          </Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.getParent()?.navigate('Auth', { screen: 'Login' })}
          >
            <Ionicons name="log-in-outline" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.loginBtnText}>Login / Register</Text>
          </TouchableOpacity>
        </View>
        <SweetAlert
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
          onConfirm={alertConfig.onConfirm}
          onCancel={hideAlert}
          onClose={hideAlert}
          confirmColor={alertConfig.confirmColor}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Bar with status and clear button */}
      <View style={[styles.headerBar, useDesktopLayout && styles.headerBarDesktop]}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusIndicator, isOnline ? styles.statusOnline : styles.statusOffline]} />
          <Text style={styles.statusText}>{isOnline ? 'Gemini AI' : 'Offline Mode'}</Text>
          {isOnline && <Text style={styles.geminiLabel}>✨</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.clearButton} onPress={clearChat}>
            <Ionicons name="trash-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
          {isModal && onClose && (
            <TouchableOpacity style={styles.clearButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Chat Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.messagesList,
          useDesktopLayout && {
            maxWidth: maxContentWidth,
            width: '100%',
            alignSelf: 'center',
          }
        ]}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isTyping ? (
            <View style={[styles.messageContainer, styles.botMessage, useDesktopLayout && styles.messageContainerDesktop]}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarEmoji}>🌿</Text>
              </View>
              <View style={[styles.messageBubble, styles.botBubble, styles.typingBubble]}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.typingText}>Typing...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Quick Replies */}
      {messages.length <= 2 && (
        <View style={[styles.quickRepliesContainer, useDesktopLayout && styles.quickRepliesContainerDesktop]}>
          <Text style={styles.quickRepliesLabel}>Suggested Questions:</Text>
          <ScrollView 
            horizontal={!useDesktopLayout} 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.quickReplies,
              useDesktopLayout && styles.quickRepliesDesktop
            ]}
          >
            {QUICK_REPLIES.map(reply => (
              <TouchableOpacity 
                key={reply.id} 
                style={[styles.quickReplyButton, useDesktopLayout && styles.quickReplyButtonDesktop]}
                onPress={() => handleQuickReply(reply)}
              >
                <Text style={styles.quickReplyText}>{reply.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input Area */}
      <View style={[styles.inputContainer, useDesktopLayout && styles.inputContainerDesktop]}>
        <View style={[styles.inputWrapper, useDesktopLayout && styles.inputWrapperDesktop]}>
          <TextInput
            style={[styles.textInput, useDesktopLayout && styles.textInputDesktop]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask me about Bignay..."
            placeholderTextColor={COLORS.textLight}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage(inputText)}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isTyping}
          >
            <Ionicons 
              name="send" 
              size={22} 
              color={inputText.trim() ? COLORS.textOnPrimary : COLORS.textLight} 
            />
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

export default function ChatbotScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ChatContent />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loginPromptIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginPromptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  loginPromptText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  loginBtnText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  // Header bar styles
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  headerBarDesktop: {
    paddingHorizontal: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOnline: {
    backgroundColor: COLORS.primaryLight,
  },
  statusOffline: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  geminiLabel: {
    fontSize: 14,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  clearButtonText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  // Messages list
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  messageContainerDesktop: {
    alignSelf: 'center',
    width: '100%',
  },
  botMessage: {
    justifyContent: 'flex-start',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 14,
    borderRadius: 18,
  },
  messageBubbleDesktop: {
    maxWidth: '60%',
  },
  botBubble: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  botText: {
    color: COLORS.text,
  },
  userText: {
    color: COLORS.textOnPrimary,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 6,
  },
  botTimestamp: {
    color: COLORS.textLight,
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  sourceLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  // Quick replies
  quickRepliesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  quickRepliesContainerDesktop: {
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 0,
  },
  quickRepliesLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
    fontWeight: '500',
  },
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickRepliesDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  quickReplyButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  quickReplyButtonDesktop: {
    marginBottom: 4,
  },
  quickReplyText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
  // Input area
  inputContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  inputContainerDesktop: {
    paddingHorizontal: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  inputWrapperDesktop: {
    alignSelf: 'center',
    width: '100%',
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 100,
    color: COLORS.text,
  },
  textInputDesktop: {
    paddingVertical: 14,
    fontSize: 16,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.border,
  },
});
