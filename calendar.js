/* calendar.js
   CVNet Community Calendar — Robust, Category-on-Demand

   - GitHub Pages-safe fetch paths
   - Loads only the clicked category (cached thereafter)
   - One broken JSON file won’t break other categories
   - Normalizes common fields AND shows extra fields in a "More fields" section
   - Status line behavior:
       Click -> "Loading all items in <Category>…"
       Done  -> "Loaded <N> items in <Category>."
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
    cache: new Map(), // tag -> { ok:true, items:[...] } OR { ok:false, error:Error }
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
    setStatus("");

    state.menu.addEventListener("click", onMenuClick);
  }

  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag || "").trim();

    // CLEAR -> neutral state
    if (tag === "") {
      state.activeTag = null;
      updateActiveButton("");
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      setStatus("Cleared selection.");
      return;
    }

    const cat = getCategory(tag);
    const label = cat?.label ?? tag;

    state.activeTag = tag;
    updateActiveButton(tag);

    // remove placeholder msg if present
    if (state.loadingMsg) {
      state.loadingMsg.remove();
      state.loadingMsg = null;
    }

    // Immediate status update exactly as requested
    setStatus(`Loading all items in ${label}…`);

    // Optional: immediate visual feedback (keeps the page feeling alive)
    state.list.innerHTML = `<p>Loading…</p>`;

    await ensureCategoryLoaded(tag);

    // Render (and if cached, ensure status line still ends in "Loaded N items…")
    renderActiveCategory();
  }

  async function ensureCategoryLoaded(tag) {
    // If cached, update status instantly and return
    if (state.cache.has(tag)) {
      const cached = state.cache.get(tag);
      const cat = getCategory(tag);
      if (cat && cached?.ok) {
        setStatus(`Loaded ${cached.items.length} items in ${cat.label}.`);
      }
      return;
    }

    const cat = getCategory(tag);
    if (!cat) {
      state.cache.set(tag, { ok: false, error: new Error(`Unknown category tag: ${tag}`) });
      return;
    }

    setBusy(true);

    try {
      const rawArray = await fetchCategoryArray(cat.file);
      const normalized = rawArray.map((raw) => normalizeItem(raw, cat));

      state.cache.set(tag, { ok: true, items: normalized });
      setStatus(`Loaded ${normalized.length} items in ${cat.label}.`);
    } catch (err) {
      console.error(`[CVNet] Failed loading ${cat.file}:`, err);
      state.cache.set(tag, { ok: false, error: err });

      // Keep your requested messaging style, but honest:
      setStatus(`Could not load items in ${cat.label}.`);
    } finally {
      setBusy(false);
    }
  }

  async function fetchCategoryArray(filename) {
    const url = new URL(filename, window.location.href);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

    // Read as text first so we can throw a helpful error for invalid JSON (NaN, etc.)
    const text = await res.text();
    const trimmed = text.trim();

    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw new Error(`Expected JSON but got HTML from ${url} (wrong publish folder/path?)`);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON in ${filename}: ${e.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`${filename} must be a JSON array (e.g., [] or [{...}])`);
    }

    for (let i = 0; i < parsed.length; i++) {
      const v = parsed[i];
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        throw new Error(`${filename}[${i}] must be an object { ... }`);
      }
    }

    return parsed;
  }

  function normalizeItem(raw, cat) {
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

    const cat = getCategory(tag);
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

    // Ensure final status line exactly matches your desired successful wording
    if (cat) setStatus(`Loaded ${items.length} items in ${cat.label}.`);

    if (!items.length) {
      state.list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}</strong> yet.</p>`;
      return;
    }

    state.list.innerHTML = items.map(renderCard).join("\n");
  }

  function renderCard(item) {
    const lines = [];

    if (item.frequency) lines.push(metaRow("Frequency", item.frequency));
    if (item.dates) lines.push(metaRow("Dates", item.dates));
    if (item.location) lines.push(metaRow("Location", item.location));
    if (item.deadlines) lines.push(metaRow("Submission deadlines", item.deadlines));
    if (item.org) lines.push(metaRow("Organization", item.org));

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
    const hidden = new Set([
      "id",
      "_tag",
      "_label",
      "_raw",
      // title-ish
      "title", "name", "program", "event",
      // website-ish
      "website", "url", "link",
      // location-ish
      "location", "city", "where",
      // date-ish
      "dates", "date", "startDate", "start_date", "when", "schedule",
      // frequency-ish
      "frequency", "cadence",
      // deadline-ish
      "submissionDeadlines", "submissionDeadline", "applicationDeadline", "deadlines", "deadline", "datesDeadline",
      // org-ish
      "organization", "organizer", "institution", "institutionProgram", "journal", "company", "department", "degreeType",
      // description-ish
      "description", "details", "notes", "summary",
    ]);

    const keys = Object.keys(raw).filter((k) => !hidden.has(k));
    keys.sort((a, b) => a.localeCompare(b));

    const extras = [];
    for (const k of keys) {
      const v = raw[k];
      if (v === null || v === undefined || v === "") continue;

      const printed = typeof v === "object" ? JSON.stringify(v) : String(v);
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

  function getCategory(tag) {
    return CATEGORIES.find((c) => c.tag === tag) || null;
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
    return String(s).replaceAll('"', "%22");
  }

  function nl2br(s) {
    return String(s).replaceAll("\n", "<br>");
  }
})();
