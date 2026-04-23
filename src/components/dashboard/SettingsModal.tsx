"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { WeightSliders } from "./WeightSliders";
import { openOAuthPopup, type OAuthProvider } from "@/lib/oauth-client";
import type { ScoreDeduction } from "@/types/metrics";
import DocViewerModal from "./DocViewerModalDynamic";
import type { DocSlug } from "./DocViewerModal";
import ConnectErrorAlert from "./ConnectErrorAlert";
import { OAUTH_HELP_STRINGS } from "@/lib/oauth-help-strings";

interface OAuthProviderStatus {
  connected: boolean;
  accountName: string | null;
}

interface ConfigStatus {
  github: boolean;
  linear: boolean;
  slack: boolean;
  dora: boolean;
  ai: boolean;
  oauth?: {
    github: OAuthProviderStatus;
    linear: OAuthProviderStatus;
    slack: OAuthProviderStatus;
  };
  oauthProvisioned?: {
    github: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
    linear: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
    slack: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
  };
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialSection?: Section;
  deductions?: ScoreDeduction[] | null;
}

type Section = "github" | "linear" | "slack" | "dora" | "ai" | "cache" | "scoring";

const SECTIONS: { key: Section; label: string; description: string }[] = [
  { key: "github", label: "GitHub", description: "PR metrics, cycle time, review bottlenecks" },
  { key: "dora", label: "DORA", description: "Deploy frequency, lead time, CFR, MTTR" },
  { key: "linear", label: "Linear", description: "Sprint velocity, workload, time-in-state" },
  { key: "slack", label: "Slack", description: "Response times, channel activity, overload" },
  { key: "ai", label: "AI Analysis", description: "Health summary and weekly narrative" },
  { key: "cache", label: "Cache", description: "Per-integration refresh intervals" },
  { key: "scoring", label: "Scoring", description: "Integration weight adjustments" },
];

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
};

