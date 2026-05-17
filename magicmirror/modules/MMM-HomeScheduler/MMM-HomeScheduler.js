Module.register("MMM-HomeScheduler", {
  defaults: {
    title: "Home Scheduler",
    idlePhotoDelay: 45000,
    photoRotationDelay: 15000,
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
    ]
  },

  start: function () {
    this.activeSlide = 0;
    this.drawerTab = "agenda";
    this.selectedDay = this.startOfDay(new Date());
    this.weekStart = this.startOfWeek(new Date());
    this.photoFiles = [];
    this.photoIndex = 0;
    this.idleTimer = null;
    this.photoTimer = null;
    this.events = this.readItems("events", this.defaultEvents());
    this.notes = this.readItems("notes", this.config.sampleNotes.map((text) => ({ id: this.id(), text })));
    this.chores = this.readItems("chores", this.config.sampleChores.map((chore) => ({ id: this.id(), ...chore })));
    this.meals = this.readItems("meals", this.config.sampleMeals.map((meal) => ({ id: this.id(), ...meal })));
    this.markActivity();
    this.photoTimer = setInterval(() => this.showNextPhoto(), this.config.photoRotationDelay);
  },

  getStyles: function () {
    return ["MMM-HomeScheduler.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "hs-shell";
    wrapper.innerHTML = this.renderShell();
    this.bindDom(wrapper);
    return wrapper;
  },

  suspend: function () {
    clearTimeout(this.idleTimer);
    clearInterval(this.photoTimer);
  },

  resume: function () {
    this.markActivity();
    this.photoTimer = setInterval(() => this.showNextPhoto(), this.config.photoRotationDelay);
  },

  renderShell: function () {
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
          ${this.renderCalendar()}
          ${this.renderWeather()}
          ${this.renderNotesSlide()}
          ${this.renderPhotos()}
        </div>
      </section>
      <nav class="hs-dock">
        ${["Calendar", "Weather", "Notes", "Photos"].map((label, index) => `
          <button class="${index === this.activeSlide ? "active" : ""}" data-slide="${index}" type="button">${label}</button>
        `).join("")}
      </nav>
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
          ${hours.map((hour) => this.renderTimeSlot(dayEvents, hour)).join("")}
        </div>
      `;
    }).join("");
    return `<div class="hs-week-grid">${timeColumn}${dayColumns}</div>`;
  },

  renderTimeSlot: function (dayEvents, hour) {
    const blocks = dayEvents.filter((event) => {
      const eventHour = Number(event.time.split(":")[0]);
      return eventHour >= hour && eventHour < hour + 3;
    }).map((event) => `
      <div class="hs-block ${event.profile || "family"}">
        <span>${this.formatEventTime(event.time)} / ${this.profileLabel(event.profile)}</span>
        <strong>${this.escape(event.title)}</strong>
      </div>
    `).join("");
    return `<div class="hs-slot">${blocks}</div>`;
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
    wrapper.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => this.handleAction(button.dataset.action));
    });
    this.bindRemoveButtons(wrapper);
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
  },

  handleAction: function (action) {
    if (action === "previous-week") {
      this.weekStart = this.addDays(this.weekStart, -7);
      this.selectedDay = this.weekStart;
    }
    if (action === "today-week") {
      this.selectedDay = this.startOfDay(new Date());
      this.weekStart = this.startOfWeek(new Date());
    }
    if (action === "next-week") {
      this.weekStart = this.addDays(this.weekStart, 7);
      this.selectedDay = this.weekStart;
    }
    if (action === "add-event") this.addEvent();
    if (action === "add-note") this.addNote();
    if (action === "add-chore") this.addChore();
    if (action === "add-meal") this.addMeal();
    if (action === "choose-album") this.chooseAlbum();
    this.touch();
  },

  addEvent: function () {
    const title = prompt("Event title");
    if (!title) return;
    const time = prompt("Event time, like 18:30", "09:00") || "09:00";
    const profile = prompt("Profile: family, home, kids, meal", "family") || "family";
    this.events.push({ id: this.id(), title: title.trim(), date: this.isoDate(this.selectedDay), time, profile });
    this.writeItems("events", this.events);
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
    this.activeSlide = Math.max(0, Math.min(index, 3));
    this.touch();
  },

  touch: function () {
    this.markActivity();
    this.updateDom(250);
  },

  markActivity: function () {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.activeSlide = 3;
      this.updateDom(250);
    }, this.config.idlePhotoDelay);
  },

  removeItem: function (collection, id) {
    this[collection] = this[collection].filter((item) => item.id !== id);
    this.writeItems(collection, this[collection]);
    this.touch();
  },

  defaultEvents: function () {
    return this.config.sampleEvents.map((event) => ({
      id: this.id(),
      title: event.title,
      date: this.isoDate(this.addDays(new Date(), event.dayOffset)),
      time: event.time,
      profile: event.profile
    }));
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
    return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
  },

  formatEventTime: function (time) {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return this.formatTime(date);
  },

  formatHour: function (hour) {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return new Intl.DateTimeFormat([], { hour: "numeric" }).format(date);
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
