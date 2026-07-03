"""
Chatbot Routes
AI-powered assistant for Bignay-related queries with content filtering
"""

from __future__ import annotations
import re
import os
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from typing import Optional
import json

try:
    from google import genai as google_genai
    from google.genai import types as genai_types
except ImportError:  # Gemini is optional in some environments
    google_genai = None
    genai_types = None

chatbot_bp = Blueprint('chatbot', __name__, url_prefix='/api/chatbot')

# Content filter for sensitive topics
SENSITIVE_TOPICS = [
    # Violence and harmful content
    r'\b(kill|murder|attack|weapon|gun|bomb|terrorism|suicide|self-harm)\b',
    # Explicit content
    r'\b(porn|xxx|nude|naked|explicit|sexual)\b',
    # Illegal activities
    r'\b(drug|cocaine|heroin|meth|illegal|hack|crack|pirate)\b',
    # Personal information extraction
    r'\b(password|credit card|social security|bank account|ssn)\b',
    # Hate speech indicators
    r'\b(hate|racist|sexist|discriminat)\b',
    # Political/religious extremism
    r'\b(extremist|radical|fanatical)\b',
]

# System context for the chatbot
SYSTEM_CONTEXT = """You are a knowledgeable and friendly Bignay AI assistant embedded in a mobile app called "Bignay App".
Bignay (Antidesma bunius) is a tropical fruit native to Southeast Asia, especially the Philippines.

Your expertise covers:
1. **Bignay fruit** — identification, ripeness stages (unripe/green, turning/pink, ripe/red, fully ripe/dark purple-black), taste profiles, and nutritional content
2. **Cultivation & farming** — soil, climate, planting, pruning, pest/disease management, harvesting best practices
3. **Processing & recipes** — wine, jam, jelly, vinegar, juice, tea, dried fruit, and other products
4. **Health benefits** — antioxidants, vitamins, traditional medicinal uses, leaf tea benefits
5. **Market & business** — pricing in the Philippines (₱ peso), selling tips, packaging, marketplace features
6. **Leaf health** — identifying healthy vs diseased/moldy leaves, herbal uses
7. **App features** — Scanner (AI fruit/leaf classification), Marketplace, Harvest Heatmap, Forum, Price Prediction, Order system

Guidelines:
- Provide detailed, accurate, and helpful answers with specific information
- Use bullet points, numbered lists, and bold text (markdown) for readability
- Include practical tips, measurements, and actionable advice
- When discussing prices, use Philippine Peso (₱)
- If a question is NOT related to Bignay or the app, politely decline and suggest a Bignay-related topic
- Be warm, encouraging, and supportive of farmers and Bignay enthusiasts
- You may use relevant emojis sparingly to enhance readability
- Keep responses concise but thorough (aim for 100-300 words unless more detail is needed)"""

GEMINI_MODEL_NAME = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
_genai_client = None               # google.genai.Client instance
_exhausted_models: set = set()      # models that returned quota-exhausted 429

# Preferred model fallback order
_MODEL_CANDIDATES = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
]

if GEMINI_API_KEY:
    print(f"[Chatbot] Gemini API key configured, using model: {GEMINI_MODEL_NAME}")
else:
    print("[Chatbot] WARNING: GEMINI_API_KEY not set. Chatbot will use hardcoded knowledge base fallback.")
    print("[Chatbot] To enable AI responses, add GEMINI_API_KEY=your_key to your .env file")

