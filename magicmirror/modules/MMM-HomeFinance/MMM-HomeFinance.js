Module.register("MMM-HomeFinance", {
  defaults: {
    finance: {
      enabled: true,
      provider: "plaid",
      tokenPath: "Home-Scheduler/secrets/plaid-items.json",
      syncInterval: 900000
    },
    sampleBudgets: [
      { category: "Groceries", limit: 650 },
      { category: "Dining", limit: 250 },
      { category: "Gas", limit: 220 },
      { category: "Home", limit: 300 }
    ],
    sampleTransactions: [
      { merchant: "Grocery Market", category: "Groceries", amount: 84.37, dayOffset: 0 },
      { merchant: "Coffee", category: "Dining", amount: 9.48, dayOffset: 0 },
      { merchant: "Gas Station", category: "Gas", amount: 46.12, dayOffset: -1 },
      { merchant: "Hardware Store", category: "Home", amount: 38.9, dayOffset: -2 }
    ]
  },

  start: function () {
    this.financeStatus = "Manual finance mode";
    this.financeSummary = "";
    this.financeSyncTimer = null;
    this.budgets = this.readItems("budgets", this.defaultBudgets());
    this.transactions = this.readItems("transactions", this.defaultTransactions());
    this.sendSocketNotification("HF_CONFIG", { finance: this.config.finance });
    this.requestFinanceSync();
  },

  getScripts: function () {
    return this.config.finance?.enabled ? ["https://cdn.plaid.com/link/v2/stable/link-initialize.js"] : [];
  },

  getStyles: function () {
    return ["MMM-HomeFinance.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "hf-shell";
    wrapper.innerHTML = this.renderFinance();
    this.bindDom(wrapper);
    return wrapper;
  },

  suspend: function () {
    clearInterval(this.financeSyncTimer);
  },

  resume: function () {
    this.requestFinanceSync();
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "HF_PLAID_STATUS") {
      this.financeStatus = payload.message || "Finance sync updated";
      this.updateDom(250);
    }

    if (notification === "HF_PLAID_LINK_TOKEN") {
      this.openPlaidLink(payload.linkToken);
    }

    if (notification === "HF_PLAID_TRANSACTIONS") {
      const imported = Array.isArray(payload.transactions) ? payload.transactions : [];
      this.financeStatus = `Synced ${imported.length} bank transaction${imported.length === 1 ? "" : "s"}`;
      this.transactions = this.transactions
        .filter((transaction) => transaction.source !== "plaid")
        .concat(imported);
      this.writeItems("transactions", this.transactions);
      this.updateDom(250);
    }

    if (notification === "HF_PLAID_ERROR") {
      this.financeStatus = `Finance sync error: ${payload.message}`;
      console.error(`MMM-HomeFinance error: ${payload.message}`);
      this.updateDom(250);
    }
  },

  renderFinance: function () {
    const today = this.isoDate(new Date());
    const month = today.slice(0, 7);
    const monthTransactions = this.transactions.filter((transaction) => transaction.date?.startsWith(month));
    const todayTotal = this.sumTransactions(this.transactions.filter((transaction) => transaction.date === today));
    const monthTotal = this.sumTransactions(monthTransactions);
    const budgetTotal = this.budgets.reduce((total, budget) => total + Number(budget.limit || 0), 0);
    const remaining = budgetTotal - monthTotal;
    const progress = budgetTotal > 0 ? Math.min(100, Math.round((monthTotal / budgetTotal) * 100)) : 0;
    const topCategory = this.categoryTotals(monthTransactions)[0];

    return `
      <div class="hf-top">
        <div class="hf-title">
          <p class="hf-eyebrow">Finance Console</p>
          <h1>Cashflow</h1>
          <span>${this.escape(this.financeStatus)}</span>
        </div>
        <div class="hf-actions">
          <button data-action="finance-summary" type="button">Daily Summary</button>
          <button data-action="connect-finance" type="button">Connect Bank</button>
          <button data-action="sync-finance" type="button">Sync</button>
          <button data-action="add-transaction" type="button">Add Spend</button>
          <button data-action="add-budget" type="button">Budget</button>
        </div>
      </div>
      <div class="hf-grid">
        <section class="hf-overview">
          <div class="hf-dial" style="--finance-progress: ${progress};">
            <div>
              <span>Budget Used</span>
              <strong>${progress}%</strong>
              <em>${this.formatMoney(monthTotal)} / ${this.formatMoney(budgetTotal)}</em>
            </div>
          </div>
          <div class="hf-kpis">
            <div class="hf-card"><span>Today</span><strong>${this.formatMoney(todayTotal)}</strong></div>
            <div class="hf-card ${remaining < 0 ? "danger" : ""}"><span>Remaining</span><strong>${this.formatMoney(remaining)}</strong></div>
            <div class="hf-card"><span>Top Category</span><strong>${this.escape(topCategory?.category || "None")}</strong><em>${topCategory ? this.formatMoney(topCategory.total) : "$0"}</em></div>
          </div>
          <div class="hf-note">${this.escape(this.financeSummary || this.financeInsight(todayTotal, remaining, progress))}</div>
        </section>
        <section class="hf-panel">
          <div class="hf-section-head"><span>Budgets</span><b>${this.formatMoney(remaining)} left</b></div>
          ${this.renderBudgetRows(monthTransactions)}
        </section>
        <section class="hf-panel">
          <div class="hf-section-head"><span>Recent Spending</span><b>${monthTransactions.length} txns</b></div>
          ${this.renderTransactionRows()}
        </section>
      </div>
    `;
  },

  renderBudgetRows: function (transactions) {
    if (!this.budgets.length) {
      return `<div class="hf-card"><span>No budgets yet</span><strong>Tap Budget</strong></div>`;
    }

    return this.budgets.map((budget) => {
      const spent = this.sumTransactions(transactions.filter((transaction) => transaction.category === budget.category));
      const limit = Number(budget.limit || 0);
      const progress = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      const state = progress >= 100 ? "danger" : progress >= 80 ? "warning" : "";
      return `
        <div class="hf-budget ${state}">
          <div><strong>${this.escape(budget.category)}</strong><span>${this.formatMoney(spent)} of ${this.formatMoney(limit)}</span></div>
          <b>${progress}%</b>
          <div class="hf-meter"><i style="width: ${progress}%;"></i></div>
        </div>
      `;
    }).join("");
  },

  renderTransactionRows: function () {
    const recent = [...this.transactions]
      .sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
      .slice(0, 8);

    if (!recent.length) {
      return `<div class="hf-card"><span>No spending yet</span><strong>Tap Add Spend</strong></div>`;
    }

    return recent.map((transaction) => `
      <div class="hf-transaction">
        <span class="hf-mark">${this.escape(String(transaction.category || "?").charAt(0))}</span>
        <div>
          <strong>${this.escape(transaction.merchant)}</strong>
          <span>${this.escape(transaction.category)} / ${this.formatShortDate(this.parseLocalDate(transaction.date))}${transaction.pending ? " / Pending" : ""}</span>
        </div>
        <b>${this.formatMoney(transaction.amount)}</b>
      </div>
    `).join("");
  },

  bindDom: function (wrapper) {
    wrapper.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => this.handleAction(button.dataset.action));
    });
  },

  handleAction: function (action) {
    if (action === "add-budget") this.addBudget();
    if (action === "add-transaction") this.addTransaction();
    if (action === "finance-summary") this.createFinanceSummary();
    if (action === "connect-finance") this.connectFinance();
    if (action === "sync-finance") this.requestFinanceSync(false);
    this.updateDom(250);
  },

  addBudget: function () {
    const text = prompt("Add budget as Category: Limit, like Groceries: 650");
    if (!text) return;
    const parts = text.split(":");
    const category = (parts.shift() || "").trim();
    const limit = Number((parts.join(":") || "").replace(/[^0-9.]/g, ""));
    if (!category || !limit) return;
    this.budgets = this.budgets.filter((budget) => budget.category.toLowerCase() !== category.toLowerCase());
    this.budgets.push({ id: this.id(), category, limit });
    this.writeItems("budgets", this.budgets);
  },

  addTransaction: function () {
    const text = prompt("Add spend as Merchant: Category: Amount, like Target: Home: 42.19");
    if (!text) return;
    const parts = text.split(":").map((part) => part.trim());
    const merchant = parts[0];
    const category = parts[1];
    const amount = Number((parts[2] || "").replace(/[^0-9.]/g, ""));
    if (!merchant || !category || !amount) return;
    this.transactions.push({ id: this.id(), merchant, category, amount, date: this.isoDate(new Date()), source: "manual" });
    this.writeItems("transactions", this.transactions);
  },

  createFinanceSummary: function () {
    const today = this.isoDate(new Date());
    const month = today.slice(0, 7);
    const todayTransactions = this.transactions.filter((transaction) => transaction.date === today);
    const monthTransactions = this.transactions.filter((transaction) => transaction.date?.startsWith(month));
    const todayTotal = this.sumTransactions(todayTransactions);
    const monthTotal = this.sumTransactions(monthTransactions);
    const budgetTotal = this.budgets.reduce((total, budget) => total + Number(budget.limit || 0), 0);
    const largest = todayTransactions.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
    const progress = budgetTotal ? Math.round((monthTotal / budgetTotal) * 100) : 0;
    const largestText = largest ? ` Largest charge: ${largest.merchant} at ${this.formatMoney(largest.amount)}.` : "";
    this.financeSummary = `Today you spent ${this.formatMoney(todayTotal)} across ${todayTransactions.length} transaction${todayTransactions.length === 1 ? "" : "s"}.${largestText} Monthly budget progress is ${progress}% with ${this.formatMoney(budgetTotal - monthTotal)} remaining.`;
  },

  connectFinance: function () {
    if (!this.config.finance?.enabled) {
      this.financeStatus = "Finance connection is disabled in config.";
      return;
    }
    this.financeStatus = "Requesting secure Plaid Link...";
    this.sendSocketNotification("HF_CREATE_PLAID_LINK_TOKEN");
  },

  openPlaidLink: function (linkToken) {
    if (!linkToken || !window.Plaid) {
      this.financeStatus = "Plaid Link did not load. Check internet access on the Pi.";
      this.updateDom(250);
      return;
    }

    window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        this.financeStatus = `Connected ${metadata?.institution?.name || "bank"}. Syncing transactions...`;
        this.sendSocketNotification("HF_EXCHANGE_PLAID_PUBLIC_TOKEN", { publicToken });
      },
      onExit: () => {
        this.financeStatus = "Bank connection was closed.";
        this.updateDom(250);
      }
    }).open();
  },

  requestFinanceSync: function (resetTimer = true) {
    if (!this.config.finance?.enabled) return;
    this.sendSocketNotification("HF_SYNC_PLAID_TRANSACTIONS");
    if (resetTimer) {
      clearInterval(this.financeSyncTimer);
      this.financeSyncTimer = setInterval(() => this.sendSocketNotification("HF_SYNC_PLAID_TRANSACTIONS"), this.config.finance.syncInterval || 900000);
    }
  },

  readItems: function (name, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`MMM-HomeFinance.${name}`)) || fallback;
    } catch (error) {
      return fallback;
    }
  },

  writeItems: function (name, value) {
    localStorage.setItem(`MMM-HomeFinance.${name}`, JSON.stringify(value));
  },

  defaultBudgets: function () {
    return this.config.sampleBudgets.map((budget) => ({ id: this.id(), ...budget }));
  },

  defaultTransactions: function () {
    return this.config.sampleTransactions.map((transaction) => ({
      id: this.id(),
      merchant: transaction.merchant,
      category: transaction.category,
      amount: transaction.amount,
      date: this.isoDate(this.addDays(new Date(), transaction.dayOffset || 0)),
      source: "sample"
    }));
  },

  sumTransactions: function (transactions) {
    return transactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  },

  categoryTotals: function (transactions) {
    const totals = new Map();
    transactions.forEach((transaction) => {
      const category = transaction.category || "Other";
      totals.set(category, (totals.get(category) || 0) + Number(transaction.amount || 0));
    });
    return Array.from(totals, ([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  },

  financeInsight: function (todayTotal, remaining, progress) {
    if (remaining < 0) return `You are ${this.formatMoney(Math.abs(remaining))} over budget this month.`;
    if (todayTotal === 0) return `No spending logged today. Monthly budget progress is ${progress}%.`;
    return `Today is at ${this.formatMoney(todayTotal)}. Monthly budget progress is ${progress}% with ${this.formatMoney(remaining)} remaining.`;
  },

  formatMoney: function (value) {
    return new Intl.NumberFormat([], { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
  },

  addDays: function (date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  },

  isoDate: function (date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  },

  parseLocalDate: function (value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  },

  formatShortDate: function (date) {
    return new Intl.DateTimeFormat([], { month: "short", day: "numeric" }).format(date);
  },

  escape: function (value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[character]);
  },

  id: function () {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }
});
