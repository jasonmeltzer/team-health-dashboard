# Slack App Setup Guide

Step-by-step instructions for creating a Slack app, granting the bot token scopes this dashboard requires, and wiring it up to your local instance.

The dashboard supports two auth flows for Slack:

- **Option A — OAuth (recommended):** Click "Connect Slack" in the Settings UI, authorize the app in a popup, and the encrypted bot token lands in `data/health.db`. Requires `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` on the dashboard side.
- **Option B — Bot token (no OAuth):** Paste an `xoxb-...` bot token into `SLACK_BOT_TOKEN` in `.env.local` or the Settings UI. Simpler for a quick one-workspace setup.

Both options require the same Slack app on the workspace side; only the dashboard wiring differs (step 5).

---

## Prerequisites

- Admin (or "can install apps") access to the Slack workspace you want to analyze
- The dashboard running locally (default: `http://localhost:5555`)
- One or more channel IDs you want to track (step 6)

---

## Step 1: Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Fill in:
   - **App Name:** e.g. "Team Health Dashboard"
   - **Pick a workspace:** your workspace
4. Click **Create App**

You now land on the app's settings page.

---

## Step 2: Add Bot Token Scopes

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll down to **Scopes** → **Bot Token Scopes**
3. Click **Add an OAuth Scope** and add these three scopes one at a time:
   - `channels:read` — view basic info about public channels
   - `channels:history` — read messages in public channels the bot is a member of
   - `users:read` — list workspace members

No User Token Scopes are needed — the dashboard only uses bot-level calls.

---

## Step 3: (Option A only) Configure OAuth Redirect URL

Skip this step if you are using Option B (bot token).

1. Still on **OAuth & Permissions**, scroll to **Redirect URLs**
2. Click **Add New Redirect URL** and enter:

   ```
   http://localhost:5555/api/auth/callback/slack
   ```

   Replace `5555` with your actual `PORT` if you run the dashboard on a different port. Make sure this exactly matches `APP_BASE_URL` on the dashboard side (default `http://localhost:5555`).
3. Click **Add** → **Save URLs**

---

## Step 4: Install the App to Your Workspace

1. Scroll to the top of **OAuth & Permissions**
2. Click **Install to Workspace**
3. Review the requested scopes and click **Allow**
4. You will be redirected back to **OAuth & Permissions** with a **Bot User OAuth Token** visible (starts with `xoxb-...`)

Copy the bot token — you will paste it into the dashboard in step 5.

---

## Step 5: Configure the Dashboard

### Option A — OAuth (recommended)

Get the **Client ID** and **Client Secret** from **Basic Information → App Credentials**, then add to `.env.local` (or set via the Settings UI):

```bash
SLACK_CLIENT_ID=1234567890.1234567890
SLACK_CLIENT_SECRET=abc123...
APP_BASE_URL=http://localhost:5555
OAUTH_ENCRYPTION_KEY=$(openssl rand -base64 32)  # or any 32+ char secret
```

Start the dashboard, open Settings → Slack, and click **Connect via Slack OAuth**. The popup opens the Slack consent page; after you approve, the popup closes and the Settings modal shows **Connected as [workspace-name]**.

### Option B — Bot token

Paste the `xoxb-...` token from step 4 into `.env.local`:

```bash
SLACK_BOT_TOKEN=xoxb-YOUR-BOT-TOKEN-HERE
```

Or paste it into the Settings UI field labeled **Slack Bot Token**. Env vars take precedence over the Settings UI — if both are set, the env var wins.

---

## Step 6: Find Channel IDs

The dashboard needs channel IDs (not names) to fetch messages.

### In the Slack desktop or web client

1. Right-click the channel in the sidebar → **View channel details**
2. Scroll to the bottom of the popup
3. You will see **Channel ID:** followed by an ID like `C0123ABCD4E` — click to copy

### From a channel URL

The URL `https://app.slack.com/client/TXXXX/CYYYY` shows the channel ID after the last `/` (starts with `C`).

Add one or more IDs to `SLACK_CHANNEL_IDS` (comma-separated) in `.env.local` or the Settings UI:

```bash
SLACK_CHANNEL_IDS=C0123ABCD4E,C0987ZYXW9V
```

Make sure your bot is a member of each channel — either add the app manually (`/invite @team-health-dashboard` in the channel) or use the Slack admin UI. The bot cannot read channels it isn't in.

---

## Step 7: (Optional) Team Member Filter

By default, Slack metrics include every non-bot user in the workspace. If you only care about a specific team (e.g. the engineering team), restrict metrics to a roster of Slack user IDs:

1. Find each member's Slack user ID:
   - Profile → three-dot menu → **Copy member ID** (starts with `U`)
   - Or: Settings UI → Slack → help popover for the roster field
2. Add them to the Settings UI **Team member filter** field or set `SLACK_TEAM_MEMBER_IDS` in `.env.local`:

   ```bash
   SLACK_TEAM_MEMBER_IDS=U01ABCDE,U02FGHIJ,U03KLMNO
   ```

   Accepts comma- or newline-delimited IDs.

When the filter is active, the SlackSection header shows **(filtered to N members)** and all metrics (response times, overload indicators, channel activity) scope to the roster.

Clear the field to return to "all workspace members."

---

## Troubleshooting

| Error                      | Cause                                                              | Fix                                                                                                         |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `not_authed`               | `SLACK_BOT_TOKEN` missing, empty, or malformed                     | Verify the token starts with `xoxb-` and is copied from step 4 in full                                      |
| `channel_not_found`        | Channel ID is wrong or the bot is not a member                     | Double-check the ID from step 6; `/invite @your-app-name` in the channel                                    |
| `missing_scope`            | The app lacks `channels:read`, `channels:history`, or `users:read` | Add the missing scope in step 2, **reinstall the app**, and copy the new bot token                          |
| `account_inactive`         | Bot user was deactivated or the workspace removed the app          | Reinstall the app and copy the fresh bot token                                                              |
| `invalid_auth`             | Bot token was revoked or typo'd                                    | Re-run step 4 to regenerate, or disconnect/reconnect via Settings UI                                        |
| No data visible in section | Bot is in the channel but channel has no messages in the last 7d  | Try a channel with recent activity, or wait for new messages                                                |
| OAuth popup closes but Settings stays disconnected | Redirect URL mismatch between Slack app config and `APP_BASE_URL` | Step 3 redirect URL must match `APP_BASE_URL + /api/auth/callback/slack` exactly (including port and scheme) |
| Popup blocked              | Browser popup blocker                                              | Allow popups for the dashboard origin, then click **Connect via Slack OAuth** again                         |

After changing scopes in step 2, you **must reinstall the app** from step 4 — existing tokens do not gain scopes retroactively.

---

## What's Next

Once Slack is wired up, the dashboard's Slack section shows:

- **Response Time Chart** — average reply time per day across tracked channels
- **Channel Activity Chart** — message counts per channel over the last 7 days
- **Overload Indicators** — users whose message volume is >2 standard deviations above the workspace mean

All Slack metrics contribute to the deterministic health score (max 20 points of deductions). See [ARCHITECTURE.md](../ARCHITECTURE.md) for how Slack signals are scored.
