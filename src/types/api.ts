export interface ApiResponse<T> {
  data?: T;
  error?: string;
  fetchedAt?: string;
  cached?: boolean;
  notConfigured?: boolean;
  setupHint?: string;
  rateLimited?: boolean;
  rateLimitReset?: string; // ISO timestamp when limit resets
}
