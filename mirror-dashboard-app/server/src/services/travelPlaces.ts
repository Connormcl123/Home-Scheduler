import { config } from "../config.js";

export type TravelPlace = {
  name: string;
  address?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  types: string[];
};

export type TravelPlaceResearch = {
  provider: "google-places" | "none";
  destination: string;
  restaurants: TravelPlace[];
  activities: TravelPlace[];
  lodging: TravelPlace[];
};

type GooglePlace = {
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  types?: string[];
};

export async function researchTravelPlaces(destination: string): Promise<TravelPlaceResearch> {
  if (!config.google.mapsApiKey || !destination.trim()) {
    return emptyResearch(destination);
  }

  const [restaurants, activities, lodging] = await Promise.all([
    searchPlaces(`best restaurants in ${destination}`, 5),
    searchPlaces(`top activities and attractions in ${destination}`, 6),
    searchPlaces(`best hotels inns places to stay in ${destination}`, 5)
  ]);

  return {
    provider: "google-places",
    destination,
    restaurants,
    activities,
    lodging
  };
}

function emptyResearch(destination: string): TravelPlaceResearch {
  return {
    provider: "none",
    destination,
    restaurants: [],
    activities: [],
    lodging: []
  };
}

async function searchPlaces(textQuery: string, maxResultCount: number): Promise<TravelPlace[]> {
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.google.mapsApiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.googleMapsUri,places.types"
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount,
        languageCode: "en"
      })
    });

    if (!response.ok) {
      console.warn(`Google Places search failed for "${textQuery}": ${response.status}`);
      return [];
    }

    const payload = await response.json() as { places?: GooglePlace[] };
    return (payload.places || []).map(toTravelPlace).filter((place) => Boolean(place.name));
  } catch (error) {
    console.warn(`Google Places search unavailable for "${textQuery}".`, error);
    return [];
  }
}

function toTravelPlace(place: GooglePlace): TravelPlace {
  return {
    name: place.displayName?.text || "",
    address: place.formattedAddress,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    priceLevel: place.priceLevel,
    websiteUri: place.websiteUri,
    googleMapsUri: place.googleMapsUri,
    types: place.types || []
  };
}
