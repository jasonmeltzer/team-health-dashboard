"use client";

import { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Raw markdown strings loaded via next.config.mjs turbopack.rules (type: "raw").
// The glob in next.config.mjs is scoped to these 3 files only.
// Module shape for `*.md` raw imports is declared in src/types/markdown.d.ts.
import githubDoc from "../../../docs/github-oauth-setup.md";
import linearDoc from "../../../docs/linear-oauth-setup.md";
import slackDoc from "../../../docs/slack-setup.md";

export type DocSlug = "github-oauth-setup" | "linear-oauth-setup" | "slack-setup";

const DOCS: Record<DocSlug, string> = {
  "github-oauth-setup": githubDoc,
  "linear-oauth-setup": linearDoc,
  "slack-setup": slackDoc,
};

const TITLES: Record<DocSlug, string> = {
  "github-oauth-setup": "GitHub OAuth Setup",
  "linear-oauth-setup": "Linear OAuth Setup",
  "slack-setup": "Slack Setup",
};

interface DocViewerModalProps {
  open: boolean;
  onClose: () => void;
  slug: DocSlug | null;
}

export default function DocViewerModal({ open, onClose, slug }: DocViewerModalProps) {
  const markdown = useMemo(() => (slug ? DOCS[slug] : ""), [slug]);
  const title = slug ? TITLES[slug] : "";

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
              <Dialog.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {title}
              </Dialog.Title>
              <Dialog.Close
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Close setup guide"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div
                className="prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-table:text-sm prose-th:font-semibold"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
