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
      return;
    }

    if (notification === "HS_UPSERT_GOOGLE_EVENT") {
      this.upsertGoogleEvent(payload).catch((error) => {
        this.sendSocketNotification("HS_GOOGLE_ERROR", {
          message: error.message || String(error)
        });
      });
    }

    if (notification === "HS_DELETE_GOOGLE_EVENT") {
      this.deleteGoogleEvent(payload).catch((error) => {
        this.sendSocketNotification("HS_GOOGLE_ERROR", {
          message: error.message || String(error)
        });
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

    this.auth = await authenticate({
      keyfilePath: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });

    if (this.auth.credentials) {
      await fs.writeFile(tokenPath, JSON.stringify(this.auth.credentials, null, 2));
    }

    this.calendar = google.calendar({ version: "v3", auth: this.auth });
    return this.calendar;
  },

  async upsertGoogleEvent(event) {
    const calendar = await this.getCalendarClient();

    if (!calendar || !event) {
      return;
    }

    const calendarId = this.config.googleCalendar.calendarId || "primary";
    const requestBody = this.toGoogleEvent(event);
    const request = {
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

  eventDate(date, time) {
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
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
