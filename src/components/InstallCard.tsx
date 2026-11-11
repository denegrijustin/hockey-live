import { useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import "../install.css";

/** Install affordance for Settings > Application. Hidden when already installed; never prompts on its own. */
export function InstallCard() {
  const { standalone, canPrompt, ios, install } = useInstallPrompt();
  const [note, setNote] = useState("");
  if (standalone) return null;
  return (
    <div className="install-card" data-testid="install-card">
      <div>
        <strong>Install Iceboard</strong>
        <p>
          {canPrompt
            ? "Add Iceboard to your device for a full-screen app that opens even with no signal."
            : ios
              ? "On iPhone and iPad: tap the Share button in Safari, then choose Add to Home Screen."
              : "Your browser offers install from its menu (Install app, or Add to Home screen) when it is available."}
        </p>
        {note && <p role="status">{note}</p>}
      </div>
      {canPrompt && (
        <button
          type="button"
          onClick={async () => {
            const r = await install();
            setNote(r === "accepted" ? "Installing…" : "");
          }}
        >
          Install app
        </button>
      )}
    </div>
  );
}
export default InstallCard;
