# Calendar Module Experiments

This project has three realistic calendar display paths. The important distinction is display versus editing: MagicMirror calendar display modules are excellent at showing `.ics` feeds, but they do not natively support the touch editing features we built into `MMM-HomeScheduler`.

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

## 3. MMM-CalendarExt2

Best fit for a richer visual calendar display experiment.

`MMM-CalendarExt2` supports multiple views/scenes and is designed for richer month, week, daily, agenda, current, and upcoming views. Its own docs note that scenes can be changed by time, notification, or page triggers, which pairs well with `MMM-pages`.

Suggested experiment module:

```js
{
  module: "MMM-CalendarExt2",
  classes: "page-calendar-ext2",
  config: {
    calendars: [
      {
        name: "google",
        url: process.env.GOOGLE_CALENDAR_ICAL_URL,
        className: "google-calendar"
      },
      {
        name: "apple",
        url: process.env.APPLE_CALENDAR_ICAL_URL,
        className: "apple-calendar"
      }
    ].filter((calendar) => calendar.url),
    views: [
      {
        name: "family_week",
        mode: "week",
        position: "fullscreen_above",
        calendars: ["google", "apple"],
        slotCount: 7,
        fromNow: 0
      },
      {
        name: "today_agenda",
        mode: "daily",
        position: "fullscreen_above",
        calendars: ["google", "apple"],
        slotCount: 1,
        fromNow: 0
      }
    ],
    scenes: [
      {
        name: "family_calendar",
        views: ["family_week", "today_agenda"]
      }
    ]
  }
}
```

MMM-pages page entry:

```js
["page-calendar-ext2"]
```

What ports cleanly:

- Richer read-only calendar layouts.
- Multiple visual views on the same page.
- Google/iCloud `.ics` feed display.
- Scene/page-based experimentation.

What does not port cleanly:

- Touch event creation.
- Drag/drop between time slots.
- Resize-to-change event duration.
- Google Calendar API writes.

Recommended use: run it as a comparison page next to HomeScheduler. If its layout wins, keep it as the display page and use a smaller HomeScheduler editor page or modal for actual event editing.

## Practical Recommendation

Use `MMM-pages` to compare:

```js
modules: [
  ["page-calendar"],
  ["page-calendar-stock"],
  ["page-calendar-ext2"],
  ["page-finance"],
  ["page-notes"]
]
```

Keep `MMM-HomeScheduler` as the source of interactive editing while testing third-party calendar modules as visual display layers. If one third-party module clearly wins visually, the next step is to split our event editor into a small standalone module that can sit beside that display module.
