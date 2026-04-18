/**
 * Client-side OAuth popup helper.
 *
 * MUST be called synchronously inside a click handler — browsers block
 * window.open() when it is not invoked as a direct response to a user
 * gesture (research Pitfall 5).
 *
 * Listens for { type: 'oauth-callback', provider, success, accountName?, reason? }
 * postMessage envelopes from the popup (see Plan 04-02 oauth-helpers.ts).
 */

export type OAuthProvider = "github" | "linear" | "slack";

export function openOAuthPopup(
  provider: OAuthProvider,
  onSuccess: (provider: OAuthProvider, accountName: string | null) => void,
  onError: (provider: OAuthProvider, reason: string) => void
) {
  const popup = window.open(
    `/api/auth/login/${provider}`,
    "oauth-popup",
    "width=600,height=700,scrollbars=yes"
  );

  if (!popup) {
    onError(provider, "popup_blocked");
    return;
  }

  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "oauth-callback") return;
    if (event.data?.provider !== provider) return;

    window.removeEventListener("message", handleMessage);
    clearInterval(pollClosed);

    if (event.data.success) {
      onSuccess(provider, event.data.accountName ?? null);
    } else {
      onError(provider, event.data.reason || "unknown");
    }
  };

  window.addEventListener("message", handleMessage);

  // Cleanup listener if user closes popup without completing OAuth
  const pollClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(pollClosed);
      window.removeEventListener("message", handleMessage);
    }
  }, 500);
}
