import { test } from "node:test";
import assert from "node:assert/strict";
import { externalHref, guardWindowOpen } from "../src/kioskGuard";

const base = "http://192.168.1.185:4174/";

test("recognises pages outside the dashboard", () => {
  assert.equal(externalHref("https://www.instagram.com/reel/DaDIo34xwDj", base), "https://www.instagram.com/reel/DaDIo34xwDj");
  assert.equal(externalHref("/share/grocery", base), null);
  assert.equal(externalHref("http://192.168.1.185:4174/media/a.jpg", base), null);
});

test("window.open to an outside page shows the dialog instead of opening", () => {
  const opened: unknown[][] = [];
  const shown: string[] = [];
  const win = { location: { href: base }, open: (...args: unknown[]) => { opened.push(args); return "window"; } };
  const original = win.open;
  const restore = guardWindowOpen(win as never, (href) => shown.push(href));

  assert.equal(win.open("https://www.instagram.com/reel/x", "_blank", "noopener,noreferrer"), null);
  assert.deepEqual(shown, ["https://www.instagram.com/reel/x"]);
  assert.equal(opened.length, 0);

  assert.equal(win.open("/share/grocery"), "window");
  assert.equal(opened.length, 1);

  restore();
  assert.equal(win.open, original);
});
