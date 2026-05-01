export type OAuthProvider = "github" | "linear" | "slack";

export interface OAuthTokenData {
  accessToken: string;        // plaintext — encrypted before DB write
  refreshToken: string | null; // only Linear uses refresh tokens
  expiresAt: Date | null;     // only Linear tokens expire (24h)
  accountName: string | null;  // display name for "Connected as X"
}

export interface OAuthTokenRow {
  id: number;
  provider: string;
  access_token: string;       // encrypted in DB
  refresh_token: string | null; // encrypted in DB
  expires_at: string | null;  // ISO8601
  account_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface OAuthStatus {
  github: { connected: boolean; accountName: string | null };
  linear: { connected: boolean; accountName: string | null };
  slack:  { connected: boolean; accountName: string | null };
}
