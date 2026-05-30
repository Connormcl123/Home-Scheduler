const config = {
  electronOptions: {
    webPreferences: {
      webviewTag: true
    }
  },
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
      hiddenOnStartup: true,
      config: {
        colored: true,
        coloredText: true,
        maximumEntries: 30,
        maximumNumberOfDays: 45,
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
        title: "Home Scheduler",
        displayMode: "compact",
        calendarProvider: "calendar",
        photoProvider: "local",
        useCalendarBroadcasts: true
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
        firstDayOfWeek: 0,
        weeksInView: 1,
        maxEventLines: 5,
        waitFetch: 5000,
        calendarSet: ["family"]
      }
    },
    {
      module: "weather",
      position: "top_right",
      disabled: !process.env.OPENWEATHER_API_KEY,
      config: {
        weatherProvider: "openweathermap",
        type: "current",
        location: process.env.MIRROR_WEATHER_LOCATION || "New York",
        locationID: process.env.OPENWEATHER_LOCATION_ID || "",
        apiKey: process.env.OPENWEATHER_API_KEY || ""
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
      disabled: !process.env.GOOGLE_PHOTOS_ALBUMS,
      config: {
        albums: process.env.GOOGLE_PHOTOS_ALBUMS ? process.env.GOOGLE_PHOTOS_ALBUMS.split(",") : [],
        updateInterval: 1000 * 60 * 10,
        sort: "random"
      }
    },
    {
      module: "MMM-Random-local-image",
      position: "fullscreen_below",
      disabled: true,
      config: {
        photoDir: "photos",
        updateInterval: 1000 * 60,
        animationSpeed: 1000
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
