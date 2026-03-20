"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ConfigStatus {
  github: boolean;
  linear: boolean;
  slack: boolean;
  ai: boolean;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Section = "github" | "linear" | "slack" | "ai";

const SECTIONS: { key: Section; label: string; description: string }[] = [
  { key: "github", label: "GitHub", description: "PR metrics, cycle time, review bottlenecks" },
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
                  { label: "Personal Access Token", placeholder: "ghp_...", value: github.token, onChange: (v) => setGithub((s) => ({ ...s, token: v })), type: "password", hint: "Needs 'repo' scope" },
                  { label: "Organization", placeholder: "your-org", value: github.org, onChange: (v) => setGithub((s) => ({ ...s, org: v })) },
                  { label: "Repository", placeholder: "your-repo", value: github.repo, onChange: (v) => setGithub((s) => ({ ...s, repo: v })) },
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
                  { label: "API Key", placeholder: "lin_api_...", value: linear.apiKey, onChange: (v) => setLinear((s) => ({ ...s, apiKey: v })), type: "password", hint: "Settings > API > Personal API keys" },
                  { label: "Team ID", placeholder: "e.g. abc123", value: linear.teamId, onChange: (v) => setLinear((s) => ({ ...s, teamId: v })) },
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
                  { label: "Bot OAuth Token", placeholder: "xoxb-...", value: slack.botToken, onChange: (v) => setSlack((s) => ({ ...s, botToken: v })), type: "password", hint: "Needs channels:history, channels:read, users:read" },
                  { label: "Channel IDs", placeholder: "C01ABC, C02DEF", value: slack.channelIds, onChange: (v) => setSlack((s) => ({ ...s, channelIds: v })), hint: "Comma-separated. Right-click channel > View details > copy ID" },
                ]}
                onSave={saveSlack}
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
                    Powers health summaries and weekly narratives. Use Ollama for free local inference, or Anthropic for Claude.
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
                  <div className="flex gap-2">
                    {(["ollama", "anthropic"] as const).map((p) => (
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
                        {p === "ollama" ? "Ollama (free, local)" : "Anthropic (Claude)"}
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
                    />
                    <Field
                      label="Model"
                      placeholder="llama3"
                      value={ai.ollamaModel}
                      onChange={(v) => setAi((s) => ({ ...s, ollamaModel: v }))}
                      hint="Run 'ollama pull llama3' to download"
                    />
                  </>
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

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
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
  fields: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; hint?: string }[];
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
