import { createRecipe, deleteRecipe } from "../recipes.js";
import { createTravelInspiration, deleteTravelInspiration } from "../travelInspirations.js";
import { classifyShare } from "./classify.js";
import { saveShareImage } from "./images.js";
import type { ShareDeps } from "./pipeline.js";
import { BROWSER_UA, safeFetch } from "./safeFetch.js";
import * as store from "./store.js";

export function createShareDeps(): ShareDeps {
  return {
    findDuplicate: store.findDuplicate,
    fetchPage: async (url) => {
      try {
        const result = await safeFetch(url, {
          timeoutMs: 8_000,
          maxBytes: 8 * 1024 * 1024,
          headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }
        });
        return { status: result.status, html: result.body.toString("utf8") };
      } catch {
        return null;
      }
    },
    classify: (input) => classifyShare(input),
    saveImage: (imageUrl) => saveShareImage(imageUrl),
    saveRecipe: async (recipe) => {
      const saved = await createRecipe(recipe);
      return { id: saved.id, title: saved.title };
    },
    saveTrip: async (trip) => {
      const saved = await createTravelInspiration(trip);
      return { id: saved.id, title: saved.title };
    },
    deleteItem: async (kind, id) => {
      if (kind === "recipe") await deleteRecipe(id);
      else await deleteTravelInspiration(id);
    },
    record: store.recordShare,
    update: store.updateShare,
    getShare: store.getShare,
    findShareByItem: store.findShareByItem
  };
}
