interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function";
}

/** Captured at startup because it fires long before anyone opens the menu. Null on a
 * browser that never fires it, which is the branch iOS always takes. */
let deferredPrompt: InstallPromptEvent | null = null;

export function initPwa(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chromium's mini-infobar: SELECT → Install app is the affordance.
    event.preventDefault();
    if (isInstallPromptEvent(event)) deferredPrompt = event;
  });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failed; the app still works without install.
      });
    });
  }
}

export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (event === null) return false;
  // Each event may only be prompted once, so it is spent either way.
  deferredPrompt = null;
  await event.prompt();
  return true;
}

const IOS_INSTALL = [
  "SAFARI HAS NO INSTALL BUTTON TO PRESS.",
  "TAP SHARE, THEN ADD TO HOME SCREEN.",
];

const BROWSER_INSTALL = [
  "THIS BROWSER IS NOT OFFERING AN INSTALL PROMPT RIGHT NOW.",
  "LOOK FOR INSTALL OR ADD TO HOME SCREEN IN ITS OWN MENU.",
];

function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function installInstructions(
  userAgent: string,
  maxTouchPoints: number,
): readonly string[] {
  return isIosDevice(userAgent, maxTouchPoints) ? IOS_INSTALL : BROWSER_INSTALL;
}
