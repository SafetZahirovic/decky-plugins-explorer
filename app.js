(function () {
  "use strict";

  const state = { plugins: [], filtered: [] };

  const grid = document.getElementById("grid");
  const searchInput = document.getElementById("search");
  const sortSelect = document.getElementById("sort");
  const statsEl = document.getElementById("stats");
  const emptyState = document.getElementById("empty-state");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getDescription(entry) {
    const p = entry.plugin || {};
    const pub = p.publish || {};
    if (typeof pub.description === "string" && pub.description.trim()) return pub.description;
    if (typeof p.description === "string" && p.description.trim()) return p.description;
    return "No description provided.";
  }

  function getTags(entry) {
    const p = entry.plugin || {};
    const pub = p.publish || {};
    if (Array.isArray(pub.tags)) return pub.tags.filter((t) => typeof t === "string");
    if (Array.isArray(p.tags)) return p.tags.filter((t) => typeof t === "string");
    return [];
  }

  function cardTemplate(entry) {
    const p = entry.plugin || {};
    const name = escapeHtml(p.name || entry.repo);
    const author = escapeHtml(typeof p.author === "string" && p.author ? p.author : entry.repo.split("/")[0]);
    const desc = escapeHtml(getDescription(entry));
    const tags = getTags(entry).slice(0, 6).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const stars = typeof entry.stars === "number" ? `★ ${entry.stars}` : "";

    let installBlock = "";
    if (entry.install_script) {
      const cmd = escapeHtml(entry.install_script.command);
      installBlock = `
        <div class="install-block">
          <span class="install-label">Install (Linux)</span>
          <code>${cmd}</code>
          <button class="copy-btn" data-cmd="${cmd}">Copy</button>
        </div>`;
    }

    const readmeDisabled = entry.readme && entry.readme.markdown ? "" : "disabled";

    return `
      <article class="card" data-repo="${escapeHtml(entry.repo)}">
        <div class="card-title-row">
          <h3><a href="${entry.url}" target="_blank" rel="noopener">${name}</a></h3>
          <span class="stars">${stars}</span>
        </div>
        <div class="author">by ${author}</div>
        <p class="description">${desc}</p>
        <div class="tags">${tags}</div>
        ${installBlock}
        <div class="card-actions">
          <button class="btn primary readme-btn" ${readmeDisabled}>README</button>
          <a class="btn" href="${entry.url}" target="_blank" rel="noopener">View on GitHub</a>
        </div>
      </article>`;
  }

  function render() {
    if (state.filtered.length === 0) {
      grid.innerHTML = "";
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    grid.innerHTML = state.filtered.map(cardTemplate).join("");
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    let list = state.plugins;
    if (q) {
      list = list.filter((entry) => {
        const p = entry.plugin || {};
        const haystack = [
          p.name,
          typeof p.author === "string" ? p.author : null,
          entry.repo,
          getDescription(entry),
          ...getTags(entry),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    const sortBy = sortSelect.value;
    list = list.slice().sort((a, b) => {
      if (sortBy === "stars") return (b.stars || 0) - (a.stars || 0);
      const an = (a.plugin && a.plugin.name) || a.repo;
      const bn = (b.plugin && b.plugin.name) || b.repo;
      return an.localeCompare(bn);
    });

    state.filtered = list;
    statsEl.textContent = `Showing ${list.length} of ${state.plugins.length} plugins`;
    render();
  }

  function openReadme(entry) {
    const p = entry.plugin || {};
    const readme = entry.readme;
    const rawHtml = window.marked.parse(readme.markdown || "");
    const safeHtml = window.DOMPurify.sanitize(rawHtml, { ADD_ATTR: ["target"] });

    let installHtml = "";
    if (entry.install_script) {
      const cmd = escapeHtml(entry.install_script.command);
      installHtml = `
        <div class="install-block" style="margin-bottom:20px;">
          <span class="install-label">Install (Linux)</span>
          <code>${cmd}</code>
          <button class="copy-btn" data-cmd="${cmd}">Copy</button>
        </div>`;
    }

    modalBody.innerHTML = `
      <div class="modal-header">
        <h2>${escapeHtml(p.name || entry.repo)}</h2>
        <div class="meta">
          <a href="${entry.url}" target="_blank" rel="noopener">${escapeHtml(entry.repo)}</a>
          &middot; <a href="${readme.html_url}" target="_blank" rel="noopener">view on GitHub</a>
        </div>
      </div>
      ${installHtml}
      ${safeHtml}
    `;
    modalBackdrop.hidden = false;
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    modalBody.innerHTML = "";
  }

  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = original), 1200);
  }

  grid.addEventListener("click", (e) => {
    const copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) {
      copyToClipboard(copyBtn.dataset.cmd, copyBtn);
      return;
    }
    const readmeBtn = e.target.closest(".readme-btn");
    if (readmeBtn) {
      const card = e.target.closest(".card");
      const entry = state.plugins.find((p) => p.repo === card.dataset.repo);
      if (entry) openReadme(entry);
    }
  });

  modalBody.addEventListener("click", (e) => {
    const copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) copyToClipboard(copyBtn.dataset.cmd, copyBtn);
  });

  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  searchInput.addEventListener("input", applyFilters);
  sortSelect.addEventListener("change", applyFilters);

  fetch("data/plugins.json")
    .then((res) => res.json())
    .then((data) => {
      state.plugins = data;
      applyFilters();
    })
    .catch((err) => {
      grid.innerHTML = `<p style="color:#e88">Failed to load plugin data: ${escapeHtml(err.message)}</p>`;
    });
})();