export function SettingsModal({ open, onClose, onSaved, initialSection = "github", deductions }: SettingsModalProps) {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("github");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // OAuth-specific UI state
  const [popupBlocked, setPopupBlocked] = useState<Record<string, boolean>>({});
  const [disconnectConfirm, setDisconnectConfirm] = useState<Record<string, boolean>>({});
  const [showManualFields, setShowManualFields] = useState<Record<string, boolean>>({});
  const [oauthDisconnected, setOAuthDisconnected] = useState<Record<string, boolean>>({});
  const [oauthError, setOAuthError] = useState<Record<string, string | null>>({});
  const [oauthSetupError, setOAuthSetupError] = useState<Record<string, string[] | null>>({});
  const [docModalSlug, setDocModalSlug] = useState<DocSlug | null>(null);
  const prevOAuthRef = useRef<Record<string, boolean>>({});

  // Form state for each integration
  const [github, setGithub] = useState({ token: "", org: "", repo: "" });
  const [linear, setLinear] = useState({ apiKey: "", teamId: "" });
  const [slack, setSlack] = useState({ botToken: "", channelIds: "", teamMemberIds: "" });
  const [doraSettings, setDoraSettings] = useState({ source: "auto", environment: "production", incidentLabels: "incident,hotfix,production-bug" });
  const [ai, setAi] = useState({ provider: "ollama", anthropicKey: "", ollamaUrl: "", ollamaModel: "" });
  const [cacheTtl, setCacheTtl] = useState({ github: "", linear: "", slack: "", dora: "", healthSummary: "", weeklyNarrative: "" });
  const [scoringWeights, setScoringWeights] = useState({ github: "", linear: "", slack: "", dora: "" });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const json = await res.json();
      if (json.data) {
        setStatus(json.data);
        // Sync AI provider selector with current config
        if (json.data.aiProvider) {
          setAi((s) => ({ ...s, provider: json.data.aiProvider }));
        }
        // Sync cache TTL fields with saved values
        if (json.data.cacheTtl) {
          setCacheTtl(json.data.cacheTtl);
        }
        if (json.data.scoringWeights) {
          setScoringWeights(json.data.scoringWeights);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
      setMessage(null);
      setActiveSection(initialSection);
    }
  }, [open, fetchStatus, initialSection]);

  // Track OAuth connection transitions so we can show the "Connection lost"
  // state when the token is revoked or refresh fails (D-08 / INTG-04).
  useEffect(() => {
    if (!status?.oauth) return;
    const next: Record<string, boolean> = {};
    for (const provider of ["github", "linear", "slack"] as const) {
      const isConnected = !!status.oauth[provider]?.connected;
      next[provider] = isConnected;
      const wasConnected = prevOAuthRef.current[provider];
      if (wasConnected && !isConnected) {
        setOAuthDisconnected((prev) => ({ ...prev, [provider]: true }));
      }
      if (isConnected) {
        // Clear "disconnected" flag once reconnected
        setOAuthDisconnected((prev) => ({ ...prev, [provider]: false }));
      }
    }
    prevOAuthRef.current = next;
  }, [status?.oauth]);

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (json.error) {
        setMessage({ type: "error", text: json.error });
      } else {
        setStatus(json.data);
        setMessage({ type: "success", text: "Saved!" });
        onSaved();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save configuration" });
    }
    setSaving(false);
  };

  const saveGithub = () =>
    handleSave({
      GITHUB_TOKEN: github.token,
      GITHUB_ORG: github.org,
      GITHUB_REPO: github.repo,
    });

  const saveLinear = () =>
    handleSave({
      LINEAR_API_KEY: linear.apiKey,
      LINEAR_TEAM_ID: linear.teamId,
    });

  const saveSlack = () =>
    handleSave({
      SLACK_BOT_TOKEN: slack.botToken,
      SLACK_CHANNEL_IDS: slack.channelIds,
      SLACK_TEAM_MEMBER_IDS: slack.teamMemberIds,
    });

  const saveDora = () =>
    handleSave({
      DORA_DEPLOYMENT_SOURCE: doraSettings.source,
      DORA_ENVIRONMENT: doraSettings.environment,
      DORA_INCIDENT_LABELS: doraSettings.incidentLabels,
    });

  const saveAi = () =>
    handleSave({
      AI_PROVIDER: ai.provider,
      ANTHROPIC_API_KEY: ai.anthropicKey,
      OLLAMA_BASE_URL: ai.ollamaUrl,
      OLLAMA_MODEL: ai.ollamaModel,
    });

  const saveCache = () =>
    handleSave({
      CACHE_TTL_GITHUB: cacheTtl.github,
      CACHE_TTL_LINEAR: cacheTtl.linear,
      CACHE_TTL_SLACK: cacheTtl.slack,
      CACHE_TTL_DORA: cacheTtl.dora,
      CACHE_TTL_HEALTH_SUMMARY: cacheTtl.healthSummary,
      CACHE_TTL_WEEKLY_NARRATIVE: cacheTtl.weeklyNarrative,
    });

  const handleOAuthConnect = useCallback(
    (provider: OAuthProvider) => {
      setPopupBlocked((prev) => ({ ...prev, [provider]: false }));
      setOAuthError((prev) => ({ ...prev, [provider]: null }));
      setOAuthSetupError((prev) => ({ ...prev, [provider]: null }));
      openOAuthPopup(
        provider,
        () => {
          setOAuthDisconnected((prev) => ({ ...prev, [provider]: false }));
          fetchStatus();
          onSaved();
        },
        (_p, reason, detail) => {
          if (reason === "popup_blocked") {
            setPopupBlocked((prev) => ({ ...prev, [provider]: true }));
          } else if (reason === "not-configured" && detail?.missingVars) {
            setOAuthSetupError((prev) => ({ ...prev, [provider]: detail.missingVars ?? [] }));
          } else {
            setOAuthError((prev) => ({ ...prev, [provider]: reason }));
          }
        }
      );
    },
    [fetchStatus, onSaved]
  );

  const handleDisconnect = useCallback(
    async (provider: OAuthProvider) => {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", provider }),
      });
      setDisconnectConfirm((prev) => ({ ...prev, [provider]: false }));
      setOAuthDisconnected((prev) => ({ ...prev, [provider]: false }));
      // Reset prev ref so the transition-tracking effect doesn't flag this as a revocation
      prevOAuthRef.current[provider] = false;
      fetchStatus();
      onSaved();
    },
    [fetchStatus, onSaved]
  );

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <Dialog.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Settings
          </Dialog.Title>
          <Dialog.Close className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Dialog.Close>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="w-48 shrink-0 border-r border-zinc-200 py-3 dark:border-zinc-700">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                onClick={() => {
                  setActiveSection(section.key);
                  setMessage(null);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
                  activeSection === section.key
                    ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    status && section.key in status && status[section.key as keyof ConfigStatus]
                      ? "bg-emerald-500"
                      : "bg-zinc-300 dark:bg-zinc-600"
                  )}
                />
                {section.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {message && (
              <div
                className={cn(
                  "mb-4 rounded-lg px-3 py-2 text-sm",
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                )}
              >
                {message.text}
              </div>
            )}

            {activeSection === "github" && (
              <OAuthSectionForm
                provider="github"
                title="GitHub"
                description="Connect to GitHub to track PR metrics, cycle time, and review bottlenecks."
                oauthAccountName={status?.oauth?.github?.accountName ?? null}
                oauthConnected={!!status?.oauth?.github?.connected}
                envOrConfigActive={!!status?.github}
                oauthDisconnected={!!oauthDisconnected.github}
                popupBlocked={!!popupBlocked.github}
                oauthErrorReason={oauthError.github ?? null}
                showManualFields={!!showManualFields.github}
                disconnectConfirm={!!disconnectConfirm.github}
                onConnect={() => handleOAuthConnect("github")}
                onDisconnectRequest={() =>
                  setDisconnectConfirm((prev) => ({ ...prev, github: true }))
                }
                onDisconnectConfirm={() => handleDisconnect("github")}
                onDisconnectCancel={() =>
                  setDisconnectConfirm((prev) => ({ ...prev, github: false }))
                }
                onShowManual={() =>
                  setShowManualFields((prev) => ({ ...prev, github: true }))
                }
                oauthScopeWarning="GitHub OAuth requires repo access (read + write permissions). Use a fine-grained PAT instead if write access is a concern."
                provisioned={status?.oauthProvisioned?.github ?? { clientId: false, clientSecret: false, encryptionKey: false }}
                setupError={oauthSetupError.github ?? null}
                onClearSetupError={() => setOAuthSetupError((prev) => ({ ...prev, github: null }))}
                onOpenDoc={(slug) => setDocModalSlug(slug)}
                docSlug="github-oauth-setup"
                onOpenFullGuide={(slug) => setDocModalSlug(slug)}
                fields={[
                  {
                    label: "Personal Access Token",
                    placeholder: "ghp_...",
                    value: github.token,
                    onChange: (v) => setGithub((s) => ({ ...s, token: v })),
                    type: "password",
                    hint: "Needs 'repo' scope",
                    help: OAUTH_HELP_STRINGS.GITHUB_TOKEN.helpText,
                    fullGuideSlug: "github-oauth-setup",
                  },
                  {
                    label: "Organization",
                    placeholder: "your-org",
                    value: github.org,
                    onChange: (v) => setGithub((s) => ({ ...s, org: v })),
                    help: "The GitHub organization or user that owns the repository. This is the first part of the repo URL: github.com/{org}/{repo}",
                  },
                  {
                    label: "Repository",
                    placeholder: "your-repo",
                    value: github.repo,
                    onChange: (v) => setGithub((s) => ({ ...s, repo: v })),
                    help: "The repository name to track. This is the second part of the repo URL: github.com/{org}/{repo}",
                  },
                ]}
                onSave={saveGithub}
                saving={saving}
              />
            )}

            {activeSection === "linear" && (
              <OAuthSectionForm
                provider="linear"
                title="Linear"
                description="Connect to Linear to track sprint velocity, workload distribution, and time-in-state."
                oauthAccountName={status?.oauth?.linear?.accountName ?? null}
                oauthConnected={!!status?.oauth?.linear?.connected}
                envOrConfigActive={!!status?.linear}
                oauthDisconnected={!!oauthDisconnected.linear}
                popupBlocked={!!popupBlocked.linear}
                oauthErrorReason={oauthError.linear ?? null}
                showManualFields={!!showManualFields.linear}
                disconnectConfirm={!!disconnectConfirm.linear}
                onConnect={() => handleOAuthConnect("linear")}
                onDisconnectRequest={() =>
                  setDisconnectConfirm((prev) => ({ ...prev, linear: true }))
                }
                onDisconnectConfirm={() => handleDisconnect("linear")}
                onDisconnectCancel={() =>
                  setDisconnectConfirm((prev) => ({ ...prev, linear: false }))
                }
                onShowManual={() =>
                  setShowManualFields((prev) => ({ ...prev, linear: true }))
                }
                provisioned={status?.oauthProvisioned?.linear ?? { clientId: false, clientSecret: false, encryptionKey: false }}
                setupError={oauthSetupError.linear ?? null}
                onClearSetupError={() => setOAuthSetupError((prev) => ({ ...prev, linear: null }))}
                onOpenDoc={(slug) => setDocModalSlug(slug)}
                docSlug="linear-oauth-setup"
                onOpenFullGuide={(slug) => setDocModalSlug(slug)}
                fields={[
                  {
                    label: "API Key",
                    placeholder: "lin_api_...",
                    value: linear.apiKey,
                    onChange: (v) => setLinear((s) => ({ ...s, apiKey: v })),
                    type: "password",
                    hint: "Settings > API > Personal API keys",
                    help: OAUTH_HELP_STRINGS.LINEAR_API_KEY.helpText,
                    fullGuideSlug: "linear-oauth-setup",
                  },
                  {
                    label: "Team ID",
                    placeholder: "e.g. abc123",
                    value: linear.teamId,
                    onChange: (v) => setLinear((s) => ({ ...s, teamId: v })),
                    help: "1. Open Linear and go to Settings > Teams\n2. Click on the team you want to track\n3. The team ID is in the URL: linear.app/settings/teams/{teamId}\n\nAlternatively, use the Linear API: run a GraphQL query for { teams { nodes { id name } } }",
                  },
                ]}
                onSave={saveLinear}
                saving={saving}
              />
            )}

            {activeSection === "slack" && (
              <OAuthSectionForm
                provider="slack"
                title="Slack"
                description="Connect to Slack to track response times, channel activity, and team overload signals."
                oauthAccountName={status?.oauth?.slack?.accountName ?? null}
                oauthConnected={!!status?.oauth?.slack?.connected}
                envOrConfigActive={!!status?.slack}
                oauthDisconnected={!!oauthDisconnected.slack}
                popupBlocked={!!popupBlocked.slack}
                oauthErrorReason={oauthError.slack ?? null}
                showManualFields={!!showManualFields.slack}
                disconnectConfirm={!!disconnectConfirm.slack}
                onConnect={() => handleOAuthConnect("slack")}
                onDisconnectRequest={() =>
                  setDisconnectConfirm((prev) => ({ ...prev, slack: true }))
                }
                onDisconnectConfirm={() => handleDisconnect("slack")}
                onDisconnectCancel={() =>
                  setDisconnectConfirm((prev) => ({ ...prev, slack: false }))
                }
                onShowManual={() =>
                  setShowManualFields((prev) => ({ ...prev, slack: true }))
                }
                provisioned={status?.oauthProvisioned?.slack ?? { clientId: false, clientSecret: false, encryptionKey: false }}
                setupError={oauthSetupError.slack ?? null}
                onClearSetupError={() => setOAuthSetupError((prev) => ({ ...prev, slack: null }))}
                onOpenDoc={(slug) => setDocModalSlug(slug)}
                docSlug="slack-setup"
                onOpenFullGuide={(slug) => setDocModalSlug(slug)}
                fields={[
                  {
                    label: "Bot OAuth Token",
                    placeholder: "xoxb-...",
                    value: slack.botToken,
                    onChange: (v) => setSlack((s) => ({ ...s, botToken: v })),
                    type: "password",
                    hint: "Needs channels:history, channels:read, users:read",
                    help: OAUTH_HELP_STRINGS.SLACK_BOT_TOKEN.helpText,
                    fullGuideSlug: "slack-setup",
                  },
                  {
                    label: "Channel IDs",
                    placeholder: "C01ABC, C02DEF",
                    value: slack.channelIds,
                    onChange: (v) => setSlack((s) => ({ ...s, channelIds: v })),
                    hint: "Comma-separated",
                    help: "To find a channel ID:\n1. Open Slack and right-click on the channel name\n2. Click \"View channel details\" (or \"Copy link\")\n3. The channel ID is at the bottom of the details panel, or the last segment of the copied link\n\nIt looks like C01ABC2DEF3. Add multiple IDs separated by commas.",
                  },
                ]}
                extraFields={
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Team member filter
                    </label>
                    <textarea
                      rows={3}
                      value={slack.teamMemberIds}
                      onChange={(e) => setSlack((s) => ({ ...s, teamMemberIds: e.target.value }))}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      placeholder="U01234ABC, U05678DEF"
                    />
                    <p className="text-xs font-normal text-zinc-500">
                      Enter Slack member IDs (e.g. U01234ABC), one per line or comma-separated. Leave blank to include all members.
                    </p>
                  </div>
                }
                onSave={saveSlack}
                saving={saving}
              />
            )}

            {activeSection === "dora" && (
              <SectionForm
                title="DORA Metrics"
                description="DORA metrics use your GitHub configuration. These settings customize how deployment and incident data is detected."
                configured={status?.dora}
                fields={[
                  {
                    label: "Deployment Source",
                    placeholder: "auto",
                    value: doraSettings.source,
                    onChange: (v) => setDoraSettings((s) => ({ ...s, source: v })),
                    hint: "auto, deployments, releases, or merges",
                    help: "Controls where deployment data comes from:\n- \"auto\" (default): Tries Deployments → Releases → Merged PRs\n- \"deployments\": Only use GitHub Deployments API (for CI/CD workflows)\n- \"releases\": Only use GitHub Releases/tags\n- \"merges\": Treat every merged PR to the default branch as a deployment (for teams that deploy on merge)",
                  },
                  {
                    label: "Environment",
                    placeholder: "production",
                    value: doraSettings.environment,
                    onChange: (v) => setDoraSettings((s) => ({ ...s, environment: v })),
                    hint: "GitHub deployment environment name",
                    help: "The deployment environment to track (e.g., \"production\", \"staging\"). Only used when deployment source is \"deployments\" or \"auto\".",
                  },
                  {
                    label: "Incident Labels",
                    placeholder: "incident,hotfix,production-bug",
                    value: doraSettings.incidentLabels,
                    onChange: (v) => setDoraSettings((s) => ({ ...s, incidentLabels: v })),
                    hint: "Comma-separated GitHub issue labels",
                    help: "GitHub issue labels that indicate production incidents. Used to calculate Change Failure Rate and MTTR.\n\nReverted PRs (titles starting with \"Revert\") are also detected automatically.",
                  },
                ]}
                onSave={saveDora}
                saving={saving}
              />
            )}

            {activeSection === "cache" && (
              <SectionForm
                title="Cache"
                description="Configure how long API responses are cached before revalidating. Env vars (e.g. CACHE_TTL_GITHUB in .env.local) take precedence over these settings."
                fields={[
                  {
                    label: "GitHub cache TTL (ms)",
                    placeholder: "900000",
                    value: cacheTtl.github,
                    onChange: (v) => setCacheTtl((s) => ({ ...s, github: v })),
                    help: "How long to cache GitHub API responses before refreshing. Default: 15 minutes (900000ms).\n\nYou can also set CACHE_TTL_GITHUB in .env.local — env vars take precedence over this setting.",
                  },
                  {
                    label: "Linear cache TTL (ms)",
                    placeholder: "900000",
                    value: cacheTtl.linear,
                    onChange: (v) => setCacheTtl((s) => ({ ...s, linear: v })),
                    help: "How long to cache Linear API responses before refreshing. Default: 15 minutes (900000ms).\n\nYou can also set CACHE_TTL_LINEAR in .env.local — env vars take precedence over this setting.",
                  },
                  {
                    label: "Slack cache TTL (ms)",
                    placeholder: "900000",
                    value: cacheTtl.slack,
                    onChange: (v) => setCacheTtl((s) => ({ ...s, slack: v })),
                    help: "How long to cache Slack API responses before refreshing. Default: 15 minutes (900000ms).\n\nYou can also set CACHE_TTL_SLACK in .env.local — env vars take precedence over this setting.",
                  },
                  {
                    label: "DORA cache TTL (ms)",
                    placeholder: "900000",
                    value: cacheTtl.dora,
                    onChange: (v) => setCacheTtl((s) => ({ ...s, dora: v })),
                    help: "How long to cache DORA metrics before refreshing. Default: 15 minutes (900000ms).\n\nYou can also set CACHE_TTL_DORA in .env.local — env vars take precedence over this setting.",
                  },
                  {
                    label: "Health Summary TTL (ms)",
                    placeholder: "600000",
                    value: cacheTtl.healthSummary,
                    onChange: (v) => setCacheTtl((s) => ({ ...s, healthSummary: v })),
                    help: "How long to cache the health summary (includes AI call). Default: 10 minutes (600000ms).\n\nYou can also set CACHE_TTL_HEALTH_SUMMARY in .env.local — env vars take precedence over this setting.",
                  },
                  {
                    label: "Weekly Narrative TTL (ms)",
                    placeholder: "900000",
                    value: cacheTtl.weeklyNarrative,
                    onChange: (v) => setCacheTtl((s) => ({ ...s, weeklyNarrative: v })),
                    help: "How long to cache the weekly narrative (expensive AI call). Default: 15 minutes (900000ms).\n\nYou can also set CACHE_TTL_WEEKLY_NARRATIVE in .env.local — env vars take precedence over this setting.",
                  },
                ]}
                onSave={saveCache}
                saving={saving}
              />
            )}

            {activeSection === "scoring" && (
              <WeightSliders
                configStatus={status}
                deductions={deductions ?? null}
                initialWeights={scoringWeights}
                onSave={async (weights) => {
                  const res = await fetch("/api/config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(weights),
                  });
                  if (!res.ok) throw new Error("Save failed");
                  onSaved();
                }}
                onOpenSection={(section) => setActiveSection(section as Section)}
              />
            )}

            {activeSection === "ai" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    AI Analysis
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Powers health summaries and weekly narratives. Use Ollama for free local inference, Anthropic for Claude API, or Manual to use any AI chat.
                  </p>
                  {status?.ai && (
                    <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                      Configured
                    </span>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-normal text-zinc-700 dark:text-zinc-300">
                    Provider
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(["ollama", "anthropic", "manual"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setAi((s) => ({ ...s, provider: p }))}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                          ai.provider === p
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        )}
                      >
                        {p === "ollama" ? "Ollama (free, local)" : p === "anthropic" ? "Anthropic (Claude)" : "Manual (any AI chat)"}
                      </button>
                    ))}
                  </div>
                </div>

                {ai.provider === "anthropic" && (
                  <Field
                    label="Anthropic API Key"
                    placeholder="sk-ant-..."
                    value={ai.anthropicKey}
                    onChange={(v) => setAi((s) => ({ ...s, anthropicKey: v }))}
                    type="password"
                    help={"1. Go to console.anthropic.com and sign in (or create an account)\n2. Click \"API Keys\" in the left sidebar\n3. Click \"Create Key\", give it a name\n4. Copy the key (starts with sk-ant-)\n\nNote: Anthropic API usage requires a paid account with credits."}
                  />
                )}

                {ai.provider === "ollama" && (
                  <>
                    <Field
                      label="Ollama Base URL"
                      placeholder="http://localhost:11434"
                      value={ai.ollamaUrl}
                      onChange={(v) => setAi((s) => ({ ...s, ollamaUrl: v }))}
                      hint="Leave blank for default (localhost:11434)"
                      help="The URL where your Ollama server is running. If you installed Ollama on this machine, the default (localhost:11434) should work.\n\nIf Ollama is running on another machine on your network, use that machine's IP address (e.g. http://192.168.1.100:11434)."
                    />
                    <Field
                      label="Model"
                      placeholder="llama3"
                      value={ai.ollamaModel}
                      onChange={(v) => setAi((s) => ({ ...s, ollamaModel: v }))}
                      hint="Run 'ollama pull llama3' to download"
                      help={"To set up Ollama:\n1. Install from ollama.com (macOS, Linux, or Windows)\n2. Open a terminal and run: ollama pull llama3\n3. Wait for the download to complete (~4GB)\n\nOther good models to try:\n- llama3 (default, good all-around)\n- mistral (fast, good for structured output)\n- llama3:70b (higher quality, needs more RAM)"}
                    />
                  </>
                )}

                {ai.provider === "manual" && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                    <p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">How manual mode works</p>
                    <ol className="list-inside list-decimal space-y-1">
                      <li>The dashboard generates a prompt file with your metrics data</li>
                      <li>Download the file and paste it into any AI chat (ChatGPT, Claude, Gemini, etc.)</li>
                      <li>Copy the AI&apos;s response and import it back into the dashboard</li>
                    </ol>
                    <p className="mt-2 text-zinc-400">No API keys or local software needed. Works with any AI you have access to, including free tiers.</p>
                  </div>
                )}

                <button
                  onClick={saveAi}
                  disabled={saving}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      <DocViewerModal
        open={docModalSlug !== null}
        onClose={() => setDocModalSlug(null)}
        slug={docModalSlug}
      />
    </Dialog.Root>
  );
}

