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

const displayCalendarFeeds = calendarFeeds.length ? calendarFeeds : [
  {
    name: "sample-holidays",
    color: "#6fb4ff",
    symbol: "calendar",
    url: "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"
  }
];

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
      module: "calendar",
      header: "Calendar",
      classes: "page-default",
      position: "top_right",
      config: {
        colored: true,
        coloredText: true,
        maximumEntries: 8,
        maximumNumberOfDays: 14,
        calendars: displayCalendarFeeds
      }
    },
    {
      module: "calendar",
      header: "Hidden Feed Broadcaster",
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
      module: "calendar",
      header: "Stock Calendar",
      classes: "page-calendar-stock",
      position: "fullscreen_above",
      config: {
        colored: true,
        coloredText: true,
        maximumEntries: 20,
        maximumNumberOfDays: 30,
        broadcastEvents: false,
        calendars: displayCalendarFeeds
      }
    },
    {
      module: "MMM-CalendarExt2",
      classes: "page-calendar-ext2",
      config: {
        calendars: displayCalendarFeeds.map((calendar) => ({
          name: calendar.name,
          url: calendar.url,
          className: `${calendar.name}-calendar`
        })),
        views: [
          {
            name: "family_week",
            mode: "week",
            position: "fullscreen_above",
            calendars: displayCalendarFeeds.map((calendar) => calendar.name),
            slotCount: 7,
            fromNow: 0
          },
          {
            name: "today_agenda",
            mode: "daily",
            position: "fullscreen_above",
            calendars: displayCalendarFeeds.map((calendar) => calendar.name),
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
          ["page-calendar-stock"],
          ["page-calendar-ext2"],
          ["page-finance"],
          ["page-notes"]
        ],
        fixed: ["alert", "updatenotification"],
        homePage: 0,
        timings: {
          default: 20000
        },
        animationTime: 350
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
