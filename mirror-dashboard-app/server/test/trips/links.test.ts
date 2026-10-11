import { test } from "node:test";
import assert from "node:assert/strict";
import type { TripArrangements } from "@mirror-dashboard/shared";
import { flightSearchUrl, hotelSearchUrl, nightsFrom, stayLink, tripTotals, tripWindow } from "../../src/services/trips/links.js";

const travelers = { adults: 2, children: 2 };
const now = new Date(2026, 8, 22, 9);

test("trip length in words becomes nights", () => {
  assert.equal(nightsFrom("3 to 4 days"), 3);
  assert.equal(nightsFrom("a week"), 7);
  assert.equal(nightsFrom("two weeks"), 14);
  assert.equal(nightsFrom(null), 4);
});

test("the window lands on a Friday, at least four weeks out, in a month that suits the place", () => {
  const november = tripWindow({ bestMonths: "September to November", tripLength: "3 to 4 days", now });
  assert.equal(new Date(`${november.startDate}T12:00:00`).getDay(), 5);
  assert.ok(november.startDate >= "2026-10-20", `${november.startDate} is at least four weeks out`);
  assert.equal(november.nights, 3);
  // A month already past this year rolls to next year.
  const march = tripWindow({ bestMonths: "March", tripLength: "a week", now });
  assert.match(march.startDate, /^2027-03-/);
  assert.equal(march.nights, 7);
  // Shifting a week moves both ends.
  const later = tripWindow({ bestMonths: "September to November", tripLength: "3 to 4 days", now, weekShift: 1 });
  assert.equal(new Date(later.startDate).getTime() - new Date(november.startDate).getTime(), 7 * 86_400_000);
});

test("booking links carry the dates, the airports and the party", () => {
  const flights = flightSearchUrl({ origin: "PBI", destination: "Savannah", startDate: "2026-11-06", endDate: "2026-11-09", travelers });
  assert.ok(flights.startsWith("https://www.google.com/travel/flights?q="));
  const query = decodeURIComponent(flights.split("q=")[1]);
  assert.equal(query, "Flights from PBI to Savannah on 2026-11-06 through 2026-11-09 for 2 adults 2 children");

  const hotels = new URL(hotelSearchUrl({ destination: "Savannah, Georgia", startDate: "2026-11-06", endDate: "2026-11-09", travelers }));
  assert.equal(hotels.searchParams.get("ss"), "Savannah, Georgia");
  assert.equal(hotels.searchParams.get("checkin"), "2026-11-06");
  assert.equal(hotels.searchParams.get("group_children"), "2");
  assert.equal(hotels.searchParams.getAll("age").length, 2);

  const rental = new URL(stayLink({ name: "Whole homes", kind: "rental", destination: "Savannah", startDate: "2026-11-06", endDate: "2026-11-09", travelers }));
  assert.equal(rental.hostname, "www.airbnb.com");
  const named = new URL(stayLink({ name: "The Marshall House", kind: "hotel", destination: "Savannah", startDate: "2026-11-06", endDate: "2026-11-09", travelers }));
  assert.equal(named.searchParams.get("ss"), "The Marshall House, Savannah");
});

test("the total adds fares per person, the stay per night, activities per person and food per day", () => {
  const arrangements = {
    nights: 3,
    travelers,
    dailyFoodPerPerson: 50,
    flights: [{ id: "flight-1", pricePerPerson: 220 }],
    stays: [{ id: "stay-1", nightlyPrice: 190 }],
    activities: [{ id: "activity-1", pricePerPerson: 30 }, { id: "activity-2", pricePerPerson: 0 }, { id: "activity-3", pricePerPerson: 45 }]
  } as unknown as TripArrangements;

  const totals = tripTotals(arrangements, { flightId: "flight-1", stayId: "stay-1", activityIds: ["activity-1", "activity-2"] });
  assert.equal(totals.flights, 880);
  assert.equal(totals.stay, 570);
  assert.equal(totals.activities, 120);
  assert.equal(totals.food, 800);
  assert.equal(totals.total, 2370);
  assert.equal(totals.perPerson, 593);

  const nothingPicked = tripTotals(arrangements, { flightId: "", stayId: "", activityIds: [] });
  assert.equal(nothingPicked.total, 800);
});

test("a described kind of place searches the town, a named property searches that property", () => {
  const dates = { destination: "Cape May", startDate: "2026-11-06", endDate: "2026-11-09", travelers };
  assert.equal(new URL(stayLink({ ...dates, name: "Hotels in town", kind: "hotel" })).searchParams.get("ss"), "Cape May");
  assert.equal(new URL(stayLink({ ...dates, name: "A hotel near the beach", kind: "hotel" })).searchParams.get("ss"), "Cape May");
  assert.equal(new URL(stayLink({ ...dates, name: "Congress Hall", kind: "hotel" })).searchParams.get("ss"), "Congress Hall, Cape May");
});

test("an airport code is used only when the route names it too", async () => {
  const { arrivalAirportForTest } = await import("../../src/services/trips/arrange.js");
  assert.equal(arrivalAirportForTest({ arriveAirport: "SAV", route: "PBI to SAV, nonstop" }, "PBI"), "SAV");
  assert.equal(arrivalAirportForTest({ arriveAirport: "ILM", route: "PBI to Philadelphia, then a drive" }, "PBI"), null);
  assert.equal(arrivalAirportForTest({ arriveAirport: "PBI", route: "PBI to PBI" }, "PBI"), null);
  assert.equal(arrivalAirportForTest({ arriveAirport: "Savannah", route: "PBI to Savannah" }, "PBI"), null);
});
