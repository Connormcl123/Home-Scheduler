# Calendar Layout Notes

This project now centers calendar display and editing in `MMM-HomeScheduler`. The default MagicMirror page shows a lightweight agenda and shared todo list from the same Home Scheduler data pipeline, while the full Calendar page keeps the touchscreen week view, event editor, and matching todo drawer tab.

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
- Calendar
- Finance
- Notes

Pages auto-cycle through `MMM-pages` every 20 seconds. A slim bottom control bar shows the current page and gives you previous/next buttons for touchscreen navigation. The old Home Scheduler bubble tabs are disabled in this layout.

The default page agenda and full Calendar page both use `MMM-HomeScheduler`. Google events come from the Google Calendar API configuration, while Apple/iCloud events can still flow through the hidden stock `calendar` broadcaster when an iCal feed is configured:

```bash
bash scripts/set-google-calendar-ical.sh "YOUR_GOOGLE_ICAL_URL"
bash scripts/set-apple-calendar-ical.sh "YOUR_APPLE_HTTPS_ICAL_URL"
```

## HomeScheduler Calendar

Best fit when the touchscreen is the priority.

- Supports tap-to-create from a time slot.
- Supports title entry with the touchscreen keyboard.
- Supports drag/drop to another day or time.
- Supports resize handles for extending or shrinking event duration.
- Writes created/moved/resized events to Google Calendar through the Google Calendar API.
- Reads Google Calendar through API and Apple/iCloud through the hidden stock `calendar` feed.

The default page uses `displayMode: "default-agenda"` to render upcoming events and todos in a compact card. The full Calendar page uses `displayMode: "compact"` for the interactive week board and drawer tabs.

## Practical Recommendation

Use `MMM-pages` to compare:

```js
modules: [
  ["page-default"],
  ["page-calendar"],
  ["page-finance"],
  ["page-notes"]
]
```

Keep `MMM-HomeScheduler` as the source of interactive editing, shared event display, and shared todos. The hidden stock `calendar` module remains only as an Apple/iCloud iCal bridge for broadcast events.
