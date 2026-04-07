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
 */
export function getConfig(key: string): string | undefined {
  return process.env[key] || readConfig()[key] || undefined;
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
 */
export function getConfigStatus(): Record<string, boolean | string | Record<string, string>> {
  const githubConfigured = !!(getConfig("GITHUB_TOKEN") && getConfig("GITHUB_ORG") && getConfig("GITHUB_REPO"));
  const aiProvider = getConfig("AI_PROVIDER") || (getConfig("ANTHROPIC_API_KEY") ? "anthropic" : "ollama");
  return {
    github: githubConfigured,
    linear: !!(getConfig("LINEAR_API_KEY") && getConfig("LINEAR_TEAM_ID")),
    slack: !!(getConfig("SLACK_BOT_TOKEN") && getConfig("SLACK_CHANNEL_IDS")),
    ai: aiProvider === "manual" || !!getConfig("ANTHROPIC_API_KEY") || aiProvider === "ollama",
    aiProvider,
    dora: githubConfigured,
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
