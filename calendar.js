/* calendar.js
   CVNet Community Calendar — Conferences subfilters under status line

   - Category buttons in #category-menu
   - Loads clicked category JSON (cached)
   - Conferences-only subfilters in #calendar-subfilters:
       [All Conferences] [Popular Conferences]
   - Popular uses curated POPULAR_CONFERENCES (ID-first, safe fallback)
   - Status line:
       Click -> "Loading all items in <Category>…"
       Done  -> "Loaded <N> items in <Category>."
*/

(() => {
  const DATA_BASE = "./";

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

  // Your curated "Popular Conferences" list
  const POPULAR_CONFERENCES = [
    { key: "apa", label: "APA", id: "american-psychological-association-apa-2026", title: /\bamerican psychological association\b/i },
    { key: "apcv", label: "APCV", id: "epc-apcv-2026", title: /\bapcv\b|\bepc\b/i },
    { key: "aps", label: "APS", id: null, title: /\bassociation for psychological science\b/i },
    { key: "arvo", label: "ARVO", id: null, title: /\bassociation for research in vision and ophthalmology\b/i },
    // AVA: intentionally NOT matching generic "\bava\b"
    { key: "ava", label: "AVA", id: "applied-vision-association-ava-2026", title: /\bapplied vision association\b|\btheava\.net\b/i },
    { key: "bavrd", label: "BAVRD", id: null, title: /\bbay area vision research day\b|\bbavrd\b/i },
    { key: "ecvp", label: "ECVP", id: "european-conference-on-visual-perception-ecvp-2026", title: /\beuropean conference on visual perception\b|\becvp\b/i },
    { key: "gruppo-del-colore", label: "Gruppo del Colore", id: "gruppo-del-colore-annual-meeting-2026", title: /\bgruppo del colore\b/i },
    { key: "hvei", label: "HVEI", id: "human-vision-and-electronic-imaging-hvei-2026", title: /\bhuman vision and electronic imaging\b|\bhvei\b/i },
    { key: "icvs", label: "ICVS", id: "international-colour-vision-society-icvs-2026", title: /\binternational (colour|color) vision society\b|\bicvs\b/i },
    { key: "modvis", label: "MODVIS", id: null, title: /\bmodvis\b|\bmodels in vision science\b/i },
    { key: "optica-fall-vision", label: "Optica Fall Vision", id: "optica-fall-vision-meeting-2026", title: /\boptica\b.*\bfall\b.*\bvision\b/i },
    { key: "psychonomics", label: "Psychonomics", id: "psychonomic-society-annual-meeting-2026", title: /\bpsychonomic\b|\bpsychonomics\b/i },
    { key: "sfn", label: "SfN", id: "society-for-neuroscience-sfn-2026", title: /\bsociety for neuroscience\b|\bsfn\b/i },
    { key: "vsac", label: "VSAC", id: "visual-science-art-conference-vsac-2026", title: /\bvisual science art conference\b|\bvsac\b/i },
    { key: "vss", label: "VSS", id: "vision-sciences-society-vss-2026", title: /\bvision sciences society\b|\bvss\b/i },
  ];

  const POPULAR_ID_SET = new Set(POPULAR_CONFERENCES.filter(p => p.id).map(p => p.id));

  function isPopularConference(item) {
    const id = String(item?._raw?.id ?? "");
    const title = String(item?.title ?? "");

    // If the item has an ID, only match by curated IDs (prevents AVA Xmas, etc.)
    if (id) return POPULAR_ID_SET.has(id);

    // If the item has no ID, only use regex for popular entries that also have no ID
    return POPULAR_CONFERENCES
      .filter(p => !p.id && p.title)
      .some(p => p.title.test(title));
  }

  const state = {
    menu: null,
    list: null,
    status: null,
    loadingMsg: null,
    subfilters: null,

    activeTag: null,            // current category
    confMode: "all",            // "all" | "popular"
    cache: new Map(),           // tag -> { ok:true, items } OR { ok:false, error }
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
    state.subfilters = document.getElementById("calendar-subfilters"); // required for this UX

    if (!state.menu || !state.list) {
      console.error("calendar.js: Missing #category-menu or #calendar-list in HTML.");
      return;
    }
    if (!state.subfilters) {
      console.error("calendar.js: Missing #calendar-subfilters in HTML.");
      return;
    }

    state.list.innerHTML = `<p>Select a category above to view items.</p>`;
    state.subfilters.innerHTML = "";
    setStatus("");

    state.menu.addEventListener("click", onMenuClick);
    state.subfilters.addEventListener("click", onSubfilterClick);
  }

  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag || "").trim();

    // CLEAR
    if (tag === "") {
      state.activeTag = null;
      state.confMode = "all";
      updateActiveButton("");
      state.subfilters.innerHTML = "";
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      setStatus("Cleared selection.");
      return;
    }

    state.activeTag = tag;
    updateActiveButton(tag);

    // show/hide conferences subfilters
    if (tag === "conferences") {
      renderConferenceSubfilters();
    } else {
      state.confMode = "all";
      state.subfilters.innerHTML = "";
    }

    const cat = getCategory(tag);
    const label = cat?.label ?? tag;

    if (state.loadingMsg) {
      state.loadingMsg.remove();
      state.loadingMsg = null;
    }

    setStatus(`Loading all items in ${label}…`);
    state.list.innerHTML = `<p>Loading…</p>`;
    setBusy(true);

    try {
      await ensureCategoryLoaded(tag);
    } finally {
      setBusy(false);
    }

    renderActiveCategory();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn) return;

    if (state.activeTag !== "conferences") return;

    const mode = btn.dataset.confFilter; // "all" | "popular"
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    updateConferenceSubfilterButtons();
    renderActiveCategory();
  }

  function renderConferenceSubfilters() {
    state.subfilters.innerHTML = `
      <div style="margin:8px 0;">
        <button type="button" data-conf-filter="all" aria-pressed="true">All Conferences</button>
        <button type="button" data-conf-filter="popular" aria-pressed="false">Popular Conferences</button>
      </div>
    `;
    updateConferenceSubfilterButtons();
  }

  function updateConferenceSubfilterButtons() {
    const allBtn = state.subfilters.querySelector('button[data-conf-filter="all"]');
    const popBtn = state.subfilters.querySelector('button[data-conf-filter="popular"]');
    if (!allBtn || !popBtn) return;

    const allActive = state.confMode === "all";
    const popActive = state.confMode === "popular";

    allBtn.setAttribute("aria-pressed", allActive ? "true" : "false");
    popBtn.setAttribute("aria-pressed", popActive ? "true" : "false");

    allBtn.classList.toggle("active", allActive);
    popBtn.classList.toggle("active", popActive);
  }

  async function ensureCategoryLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = getCategory(tag);
    if (!cat) {
      state.cache.set(tag, { ok: false, error: new Error(`Unknown category tag: ${tag}`) });
      return;
    }

    try {
      const raw = await fetchCategoryArray(cat.file);
      const items = raw.map((obj) => normalizeItem(obj, cat));
      state.cache.set(tag, { ok: true, items });
    } catch (err) {
      console.error(`[CVNet] Failed loading ${cat.file}:`, err);
      state.cache.set(tag, { ok: false, error: err });
    }
  }

  async function fetchCategoryArray(filename) {
    const url = new URL(DATA_BASE + filename, window.location.href);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${filename} (HTTP ${res.status})`);

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

    if (!Array.isArray(parsed)) throw new Error(`${filename} must be a JSON array (e.g. [] or [{...}])`);

    for (let i = 0; i < parsed.length; i++) {
      const v = parsed[i];
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        throw new Error(`${filename}[${i}] must be an object { ... }`);
      }
    }

    return parsed;
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
      state.subfilters.innerHTML = tag === "conferences" ? state.subfilters.innerHTML : "";
      state.list.innerHTML = renderCategoryError(label, cached.error);
      setStatus(`Could not load items in ${label}.`);
      return;
    }

    let items = cached.items;

    if (tag === "conferences" && state.confMode === "popular") {
      items = items.filter(isPopularConference);
      setStatus(`Loaded ${items.length} items in Popular Conferences.`);
    } else {
      setStatus(`Loaded ${items.length} items in ${label}.`);
    }

    if (!items.length) {
      state.list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}</strong> yet.</p>`;
      return;
    }

    state.list.innerHTML = items.map(renderCard).join("\n");
  }

  function normalizeItem(raw, cat) {
    const title = coalesce(raw.title, raw.name, raw.program, raw.event, raw.id) || "(Untitled)";
    const website = coalesce(raw.website, raw.url, raw.link) || "";
    const location = coalesce(raw.location, raw.city, raw.where) || "";

    const dates = coalesce(raw.dates, raw.date, raw.startDate, raw.start_date, raw.when, raw.schedule) || "";
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

  function renderCard(item) {
    const lines = [];

    if (item.frequency) lines.push(metaRow("Frequency", item.frequency));
    if (item.dates) lines.push(metaRow("Dates", item.dates));
    if (item.location) lines.push(metaRow("Location", item.location));
    if (item.deadlines) lines.push(metaRow("Submission deadlines", item.deadlines));
    if (item.org) lines.push(metaRow("Organization", item.org));

    const extra = buildExtraFields(item._raw);

    const rid = String(item._raw?.id ?? "");
    const articleId = rid ? ` id="${escapeAttr(rid)}"` : "";

    return `
      <article class="calendar-card"${articleId} data-category="${escapeHtml(item._tag)}">
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
              ? `<details class="calendar-card__more">
                   <summary>More fields</summary>
                   <dl class="calendar-card__extra">${extra.join("")}</dl>
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
    if (!raw || typeof raw !== "object") return [];

    const hidden = new Set([
      "id",
      "_tag", "_label", "_raw",
      "title", "name", "program", "event",
      "website", "url", "link",
      "location", "city", "where",
      "dates", "date", "startDate", "start_date", "when", "schedule",
      "frequency", "cadence",
      "submissionDeadlines", "submissionDeadline", "applicationDeadline", "deadlines", "deadline", "datesDeadline",
      "organization", "organizer", "institution", "institutionProgram", "journal", "company", "department", "degreeType",
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
