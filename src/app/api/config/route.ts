import { getConfigStatus, saveConfig, clearConfigCache } from "@/lib/config";

const ALLOWED_KEYS = new Set([
  "GITHUB_TOKEN",
  "GITHUB_ORG",
  "GITHUB_REPO",
  "LINEAR_API_KEY",
  "LINEAR_TEAM_ID",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_IDS",
  "ANTHROPIC_API_KEY",
  "AI_PROVIDER",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "DORA_DEPLOYMENT_SOURCE",
  "DORA_ENVIRONMENT",
  "DORA_INCIDENT_LABELS",
]);

export async function GET() {
  clearConfigCache();
  return Response.json({ data: getConfigStatus() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Only allow known config keys
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_KEYS.has(key) && typeof value === "string") {
        filtered[key] = value;
      }
    }

    saveConfig(filtered);
    clearConfigCache();

    return Response.json({ data: getConfigStatus() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save configuration";
    return Response.json({ error: message }, { status: 500 });
  }
}