# Enhanced knowledge base with comprehensive Bignay information
KNOWLEDGE_BASE = {
    'identification': {
        'keywords': ['identify', 'recognize', 'look', 'appearance', 'color', 'shape', 'what does', 'how does'],
        'response': '''🍇 **Bignay Identification Guide:**

**The Fruit:**
• **Size:** Small berries, 6-8mm diameter
• **Shape:** Round to slightly oval
• **Color progression:** Green → White → Pink → Red → Dark Purple/Black
• **Clusters:** Grows in hanging clusters like grapes
• **Taste:** Sweet-tart when ripe, similar to cranberries

**The Tree:**
• **Height:** 5-15 meters tall
• **Leaves:** Alternately arranged, 10-20cm long, glossy green
• **Bark:** Gray-brown, slightly rough

**Tip:** Use our Scanner feature to instantly identify ripeness stages!'''
    },
    'ripeness': {
        'keywords': ['ripe', 'ripeness', 'ready', 'harvest time', 'when to pick', 'mature'],
        'response': '''🎯 **Bignay Ripeness Stages:**

1. **Unripe (Green):** Hard, very sour - NOT ready
2. **Turning (White/Pink):** Beginning to soften - Wait
3. **Ripe (Red):** Sweet-tart, good for fresh eating
4. **Fully Ripe (Dark Purple/Black):** Maximum sweetness, ideal for wine/jam

**Best Harvesting Practice:**
• Harvest when 70-80% of cluster is dark purple
• Morning harvest reduces bruising
• Handle gently - berries are delicate
• Process within 24-48 hours of harvest

**Use our Scanner** to check ripeness with AI-powered detection!'''
    },
    'growing': {
        'keywords': ['grow', 'plant', 'cultivation', 'care', 'soil', 'water', 'fertilizer', 'farm', 'garden'],
        'response': '''🌱 **Bignay Growing Guide:**

**Climate:** Tropical to subtropical (thrives in Philippines)

**Soil Requirements:**
• Well-draining loamy soil
• pH 5.5-6.5 (slightly acidic)
• Rich in organic matter

**Planting:**
• Spacing: 6-8 meters apart
• Can grow from seeds or cuttings
• Best planted at start of rainy season

**Care Tips:**
• Regular watering (avoid waterlogging)
• Mulch around base to retain moisture
• Prune to maintain shape and airflow
• Apply organic compost 2-3 times yearly

**Harvest:** Trees bear fruit 3-5 years after planting'''
    },
    'wine': {
        'keywords': ['wine', 'ferment', 'alcohol', 'brew', 'making wine', 'winemaking'],
        'response': '''🍷 **Bignay Wine Making Guide:**

**Ingredients:**
• 2kg ripe Bignay (dark purple)
• 1kg sugar
• Wine yeast or natural fermentation
• 4 liters water

**Process:**
1. **Preparation:** Wash berries, remove stems
2. **Crushing:** Mash thoroughly to release juice
3. **Primary Ferment:** Add sugar & yeast, ferment 7-14 days
4. **Strain:** Remove solids through cheesecloth
5. **Secondary Ferment:** Continue 2-4 weeks
6. **Aging:** Store in dark place 2-6 months
7. **Bottle:** Transfer to clean bottles

**Result:** Beautiful ruby-red wine with unique berry flavor!

⚠️ **Note:** Follow local regulations for home winemaking'''
    },
    'jam': {
        'keywords': ['jam', 'jelly', 'preserve', 'spread', 'cooking'],
        'response': '''🫙 **Bignay Jam Recipe:**

**Ingredients:**
• 1kg ripe Bignay berries
• 750g sugar
• 2 tbsp lemon juice
• 1 cup water

**Instructions:**
1. Wash and remove stems from berries
2. Boil berries in water until soft (10-15 min)
3. Mash or blend, then strain to remove seeds
4. Return pulp to pot, add sugar
5. Cook on medium heat, stirring constantly
6. Add lemon juice
7. Test: Drop on cold plate - should wrinkle when pushed
8. Pour into sterilized jars while hot
9. Seal and let cool

**Storage:** Up to 1 year unopened, 1 month after opening (refrigerated)'''
    },
    'health': {
        'keywords': ['health', 'benefit', 'nutrition', 'vitamin', 'medicinal', 'medicine', 'disease'],
        'response': '''💚 **Bignay Health Benefits:**

**Nutritional Content:**
• Rich in Vitamin C
• Antioxidants (anthocyanins)
• Dietary fiber
• Iron and phosphorus

**Traditional Uses:**
• **Digestive aid:** Helps with indigestion
• **Anti-inflammatory:** Traditional remedy
• **Blood sugar:** May help regulate glucose
• **Liver support:** Used in folk medicine
• **Skin health:** Antioxidant properties

**Leaves:** Dried leaves make herbal tea believed to:
• Aid in weight management
• Support kidney health
• Reduce cholesterol

⚠️ **Disclaimer:** Consult healthcare provider before using for medicinal purposes'''
    },
    'price': {
        'keywords': ['price', 'cost', 'market', 'sell', 'buy', 'worth', 'value', 'money'],
        'response': '''💰 **Bignay Market Information:**

**Fresh Fruit Prices (Philippines):**
• Peak season: ₱100-150/kg
• Off-season: ₱180-250/kg

**Processed Products:**
• Bignay Wine: ₱200-500/bottle
• Bignay Jam: ₱120-200/jar
• Dried Leaves: ₱80-150/pack
• Bignay Vinegar: ₱100-180/bottle

**Selling Tips:**
• List on our Marketplace for wider reach
• Quality photos increase sales
• Describe ripeness and freshness
• Offer bundle deals for better value

**Check our Price Prediction** feature for market trends!'''
    },
    'mold': {
        'keywords': ['mold', 'fungus', 'rot', 'spoil', 'disease', 'pest', 'problem'],
        'response': '''⚠️ **Bignay Mold & Disease Management:**

**Identifying Mold:**
• Fuzzy white/gray/black spots
• Soft, mushy texture
• Off-putting smell
• Discoloration beyond normal ripeness

**Prevention:**
• Proper spacing for airflow
• Avoid overhead watering
• Remove fallen fruit promptly
• Prune infected branches

**Treatment:**
• Remove affected fruit immediately
• Apply organic fungicide if needed
• Improve drainage around tree

**For Harvested Fruit:**
• Discard any moldy berries
• Don't process moldy fruit
• Store in cool, dry conditions
• Use within 2-3 days of harvesting

**Use our Scanner** to detect mold on your Bignay!'''
    },
    'scanner': {
        'keywords': ['scan', 'scanner', 'camera', 'detect', 'analyze', 'ai', 'classification', 'classify'],
        'response': '''📸 **Using the Bignay Scanner:**

**Features:**
• **Camera Mode:** Real-time scanning using your camera
• **Gallery Mode:** Upload existing photos
• **Fruit Detection:** Identifies ripeness stages
• **Leaf Analysis:** Checks for disease/mold
• **Confidence Score:** Shows detection accuracy

**How to Use:**
1. Open Scanner from the menu
2. Choose Camera or Gallery mode
3. Select "Fruit" or "Leaf" classification type
4. Capture or upload image
5. Tap "Analyze" for results

**Best Results Tips:**
• Good lighting (natural light preferred)
• Clear, focused image
• Center the subject in frame
• Avoid shadows and reflections

**Help Improve AI:** Confirm or correct results to train the model!'''
    },
    'marketplace': {
        'keywords': ['marketplace', 'shop', 'store', 'order', 'cart', 'checkout', 'payment', 'delivery'],
        'response': '''🛒 **Bignay Marketplace Guide:**

**For Buyers:**
• Browse products by category
• Add items to cart
• Secure checkout via PayMongo
• Track your orders in real-time
• Leave reviews for products

**For Sellers:**
• List your Bignay products
• Set competitive prices
• Manage inventory
• Track sales and earnings
• Respond to customer reviews

**Payment Methods:**
• GCash
• Credit/Debit Cards
• Online Banking

**Order Status:**
Pending → Confirmed → Shipped → Delivered

**Need help?** Contact sellers directly through the app!'''
    },
    'app': {
        'keywords': ['app', 'feature', 'how to', 'help', 'use', 'navigate', 'tutorial'],
        'response': '''📱 **Bignay App Features:**

**🏠 Forum/Home**
Latest news, tips, and community posts about Bignay

**📸 Scanner**
AI-powered fruit and leaf analysis

**🤖 AI Assistant**
Get instant answers (that's me!)

**🛒 Marketplace**
Buy and sell Bignay products

**🗺️ Harvest Map**
Find Bignay locations near you

**📈 Price Prediction**
Market trends and price forecasts

**📜 History**
Your past scans and activities

**⚙️ Settings**
Customize your experience

**Tips:**
• Use the sidebar menu to navigate
• Pull down to refresh content
• Tap items for more details

**Need specific help?** Just ask me!'''
    },
    'greeting': {
        'keywords': ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy'],
        'response': '''👋 Hello! I'm your Bignay AI assistant!

I'm here to help you with:
• 🍇 Bignay identification and ripeness
• 🌱 Growing and cultivation tips
• 🍷 Wine, jam, and recipe ideas
• 💰 Market prices and selling
• 📸 Using the Scanner feature
• 🛒 Marketplace navigation
• ⚕️ Health benefits

What would you like to know about Bignay today?'''
    },
    'thanks': {
        'keywords': ['thank', 'thanks', 'appreciate', 'helpful', 'great'],
        'response': '''😊 You're welcome! I'm glad I could help!

Feel free to ask me anything else about:
• Bignay fruit and cultivation
• Using the app features
• Recipes and processing
• Market information

Happy Bignay farming! 🍇'''
    }
}

