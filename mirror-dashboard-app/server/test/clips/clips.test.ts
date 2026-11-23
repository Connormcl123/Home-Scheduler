import { test } from "node:test";
import assert from "node:assert/strict";
import { isClipId, looksLike } from "../../src/services/clips.js";

test("clip ids are plain file stems, never a path", () => {
  assert.equal(isClipId("mb_The_Secret_Lives_S01E08_marked_1632"), true);
  for (const bad of ["../etc/passwd", "a/b", "a.mp4", "", "x".repeat(121)]) assert.equal(isClipId(bad), false, bad);
});

test("an upload must be the kind of file its route says", () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from("ftypisom"), Buffer.alloc(8)]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  assert.equal(looksLike("video", mp4), true);
  assert.equal(looksLike("poster", jpeg), true);
  assert.equal(looksLike("video", jpeg), false);
  assert.equal(looksLike("poster", Buffer.from("<svg onload=alert(1)>")), false);
});
