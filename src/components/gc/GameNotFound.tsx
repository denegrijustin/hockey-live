import type { CSSProperties } from "react";

// Inline styles: this notice lives in the main bundle, and the Game Center stylesheet is lazy.
const box: CSSProperties = {
  position: "fixed", left: "50%", bottom: "max(16px, env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 60,
  display: "flex", alignItems: "center", gap: 12, maxWidth: "calc(100vw - 32px)", padding: "10px 14px", border: "1px solid var(--line-3)",
  borderRadius: 10, background: "var(--surface-5)", color: "var(--text-5)", fontSize: "0.8125rem", boxShadow: "0 6px 24px #0006",
};
const button: CSSProperties = { minHeight: 44, padding: "6px 12px", border: "1px solid var(--line-3)", borderRadius: 8, background: "none", color: "var(--mint)", font: "inherit", cursor: "pointer" };

/** Polite, non-modal notice for a `?game=ID` link whose game is not in the loaded schedule. */
export function GameNotFound({ onClose }: { onClose: () => void }) {
  return (
    <div style={box} role="status" data-testid="gc-not-found">
      <span>Game not found. It is not in the loaded schedule.</span>
      <button type="button" style={button} onClick={onClose}>Dismiss</button>
    </div>
  );
}