def is_content_safe(message: str) -> tuple[bool, Optional[str]]:
    """Check if message contains sensitive content"""
    message_lower = message.lower()
    
    for pattern in SENSITIVE_TOPICS:
        if re.search(pattern, message_lower, re.IGNORECASE):
            return False, "I can only help with Bignay-related topics and app features. Let's keep our conversation focused on that! 🍇"
    
    return True, None

def find_best_response(message: str) -> str:
    """Find the best matching response from knowledge base"""
    message_lower = message.lower()
    
    best_match = None
    best_score = 0
    
    for topic, data in KNOWLEDGE_BASE.items():
        score = sum(1 for keyword in data['keywords'] if keyword in message_lower)
        if score > best_score:
            best_score = score
            best_match = topic
    
    if best_match and best_score > 0:
        return KNOWLEDGE_BASE[best_match]['response']
    
    # Default response for unrecognized queries
    return '''🤔 I'm not quite sure about that specific topic.

I can help you with:
• **Identification:** "How do I identify ripe Bignay?"
• **Growing:** "How to grow Bignay trees?"
• **Processing:** "How to make Bignay wine/jam?"
• **Market:** "What's the price of Bignay?"
• **Health:** "What are Bignay health benefits?"
• **App Help:** "How do I use the Scanner?"

Feel free to ask about any of these topics! 🍇'''


