/**
 * Cross-platform PDF export utility
 * Handles PDF download/share for both web and mobile (iOS/Android)
 * 
 * Uses the new expo-file-system v19 API (File/Paths classes) instead of the
 * deprecated legacy API (writeAsStringAsync/EncodingType) which throws at runtime.
 */
import { Platform, Linking } from 'react-native';
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Download and share/save a PDF on mobile platforms
 * Uses arrayBuffer → Uint8Array → File.write() which works on expo-file-system v19+
 * 
 * @param {Response} response - The fetch response containing the PDF
 * @param {string} filename - The desired filename for the PDF
 * @param {object} options - Optional sharing options
 * @param {string} options.dialogTitle - Title for the share dialog
 * @param {string} options.UTI - Uniform Type Identifier (iOS)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function savePdfOnMobile(response, filename, options = {}) {
  try {
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (!bytes.length) {
      return { success: false, message: 'Received empty PDF data' };
    }

    // Use new expo-file-system v19 API: File class + Paths.document
    const file = new ExpoFile(Paths.document, filename);
    file.write(bytes);

    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: options.dialogTitle || 'Share PDF',
          UTI: options.UTI || 'com.adobe.pdf',
        });
        return { success: true, message: 'PDF ready to share' };
      } else {
        return { success: true, message: `PDF saved: ${filename}` };
      }
    } catch (shareError) {
      console.log('Sharing error (file saved):', shareError);
      return { success: true, message: `PDF saved: ${filename}` };
    }
  } catch (error) {
    console.error('Error saving PDF on mobile:', error);
    return { success: false, message: 'Failed to save PDF: ' + error.message };
  }
}

/**
 * Open a PDF URL on web with optional auth token
 * 
 * @param {string} url - The PDF preview URL
 * @param {string|null} token - Optional auth token
 */
export function openPdfOnWeb(url, token) {
  if (token) {
    const authUrl = `${url}?token=${encodeURIComponent(token)}`;
    Linking.openURL(authUrl);
  } else {
    Linking.openURL(url);
  }
}

/**
 * Generic PDF export handler that works on both web and mobile
 * 
 * @param {object} params
 * @param {Function} params.fetchPdf - Async function that returns a fetch Response
 * @param {string} params.filename - Desired PDF filename
 * @param {string} [params.webUrl] - URL to open on web (if different from fetch)
 * @param {string} [params.token] - Auth token for web
 * @param {object} [params.shareOptions] - Mobile share dialog options
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function exportPdf({ fetchPdf, filename, webUrl, token, shareOptions = {} }) {
  if (Platform.OS === 'web' && webUrl) {
    openPdfOnWeb(webUrl, token);
    return { success: true, message: 'Opening PDF...' };
  }

  try {
    const response = await fetchPdf();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, message: errorData.error || `Download failed (${response.status})` };
    }

    return await savePdfOnMobile(response, filename, shareOptions);
  } catch (error) {
    console.error('PDF export error:', error);
    return { success: false, message: 'Failed to export PDF: ' + error.message };
  }
}
