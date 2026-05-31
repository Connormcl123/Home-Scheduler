const NodeHelper = require("node_helper");
const fs = require("node:fs/promises");
const path = require("node:path");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

let plaidSdk = null;
try {
  plaidSdk = require("plaid");
} catch (error) {
  plaidSdk = null;
}

module.exports = NodeHelper.create({
  start() {
    this.config = {};
    this.auth = null;
    this.calendar = null;
    this.plaidClient = null;
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

    if (notification === "HS_CREATE_PLAID_LINK_TOKEN") {
      this.createPlaidLinkToken().catch((error) => {
        this.sendPlaidError(error);
      });
    }

    if (notification === "HS_EXCHANGE_PLAID_PUBLIC_TOKEN") {
      this.exchangePlaidPublicToken(payload).catch((error) => {
        this.sendPlaidError(error);
      });
    }

    if (notification === "HS_SYNC_PLAID_TRANSACTIONS") {
      this.syncPlaidTransactions().catch((error) => {
        this.sendPlaidError(error);
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
    await this.auth.getAccessToken();

    google.options({ auth: this.auth });
    this.calendar = google.calendar({ version: "v3" });
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

    const syncWindow = this.getSyncWindow(payload.weekStart);
    const timeMin = syncWindow.start.toISOString();
    const timeMax = syncWindow.end.toISOString();
    const responses = await Promise.all(this.getCalendarIds().map(async (calendarId) => {
      const response = await calendar.events.list({
        auth: this.auth,
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100
      });

      return {
        calendarId,
        items: response.data.items || []
      };
    }));

    this.sendSocketNotification("HS_GOOGLE_EVENTS", {
      events: responses
        .flatMap((response) => response.items.map((event) => this.fromGoogleEvent(event, response.calendarId)))
        .filter(Boolean),
      calendars: responses.map((response) => response.calendarId)
    });
  },

  async upsertGoogleEvent(event) {
    const calendar = await this.getCalendarClient();

    if (!calendar || !event) {
      return;
    }

    const calendarId = event.googleCalendarId || this.config.googleCalendar.writeCalendarId || this.config.googleCalendar.calendarId || "primary";
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
      calendarId: event.googleCalendarId || this.config.googleCalendar.writeCalendarId || this.config.googleCalendar.calendarId || "primary",
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

  fromGoogleEvent(event, calendarId) {
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
      googleCalendarId: calendarId,
      title: event.summary || "Google Calendar event",
      date: this.isoDate(start),
      time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      durationMinutes,
      profile: "family",
      source: "google"
    };
  },

  getCalendarIds() {
    const configuredIds = this.config.googleCalendar.calendarIds;

    if (Array.isArray(configuredIds) && configuredIds.length) {
      return configuredIds.filter(Boolean);
    }

    return [this.config.googleCalendar.calendarId || "primary"];
  },

  getSyncWindow(weekStartValue) {
    const weekStart = this.parseWeekStart(weekStartValue);
    const beforeDays = Number(this.config.googleCalendar.fetchDaysBefore ?? 7);
    const afterDays = Number(this.config.googleCalendar.fetchDaysAfter ?? 60);
    const start = new Date(weekStart);
    const end = new Date(weekStart);

    start.setDate(start.getDate() - beforeDays);
    end.setDate(end.getDate() + afterDays);

    return { start, end };
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

  getPlaidClient() {
    if (!this.config.finance?.enabled) {
      return null;
    }

    if (!plaidSdk) {
      throw new Error("Plaid dependency is not installed. Run the Home Scheduler installer on the Pi.");
    }

    if (this.plaidClient) {
      return this.plaidClient;
    }

    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const environment = process.env.PLAID_ENV || "sandbox";
    const basePath = plaidSdk.PlaidEnvironments[environment];

    if (!clientId || !secret) {
      this.sendSocketNotification("HS_PLAID_STATUS", {
        message: "Plaid is not configured. Add Plaid credentials to ~/Home-Scheduler/secrets/plaid.env."
      });
      return null;
    }

    if (!basePath) {
      throw new Error(`Unsupported PLAID_ENV "${environment}". Use sandbox, development, or production.`);
    }

    const configuration = new plaidSdk.Configuration({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret
        }
      }
    });

    this.plaidClient = new plaidSdk.PlaidApi(configuration);
    return this.plaidClient;
  },

  async createPlaidLinkToken() {
    const client = this.getPlaidClient();
    if (!client) return;

    const response = await client.linkTokenCreate({
      user: {
        client_user_id: "home-scheduler"
      },
      client_name: "Home Scheduler",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en"
    });

    this.sendSocketNotification("HS_PLAID_LINK_TOKEN", {
      linkToken: response.data.link_token
    });
  },

  async exchangePlaidPublicToken(payload) {
    const client = this.getPlaidClient();
    if (!client || !payload?.publicToken) return;

    const response = await client.itemPublicTokenExchange({
      public_token: payload.publicToken
    });
    const state = await this.readPlaidState();
    const existing = state.items.find((item) => item.itemId === response.data.item_id);

    if (existing) {
      existing.accessToken = response.data.access_token;
    } else {
      state.items.push({
        itemId: response.data.item_id,
        accessToken: response.data.access_token,
        cursor: null,
        transactions: []
      });
    }

    await this.writePlaidState(state);
    this.sendSocketNotification("HS_PLAID_STATUS", {
      message: "Bank connected. Syncing transactions..."
    });
    await this.syncPlaidTransactions();
  },

  async syncPlaidTransactions() {
    const client = this.getPlaidClient();
    if (!client) return;

    const state = await this.readPlaidState();

    if (!state.items.length) {
      this.sendSocketNotification("HS_PLAID_STATUS", {
        message: "No bank accounts connected yet. Tap Connect Bank to start."
      });
      return;
    }

    for (const item of state.items) {
      let cursor = item.cursor || null;
      let hasMore = true;
      const transactionMap = new Map((item.transactions || []).map((transaction) => [transaction.plaidTransactionId, transaction]));

      while (hasMore) {
        const response = await client.transactionsSync({
          access_token: item.accessToken,
          cursor,
          count: 100
        });
        const data = response.data;

        for (const transaction of data.added || []) {
          const mapped = this.fromPlaidTransaction(transaction, item.itemId);
          if (mapped) transactionMap.set(mapped.plaidTransactionId, mapped);
        }

        for (const transaction of data.modified || []) {
          const mapped = this.fromPlaidTransaction(transaction, item.itemId);
          if (mapped) transactionMap.set(mapped.plaidTransactionId, mapped);
        }

        for (const transaction of data.removed || []) {
          transactionMap.delete(transaction.transaction_id);
        }

        cursor = data.next_cursor;
        hasMore = Boolean(data.has_more);
      }

      item.cursor = cursor;
      item.transactions = Array.from(transactionMap.values());
    }

    await this.writePlaidState(state);
    this.sendSocketNotification("HS_PLAID_TRANSACTIONS", {
      transactions: state.items.flatMap((item) => item.transactions || [])
    });
  },

  fromPlaidTransaction(transaction, itemId) {
    const amount = Number(transaction.amount || 0);
    if (amount <= 0) {
      return null;
    }

    const category = transaction.personal_finance_category?.primary
      || transaction.category?.[0]
      || "Other";

    return {
      id: `plaid-${transaction.transaction_id}`,
      plaidTransactionId: transaction.transaction_id,
      plaidItemId: itemId,
      merchant: transaction.merchant_name || transaction.name || "Bank transaction",
      category: this.toTitleCase(category.replace(/_/g, " ").toLowerCase()),
      amount,
      date: transaction.date,
      pending: Boolean(transaction.pending),
      source: "plaid"
    };
  },

  async readPlaidState() {
    const tokenPath = this.resolvePath(this.config.finance?.tokenPath || "Home-Scheduler/secrets/plaid-items.json");
    try {
      const state = JSON.parse(await fs.readFile(tokenPath, "utf8"));
      return {
        items: Array.isArray(state.items) ? state.items : []
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return { items: [] };
    }
  },

  async writePlaidState(state) {
    const tokenPath = this.resolvePath(this.config.finance?.tokenPath || "Home-Scheduler/secrets/plaid-items.json");
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, JSON.stringify(state, null, 2));
  },

  sendPlaidError(error) {
    this.sendSocketNotification("HS_PLAID_ERROR", {
      message: error.message || String(error)
    });
  },

  toTitleCase(value) {
    return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
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
