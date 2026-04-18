import { OAuth2RequestError } from "arctic";
import { cookies } from "next/headers";
import { getLinearProvider } from "@/lib/oauth-providers";
import { saveOAuthToken } from "@/lib/oauth-db";
import { closePopupWithError, closePopupWithSuccess } from "../../oauth-helpers";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("linear_oauth_state")?.value ?? null;

  if (!code || !state || !storedState || state !== storedState) {
    return closePopupWithError("linear", "Invalid state parameter");
  }

  const linear = getLinearProvider();
  if (!linear) {
    return closePopupWithError("linear", "Linear OAuth not configured");
  }

  try {
    const tokens = await linear.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();
    // Linear access tokens expire in 24h and come with a refresh token (rotate-on-use).
    const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null;
    let expiresAt: Date | null = null;
    try {
      expiresAt = tokens.accessTokenExpiresAt();
    } catch {
      // Some providers omit expires_in — leave null if unavailable
      expiresAt = null;
    }

    // Fetch viewer for display name via Linear GraphQL.
    let accountName: string | null = null;
    try {
      const viewerRes = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "{ viewer { name email } }" }),
      });
      if (viewerRes.ok) {
        const viewerData = await viewerRes.json();
        accountName = viewerData?.data?.viewer?.name || viewerData?.data?.viewer?.email || null;
      }
    } catch {
      // Non-fatal — continue without accountName
    }

    saveOAuthToken("linear", {
      accessToken,
      refreshToken,
      expiresAt,
      accountName,
    });

    return closePopupWithSuccess("linear", accountName);
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      return closePopupWithError("linear", "Authorization failed");
    }
    return closePopupWithError("linear", "Unexpected error");
  }
}
