import { getDb } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/oauth-crypto";
import type { OAuthProvider, OAuthTokenData, OAuthTokenRow, OAuthStatus } from "@/types/oauth";

async function refreshLinearToken(
  encryptedRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  try {
    const refreshToken = decryptToken(encryptedRefreshToken);
    const res = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINEAR_CLIENT_ID || "",
        client_secret: process.env.LINEAR_CLIENT_SECRET || "",
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.access_token) return null;
    // Linear rotates refresh tokens on every refresh — always store the new one
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + (json.expires_in || 86400) * 1000),
    };
  } catch {
    return null;
  }
}

export function saveOAuthToken(provider: OAuthProvider, data: OAuthTokenData): void {
  const db = getDb();
  const encryptedAccess = encryptToken(data.accessToken);
  const encryptedRefresh = data.refreshToken ? encryptToken(data.refreshToken) : null;
  const expiresAt = data.expiresAt ? data.expiresAt.toISOString() : null;

  db.prepare(`
    INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at, account_name, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at    = excluded.expires_at,
      account_name  = excluded.account_name,
      updated_at    = datetime('now')
  `).run(provider, encryptedAccess, encryptedRefresh, expiresAt, data.accountName);
}

/**
 * Returns the decrypted access token for the given provider.
 * For Linear, checks token expiry and refreshes inline if within 5 minutes of expiry.
 * Returns null if no token is stored or if refresh fails.
 */
export async function getOAuthToken(provider: string): Promise<string | null> {
  const row = getOAuthRow(provider);
  if (!row) return null;

  // For Linear: check token expiry and refresh inline if needed
  if (provider === "linear" && row.expires_at) {
    const expiresAt = new Date(row.expires_at);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      if (!row.refresh_token) {
        // No refresh token — delete and return null
        deleteOAuthToken("linear");
        return null;
      }

      const refreshed = await refreshLinearToken(row.refresh_token);
      if (!refreshed) {
        // Refresh failed — delete invalid tokens per D-08
        deleteOAuthToken("linear");
        return null;
      }

      // Save the new tokens (Linear rotates refresh tokens per research Pitfall 2)
      saveOAuthToken("linear", {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        accountName: row.account_name,
      });

      return refreshed.accessToken;
    }
  }

  try {
    return decryptToken(row.access_token);
  } catch {
    return null;
  }
}

/**
 * Returns the raw DB row for the given provider (no decryption).
 * Used for status checks and inline refresh logic.
 */
export function getOAuthRow(provider: string): OAuthTokenRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM oauth_tokens WHERE provider = ?")
    .get(provider) as OAuthTokenRow | undefined;
  return row ?? null;
}

export function deleteOAuthToken(provider: OAuthProvider | string): void {
  const db = getDb();
  db.prepare("DELETE FROM oauth_tokens WHERE provider = ?").run(provider);
}

/**
 * Returns connected/accountName status per provider without decrypting tokens.
 */
export function getOAuthStatus(): OAuthStatus {
  const db = getDb();
  const rows = db
    .prepare("SELECT provider, account_name FROM oauth_tokens WHERE provider IN ('github', 'linear', 'slack')")
    .all() as Array<{ provider: string; account_name: string | null }>;

  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return {
    github: {
      connected: byProvider.has("github"),
      accountName: byProvider.get("github")?.account_name ?? null,
    },
    linear: {
      connected: byProvider.has("linear"),
      accountName: byProvider.get("linear")?.account_name ?? null,
    },
    slack: {
      connected: byProvider.has("slack"),
      accountName: byProvider.get("slack")?.account_name ?? null,
    },
  };
}
