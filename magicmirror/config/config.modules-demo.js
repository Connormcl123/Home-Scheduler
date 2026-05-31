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
      config: {
        feeds: [
          {
            title: "NPR",
            url: "https://feeds.npr.org/1001/rss.xml"
          }
        ],
        showSourceTitle: true,
        showPublishDate: true
      }
    },
    {
      module: "MMM-Random-local-image",
      position: "bottom_left",
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
