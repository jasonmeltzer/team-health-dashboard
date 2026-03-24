"use client";

import { Fragment, useState } from "react";
import { useApiData } from "@/hooks/useApiData";
import type { WeeklyNarrative } from "@/types/metrics";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { ManualAIResponseModal } from "./ManualAIResponseModal";
import { cn, formatRelativeTime } from "@/lib/utils";

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; segments: Segment[] }
  | { type: "bullet"; segments: Segment[] };

type Segment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string };

/** Parse inline bold markers into segments. */
function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "bold", text: match[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

/** Parse LLM markdown output into renderable blocks. */
function parseNarrative(raw: string): Block[] {
  const blocks: Block[] = [];
  // Split into chunks on double newlines, but also treat single newlines
  // before headers/bullets as block boundaries
  const lines = raw.split("\n");
  let buffer = "";

  function flushBuffer() {
    const trimmed = buffer.trim();
    if (trimmed) {
      blocks.push({ type: "paragraph", segments: parseInline(trimmed) });
    }
    buffer = "";
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line → flush paragraph
    if (!trimmed) {
      flushBuffer();
      continue;
    }

    // Heading (# or ## or ###)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flushBuffer();
      // Strip bold markers from heading text
      blocks.push({
        type: "heading",
        text: headingMatch[1].replace(/\*\*([^*]+)\*\*/g, "$1"),
      });
      continue;
    }

    // Bold-only line (acts like a heading) e.g. "**Section Title**"
    const boldLineMatch = trimmed.match(/^\*\*([^*]+)\*\*$/);
    if (boldLineMatch) {
      flushBuffer();
      blocks.push({ type: "heading", text: boldLineMatch[1] });
      continue;
    }

    // Bullet point (- or * or 1.)
    const bulletMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)/);
    if (bulletMatch) {
      flushBuffer();
      blocks.push({ type: "bullet", segments: parseInline(bulletMatch[1]) });
      continue;
    }

    // Regular text — accumulate into paragraph
    buffer += (buffer ? " " : "") + trimmed;
  }
  flushBuffer();

  // Remove the first block if it's a generic title like "Weekly Team Health Narrative"
  if (
    blocks.length > 0 &&
    blocks[0].type === "heading" &&
    /narrative|summary|report|overview/i.test(blocks[0].text)
  ) {
    blocks.shift();
  }

  return blocks;
}

function RenderSegments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "bold" ? (
          <strong key={i}>{seg.text}</strong>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        )
      )}
    </>
  );
}

function NarrativeManualModeControls({ onImported }: { onImported: () => void }) {
  const [importOpen, setImportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/ai-prompt?type=weekly-narrative");
      if (!res.ok) throw new Error("Failed to generate prompt file");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `weekly-narrative-prompt-${new Date().toISOString().split("T")[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {downloading ? "Generating..." : "Download Prompt"}
        </button>
        <button
          onClick={() => setImportOpen(true)}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Import Response
        </button>
      </div>
      <ManualAIResponseModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="weekly-narrative"
        onImported={onImported}
      />
    </>
  );
}

export function WeeklyNarrativeCard({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, notConfigured, setupHint, cached, refetch } = useApiData<WeeklyNarrative>(
    "/api/weekly-narrative",
    refreshKey
  );

  if (notConfigured) return null;

  if (loading && !data) {
    return (
      <Card className="col-span-full">
        <Skeleton className="mb-3 h-5 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </Card>
    );
  }

  if (setupHint) {
    return (
      <Card className="col-span-full">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Weekly Summary
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          A narrative summary of your team&apos;s week — trends, risks, and highlights — will appear here.
        </p>
        <p className="mt-2 text-xs text-zinc-400">{setupHint}</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="col-span-full">
        <ErrorState message={error} onRetry={refetch} />
      </Card>
    );
  }

  if (!data) return null;

  // Manual mode with no imported narrative yet
  if (data.manualMode && !data.narrative) {
    return (
      <Card className="col-span-full">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Weekly Summary
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Export your metrics as a prompt file, paste it into any AI chat (ChatGPT, Claude, Gemini, etc.), then import the response.
        </p>
        <div className="mt-4">
          <NarrativeManualModeControls onImported={refetch} />
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("col-span-full", loading && "animate-pulse")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Weekly Summary
        </h2>
        <div className="flex items-center gap-3">
          {data.weekOf && (
            <span className="text-xs text-zinc-500">Week of {data.weekOf}</span>
          )}
          {data.generatedAt && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Updated {formatRelativeTime(data.generatedAt)}
              {cached && (
                <span className="ml-1 text-amber-500 dark:text-amber-400">(cached)</span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
        {parseNarrative(data.narrative).map((block, i) => {
          if (block.type === "heading") {
            return (
              <h3
                key={i}
                className="pt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
              >
                {block.text}
              </h3>
            );
          }
          if (block.type === "bullet") {
            return (
              <p key={i} className="pl-4 before:content-['•_']">
                <RenderSegments segments={block.segments} />
              </p>
            );
          }
          return (
            <p key={i}>
              <RenderSegments segments={block.segments} />
            </p>
          );
        })}
      </div>

      {data.manualMode && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <NarrativeManualModeControls onImported={refetch} />
        </div>
      )}
    </Card>
  );
}
