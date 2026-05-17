const config = {
  address: "0.0.0.0",
  port: 8080,
  basePath: "/",
  ipWhitelist: [],
  useHttps: false,
  language: "en",
  locale: "en-US",
  logLevel: ["INFO", "LOG", "WARN", "ERROR"],
  timeFormat: 12,
  units: "imperial",

  modules: [
    {
      module: "alert"
    },
    {
      module: "updatenotification",
      position: "top_bar"
    },
    {
      module: "calendar",
      header: "Family Calendar Feed",
      position: "top_left",
      disabled: true,
      config: {
        broadcastPastEvents: true,
        calendars: [
          {
            name: "family",
            color: "#6fb4ff",
            symbol: "calendar",
            url: "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"
          }
        ]
      }
    },
    {
      module: "MMM-HomeScheduler",
      position: "fullscreen_above",
      config: {
        title: "Home Scheduler"
      }
    },
    {
      module: "MMM-CalendarExt3",
      position: "fullscreen_below",
      disabled: true,
      config: {
        mode: "week",
        instanceId: "familyWeek",
        locale: "en-US",
        weeksInView: 1,
        calendarSet: ["family"]
      }
    },
    {
      module: "weather",
      position: "top_right",
      disabled: true,
      config: {
        weatherProvider: "openweathermap",
        type: "current",
        location: "New York",
        locationID: "",
        apiKey: "YOUR_OPENWEATHER_API_KEY"
      }
    },
    {
      module: "newsfeed",
      position: "bottom_bar",
      disabled: true,
      config: {
        feeds: [
          {
            title: "NPR",
            url: "https://feeds.npr.org/1001/rss.xml"
          }
        ],
        showSourceTitle: true,
        showPublishDate: true,
        broadcastNewsFeeds: true,
        broadcastNewsUpdates: true
      }
    },
    {
      module: "MMM-GooglePhotos",
      position: "fullscreen_below",
      disabled: true,
      config: {
        albums: [],
        updateInterval: 1000 * 60 * 10,
        sort: "random"
      }
    },
    {
      module: "MMM-Random-local-image",
      position: "fullscreen_below",
      disabled: true,
      config: {
        photoDir: "./modules/MMM-Random-local-image/exampleImages/"
      }
    },
    {
      module: "MMM-Remote-Control",
      config: {
        showModuleApiMenu: true,
        secureEndpoints: false
      }
    }
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
