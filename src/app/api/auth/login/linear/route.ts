import { generateState } from "arctic";
import { cookies } from "next/headers";
import { getLinearProvider } from "@/lib/oauth-providers";
import { assertOAuthProvisioned, closePopupWithSetupError } from "@/app/api/auth/oauth-helpers";

// Linear OAuth: read scope covers all dashboard GraphQL queries (teams, cycles, issues, issueHistory).
// See 04-RESEARCH.md scope matrix.
const LINEAR_SCOPES = ["read"];

export async function GET(): Promise<Response> {
  const { missingVars } = assertOAuthProvisioned("linear");
  if (missingVars.length > 0) {
    return closePopupWithSetupError("linear", missingVars);
  }

  const linear = getLinearProvider();
  if (!linear) {
    // Second-line defense — should be unreachable after the pre-flight above.
    return closePopupWithSetupError("linear", ["LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET"]);
  }

  const state = generateState();
  const url = linear.createAuthorizationURL(state, LINEAR_SCOPES);

  const cookieStore = await cookies();
  cookieStore.set("linear_oauth_state", state, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 10, // 10 minutes
    sameSite: "lax",
  });

  return Response.redirect(url.toString());
}
