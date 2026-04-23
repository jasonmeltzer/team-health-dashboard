import { generateState } from "arctic";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { SLACK_OAUTH_CONFIG } from "@/lib/oauth-providers";
import { assertOAuthProvisioned, closePopupWithSetupError } from "@/app/api/auth/oauth-helpers";

// Slack uses manual OAuth v2 — Arctic's Slack provider is OIDC-only and does NOT produce
// bot tokens. See 04-RESEARCH.md Pitfall 3 and the Slack Bot Token OAuth pattern.

export async function GET(): Promise<Response> {
  const { missingVars } = assertOAuthProvisioned("slack");
  if (missingVars.length > 0) {
    return closePopupWithSetupError("slack", missingVars);
  }

  const clientId = getConfig("SLACK_CLIENT_ID");
  if (!clientId) {
    // Second-line defense — should be unreachable after the pre-flight above.
    return closePopupWithSetupError("slack", ["SLACK_CLIENT_ID"]);
  }

  const state = generateState();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_OAUTH_CONFIG.botScopes,
    redirect_uri: SLACK_OAUTH_CONFIG.getRedirectUri(),
    state,
  });

  const cookieStore = await cookies();
  cookieStore.set("slack_oauth_state", state, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 10, // 10 minutes
    sameSite: "lax",
  });

  return Response.redirect(`${SLACK_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`);
}
