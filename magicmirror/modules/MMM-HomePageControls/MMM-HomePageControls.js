Module.register("MMM-HomePageControls", {
  defaults: {
    pages: [
      { label: "Home", icon: "home" },
      { label: "Calendar", icon: "calendar" },
      { label: "Finance", icon: "finance" },
      { label: "Notes", icon: "notes" }
    ]
  },

  start: function () {
    this.currentPage = 0;
    this.maxPages = this.pages().length;
    this.sendNotification("QUERY_PAGE_NUMBER");
  },

  getStyles: function () {
    return ["MMM-HomePageControls.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("nav");
    wrapper.className = "hpc-controls";
    const pages = this.pages();
    const total = Math.max(this.maxPages, pages.length);
    const label = pages[this.currentPage]?.label || `Page ${this.currentPage + 1}`;

    wrapper.innerHTML = `
      <div class="hpc-status" aria-live="polite">
        <strong>${this.escape(label)}</strong>
        <span>${this.currentPage + 1} / ${total}</span>
      </div>
      <div class="hpc-page-list">
        ${pages.map((page, index) => `
          <button class="hpc-page ${index === this.currentPage ? "active" : ""}" data-page="${index}" type="button" aria-label="Open ${this.escape(page.label)}">
            ${this.icon(page.icon)}
            <span>${this.escape(page.label)}</span>
          </button>
        `).join("")}
      </div>
      <div class="hpc-cycle-row">
        <button class="hpc-cycle" data-page-prev type="button" aria-label="Previous feature">${this.icon("previous")}</button>
        <button class="hpc-cycle" data-page-next type="button" aria-label="Next feature">${this.icon("next")}</button>
      </div>
    `;

    wrapper.querySelector("[data-page-prev]").addEventListener("click", () => this.sendNotification("PAGE_DECREMENT"));
    wrapper.querySelector("[data-page-next]").addEventListener("click", () => this.sendNotification("PAGE_INCREMENT"));
    wrapper.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => this.setPage(Number(button.dataset.page)));
    });

    return wrapper;
  },

  notificationReceived: function (notification, payload) {
    if (notification === "NEW_PAGE" || notification === "PAGE_NUMBER_IS") {
      this.currentPage = Number(payload) || 0;
      this.updateDom(150);
    }

    if (notification === "MAX_PAGES_CHANGED") {
      this.maxPages = Number(payload) || this.pages().length;
    }
  },

  setPage: function (pageIndex) {
    this.currentPage = pageIndex;
    this.updateDom(100);
    this.sendNotification("PAGE_CHANGED", pageIndex);
  },

  pages: function () {
    if (Array.isArray(this.config.pages) && this.config.pages.length) {
      return this.config.pages;
    }

    return (this.config.labels || []).map((label) => ({ label, icon: String(label).toLowerCase() }));
  },

  icon: function (name) {
    const icons = {
      home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2v8.3a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5v-8.3Z"/></svg>`,
      calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v3h6V2h2v3h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3V2Zm12 9H5v8h14v-8ZM5 9h14V7H5v2Z"/></svg>`,
      finance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16v2H4v-2Zm1-7h3v6H5v-6Zm5-4h3v10h-3V8Zm5 3h3v7h-3v-7ZM4 6l8-4 8 4v2H4V6Z"/></svg>`,
      notes: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.5V8h3.5L14 4.5ZM8 11v2h8v-2H8Zm0 4v2h6v-2H8Z"/></svg>`,
      previous: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7 1.8-1.8-5.2-5.2 5.2-5.2L14.5 5Z"/></svg>`,
      next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 19 7-7-7-7-1.8 1.8 5.2 5.2-5.2 5.2L9.5 19Z"/></svg>`
    };

    return icons[name] || icons.home;
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
