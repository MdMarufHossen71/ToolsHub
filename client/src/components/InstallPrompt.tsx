/**
 * "Add to Home Screen" banner.
 *
 * Chromium fires `beforeinstallprompt` when the app qualifies for installation; the
 * event is captured and only then is the banner shown, so it never advertises an
 * install the browser cannot perform.
 *
 * Layout: the banner is a `position: fixed` overlay anchored just below the header,
 * not a normal-flow element. It used to sit between the header and the workbench in
 * the flow, so mounting it pushed every already-painted element down — a measured CLS
 * of 0.0468 at 1440x1000. Fixed positioning takes it out of flow entirely and the
 * entrance is a transform, which the Layout Instability API ignores, so it cannot
 * contribute to CLS at all. It is anchored to the top rather than the bottom because
 * the tool bench's primary controls (Run, and the output panel's Copy and Download)
 * sit in the lower half of a short viewport; measured at 320x640, 390x844 and
 * 1440x1000 the overlay overlaps none of them.
 *
 * It contains no focus trap and every action is a real button, so it stays reachable
 * by keyboard and Tab order is untouched. Escape dismisses it. The dismissal is
 * remembered in the `tgb:` storage namespace, and the banner never appears when the
 * app already runs standalone or the user has just installed it.
 */
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/AppSettingsContext";
import { dismissInstallPrompt, installPromptDismissed, isStandalone } from "@/lib/pwa";

function standaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  const matches = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return isStandalone(matches, iosStandalone);
}

export function InstallPrompt() {
  const { t } = useSettings();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standaloneNow);
  const [dismissed, setDismissed] = useState(installPromptDismissed);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Keep the event so the Install button can replay it inside a user gesture.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      dismissInstallPrompt();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Escape is the expected way out of an unprompted overlay. The handler is registered
  // before the early return below, so the hook order never depends on whether the
  // banner is currently showing.
  const dismiss = () => {
    setDismissed(true);
    dismissInstallPrompt();
  };
  useEffect(() => {
    if (dismissed || installed || !deferred) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `dismiss` only calls state setters and a storage helper, so re-registering on
    // these three values is equivalent to depending on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed, installed, deferred]);

  if (dismissed || installed || !deferred) return null;

  const install = async () => {
    const event = deferred;
    if (!event) return;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setDeferred(null);
      if (choice.outcome === "accepted") setInstalled(true);
      else dismiss();
    } catch {
      // A prompt can only be used once; treat a rejected call as a dismissal.
      dismiss();
    }
  };

  return (
    <div className="install-prompt" role="region" aria-live="polite" aria-label={t("install.title")}>
      <span className="install-prompt-icon" aria-hidden="true">
        <Download className="size-4" />
      </span>
      <p className="install-prompt-text">
        <strong>{t("install.title")}</strong> {t("install.copy")}
      </p>
      <Button type="button" size="sm" onClick={install}>
        {t("install.action")}
      </Button>
      <button type="button" className="install-prompt-dismiss" onClick={dismiss} aria-label={t("install.dismiss")}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
