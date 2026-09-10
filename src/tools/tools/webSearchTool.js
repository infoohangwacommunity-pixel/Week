/**
 * Web Search Tool - Phase G Stage 38
 * 
 * Implements web search with prompt injection defense.
 * 
 * Security requirements:
 * - Sanitize all results (strip HTML tags, normalize unicode, remove zero-width chars)
 * - Truncate results to configured max length
 * - Add structural framing to mark content as untrusted
 * - Track source credibility tiers
 * - Cache results for cost control
 */

import { randomUUID } from 'crypto';
import config from '../../config/index.js';
import { WebContentSanitizer } from '../WebContentSanitizer.js';

/**
 * Web search result source tiers
 */
export const SourceTier = {
  TIER_1: 1,  // waec.gov.ng, jamb.gov.ng, neco.gov.ng, education.gov.ng, .edu.ng
  TIER_2: 2,  // punchng.com, guardian.ng, khanacademy.org, bbc.co.uk/education
  TIER_3: 3,  // General web
};

/**
 * Trusted domains by tier
 */
const TRUSTED_DOMAINS = {
  [SourceTier.TIER_1]: [
    'waec.gov.ng',
    'jamb.gov.ng',
    'neco.gov.ng',
    'education.gov.ng',
    'edu.ng',
    'wikipedia.org',
    'britannica.com',
  ],
  [SourceTier.TIER_2]: [
    'punchng.com',
    'guardian.ng',
    'khanacademy.org',
    'bbc.co.uk',
    'bbc.com',
  ],
  [SourceTier.TIER_3]: [],
};

// Build domain lookup maps
const tier1Domains = new Set(TRUSTED_DOMAINS[SourceTier.TIER_1]);
const tier2Domains = new Set(TRUSTED_DOMAINS[SourceTier.TIER_2]);

/**
 * Determine source credibility tier for a domain
 */
function getSourceTier(domain) {
  // Normalize domain
  const normalizedDomain = domain.toLowerCase();
  
  // Check tier 1
  for (const tier1Domain of tier1Domains) {
    if (normalizedDomain === tier1Domain || normalizedDomain.endsWith(`.${tier1Domain}`)) {
      return SourceTier.TIER_1;
    }
  }
  
  // Check tier 2
  for (const tier2Domain of tier2Domains) {
    if (normalizedDomain === tier2Domain || normalizedDomain.endsWith(`.${tier2Domain}`)) {
      return SourceTier.TIER_2;
    }
  }
  
  // Default to tier 3
  return SourceTier.TIER_3;
}

/**
 * Execute web search
 */
/**
 * Execute web search.
 *
 * @param {Object} ctx - Handler context.
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool (for caching).
 * @param {string} ctx.waxId - Student identifier (for rate-limit/perf tracking).
 * @param {string} ctx.query - Search query.
 * @param {number} [ctx.maxResults] - Max results.
 */
export async function executeWebSearch({ db, waxId, query, maxResults = 3 }) {
  const startTime = Date.now();

  // Check cache first.
  const cachedResult = await checkCache({ db, query, waxId });
  if (cachedResult) {
    return {
      ...cachedResult,
      success: true,
      from_cache: true,
      query_latency_ms: Date.now() - startTime,
    };
  }

  // Fetch from search provider.
  let searchResults;
  try {
    searchResults = await fetchSearchResults(query);
  } catch (err) {
    return { success: false, error: `Web search failed: ${err.message}` };
  }

  // Process and sanitize results.
  const processedResults = await processSearchResults({
    results: searchResults,
    maxResults,
    waxId,
    query,
  });

  // Cache the results.
  await cacheResults({ db, query, results: processedResults });

  const latencyMs = Date.now() - startTime;

  return {
    success: true,
    results: processedResults,
    total_found: searchResults.length,
    query_latency_ms: latencyMs,
    from_cache: false,
  };
}

/**
 * Fetch results from search provider
 */
async function fetchSearchResults(query) {
  const provider = config.WEB_SEARCH_PROVIDER;
  const apiKey = config.WEB_SEARCH_API_KEY;
  
  if (!apiKey) {
    throw new Error('WEB_SEARCH_API_KEY is not configured');
  }
  
  switch (provider) {
    case 'serper':
      return await fetchSerperResults(query, apiKey);
    case 'duckduckgo':
      return await fetchDuckDuckGoResults(query);
    case 'brave':
      return await fetchBraveResults(query, apiKey);
    case 'tavily':
      return await fetchTavilyResults(query, apiKey);
    default:
      throw new Error(`Unknown web search provider: ${provider}`);
  }
}

/**
 * Fetch results from Serper API
 */
