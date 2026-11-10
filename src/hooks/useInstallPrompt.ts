import { useCallback, useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export type InstallState = {
  /** Already running as an installed app: nothing to offer. */
  standalone: boolean;
  /** Chromium gave us a deferred install prompt, so an Install button can work. */
  canPrompt: boolean;
  /** iOS Safari never fires beforeinstallprompt; Add to Home Screen is manual. */
  ios: boolean;
  /** Ask the browser to show its install dialog. Only call from an explicit click. */
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export const isStandalone = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};
export const isIosSafari = (ua = typeof navigator === "undefined" ? "" : navigator.userAgent) =>
  /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);

/** Captures `beforeinstallprompt` and holds it until the person clicks Install. It never prompts by itself. */
export function useInstallPrompt(): InstallState {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    const onInstalled = () => { setEvent(null); setStandalone(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const install = useCallback(async () => {
    if (!event) return "unavailable" as const;
    await event.prompt();
    const { outcome } = await event.userChoice;
    setEvent(null); // a prompt event can be used once
    return outcome;
  }, [event]);
  return { standalone, canPrompt: !!event, ios: isIosSafari(), install };
}
