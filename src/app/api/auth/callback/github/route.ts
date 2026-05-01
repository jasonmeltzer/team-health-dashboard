import { OAuth2RequestError } from "arctic";
import { cookies } from "next/headers";
import { getGitHubProvider } from "@/lib/oauth-providers";
import { saveOAuthToken } from "@/lib/oauth-db";
import { closePopupWithError, closePopupWithSuccess } from "../../oauth-helpers";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("github_oauth_state")?.value ?? null;

  if (!code || !state || !storedState || state !== storedState) {
    return closePopupWithError("github", "Invalid state parameter");
  }

  const github = getGitHubProvider();
  if (!github) {
    return closePopupWithError("github", "GitHub OAuth not configured");
  }

  try {
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    // Fetch GitHub user info for "Connected as X" display.
    let accountName: string | null = null;
    try {
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "team-health-dashboard",
          Accept: "application/vnd.github+json",
        },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        accountName = userData?.login ?? null;
      }
    } catch {
      // Non-fatal — continue without accountName
    }

    // GitHub OAuth tokens do not expire and have no refresh token.
    saveOAuthToken("github", {
      accessToken,
      refreshToken: null,
      expiresAt: null,
      accountName,
    });

    return closePopupWithSuccess("github", accountName);
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      return closePopupWithError("github", "Authorization failed");
    }
    return closePopupWithError("github", "Unexpected error");
  }
}
