# Calendar Module Experiments

This project now keeps two calendar display paths. The important distinction is display versus editing: MagicMirror calendar display modules are excellent at showing `.ics` feeds, but they do not natively support the touch editing features we built into `MMM-HomeScheduler`.

## Running The Experiment Config

The repo includes a separate experimental config at:

```text
magicmirror/config/config.experiments.js
```

On the Pi, install dependencies and launch the experimental version:

```bash
cd ~/Home-Scheduler
git pull
bash scripts/install-magicmirror-pi.sh --replace-config
bash scripts/start-magicmirror-experiments.sh x11
```

The launcher copies the experimental config to `~/MagicMirror/config/config.experiments.js` and starts MagicMirror with `MM_CONFIG_FILE=config/config.experiments.js`. Your normal `~/MagicMirror/config/config.js` is not replaced. The experimental pages are:

- Default MagicMirror
- Home Cal
- Stock Cal
- Finance
- Notes

Pages auto-cycle through `MMM-pages` every 20 seconds. A slim bottom control bar shows the current page and gives you previous/next buttons for touchscreen navigation. The old Home Scheduler bubble tabs are disabled in this layout.

Stock Cal uses your iCal feeds when available, and falls back to a public US holidays feed so the page is not blank during testing. Set one or both real feeds to test your own events:

```bash
bash scripts/set-google-calendar-ical.sh "YOUR_GOOGLE_ICAL_URL"
bash scripts/set-apple-calendar-ical.sh "YOUR_APPLE_HTTPS_ICAL_URL"
```

## 1. Current HomeScheduler Calendar

Best fit when the touchscreen is the priority.

- Supports tap-to-create from a time slot.
- Supports title entry with the touchscreen keyboard.
- Supports drag/drop to another day or time.
- Supports resize handles for extending or shrinking event duration.
- Writes created/moved/resized events to Google Calendar through the Google Calendar API.
- Reads Google Calendar through API and Apple/iCloud through the hidden stock `calendar` feed.

Tradeoff: this is our custom view, so it does not inherit every display style from the MagicMirror calendar ecosystem.

## 2. Stock MagicMirror `calendar`

Best fit as a simple, stable agenda/list display.

MagicMirror's built-in `calendar` module displays public or private `.ics` feeds and can combine multiple calendars. It can also broadcast events as `CALENDAR_EVENTS`, which is how `MMM-HomeScheduler` can ingest Apple/iCloud feeds.

Suggested experiment page:

```js
{
  module: "calendar",
  classes: "page-calendar-stock",
  position: "fullscreen_above",
  config: {
    colored: true,
    coloredText: true,
    maximumEntries: 20,
    maximumNumberOfDays: 30,
    broadcastEvents: true,
    broadcastPastEvents: true,
    calendars: calendarFeeds
  }
}
```

MMM-pages page entry:

```js
["page-calendar-stock"]
```

What ports cleanly:

- Google/iCloud `.ics` event display.
- Multiple calendars with colors.
- Broadcast events into HomeScheduler.

What does not port cleanly:

- Slot selection.
- Drag-and-drop editing.
- Resize handles.
- Google API writes.

Recommended use: compare it as a read-only agenda page, not as the main interactive family scheduler.

## Practical Recommendation

Use `MMM-pages` to compare:

```js
modules: [
  ["page-calendar"],
  ["page-calendar-stock"],
  ["page-finance"],
  ["page-notes"]
]
```

Keep `MMM-HomeScheduler` as the source of interactive editing. Use the stock calendar page only as a simple read-only feed comparison.
