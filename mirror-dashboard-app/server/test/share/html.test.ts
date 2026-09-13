import { test } from "node:test";
import assert from "node:assert/strict";
import { metaContent, pageTitle, readableText } from "../../src/services/share/html.js";

test("reads meta tags in either attribute order", () => {
  const html = `<meta property="og:title" content="Soup &amp; Bread"><meta content="https://img/x.jpg" property="og:image"><meta name="description" content="Warm.">`;
  assert.equal(metaContent(html, ["og:title"]), "Soup & Bread");
  assert.equal(metaContent(html, ["og:image"]), "https://img/x.jpg");
  assert.equal(metaContent(html, ["twitter:title", "description"]), "Warm.");
  assert.equal(metaContent(html, ["og:site_name"]), null);
});

test("reads the page title", () => {
  assert.equal(pageTitle("<title> Best Chili | Site </title>"), "Best Chili | Site");
  assert.equal(pageTitle("<p>no title</p>"), null);
});

test("keeps readable text and drops scripts, styles and navigation", () => {
  const html = `<html><head><style>p{}</style><script>var x = 1;</script></head><body><nav>Home About</nav>
    <h1>Chili</h1><p>Brown the beef.<br>Add beans &amp; tomatoes.</p><ul><li>1 lb beef</li></ul><footer>© Site</footer></body></html>`;
  const text = readableText(html);
  assert.match(text, /Chili/);
  assert.match(text, /Add beans & tomatoes\./);
  assert.match(text, /1 lb beef/);
  assert.doesNotMatch(text, /var x|Home About|© Site|p\{\}/);
});

test("caps readable text length", () => {
  assert.equal(readableText(`<p>${"a".repeat(50)}</p>`, 10).length, 10);
});
