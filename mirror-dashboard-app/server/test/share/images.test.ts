import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveShareImage } from "../../src/services/share/images.js";

const dir = mkdtempSync(path.join(tmpdir(), "share-images-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const resolve = async () => ["93.184.216.34"];
const serve = (body: BodyInit, type: string) => (async () => new Response(body, { status: 200, headers: { "content-type": type } })) as typeof fetch;

test("stores a real image and returns its /media path", async () => {
  const saved = await saveShareImage("https://cdn.example/cover.jpg", { dir, resolve, fetchImpl: serve(new Uint8Array([255, 216, 255, 1]), "image/jpeg") });
  assert.match(saved ?? "", /^\/media\/[0-9a-f]{24}\.jpg$/);
  const file = path.join(dir, path.basename(saved!));
  assert.ok(existsSync(file));
  assert.deepEqual([...readFileSync(file)], [255, 216, 255, 1]);
});

test("refuses pages, SVG, oversized files, private hosts and missing links", async () => {
  assert.equal(await saveShareImage("https://cdn.example/x", { dir, resolve, fetchImpl: serve("<html>", "text/html") }), null);
  assert.equal(await saveShareImage("https://cdn.example/x.svg", { dir, resolve, fetchImpl: serve("<svg/>", "image/svg+xml") }), null);
  assert.equal(await saveShareImage("https://cdn.example/huge.png", { dir, resolve, fetchImpl: serve(new Uint8Array(5 * 1024 * 1024 + 1), "image/png") }), null);
  assert.equal(await saveShareImage("https://nas.local/x.jpg", { dir, resolve: async () => ["192.168.1.20"], fetchImpl: serve("x", "image/jpeg") }), null);
  assert.equal(await saveShareImage(null, { dir }), null);
});
