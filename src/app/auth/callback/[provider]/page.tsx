"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * OAuth popup landing page (fallback).
 *
 * The actual OAuth flow completes in /api/auth/callback/[provider] which returns
 * HTML that posts a message to window.opener and auto-closes the popup. This page
 * is a client-side fallback in case the popup navigates here directly (e.g. the
 * provider redirected to a page URL rather than the API route, or the user opened
 * the URL manually). It shows a brief status and auto-closes on success.
 */
export default function OAuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connecting...");
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error") || searchParams.get("error_description");
    if (error) {
      setStatus("error");
      setMessage(`Connection failed. ${error}. Close this window and try again.`);
      return;
    }
    setStatus("success");
    setMessage("Connected. This window will close automatically.");
    const timer = setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <p
        className={`text-sm font-normal ${
          status === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-600 dark:text-zinc-400"
        }`}
      >
        {message}
      </p>
    </div>
  );
}
