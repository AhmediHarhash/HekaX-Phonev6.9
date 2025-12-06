// ============================================================================
// HEKAX Phone - Cache Service Tests
// ============================================================================

const { cache, cacheKeys } = require('../../lib/cache');

describe('Cache Service', () => {
  beforeEach(() => {
    cache.clear();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('test-key', 'test-value');
      expect(cache.get('test-key')).toBe('test-value');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('should delete values', () => {
      cache.set('test-key', 'test-value');
      cache.delete('test-key');
      expect(cache.get('test-key')).toBeUndefined();
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL Expiration', () => {
    it('should expire values after TTL', async () => {
      cache.set('expiring-key', 'value', 1); // 1 second TTL
      expect(cache.get('expiring-key')).toBe('value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(cache.get('expiring-key')).toBeUndefined();
    });
  });

  describe('Pattern Deletion', () => {
    it('should delete keys matching pattern', () => {
      cache.set('org:123:settings', 'settings');
      cache.set('org:123:members', 'members');
      cache.set('org:456:settings', 'other');

      cache.deletePattern('org:123:*');

      expect(cache.get('org:123:settings')).toBeUndefined();
      expect(cache.get('org:123:members')).toBeUndefined();
      expect(cache.get('org:456:settings')).toBe('other');
    });
  });

  describe('Get or Set', () => {
    it('should return cached value if exists', async () => {
      cache.set('cached-key', 'cached-value');
      const fetchFn = jest.fn().mockResolvedValue('new-value');

      const result = await cache.getOrSet('cached-key', fetchFn);

      expect(result).toBe('cached-value');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not exists', async () => {
      const fetchFn = jest.fn().mockResolvedValue('fetched-value');

      const result = await cache.getOrSet('new-key', fetchFn);

      expect(result).toBe('fetched-value');
      expect(fetchFn).toHaveBeenCalled();
      expect(cache.get('new-key')).toBe('fetched-value');
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('hit-key', 'value');

      cache.get('hit-key'); // hit
      cache.get('miss-key'); // miss
      cache.get('hit-key'); // hit

      const stats = cache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(2);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cache Key Generators', () => {
    it('should generate correct org settings key', () => {
      expect(cacheKeys.orgSettings('123')).toBe('org:123:settings');
    });

    it('should generate correct org members key', () => {
      expect(cacheKeys.orgMembers('123')).toBe('org:123:members');
    });

    it('should generate correct org stats key', () => {
      expect(cacheKeys.orgStats('123', 'daily')).toBe('org:123:stats:daily');
    });

    it('should generate correct user orgs key', () => {
      expect(cacheKeys.userOrgs('user-123')).toBe('user:user-123:orgs');
    });
  });
});
