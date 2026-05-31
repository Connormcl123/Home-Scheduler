// Experiment: MMM-CalendarExt2 page.
// Copy this module object into config.modules and add ["page-calendar-ext2"]
// to the MMM-pages modules list.

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
