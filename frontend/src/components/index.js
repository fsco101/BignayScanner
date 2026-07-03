// Components index
// Re-exports platform-specific components
// Currently exports mobile components since we're building mobile-first

// Mobile components (default for Expo/React Native)
export * from './mobile';

// Re-export shared components
export { default as SweetAlert, useSweetAlert } from './SweetAlert';
export { default as Toast } from './Toast';

/**
 * Architecture Note:
 * ------------------
 * When building the web version:
 * 
 * 1. Create a /components/web/ folder with web-specific UI components
 * 2. Create platform-specific index files:
 *    - index.js (default, can import from mobile or web based on platform)
 *    - index.native.js (React Native specific)
 *    - index.web.js (React DOM specific)
 * 
 * 3. Or use a more explicit approach:
 *    import { Button } from '@/components/mobile';  // For mobile
 *    import { Button } from '@/components/web';     // For web
 */
