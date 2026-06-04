Module.register("MMM-HomePageControls", {
  defaults: {
    labels: ["Calendar", "Finance", "Notes"]
  },

  start: function () {
    this.currentPage = 0;
    this.maxPages = this.config.labels.length;
  },

  getStyles: function () {
    return ["MMM-HomePageControls.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("nav");
    wrapper.className = "hpc-controls";
    const label = this.config.labels[this.currentPage] || `Page ${this.currentPage + 1}`;
    const total = Math.max(this.maxPages, this.config.labels.length);
    wrapper.innerHTML = `
      <button class="hpc-arrow" data-page-prev type="button" aria-label="Previous page">Prev</button>
      <div class="hpc-status">
        <strong>${this.escape(label)}</strong>
        <span>${this.currentPage + 1} / ${total}</span>
      </div>
      <button class="hpc-arrow" data-page-next type="button" aria-label="Next page">Next</button>
    `;

    wrapper.querySelector("[data-page-prev]").addEventListener("click", () => this.sendNotification("PAGE_DECREMENT"));
    wrapper.querySelector("[data-page-next]").addEventListener("click", () => this.sendNotification("PAGE_INCREMENT"));

    return wrapper;
  },

  notificationReceived: function (notification, payload) {
    if (notification === "NEW_PAGE" || notification === "PAGE_NUMBER_IS") {
      this.currentPage = Number(payload) || 0;
      this.updateDom(150);
    }

    if (notification === "MAX_PAGES_CHANGED") {
      this.maxPages = Number(payload) || this.config.labels.length;
    }
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
