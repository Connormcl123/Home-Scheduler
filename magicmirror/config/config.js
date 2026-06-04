const calendarFeeds = [
  process.env.GOOGLE_CALENDAR_ICAL_URL
    ? {
        name: "google-ical",
        color: "#6fb4ff",
        symbol: "calendar",
        url: process.env.GOOGLE_CALENDAR_ICAL_URL
      }
    : null,
  process.env.APPLE_CALENDAR_ICAL_URL
    ? {
        name: "apple",
        color: "#ff9f7a",
        symbol: "calendar-check",
        url: process.env.APPLE_CALENDAR_ICAL_URL
      }
    : null
].filter(Boolean);

const config = {
  electronOptions: {
    webPreferences: {
      webviewTag: true
    },
    args: ["--password-store=basic"]
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
      module: "clock",
      classes: "page-default",
      position: "top_left"
    },
    {
      module: "compliments",
      classes: "page-default",
      position: "lower_third"
    },
    {
      module: "MMM-HomeScheduler",
      classes: "page-default",
      position: "fullscreen_below",
      config: {
        title: "Home Scheduler",
        displayMode: "default-agenda",
        calendarProvider: "calendar",
        enableCalendar: true,
        enableWeather: false,
        enableFinance: false,
        enableNotes: false,
        photoProvider: "disabled",
        enablePhotos: false,
        backgroundPhoto: {
          enabled: true,
          directory: process.env.HOME_SCHEDULER_BACKGROUND_PHOTO_DIR || "MagicMirror/photos/default-backgrounds",
          rotationInterval: 1000 * 60 * 60
        },
        useCalendarBroadcasts: true,
        googleCalendar: {
          enabled: true,
          calendarId: "primary",
          calendarIds: ["primary"],
          writeCalendarId: "primary",
          credentialsPath: "Home-Scheduler/secrets/google-calendar-credentials.json",
          tokenPath: "Home-Scheduler/secrets/google-calendar-token.json",
          timeZone: "America/New_York",
          syncInterval: 300000,
          fetchDaysBefore: 7,
          fetchDaysAfter: 60
        }
      }
    },
    {
      module: "calendar",
      header: "Family Calendar Feed",
      position: "top_left",
      hiddenOnStartup: true,
      disabled: calendarFeeds.length === 0,
      config: {
        colored: true,
        coloredText: true,
        maximumEntries: 30,
        maximumNumberOfDays: 45,
        broadcastEvents: true,
        broadcastPastEvents: true,
        calendars: calendarFeeds
      }
    },
    {
      module: "MMM-HomeScheduler",
      classes: "page-calendar",
      position: "fullscreen_above",
      config: {
        title: "Home Scheduler",
        displayMode: "compact",
        calendarProvider: "calendar",
        enableCalendar: true,
        enableWeather: false,
        enableFinance: false,
        enableNotes: false,
        photoProvider: "disabled",
        enablePhotos: false,
        useCalendarBroadcasts: true,
        googleCalendar: {
          enabled: true,
          calendarId: "primary",
          calendarIds: ["primary"],
          writeCalendarId: "primary",
          credentialsPath: "Home-Scheduler/secrets/google-calendar-credentials.json",
          tokenPath: "Home-Scheduler/secrets/google-calendar-token.json",
          timeZone: "America/New_York",
          syncInterval: 300000,
          fetchDaysBefore: 7,
          fetchDaysAfter: 60
        }
      }
    },
    {
      module: "MMM-HomeFinance",
      classes: "page-finance",
      position: "fullscreen_above",
      config: {
        finance: {
          enabled: true,
          provider: "plaid",
          tokenPath: "Home-Scheduler/secrets/plaid-items.json",
          syncInterval: 900000
        }
      }
    },
    {
      module: "MMM-HomeScheduler",
      classes: "page-notes",
      position: "fullscreen_above",
      config: {
        title: "Home Scheduler",
        displayMode: "compact",
        enableCalendar: false,
        enableWeather: false,
        enableFinance: false,
        enableNotes: true,
        photoProvider: "disabled",
        enablePhotos: false,
        useCalendarBroadcasts: false,
        googleCalendar: {
          enabled: false
        },
        finance: {
          enabled: false
        }
      }
    },
    {
      module: "MMM-pages",
      config: {
        modules: [
          ["page-default"],
          ["page-calendar"],
          ["page-finance"],
          ["page-notes"]
        ],
        fixed: ["MMM-HomePageControls", "alert", "updatenotification"],
        homePage: 0,
        animationTime: 350
      }
    },
    {
      module: "MMM-HomePageControls",
      position: "bottom_bar",
      config: {
        labels: ["Default", "Calendar", "Finance", "Notes"]
      }
    },
    {
      module: "weather",
      position: "top_right",
      disabled: true,
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
      disabled: true,
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
