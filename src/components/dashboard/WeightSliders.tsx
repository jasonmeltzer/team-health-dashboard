"use client";

import { useState } from "react";
import type { ScoreDeduction } from "@/types/metrics";
import { cn } from "@/lib/utils";

interface WeightSlidersProps {
  configStatus: { github: boolean; linear: boolean; slack: boolean; dora: boolean } | null;
  deductions: ScoreDeduction[] | null;
  initialWeights: { github: string; linear: string; slack: string; dora: string };
  onSave: (weights: Record<string, string>) => Promise<void>;
  onOpenSection: (section: string) => void;
}

type Category = "github" | "linear" | "slack" | "dora";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "github", label: "GitHub" },
  { key: "linear", label: "Linear" },
  { key: "slack", label: "Slack" },
  { key: "dora", label: "DORA" },
];

function parseWeight(v: string): number {
  if (!v) return 100;
  const n = parseInt(v, 10);
  return isNaN(n) ? 100 : Math.max(0, Math.min(100, n));
}

function applyWeightsToScore(
  deductions: ScoreDeduction[],
  weights: Record<string, number>
): number {
  const w = {
    github: (weights.github ?? 100) / 100,
    linear: (weights.linear ?? 100) / 100,
    slack: (weights.slack ?? 100) / 100,
    dora: (weights.dora ?? 100) / 100,
  };
  const totalPts = deductions.reduce((s, d) => s + d.points * (w[d.category] ?? 1), 0);
  const maxPts = deductions.reduce((s, d) => s + d.maxPoints * (w[d.category] ?? 1), 0);
  return maxPts > 0 ? Math.round(100 - (totalPts / maxPts) * 100) : 100;
}

export function WeightSliders({
  configStatus,
  deductions,
  initialWeights,
  onSave,
  onOpenSection,
}: WeightSlidersProps) {
  const [sliderWeights, setSliderWeights] = useState<Record<Category, number>>(() => ({
    github: parseWeight(initialWeights.github),
    linear: parseWeight(initialWeights.linear),
    slack: parseWeight(initialWeights.slack),
    dora: parseWeight(initialWeights.dora),
  }));

  const [previewWeights, setPreviewWeights] = useState(sliderWeights);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSliderChange = (cat: Category, value: number) => {
    setSliderWeights((prev) => ({ ...prev, [cat]: value }));
  };

  const handleSliderCommit = () => {
    setPreviewWeights({ ...sliderWeights });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave({
        SCORE_WEIGHT_GITHUB: String(sliderWeights.github),
        SCORE_WEIGHT_LINEAR: String(sliderWeights.linear),
        SCORE_WEIGHT_SLACK: String(sliderWeights.slack),
        SCORE_WEIGHT_DORA: String(sliderWeights.dora),
      });
      setMessage("Weights saved.");
    } catch {
      setMessage("Failed to save scoring weights. Check your settings and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    const defaults = { github: 100, linear: 100, slack: 100, dora: 100 };
    setSliderWeights(defaults);
    setPreviewWeights(defaults);
    setConfirmReset(false);
    onSave({
      SCORE_WEIGHT_GITHUB: "100",
      SCORE_WEIGHT_LINEAR: "100",
      SCORE_WEIGHT_SLACK: "100",
      SCORE_WEIGHT_DORA: "100",
    })
      .then(() => setMessage("Reset to equal weights."))
      .catch(() => {});
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Scoring Weights</h3>
      <p className="text-sm font-normal text-zinc-500">
        Adjust how much each integration contributes to the health score. Disconnected integrations are excluded from scoring.
      </p>

      {/* Live preview score */}
      <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
        <p className="text-xs font-normal text-zinc-500">Preview score</p>
        <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {deductions ? applyWeightsToScore(deductions, previewWeights) : "—"}
        </p>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        {CATEGORIES.map(({ key, label }) => {
          const connected = configStatus?.[key] ?? false;
          const disabled = !connected;
          return (
            <div key={key} className={cn("flex items-center gap-3 min-h-[44px]", disabled && "opacity-50")}>
              <span className="w-16 text-xs font-normal text-zinc-700 dark:text-zinc-300">{label}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={sliderWeights[key]}
                onChange={(e) => handleSliderChange(key, Number(e.target.value))}
                onMouseUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
                onKeyUp={handleSliderCommit}
                disabled={disabled}
                className="flex-1 accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="w-12 text-right text-sm font-mono text-zinc-600 dark:text-zinc-400">
                {sliderWeights[key]}%
              </span>
              {disabled && (
                <button
                  onClick={() => onOpenSection(key)}
                  className="text-xs font-normal text-zinc-400 hover:text-zinc-600 hover:underline"
                >
                  Not configured — connect in Settings
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Env var override note */}
      <p className="text-xs font-normal text-zinc-400">
        Integration weights set via environment variables take precedence over these settings.
      </p>

      {/* Save / Reset buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-normal text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "Saving..." : "Save weights"}
        </button>
        <button
          onClick={handleReset}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-normal text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          {confirmReset ? "Confirm reset" : "Reset to defaults"}
        </button>
      </div>

      {/* Success/error message */}
      {message && (
        <p className={cn("text-xs font-normal", message.includes("Failed") ? "text-red-500" : "text-emerald-600")}>
          {message}
        </p>
      )}
    </div>
  );
}
