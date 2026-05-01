"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { openOAuthPopup, type OAuthProvider } from "@/lib/oauth-client";
import type { ConfigStatus } from "@/hooks/useConfigStatus";
import DocViewerModal from "./DocViewerModalDynamic";
import type { DocSlug } from "./DocViewerModal";
import ConnectErrorAlert from "./ConnectErrorAlert";

interface WelcomeHeroProps {
  status: ConfigStatus;
  onConnect: (section: "github" | "linear" | "slack" | "ai") => void;
  onOAuthSuccess?: () => void;
}

type IntegrationKey = "github" | "linear" | "slack" | "ai";

const INTEGRATIONS: {
  key: IntegrationKey;
  name: string;
  description: string;
  oauthEligible: boolean;
}[] = [
  {
    key: "github",
    name: "GitHub",
    description: "PR cycle time, review bottlenecks, and stale PR tracking",
    oauthEligible: true,
  },
  {
    key: "linear",
    name: "Linear",
    description: "Sprint velocity, workload distribution, and time-in-state",
    oauthEligible: true,
  },
  {
    key: "slack",
    name: "Slack",
    description: "Response times, channel activity, and overload indicators",
    oauthEligible: true,
  },
  {
    key: "ai",
    name: "AI",
    description:
      "Health summary insights and weekly narrative (Ollama, Anthropic, or Manual)",
    oauthEligible: false,
  },
];

const PROVIDER_DOC_SLUG: Record<"github" | "linear" | "slack", DocSlug> = {
  github: "github-oauth-setup",
  linear: "linear-oauth-setup",
  slack: "slack-setup",
};

export function WelcomeHero({ status, onConnect, onOAuthSuccess }: WelcomeHeroProps) {
  const [docModalSlug, setDocModalSlug] = useState<DocSlug | null>(null);
  const [setupError, setSetupError] = useState<
    Partial<Record<"github" | "linear" | "slack", string[] | null>>
  >({});

  const handleOAuthClick = (key: IntegrationKey) => {
    if (key === "ai") {
      onConnect(key);
      return;
    }
    setSetupError((prev) => ({ ...prev, [key]: null }));
    openOAuthPopup(
      key as OAuthProvider,
      () => onOAuthSuccess?.(),
      (_p, reason, detail) => {
        if (reason === "not-configured" && detail?.missingVars) {
          setSetupError((prev) => ({ ...prev, [key]: detail.missingVars ?? [] }));
        }
        // Other errors: stay silent in WelcomeHero (user can retry in SettingsModal).
      }
    );
  };

  return (
    <Card className="col-span-full p-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Welcome to Team Health Dashboard
          </h2>
          <p className="mt-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
            Connect your tools to see your team&apos;s health score, trend charts, and AI-powered insights.
          </p>
        </div>

        <div className="space-y-3">
          {INTEGRATIONS.map((integration) => {
            const configured = status[integration.key];
            const provisioning =
              integration.oauthEligible && integration.key !== "ai"
                ? status.oauthProvisioned?.[integration.key as "github" | "linear" | "slack"]
                : undefined;
            const fullyProvisioned = !!(
              provisioning?.clientId &&
              provisioning?.clientSecret &&
              provisioning?.encryptionKey
            );
            const currentSetupError =
              setupError[integration.key as "github" | "linear" | "slack"] ?? null;

            return (
              <div key={integration.key} className="space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        configured
                          ? "bg-emerald-500"
                          : "bg-zinc-300 dark:bg-zinc-600"
                      )}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {integration.name}
                      </span>
                      <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                        {integration.description}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {configured ? (
                      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                        Connected
                      </span>
                    ) : integration.oauthEligible && integration.key !== "ai" && !fullyProvisioned ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setDocModalSlug(
                              PROVIDER_DOC_SLUG[integration.key as "github" | "linear" | "slack"]
                            )
                          }
                          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-normal text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Set up OAuth
                        </button>
                        <button
                          onClick={() => onConnect(integration.key)}
                          className="text-xs font-normal text-zinc-500 underline cursor-pointer"
                        >
                          or use API key
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOAuthClick(integration.key)}
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-normal text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Connect {integration.name}
                        </button>
                        {integration.oauthEligible && (
                          <button
                            onClick={() => onConnect(integration.key)}
                            className="text-xs font-normal text-zinc-500 underline cursor-pointer"
                          >
                            or use API key
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {currentSetupError && currentSetupError.length > 0 && (
                  <ConnectErrorAlert
                    provider={integration.key as "github" | "linear" | "slack"}
                    missingVars={currentSetupError}
                    onOpenSetup={() =>
                      setDocModalSlug(
                        PROVIDER_DOC_SLUG[integration.key as "github" | "linear" | "slack"]
                      )
                    }
                    onClose={() =>
                      setSetupError((prev) => ({ ...prev, [integration.key]: null }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <DocViewerModal
        open={docModalSlug !== null}
        onClose={() => setDocModalSlug(null)}
        slug={docModalSlug}
      />
    </Card>
  );
}
