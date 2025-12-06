// ============================================================================
// HEKAX Phone - In-Memory Cache Service
// Simple TTL-based caching for frequently accessed data
// ============================================================================

class CacheService {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
   */
  set(key, value, ttlSeconds = 300) {
    this.stats.sets++;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }

  /**
   * Delete a specific key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'org:123:*')
   */
  deletePattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function to fetch data if not cached
   * @param {number} ttlSeconds - TTL in seconds
   * @returns {Promise<*>} Cached or freshly fetched value
   */
  async getOrSet(key, fetchFn, ttlSeconds = 300) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetchFn();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Destroy the cache service
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Singleton instance
const cache = new CacheService();

// Cache key generators for common patterns
const cacheKeys = {
  orgSettings: (orgId) => `org:${orgId}:settings`,
  orgMembers: (orgId) => `org:${orgId}:members`,
  orgStats: (orgId, period) => `org:${orgId}:stats:${period}`,
  userOrgs: (userId) => `user:${userId}:orgs`,
  phoneNumber: (number) => `phone:${number}`,
  callStats: (orgId, date) => `org:${orgId}:calls:${date}`,
  leadCount: (orgId) => `org:${orgId}:leads:count`,
};

module.exports = { cache, cacheKeys };
