/* calendar.js
   CVNet Community Calendar
   - Loads JSON files from the SAME directory as index.html
   - Shows NOTHING until a category button is clicked
   - Filters by clicking buttons with data-filter-tag in #category-menu
*/

(() => {
  const CATEGORIES = [
    { tag: "conferences", label: "Conferences", file: "conferences.json" },
    { tag: "online", label: "Online Seminars/Clubs", file: "online_seminars_clubs.json" },
    { tag: "special-issue", label: "Special Features/Issues", file: "special_features_issues.json" },
    { tag: "education", label: "Education", file: "education.json" },
    { tag: "grad-program", label: "Grad Programs", file: "grad_programs.json" },
    { tag: "jobs", label: "Jobs", file: "jobs.json" },
    { tag: "funding", label: "Funding", file: "funding.json" },
    { tag: "competitions", label: "Competitions", file: "competitions.json" },
  ];

  const state = { allItems: [], loaded: false, activeTag: null };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    const menu = document.getElementById("category-menu");
    const list = document.getElementById("calendar-list");
    const loadingMsg = document.getElementById("calendar-loading-message");
    const status = document.getElementById("calendar-status"); // optional

    if (!menu || !list) {
      console.error("Missing #category-menu or #calendar-list in HTML.");
      return;
    }

    list.innerHTML = `<p>Select a category above to view items.</p>`;

    menu.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-filter-tag]");
      if (!btn) return;

      const tag = (btn.dataset.filterTag || "").trim();

      // CLEAR (empty tag) => back to blank state
      if (tag === "") {
        state.activeTag = null;
        updateActiveButton(menu, "");
        list.innerHTML = `<p>Select a category above to view items.</p>`;
        if (status) status.textContent = "Cleared selection.";
        return;
      }

      // Load once on first real click
      if (!state.loaded) {
        list.setAttribute("aria-busy", "true");
        if (status) status.textContent = "Loading calendar items…";

        try {
          state.allItems = await loadAllCategories();
          state.loaded = true;
          if (status) status.textContent = `Loaded ${state.allItems.length} items.`;
        } catch (err) {
          console.error(err);
          list.innerHTML = `
            <p><strong>Could not load calendar data.</strong></p>
            <p>${escapeHtml(err?.message ?? String(err))}</p>
            <p>Tip: open DevTools → Console for the exact failing file/path.</p>
          `;
          list.setAttribute("aria-busy", "false");
          return;
        } finally {
          if (loadingMsg) loadingMsg.remove();
          list.setAttribute("aria-busy", "false");
        }
      }

      state.activeTag = tag;
      updateActiveButton(menu, tag);
      render(list, status);
    });
  }

  async function loadAllCategories() {
    const results = await Promise.all(
      CATEGORIES.map(async (cat) => {
        const url = new URL(cat.file, window.location.href); // GitHub Pages-safe
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load ${cat.file} (HTTP ${res.status})`);

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error(`${cat.file} must be a JSON array`);

        return data.map((item) => ({ _tag: cat.tag, _label: cat.label, ...item }));
      })
    );
    return results.flat();
  }

  function render(list, statusEl) {
    const tag = state.activeTag;
    if (!tag) {
      list.innerHTML = `<p>Select a category above to view items.</p>`;
      return;
    }

    const label = CATEGORIES.find((c) => c.tag === tag)?.label ?? tag;
    const items = state.allItems.filter((x) => x._tag === tag);

    if (!items.length) {
      list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}</strong> yet.</p>`;
      if (statusEl) statusEl.textContent = `No items in ${label}.`;
      return;
    }

    list.innerHTML = items.map(renderCard).join("\n");
    if (statusEl) statusEl.textContent = `Showing ${items.length} items in ${label}.`;
  }

  function renderCard(item) {
    const title = item.title ?? "(Untitled)";
    const website = item.website ?? "";
    const location = item.location ?? "";

    const dates =
      item.dates ??
      item.datesDeadline ??
      item.deadline ??
      item.applicationDeadline ??
      item.schedule ??
      item.frequency ??
      item.startDate ??
      "";

    const org =
      item.organization ??
      item.institution ??
      item.institutionProgram ??
      item.organizer ??
      item.journal ??
      item.degreeType ??
      "";

    const desc = item.description ?? item.notes ?? item.details ?? "";

    return `
      <article class="calendar-card">
        <header class="calendar-card__header">
          <h3 class="calendar-card__title">${escapeHtml(title)}</h3>
          <p class="calendar-card__category">${escapeHtml(item._label)}</p>
        </header>

        <div class="calendar-card__body">
          ${org ? `<p class="calendar-card__org">${nl2br(escapeHtml(org))}</p>` : ""}

          <dl class="calendar-card__meta">
            ${dates ? `<div><dt>Dates / Deadline</dt><dd>${nl2br(escapeHtml(dates))}</dd></div>` : ""}
            ${location ? `<div><dt>Location</dt><dd>${escapeHtml(location)}</dd></div>` : ""}
          </dl>

          ${desc ? `<p class="calendar-card__desc">${nl2br(escapeHtml(desc))}</p>` : ""}

          ${
            website
              ? `<p><a class="calendar-card__link" href="${escapeAttr(website)}" target="_blank" rel="noopener">Website</a></p>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function updateActiveButton(menuEl, tag) {
    menuEl.querySelectorAll("button[data-filter-tag]").forEach((b) => {
      const bTag = (b.dataset.filterTag || "").trim();
      const isActive = bTag === tag;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return String(s).replaceAll('"', "%22");
  }

  function nl2br(s) {
    return String(s).replaceAll("\n", "<br>");
  }
})();
