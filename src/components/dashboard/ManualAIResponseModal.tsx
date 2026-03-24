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
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setResponse("");
      setFileName(null);
      setError(null);
      setSuccess(false);
      setShowPaste(false);
      setDragging(false);
    }
  }, [open]);

  useEffect(() => {
    if (showPaste) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [showPaste]);

  if (!open) return null;

  const loadFile = async (file: File) => {
    const text = await file.text();
    setResponse(text);
    setFileName(file.name);
    setError(null);
    setShowPaste(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await loadFile(file);
  };

  const handleSubmit = async () => {
    if (!response.trim()) {
      setError("No response to import. Upload a file or paste text first.");
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
  const today = new Date().toISOString().split("T")[0];
  const expectedFile = isHealthSummary ? `health-insights-${today}.json` : `weekly-narrative-${today}.txt`;
  const placeholder = isHealthSummary
    ? '{"insights":["..."],"recommendations":["..."]}'
    : "Paste the narrative text here...";

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
          {/* Primary: file upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors",
              fileName
                ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20"
                : dragging
                  ? "border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/20"
                  : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50"
            )}
          >
            {fileName ? (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{fileName}</p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">{response.length.toLocaleString()} characters loaded</p>
              </>
            ) : (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Upload the AI&apos;s response file</p>
                <p className="text-xs text-zinc-400">
                  Drop {expectedFile} here or click to browse
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.json"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Secondary: paste text */}
          {!showPaste && !fileName ? (
            <button
              onClick={() => setShowPaste(true)}
              className="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              or paste text instead
            </button>
          ) : showPaste ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Paste response text:
              </label>
              <textarea
                ref={textareaRef}
                value={response}
                onChange={(e) => {
                  setResponse(e.target.value);
                  setFileName(null);
                  setError(null);
                }}
                placeholder={placeholder}
                rows={8}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              />
              {response && !fileName && (
                <p className="text-xs text-zinc-400">{response.length.toLocaleString()} characters</p>
              )}
            </div>
          ) : null}

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
