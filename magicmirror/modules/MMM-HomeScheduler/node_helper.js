const NodeHelper = require("node_helper");
const fs = require("node:fs/promises");
const path = require("node:path");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

module.exports = NodeHelper.create({
  start() {
    this.config = {};
    this.auth = null;
    this.calendar = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "HS_CONFIG") {
      this.config = payload || {};
      this.fetchGoogleEvents().catch((error) => {
        this.sendGoogleError(error);
      });
      return;
    }

    if (notification === "HS_FETCH_GOOGLE_EVENTS") {
      this.fetchGoogleEvents(payload).catch((error) => {
        this.sendGoogleError(error);
      });
    }

    if (notification === "HS_UPSERT_GOOGLE_EVENT") {
      this.upsertGoogleEvent(payload).catch((error) => {
        this.sendGoogleError(error);
      });
    }

    if (notification === "HS_DELETE_GOOGLE_EVENT") {
      this.deleteGoogleEvent(payload).catch((error) => {
        this.sendGoogleError(error);
      });
    }
  },

  async getCalendarClient() {
    if (!this.config.googleCalendar?.enabled) {
      return null;
    }

    if (this.calendar) {
      return this.calendar;
    }

    const credentialsPath = this.resolvePath(this.config.googleCalendar.credentialsPath);
    const tokenPath = this.resolvePath(this.config.googleCalendar.tokenPath);

    await fs.mkdir(path.dirname(tokenPath), { recursive: true });

    this.auth = await this.getSavedAuthClient(credentialsPath, tokenPath);

    this.calendar = google.calendar({ version: "v3", auth: this.auth });
    return this.calendar;
  },

  async getSavedAuthClient(credentialsPath, tokenPath) {
    try {
      const credentials = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
      const clientConfig = credentials.installed || credentials.web;
      const token = JSON.parse(await fs.readFile(tokenPath, "utf8"));

      if (!clientConfig?.client_id || !clientConfig?.client_secret) {
        throw new Error("Google credentials JSON is missing client_id or client_secret.");
      }

      if (!token.access_token && !token.refresh_token) {
        throw new Error("Google token is missing OAuth access. Re-run scripts/authorize-google-calendar.js.");
      }

      const authClient = new google.auth.OAuth2(
        clientConfig.client_id,
        clientConfig.client_secret,
        clientConfig.redirect_uris?.[0] || "http://localhost"
      );
      authClient.setCredentials(token);
      return authClient;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      const authClient = await authenticate({
        keyfilePath: credentialsPath,
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });

      if (authClient.credentials) {
        await fs.writeFile(tokenPath, JSON.stringify(authClient.credentials, null, 2));
      }

      return authClient;
    }
  },

  async fetchGoogleEvents(payload = {}) {
    const calendar = await this.getCalendarClient();

    if (!calendar) {
      return;
    }

    const weekStart = this.parseWeekStart(payload.weekStart);
    const timeMin = weekStart.toISOString();
    const timeMax = new Date(weekStart.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const response = await calendar.events.list({
      auth: this.auth,
      calendarId: this.config.googleCalendar.calendarId || "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100
    });

    this.sendSocketNotification("HS_GOOGLE_EVENTS", {
      events: (response.data.items || []).map((event) => this.fromGoogleEvent(event)).filter(Boolean)
    });
  },

  async upsertGoogleEvent(event) {
    const calendar = await this.getCalendarClient();

    if (!calendar || !event) {
      return;
    }

    const calendarId = this.config.googleCalendar.calendarId || "primary";
    const requestBody = this.toGoogleEvent(event);
    const request = {
      auth: this.auth,
      calendarId,
      requestBody
    };
    let response;

    if (event.googleEventId) {
      response = await calendar.events.update({
        ...request,
        eventId: event.googleEventId
      });
    } else {
      response = await calendar.events.insert(request);
    }

    this.sendSocketNotification("HS_GOOGLE_EVENT_SAVED", {
      localId: event.id,
      googleEventId: response.data.id,
      htmlLink: response.data.htmlLink
    });
  },

  async deleteGoogleEvent(event) {
    const calendar = await this.getCalendarClient();

    if (!calendar || !event?.googleEventId) {
      return;
    }

    await calendar.events.delete({
      auth: this.auth,
      calendarId: this.config.googleCalendar.calendarId || "primary",
      eventId: event.googleEventId
    });

    this.sendSocketNotification("HS_GOOGLE_EVENT_DELETED", {
      localId: event.id,
      googleEventId: event.googleEventId
    });
  },

  toGoogleEvent(event) {
    const start = this.eventDate(event.date, event.time);
    const end = new Date(start.getTime() + (event.durationMinutes || 60) * 60000);
    const timeZone = this.config.googleCalendar.timeZone || "America/New_York";

    return {
      summary: event.title || "Untitled event",
      description: `Created from Home Scheduler (${event.profile || "family"})`,
      start: {
        dateTime: start.toISOString(),
        timeZone
      },
      end: {
        dateTime: end.toISOString(),
        timeZone
      }
    };
  },

  fromGoogleEvent(event) {
    const startValue = event.start?.dateTime || event.start?.date;
    const endValue = event.end?.dateTime || event.end?.date;
    const start = new Date(startValue);
    const end = new Date(endValue);

    if (Number.isNaN(start.getTime())) {
      return null;
    }

    const durationMinutes = Number.isNaN(end.getTime())
      ? 60
      : Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));

    return {
      id: `google-${event.id}`,
      googleEventId: event.id,
      title: event.summary || "Google Calendar event",
      date: this.isoDate(start),
      time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      durationMinutes,
      profile: "family",
      source: "google"
    };
  },

  eventDate(date, time) {
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  },

  parseWeekStart(value) {
    const parsed = value ? new Date(`${value}T00:00:00`) : new Date();
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
  },

  isoDate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  },

  sendGoogleError(error) {
    this.sendSocketNotification("HS_GOOGLE_ERROR", {
      message: error.message || String(error)
    });
  },

  resolvePath(configPath) {
    if (!configPath) {
      return "";
    }

    if (path.isAbsolute(configPath)) {
      return configPath;
    }

    return path.join(process.env.HOME || process.cwd(), configPath);
  }
});