async function fetchSerperResults(query, apiKey) {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: config.WEB_SEARCH_MAX_RESULTS }),
  });
  
  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return (data.org || []).map((result, index) => ({
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    position: index + 1,
  }));
}

/**
 * Fetch results from DuckDuckGo (uses DuckDuckGo Instant Answer API)
 */
async function fetchDuckDuckGoResults(query) {
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    
    // Format DuckDuckGo results
    const results = [];
    
    if (data.Abstract) {
      results.push({
        title: data.Title || 'DuckDuckGo Result',
        url: data.AbstractURL || '',
        snippet: data.Abstract,
        position: 1,
      });
    }
    
    // Add related topics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic.Topics && topic.Topics.length > 0) {
          for (const sub of topic.Topics.slice(0, 2)) {
            results.push({
              title: sub.Text || topic.Text || 'Related Topic',
              url: sub.URL || '',
              snippet: topic.Text || '',
              position: results.length + 1,
            });
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.warn('DuckDuckGo search failed:', error.message);
    return [];
  }
}

/**
 * Fetch results from Brave Search API
 */
async function fetchBraveResults(query, apiKey) {
  const response = await fetch('https://api.search.brave.com/res/v1/web/search', {
    method: 'GET',
    headers: {
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(config.WEB_SEARCH_TIMEOUT_MS),
  });
  
  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return (data.web?.results || []).map((result, index) => ({
    title: result.title,
    url: result.url,
    snippet: result.description,
    position: index + 1,
  }));
}

/**
 * Fetch results from Tavily API
 */
async function fetchTavilyResults(query, apiKey) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, max_results: config.WEB_SEARCH_MAX_RESULTS }),
    signal: AbortSignal.timeout(config.WEB_SEARCH_TIMEOUT_MS),
  });
  
  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return (data.results || []).map((result, index) => ({
    title: result.title,
    url: result.url,
    content: result.content,
    position: index + 1,
  }));
}

/**
 * Process and sanitize search results
 */
async function processSearchResults({ results, maxResults, waxId, query }) {
  const sanitizer = new WebContentSanitizer();
  const processed = [];
  
  for (const rawResult of results.slice(0, maxResults)) {
    try {
      // Extract domain
      const domain = extractDomain(rawResult.url);
      const sourceTier = getSourceTier(domain);
      
      // Get content (from snippet or fetch full page)
      let rawContent = rawResult.snippet || rawResult.content || '';
      
      // Sanitize content
      const sanitizedContent = sanitizer.sanitize(rawContent);
      
      // Check for injection risks
      const injectionRisk = sanitizer.detectInjectionRisk(sanitizedContent);
      
      processed.push({
        url: rawResult.url,
        domain,
        title: rawResult.title || 'Untitled',
        content: sanitizedContent,
        source_tier: sourceTier,
        was_sanitized: true,
        was_injection_risk_detected: injectionRisk.detected,
        raw_content_length: rawContent.length,
        sanitized_content_length: sanitizedContent.length,
      });
    } catch (error) {
      // Skip results that fail to process
      console.error('Failed to process search result:', error);
    }
  }
  
  return processed;
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Check cache for existing results
 */
async function checkCache({ db, query, waxId }) {
  if (!db) return null;
  const queryHash = await hashString(query);

  try {
    const result = await db.query(
      `SELECT cached_results
       FROM web_search_cache
       WHERE query_hash = $1
       AND provider = $2
       AND expires_at > $3`,
      [queryHash, config.WEB_SEARCH_PROVIDER, new Date()]
    );

    if (result.rows.length > 0) {
      return JSON.parse(result.rows[0].cached_results);
    }
  } catch (error) {
    // Cache miss or error - continue with fresh search
    console.warn('Cache lookup failed:', error.message);
  }

  return null;
}

/**
 * Cache search results
 */
async function cacheResults({ db, query, results }) {
  if (!db) return;
  const queryHash = await hashString(query);
  const expiresAt = new Date(Date.now() + config.WEB_SEARCH_CACHE_TTL_SECONDS * 1000);

  try {
    await db.query(
      `INSERT INTO web_search_cache (query_hash, query, cached_results, provider, result_count, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (query_hash, provider)
       DO UPDATE SET cached_results = $3, expires_at = $6`,
      [
        queryHash,
        query,
        JSON.stringify(results),
        config.WEB_SEARCH_PROVIDER,
        results.length,
        expiresAt,
      ]
    );
  } catch (error) {
    console.warn('Cache write failed:', error.message);
  }
}

/**
 * Simple string hash for cache key
 */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  executeWebSearch,
  getSourceTier,
  WebContentSanitizer,
};
