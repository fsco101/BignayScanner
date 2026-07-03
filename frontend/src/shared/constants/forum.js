// Forum-related constants
// Shared across web and mobile

export const FORUM_CATEGORIES = [
  { id: 'news', name: 'News', icon: 'newspaper', color: '#2196F3' },
  { id: 'events', name: 'Events', icon: 'calendar', color: '#9C27B0' },
  { id: 'about_us', name: 'About Us', icon: 'people', color: '#4CAF50' },
  { id: 'about_bignay', name: 'About Bignay', icon: 'leaf', color: '#FF9800' },
];

export const POST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export const INITIAL_POST_FORM = {
  title: '',
  content: '',
  excerpt: '',
  category: 'news',
  tags: '',
  cover_image: null,
  images: [],
  is_published: false,
  is_featured: false,
  is_pinned: false,
};

export const POSTS_PER_PAGE = 15;
export const ADMIN_POSTS_PER_PAGE = 20;

// Category helper functions
export const getCategoryInfo = (categoryId) => {
  return FORUM_CATEGORIES.find(c => c.id === categoryId) || 
    { id: categoryId, name: categoryId, icon: 'document', color: '#757575' };
};

export const getCategoryColor = (categoryId) => {
  const category = getCategoryInfo(categoryId);
  return category.color;
};
