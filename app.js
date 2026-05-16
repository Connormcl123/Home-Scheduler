const storageKeys = {
  events: "homeMirror.events",
  notes: "homeMirror.notes",
  chores: "homeMirror.chores",
  meals: "homeMirror.meals"
};

const state = {
  activeSlide: 0,
  selectedDay: startOfDay(new Date()),
  weekStart: startOfWeek(new Date()),
  drawerTab: "agenda",
  photoFiles: [],
  photoIndex: 0,
  idleTimer: null
};

const slides = document.querySelector("#slides");
const dockButtons = [...document.querySelectorAll(".dock-button")];
const weekGrid = document.querySelector("#week-grid");
const eventList = document.querySelector("#event-list");
const selectedDayLabel = document.querySelector("#selected-day");
const notesList = document.querySelector("#notes-list");
const calendarNotesList = document.querySelector("#calendar-notes-list");
const choreList = document.querySelector("#chore-list");
const mealList = document.querySelector("#meal-list");
const eventDialog = document.querySelector("#event-dialog");
const eventForm = document.querySelector("#event-form");
const albumPhoto = document.querySelector("#album-photo");
const photoEmpty = document.querySelector("#photo-empty");

let events = readJson(storageKeys.events, [
  { id: crypto.randomUUID(), title: "Family dinner", date: isoDate(new Date()), time: "18:30", profile: "meal" },
  { id: crypto.randomUUID(), title: "Trash and recycling", date: isoDate(addDays(new Date(), 1)), time: "07:00", profile: "home" },
  { id: crypto.randomUUID(), title: "Soccer practice", date: isoDate(addDays(new Date(), 2)), time: "17:00", profile: "kids" }
]);

let notes = readJson(storageKeys.notes, [
  { id: crypto.randomUUID(), text: "Plan groceries for the week" },
  { id: crypto.randomUUID(), text: "Pick a photo album folder for idle mode" }
]);

let chores = readJson(storageKeys.chores, [
  { id: crypto.randomUUID(), text: "Unload dishwasher", done: false },
  { id: crypto.randomUUID(), text: "Take out trash", done: false },
  { id: crypto.randomUUID(), text: "Water plants", done: true }
]);

let meals = readJson(storageKeys.meals, [
  { id: crypto.randomUUID(), day: "Mon", text: "Taco bowls" },
  { id: crypto.randomUUID(), day: "Tue", text: "Pasta night" },
  { id: crypto.randomUUID(), day: "Fri", text: "Pizza and movie" }
]);

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function updateClock() {
  const now = new Date();
  document.querySelector("#clock").textContent = new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(now);
  document.querySelector("#weekday").textContent = new Intl.DateTimeFormat([], { weekday: "long" }).format(now);
  document.querySelector("#today").textContent = new Intl.DateTimeFormat([], {
    month: "long",
    day: "numeric"
  }).format(now);
}

function renderWeekGrid() {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const hours = [6, 9, 12, 15, 18, 21];
  const weekEnd = addDays(state.weekStart, 6);

  document.querySelector("#week-title").textContent = `${new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric"
  }).format(state.weekStart)} - ${new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric"
  }).format(weekEnd)}`;

  const timeColumn = document.createElement("div");
  timeColumn.className = "time-column";
  timeColumn.innerHTML = `<div class="time-spacer"></div>${hours.map((hour) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return `<div class="time-label">${new Intl.DateTimeFormat([], { hour: "numeric" }).format(date)}</div>`;
  }).join("")}`;

  const columns = days.map((day) => {
    const column = document.createElement("div");
    column.className = "day-column";
    const selected = isoDate(day) === isoDate(state.selectedDay);
    const dayEvents = eventsForDay(day);

    column.innerHTML = `
      <button class="day-header ${selected ? "active" : ""}" type="button">
        <span>${new Intl.DateTimeFormat([], { weekday: "short" }).format(day)}</span>
        <strong>${day.getDate()}</strong>
      </button>
      ${hours.map((hour) => renderTimeSlot(dayEvents, hour)).join("")}
    `;

    column.querySelector(".day-header").addEventListener("click", () => {
      state.selectedDay = day;
      state.drawerTab = "agenda";
      renderCalendar();
      markActivity();
    });

    column.querySelectorAll(".time-slot").forEach((slot) => {
      slot.addEventListener("click", () => {
      state.selectedDay = day;
        state.drawerTab = "agenda";
        renderCalendar();
      markActivity();
    });
    });

    return column;
  });

  weekGrid.replaceChildren(timeColumn, ...columns);
}

