/**
 * Chromium runs with --kiosk, so there is no back button or address bar: a page
 * opened on top of the dashboard strands the wall display. DashboardApp's click
 * guard catches <a> links; this covers code that calls window.open instead.
 */

/** The absolute href if `url` leaves the dashboard's origin, otherwise null. */
export function externalHref(url: string, base: string): string | null {
  try {
    const parsed = new URL(url, base);
    return parsed.origin === new URL(base).origin ? null : parsed.href;
  } catch {
    return null;
  }
}

/** Routes window.open for outside pages to `onExternal`; returns a function that restores the original. */
export function guardWindowOpen(win: Pick<Window, "open" | "location">, onExternal: (href: string) => void): () => void {
  const original = win.open;
  win.open = (url?: string | URL, target?: string, features?: string) => {
    const external = url === undefined ? null : externalHref(String(url), win.location.href);
    if (external) {
      onExternal(external);
      return null;
    }
    return original.call(win, url, target, features);
  };
  return () => {
    win.open = original;
  };
}