def _get_client():
    """Get or create the google.genai Client."""
    global _genai_client
    if _genai_client is not None:
        return _genai_client
    if not GEMINI_API_KEY or google_genai is None:
        return None
    _genai_client = google_genai.Client(api_key=GEMINI_API_KEY)
    return _genai_client


def _build_contents(message: str, context: Optional[list]) -> list:
    """Build a contents list from conversation context and the new message."""
    contents = []
    if context:
        for entry in context:
            if isinstance(entry, dict):
                role = entry.get('role') or entry.get('type', 'user')
                text = (entry.get('content') or entry.get('text', '')).strip()
                if text:
                    genai_role = 'user' if role in ('user', 'human') else 'model'
                    contents.append(genai_types.Content(
                        role=genai_role,
                        parts=[genai_types.Part(text=text)],
                    ))
    contents.append(genai_types.Content(
        role='user',
        parts=[genai_types.Part(text=message)],
    ))
    return contents


def _is_quota_exhausted(exc: Exception) -> bool:
    """Return True when the exception signals a 429 quota / rate-limit error."""
    exc_str = str(exc)
    if '429' in exc_str:
        return True
    cls_name = type(exc).__name__
    if cls_name in ('ResourceExhausted', 'TooManyRequests'):
        return True
    return False


def _try_generate(client, model_name: str, contents: list, *, retries: int = 1) -> Optional[str]:
    """Call generate_content with optional retry for transient 429s."""
    config = genai_types.GenerateContentConfig(
        system_instruction=SYSTEM_CONTEXT,
        temperature=0.7,
        max_output_tokens=1024,
        top_p=0.9,
    )
    for attempt in range(1 + retries):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            text = getattr(response, 'text', None)
            if text:
                return text.strip()
            return None
        except Exception as e:
            if _is_quota_exhausted(e) and attempt < retries:
                wait = min(2 ** attempt, 4)
                print(f"[Chatbot] 429 hit, retrying in {wait}s (attempt {attempt + 1})…")
                time.sleep(wait)
                continue
            raise
    return None


