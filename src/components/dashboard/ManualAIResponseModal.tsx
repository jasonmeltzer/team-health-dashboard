"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ManualAIResponseModalProps {
  open: boolean;
  onClose: () => void;
  type: "health-summary" | "weekly-narrative";
  onImported: () => void;
}

export function ManualAIResponseModal({
  open,
  onClose,
  type,
  onImported,
}: ManualAIResponseModalProps) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setResponse("");
      setError(null);
      setSuccess(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setResponse(text);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!response.trim()) {
      setError("Please paste the AI's response first.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/ai-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, response: response.trim() }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error || `Failed to process response (HTTP ${res.status})`);
        return;
      }

      setSuccess(true);
      // Start the refetch immediately, close after a brief flash of success
      onImported();
      setTimeout(() => {
        onClose();
      }, 600);
    } catch {
      setError("Failed to submit response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isHealthSummary = type === "health-summary";
  const title = isHealthSummary ? "Import Health Summary" : "Import Weekly Narrative";
  const placeholder = isHealthSummary
    ? '{"insights":["..."],"recommendations":["..."]}'
    : "Paste the narrative text here...";
  const hint = isHealthSummary
    ? "Paste the JSON response from your AI chat. It should contain \"insights\" and \"recommendations\" arrays."
    : "Paste the narrative text from your AI chat. It should be a few paragraphs of prose.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
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

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          <p className="text-sm text-zinc-500">{hint}</p>

          <textarea
            ref={textareaRef}
            value={response}
            onChange={(e) => {
              setResponse(e.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            rows={10}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Upload file instead
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            {response && (
              <span className="text-xs text-zinc-400">
                {response.length.toLocaleString()} characters
              </span>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              Imported successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !response.trim() || success}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
              submitting || !response.trim() || success
                ? "bg-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            )}
          >
            {submitting ? "Processing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
