import { test } from "node:test";
import assert from "node:assert/strict";
import { instagramEmbedUrl, instagramPost, tidyUrl } from "../../src/services/share/tidyUrl.js";

test("strips Instagram share tracking from a real copied link", () => {
  assert.equal(
    tidyUrl("https://www.instagram.com/reel/DOmW6LTkqcq/?utm_source=ig_web_button_share_sheet&stkn=MzRlODBiNWFlZA=="),
    "https://www.instagram.com/reel/DOmW6LTkqcq"
  );
});

test("keeps meaningful query parameters and drops fragments", () => {
  assert.equal(tidyUrl("HTTP://Example.COM/recipe?id=5&utm_medium=x&fbclid=abc#comments"), "https://example.com/recipe?id=5");
});

test("same page shared twice tidies to the same string", () => {
  assert.equal(tidyUrl("https://site.com/soup/?igsh=1"), tidyUrl("https://site.com/soup"));
});

test("rejects anything that is not a web link", () => {
  assert.equal(tidyUrl("javascript:alert(1)"), null);
  assert.equal(tidyUrl("ftp://files.example.com/a"), null);
  assert.equal(tidyUrl("not a link"), null);
});

test("detects Instagram posts, reels and tv links", () => {
  assert.deepEqual(instagramPost("https://www.instagram.com/reel/DOmW6LTkqcq"), { kind: "reel", code: "DOmW6LTkqcq" });
  assert.deepEqual(instagramPost("https://instagram.com/reels/ABC_12-x/"), { kind: "reel", code: "ABC_12-x" });
  assert.deepEqual(instagramPost("https://www.instagram.com/p/Cx1/"), { kind: "p", code: "Cx1" });
  assert.equal(instagramPost("https://www.instagram.com/heresyourbite/"), null);
  assert.equal(instagramPost("https://example.com/reel/abc"), null);
});

test("builds the public embed URL", () => {
  assert.equal(instagramEmbedUrl({ kind: "reel", code: "DOmW6LTkqcq" }), "https://www.instagram.com/reel/DOmW6LTkqcq/embed/captioned/");
});
