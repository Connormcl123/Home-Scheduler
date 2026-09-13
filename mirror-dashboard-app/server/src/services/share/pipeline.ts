import { createHash } from "node:crypto";
import type { RecipeIngredient, ShareKind, ShareResult } from "@mirror-dashboard/shared";
import { ClassifyUnavailableError, type ShareExtraction } from "./classify.js";
import { metaContent, readableText } from "./html.js";
import { splitIngredient } from "./ingredients.js";
import { parseInstagramEmbed, type InstagramEmbed } from "./instagram.js";
import { findJsonLdRecipe, type ParsedRecipe } from "./recipeJsonLd.js";
import type { ShareRecord } from "./store.js";
import { instagramEmbedUrl, instagramPost, tidyUrl } from "./tidyUrl.js";

export const MESSAGES = {
  blocked: "That site blocked the Pi. Share it from Safari so your phone sends the page.",
  hidden: "Instagram hid that post. Copy the caption and share the text instead.",
  unavailable: "Couldn't read that one right now. It's in Recent shares to retry.",
  unrecognized: "Couldn't find a recipe or trip idea in that post",
  notMovable: "Only things shared from your phone can be moved.",
  gone: "That share is no longer in the history."
};

export type ShareInput = { url: string | null; html: string | null; text: string | null };

export type NewRecipe = {
  title: string; summary: string | null; servings: number | null; totalMinutes: number | null; tags: string[];
  ingredients: RecipeIngredient[]; steps: string[]; imageUrl: string | null;
  source: "instagram" | "web"; sourceUrl: string | null; sourceName: string | null;
};

export type NewTrip = {
  url: string; title: string; location: string | null; notes: string | null; tags: string[];
  thumbnailUrl: string | null; source: "instagram" | "web";
};

export type ShareDeps = {
  findDuplicate(url: string): Promise<{ kind: ShareKind; id: number; title: string } | null>;
  /** null when the page could not be fetched at all (blocked host, timeout, network). */
  fetchPage(url: string): Promise<{ status: number; html: string } | null>;
  classify(input: { url: string | null; text: string; forceKind?: ShareKind }): Promise<ShareExtraction>;
  /** Never throws; null when there is no usable photo. */
  saveImage(imageUrl: string | null): Promise<string | null>;
  saveRecipe(recipe: NewRecipe): Promise<{ id: number; title: string }>;
  saveTrip(trip: NewTrip): Promise<{ id: number; title: string }>;
  deleteItem(kind: ShareKind, id: number): Promise<void>;
  record(entry: ShareRecord): Promise<number>;
  update(id: number, entry: ShareRecord): Promise<void>;
  getShare(id: number): Promise<(ShareRecord & { id: number }) | null>;
  findShareByItem(kind: ShareKind, itemId: number): Promise<(ShareRecord & { id: number }) | null>;
};

type Gathered = {
  url: string | null;
  text: string;
  jsonLd: ParsedRecipe | null;
  imageCandidate: string | null;
  sourceName: string | null;
  problem: "blocked" | "hidden" | null;
  fromInstagram: boolean;
};

type Outcome = Omit<ShareRecord, "url">;

const label = (kind: ShareKind) => (kind === "recipe" ? "Recipes" : "Trips");

