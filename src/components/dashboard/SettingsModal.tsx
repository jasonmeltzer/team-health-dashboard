"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface ConfigStatus {
  github: boolean;
  linear: boolean;
  slack: boolean;
  dora: boolean;
  ai: boolean;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Section = "github" | "linear" | "slack" | "dora" | "ai";

const SECTIONS: { key: Section; label: string; description: string }[] = [
  { key: "github", label: "GitHub", description: "PR metrics, cycle time, review bottlenecks" },
  { key: "dora", label: "DORA", description: "Deploy frequency, lead time, CFR, MTTR" },
  { key: "linear", label: "Linear", description: "Sprint velocity, workload, time-in-state" },
  { key: "slack", label: "Slack", description: "Response times, channel activity, overload" },
  { key: "ai", label: "AI Analysis", description: "Health summary and weekly narrative" },
];

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("github");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state for each integration
  const [github, setGithub] = useState({ token: "", org: "", repo: "" });
  const [linear, setLinear] = useState({ apiKey: "", teamId: "" });
  const [slack, setSlack] = useState({ botToken: "", channelIds: "" });
  const [doraSettings, setDoraSettings] = useState({ source: "auto", environment: "production", incidentLabels: "incident,hotfix,production-bug" });
  const [ai, setAi] = useState({ provider: "ollama", anthropicKey: "", ollamaUrl: "", ollamaModel: "" });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const json = await res.json();
      if (json.data) setStatus(json.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStatus();
      setMessage(null);
    }
  }, [open, fetchStatus]);

  if (!open) return null;

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
        setMessage({ type: "success", text: "Saved! Refresh the dashboard to see changes." });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
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
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    status?.[section.key]
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
              <SectionForm
                title="GitHub"
                description="Connect to GitHub to track PR metrics, cycle time, and review bottlenecks."
                configured={status?.github}
                fields={[
                  {
                    label: "Personal Access Token",
                    placeholder: "ghp_...",
                    value: github.token,
                    onChange: (v) => setGithub((s) => ({ ...s, token: v })),
                    type: "password",
                    hint: "Needs 'repo' scope",
                    help: "1. Go to github.com > Settings > Developer settings > Personal access tokens > Tokens (classic)\n2. Click \"Generate new token (classic)\"\n3. Give it a name (e.g. \"Team Health Dashboard\")\n4. Under scopes, check \"repo\" (full control of private repositories)\n5. Click \"Generate token\" and copy the token (starts with ghp_)",
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
              <SectionForm
                title="Linear"
                description="Connect to Linear to track sprint velocity, workload distribution, and time-in-state."
                configured={status?.linear}
                fields={[
                  {
                    label: "API Key",
                    placeholder: "lin_api_...",
                    value: linear.apiKey,
                    onChange: (v) => setLinear((s) => ({ ...s, apiKey: v })),
                    type: "password",
                    hint: "Settings > API > Personal API keys",
                    help: "1. Open Linear and click your avatar (bottom-left)\n2. Go to Settings > API\n3. Under \"Personal API keys\", click \"Create key\"\n4. Give it a label and click \"Create\"\n5. Copy the key (starts with lin_api_)",
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
              <SectionForm
                title="Slack"
                description="Connect to Slack to track response times, channel activity, and team overload signals."
                configured={status?.slack}
                fields={[
                  {
                    label: "Bot OAuth Token",
                    placeholder: "xoxb-...",
                    value: slack.botToken,
                    onChange: (v) => setSlack((s) => ({ ...s, botToken: v })),
                    type: "password",
                    hint: "Needs channels:history, channels:read, users:read",
                    help: "1. Go to api.slack.com/apps and click \"Create New App\" > \"From scratch\"\n2. Name it (e.g. \"Team Health\") and pick your workspace\n3. Go to OAuth & Permissions in the sidebar\n4. Under \"Bot Token Scopes\", add: channels:history, channels:read, users:read\n5. Click \"Install to Workspace\" at the top and authorize\n6. Copy the \"Bot User OAuth Token\" (starts with xoxb-)\n7. Invite the bot to each channel you want to monitor: /invite @Team Health",
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

            {activeSection === "ai" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    AI Analysis
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Powers health summaries and weekly narratives. Use Ollama for free local inference, Anthropic for Claude API, or Manual to use any AI chat.
                  </p>
                  {status?.ai && (
                    <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                      Configured
                    </span>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Provider
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(["ollama", "anthropic", "manual"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setAi((s) => ({ ...s, provider: p }))}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
                    <p className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">How manual mode works</p>
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
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold leading-none text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600 dark:hover:text-zinc-200"
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
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  help?: string;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
    </div>
  );
}

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
  fields: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; hint?: string; help?: string }[];
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
        {configured && (
          <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
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
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
