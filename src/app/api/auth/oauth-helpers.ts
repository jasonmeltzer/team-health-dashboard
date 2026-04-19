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
