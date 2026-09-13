import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstagramEmbed } from "../../src/services/share/instagram.js";

const EMBED = `<html><body><div class="Embed">
  <img class="EmbeddedMediaImage" alt="" src="https://scontent.cdninstagram.com/v/cover.jpg?stp=1&amp;oh=abc" />
  <div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/heresyourbite/">heresyourbite</a> <br /><br />Creamy Chicken Noodle Soup with Potatoes &#x1f963;<br /><br />Inspired by &#064;eatwithalyssa<br /><br />2 tbsp butter<br />2 chicken breasts<br />6 cups chicken broth<br /><div class="CaptionComments"></div></div>
</div></body></html>`;

test("reads the caption, author and cover image", () => {
  const embed = parseInstagramEmbed(EMBED);
  assert.ok(embed);
  assert.equal(embed.author, "heresyourbite");
  assert.equal(embed.imageUrl, "https://scontent.cdninstagram.com/v/cover.jpg?stp=1&oh=abc");
  assert.match(embed.caption, /^Creamy Chicken Noodle Soup with Potatoes 🥣/);
  assert.match(embed.caption, /Inspired by @eatwithalyssa/);
  assert.match(embed.caption, /2 tbsp butter\n2 chicken breasts\n6 cups chicken broth/);
  assert.doesNotMatch(embed.caption, /^heresyourbite/);
});

test("returns null when there is no caption", () => {
  assert.equal(parseInstagramEmbed("<html><body>Log in to see this post</body></html>"), null);
});