def _get_models_to_try() -> list[str]:
    """Return an ordered list of model names to attempt."""
    configured = (GEMINI_MODEL_NAME or '').strip().replace('models/', '')
    seen = set()
    ordered = []
    for name in ([configured] if configured else []) + _MODEL_CANDIDATES:
        if name and name not in seen and name not in _exhausted_models:
            seen.add(name)
            ordered.append(name)
    return ordered


def _generate_gemini_response(message: str, context: Optional[list]) -> Optional[str]:
    """Generate a response, cycling through available models on quota errors."""
    client = _get_client()
    if not client:
        return None

    models_to_try = _get_models_to_try()
    if not models_to_try:
        return None

    contents = _build_contents(message, context)

    for name in models_to_try:
        try:
            result = _try_generate(client, name, contents, retries=1)
            if result:
                return result
        except Exception as e:
            if _is_quota_exhausted(e):
                _exhausted_models.add(name)
                print(f"[Chatbot] Model '{name}' quota exhausted, trying next…")
                continue
            print(f"[Chatbot] Gemini error ({name}): {e}")
            continue

    print("[Chatbot] All Gemini models exhausted or unavailable.")
    return None

def generate_response(message: str, context: Optional[list] = None) -> dict:
    """Generate a response for the user message"""
    
    # Check for sensitive content
    is_safe, filtered_response = is_content_safe(message)
    if not is_safe:
        return {
            'response': filtered_response,
            'filtered': True,
            'topic': 'filtered',
            'source': 'filter'
        }
    
    # Use Gemini if available, otherwise fallback to knowledge base
    ai_response = _generate_gemini_response(message, context)
    if ai_response:
        return {
            'response': ai_response,
            'filtered': False,
            'topic': 'bignay',
            'source': 'gemini'
        }
    
    # Fallback to local knowledge base
    print("[Chatbot] Gemini unavailable, using knowledge base fallback")
    return {
        'response': find_best_response(message),
        'filtered': False,
        'topic': 'bignay',
        'source': 'knowledge_base'
    }


@chatbot_bp.route('/chat', methods=['POST'])
def chat():
    """Handle chat messages and return AI-powered responses"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'ok': False, 'error': 'No data provided'}), 400
        
        message = data.get('message', '').strip()
        if not message:
            return jsonify({'ok': False, 'error': 'Message is required'}), 400
        
        # Optional: conversation context for future AI integration
        context = data.get('context', [])
        
        # Generate response
        result = generate_response(message, context)
        
        return jsonify({
            'ok': True,
            'response': result['response'],
            'filtered': result['filtered'],
            'source': result.get('source', 'unknown'),
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@chatbot_bp.route('/suggestions', methods=['GET'])
def get_suggestions():
    """Get suggested questions/topics"""
    suggestions = [
        {'id': 'q1', 'text': '🍇 How to identify ripe Bignay?', 'topic': 'ripeness'},
        {'id': 'q2', 'text': '🌱 Growing tips for beginners', 'topic': 'growing'},
        {'id': 'q3', 'text': '🍷 How to make Bignay wine?', 'topic': 'wine'},
        {'id': 'q4', 'text': '💰 Current market prices', 'topic': 'price'},
        {'id': 'q5', 'text': '📸 How to use the Scanner?', 'topic': 'scanner'},
        {'id': 'q6', 'text': '💚 Health benefits of Bignay', 'topic': 'health'},
    ]
    
    return jsonify({
        'ok': True,
        'suggestions': suggestions
    })


@chatbot_bp.route('/status', methods=['GET'])
def chatbot_status():
    """Check chatbot AI status"""
    has_key = bool(GEMINI_API_KEY)
    has_sdk = google_genai is not None
    client = _get_client()
    return jsonify({
        'ok': True,
        'gemini_available': client is not None,
        'model': GEMINI_MODEL_NAME if client else None,
        'has_api_key': has_key,
        'has_sdk': has_sdk,
        'exhausted_models': list(_exhausted_models) if _exhausted_models else [],
        'fallback': 'knowledge_base',
    })
