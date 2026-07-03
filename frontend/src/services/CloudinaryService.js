// Cloudinary Service
// Handles direct image uploads to Cloudinary from the frontend

import { API_CONFIG } from '../config/api';
import Constants from 'expo-constants';

// Get Cloudinary config from environment variables
const getCloudinaryConfig = () => {
  const cloudName = Constants.expoConfig?.extra?.cloudinaryCloudName 
    || process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME 
    || 'dbeghehuz';
  
  const uploadPreset = Constants.expoConfig?.extra?.cloudinaryUploadPreset 
    || process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET 
    || 'bignay_unsigned';
  
  return { cloudName, uploadPreset };
};

// Cloudinary configuration
const CLOUDINARY_CONFIG = getCloudinaryConfig();

/**
 * Upload image directly to Cloudinary
 * @param {string} imageData - Base64 image data or data URL
 * @param {string} folder - Cloudinary folder (products, profiles, etc.)
 * @returns {Promise<{ok: boolean, url?: string, publicId?: string, error?: string}>}
 */
export const uploadToCloudinary = async (imageData, folder = 'products') => {
  try {
    if (!imageData) {
      return { ok: false, error: 'No image data provided' };
    }

    // If it's already a Cloudinary URL, return it as-is
    if (imageData.includes('cloudinary.com') || imageData.includes('res.cloudinary.com')) {
      console.log('[CloudinaryService] Image already on Cloudinary, skipping upload');
      return { ok: true, url: imageData, publicId: '', alreadyUploaded: true };
    }

    // Prepare the upload data
    const formData = new FormData();
    
    // Handle different image formats
    if (imageData.startsWith('data:')) {
      formData.append('file', imageData);
    } else if (imageData.startsWith('http')) {
      // External URL - let Cloudinary fetch it
      formData.append('file', imageData);
    } else {
      // Raw base64 - add data URL prefix
      const base64Data = imageData.startsWith('/9j/') 
        ? `data:image/jpeg;base64,${imageData}`
        : imageData.startsWith('iVBOR')
        ? `data:image/png;base64,${imageData}`
        : `data:image/jpeg;base64,${imageData}`;
      formData.append('file', base64Data);
    }

    formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
    formData.append('folder', folder);

    console.log(`[CloudinaryService] Uploading image to folder: ${folder}`);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const result = await response.json();

    if (result.secure_url) {
      console.log('[CloudinaryService] Upload successful:', result.secure_url);
      return {
        ok: true,
        url: result.secure_url,
        publicId: result.public_id,
      };
    } else {
      console.error('[CloudinaryService] Upload failed:', result.error?.message);
      return {
        ok: false,
        error: result.error?.message || 'Upload failed',
      };
    }
  } catch (error) {
    console.error('[CloudinaryService] Upload error:', error);
    return {
      ok: false,
      error: error.message || 'Failed to upload image',
    };
  }
};

/**
 * Upload multiple images to Cloudinary
 * @param {string[]} images - Array of base64 images or data URLs
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<{ok: boolean, urls?: string[], errors?: string[]}>}
 */
export const uploadMultipleToCloudinary = async (images, folder = 'products') => {
  if (!images || images.length === 0) {
    return { ok: true, urls: [] };
  }

  console.log(`[CloudinaryService] Uploading ${images.length} images...`);

  const results = await Promise.all(
    images.map(async (image, index) => {
      const result = await uploadToCloudinary(image, folder);
      return { index, ...result };
    })
  );

  const urls = [];
  const errors = [];

  results.forEach((result) => {
    if (result.ok && result.url) {
      urls.push(result.url);
    } else {
      errors.push(`Image ${result.index + 1}: ${result.error || 'Unknown error'}`);
    }
  });

  const success = urls.length > 0;
  console.log(`[CloudinaryService] Upload complete: ${urls.length}/${images.length} successful`);

  return {
    ok: success,
    urls,
    errors: errors.length > 0 ? errors : undefined,
  };
};

/**
 * Get optimized Cloudinary URL with transformations
 * @param {string} url - Original Cloudinary URL
 * @param {object} options - Transformation options
 * @returns {string} Transformed URL
 */
export const getOptimizedUrl = (url, options = {}) => {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const {
    width = 800,
    height = 800,
    crop = 'limit',
    quality = 'auto',
    format = 'auto',
  } = options;

  // Parse the URL and insert transformations
  const urlParts = url.split('/upload/');
  if (urlParts.length !== 2) {
    return url;
  }

  const transformations = `w_${width},h_${height},c_${crop},q_${quality},f_${format}`;
  return `${urlParts[0]}/upload/${transformations}/${urlParts[1]}`;
};

/**
 * Get thumbnail URL
 * @param {string} url - Original Cloudinary URL
 * @param {number} size - Thumbnail size (default 200)
 * @returns {string} Thumbnail URL
 */
export const getThumbnailUrl = (url, size = 200) => {
  return getOptimizedUrl(url, {
    width: size,
    height: size,
    crop: 'fill',
    quality: 'auto:low',
  });
};

/**
 * Check if URL is a Cloudinary URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export const isCloudinaryUrl = (url) => {
  return url && (url.includes('cloudinary.com') || url.includes('res.cloudinary.com'));
};

export default {
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  getOptimizedUrl,
  getThumbnailUrl,
  isCloudinaryUrl,
  config: CLOUDINARY_CONFIG,
};
