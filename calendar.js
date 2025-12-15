/* calendar.js
   CVNet Community Calendar — Category-on-demand + Popular Conferences button

   - GitHub Pages-safe (same folder as index.html + JSON files)
   - Loads only the clicked category (cached)
   - Popular Conferences is a BUTTON (data-filter-tag="conferences-popular"), not a subfilter panel
   - Popular mode uses conferences.json but filters to curated set (ID match first, regex fallback)
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
    { key: "apa", label: "APA", id: "american-psychological-association-apa-2026", title: /\bamerican psychological association\b|\bapa\b/i },
    { key: "apcv", label: "APCV", id: "epc-apcv-2026", title: /\bapcv\b|\bepc\b/i },
    { key: "aps", label: "APS", id: null, title: /\bassociation for psychological science\b|\baps\b/i },
    { key: "arvo", label: "ARVO", id: null, title: /\bassociation for research in vision and ophthalmology\b|\barvo\b/i },
    { key: "ava", label: "AVA", id: "applied-vision-association-ava-2026", title: /\bapplied vision association\b|\bava\b/i },
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

  const POPULAR_CONF_ID_SET = new Set(
    POPULAR_CONFERENCES.filter((p) => p.id).map((p) => p.id)
  );

  function isPopularConference(item) {
    const id = String(item?._raw?.id ?? "");
    const title = String(item?.title ?? "");

    if (id && POPULAR_CONF_ID_SET.has(id)) return true;
    return POPULAR_CONFERENCES.some((p) => p.title && p.title.test(title));
  }

  const state = {
    menu: null,
    list: null,
    loadingMsg: null,
    status: null, // optional

    // UI tag is what button was clicked (e.g., "conferences-popular")
    activeTag: null,

    // Data tag is the underlying data source (e.g., "conferences")
    activeDataTag: null,

    // Cache is keyed by dataTag (so popular uses conferences cache)
    cache: new Map(), // dataTag -> { ok:true, items:[...] } OR { ok:false, error }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    state.menu = document.getElementById("category-menu");
    state.list = document.getElementById("calendar-list");
    state.loadingMsg = document.getElementById("calendar-loading-message"); // optional
    state.status = document.getElementById("calendar-status"); // optional

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

    const clickedTag = (btn.dataset.filterTag || "").trim();

    // CLEAR
    if (clickedTag === "") {
      state.activeTag = null;
      state.activeDataTag = null;
      updateActiveButton("");
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      setStatus("Cleared selection.");
      return;
    }

    const isPopularMode = clickedTag === "conferences-popular";
    const dataTag = isPopularMode ? "conferences" : clickedTag;

    state.activeTag = clickedTag;       // highlight correct button
    state.activeDataTag = dataTag;      // load/render correct data
    updateActiveButton(clickedTag);

    const cat = getCategory(dataTag);
    const label = isPopularMode ? "Popular Conferences" : (cat?.label ?? dataTag);

    // kill any placeholder loading message if present
    if (state.loadingMsg) {
      state.loadingMsg.remove();
      state.loadingMsg = null;
    }

    // Immediate feedback
    setStatus(`Loading all items in ${label}…`);
    state.list.innerHTML = `<p>Loading…</p>`;
    setBusy(true);

    try {
      await ensureCategoryLoaded(dataTag);
    } finally {
      setBusy(false);
    }

    renderActiveView();
  }

  async function ensureCategoryLoaded(dataTag) {
    if (state.cache.has(dataTag)) return;

    const cat = getCategory(dataTag);
    if (!cat) {
      state.cache.set(dataTag, { ok: false, error: new Error(`Unknown category tag: ${dataTag}`) });
      return;
    }

    try {
      const rawArray = await fetchCategoryArray(cat.file);
      const normalized = rawArray.map((raw) => normalizeItem(raw, cat));
      state.cache.set(dataTag, { ok: true, items: normalized });
    } catch (err) {
      console.error(`[CVNet] Failed loading ${cat.file}:`, err);
      state.cache.set(dataTag, { ok: false, error: err });
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

  function renderActiveView() {
    const uiTag = state.activeTag;
    const dataTag = state.activeDataTag;

    if (!uiTag || !dataTag) {
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      return;
    }

    const cat = getCategory(dataTag);
    const isPopularMode = uiTag === "conferences-popular";
    const label = isPopularMode ? "Popular Conferences" : (cat?.label ?? dataTag);

    const cached = state.cache.get(dataTag);
    if (!cached) {
      state.list.innerHTML = `<p>Nothing loaded yet for <strong>${escapeHtml(label)}</strong>.</p>`;
      return;
    }

    if (!cached.ok) {
      state.list.innerHTML = renderCategoryError(label, cached.error);
      setStatus(`Could not load items in ${label}.`);
      return;
    }

    let items = cached.items;

    if (isPopularMode) {
      items = items.filter(isPopularConference);
    }

    setStatus(`Loaded ${items.length} items in ${label}.`);

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

  function renderCard(item) {
    const lines = [];

    // Core fields you care about (show when present)
    if (item.frequency) lines.push(metaRow("Frequency", item.frequency));
    if (item.dates) lines.push(metaRow("Dates", item.dates));
    if (item.location) lines.push(metaRow("Location", item.location));
    if (item.deadlines) lines.push(metaRow("Submission deadlines", item.deadlines));
    if (item.org) lines.push(metaRow("Organization", item.org));

    const extra = buildExtraFields(item._raw);

    // If your JSON has an id, use it so anchors can work later (optional)
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

  function updateActiveButton(activeUiTag) {
    const buttons = state.menu.querySelectorAll("button[data-filter-tag]");
    buttons.forEach((b) => {
      const bTag = (b.dataset.filterTag || "").trim();
      const isActive = bTag === activeUiTag;
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
