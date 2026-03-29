export class RateLimitError extends Error {
  constructor(
    public readonly source: string,
    public readonly retryAfterMs?: number,
    public readonly resetAt?: Date
  ) {
    super(`${source} rate limit exceeded`);
    this.name = "RateLimitError";
  }
}
