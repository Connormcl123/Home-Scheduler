import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBase64Url, imageUrlsFrom, parseGmailMessage } from "../../src/services/gmail/mime.js";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");
const LONG_PLAIN = `Your package with Kids sneakers has shipped and arrives Thursday. ${"Track it in Your Orders. ".repeat(10)}`;

test("base64url bodies decode, including - and _", () => {
  const text = "Ünïcode ✓ ??>>";
  assert.equal(decodeBase64Url(b64(text)), text);
});

test("plain text is used when it says enough, and pictures come from the HTML", () => {
  const email = parseGmailMessage({
    id: "m1",
    internalDate: String(Date.parse("2026-09-15T12:00:00Z")),
    payload: {
      mimeType: "multipart/mixed",
      headers: [{ name: "From", value: "Amazon <shipment-tracking@amazon.com>" }, { name: "Subject", value: "Shipped: Kids sneakers" }],
      parts: [{
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64(LONG_PLAIN) } },
          { mimeType: "text/html", body: { data: b64('<p>Hi</p><img src="https://m.media-amazon.com/shoe.jpg" width="120"><img src="https://pixel.example/open.gif" width="1" height="1">') } }
        ]
      }]
    }
  });
  assert.equal(email.id, "m1");
  assert.equal(email.from, "Amazon <shipment-tracking@amazon.com>");
  assert.equal(email.subject, "Shipped: Kids sneakers");
  assert.equal(email.receivedAt, "2026-09-15T12:00:00.000Z");
  assert.equal(email.text, LONG_PLAIN.trim());
  assert.deepEqual(email.imageUrls, ["https://m.media-amazon.com/shoe.jpg"]);
});

test("a short plain part gives way to the HTML's text", () => {
  const email = parseGmailMessage({
    id: "m2",
    payload: {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("View this email in your browser.") } },
        { mimeType: "text/html", body: { data: b64("<div>Arriving today</div><div>Kids sneakers</div>") } }
      ]
    }
  });
  assert.equal(email.text, "Arriving today\nKids sneakers");
});

test("an HTML-only message is read and the text is capped", () => {
  const email = parseGmailMessage({ id: "m3", payload: { mimeType: "text/html", body: { data: b64(`<p>${"word ".repeat(5000)}</p>`) } } }, 100);
  assert.equal(email.text.length, 100);
  assert.equal(email.subject, "");
});

test("image lists skip http, tracking pixels and repeats, and stop at the limit", () => {
  const html = [
    '<img src="http://plain.example/a.jpg">',
    '<img src="https://a.example/1.jpg">',
    '<img width="1" src="https://a.example/pixel.gif">',
    "<img src='https://a.example/1.jpg'>",
    '<IMG SRC="https://a.example/2.jpg?x=1&amp;y=2">',
    '<img src="https://a.example/3.jpg">'
  ].join("");
  assert.deepEqual(imageUrlsFrom(html, 2), ["https://a.example/1.jpg", "https://a.example/2.jpg?x=1&y=2"]);
});
