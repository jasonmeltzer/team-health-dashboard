/**
 * Client-side OAuth popup helper.
 *
 * MUST be called synchronously inside a click handler — browsers block
 * window.open() when it is not invoked as a direct response to a user
 * gesture (research Pitfall 5).
 *
 * Listens for { type: 'oauth-callback', provider, success, accountName?, reason?, missingVars? }
 * postMessage envelopes from the popup (see Plan 04-02 oauth-helpers.ts and
 * Plan 04.1-02 closePopupWithSetupError).
 *
 * onError receives an optional third `detail` arg carrying missingVars when
 * the popup reports reason: 'not-configured'. Callers that ignore the arg
 * continue to work unchanged (backward compat).
 */

export type OAuthProvider = "github" | "linear" | "slack";

export interface OAuthErrorDetail {
  missingVars?: string[];
}

export function openOAuthPopup(
  provider: OAuthProvider,
  onSuccess: (provider: OAuthProvider, accountName: string | null) => void,
  onError: (provider: OAuthProvider, reason: string, detail?: OAuthErrorDetail) => void
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
      const reason = event.data.reason || "unknown";
      const detail: OAuthErrorDetail =
        reason === "not-configured" && Array.isArray(event.data.missingVars)
          ? { missingVars: event.data.missingVars as string[] }
          : {};
      onError(provider, reason, detail);
    }
  };

  window.addEventListener("message", handleMessage);

  const pollClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(pollClosed);
      window.removeEventListener("message", handleMessage);
    }
  }, 500);
}
