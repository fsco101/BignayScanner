# Frontend Architecture

This document describes the architecture of the Bignay frontend application, designed to support both mobile (React Native/Expo) and web (React) platforms with shared business logic.

## Directory Structure

```
src/
├── components/           # UI Components
│   ├── mobile/          # Mobile-specific (React Native) components
│   │   ├── Icon.js      # Ionicons wrapper
│   │   ├── Button.js    # Touchable button
│   │   ├── Card.js      # Container cards
│   │   ├── Badge.js     # Status badges
│   │   ├── Feedback.js  # Loading, Error, Empty states
│   │   └── index.js     # Mobile exports
│   ├── web/             # Web-specific (React DOM) components (TODO)
│   │   └── index.js     # Web exports
│   ├── SweetAlert.js    # Shared modal alert
│   ├── Toast.js         # Shared toast notifications
│   └── index.js         # Platform-specific exports
│
├── hooks/               # Custom React Hooks (Business Logic)
│   ├── useForum.js      # Forum data fetching hooks
│   ├── useForumAdmin.js # Admin CRUD operations
│   └── index.js
│
├── shared/              # Shared utilities and constants
│   ├── constants/
│   │   ├── colors.js    # Color theme
│   │   ├── forum.js     # Forum categories, initial states
│   │   └── index.js
│   ├── utils/
│   │   ├── helpers.js   # Pure utility functions
│   │   ├── platform.js  # Platform detection
│   │   └── index.js
│   └── index.js
│
├── services/            # API Services (Platform-agnostic)
│   ├── ForumService.js  # Forum API calls
│   ├── AuthService.js   # Auth API calls
│   └── ...
│
├── context/             # React Context (Global State)
│   ├── AuthContext.js   # Authentication state
│   ├── CartContext.js   # Shopping cart state
│   └── ...
│
├── screens/             # Screen Components (Mobile)
│   ├── Forum/
│   │   ├── ForumHomeScreen.js       # Landing page
│   │   ├── ForumCategoryScreen.js   # Category view
│   │   ├── ForumPostDetailScreen.js # Post detail
│   │   ├── ForumAllPostsScreen.js   # All posts
│   │   └── admin/
│   │       └── ForumManagement.js   # Admin CRUD
│   └── ...
│
└── config/              # Configuration
    ├── api.js           # API configuration
    └── firebase.js      # Firebase config
```

## Key Principles

### 1. Separation of Concerns

- **Business Logic**: Lives in `hooks/` - reusable across platforms
- **UI Components**: Platform-specific in `components/mobile/` or `components/web/`
- **Shared Code**: Lives in `shared/` - constants, utilities, types

### 2. Custom Hooks for Business Logic

All data fetching, state management, and business logic should be in custom hooks:

```javascript
// Bad - Business logic in component
function ForumScreen() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    ForumService.getPosts().then(res => setPosts(res.posts));
  }, []);
  // ...
}

// Good - Business logic in hook
function ForumScreen() {
  const { posts, isLoading, refresh } = useForumPosts();
  // UI only
}
```

### 3. Platform-Specific Components

Create platform-specific UI components that share the same props interface:

```javascript
// Mobile: components/mobile/Button.js
export function Button({ title, onPress, variant }) {
  return (
    <TouchableOpacity style={styles[variant]} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
}

// Web: components/web/Button.js (future)
export function Button({ title, onPress, variant }) {
  return (
    <button className={`btn btn-${variant}`} onClick={onPress}>
      {title}
    </button>
  );
}
```

### 4. Services are Platform-Agnostic

API services use `fetch` which works on both React Native and web:

```javascript
// services/ForumService.js - works on both platforms
export const ForumService = {
  async getPosts(params) {
    const response = await fetch(`${API_URL}/posts`, { ... });
    return response.json();
  }
};
```

## Adding Web Support

To add web support (React with react-router-dom):

1. **Create web components** in `components/web/`:
   ```
   components/web/
   ├── Icon.js        # Uses react-icons instead of Ionicons
   ├── Button.js      # HTML button with Tailwind/CSS
   ├── Card.js        # HTML div with styling
   └── index.js
   ```

2. **Create web pages** in `pages/` (Next.js) or `screens/web/`:
   ```
   pages/
   ├── forum/
   │   ├── index.js          # Forum home
   │   ├── [category].js     # Category view
   │   └── [id].js           # Post detail
   └── ...
   ```

3. **Reuse hooks**:
   ```javascript
   // Web page using the same hook
   import { useForumPosts } from '@/hooks/useForum';
   
   export default function ForumPage() {
     const { posts, isLoading, refresh } = useForumPosts();
     // Use web-specific components for rendering
   }
   ```

4. **Platform-specific rendering** (optional):
   ```javascript
   // Use Metro bundler's platform extensions
   // Button.native.js - React Native version
   // Button.web.js    - Web version
   // Button.js        - Default/shared
   ```

## Usage Examples

### Using Custom Hooks

```javascript
import { useForumPosts, useForumCategories } from '@/hooks';

function ForumScreen() {
  const { posts, isLoading, refresh, loadMore } = useForumPosts({
    category: 'news',
    limit: 10,
  });
  
  const { categories } = useForumCategories();
  
  // Render UI...
}
```

### Using Mobile Components

```javascript
import { Button, Card, Badge, Loading, ErrorView } from '@/components/mobile';

function PostCard({ post }) {
  return (
    <Card onPress={() => navigateToPost(post._id)}>
      <Badge label={post.category} color="#2196F3" />
      <Text>{post.title}</Text>
    </Card>
  );
}
```

### Using Shared Utilities

```javascript
import { formatDate, truncateText, getCategoryInfo } from '@/shared';
import { COLORS, FORUM_CATEGORIES } from '@/shared/constants';

const category = getCategoryInfo(post.category);
const date = formatDate(post.published_at);
const excerpt = truncateText(post.content, 150);
```

## Migration Checklist

When adding web support:

- [ ] Create `components/web/` with matching component interfaces
- [ ] Set up React/Next.js project with shared configuration
- [ ] Configure path aliases (@/hooks, @/shared, etc.)
- [ ] Create web-specific pages/routes
- [ ] Test hooks work correctly on web
- [ ] Add web-specific styles (CSS/Tailwind)
- [ ] Handle web-specific features (SEO, SSR, etc.)
