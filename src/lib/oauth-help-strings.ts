import type { DocSlug } from "@/components/dashboard/DocViewerModal";

/**
 * 1-line hints for the ? HelpPopover next to each manual API-key field.
 * Single-sentence per D-06. The "Full guide" link is rendered separately —
 * do NOT include "[Full guide]" text inside the popover copy.
 */
export const MANUAL_FIELD_HELP = {
  GITHUB_TOKEN:
    "A GitHub personal access token with `repo` + `read:org` scopes from github.com/settings/tokens.",
  LINEAR_API_KEY: "A Linear personal API key from linear.app/settings/api.",
  SLACK_BOT_TOKEN:
    "A Slack Bot User OAuth token (starts with `xoxb-`) with channels:read, channels:history, and users:read scopes.",
} as const;

export const OAUTH_HELP_STRINGS: Record<
  keyof typeof MANUAL_FIELD_HELP,
  { helpText: string; docSlug: DocSlug }
> = {
  GITHUB_TOKEN: { helpText: MANUAL_FIELD_HELP.GITHUB_TOKEN, docSlug: "github-oauth-setup" },
  LINEAR_API_KEY: { helpText: MANUAL_FIELD_HELP.LINEAR_API_KEY, docSlug: "linear-oauth-setup" },
  SLACK_BOT_TOKEN: { helpText: MANUAL_FIELD_HELP.SLACK_BOT_TOKEN, docSlug: "slack-setup" },
};
