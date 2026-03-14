// Cache utility for API responses
const cache = new Map<string, { data: any; timestamp: number }>();

export const CACHE_DURATION = {
  SHORT: 60 * 1000, // 1 minute
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 30 * 60 * 1000, // 30 minutes
};

/**
 * Get cached data if still valid
 */
export function getCached(key: string) {
  const cached = cache.get(key);
  if (!cached) return null;

  const isExpired = Date.now() - cached.timestamp > CACHE_DURATION.MEDIUM;
  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

/**
 * Set cache data
 */
export function setCache(key: string, data: any, duration = CACHE_DURATION.MEDIUM) {
  cache.set(key, { data, timestamp: Date.now() });
  
  // Auto-clear expired cache after duration
  setTimeout(() => {
    cache.delete(key);
  }, duration);
}

/**
 * Clear specific cache or all cache
 */
export function clearCache(key?: string) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
