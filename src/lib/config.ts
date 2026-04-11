import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), ".config.local.json");

type ConfigStore = Record<string, string>;

let cache: ConfigStore | null = null;

function readConfig(): ConfigStore {
  if (cache) return cache;
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    cache = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return cache!;
  } catch {
    return {};
  }
}

/** Invalidate cache so next read picks up file changes */
export function clearConfigCache() {
  cache = null;
}

/**
 * Get a config value. Checks process.env first, then the local config file.
 * SYNCHRONOUS — safe to call from getTTL(), getProvider(), isAIConfigured(), etc.
 * For keys that may be sourced from OAuth (GITHUB_TOKEN, LINEAR_API_KEY, SLACK_BOT_TOKEN),
 * use getConfigAsync() instead.
 */
export function getConfig(key: string): string | undefined {
  return process.env[key] || readConfig()[key] || undefined;
}

/**
 * OAuth-mapped keys: the only config keys that may be sourced from the OAuth token DB.
 * All other keys (CACHE_TTL_*, AI_PROVIDER, ANTHROPIC_API_KEY, OLLAMA_*, *_CLIENT_ID, etc.)
 * are never stored in the OAuth DB and do not need the async path.
 */
const OAUTH_KEY_TO_PROVIDER: Record<string, string> = {
  GITHUB_TOKEN: "github",
  LINEAR_API_KEY: "linear",
  SLACK_BOT_TOKEN: "slack",
};

/**
 * Async version of getConfig that includes OAuth DB fallback.
 * Use for keys that may be OAuth-sourced: GITHUB_TOKEN, LINEAR_API_KEY, SLACK_BOT_TOKEN.
 * For all other keys, this behaves identically to getConfig() (env var > file, no async work).
 */
export async function getConfigAsync(key: string): Promise<string | undefined> {
  // Layer 1 + 2: env var > .config.local.json (same as getConfig)
  const syncResult = getConfig(key);
  if (syncResult) return syncResult;

  // Layer 3: OAuth DB (only for the three OAuth-mapped token keys)
  const provider = OAUTH_KEY_TO_PROVIDER[key];
  if (provider) {
    // Dynamic import to avoid circular dependencies at module load time
    const { getOAuthToken } = await import("@/lib/oauth-db");
    const token = await getOAuthToken(provider);
    if (token) return token;
  }

  return undefined;
}

/**
 * Save config values to the local config file.
 * Merges with existing values (does not overwrite the whole file).
 */
export function saveConfig(values: ConfigStore) {
  const existing = readConfig();
  const merged = { ...existing, ...values };
  // Remove empty values
  for (const key of Object.keys(merged)) {
    if (!merged[key]) delete merged[key];
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n");
  cache = merged;
}

/**
 * Returns which integrations are configured (without exposing secrets).
 * Now async — includes OAuth connection state per provider (D-03, D-09).
 */
export async function getConfigStatus(): Promise<Record<string, unknown>> {
  const { getOAuthStatus } = await import("@/lib/oauth-db");
  const githubConfigured = !!(await getConfigAsync("GITHUB_TOKEN") && getConfig("GITHUB_ORG") && getConfig("GITHUB_REPO"));
  const aiProvider = getConfig("AI_PROVIDER") || (getConfig("ANTHROPIC_API_KEY") ? "anthropic" : "ollama");
  const oauthStatus = getOAuthStatus(); // synchronous — just checks DB rows exist

  return {
    github: githubConfigured,
    linear: !!(await getConfigAsync("LINEAR_API_KEY") && getConfig("LINEAR_TEAM_ID")),
    slack: !!(await getConfigAsync("SLACK_BOT_TOKEN") && getConfig("SLACK_CHANNEL_IDS")),
    ai: aiProvider === "manual" || !!getConfig("ANTHROPIC_API_KEY") || aiProvider === "ollama",
    aiProvider,
    dora: githubConfigured,
    oauth: oauthStatus,
    cacheTtl: {
      github: getConfig("CACHE_TTL_GITHUB") || "",
      linear: getConfig("CACHE_TTL_LINEAR") || "",
      slack: getConfig("CACHE_TTL_SLACK") || "",
      dora: getConfig("CACHE_TTL_DORA") || "",
      healthSummary: getConfig("CACHE_TTL_HEALTH_SUMMARY") || "",
      weeklyNarrative: getConfig("CACHE_TTL_WEEKLY_NARRATIVE") || "",
    },
    scoringWeights: {
      github: getConfig("SCORE_WEIGHT_GITHUB") || "",
      linear: getConfig("SCORE_WEIGHT_LINEAR") || "",
      slack: getConfig("SCORE_WEIGHT_SLACK") || "",
      dora: getConfig("SCORE_WEIGHT_DORA") || "",
    },
  };
}
