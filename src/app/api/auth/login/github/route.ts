import { generateState } from "arctic";
import { cookies } from "next/headers";
import { getGitHubProvider } from "@/lib/oauth-providers";
import { assertOAuthProvisioned, closePopupWithSetupError } from "@/app/api/auth/oauth-helpers";

// Scopes:
//   repo     — required for PRs, reviews, releases on private repos (grants write per GitHub limitation — no read-only repo scope)
//   read:org — list org repos (org repo listing)
// See 04-RESEARCH.md scope matrix and Pitfall 4 (write access disclosure).
const GITHUB_SCOPES = ["repo", "read:org"];

export async function GET(): Promise<Response> {
  const { missingVars } = assertOAuthProvisioned("github");
  if (missingVars.length > 0) {
    return closePopupWithSetupError("github", missingVars);
  }

  const github = getGitHubProvider();
  if (!github) {
    // Second-line defense — should be unreachable after the pre-flight above.
    return closePopupWithSetupError("github", ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]);
  }

  const state = generateState();
  const url = github.createAuthorizationURL(state, GITHUB_SCOPES);

  const cookieStore = await cookies();
  cookieStore.set("github_oauth_state", state, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 10, // 10 minutes
    sameSite: "lax",
  });

  return Response.redirect(url.toString());
}
