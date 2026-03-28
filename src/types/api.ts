export interface ApiResponse<T> {
  data?: T;
  error?: string;
  fetchedAt?: string;
  cached?: boolean;
  stale?: boolean;        // true when data is from expired cache being revalidated
  notConfigured?: boolean;
  setupHint?: string;
  rateLimited?: boolean;
  rateLimitReset?: string; // ISO timestamp when limit resets
}
