import { getConfig } from "@/lib/config";

/**
 * Shared OAuth popup response helpers.
 *
 * All OAuth callback routes return HTML that runs a small script in the popup:
 *   1. postMessage to window.opener with { type, provider, success, ... }
 *   2. auto-close the popup
 *
 * The parent listens with `window.addEventListener("message", ...)` and uses the
 * `type: "oauth-callback"` field to distinguish from unrelated postMessages.
 *
 * IMPORTANT (research Pitfall 6): do NOT set Cross-Origin-Opener-Policy headers —
 * COOP nullifies `window.opener` in the popup and breaks the flow.
 */

function sanitizeForHtml(s: string): string {
  return s.replace(/[<>"'&]/g, "");
}

export function closePopupWithSuccess(provider: string, accountName?: string | null): Response {
  const safeProvider = sanitizeForHtml(provider);
  const html = `<!DOCTYPE html><html><head><title>OAuth</title></head><body>
<p>Connected. This window will close automatically.</p>
<script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'oauth-callback', provider: '${safeProvider}', success: true, accountName: ${JSON.stringify(accountName ?? null)} },
          window.location.origin
        );
      }
    } catch (e) {}
    setTimeout(function () { window.close(); }, 1000);
  })();
</script></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function closePopupWithError(provider: string, reason: string): Response {
  const safeProvider = sanitizeForHtml(provider);
  const safeReason = sanitizeForHtml(reason);
  const html = `<!DOCTYPE html><html><head><title>OAuth Error</title></head><body>
<p>Connection failed. ${safeReason}. This window will close automatically.</p>
<script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'oauth-callback', provider: '${safeProvider}', success: false, reason: '${safeReason}' },
          window.location.origin
        );
      }
    } catch (e) {}
    setTimeout(function () { window.close(); }, 3000);
  })();
</script></body></html>`;

  return new Response(html, {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Synchronous pre-flight check: reads config and returns every OAuth env var that
 * the provider needs but does not have. Empty array = fully provisioned.
 * Never leaks values — returns only env var names.
 */
export function assertOAuthProvisioned(provider: "github" | "linear" | "slack"): {
  missingVars: string[];
} {
  const prefix = provider.toUpperCase();
  const clientId = getConfig(`${prefix}_CLIENT_ID`);
  const clientSecret = getConfig(`${prefix}_CLIENT_SECRET`);
  const encryptionKey = getConfig("OAUTH_ENCRYPTION_KEY");
  const missingVars: string[] = [];
  if (!clientId) missingVars.push(`${prefix}_CLIENT_ID`);
  if (!clientSecret) missingVars.push(`${prefix}_CLIENT_SECRET`);
  if (!encryptionKey) missingVars.push("OAUTH_ENCRYPTION_KEY");
  return { missingVars };
}

/**
 * Popup response used when an OAuth login route cannot even redirect to the
 * provider because required env vars are missing. Structured postMessage lets
 * the parent render a ConnectErrorAlert with the list of missing vars.
 *
 * Shape matches closePopupWithError (status 400, 3s auto-close, no COOP headers)
 * with two additions: reason: "not-configured" and missingVars: string[].
 */
export function closePopupWithSetupError(
  provider: string,
  missingVars: string[]
): Response {
  const safeProvider = sanitizeForHtml(provider);
  const safeReason = "not-configured";
  const missingVarsJson = JSON.stringify(missingVars);
  const missingVarsDisplay = missingVars.join(", ");
  const html = `<!DOCTYPE html><html><head><title>OAuth Setup Incomplete</title></head><body>
<p>Setup incomplete. Missing: ${sanitizeForHtml(missingVarsDisplay)}. This window will close automatically — open Settings to continue setup.</p>
<script>
  (function () {
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'oauth-callback', provider: '${safeProvider}', success: false, reason: '${safeReason}', missingVars: ${missingVarsJson} },
          window.location.origin
        );
      }
    } catch (e) {}
    setTimeout(function () { window.close(); }, 3000);
  })();
</script></body></html>`;

  return new Response(html, {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
