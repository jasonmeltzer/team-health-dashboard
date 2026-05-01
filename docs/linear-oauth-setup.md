# Linear OAuth Setup Guide

Step-by-step instructions for creating a Linear OAuth application, wiring it up to your local instance, and understanding Linear's 24-hour access token + refresh token model. If you prefer not to register an OAuth app, pasting a **Personal API Key** into the Settings UI is the manual alternative.

---

## Prerequisites

- Admin (or workspace owner) permission on the Linear workspace you want to analyze
- The **Team ID** for the team you intend to track
- The dashboard running locally (default: `http://localhost:5555`)

---

## Step 1: Create an OAuth Application

1. Go to [https://linear.app/settings/api/applications](https://linear.app/settings/api/applications)
2. Click **New application**
3. Fill in:
   - **Application name:** e.g. "Team Health Dashboard"
   - **Developer name / URL:** your team name / any URL (not exposed to users)
   - **Callback URLs:** `http://localhost:5555/api/auth/callback/linear`
4. Click **Create**

Replace `5555` with your actual `PORT` if you run the dashboard on a different port. Make sure this exactly matches `APP_BASE_URL` (check `scripts.dev` in `package.json` — this project defaults to `PORT=5555`).

---

## Step 2: Scopes

Linear OAuth applications grant **full-access tokens** — there is no scope picker. The authorized token can read and write everything the granting user can access in the workspace.

The dashboard uses this token strictly for read operations: it fetches teams, cycles, issues, issue history, and labels via GraphQL, and writes nothing. The write capability exists in the token but is never exercised by this app. If your organization has policies against granting write-capable tokens, use the **Personal API Key** flow instead (paste the key into the Settings UI → Linear → API Key field).

---

## Step 3: Token Refresh Behavior

Linear OAuth tokens are short-lived and rotate automatically:

- **Access token:** valid for **24 hours** from issuance
- **Refresh token:** rotates on every successful refresh — the old refresh token is invalidated as soon as a new one is issued

The dashboard handles this transparently: before every Linear API call, it checks the stored access token's expiry and performs a refresh exchange if needed. Each refresh writes the new access token + new refresh token back to the encrypted store.

If a refresh fails (token revoked in Linear's UI, workspace admin revoked the app, or the refresh token expired from disuse), the dashboard **deletes the stored token** and surfaces a **"Connection lost"** state in Settings. Click **Connect via Linear OAuth** again to restart the flow and mint a fresh refresh token.

---

## Step 4: Copy Client ID and Client Secret

1. You land on the application detail page after creating it
2. Copy the **Client ID**
3. Copy the **Client Secret**

If you lose the client secret, return to this page to rotate it; rotating the secret will invalidate any tokens already minted against the previous secret.

---

## Step 5: Configure the Dashboard

Add to `.env.local` (or set via the Settings UI):

```bash
LINEAR_CLIENT_ID=lin_oauth_abc123
LINEAR_CLIENT_SECRET=lin_oauth_secret_here
APP_BASE_URL=http://localhost:5555
OAUTH_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

The `OAUTH_ENCRYPTION_KEY` is shared across the github, linear, and slack OAuth providers — generate it once and reuse the same value for all three. Losing this key means all stored OAuth tokens become unreadable and every connected provider must be reconnected.

Restart the dev server after editing `.env.local` — Next.js only loads env vars at startup.

Start the dashboard, open Settings → Linear, and click **Connect via Linear OAuth**. The popup opens the Linear consent page; after you approve, the popup closes and the Settings modal shows **Connected as [linear-username]**.

---

## Troubleshooting

| Error                                | Cause                                                                                 | Fix                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `redirect_uri_mismatch`              | Redirect URL in the Linear application does not match `APP_BASE_URL + /api/auth/callback/linear` | Update the **Callback URLs** in step 1 to match exactly (including port and scheme)              |
| `invalid_client`                     | `LINEAR_CLIENT_ID` or `LINEAR_CLIENT_SECRET` wrong / missing / typo                   | Re-copy from the application detail page → restart the dev server                                |
| `Bad state cookie (missing or expired)` | State cookie expired (10-minute TTL) or popup sat idle too long                    | Close the popup and click **Connect** again to start a fresh OAuth flow                          |
| `OAUTH_ENCRYPTION_KEY not set`       | Dashboard-side env missing                                                            | Run `openssl rand -base64 32` and paste into `.env.local` → restart                              |
| Connection lost after working        | Refresh token was revoked in Linear → Settings → API → Applications, or refresh token expired from disuse | Click **Connect via Linear OAuth** again in Settings to restart the flow                         |
| Popup blocked                        | Browser popup blocker                                                                 | Allow popups for the dashboard origin, then click **Connect via Linear OAuth** again             |

---

## See Also

- [./github-oauth-setup.md](./github-oauth-setup.md) — GitHub OAuth setup
- [./slack-setup.md](./slack-setup.md) — Slack app + OAuth setup

---

## What's Next

Once Linear is wired up, the dashboard's Linear section shows:

- **Velocity / Throughput** — completed issues (or points) per cycle or per week
- **Time in State** — lead-time breakdown, current WIP, assignee heatmap, flow efficiency
- **Workload Distribution** — active issues per assignee, with per-cycle or rolling-window views
- **Stalled Issues** — issues with no updates for 5+ days

All Linear metrics contribute to the deterministic health score (max 38 points of deductions). See [ARCHITECTURE.md](../ARCHITECTURE.md) for how Linear signals are scored.
