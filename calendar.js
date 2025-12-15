/* calendar.js
   CVNet Community Calendar — Robust Version

   Goals:
   - GitHub Pages-safe paths
   - Category loads on demand (click -> fetch that JSON)
   - One bad JSON file won't break the rest
   - Normalizes common fields across schemas
   - Still shows extra JSON fields so data never "vanishes"
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

  const state = {
    cache: new Map(),      // tag -> { ok: true, items } OR { ok:false, error }
    activeTag: null,
    menu: null,
    list: null,
    status: null,
    loadingMsg: null,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    state.menu = document.getElementById("category-menu");
    state.list = document.getElementById("calendar-list");
    state.status = document.getElementById("calendar-status"); // optional
    state.loadingMsg = document.getElementById("calendar-loading-message"); // optional

    if (!state.menu || !state.list) {
      console.error("calendar.js: Missing #category-menu or #calendar-list in HTML.");
      return;
    }

    state.list.innerHTML = `<p>Select a category above to view items.</p>`;
    setStatus("Ready.");

    state.menu.addEventListener("click", onMenuClick);
  }

  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag || "").trim();

    // CLEAR -> return to neutral
    if (tag === "") {
      state.activeTag = null;
      updateActiveButton("");
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      setStatus("Cleared selection.");
      return;
    }

    state.activeTag = tag;
updateActiveButton(tag);

// Instant feedback (no lag feel)
const cat = CATEGORIES.find((c) => c.tag === tag);
setStatus(cat ? `Loading ${cat.label}…` : "Loading…");

// Optional: immediately show a small loading placeholder in the list
state.list.innerHTML = `<p>Loading…</p>`;


    // Remove any placeholder loading message if present
    if (state.loadingMsg) {
      state.loadingMsg.remove();
      state.loadingMsg = null;
    }

    // Load category (cached after first fetch)
    await ensureCategoryLoaded(tag);

    // Render
    renderActiveCategory();
  }

  async function ensureCategoryLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = CATEGORIES.find((c) => c.tag === tag);
    if (!cat) {
      state.cache.set(tag, { ok: false, error: new Error(`Unknown category tag: ${tag}`) });
      return;
    }

    setBusy(true);
    setStatus(`Loading ${cat.label}…`);

    try {
      const items = await fetchCategoryArray(cat.file);
      const normalized = items.map((raw) => normalizeItem(raw, cat));
      state.cache.set(tag, { ok: true, items: normalized });

      setStatus(`Loaded ${normalized.length} item(s) in ${cat.label}.`);
    } catch (err) {
      console.error(`[CVNet] Failed loading ${cat.file}:`, err);
      state.cache.set(tag, { ok: false, error: err });
      setStatus(`Could not load ${cat.label}.`);
    } finally {
      setBusy(false);
    }
  }

  async function fetchCategoryArray(filename) {
    // GitHub Pages-safe, works from /repo/ subpaths
    const url = new URL(filename, window.location.href);

    // Fetch as text first so we can give cleaner errors than "Unexpected token ..."
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

    const text = await res.text();

    // Explicitly catch common non-JSON issues
    // (e.g., HTML error page returned)
    const trimmed = text.trim();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw new Error(`Expected JSON but got HTML from ${url} (wrong publish folder/path?)`);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // This will catch NaN, trailing commas, etc.
      throw new Error(`Invalid JSON in ${filename}: ${e.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`${filename} must be a JSON array (e.g., [] or [{...}])`);
    }

    // Ensure each entry is an object
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i] === null || typeof parsed[i] !== "object" || Array.isArray(parsed[i])) {
        throw new Error(`${filename}[${i}] must be an object { ... }`);
      }
    }

    return parsed;
  }

  function normalizeItem(raw, cat) {
    // Canonical fields (these drive the UI)
    const title = coalesce(raw.title, raw.name, raw.program, raw.event, raw.id) || "(Untitled)";
    const website = coalesce(raw.website, raw.url, raw.link) || "";
    const location = coalesce(raw.location, raw.city, raw.where) || "";

    const dates = coalesce(
      raw.dates,
      raw.date,
      raw.startDate,
      raw.start_date,
      raw.when,
      raw.schedule
    ) || "";

    const frequency = coalesce(raw.frequency, raw.cadence) || "";

    const deadlines = coalesce(
      raw.submissionDeadlines,
      raw.submissionDeadline,
      raw.applicationDeadline,
      raw.deadlines,
      raw.deadline,
      raw.datesDeadline
    ) || "";

    const org = coalesce(
      raw.organization,
      raw.organizer,
      raw.institution,
      raw.institutionProgram,
      raw.journal,
      raw.company,
      raw.department,
      raw.degreeType
    ) || "";

    const description = coalesce(raw.description, raw.details, raw.notes, raw.summary) || "";

    // Keep original fields too, so nothing is lost
    return {
      _tag: cat.tag,
      _label: cat.label,
      _raw: raw,

      title,
      website,
      location,
      dates,
      frequency,
      deadlines,
      org,
      description,
    };
  }

  function renderActiveCategory() {
    const tag = state.activeTag;
    if (!tag) {
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      return;
    }

    const cat = CATEGORIES.find((c) => c.tag === tag);
    const label = cat?.label ?? tag;

    const cached = state.cache.get(tag);
    if (!cached) {
      state.list.innerHTML = `<p>Nothing loaded yet for <strong>${escapeHtml(label)}</strong>.</p>`;
      return;
    }

    if (!cached.ok) {
      state.list.innerHTML = renderCategoryError(label, cached.error);
      return;
    }

    const items = cached.items;

    if (!items.length) {
      state.list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}</strong> yet.</p>`;
      return;
    }

    state.list.innerHTML = items.map(renderCard).join("\n");
  }

  function renderCard(item) {
    // "Core" fields
    const lines = [];

    if (item.frequency) lines.push(metaRow("Frequency", item.frequency));
    if (item.dates) lines.push(metaRow("Dates", item.dates));
    if (item.location) lines.push(metaRow("Location", item.location));
    if (item.deadlines) lines.push(metaRow("Deadlines", item.deadlines));
    if (item.org) lines.push(metaRow("Org", item.org));

    // "Extra" fields: show anything else that exists in the original JSON
    const extra = buildExtraFields(item._raw);

    return `
      <article class="calendar-card" data-category="${escapeHtml(item._tag)}">
        <header class="calendar-card__header">
          <h3 class="calendar-card__title">${escapeHtml(item.title)}</h3>
          <p class="calendar-card__category">${escapeHtml(item._label)}</p>
        </header>

        <div class="calendar-card__body">
          ${lines.length ? `<dl class="calendar-card__meta">${lines.join("")}</dl>` : ""}

          ${item.description ? `<p class="calendar-card__desc">${nl2br(escapeHtml(item.description))}</p>` : ""}

          ${
            item.website
              ? `<p><a class="calendar-card__link" href="${escapeAttr(item.website)}" target="_blank" rel="noopener">Website</a></p>`
              : ""
          }

          ${
            extra.length
              ? `<details class="calendar-card__extra">
                   <summary>More fields</summary>
                   <dl>${extra.join("")}</dl>
                 </details>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function metaRow(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${nl2br(escapeHtml(String(value)))}</dd></div>`;
  }

  function buildExtraFields(raw) {
    // Don’t duplicate core fields we already show, and hide noisy/internal ones.
    const hidden = new Set([
      "id",
      "_tag",
      "_label",
      "_raw",
      "title",
      "name",
      "program",
      "event",
      "website",
      "url",
      "link",
      "location",
      "city",
      "where",
      "dates",
      "date",
      "startDate",
      "start_date",
      "when",
      "schedule",
      "frequency",
      "cadence",
      "submissionDeadlines",
      "submissionDeadline",
      "applicationDeadline",
      "deadlines",
      "deadline",
      "datesDeadline",
      "organization",
      "organizer",
      "institution",
      "institutionProgram",
      "journal",
      "company",
      "department",
      "degreeType",
      "description",
      "details",
      "notes",
      "summary",
    ]);

    const extras = [];
    const keys = Object.keys(raw).filter((k) => !hidden.has(k));

    // Stable ordering
    keys.sort((a, b) => a.localeCompare(b));

    for (const k of keys) {
      const v = raw[k];
      if (v === null || v === undefined || v === "") continue;

      // Convert objects/arrays to readable string
      const printed =
        typeof v === "object" ? JSON.stringify(v) : String(v);

      extras.push(`<div><dt>${escapeHtml(k)}</dt><dd>${nl2br(escapeHtml(printed))}</dd></div>`);
    }

    return extras;
  }

  function renderCategoryError(label, err) {
    return `
      <p><strong>Could not load ${escapeHtml(label)}.</strong></p>
      <p>${escapeHtml(err?.message ?? String(err))}</p>
      <p>Fix tips:</p>
      <ul>
        <li>Check the JSON file for invalid values like <code>NaN</code>, trailing commas, or unquoted keys</li>
        <li>Make sure the file is in the same published folder as <code>index.html</code></li>
        <li>GitHub is case-sensitive: filenames must match exactly</li>
      </ul>
    `;
  }

  function updateActiveButton(tag) {
    const buttons = state.menu.querySelectorAll("button[data-filter-tag]");
    buttons.forEach((b) => {
      const bTag = (b.dataset.filterTag || "").trim();
      const isActive = bTag === tag;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setBusy(isBusy) {
    state.list.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function setStatus(msg) {
    if (state.status) state.status.textContent = msg;
  }

  function coalesce(...vals) {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s !== "") return v;
    }
    return "";
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

