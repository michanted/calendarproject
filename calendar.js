/* calendar.js
   CVNet Community Calendar
   - Loads JSON files from the SAME directory as calendar.html
   - Shows NOTHING until a category button is clicked
   - Filters by clicking buttons with data-filter-tag in #category-menu

   Run via a local server or GitHub Pages (not file://).
*/

(() => {
  // Since everything is in the same folder:
  const DATA_BASE = "./";

  // Must match your HTML button data-filter-tag values
  const CATEGORIES = [
    { tag: "conferences", label: "Conferences", file: "conferences.json" },
    { tag: "online", label: "Online Seminars/Clubs", file: "online_seminars_clubs.json" },
    { tag: "special-issue", label: "Special Features/Issues", file: "special_features_issues.json" },
    { tag: "education", label: "Education", file: "education.json" },
    { tag: "grad-program", label: "Grad Programs", file: "grad_programs.json" },
    { tag: "jobs", label: "Jobs", file: "jobs.json" },
    { tag: "funding", label: "Funding", file: "funding.json" }, // exists as []
    { tag: "competitions", label: "Competitions", file: "competitions.json" },
  ];

  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    loading: document.getElementById("calendar-loading-message"),
    status: document.getElementById("calendar-status"), // optional; if missing, that's fine
  };

  if (!els.menu || !els.list) {
    console.error("Missing #category-menu or #calendar-list in HTML.");
    return;
  }

  let allItems = [];
  let loaded = false;
  let activeTag = null; // null => nothing shown yet

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    // Initial state: show nothing until clicked
    els.list.innerHTML = `
      <p>Select a category above to view items.</p>
    `;

    // One listener handles all category buttons
    els.menu.addEventListener("click", onMenuClick);
  }

  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag ?? "").trim();

    // Your CLEAR button has empty tag -> go back to "nothing shown"
    if (tag === "") {
      activeTag = null;
      updateActiveButton(""); // highlight CLEAR
      els.list.innerHTML = `<p>Select a category above to view items.</p>`;
      setStatus("Cleared selection.");
      return;
    }

    // Load data once on first real click
    if (!loaded) {
      setBusy(true);
      setStatus("Loading calendar items…");

      try {
        allItems = await loadAllCategories();
        loaded = true;
        setStatus(`Loaded ${allItems.length} items.`);
      } catch (err) {
        console.error(err);
        showError(err);
        setBusy(false);
        return;
      } finally {
        if (els.loading) els.loading.remove();
        setBusy(false);
      }
    }

    activeTag = tag;
    updateActiveButton(tag);
    render();
  }

  async function loadAllCategories() {
    const results = await Promise.all(
      CATEGORIES.map(async (cat) => {
        const url = DATA_BASE + cat.file;
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
          throw new Error(`Failed to load ${cat.file} (HTTP ${res.status})`);
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

  function render() {
    if (!activeTag) {
      els.list.innerHTML = `<p>Select a category above to view items.</p>`;
      return;
    }

    const items = allItems.filter((x) => x._tag === activeTag);

    if (items.length === 0) {
      const label = CATEGORIES.find(c => c.tag === activeTag)?.label ?? activeTag;
      els.list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}</strong> yet.</p>`;
      setStatus(`No items in ${label}.`);
      return;
    }

    els.list.innerHTML = items.map(renderCard).join("\n");

    const label = CATEGORIES.find(c => c.tag === activeTag)?.label ?? activeTag;
    setStatus(`Showing ${items.length} items in ${label}.`);
  }

  function renderCard(item) {
    // “Best-effort” normalization across your different JSON schemas
    const title = item.title ?? "(Untitled)";
    const website = item.website ?? "";
    const location = item.location ?? "";

    // Dates/deadlines vary by file
    const dates =
      item.dates ??
      item.datesDeadline ??
      item.deadline ??
      item.applicationDeadline ??
      item.schedule ??
      item.frequency ??
      item.startDate ??
      "";

    // Organization/institution/etc.
    const org =
      item.organization ??
      item.institution ??
      item.institutionProgram ??
      item.organizer ??
      item.journal ??
      item.degreeType ??
      "";

    // Optional description-like fields
    const desc =
      item.description ??
      item.notes ??
      item.details ??
      "";

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

          ${website ? `<p><a class="calendar-card__link" href="${escapeAttr(website)}" target="_blank" rel="noopener">Website</a></p>` : ""}
        </div>
      </article>
    `;
  }

  function updateActiveButton(tag) {
    const buttons = els.menu.querySelectorAll("button[data-filter-tag]");
    buttons.forEach((b) => {
      const bTag = (b.dataset.filterTag ?? "").trim();
      const isActive = bTag === tag;

      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setBusy(isBusy) {
    els.list.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  function showError(err) {
    els.list.innerHTML = `
      <p><strong>Could not load calendar data.</strong></p>
      <p>${escapeHtml(err?.message ?? String(err))}</p>
      <p>Common causes:</p>
      <ul>
        <li>Opening via <code>file://</code> instead of GitHub Pages / local server</li>
        <li>A JSON file has invalid JSON</li>
        <li>A filename doesn’t match exactly (case-sensitive on GitHub)</li>
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
