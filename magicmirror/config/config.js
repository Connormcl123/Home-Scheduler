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
      module: "MMM-HomeScheduler",
      position: "fullscreen_above",
      config: {
        title: "Home Scheduler"
      }
    }
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
