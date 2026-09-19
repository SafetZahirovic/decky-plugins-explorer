(function () {
  "use strict";

  const state = { plugins: [], filtered: [], selectedTags: new Set(), tagList: [] };

  const grid = document.getElementById("grid");
  const searchInput = document.getElementById("search");
  const tagPicker = document.getElementById("tag-picker");
  const tagPillsEl = document.getElementById("tag-pills");
  const tagSearchInput = document.getElementById("tag-search");
  const tagSuggestionsEl = document.getElementById("tag-suggestions");
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

  function formatCount(n) {
    if (!n) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function cardTemplate(entry) {
    const p = entry.plugin || {};
    const name = escapeHtml(p.name || entry.repo);
    const author = escapeHtml(typeof p.author === "string" && p.author ? p.author : entry.repo.split("/")[0]);
    const desc = escapeHtml(getDescription(entry));
    const tags = getTags(entry).slice(0, 6).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    const downloads = entry.downloads
      ? `<span class="stat-chip" title="${entry.downloads.toLocaleString()} total asset downloads">⬇ ${formatCount(entry.downloads)}</span>`
      : "";
    const releaseDate = entry.latest_release && formatDate(entry.latest_release.published_at);
    const releaseLine = releaseDate
      ? `<div class="release-line">Latest release ${escapeHtml(entry.latest_release.tag || "")} &middot; ${releaseDate}</div>`
      : "";

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
          <div class="stat-chips">
            <span class="stat-chip">★ ${entry.stars || 0}</span>
            ${downloads}
          </div>
        </div>
        <div class="author">by ${author}</div>
        <p class="description">${desc}</p>
        <div class="tags">${tags}</div>
        ${releaseLine}
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

    if (state.selectedTags.size > 0) {
      list = list.filter((entry) => {
        const entryTags = getTags(entry).map((t) => t.toLowerCase());
        return entryTags.some((t) => state.selectedTags.has(t));
      });
    }

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
      if (sortBy === "downloads") return (b.downloads || 0) - (a.downloads || 0);
      if (sortBy === "release") {
        const at = (a.latest_release && a.latest_release.published_at) || "";
        const bt = (b.latest_release && b.latest_release.published_at) || "";
        return bt.localeCompare(at);
      }
      if (sortBy === "name") {
        const an = (a.plugin && a.plugin.name) || a.repo;
        const bn = (b.plugin && b.plugin.name) || b.repo;
        return an.localeCompare(bn);
      }
      return (b.stars || 0) - (a.stars || 0);
    });

    state.filtered = list;
    statsEl.textContent = `Showing ${list.length} of ${state.plugins.length} plugins`;
    render();
  }

  function buildTagIndex() {
    const counts = new Map();
    state.plugins.forEach((entry) => {
      getTags(entry).forEach((t) => {
        const key = t.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    state.tagList = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function renderTagPills() {
    tagPillsEl.innerHTML = Array.from(state.selectedTags)
      .map(
        (tag) => `
        <span class="tag-pill" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag)}
          <button type="button" aria-label="Remove ${escapeHtml(tag)} filter">&times;</button>
        </span>`
      )
      .join("");
  }

  function renderTagSuggestions() {
    const q = tagSearchInput.value.trim().toLowerCase();
    const matches = state.tagList
      .filter(([tag]) => !state.selectedTags.has(tag))
      .filter(([tag]) => !q || tag.includes(q))
      .slice(0, 40);

    if (matches.length === 0) {
      tagSuggestionsEl.innerHTML = `<div class="tag-suggestion-empty">No matching tags</div>`;
    } else {
      tagSuggestionsEl.innerHTML = matches
        .map(
          ([tag, count]) => `
          <div class="tag-suggestion-item" data-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(tag)}</span>
            <span class="tag-suggestion-count">${count}</span>
          </div>`
        )
        .join("");
    }
    tagSuggestionsEl.hidden = false;
  }

  function hideTagSuggestions() {
    tagSuggestionsEl.hidden = true;
  }

  function addTag(tag) {
    state.selectedTags.add(tag);
    tagSearchInput.value = "";
    renderTagPills();
    renderTagSuggestions();
    tagSearchInput.focus();
    applyFilters();
  }

  function removeTag(tag) {
    state.selectedTags.delete(tag);
    renderTagPills();
    if (!tagSuggestionsEl.hidden) renderTagSuggestions();
    applyFilters();
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

  tagPillsEl.addEventListener("click", (e) => {
    const pill = e.target.closest(".tag-pill");
    if (pill) removeTag(pill.dataset.tag);
  });

  tagSearchInput.addEventListener("focus", renderTagSuggestions);
  tagSearchInput.addEventListener("input", renderTagSuggestions);
  tagSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTagSuggestions();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const first = tagSuggestionsEl.querySelector(".tag-suggestion-item");
      if (first) addTag(first.dataset.tag);
    } else if (e.key === "Backspace" && !tagSearchInput.value) {
      const last = Array.from(state.selectedTags).pop();
      if (last) removeTag(last);
    }
  });

  // Keep the input focused when clicking a suggestion (mousedown fires before blur).
  tagSuggestionsEl.addEventListener("mousedown", (e) => e.preventDefault());
  tagSuggestionsEl.addEventListener("click", (e) => {
    const item = e.target.closest(".tag-suggestion-item");
    if (item) addTag(item.dataset.tag);
  });

  document.addEventListener("click", (e) => {
    if (!tagPicker.contains(e.target)) hideTagSuggestions();
  });

  fetch("data/plugins.json?v=3")
    .then((res) => res.json())
    .then((data) => {
      state.plugins = data;
      buildTagIndex();
      applyFilters();
    })
    .catch((err) => {
      grid.innerHTML = `<p style="color:#e88">Failed to load plugin data: ${escapeHtml(err.message)}</p>`;
    });
})();
