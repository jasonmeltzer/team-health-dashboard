import { generateState } from "arctic";
import { cookies } from "next/headers";
import { getGitHubProvider } from "@/lib/oauth-providers";

// Scopes:
//   repo     — required for PRs, reviews, releases on private repos (grants write per GitHub limitation — no read-only repo scope)
//   read:org — list org repos (org repo listing)
// See 04-RESEARCH.md scope matrix and Pitfall 4 (write access disclosure).
const GITHUB_SCOPES = ["repo", "read:org"];

export async function GET(): Promise<Response> {
  const github = getGitHubProvider();
  if (!github) {
    return new Response("GitHub OAuth not configured", { status: 500 });
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
