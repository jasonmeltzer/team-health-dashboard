# GitHub OAuth Setup Guide

Step-by-step instructions for creating a GitHub OAuth app, granting the scopes this dashboard requires, and wiring it up to your local instance. If you only need read-only access or cannot register an OAuth app, a fine-grained Personal Access Token is the manual alternative covered in the Settings UI and [README.md](../README.md).

---

## Prerequisites

- Admin access to the GitHub organization (or personal account) that owns the repo you want to track
- The dashboard running locally (default: `http://localhost:5555`)
- The org + repo pair you intend to track (e.g. `myorg/myrepo`)

---

## Step 1: Create an OAuth App

1. Go to [https://github.com/settings/developers](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name:** e.g. "Team Health Dashboard"
   - **Homepage URL:** `http://localhost:5555`
   - **Authorization callback URL:** `http://localhost:5555/api/auth/callback/github`
4. Click **Register application**

Replace `5555` with your actual `PORT` if you run the dashboard on a different port. Make sure this exactly matches `APP_BASE_URL` (check `scripts.dev` in `package.json` — this project defaults to `PORT=5555`).

---

## Step 2: Scopes Explained

The dashboard requests two scopes during the OAuth flow:

- `repo` — read pull requests, reviews, commits, and deployments for private and public repos
- `read:org` — read organization membership to resolve reviewer and author identities

> **Pitfall:** GitHub does not offer a read-only `repo` scope; the `repo` grant includes write permissions to code/issues. A fine-grained PAT is the read-only alternative and is documented in the Manual Token flow, not the OAuth flow.

If your team cannot grant write-capable tokens, skip the OAuth flow entirely and use a **fine-grained Personal Access Token** scoped to the specific repo with read-only permissions on **Pull requests**, **Contents**, **Issues**, and **Metadata**. Paste the PAT into the Settings UI field labeled **GitHub Token**.

---

## Step 3: Copy Client ID and Generate Client Secret

1. You land on the OAuth App detail page after registering
2. Copy the **Client ID** (visible on the page)
3. Click **Generate a new client secret**
4. Copy the secret immediately — GitHub only displays it once

If you lose the client secret, return to this page and generate a new one; the old secret will be revoked.

---

## Step 4: Configure the Dashboard

Add to `.env.local` (or set via the Settings UI):

```bash
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=ghp_yourclientsecrethere
APP_BASE_URL=http://localhost:5555
OAUTH_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

The `OAUTH_ENCRYPTION_KEY` is shared across the github, linear, and slack OAuth providers — generate it once and reuse the same value for all three. Losing this key means all stored OAuth tokens become unreadable and every connected provider must be reconnected.

Restart the dev server after editing `.env.local` — Next.js only loads env vars at startup.

Start the dashboard, open Settings → GitHub, and click **Connect via GitHub OAuth**. The popup opens the GitHub consent page; after you approve, the popup closes and the Settings modal shows **Connected as [github-username]**.

---

## Troubleshooting

| Error                                | Cause                                                                                  | Fix                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `redirect_uri_mismatch`              | Redirect URL in the OAuth App does not match `APP_BASE_URL + /api/auth/callback/github` | Update the **Authorization callback URL** in step 1 to match exactly (including port and scheme) |
| `invalid_client`                     | `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` wrong / missing / typo                    | Re-copy from the OAuth App detail page → restart the dev server                                  |
| `Bad state cookie (missing or expired)` | State cookie expired (10-minute TTL) or popup sat idle too long                     | Close the popup and click **Connect** again to start a fresh OAuth flow                          |
| `OAUTH_ENCRYPTION_KEY not set`       | Dashboard-side env missing                                                             | Run `openssl rand -base64 32` and paste into `.env.local` → restart                              |
| Connection lost after working        | Token revoked in GitHub → Settings → Applications, or org admin revoked app access     | Disconnect via Settings → reconnect                                                              |
| Popup blocked                        | Browser popup blocker                                                                  | Allow popups for the dashboard origin, then click **Connect via GitHub OAuth** again             |

---

## See Also

- [./linear-oauth-setup.md](./linear-oauth-setup.md) — Linear OAuth setup
- [./slack-setup.md](./slack-setup.md) — Slack app + OAuth setup

---

## What's Next

Once GitHub is wired up, the dashboard's GitHub section shows:

- **Cycle Time Trend** — average hours to merge and to first review, by ISO week
- **Review Bottlenecks** — per-reviewer pending vs reviewed counts and average wait time
- **Open PRs** and **Stale PRs** — full lists with author, reviewers, and age

All GitHub metrics contribute to the deterministic health score (max 30 points of deductions). See [ARCHITECTURE.md](../ARCHITECTURE.md) for how GitHub signals are scored.