function renderEvents() {
  const selected = isoDate(state.selectedDay);
  const dayEvents = eventsForDay(state.selectedDay)
    .sort((a, b) => a.time.localeCompare(b.time));

  selectedDayLabel.textContent = new Intl.DateTimeFormat([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(state.selectedDay);

  if (!dayEvents.length) {
    eventList.innerHTML = `<div class="event-card"><div><span>No events yet</span><strong>Tap + to add one</strong></div></div>`;
    return;
  }

  eventList.replaceChildren(...dayEvents.map((event) => {
    const card = document.createElement("div");
    card.className = "event-card";
    card.style.borderLeftColor = profileColor(event.profile);
    card.innerHTML = `
      <div>
        <span>${formatTime(event.time)} / ${profileName(event.profile)}</span>
        <strong>${escapeHtml(event.title)}</strong>
      </div>
      <button class="remove-button" type="button" aria-label="Remove ${escapeHtml(event.title)}">x</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      events = events.filter((item) => item.id !== event.id);
      writeJson(storageKeys.events, events);
      renderCalendar();
      markActivity();
    });
    return card;
  }));
}

function renderTimeSlot(dayEvents, hour) {
  const slotEvents = dayEvents.filter((event) => {
    const eventHour = Number(event.time.split(":")[0]);
    return eventHour >= hour && eventHour < hour + 3;
  });

  const blocks = slotEvents.map((event) => `
    <div class="schedule-block ${event.profile || "family"}">
      <span>${formatTime(event.time)} / ${profileName(event.profile)}</span>
      <strong>${escapeHtml(event.title)}</strong>
    </div>
  `).join("");

  return `<div class="time-slot">${blocks}</div>`;
}

function eventsForDay(day) {
  const selected = isoDate(day);
  return events.filter((event) => event.date === selected);
}

function renderNotes() {
  if (!notes.length) {
    const empty = `<div class="note-card"><div><span>No notes yet</span><strong>Tap + to add one</strong></div></div>`;
    notesList.innerHTML = empty;
    calendarNotesList.innerHTML = empty;
    return;
  }

  notesList.replaceChildren(...notes.map(createNoteCard));
  calendarNotesList.replaceChildren(...notes.map(createNoteCard));
}

function createNoteCard(note) {
    const card = document.createElement("div");
    card.className = "note-card";
    card.innerHTML = `
      <div>
        <span>This week</span>
        <strong>${escapeHtml(note.text)}</strong>
      </div>
      <button class="remove-button" type="button" aria-label="Remove note">x</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      notes = notes.filter((item) => item.id !== note.id);
      writeJson(storageKeys.notes, notes);
      renderNotes();
      markActivity();
    });
    return card;
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function profileName(profile = "family") {
  return {
    family: "Family",
    home: "Home",
    kids: "Kids",
    meal: "Meals"
  }[profile] || "Family";
}

function profileColor(profile = "family") {
  return {
    family: "var(--family)",
    home: "var(--home)",
    kids: "var(--kids)",
    meal: "var(--meal)"
  }[profile] || "var(--family)";
}

function renderDrawerTabs() {
  document.querySelectorAll(".drawer-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerTab === state.drawerTab);
  });

  document.querySelectorAll(".drawer-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `drawer-${state.drawerTab}`);
  });
}

function renderChores() {
  choreList.replaceChildren(...chores.map((chore) => {
    const card = document.createElement("div");
    card.className = `task-card ${chore.done ? "done" : ""}`;
    card.innerHTML = `
      <button class="task-check" type="button" aria-label="Toggle chore">${chore.done ? "OK" : ""}</button>
      <div>
        <span>House task</span>
        <strong>${escapeHtml(chore.text)}</strong>
      </div>
      <button class="remove-button" type="button" aria-label="Remove chore">x</button>
    `;
    card.querySelector(".task-check").addEventListener("click", () => {
      chore.done = !chore.done;
      writeJson(storageKeys.chores, chores);
      renderChores();
      markActivity();
    });
    card.querySelector(".remove-button").addEventListener("click", () => {
      chores = chores.filter((item) => item.id !== chore.id);
      writeJson(storageKeys.chores, chores);
      renderChores();
      markActivity();
    });
    return card;
  }));
}

function renderMeals() {
  mealList.replaceChildren(...meals.map((meal) => {
    const card = document.createElement("div");
    card.className = "meal-card";
    card.innerHTML = `
      <span class="profile-chip meal">${escapeHtml(meal.day)}</span>
      <div>
        <span>Dinner</span>
        <strong>${escapeHtml(meal.text)}</strong>
      </div>
      <button class="remove-button" type="button" aria-label="Remove meal">x</button>
    `;
    card.querySelector(".remove-button").addEventListener("click", () => {
      meals = meals.filter((item) => item.id !== meal.id);
      writeJson(storageKeys.meals, meals);
      renderMeals();
      markActivity();
    });
    return card;
  }));
}

function renderCalendar() {
  renderWeekGrid();
  renderEvents();
  renderDrawerTabs();
}

function goToSlide(index) {
  state.activeSlide = Math.max(0, Math.min(index, dockButtons.length - 1));
  slides.style.transform = `translateX(-${state.activeSlide * 100}%)`;
  dockButtons.forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === state.activeSlide);
  });
}

