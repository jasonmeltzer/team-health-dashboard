import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function daysBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function hoursBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export function minutesBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.round((diffMs / (1000 * 60)) * 10) / 10;
}

export class GitHubRateLimitError extends Error {
  resetAt: Date;
  constructor(resetAt: Date) {
    const mins = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60000));
    super(`GitHub API rate limit exceeded. Resets in ~${mins} minute${mins === 1 ? "" : "s"}.`);
    this.name = "GitHubRateLimitError";
    this.resetAt = resetAt;
  }
}

export function asRateLimitError(error: unknown): GitHubRateLimitError | null {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: number }).status === 403 &&
    "message" in error &&
    typeof (error as { message: string }).message === "string" &&
    (error as { message: string }).message.toLowerCase().includes("rate limit")
  ) {
    let resetAt = new Date(Date.now() + 60 * 60 * 1000); // default: 1h from now
    if ("response" in error) {
      const resp = error as { response?: { headers?: Record<string, string> } };
      const resetHeader = resp.response?.headers?.["x-ratelimit-reset"];
      if (resetHeader) {
        resetAt = new Date(parseInt(resetHeader, 10) * 1000);
      }
    }
    return new GitHubRateLimitError(resetAt);
  }
  return null;
}

export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
