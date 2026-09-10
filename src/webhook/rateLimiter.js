/**
 * WaxPrep - Rate Limiting
 * 
 * AI-FIRST DESIGN:
 * - Infrastructure enforces numerical limits (deterministic)
 * - AI receives context about rate limit and decides conversational response
 * - NO scripted abuse responses
 */

import { LRUCache } from 'lru-cache';

class RateLimiter {
  constructor(options = {}) {
    this.messagesPerMinute = options.messagesPerMinute || 10;
    this.messagesPerDay = options.messagesPerDay || 200;
    this.burstAllowance = options.burstAllowance || 3;
    this.studentRequests = new LRUCache({ max: 10000, ttl: 86400000 });
  }

  checkLimit(waxId) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    let state = this.studentRequests.get(waxId);
    if (!state) {
      state = { minute: { count: 0, timestamps: [] }, day: { count: 0, timestamps: [] } };
    }

    state.minute.timestamps = state.minute.timestamps.filter(t => t > oneMinuteAgo);
    state.day.timestamps = state.day.timestamps.filter(t => t > oneDayAgo);
    state.minute.count = state.minute.timestamps.length;
    state.day.count = state.day.timestamps.length;

    if (state.day.count >= this.messagesPerDay) {
      return { allowed: false, reason: 'daily_limit_exceeded', limit: this.messagesPerDay };
    }

    if (state.minute.count >= this.messagesPerMinute) {
      const oldestInWindow = state.minute.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + 60000 - now) / 1000);
      return { allowed: false, reason: 'minute_limit_exceeded', limit: this.messagesPerMinute, retryAfter: Math.max(1, retryAfter) };
    }

    if (state.minute.timestamps.length >= this.messagesPerMinute + this.burstAllowance) {
      return { allowed: false, reason: 'burst_limit_exceeded', limit: this.messagesPerMinute + this.burstAllowance };
    }

    state.minute.timestamps.push(now);
    state.day.timestamps.push(now);
    this.studentRequests.set(waxId, state);
    return { allowed: true };
  }

  getStatus(waxId) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneDayAgo = now - 86400000;
    
    let state = this.studentRequests.get(waxId);
    if (!state) {
      return { currentMinute: 0, currentDay: 0, limits: { minute: this.messagesPerMinute, day: this.messagesPerDay } };
    }

    state.minute.timestamps = state.minute.timestamps.filter(t => t > oneMinuteAgo);
    state.day.timestamps = state.day.timestamps.filter(t => t > oneDayAgo);
    
    return {
      currentMinute: state.minute.timestamps.length,
      currentDay: state.day.timestamps.length,
      limits: { minute: this.messagesPerMinute, day: this.messagesPerDay },
    };
  }

  reset(waxId) {
    this.studentRequests.delete(waxId);
  }
}

let rateLimiter = null;

export function getRateLimiter(options = {}) {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter({
      messagesPerMinute: options.messagesPerMinute || 10,
      messagesPerDay: options.messagesPerDay || 200,
      burstAllowance: options.burstAllowance || 3,
    });
  }
  return rateLimiter;
}

export function resetRateLimiter() {
  rateLimiter = null;
}

export default { RateLimiter, getRateLimiter, resetRateLimiter };
