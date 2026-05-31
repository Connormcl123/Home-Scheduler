Module.register("MMM-HomeScheduler", {
  defaults: {
    title: "Home Scheduler",
    displayMode: "auto",
    enableWeather: true,
    enableFinance: true,
    enablePhotos: true,
    idlePhotoDelay: 45000,
    photoRotationDelay: 15000,
    useCalendarBroadcasts: true,
    googleCalendar: {
      enabled: false,
      calendarId: "primary",
      credentialsPath: "Home-Scheduler/secrets/google-calendar-credentials.json",
      tokenPath: "Home-Scheduler/secrets/google-calendar-token.json",
      timeZone: "America/New_York",
      syncInterval: 300000
    },
    finance: {
      enabled: true,
      provider: "plaid",
      tokenPath: "Home-Scheduler/secrets/plaid-items.json",
      syncInterval: 900000
    },
    profiles: [
      { id: "family", label: "Family" },
      { id: "home", label: "Home" },
      { id: "kids", label: "Kids" },
      { id: "meal", label: "Meals" }
    ],
    sampleEvents: [
      { title: "Family dinner", dayOffset: 0, time: "18:30", profile: "meal" },
      { title: "Trash and recycling", dayOffset: 1, time: "07:00", profile: "home" },
      { title: "Soccer practice", dayOffset: 2, time: "17:00", profile: "kids" }
    ],
    sampleNotes: [
      "Plan groceries for the week",
      "Pick a local photo album folder for idle mode"
    ],
    sampleChores: [
      { text: "Unload dishwasher", done: false },
      { text: "Take out trash", done: false },
      { text: "Water plants", done: true }
    ],
    sampleMeals: [
      { day: "Mon", text: "Taco bowls" },
      { day: "Tue", text: "Pasta night" },
      { day: "Fri", text: "Pizza and movie" }
    ],
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
    this.activeSlide = 0;
    this.drawerTab = "agenda";
    this.editor = null;
    this.keyboardTarget = null;
    this.resizeState = null;
    this.dragState = null;
    this.dragPressTimer = null;
    this.suppressNextEventClick = false;
    this.calendarStatus = "Waiting for calendar feed...";
    this.selectedDay = this.startOfDay(new Date());
    this.weekStart = this.startOfWeek(new Date());
    this.photoFiles = [];
    this.photoIndex = 0;
    this.idleTimer = null;
    this.photoTimer = null;
    this.googleSyncTimer = null;
    this.financeSyncTimer = null;
    this.financeSummary = "";
    this.financeStatus = "Manual finance mode";
    this.events = this.readItems("events", this.defaultEvents());
    this.notes = this.readItems("notes", this.config.sampleNotes.map((text) => ({ id: this.id(), text })));
    this.chores = this.readItems("chores", this.config.sampleChores.map((chore) => ({ id: this.id(), ...chore })));
    this.meals = this.readItems("meals", this.config.sampleMeals.map((meal) => ({ id: this.id(), ...meal })));
    this.budgets = this.readItems("budgets", this.defaultBudgets());
    this.transactions = this.readItems("transactions", this.defaultTransactions());
    this.markActivity();
    if (this.config.enablePhotos) {
      this.photoTimer = setInterval(() => this.showNextPhoto(), this.config.photoRotationDelay);
    }
    this.sendSocketNotification("HS_CONFIG", {
      googleCalendar: this.config.googleCalendar,
      finance: this.config.finance
    });
    this.requestGoogleEvents();
    this.requestFinanceSync();
  },

  getScripts: function () {
    return this.config.finance?.enabled ? ["https://cdn.plaid.com/link/v2/stable/link-initialize.js"] : [];
  },

  getStyles: function () {
    return ["MMM-HomeScheduler.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = `hs-shell hs-mode-${this.config.displayMode}`;
    wrapper.innerHTML = this.renderShell();
    this.bindDom(wrapper);
    return wrapper;
  },

  notificationReceived: function (notification, payload) {
    if (notification !== "CALENDAR_EVENTS" || !this.config.useCalendarBroadcasts || !Array.isArray(payload)) {
      return;
    }

    const calendarEvents = payload
      .map((event) => this.normalizeCalendarEvent(event))
      .filter(Boolean);

    this.calendarStatus = `Calendar feed received ${calendarEvents.length} event${calendarEvents.length === 1 ? "" : "s"}`;

    if (!calendarEvents.length) {
      this.updateDom(250);
      return;
    }

    this.events = this.events
      .filter((event) => event.source !== "calendar" && event.source !== "sample")
      .concat(calendarEvents);
    this.updateDom(250);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "HS_GOOGLE_EVENT_SAVED") {
      const event = this.events.find((item) => item.id === payload.localId);
      if (event) {
        event.googleEventId = payload.googleEventId;
        event.source = "google";
        this.writeItems("events", this.events);
      }
    }

    if (notification === "HS_GOOGLE_EVENTS") {
      const googleEvents = Array.isArray(payload?.events) ? payload.events : [];
      const calendars = Array.isArray(payload?.calendars) ? payload.calendars.join(", ") : "configured calendars";
      this.calendarStatus = `Google Calendar synced ${googleEvents.length} event${googleEvents.length === 1 ? "" : "s"} from ${calendars}`;
      this.events = this.events
        .filter((event) => event.source !== "google" && event.source !== "sample")
        .concat(googleEvents);
      this.writeItems("events", this.events.filter((event) => event.source !== "google"));
      this.updateDom(250);
    }

    if (notification === "HS_GOOGLE_ERROR") {
      this.calendarStatus = `Google Calendar error: ${payload.message}`;
      console.error(`MMM-HomeScheduler Google Calendar error: ${payload.message}`);
      this.updateDom(250);
    }

    if (notification === "HS_PLAID_STATUS") {
      this.financeStatus = payload.message || "Finance sync updated";
      this.updateDom(250);
    }

    if (notification === "HS_PLAID_LINK_TOKEN") {
      this.openPlaidLink(payload.linkToken);
    }

    if (notification === "HS_PLAID_TRANSACTIONS") {
      const imported = Array.isArray(payload.transactions) ? payload.transactions : [];
      this.financeStatus = `Synced ${imported.length} bank transaction${imported.length === 1 ? "" : "s"}`;
      this.transactions = this.transactions
        .filter((transaction) => transaction.source !== "plaid")
        .concat(imported);
      this.writeItems("transactions", this.transactions);
      this.updateDom(250);
    }

    if (notification === "HS_PLAID_ERROR") {
      this.financeStatus = `Finance sync error: ${payload.message}`;
      console.error(`MMM-HomeScheduler finance error: ${payload.message}`);
      this.updateDom(250);
    }
  },

  suspend: function () {
    clearTimeout(this.idleTimer);
    clearInterval(this.photoTimer);
    clearInterval(this.googleSyncTimer);
    clearInterval(this.financeSyncTimer);
  },

  resume: function () {
    this.markActivity();
    if (this.config.enablePhotos) {
      this.photoTimer = setInterval(() => this.showNextPhoto(), this.config.photoRotationDelay);
    }
    this.requestGoogleEvents();
    this.requestFinanceSync();
  },

  renderShell: function () {
    const slides = [
      { label: "Calendar", content: this.renderCalendar() }
    ];

    if (this.config.enableWeather) {
      slides.push({ label: "Weather", content: this.renderWeather() });
    }

    if (this.config.enableFinance) {
      slides.push({ label: "Finance", content: this.renderFinance() });
    }

    slides.push({ label: "Notes", content: this.renderNotesSlide() });

    if (this.config.enablePhotos) {
      slides.push({ label: "Photos", content: this.renderPhotos() });
    }

    return `
      <section class="hs-topbar">
        <div>
          <p class="hs-eyebrow">${this.escape(this.config.title)}</p>
          <h1>${this.formatTime(new Date())}</h1>
        </div>
        <div class="hs-date">
          <span>${new Intl.DateTimeFormat([], { weekday: "long" }).format(new Date())}</span>
          <strong>${new Intl.DateTimeFormat([], { month: "long", day: "numeric" }).format(new Date())}</strong>
        </div>
      </section>
      <section class="hs-viewport">
        <div class="hs-slides" style="transform: translateX(-${this.activeSlide * 100}%);">
          ${slides.map((slide) => slide.content).join("")}
        </div>
      </section>
      <nav class="hs-dock">
        ${slides.map((slide, index) => `
          <button class="${index === this.activeSlide ? "active" : ""}" data-slide="${index}" type="button">${slide.label}</button>
        `).join("")}
      </nav>
      ${this.renderEventEditor()}
    `;
  },

  renderCalendar: function () {
    const weekEnd = this.addDays(this.weekStart, 6);
    const weekTitle = `${this.formatShortDate(this.weekStart)} - ${this.formatShortDate(weekEnd)}`;
    return `
      <article class="hs-panel hs-calendar">
        <div class="hs-calendar-top">
          <div>
            <p class="hs-eyebrow">Family Calendar</p>
            <h2>${weekTitle}</h2>
          </div>
          <div class="hs-actions">
            <button data-action="previous-week" type="button">Prev</button>
            <button data-action="today-week" type="button">Today</button>
            <button data-action="next-week" type="button">Next</button>
            <button class="hs-icon" data-action="add-event" type="button">+</button>
          </div>
        </div>
        <div class="hs-profiles">
          ${this.config.profiles.map((profile) => `<span class="${profile.id}">${this.escape(profile.label)}</span>`).join("")}
        </div>
        <div class="hs-feed-status">${this.escape(this.calendarStatus)}</div>
        <div class="hs-calendar-workspace">
          <section class="hs-week-board">${this.renderWeekGrid()}</section>
          <aside class="hs-drawer">
            <div class="hs-tabs">
              ${["agenda", "notes", "chores", "meals"].map((tab) => `
                <button class="${this.drawerTab === tab ? "active" : ""}" data-tab="${tab}" type="button">${this.label(tab)}</button>
              `).join("")}
            </div>
            ${this.renderDrawerPanel()}
          </aside>
        </div>
      </article>
    `;
  },

  renderWeekGrid: function () {
    const days = Array.from({ length: 7 }, (_, index) => this.addDays(this.weekStart, index));
    const hours = [6, 9, 12, 15, 18, 21];
    const timeColumn = `
      <div class="hs-time-column">
        <div></div>
        ${hours.map((hour) => `<span>${this.formatHour(hour)}</span>`).join("")}
      </div>
    `;
    const dayColumns = days.map((day) => {
      const dayEvents = this.eventsForDay(day);
      return `
        <div class="hs-day-column">
          <button class="${this.sameDay(day, this.selectedDay) ? "active" : ""}" data-select-day="${this.isoDate(day)}" type="button">
            <span>${new Intl.DateTimeFormat([], { weekday: "short" }).format(day)}</span>
            <strong>${day.getDate()}</strong>
          </button>
          ${hours.map((hour) => this.renderTimeSlot(day, dayEvents, hour)).join("")}
        </div>
      `;
    }).join("");
    return `<div class="hs-week-grid">${timeColumn}${dayColumns}</div>`;
  },

  renderTimeSlot: function (day, dayEvents, hour) {
    const blocks = dayEvents.filter((event) => {
      const eventHour = Number(event.time.split(":")[0]);
      return eventHour >= hour && eventHour < hour + 3;
    }).map((event) => `
      <div class="hs-block ${event.profile || "family"}" data-event-id="${event.id}" style="min-height: ${this.eventBlockHeight(event)}px;">
        <button class="hs-resize hs-resize-top" data-resize-event="${event.id}" data-resize-edge="top" type="button" aria-label="Move event start earlier or later"></button>
        <span>${this.formatEventTime(event.time)} / ${this.profileLabel(event.profile)}</span>
        <strong>${this.escape(event.title)}</strong>
        <em>${this.eventTimeRange(event)}</em>
        <button class="hs-resize hs-resize-bottom" data-resize-event="${event.id}" data-resize-edge="bottom" type="button" aria-label="Extend or shrink event"></button>
      </div>
    `).join("");
    const slotLabel = `${new Intl.DateTimeFormat([], { weekday: "short" }).format(day)} ${this.formatHour(hour)}`;
    return `<div class="hs-slot" data-add-slot="${this.isoDate(day)}" data-slot-hour="${hour}" data-slot-label="${slotLabel}" role="button" tabindex="0">${blocks}</div>`;
  },

  renderEventEditor: function () {
    if (!this.editor) {
      return "";
    }

    return `
      <div class="hs-editor-backdrop">
        <form class="hs-editor" data-event-editor>
          <div>
            <p class="hs-eyebrow">${this.editor.id ? "Edit Event" : "Add Event"}</p>
            <h2>${this.escape(this.editor.title || "New event")}</h2>
          </div>
          <label>
            Title
            <input name="title" value="${this.escape(this.editor.title)}" required autocomplete="off" data-keyboard-field="title">
          </label>
          ${this.renderTouchKeyboard()}
          <label>
            Date
            <input name="date" type="date" value="${this.editor.date}" required>
          </label>
          <div class="hs-editor-row">
            <label>
              Start
              <input name="time" type="time" value="${this.editor.time}" required>
            </label>
            <label>
              Duration
              <select name="durationMinutes">
                ${[15, 30, 45, 60, 90, 120, 180].map((duration) => `
                  <option value="${duration}" ${Number(this.editor.durationMinutes) === duration ? "selected" : ""}>${duration} min</option>
                `).join("")}
              </select>
            </label>
          </div>
          <label>
            Profile
            <select name="profile">
              ${this.config.profiles.map((profile) => `
                <option value="${profile.id}" ${this.editor.profile === profile.id ? "selected" : ""}>${this.escape(profile.label)}</option>
              `).join("")}
            </select>
          </label>
          <div class="hs-editor-actions">
            <button data-action="cancel-editor" type="button">Cancel</button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    `;
  },

  renderTouchKeyboard: function () {
    const rows = [
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["Z", "X", "C", "V", "B", "N", "M"]
    ];

    return `
      <div class="hs-keyboard" aria-label="Touch keyboard">
        ${rows.map((row) => `
          <div class="hs-key-row">
            ${row.map((key) => `<button data-key="${key}" type="button">${key}</button>`).join("")}
          </div>
        `).join("")}
        <div class="hs-key-row hs-key-row-actions">
          <button data-key="space" type="button">Space</button>
          <button data-key="backspace" type="button">Back</button>
          <button data-key="clear" type="button">Clear</button>
          <button data-key="done" type="button">Done</button>
        </div>
      </div>
    `;
  },

  renderDrawerPanel: function () {
    if (this.drawerTab === "notes") {
      return `
        <div class="hs-drawer-panel">
          <div class="hs-drawer-heading"><span>Weekly notes</span><button data-action="add-note" type="button">Add</button></div>
          ${this.renderNotesList(true)}
        </div>
      `;
    }
    if (this.drawerTab === "chores") {
      return `
        <div class="hs-drawer-panel">
          <div class="hs-drawer-heading"><span>Chores</span><button data-action="add-chore" type="button">Add</button></div>
          ${this.chores.map((chore) => `
            <div class="hs-task ${chore.done ? "done" : ""}">
              <button data-toggle-chore="${chore.id}" type="button">${chore.done ? "OK" : ""}</button>
              <strong>${this.escape(chore.text)}</strong>
              <button data-remove-chore="${chore.id}" type="button">x</button>
            </div>
          `).join("")}
        </div>
      `;
    }
    if (this.drawerTab === "meals") {
      return `
        <div class="hs-drawer-panel">
          <div class="hs-drawer-heading"><span>Dinner plan</span><button data-action="add-meal" type="button">Add</button></div>
          ${this.meals.map((meal) => `
            <div class="hs-meal">
              <span>${this.escape(meal.day)}</span>
              <strong>${this.escape(meal.text)}</strong>
              <button data-remove-meal="${meal.id}" type="button">x</button>
            </div>
          `).join("")}
        </div>
      `;
    }
    return `
      <div class="hs-drawer-panel">
        <h3>${new Intl.DateTimeFormat([], { weekday: "long", month: "long", day: "numeric" }).format(this.selectedDay)}</h3>
        ${this.renderAgenda()}
      </div>
    `;
  },

  renderAgenda: function () {
    const events = this.eventsForDay(this.selectedDay).sort((a, b) => a.time.localeCompare(b.time));
    if (!events.length) {
      return `<div class="hs-card"><span>No events yet</span><strong>Tap + to add one</strong></div>`;
    }
    return events.map((event) => `
      <div class="hs-card" style="border-left-color: var(--hs-${event.profile || "family"});">
        <span>${this.formatEventTime(event.time)} / ${this.profileLabel(event.profile)}</span>
        <strong>${this.escape(event.title)}</strong>
        <button data-remove-event="${event.id}" type="button">x</button>
      </div>
    `).join("");
  },

  renderWeather: function () {
    return `
      <article class="hs-panel hs-weather">
        <div class="hs-calendar-top">
          <div><p class="hs-eyebrow">Weather</p><h2>Today</h2></div>
          <div class="hs-temp">72<span>F</span></div>
        </div>
        <div class="hs-forecast">
          <div><span>Morning</span><strong>68 F</strong><p>Clear, calm wind</p></div>
          <div><span>Afternoon</span><strong>76 F</strong><p>Light clouds</p></div>
          <div><span>Evening</span><strong>64 F</strong><p>Comfortable</p></div>
        </div>
        <div class="hs-news"><p class="hs-eyebrow">Headlines</p><p>MagicMirror weather and news modules can replace these placeholders.</p></div>
      </article>
    `;
  },

  renderNotesSlide: function () {
    return `
      <article class="hs-panel hs-notes">
        <div class="hs-calendar-top">
          <div><p class="hs-eyebrow">Weekly Notes</p><h2>House Board</h2></div>
          <button class="hs-icon" data-action="add-note" type="button">+</button>
        </div>
        ${this.renderNotesList(false)}
      </article>
    `;
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
    const categories = this.categoryTotals(monthTransactions);
    const topCategory = categories[0];

    return `
      <article class="hs-panel hs-finance">
        <div class="hs-finance-top">
          <div class="hs-finance-title">
            <p class="hs-eyebrow">Finance Console</p>
            <h2>Cashflow</h2>
            <span>${this.escape(this.financeStatus)}</span>
          </div>
          <div class="hs-finance-actions">
            <button data-action="finance-summary" type="button">Daily Summary</button>
            <button data-action="connect-finance" type="button">Connect Bank</button>
            <button data-action="sync-finance" type="button">Sync</button>
            <button data-action="add-transaction" type="button">Add Spend</button>
            <button data-action="add-budget" type="button">Budget</button>
          </div>
        </div>
        <div class="hs-finance-grid">
          <section class="hs-finance-overview">
            <div class="hs-finance-dial" style="--finance-progress: ${progress};">
              <div>
                <span>Budget Used</span>
                <strong>${progress}%</strong>
                <em>${this.formatMoney(monthTotal)} / ${this.formatMoney(budgetTotal)}</em>
              </div>
            </div>
            <div class="hs-finance-kpis">
              <div class="hs-money-card">
                <span>Today</span>
                <strong>${this.formatMoney(todayTotal)}</strong>
              </div>
              <div class="hs-money-card ${remaining < 0 ? "danger" : ""}">
                <span>Remaining</span>
                <strong>${this.formatMoney(remaining)}</strong>
              </div>
              <div class="hs-money-card">
                <span>Top Category</span>
                <strong>${this.escape(topCategory?.category || "None")}</strong>
                <em>${topCategory ? this.formatMoney(topCategory.total) : "$0"}</em>
              </div>
            </div>
            <div class="hs-finance-note">
              <p class="hs-eyebrow">Daily Insight</p>
              <p>${this.escape(this.financeSummary || this.financeInsight(todayTotal, remaining, progress))}</p>
            </div>
          </section>
          <section class="hs-budget-list">
            <div class="hs-finance-section-head"><span>Budgets</span><b>${this.formatMoney(remaining)} left</b></div>
            ${this.renderBudgetRows(monthTransactions)}
          </section>
          <section class="hs-transaction-list">
            <div class="hs-finance-section-head"><span>Recent Spending</span><b>${monthTransactions.length} txns</b></div>
            ${this.renderTransactionRows()}
          </section>
        </div>
      </article>
    `;
  },

  renderBudgetRows: function (transactions) {
    if (!this.budgets.length) {
      return `<div class="hs-card"><span>No budgets yet</span><strong>Tap Budget to add one</strong></div>`;
    }

    return this.budgets.map((budget) => {
      const spent = this.sumTransactions(transactions.filter((transaction) => transaction.category === budget.category));
      const limit = Number(budget.limit || 0);
      const progress = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      const state = progress >= 100 ? "danger" : progress >= 80 ? "warning" : "";
      return `
        <div class="hs-budget-row ${state}">
          <div>
            <strong>${this.escape(budget.category)}</strong>
            <span>${this.formatMoney(spent)} of ${this.formatMoney(limit)}</span>
          </div>
          <b>${progress}%</b>
          <div class="hs-budget-meter"><i style="width: ${progress}%;"></i></div>
        </div>
      `;
    }).join("");
  },

  renderTransactionRows: function () {
    const recent = [...this.transactions]
      .sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
      .slice(0, 8);

    if (!recent.length) {
      return `<div class="hs-card"><span>No spending yet</span><strong>Tap Add Spend</strong></div>`;
    }

    return recent.map((transaction) => `
      <div class="hs-transaction">
        <span class="hs-transaction-mark">${this.escape(String(transaction.category || "?").charAt(0))}</span>
        <div>
          <strong>${this.escape(transaction.merchant)}</strong>
          <span>${this.escape(transaction.category)} / ${this.formatShortDate(this.parseLocalDate(transaction.date))}${transaction.pending ? " / Pending" : ""}</span>
        </div>
        <b>${this.formatMoney(transaction.amount)}</b>
      </div>
    `).join("");
  },

  renderNotesList: function () {
    if (!this.notes.length) {
      return `<div class="hs-card"><span>No notes yet</span><strong>Tap + to add one</strong></div>`;
    }
    return `<div class="hs-list">${this.notes.map((note) => `
      <div class="hs-card">
        <span>This week</span>
        <strong>${this.escape(note.text)}</strong>
        <button data-remove-note="${note.id}" type="button">x</button>
      </div>
    `).join("")}</div>`;
  },

  renderPhotos: function () {
    return `
      <article class="hs-panel hs-photo">
        <div class="hs-photo-stage">
          <img class="hs-album-photo" alt="Selected family album photo">
          <div class="hs-photo-empty">
            <p class="hs-eyebrow">Photo Album</p>
            <h2>Choose a local album folder</h2>
            <p>When the mirror is idle, this panel can rotate through selected photos.</p>
            <button data-action="choose-album" type="button">Choose Album</button>
          </div>
        </div>
      </article>
    `;
  },

  bindDom: function (wrapper) {
    wrapper.querySelectorAll("[data-slide]").forEach((button) => {
      button.addEventListener("click", () => this.setSlide(Number(button.dataset.slide)));
    });
    wrapper.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.drawerTab = button.dataset.tab;
        this.touch();
      });
    });
    wrapper.querySelectorAll("[data-select-day]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedDay = this.parseLocalDate(button.dataset.selectDay);
        this.drawerTab = "agenda";
        this.touch();
      });
    });
    wrapper.addEventListener("pointerdown", (event) => {
      this.swipeStart = { x: event.clientX, y: event.clientY };
      this.markActivity();
    });
    wrapper.addEventListener("pointerup", (event) => this.handleSwipe(event));
    wrapper.querySelectorAll("[data-add-slot]").forEach((slot) => {
      slot.addEventListener("click", (event) => {
        if (event.target.closest("[data-resize-event]") || event.target.closest("[data-event-id]")) {
          return;
        }
        this.openEventEditor({
          date: slot.dataset.addSlot,
          time: `${String(slot.dataset.slotHour).padStart(2, "0")}:00`
        });
      });
    });
    wrapper.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => this.handleAction(button.dataset.action));
    });
    const editor = wrapper.querySelector("[data-event-editor]");
    if (editor) {
      editor.addEventListener("submit", (event) => this.saveEditor(event));
      editor.querySelectorAll("[data-keyboard-field]").forEach((field) => {
        field.addEventListener("focus", () => {
          this.keyboardTarget = field.dataset.keyboardField;
        });
        field.addEventListener("click", () => {
          this.keyboardTarget = field.dataset.keyboardField;
        });
        field.addEventListener("input", () => {
          this.editor[field.dataset.keyboardField] = field.value;
        });
      });
      editor.querySelectorAll("[data-key]").forEach((key) => {
        key.addEventListener("click", () => this.handleKeyboardKey(key.dataset.key));
      });
    }
    this.bindRemoveButtons(wrapper);
  },

  handleKeyboardKey: function (key) {
    if (!this.editor || (this.keyboardTarget && this.keyboardTarget !== "title")) {
      return;
    }

    this.keyboardTarget = "title";
    const current = this.editor.title || "";

    if (key === "backspace") {
      this.editor.title = current.slice(0, -1);
    } else if (key === "clear") {
      this.editor.title = "";
    } else if (key === "space") {
      this.editor.title = `${current} `;
    } else if (key === "done") {
      this.keyboardTarget = null;
    } else {
      this.editor.title = `${current}${key}`;
    }

    this.updateDom(0);
  },

  bindRemoveButtons: function (wrapper) {
    wrapper.querySelectorAll("[data-remove-event]").forEach((button) => {
      button.addEventListener("click", () => this.removeItem("events", button.dataset.removeEvent));
    });
    wrapper.querySelectorAll("[data-remove-note]").forEach((button) => {
      button.addEventListener("click", () => this.removeItem("notes", button.dataset.removeNote));
    });
    wrapper.querySelectorAll("[data-remove-chore]").forEach((button) => {
      button.addEventListener("click", () => this.removeItem("chores", button.dataset.removeChore));
    });
    wrapper.querySelectorAll("[data-toggle-chore]").forEach((button) => {
      button.addEventListener("click", () => {
        const chore = this.chores.find((item) => item.id === button.dataset.toggleChore);
        if (chore) chore.done = !chore.done;
        this.writeItems("chores", this.chores);
        this.touch();
      });
    });
    wrapper.querySelectorAll("[data-remove-meal]").forEach((button) => {
      button.addEventListener("click", () => this.removeItem("meals", button.dataset.removeMeal));
    });
    wrapper.querySelectorAll("[data-event-id]").forEach((block) => {
      block.addEventListener("click", (event) => {
        if (event.target.closest("[data-resize-event]")) return;
        if (this.suppressNextEventClick) {
          this.suppressNextEventClick = false;
          return;
        }
        const existing = this.events.find((item) => item.id === block.dataset.eventId);
        if (existing) this.openEventEditor(existing);
      });
      block.addEventListener("pointerdown", (event) => this.queueEventDrag(event, block));
    });
    wrapper.querySelectorAll("[data-resize-event]").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => this.startResize(event, handle));
    });
  },

  queueEventDrag: function (event, block) {
    if (event.target.closest("[data-resize-event]")) {
      return;
    }

    event.stopPropagation();
    this.clearDragPress();

    const eventItem = this.events.find((item) => item.id === block.dataset.eventId);
    if (!eventItem) {
      return;
    }

    this.dragPressTimer = setTimeout(() => {
      this.startEventDrag(event, block, eventItem);
    }, 280);

    document.addEventListener("pointermove", this.boundPendingDragMove = (moveEvent) => {
      if (Math.abs(moveEvent.clientX - event.clientX) > 8 || Math.abs(moveEvent.clientY - event.clientY) > 8) {
        this.clearDragPress();
      }
    });
    document.addEventListener("pointerup", this.boundPendingDragEnd = () => this.clearDragPress());
  },

  clearDragPress: function () {
    clearTimeout(this.dragPressTimer);
    this.dragPressTimer = null;
    if (this.boundPendingDragMove) {
      document.removeEventListener("pointermove", this.boundPendingDragMove);
      this.boundPendingDragMove = null;
    }
    if (this.boundPendingDragEnd) {
      document.removeEventListener("pointerup", this.boundPendingDragEnd);
      this.boundPendingDragEnd = null;
    }
  },

  startEventDrag: function (event, block, eventItem) {
    this.clearDragPress();
    this.suppressNextEventClick = true;
    this.markActivity();

    const rect = block.getBoundingClientRect();
    const ghost = block.cloneNode(true);
    ghost.classList.add("hs-drag-ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.minHeight = `${rect.height}px`;
    document.body.appendChild(ghost);

    block.classList.add("hs-drag-origin");
    this.dragState = {
      id: eventItem.id,
      ghost,
      originBlock: block,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      targetSlot: null
    };

    this.moveEventDrag(event);
    document.addEventListener("pointermove", this.boundEventDragMove = (moveEvent) => this.moveEventDrag(moveEvent));
    document.addEventListener("pointerup", this.boundEventDragEnd = (upEvent) => this.endEventDrag(upEvent));
  },

  moveEventDrag: function (event) {
    if (!this.dragState) {
      return;
    }

    this.dragState.ghost.style.transform = `translate(${event.clientX - this.dragState.offsetX}px, ${event.clientY - this.dragState.offsetY}px)`;

    const slot = this.slotFromPoint(event.clientX, event.clientY);
    if (slot !== this.dragState.targetSlot) {
      document.querySelectorAll(".hs-drop-target").forEach((target) => target.classList.remove("hs-drop-target"));
      this.dragState.targetSlot = slot;
      if (slot) {
        slot.classList.add("hs-drop-target");
      }
    }
  },

  endEventDrag: function () {
    if (!this.dragState) {
      return;
    }

    const { id, targetSlot } = this.dragState;
    const targetEvent = this.events.find((event) => event.id === id);

    if (targetEvent && targetSlot) {
      targetEvent.date = targetSlot.dataset.addSlot;
      targetEvent.time = `${String(targetSlot.dataset.slotHour).padStart(2, "0")}:00`;
      targetEvent.source = "local";
      this.selectedDay = this.parseLocalDate(targetEvent.date);
      this.weekStart = this.startOfWeek(this.selectedDay);
      this.writeItems("events", this.events);
      this.syncGoogleEvent(targetEvent);
    }

    this.clearDragVisuals();
    this.touch();
  },

  clearDragVisuals: function () {
    document.querySelectorAll(".hs-drop-target").forEach((target) => target.classList.remove("hs-drop-target"));
    if (this.dragState?.originBlock) {
      this.dragState.originBlock.classList.remove("hs-drag-origin");
    }
    if (this.dragState?.ghost) {
      this.dragState.ghost.remove();
    }
    if (this.boundEventDragMove) {
      document.removeEventListener("pointermove", this.boundEventDragMove);
      this.boundEventDragMove = null;
    }
    if (this.boundEventDragEnd) {
      document.removeEventListener("pointerup", this.boundEventDragEnd);
      this.boundEventDragEnd = null;
    }
    this.dragState = null;
    setTimeout(() => {
      this.suppressNextEventClick = false;
    }, 0);
  },

  slotFromPoint: function (x, y) {
    const ghost = this.dragState?.ghost;
    if (ghost) {
      ghost.style.pointerEvents = "none";
    }
    const element = document.elementFromPoint(x, y);
    if (ghost) {
      ghost.style.pointerEvents = "";
    }
    return element?.closest?.("[data-add-slot]") || null;
  },

  handleAction: function (action) {
    if (action === "previous-week") {
      this.weekStart = this.addDays(this.weekStart, -7);
      this.selectedDay = this.weekStart;
      this.requestGoogleEvents(false);
    }
    if (action === "today-week") {
      this.selectedDay = this.startOfDay(new Date());
      this.weekStart = this.startOfWeek(new Date());
      this.requestGoogleEvents(false);
    }
    if (action === "next-week") {
      this.weekStart = this.addDays(this.weekStart, 7);
      this.selectedDay = this.weekStart;
      this.requestGoogleEvents(false);
    }
    if (action === "add-event") this.openEventEditor({
      date: this.isoDate(this.selectedDay),
      time: "09:00"
    });
    if (action === "add-note") this.addNote();
    if (action === "add-chore") this.addChore();
    if (action === "add-meal") this.addMeal();
    if (action === "add-budget") this.addBudget();
    if (action === "add-transaction") this.addTransaction();
    if (action === "finance-summary") this.createFinanceSummary();
    if (action === "connect-finance") this.connectFinance();
    if (action === "sync-finance") this.requestFinanceSync(false);
    if (action === "choose-album") this.chooseAlbum();
    if (action === "cancel-editor") this.editor = null;
    this.touch();
  },

  openEventEditor: function (event) {
    this.editor = {
      id: event.id || "",
      title: event.title || "",
      date: event.date || this.isoDate(this.selectedDay),
      time: event.time || "09:00",
      durationMinutes: event.durationMinutes || 60,
      profile: event.profile || "family",
      source: event.source || "local"
    };
    this.activeSlide = 0;
    this.drawerTab = "agenda";
    this.touch();
  },

  saveEditor: function (submitEvent) {
    submitEvent.preventDefault();
    const form = submitEvent.currentTarget;
    const formData = new FormData(form);
    const saved = {
      id: this.editor.id || this.id(),
      title: String(formData.get("title") || "Untitled event").trim(),
      date: String(formData.get("date")),
      time: String(formData.get("time")),
      durationMinutes: Number(formData.get("durationMinutes")) || 60,
      profile: String(formData.get("profile") || "family"),
      source: "local"
    };

    const existing = this.events.find((event) => event.id === saved.id);
    saved.googleEventId = existing?.googleEventId || "";
    this.events = this.events.filter((event) => event.id !== saved.id).concat(saved);
    this.selectedDay = this.parseLocalDate(saved.date);
    this.weekStart = this.startOfWeek(this.selectedDay);
    this.editor = null;
    this.writeItems("events", this.events);
    this.syncGoogleEvent(saved);
    this.touch();
  },

  addNote: function () {
    const text = prompt("Add a weekly note");
    if (!text) return;
    this.notes.push({ id: this.id(), text: text.trim() });
    this.writeItems("notes", this.notes);
  },

  addChore: function () {
    const text = prompt("Add a chore");
    if (!text) return;
    this.chores.push({ id: this.id(), text: text.trim(), done: false });
    this.writeItems("chores", this.chores);
  },

  addMeal: function () {
    const text = prompt("Add dinner plan, like Mon: Chicken bowls");
    if (!text) return;
    const parts = text.split(":");
    this.meals.push({
      id: this.id(),
      day: parts.length > 1 ? parts.shift().trim().slice(0, 3) : "Any",
      text: parts.join(":").trim() || text.trim()
    });
    this.writeItems("meals", this.meals);
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
    this.transactions.push({
      id: this.id(),
      merchant,
      category,
      amount,
      date: this.isoDate(new Date()),
      source: "manual"
    });
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
    const largest = todayTransactions
      .slice()
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
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
    this.sendSocketNotification("HS_CREATE_PLAID_LINK_TOKEN");
  },

  openPlaidLink: function (linkToken) {
    if (!linkToken) {
      this.financeStatus = "Plaid did not return a Link token.";
      this.updateDom(250);
      return;
    }

    if (!window.Plaid) {
      this.financeStatus = "Plaid Link did not load. Check internet access on the Pi.";
      this.updateDom(250);
      return;
    }

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        this.financeStatus = `Connected ${metadata?.institution?.name || "bank"}. Syncing transactions...`;
        this.sendSocketNotification("HS_EXCHANGE_PLAID_PUBLIC_TOKEN", { publicToken });
      },
      onExit: () => {
        this.financeStatus = "Bank connection was closed.";
        this.updateDom(250);
      }
    });

    handler.open();
  },

  requestFinanceSync: function (resetTimer = true) {
    if (!this.config.finance?.enabled) {
      return;
    }

    this.sendSocketNotification("HS_SYNC_PLAID_TRANSACTIONS");

    if (resetTimer) {
      clearInterval(this.financeSyncTimer);
      this.financeSyncTimer = setInterval(() => {
        this.sendSocketNotification("HS_SYNC_PLAID_TRANSACTIONS");
      }, this.config.finance.syncInterval || 900000);
    }
  },

  chooseAlbum: async function () {
    if (!("showDirectoryPicker" in window)) {
      alert("Album folders require Chromium. This should work in Raspberry Pi Chromium kiosk mode.");
      return;
    }
    const directory = await window.showDirectoryPicker();
    const files = [];
    for await (const entry of directory.values()) {
      if (entry.kind === "file" && /\.(jpe?g|png|webp|gif)$/i.test(entry.name)) files.push(entry);
    }
    this.photoFiles = files;
    this.photoIndex = 0;
    this.showNextPhoto();
  },

  showNextPhoto: async function () {
    if (!this.photoFiles.length) return;
    const photo = document.querySelector(".hs-album-photo");
    const empty = document.querySelector(".hs-photo-empty");
    if (!photo || !empty) return;
    const handle = this.photoFiles[this.photoIndex % this.photoFiles.length];
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    photo.onload = () => URL.revokeObjectURL(url);
    photo.src = url;
    photo.style.display = "block";
    empty.style.display = "none";
    this.photoIndex += 1;
  },

  handleSwipe: function (event) {
    if (!this.swipeStart) return;
    const deltaX = event.clientX - this.swipeStart.x;
    const deltaY = event.clientY - this.swipeStart.y;
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
      this.setSlide(this.activeSlide + (deltaX < 0 ? 1 : -1));
    }
  },

  setSlide: function (index) {
    const maxSlide = this.slideCount() - 1;
    this.activeSlide = Math.max(0, Math.min(index, maxSlide));
    this.touch();
  },

  slideCount: function () {
    return 2
      + (this.config.enableWeather ? 1 : 0)
      + (this.config.enableFinance ? 1 : 0)
      + (this.config.enablePhotos ? 1 : 0);
  },

  touch: function () {
    this.markActivity();
    this.updateDom(250);
  },

  markActivity: function () {
    clearTimeout(this.idleTimer);
    if (!this.config.enablePhotos) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      this.activeSlide = 3;
      this.updateDom(250);
    }, this.config.idlePhotoDelay);
  },

  removeItem: function (collection, id) {
    const removed = this[collection].find((item) => item.id === id);
    this[collection] = this[collection].filter((item) => item.id !== id);
    this.writeItems(collection, this[collection]);
    if (collection === "events" && removed?.googleEventId) {
      this.sendSocketNotification("HS_DELETE_GOOGLE_EVENT", removed);
    }
    this.touch();
  },

  syncGoogleEvent: function (event) {
    if (!this.config.googleCalendar?.enabled || event.source === "calendar") {
      return;
    }

    this.sendSocketNotification("HS_UPSERT_GOOGLE_EVENT", event);
  },

  requestGoogleEvents: function (resetTimer = true) {
    if (!this.config.googleCalendar?.enabled) {
      return;
    }

    this.sendSocketNotification("HS_FETCH_GOOGLE_EVENTS", {
      weekStart: this.isoDate(this.weekStart)
    });

    if (resetTimer) {
      clearInterval(this.googleSyncTimer);
      this.googleSyncTimer = setInterval(() => {
        this.sendSocketNotification("HS_FETCH_GOOGLE_EVENTS", {
          weekStart: this.isoDate(this.weekStart)
        });
      }, this.config.googleCalendar.syncInterval || 300000);
    }
  },

  defaultEvents: function () {
    return this.config.sampleEvents.map((event) => ({
      id: this.id(),
      title: event.title,
      date: this.isoDate(this.addDays(new Date(), event.dayOffset)),
      time: event.time,
      durationMinutes: event.durationMinutes || 60,
      profile: event.profile,
      source: "sample"
    }));
  },

  normalizeCalendarEvent: function (event) {
    const start = this.parseCalendarDate(event.startDate || event.start || event.date);

    if (Number.isNaN(start.getTime())) {
      return null;
    }

    return {
      id: event.uid || event.id || `${event.title}-${start.getTime()}`,
      googleEventId: event.id || "",
      title: event.title || event.summary || "Calendar event",
      date: this.isoDate(start),
      time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      durationMinutes: this.calendarEventDuration(event, start),
      profile: event.calendarName === "family" ? "family" : "home",
      source: "calendar"
    };
  },

  parseCalendarDate: function (value) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "number") {
      return new Date(value);
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
      return new Date(Number(value));
    }

    return new Date(value);
  },

  startResize: function (event, handle) {
    event.preventDefault();
    event.stopPropagation();

    const targetEvent = this.events.find((item) => item.id === handle.dataset.resizeEvent);
    if (!targetEvent) return;

    this.resizeState = {
      id: targetEvent.id,
      edge: handle.dataset.resizeEdge,
      startY: event.clientY,
      originalMinutes: this.timeToMinutes(targetEvent.time),
      originalDuration: targetEvent.durationMinutes || 60
    };

    document.addEventListener("pointermove", this.boundResizeMove = (moveEvent) => this.resizeMove(moveEvent));
    document.addEventListener("pointerup", this.boundResizeEnd = () => this.resizeEnd());
  },

  resizeMove: function (event) {
    if (!this.resizeState) return;
    const targetEvent = this.events.find((item) => item.id === this.resizeState.id);
    if (!targetEvent) return;

    const minutesDelta = Math.round((event.clientY - this.resizeState.startY) / 12) * 15;

    if (this.resizeState.edge === "bottom") {
      targetEvent.durationMinutes = Math.max(15, this.resizeState.originalDuration + minutesDelta);
    } else {
      const newStart = this.clampMinutes(this.resizeState.originalMinutes + minutesDelta);
      const end = this.resizeState.originalMinutes + this.resizeState.originalDuration;
      targetEvent.time = this.minutesToTime(newStart);
      targetEvent.durationMinutes = Math.max(15, end - newStart);
    }
  },

  resizeEnd: function () {
    if (!this.resizeState) return;
    const targetEvent = this.events.find((item) => item.id === this.resizeState.id);
    document.removeEventListener("pointermove", this.boundResizeMove);
    document.removeEventListener("pointerup", this.boundResizeEnd);
    this.resizeState = null;
    this.writeItems("events", this.events);
    if (targetEvent) this.syncGoogleEvent(targetEvent);
    this.touch();
  },

  readItems: function (name, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`MMM-HomeScheduler.${name}`)) || fallback;
    } catch (error) {
      return fallback;
    }
  },

  writeItems: function (name, value) {
    localStorage.setItem(`MMM-HomeScheduler.${name}`, JSON.stringify(value));
  },

  defaultBudgets: function () {
    return this.config.sampleBudgets.map((budget) => ({
      id: this.id(),
      ...budget
    }));
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
    return Array.from(totals, ([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  },

  financeInsight: function (todayTotal, remaining, progress) {
    if (remaining < 0) {
      return `You are ${this.formatMoney(Math.abs(remaining))} over budget this month.`;
    }

    if (todayTotal === 0) {
      return `No spending logged today. Monthly budget progress is ${progress}%.`;
    }

    return `Today is at ${this.formatMoney(todayTotal)}. Monthly budget progress is ${progress}% with ${this.formatMoney(remaining)} remaining.`;
  },

  formatMoney: function (value) {
    return new Intl.NumberFormat([], {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  },

  eventsForDay: function (day) {
    return this.events.filter((event) => event.date === this.isoDate(day));
  },

  startOfDay: function (date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  },

  startOfWeek: function (date) {
    const next = this.startOfDay(date);
    next.setDate(next.getDate() - next.getDay());
    return next;
  },

  addDays: function (date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  },

  isoDate: function (date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  parseLocalDate: function (value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  },

  sameDay: function (a, b) {
    return this.isoDate(a) === this.isoDate(b);
  },

  formatTime: function (date) {
    return new Intl.DateTimeFormat([], {
      hour: "numeric",
      hour12: true,
      minute: "2-digit"
    }).format(date).replace(" AM", " am").replace(" PM", " pm");
  },

  formatEventTime: function (time) {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return this.formatTime(date);
  },

  eventTimeRange: function (event) {
    const start = this.timeToMinutes(event.time);
    const end = start + (event.durationMinutes || 60);
    return `${this.formatEventTime(event.time)} - ${this.formatEventTime(this.minutesToTime(end))}`;
  },

  eventBlockHeight: function (event) {
    return Math.max(34, Math.min(120, Math.round((event.durationMinutes || 60) * 0.65)));
  },

  calendarEventDuration: function (event, start) {
    const endValue = event.endDate || event.end;
    if (!endValue) return 60;
    const end = this.parseCalendarDate(endValue);
    if (Number.isNaN(end.getTime())) return 60;
    return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
  },

  timeToMinutes: function (time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  },

  minutesToTime: function (minutes) {
    const clamped = this.clampMinutes(minutes);
    const hours = Math.floor(clamped / 60);
    const mins = clamped % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  },

  clampMinutes: function (minutes) {
    return Math.max(0, Math.min(23 * 60 + 45, minutes));
  },

  formatHour: function (hour) {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return new Intl.DateTimeFormat([], {
      hour: "numeric",
      hour12: true
    }).format(date).replace(" AM", " am").replace(" PM", " pm");
  },

  formatShortDate: function (date) {
    return new Intl.DateTimeFormat([], { month: "short", day: "numeric" }).format(date);
  },

  profileLabel: function (id) {
    const profile = this.config.profiles.find((item) => item.id === id);
    return profile ? profile.label : "Family";
  },

  label: function (value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
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
