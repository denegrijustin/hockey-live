import { useState } from "react";
import { setPrefs, usePrefs } from "../../lib/prefs.ts";
import "./alerts.css";

type Alerts = ReturnType<typeof usePrefs>["alerts"];
const CATS: [keyof Alerts, string, string][] = [
  ["start", "Puck drop", "When a game starts"],
  ["period", "Period breaks", "End and start of each period, overtime and shootout"],
  ["final", "Finals", "Final score, tagged OT or SO"],
  ["schedule", "Schedule changes", "Postponed, canceled or suspended games"],
];
const SCOPES: [keyof Alerts["scope"], string, string][] = [
  ["teams", "My favorite teams", "Games involving a team you favorited"],
  ["saved", "Saved games", "Games you saved"],
  ["players", "Followed players' teams", "Only a 'plays tonight' note when the team's game starts"],
];

type Perm = "granted" | "denied" | "default" | "unsupported";
const perm = (): Perm => (typeof Notification === "undefined" ? "unsupported" : (Notification.permission as Perm));

/** Alert preferences (rendered inside Settings > Notifications). Saved on this device; nothing fires until the master switch is on. */
export function AlertSettings() {
  const a = usePrefs().alerts;
  const [permission, setPermission] = useState<Perm>(perm);
  const set = (patch: Partial<Alerts>) => setPrefs((p) => ({ ...p, alerts: { ...p.alerts, ...patch } }));
  const setScope = (k: keyof Alerts["scope"], v: boolean) => set({ scope: { ...a.scope, [k]: v } });
  const ask = async () => {
    try { setPermission((await Notification.requestPermission()) as Perm); } catch { setPermission(perm()); }
  };
  const row = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className="alert-row" key={id}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><strong>{label}</strong><small>{hint}</small></span>
    </label>
  );
  const status = permission === "granted" ? "Device notifications are allowed for this site."
    : permission === "denied" ? "Device notifications are blocked in your browser settings for this site. Iceboard cannot change that; allow them there if you want them."
    : permission === "unsupported" ? "This browser does not support device notifications. In-app alerts still work."
    : "Device notifications are not enabled yet.";
  return (
    <div className="alert-settings" data-testid="alert-settings">
      {row("enabled", "Game alerts", "Off by default. Nothing is shown until you turn this on.", a.enabled, (v) => set({ enabled: v }))}
      <fieldset disabled={!a.enabled}>
        <legend>Alert me about</legend>
        {CATS.map(([k, l, h]) => row(k, l, h, a[k] as boolean, (v) => set({ [k]: v } as Partial<Alerts>)))}
      </fieldset>
      <fieldset disabled={!a.enabled}>
        <legend>For</legend>
        {SCOPES.map(([k, l, h]) => row(`s-${k}`, l, h, a.scope[k], (v) => setScope(k, v)))}
      </fieldset>
      <div className="alert-device">
        <p data-testid="alert-permission">{status}</p>
        {permission === "default" && <button type="button" className="alert-link" onClick={ask}>Enable device notifications</button>}
      </div>
      <p className="alert-note">Alerts appear while Iceboard is open. Background push is not available.</p>
    </div>
  );
}
