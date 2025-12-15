/* calendar.js
   CVNet Community Calendar
   - Loads JSON files from the SAME directory as index.html
   - Shows NOTHING until a category button is clicked
   - Filters by clicking buttons with data-filter-tag in #category-menu

   Works on GitHub Pages + local server (not file://).
*/

(() => {
  // Must match your HTML button data-filter-tag values
  const CATEGORIES = [
    { tag: "conferences", label: "Conferences", file: "conferences.json" },
    { tag: "online", label: "Online Seminars/Clubs", file: "online_seminars_clubs.json" },
    { tag: "special-issue", label: "Special Features/Issues", file: "special_features_issues.json" },
    { tag: "education", label: "Education", file: "education.json" },
    { tag: "grad-program", label: "Grad Programs", file: "grad_programs.json" },
    { tag: "jobs", label: "Jobs", file: "jobs.json" },
    { tag: "funding", label: "Funding", file: "funding.json" }, // may be []
    { tag: "competitions", label: "Competitions", file: "competitions.json" },
  ];

  const state = {
    allItems: [],
    loaded: false,
    activeTag: null,
  };

  // Boot safely whether or not DOM is ready
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
      console.error("calendar.js: Missing #category-menu or #calendar-list in HTML.");
      return;
    }

    // Initial state
    list.innerHTML = `<p>Select a category above to view items.</p>`;
    list.setAttribute("aria-busy", "false");

    // Delegate clicks from the menu
    menu.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-filter-tag]");
      if (!btn) return;

      const tag = (btn.dataset.filterTag ?? "").trim();
      console.log("[CVNet] Click:", tag || "(clear)");

      // Clear selection (empty tag)
      if (tag === "") {
        state.activeTag = null;
        updateActiveButton(menu, "");
        list.innerHTML = `<p>Select a category above to view items.</p>`;
        setStatus(status, "Cleared selection.");
        return;
      }

      // Load once on first real click
      if (!state.loaded) {
        setBusy(list, true);
        setStatus(status, "Loading calendar items…");

        try {
          state.allItems = await loadAllCategories();
          state.loaded = true;
          setStatus(status, `Loaded ${state.allItems.length} items.`);
          console.log("[CVNet] Loaded items:", state.allItems.length);
        } catch (err) {
          console.error("[CVNet] Load error:", err);
          showError(list, err);
          setBusy(list, false);
          return;
        } finally {
          if (loadingMsg) loadingMsg.remove();
          setBusy(list, false);
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
        // This makes fetch paths correct on GitHub Pages project sites too
        const url = new URL(cat.file, window.location.href);

        console.log("[CVNet] Fetch:", url.toString());
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
          throw new Error(`Failed to load ${cat.file} (HTTP ${res.status}) at ${url}`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
          throw new Error(`${cat.file} must be a JSON array, e.g. [] or [{...}]`);
        }

        return data.map((item) => ({
          _tag: cat.tag,
          _label: cat.label,
          ...item,
        }));
      })
    );

    return results.flat();
  }

  function render(list, statusEl) {
    if (!state.activeTag) {
      list.innerHTML = `<p>Select a category above to view items.</p>`;
      return;
    }

    const items = state.allItems.filter((x) => x._tag === state.activeTag);
    const label = CATEGORIES.find((c) => c.tag === state.activeTag)?.label ?? state.activeTag;

    if (items.length === 0) {
      list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}</strong> yet.</p>`;
      setStatus(statusEl, `No items in ${label}.`);
      return;
    }

    list.innerHTML = items.map(renderCard).join("\n");
    setStatus(statusEl, `Showing ${items.length} items in ${label}.`);
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
      <article class="calendar-card" data-category="${escapeHtml(item._tag)}">
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
    const buttons = menuEl.querySelectorAll("button[data-filter-tag]");
    buttons.forEach((b) => {
      const bTag = (b.dataset.filterTag ?? "").trim();
      const isActive = bTag === tag;

      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setBusy(listEl, isBusy) {
    listEl.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function setStatus(statusEl, msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function showError(listEl, err) {
    listEl.innerHTML = `
      <p><strong>Could not load calendar data.</strong></p>
      <p>${escapeHtml(err?.message ?? String(err))}</p>
      <p>Common causes:</p>
      <ul>
        <li>Opening via <code>file://</code> instead of GitHub Pages / local server</li>
        <li>A JSON file has invalid JSON</li>
        <li>A filename doesn’t match exactly (case-sensitive on GitHub)</li>
        <li>Your GitHub Pages publish folder doesn’t contain the JSON files</li>
      </ul>
    `;
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
    // safe-ish for URLs in href attribute
    return String(s).replaceAll('"', "%22");
  }

  function nl2br(s) {
    return String(s).replaceAll("\n", "<br>");
  }
})();
