Module.register("MMM-HomePageControls", {
  defaults: {
    labels: ["Calendar", "Finance", "Notes"],
    swipeThreshold: 70
  },

  start: function () {
    this.currentPage = 0;
    this.maxPages = this.config.labels.length;
    this.swipeStart = null;
  },

  getStyles: function () {
    return ["MMM-HomePageControls.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("nav");
    wrapper.className = "hpc-controls";
    wrapper.innerHTML = `
      <button data-page-prev type="button">Prev</button>
      <div class="hpc-pills">
        ${this.config.labels.map((label, index) => `
          <button class="${index === this.currentPage ? "active" : ""}" data-page-select="${index}" type="button">${this.escape(label)}</button>
        `).join("")}
      </div>
      <button data-page-next type="button">Next</button>
    `;

    wrapper.querySelector("[data-page-prev]").addEventListener("click", () => this.sendNotification("PAGE_DECREMENT"));
    wrapper.querySelector("[data-page-next]").addEventListener("click", () => this.sendNotification("PAGE_INCREMENT"));
    wrapper.querySelectorAll("[data-page-select]").forEach((button) => {
      button.addEventListener("click", () => this.sendNotification("PAGE_SELECT", Number(button.dataset.pageSelect)));
    });

    return wrapper;
  },

  notificationReceived: function (notification, payload) {
    if (notification === "DOM_OBJECTS_CREATED") {
      document.body.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button, input, select, textarea, [data-event-id], [data-resize-event], [data-add-slot]")) {
          this.swipeStart = null;
          return;
        }
        this.swipeStart = { x: event.clientX, y: event.clientY };
      });
      document.body.addEventListener("pointerup", (event) => this.handleSwipe(event));
    }

    if (notification === "NEW_PAGE" || notification === "PAGE_NUMBER_IS") {
      this.currentPage = Number(payload) || 0;
      this.updateDom(150);
    }

    if (notification === "MAX_PAGES_CHANGED") {
      this.maxPages = Number(payload) || this.config.labels.length;
    }
  },

  handleSwipe: function (event) {
    if (!this.swipeStart) return;
    const deltaX = event.clientX - this.swipeStart.x;
    const deltaY = event.clientY - this.swipeStart.y;
    this.swipeStart = null;

    if (Math.abs(deltaX) < this.config.swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    this.sendNotification(deltaX < 0 ? "PAGE_INCREMENT" : "PAGE_DECREMENT");
  },

  escape: function (value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[character]);
  }
});
