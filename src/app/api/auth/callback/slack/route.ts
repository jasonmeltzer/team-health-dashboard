import { cookies } from "next/headers";
import { getConfig } from "@/lib/config";
import { SLACK_OAUTH_CONFIG } from "@/lib/oauth-providers";
import { saveOAuthToken } from "@/lib/oauth-db";
import { closePopupWithError, closePopupWithSuccess } from "../../oauth-helpers";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("slack_oauth_state")?.value ?? null;

  if (!code || !state || !storedState || state !== storedState) {
    return closePopupWithError("slack", "Invalid state parameter");
  }

  const clientId = getConfig("SLACK_CLIENT_ID");
  const clientSecret = getConfig("SLACK_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return closePopupWithError("slack", "Slack OAuth credentials not configured");
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: SLACK_OAUTH_CONFIG.getRedirectUri(),
    });

    const res = await fetch(SLACK_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const data = await res.json();

    if (!data.ok || !data.access_token) {
      return closePopupWithError("slack", data.error || "Token exchange failed");
    }

    // data.access_token is the bot token (xoxb-...). Slack bot tokens don't expire.
    const accountName = data.team?.name ?? null;

    saveOAuthToken("slack", {
      accessToken: data.access_token,
      refreshToken: null,
      expiresAt: null,
      accountName,
    });

    return closePopupWithSuccess("slack", accountName);
  } catch {
    return closePopupWithError("slack", "Unexpected error");
  }
}