function markActivity() {
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => goToSlide(3), 45000);
}

function attachSwipe() {
  const viewport = document.querySelector("#viewport");
  let startX = 0;
  let startY = 0;

  viewport.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
  });

  viewport.addEventListener("pointerup", (event) => {
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
      goToSlide(state.activeSlide + (deltaX < 0 ? 1 : -1));
      markActivity();
    }
  });
}

async function chooseAlbum() {
  markActivity();
  if (!("showDirectoryPicker" in window)) {
    alert("Album folders are supported in Chromium-based browsers. On Raspberry Pi, run this in Chromium kiosk mode.");
    return;
  }

  const directory = await window.showDirectoryPicker();
  const files = [];

  for await (const entry of directory.values()) {
    if (entry.kind === "file" && /\.(jpe?g|png|webp|gif)$/i.test(entry.name)) {
      files.push(entry);
    }
  }

  state.photoFiles = files;
  state.photoIndex = 0;
  showNextPhoto();
}

async function showNextPhoto() {
  if (!state.photoFiles.length) return;
  const handle = state.photoFiles[state.photoIndex % state.photoFiles.length];
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  albumPhoto.onload = () => URL.revokeObjectURL(url);
  albumPhoto.src = url;
  albumPhoto.style.display = "block";
  photoEmpty.style.display = "none";
  state.photoIndex += 1;
}

function bindEvents() {
  document.querySelector("#add-event").addEventListener("click", () => {
    document.querySelector("#event-date").value = isoDate(state.selectedDay);
    document.querySelector("#event-time").value = "09:00";
    document.querySelector("#event-profile").value = "family";
    eventDialog.showModal();
  });

  document.querySelector("#cancel-event").addEventListener("click", () => eventDialog.close());

  eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    events.push({
      id: crypto.randomUUID(),
      title: document.querySelector("#event-title").value.trim(),
      date: document.querySelector("#event-date").value,
      time: document.querySelector("#event-time").value,
      profile: document.querySelector("#event-profile").value
    });
    writeJson(storageKeys.events, events);
    state.selectedDay = startOfDay(parseLocalDate(document.querySelector("#event-date").value));
    state.weekStart = startOfWeek(state.selectedDay);
    eventForm.reset();
    eventDialog.close();
    renderCalendar();
    markActivity();
  });

  document.querySelector("#add-note").addEventListener("click", () => {
    const text = prompt("Add a weekly note");
    if (!text?.trim()) return;
    notes.push({ id: crypto.randomUUID(), text: text.trim() });
    writeJson(storageKeys.notes, notes);
    renderNotes();
    markActivity();
  });

  document.querySelector("#add-calendar-note").addEventListener("click", () => {
    document.querySelector("#add-note").click();
  });

  document.querySelector("#add-chore").addEventListener("click", () => {
    const text = prompt("Add a chore");
    if (!text?.trim()) return;
    chores.push({ id: crypto.randomUUID(), text: text.trim(), done: false });
    writeJson(storageKeys.chores, chores);
    renderChores();
    markActivity();
  });

  document.querySelector("#add-meal").addEventListener("click", () => {
    const text = prompt("Add dinner plan, like Mon: Chicken bowls");
    if (!text?.trim()) return;
    const [day, ...mealParts] = text.split(":");
    meals.push({
      id: crypto.randomUUID(),
      day: mealParts.length ? day.trim().slice(0, 3) : "Any",
      text: (mealParts.length ? mealParts.join(":") : text).trim()
    });
    writeJson(storageKeys.meals, meals);
    renderMeals();
    markActivity();
  });

  document.querySelector("#previous-week").addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    state.selectedDay = state.weekStart;
    renderCalendar();
    markActivity();
  });

  document.querySelector("#today-week").addEventListener("click", () => {
    state.selectedDay = startOfDay(new Date());
    state.weekStart = startOfWeek(new Date());
    renderCalendar();
    markActivity();
  });

  document.querySelector("#next-week").addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    state.selectedDay = state.weekStart;
    renderCalendar();
    markActivity();
  });

  document.querySelectorAll(".drawer-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.drawerTab = button.dataset.drawerTab;
      renderDrawerTabs();
      markActivity();
    });
  });

  document.querySelector("#choose-album").addEventListener("click", chooseAlbum);
  dockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      goToSlide(Number(button.dataset.slide));
      markActivity();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") goToSlide(state.activeSlide + 1);
    if (event.key === "ArrowLeft") goToSlide(state.activeSlide - 1);
    markActivity();
  });

  document.addEventListener("pointerdown", markActivity);
}

updateClock();
renderCalendar();
renderNotes();
renderChores();
renderMeals();
attachSwipe();
bindEvents();
goToSlide(0);
markActivity();

setInterval(updateClock, 1000);
setInterval(showNextPhoto, 15000);
