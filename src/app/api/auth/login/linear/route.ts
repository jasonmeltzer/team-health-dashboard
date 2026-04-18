import { generateState } from "arctic";
import { cookies } from "next/headers";
import { getLinearProvider } from "@/lib/oauth-providers";

// Linear OAuth: read scope covers all dashboard GraphQL queries (teams, cycles, issues, issueHistory).
// See 04-RESEARCH.md scope matrix.
const LINEAR_SCOPES = ["read"];

export async function GET(): Promise<Response> {
  const linear = getLinearProvider();
  if (!linear) {
    return new Response("Linear OAuth not configured", { status: 500 });
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
