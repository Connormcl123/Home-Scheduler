# Planning a trip from the wall

Every trip idea on the Travel tab has a **Plan this trip** button. It turns the idea into real arrangements, and one more tap holds the trip and sends the booking to a phone.

## What the planner shows

- **Dates.** A Friday departure at least four weeks out, in a month that suits the destination, for as long as the idea suggests. The arrows move the whole trip a week at a time.
- **Who is going.** Adults and kids, remembered on the wall between visits. Prices and the search links follow the count.
- **Getting there, where to stay, while you're there.** Two or three flights, two or three stays and a handful of activities, each with an estimate. Tap to choose; the total on the right moves as you pick.

Every option links to a real booking page with the dates, airports and party already filled in: Google Flights, Booking.com, Airbnb and GetYourGuide.

## "Let's do this"

One tap:

1. Holds the dates on the family calendar as one block.
2. Raises the Travel budget to cover the trip, so it shows against real spending on the Finance tab.
3. Puts a QR code on the wall. Scanning it opens the trip on a phone: the flight, the stay and each activity, in order, each with its own booking button.

**Nothing is booked or paid for by the dashboard.** The phone page is where the live price appears and where a person books.

## Where the numbers come from

Prices are estimates written by Claude for those dates and that party, not live fares. Flights are priced from `HOME_AIRPORT` (PBI). The real price is whatever the booking page says when you tap through, and it will differ.

Arrangements are generated once per idea, dates and party, then kept, so reopening a trip is instant. Changing the week or the party generates a fresh set.

## Settings

| Setting | Meaning |
|---|---|
| `HOME_AIRPORT` | The airport flights are priced from. Default `PBI`. |
| `TRIPS_PUBLIC_BASE` | Where a scanned trip page opens. Default is the Pi's tailnet address, so it works away from home. |

A scanned page needs Tailscale on the phone, like the other phone features.
