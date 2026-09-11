/**
 * Document Fetch Tool - Phase G Stage 38
 * 
 * Fetches content from approved educational URLs.
 */

import config from '../../config/index.js';

/**
 * Approved domains for document fetching
 */
const APPROVED_DOMAINS = [
  'waec.gov.ng',
  'jamb.gov.ng',
  'neco.gov.ng',
  'education.gov.ng',
  'edu.ng',
  'khanacademy.org',
  'bbc.co.uk',
  'bbc.com',
  'wikipedia.org',
];

/**
 * Execute document fetch.
 *
 * @param {Object} ctx - Handler context.
 * @param {string} ctx.waxId - Student identifier (unused, but required by handler protocol).
 * @param {string} ctx.url - URL to fetch.
 */
export async function executeDocumentFetch({
  waxId,
  url,
}) {
  if (!url || typeof url !== 'string') {
    return { success: false, approved: false, error: 'url is required' };
  }

  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;

    // Check if domain is approved
    const isApproved = APPROVED_DOMAINS.some((approved) =>
      domain === approved || domain.endsWith(`.${approved}`),
    );

    if (!isApproved) {
      return {
        success: false,
        approved: false,
        domain,
        error: 'Domain not in approved list',
      };
    }

    // Fetch content. `signal: AbortSignal.timeout()` is the correct way to
    // enforce a timeout on fetch (the `timeout` option is silently ignored).
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        approved: true,
        domain,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const rawContent = await response.text();
    const sanitizedContent = sanitizeContent(rawContent);

    return {
      success: true,
      approved: true,
      domain,
      url,
      content: sanitizedContent,
      content_length: sanitizedContent.length,
    };
  } catch (error) {
    return {
      success: false,
      approved: false,
      error: error.message,
    };
  }
}

/**
 * Sanitize fetched content
 */
function sanitizeContent(content) {
  // Remove script tags and other dangerous elements
  const sanitized = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/javascript:/gi, 'blocked:')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .trim();

  return sanitized;
}

export default {
  executeDocumentFetch,
};
