Module.register("MMM-HomeScheduler", {
  defaults: {
    title: "Home Scheduler",
    displayMode: "auto",
    idlePhotoDelay: 45000,
    photoRotationDelay: 15000,
    useCalendarBroadcasts: true,
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
    this.editor = null;
    this.keyboardTarget = null;
    this.resizeState = null;
    this.dragState = null;
    this.dragPressTimer = null;
    this.suppressNextEventClick = false;
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

    if (!calendarEvents.length) {
      return;
    }

    this.events = this.events
      .filter((event) => event.source !== "calendar" && event.source !== "sample")
      .concat(calendarEvents);
    this.updateDom(250);
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
    }
    if (action === "today-week") {
      this.selectedDay = this.startOfDay(new Date());
      this.weekStart = this.startOfWeek(new Date());
    }
    if (action === "next-week") {
      this.weekStart = this.addDays(this.weekStart, 7);
      this.selectedDay = this.weekStart;
    }
    if (action === "add-event") this.openEventEditor({
      date: this.isoDate(this.selectedDay),
      time: "09:00"
    });
    if (action === "add-note") this.addNote();
    if (action === "add-chore") this.addChore();
    if (action === "add-meal") this.addMeal();
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

    this.events = this.events.filter((event) => event.id !== saved.id).concat(saved);
    this.selectedDay = this.parseLocalDate(saved.date);
    this.weekStart = this.startOfWeek(this.selectedDay);
    this.editor = null;
    this.writeItems("events", this.events);
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
      durationMinutes: event.durationMinutes || 60,
      profile: event.profile,
      source: "sample"
    }));
  },

  normalizeCalendarEvent: function (event) {
    const start = new Date(event.startDate || event.start || event.date);

    if (Number.isNaN(start.getTime())) {
      return null;
    }

    return {
      id: event.uid || event.id || `${event.title}-${start.getTime()}`,
      title: event.title || event.summary || "Calendar event",
      date: this.isoDate(start),
      time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      durationMinutes: this.calendarEventDuration(event, start),
      profile: event.calendarName === "family" ? "family" : "home",
      source: "calendar"
    };
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
    document.removeEventListener("pointermove", this.boundResizeMove);
    document.removeEventListener("pointerup", this.boundResizeEnd);
    this.resizeState = null;
    this.writeItems("events", this.events);
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
    const end = new Date(endValue);
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