function hostName(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function failed(message: string, shareId: number | null = null): ShareResult {
  return { status: "failed", kind: null, id: null, title: null, message, shareId, imageUrl: null };
}

function toResult(entry: Outcome, shareId: number): ShareResult {
  return { status: entry.status, kind: entry.kind, id: entry.itemId, title: entry.title, message: entry.message, shareId, imageUrl: entry.imageUrl };
}

/** Get the words to read, in the order: the page the phone sent, Instagram's embed page, the Pi's own fetch, the shared text. */
async function gather(input: ShareInput, url: string | null, deps: ShareDeps): Promise<Gathered> {
  const post = url ? instagramPost(url) : null;
  let html = input.html && input.html.length > 200 ? input.html : null;
  let embed: InstagramEmbed | null = null;
  let problem: Gathered["problem"] = null;

  if (post) {
    const page = await deps.fetchPage(instagramEmbedUrl(post));
    embed = page && page.status === 200 ? parseInstagramEmbed(page.html) : null;
    if (!embed && !html) problem = "hidden";
  } else if (url && !html) {
    const page = await deps.fetchPage(url);
    if (page && page.status === 200) html = page.html;
    else problem = "blocked";
  }

  const jsonLd = html ? findJsonLdRecipe(html) : null;
  // A phone-sent Instagram page only has the caption in its preview tag.
  const pageText = embed ? embed.caption : html ? (post ? metaContent(html, ["og:description"]) ?? "" : readableText(html)) : "";
  const shared = input.text?.trim() ?? "";
  const text = [pageText, shared && shared !== pageText ? shared : ""].filter(Boolean).join("\n\n").slice(0, 20000);

  return {
    url,
    text,
    jsonLd,
    imageCandidate: jsonLd?.imageUrl ?? embed?.imageUrl ?? (html ? metaContent(html, ["og:image", "twitter:image"]) : null),
    sourceName: jsonLd?.author ?? (embed?.author ? `${embed.author} on Instagram` : null) ?? (html ? metaContent(html, ["og:site_name"]) : null) ?? hostName(url),
    problem: text || jsonLd ? null : problem,
    fromInstagram: Boolean(post)
  };
}

function fromJsonLd(recipe: ParsedRecipe): ShareExtraction {
  return {
    kind: "recipe", title: recipe.title, summary: recipe.summary, sourceName: recipe.author,
    servings: recipe.servings, totalMinutes: recipe.totalMinutes, tags: recipe.tags,
    ingredients: recipe.ingredientLines.map(splitIngredient), steps: recipe.steps
  };
}

/** Save the extraction where it belongs and describe the result for the share history. */
async function outcome(extraction: ShareExtraction, gathered: Gathered, imageUrl: string | null, deps: ShareDeps): Promise<Outcome> {
  if (extraction.kind === "neither") {
    return { kind: null, status: "unrecognized", itemId: null, title: extraction.title, message: MESSAGES.unrecognized, content: gathered.text, imageUrl: null };
  }
  const source = gathered.fromInstagram ? "instagram" : "web";
  const sourceName = extraction.sourceName ?? gathered.sourceName;
  const saved = extraction.kind === "recipe"
    ? await deps.saveRecipe({
        title: extraction.title, summary: extraction.summary, servings: extraction.servings, totalMinutes: extraction.totalMinutes,
        tags: extraction.tags, ingredients: extraction.ingredients, steps: extraction.steps, imageUrl, source, sourceUrl: gathered.url, sourceName
      })
    : await deps.saveTrip({
        // Trip ideas need a unique link; shared text gets a stable stand-in.
        url: gathered.url ?? `shared-text:${createHash("sha1").update(gathered.text).digest("hex").slice(0, 16)}`,
        title: extraction.title, location: extraction.location, notes: extraction.notes ?? extraction.summary,
        tags: extraction.tags, thumbnailUrl: imageUrl, source
      });
  return {
    kind: extraction.kind, status: "saved", itemId: saved.id, title: saved.title,
    message: `Saved to ${label(extraction.kind)}: ${saved.title}`, content: gathered.text, imageUrl
  };
}

export async function handleShare(input: ShareInput, deps: ShareDeps): Promise<ShareResult> {
  const url = input.url ? tidyUrl(input.url) : null;
  const finish = async (entry: Outcome) => toResult(entry, await deps.record({ url, ...entry }));

  if (url) {
    const duplicate = await deps.findDuplicate(url);
    if (duplicate) {
      return finish({ kind: duplicate.kind, status: "duplicate", itemId: duplicate.id, title: duplicate.title, message: `Already in ${label(duplicate.kind)}: ${duplicate.title}`, content: null, imageUrl: null });
    }
  }

  const gathered = await gather(input, url, deps);
  if (gathered.problem) return finish({ kind: null, status: "failed", itemId: null, title: null, message: MESSAGES[gathered.problem], content: null, imageUrl: null });
  if (!gathered.text && !gathered.jsonLd) return finish({ kind: null, status: "unrecognized", itemId: null, title: null, message: MESSAGES.unrecognized, content: null, imageUrl: null });

  // The photo downloads while Claude reads, so a share fits in about 20 seconds.
  const image = deps.saveImage(gathered.imageCandidate);
  let extraction: ShareExtraction;
  if (gathered.jsonLd) {
    extraction = fromJsonLd(gathered.jsonLd);
  } else {
    try {
      extraction = await deps.classify({ url, text: gathered.text });
    } catch (error) {
      if (!(error instanceof ClassifyUnavailableError)) throw error;
      return finish({ kind: null, status: "failed", itemId: null, title: null, message: MESSAGES.unavailable, content: gathered.text, imageUrl: await image });
    }
  }
  return finish(await outcome(extraction, gathered, await image, deps));
}

function storedGathered(share: ShareRecord): Gathered {
  return {
    url: share.url, text: share.content ?? "", jsonLd: null, imageCandidate: null,
    sourceName: hostName(share.url), problem: null, fromInstagram: Boolean(share.url && instagramPost(share.url))
  };
}

/** Re-read a share that failed because Claude was unavailable. */
export async function retryShare(id: number, deps: ShareDeps): Promise<ShareResult> {
  const share = await deps.getShare(id);
  if (!share) return failed(MESSAGES.gone);
  if (share.status !== "failed" || !share.content) return toResult(share, share.id);
  let extraction: ShareExtraction;
  try {
    extraction = await deps.classify({ url: share.url, text: share.content });
  } catch (error) {
    if (error instanceof ClassifyUnavailableError) return toResult(share, share.id);
    throw error;
  }
  const entry = await outcome(extraction, storedGathered(share), share.imageUrl, deps);
  await deps.update(share.id, { url: share.url, ...entry });
  return toResult(entry, share.id);
}

/** Fix a wrong guess: read the share again as the other kind, save it there, then remove the old item. */
export async function moveSharedItem(from: ShareKind, itemId: number, to: ShareKind, deps: ShareDeps): Promise<ShareResult> {
  const share = await deps.findShareByItem(from, itemId);
  if (!share || !share.content) return failed(MESSAGES.notMovable);
  if (from === to) return toResult(share, share.id);
  let extraction: ShareExtraction;
  try {
    extraction = await deps.classify({ url: share.url, text: share.content, forceKind: to });
  } catch (error) {
    if (error instanceof ClassifyUnavailableError) return failed(MESSAGES.unavailable, share.id);
    throw error;
  }
  if (extraction.kind !== to) return failed(`Couldn't read that as a ${to === "recipe" ? "recipe" : "trip idea"}.`, share.id);
  // Save the new item before deleting the old one, so a failure never loses both.
  const entry = await outcome(extraction, storedGathered(share), share.imageUrl, deps);
  await deps.deleteItem(from, itemId);
  await deps.update(share.id, { url: share.url, ...entry });
  return toResult(entry, share.id);
}
