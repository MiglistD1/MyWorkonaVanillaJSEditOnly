/**
 * 🔗 Static Re-export of SpMirrorFeature
 * Provides static import compatible with Chrome Extension
 * Fixes: "Failed to fetch dynamically imported module" error
 * 
 * Import from this file instead of SpMirrorFeature.js directly
 */

export {
  SpController,
  spController,
  initSpMirrorFeature
} from '../features/SpMirrorFeature.js';
