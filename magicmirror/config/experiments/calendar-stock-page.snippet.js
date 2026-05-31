// Experiment: stock MagicMirror calendar page.
// Copy this module object into config.modules and add ["page-calendar-stock"]
// to the MMM-pages modules list.

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
