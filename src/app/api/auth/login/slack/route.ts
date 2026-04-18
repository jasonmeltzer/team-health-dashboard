import { generateState } from "arctic";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { SLACK_OAUTH_CONFIG } from "@/lib/oauth-providers";

// Slack uses manual OAuth v2 — Arctic's Slack provider is OIDC-only and does NOT produce
// bot tokens. See 04-RESEARCH.md Pitfall 3 and the Slack Bot Token OAuth pattern.

export async function GET(): Promise<Response> {
  const clientId = getConfig("SLACK_CLIENT_ID");
  if (!clientId) {
    return new Response("Slack OAuth not configured", { status: 500 });
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