function HelpPopover({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold leading-none text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-10 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {content.split("\n").map((line, i) => (
            <p key={i} className={line === "" ? "mt-2" : undefined}>
              {line}
            </p>
          ))}
        </div>
      )}
    </span>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  hint,
  help,
  fullGuideSlug,
  onOpenFullGuide,
}: FieldSpec & { onOpenFullGuide?: (slug: DocSlug) => void }) {
  return (
    <div>
      <label className="mb-1 flex items-center text-xs font-normal text-zinc-700 dark:text-zinc-300">
        {label}
        {help && <HelpPopover content={help} />}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
      />
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
      {fullGuideSlug && onOpenFullGuide && (
        <button
          type="button"
          onClick={() => onOpenFullGuide(fullGuideSlug)}
          className="mt-1 text-xs font-normal text-zinc-500 underline cursor-pointer"
        >
          Full guide
        </button>
      )}
    </div>
  );
}

type FieldSpec = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  help?: string;
  fullGuideSlug?: DocSlug;
};

function SectionForm({
  title,
  description,
  configured,
  fields,
  onSave,
  saving,
}: {
  title: string;
  description: string;
  configured?: boolean;
  fields: FieldSpec[];
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
        {configured && (
          <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            Configured
          </span>
        )}
      </div>

      {fields.map((field) => (
        <Field key={field.label} {...field} />
      ))}

      <p className="text-xs text-zinc-400">
        Only fill in fields you want to update. Blank fields are ignored.
      </p>

      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function OAuthSectionForm({
  provider,
  title,
  description,
  oauthAccountName,
  oauthConnected,
  envOrConfigActive,
  oauthDisconnected,
  popupBlocked,
  oauthErrorReason,
  showManualFields,
  disconnectConfirm,
  onConnect,
  onDisconnectRequest,
  onDisconnectConfirm,
  onDisconnectCancel,
  onShowManual,
  oauthScopeWarning,
  fields,
  extraFields,
  onSave,
  saving,
  provisioned,
  setupError,
  onClearSetupError,
  onOpenDoc,
  docSlug,
  onOpenFullGuide,
}: {
  provider: OAuthProvider;
  title: string;
  description: string;
  oauthAccountName: string | null;
  oauthConnected: boolean;
  envOrConfigActive: boolean;
  oauthDisconnected: boolean;
  popupBlocked: boolean;
  oauthErrorReason: string | null;
  showManualFields: boolean;
  disconnectConfirm: boolean;
  onConnect: () => void;
  onDisconnectRequest: () => void;
  onDisconnectConfirm: () => void;
  onDisconnectCancel: () => void;
  onShowManual: () => void;
  oauthScopeWarning?: string;
  fields: FieldSpec[];
  extraFields?: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  provisioned: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
  setupError: string[] | null;
  onClearSetupError: () => void;
  onOpenDoc: (slug: DocSlug) => void;
  docSlug: DocSlug;
  onOpenFullGuide: (slug: DocSlug) => void;
}) {
  const providerLabel = PROVIDER_LABELS[provider];
  // Priority: env/config takes precedence over OAuth (per D-09 and UI-SPEC State Matrix).
  // When env/config is active, always show the manual form.
  const envPrecedence = envOrConfigActive && !oauthConnected;
  const showConnectedState = !envPrecedence && oauthConnected;
  const showDisconnectedAlert =
    !envPrecedence && !oauthConnected && oauthDisconnected;
  const fullyProvisioned = provisioned.clientId && provisioned.clientSecret && provisioned.encryptionKey;
  const showConnectButton =
    !envPrecedence && !oauthConnected && !oauthDisconnected && fullyProvisioned;
  const showSetUpOAuthLink =
    !envPrecedence && !oauthConnected && !oauthDisconnected && !fullyProvisioned;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
        {envPrecedence && (
          <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            Configured
          </span>
        )}
      </div>

      {showConnectedState && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Connected
            </span>
            {oauthAccountName && (
              <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                as {oauthAccountName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {disconnectConfirm ? (
              <>
                <button
                  onClick={onDisconnectConfirm}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-normal text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Confirm disconnect
                </button>
                <button
                  onClick={onDisconnectCancel}
                  className="text-xs font-normal text-zinc-500 underline cursor-pointer"
                >
                  Keep connected
                </button>
              </>
            ) : (
              <button
                onClick={onDisconnectRequest}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-normal text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Disconnect {providerLabel}
              </button>
            )}
            {!showManualFields && (
              <button
                onClick={onShowManual}
                className="text-xs font-normal text-zinc-500 underline cursor-pointer"
              >
                Use API key instead
              </button>
            )}
          </div>
        </div>
      )}

      {showDisconnectedAlert && (
        <div className="space-y-2">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Connection lost
              </span>
            </div>
            <p className="mt-1 text-sm font-normal text-red-700 dark:text-red-300">
              Your {providerLabel} token was revoked or expired. Reconnect to restore data.
            </p>
          </div>
          <button
            onClick={onConnect}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-normal text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Reconnect via OAuth
          </button>
          {!showManualFields && (
            <button
              onClick={onShowManual}
              className="block text-xs font-normal text-zinc-500 underline cursor-pointer"
            >
              or use API key instead
            </button>
          )}
          {popupBlocked && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Popup blocked. Allow popups for this site and try again.
            </p>
          )}
        </div>
      )}

      {showConnectButton && (
        <div className="space-y-2">
          <button
            onClick={onConnect}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-normal text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Connect via {providerLabel} OAuth
          </button>
          {oauthScopeWarning && (
            <p className="mt-1 text-xs font-normal text-zinc-500">
              {oauthScopeWarning}
            </p>
          )}
          {!showManualFields && (
            <button
              onClick={onShowManual}
              className="block text-xs font-normal text-zinc-500 underline cursor-pointer"
            >
              or use API key instead
            </button>
          )}
          {popupBlocked && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Popup blocked. Allow popups for this site and try again.
            </p>
          )}
          {oauthErrorReason && !popupBlocked && (
            <p className="text-xs text-red-600 dark:text-red-400">
              OAuth failed: {oauthErrorReason}. Try again or use an API key.
            </p>
          )}
        </div>
      )}

      {showSetUpOAuthLink && (
        <div className="space-y-2">
          <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
            OAuth not yet configured. Complete setup to enable Connect.
          </p>
          <button
            type="button"
            onClick={() => onOpenDoc(docSlug)}
            className="text-sm font-normal text-zinc-900 underline cursor-pointer dark:text-zinc-100"
          >
            Set up OAuth
          </button>
          {!showManualFields && (
            <button
              onClick={onShowManual}
              className="block text-xs font-normal text-zinc-500 underline cursor-pointer"
            >
              or use API key instead
            </button>
          )}
        </div>
      )}

      {setupError && setupError.length > 0 && (
        <ConnectErrorAlert
          provider={provider}
          missingVars={setupError}
          onOpenSetup={() => onOpenDoc(docSlug)}
          onClose={onClearSetupError}
        />
      )}

      {(envPrecedence || showManualFields) && (
        <>
          {fields.map((field) => (
            <Field key={field.label} {...field} onOpenFullGuide={onOpenFullGuide} />
          ))}
          {extraFields}
          <p className="text-xs text-zinc-400">
            Only fill in fields you want to update. Blank fields are ignored.
          </p>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      )}
    </div>
  );
}
