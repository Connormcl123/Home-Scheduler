const NodeHelper = require("node_helper");
const fs = require("node:fs/promises");
const path = require("node:path");

let plaidSdk = null;
try {
  plaidSdk = require("plaid");
} catch (error) {
  plaidSdk = null;
}

module.exports = NodeHelper.create({
  start() {
    this.config = {};
    this.plaidClient = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "HF_CONFIG") {
      this.config = payload || {};
      this.syncPlaidTransactions().catch((error) => this.sendPlaidError(error));
      return;
    }

    if (notification === "HF_CREATE_PLAID_LINK_TOKEN") {
      this.createPlaidLinkToken().catch((error) => this.sendPlaidError(error));
    }

    if (notification === "HF_EXCHANGE_PLAID_PUBLIC_TOKEN") {
      this.exchangePlaidPublicToken(payload).catch((error) => this.sendPlaidError(error));
    }

    if (notification === "HF_SYNC_PLAID_TRANSACTIONS") {
      this.syncPlaidTransactions().catch((error) => this.sendPlaidError(error));
    }
  },

  getPlaidClient() {
    if (!this.config.finance?.enabled) return null;
    if (!plaidSdk) throw new Error("Plaid dependency is not installed. Run the Home Scheduler installer on the Pi.");
    if (this.plaidClient) return this.plaidClient;

    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const environment = process.env.PLAID_ENV || "sandbox";
    const basePath = plaidSdk.PlaidEnvironments[environment];

    if (!clientId || !secret) {
      this.sendSocketNotification("HF_PLAID_STATUS", {
        message: "Plaid is not configured. Add Plaid credentials to ~/Home-Scheduler/secrets/plaid.env."
      });
      return null;
    }

    if (!basePath) throw new Error(`Unsupported PLAID_ENV "${environment}". Use sandbox, development, or production.`);

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
      user: { client_user_id: "home-scheduler" },
      client_name: "Home Scheduler",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en"
    });

    this.sendSocketNotification("HF_PLAID_LINK_TOKEN", { linkToken: response.data.link_token });
  },

  async exchangePlaidPublicToken(payload) {
    const client = this.getPlaidClient();
    if (!client || !payload?.publicToken) return;

    const response = await client.itemPublicTokenExchange({ public_token: payload.publicToken });
    const state = await this.readPlaidState();
    const existing = state.items.find((item) => item.itemId === response.data.item_id);

    if (existing) {
      existing.accessToken = response.data.access_token;
    } else {
      state.items.push({ itemId: response.data.item_id, accessToken: response.data.access_token, cursor: null, transactions: [] });
    }

    await this.writePlaidState(state);
    this.sendSocketNotification("HF_PLAID_STATUS", { message: "Bank connected. Syncing transactions..." });
    await this.syncPlaidTransactions();
  },

  async syncPlaidTransactions() {
    const client = this.getPlaidClient();
    if (!client) return;

    const state = await this.readPlaidState();
    if (!state.items.length) {
      this.sendSocketNotification("HF_PLAID_STATUS", { message: "No bank accounts connected yet. Tap Connect Bank to start." });
      return;
    }

    for (const item of state.items) {
      let cursor = item.cursor || null;
      let hasMore = true;
      const transactionMap = new Map((item.transactions || []).map((transaction) => [transaction.plaidTransactionId, transaction]));

      while (hasMore) {
        const response = await client.transactionsSync({ access_token: item.accessToken, cursor, count: 100 });
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
    this.sendSocketNotification("HF_PLAID_TRANSACTIONS", {
      transactions: state.items.flatMap((item) => item.transactions || [])
    });
  },

  fromPlaidTransaction(transaction, itemId) {
    const amount = Number(transaction.amount || 0);
    if (amount <= 0) return null;
    const category = transaction.personal_finance_category?.primary || transaction.category?.[0] || "Other";
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
      return { items: Array.isArray(state.items) ? state.items : [] };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { items: [] };
    }
  },

  async writePlaidState(state) {
    const tokenPath = this.resolvePath(this.config.finance?.tokenPath || "Home-Scheduler/secrets/plaid-items.json");
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, JSON.stringify(state, null, 2));
  },

  sendPlaidError(error) {
    this.sendSocketNotification("HF_PLAID_ERROR", { message: error.message || String(error) });
  },

  toTitleCase(value) {
    return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
  },

  resolvePath(configPath) {
    if (!configPath) return "";
    if (path.isAbsolute(configPath)) return configPath;
    return path.join(process.env.HOME || process.cwd(), configPath);
  }
});
