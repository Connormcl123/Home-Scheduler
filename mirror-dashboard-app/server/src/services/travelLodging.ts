import type { TravelAddOn } from "@mirror-dashboard/shared";
import type { TravelPlaceResearch } from "./travelPlaces.js";

export type LodgingSource = "hotel" | "airbnb" | "vacation_rental";

export interface LodgingOption {
  id: string;
  source: LodgingSource;
  title: string;
  description: string;
  estimatedLow: number | null;
  estimatedHigh: number | null;
  priceLabel: string;
  unit: string;
  bookingUrl: string | null;
  confidence: TravelAddOn["confidence"];
}

export function buildLodgingOptions(destination: string, research?: TravelPlaceResearch): LodgingOption[] {
  const normalizedDestination = destination.trim() || "Saved Destination";
  const hotelOptions = (research?.lodging || []).slice(0, 4).map((place, index): LodgingOption => {
    const [low, high] = estimateHotelNightlyRange(place.priceLevel);
    const rating = place.rating ? ` Rated ${place.rating}/5${place.userRatingCount ? ` from ${place.userRatingCount} reviews` : ""}.` : "";
    const address = place.address ? ` ${place.address}.` : "";
    return {
      id: `hotel-${slugify(place.name)}-${index + 1}`,
      source: "hotel",
      title: place.name,
      description: `Hotel or inn option near ${normalizedDestination}.${address}${rating} Confirm live room availability, taxes, fees, parking, and cancellation before booking.`,
      estimatedLow: low,
      estimatedHigh: high,
      priceLabel: priceLevelToLabel(place.priceLevel) || formatRange(low, high),
      unit: "per night",
      bookingUrl: place.websiteUri || place.googleMapsUri || googleHotelsUrl(`${place.name} ${normalizedDestination}`),
      confidence: research?.provider === "google-places" ? "researched" : "estimated"
    };
  });

  return uniqueLodgingOptions([
    ...hotelOptions,
    {
      id: `airbnb-${slugify(normalizedDestination)}`,
      source: "airbnb",
      title: `Airbnb homes in ${normalizedDestination}`,
      description: "Compare full homes, apartments, and family-friendly rentals. Watch cleaning fees, service fees, parking notes, review recency, and exact distance to the itinerary stops.",
      estimatedLow: null,
      estimatedHigh: null,
      priceLabel: "Live Airbnb search",
      unit: "per stay",
      bookingUrl: airbnbSearchUrl(normalizedDestination),
      confidence: "needs_quote"
    },
    {
      id: `vacation-rental-${slugify(normalizedDestination)}`,
      source: "vacation_rental",
      title: `Vacation rentals near ${normalizedDestination}`,
      description: "Use this as the wider rental comparison lane for Vrbo-style homes, cottages, condos, and family stays when hotel rooms are too tight or expensive.",
      estimatedLow: null,
      estimatedHigh: null,
      priceLabel: "Compare rentals",
      unit: "per stay",
      bookingUrl: vacationRentalSearchUrl(normalizedDestination),
      confidence: "needs_quote"
    },
    {
      id: `google-hotels-${slugify(normalizedDestination)}`,
      source: "hotel",
      title: `Hotel map for ${normalizedDestination}`,
      description: "Open the hotel map when you are ready to compare live nightly rates, neighborhood position, guest rating, parking, and cancellation rules.",
      estimatedLow: null,
      estimatedHigh: null,
      priceLabel: "Live hotel search",
      unit: "per night",
      bookingUrl: googleHotelsUrl(normalizedDestination),
      confidence: "needs_quote"
    }
  ]).slice(0, 7);
}

export function lodgingOptionToAddOn(option: LodgingOption): TravelAddOn {
  return {
    id: option.id,
    category: "stays",
    title: option.title,
    description: option.description,
    provider: option.source,
    bookingUrl: option.bookingUrl,
    estimatedLow: option.estimatedLow,
    estimatedHigh: option.estimatedHigh,
    priceLabel: option.priceLabel,
    unit: option.unit,
    confidence: option.confidence
  };
}

export function mergeStayAddOns(addOns: TravelAddOn[], lodgingOptions: LodgingOption[]): TravelAddOn[] {
  const lodgingAddOns = lodgingOptions.map(lodgingOptionToAddOn);
  const nonStayAddOns = addOns.filter((item) => item.category !== "stays");
  const generatedStayAddOns = addOns.filter((item) => item.category === "stays");
  return [
    ...uniqueTravelAddOns([...lodgingAddOns, ...generatedStayAddOns]).slice(0, 8),
    ...nonStayAddOns
  ];
}

function uniqueLodgingOptions(options: LodgingOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.source}:${option.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueTravelAddOns(options: TravelAddOn[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.provider || option.category}:${option.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function estimateHotelNightlyRange(priceLevel?: string): [number | null, number | null] {
  const ranges: Record<string, [number, number]> = {
    PRICE_LEVEL_INEXPENSIVE: [110, 210],
    PRICE_LEVEL_MODERATE: [170, 340],
    PRICE_LEVEL_EXPENSIVE: [280, 560],
    PRICE_LEVEL_VERY_EXPENSIVE: [450, 900]
  };
  return priceLevel && ranges[priceLevel] ? ranges[priceLevel] : [160, 380];
}

function priceLevelToLabel(priceLevel?: string) {
  const labels: Record<string, string> = {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$110-$210",
    PRICE_LEVEL_MODERATE: "$170-$340",
    PRICE_LEVEL_EXPENSIVE: "$280-$560",
    PRICE_LEVEL_VERY_EXPENSIVE: "$450-$900"
  };
  return priceLevel ? labels[priceLevel] : "";
}

function formatRange(low: number | null, high: number | null) {
  if (low === null && high === null) return "Needs quote";
  if (low !== null && high !== null) return `$${low}-$${high}`;
  return `$${low ?? high}`;
}

function airbnbSearchUrl(destination: string) {
  return `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes`;
}

function vacationRentalSearchUrl(destination: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${destination} vacation rentals family stay`)}`;
}

function googleHotelsUrl(destination: string) {
  return `https://www.google.com/travel/hotels/${encodeURIComponent(destination)}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "lodging";
}
