import { GitHub, Linear } from "arctic";
import { getConfig } from "@/lib/config";

function getBaseUrl(): string {
  return getConfig("APP_BASE_URL") || `http://localhost:${process.env.PORT || 3000}`;
}

export function getGitHubProvider(): GitHub | null {
  const clientId = getConfig("GITHUB_CLIENT_ID");
  const clientSecret = getConfig("GITHUB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return new GitHub(clientId, clientSecret, `${getBaseUrl()}/api/auth/callback/github`);
}

export function getLinearProvider(): Linear | null {
  const clientId = getConfig("LINEAR_CLIENT_ID");
  const clientSecret = getConfig("LINEAR_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return new Linear(clientId, clientSecret, `${getBaseUrl()}/api/auth/callback/linear`);
}

// Slack uses manual OAuth v2 — no Arctic provider (Arctic Slack is OIDC only, not Slack's bot OAuth v2)
export const SLACK_OAUTH_CONFIG = {
  authorizeUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  botScopes: "channels:read channels:history users:read",
  getRedirectUri: () => `${getBaseUrl()}/api/auth/callback/slack`,
};
