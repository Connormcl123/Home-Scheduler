import { execFile } from "node:child_process";

/**
 * Powers the kiosk's HDMI output down and back up with wlopm (DPMS), which
 * keeps the output in the layout so touches still reach the page and can wake
 * it. Off the Pi there is no compositor to ask, so the page's black cover is
 * all there is.
 */
export function setDisplayPower(on: boolean): Promise<boolean> {
  if (process.platform !== "linux") return Promise.resolve(false);
  const env = {
    ...process.env,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? "wayland-0"
  };
  return new Promise((resolve) => {
    execFile("wlopm", [on ? "--on" : "--off", "*"], { env, timeout: 5000 }, (error) => resolve(!error));
  });
}
