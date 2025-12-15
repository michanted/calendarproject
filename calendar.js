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

  // The 16 "Popular Conferences" you provided.
  // Matching is done by:
  //  1) Exact id match (if present)
  //  2) Title regex match (fallback)
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

  const state = {
    cache: new Map(), // tag -> { ok:true, items:[normalized...] } OR { ok:false, error:Error }
    activeTag: null,

    // conferences-only subfilter state
    confMode: "all", // "all" | "popular"
    confPopularIds: new Set(),
    confPopularLinks: [],

    menu: null,
    list: null,
    status: null,
    loadingMsg: null,
    subfilters: null,
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
    state.subfilters = document.getElementById("calendar-subfilters"); // optional

    if (!state.menu || !state.list) {
      console.error("calendar.js: Missing #category-menu or #calendar-list in HTML.");
      return;
    }

    // If subfilters container doesn't exist, create it right above the list.
    if (!state.subfilters) {
      state.subfilters = document.createElement("div");
      state.subfilters.id = "calendar-subfilters";
      state.list.parentNode.insertBefore(state.subfilters, state.list);
    }

    // Initial blank state
    state.list.innerHTML = `<p>Select a category above to view items.</p>`;
    state.subfilters.innerHTML = "";

    state.menu.addEventListener("click", onMenuClick);
    state.subfilters.addEventListener("click", onSubfilterClick);
  }

  function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag ?? "").trim();

    // CLEAR (empty tag) -> reset view
    if (tag === "") {
      state.activeTag = null;
      state.confMode = "all";
      state.subfilters.innerHTML = "";
      updateActiveButton("");
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      setStatus("Cleared selection.");
      return;
    }

    // Switch category
    state.activeTag = tag;
    updateActiveButton(tag);

    const cat = getCategory(tag);
    const label = cat?.label ?? tag;

    // conferences subfilter resets when you re-enter conferences
    if (tag !== "conferences") {
      state.confMode = "all";
      state.subfilters.innerHTML = "";
    }

    // If cached, render immediately; otherwise load.
    if (state.cache.has(tag)) {
      renderActiveCategory();
      return;
    }

    // Load (category-on-demand)
    setBusy(true);
    setStatus(`Loading all items in ${label}…`);

    loadCategory(tag)
      .then(() => {
        renderActiveCategory();
      })
      .catch((err) => {
        // loadCategory already cached the error; just render
        console.error(err);
        renderActiveCategory();
      })
      .finally(() => {
        if (state.loadingMsg) state.loadingMsg.remove();
        setBusy(false);
      });
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-subfilter]");
    if (!btn) return;

    if (state.activeTag !== "conferences") return;

    const mode = btn.dataset.subfilter;
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    updateSubfilterButtons();
    renderActiveCategory();
  }

  async function loadCategory(tag) {
    const cat = getCategory(tag);
    if (!cat) throw new Error(`Unknown category tag: ${tag}`);

    try {
      const raw = await fetchJsonArray(cat.file);
      const items = raw.map((obj) => normalizeItem(obj, cat));

      state.cache.set(tag, { ok: true, items });

      // Build conferences popular mapping once conferences load
      if (tag === "conferences") {
        buildPopularConferencesIndex(items);
      }
    } catch (err) {
      state.cache.set(tag, { ok: false, error: err });
      throw err;
    }
  }

  async function fetchJsonArray(filename) {
    const url = DATA_BASE + filename;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Failed to load ${filename} (HTTP ${res.status})`);
    }

    // Read as text first, so we can give better errors
    const text = await res.text();
    const trimmed = text.trim();

    // GitHub Pages 404 sometimes returns HTML
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
      throw new Error(`${filename} must be a JSON array (e.g. [] or [{...}])`);
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

  function buildPopularConferencesIndex(items) {
    state.confPopularIds = new Set();
    state.confPopularLinks = [];

    // For each popular entry, find the first matching item
    for (const p of POPULAR_CONFERENCES) {
      const match = items.find((it) => {
        const rid = String(it._raw?.id ?? "");
        const ttl = String(it.title ?? "");
        if (p.id && rid === p.id) return true;
        if (p.title && p.title.test(ttl)) return true;
        return false;
      });

      if (match) {
        const rid = String(match._raw?.id ?? "");
        if (rid) state.confPopularIds.add(rid);

        state.confPopularLinks.push({
          label: p.label,
          // Use JSON id if possible; otherwise fall back to a safe slug
          href: "#" + (rid ? rid : ("popular-" + p.key)),
        });
      } else {
        // Not fatal — you can add/fix the conference later
        console.warn(`Popular conference not found in JSON yet: ${p.label}`);
      }
    }
  }

  function renderActiveCategory() {
    const tag = state.activeTag;
    if (!tag) {
      state.list.innerHTML = `<p>Select a category above to view items.</p>`;
      state.subfilters.innerHTML = "";
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
      state.subfilters.innerHTML = "";
      state.list.innerHTML = renderCategoryError(label, cached.error);
      return;
    }

    let items = cached.items;

    // Conferences-only subfilters UI + filtering
    if (tag === "conferences") {
      renderConferenceSubfilters();

      if (state.confMode === "popular") {
        items = items.filter((it) => {
          const rid = String(it._raw?.id ?? "");
          // Must have an id to be reliably filtered; if missing id, it can't be "popular"
          return rid && state.confPopularIds.has(rid);
        });
      }
    } else {
      state.subfilters.innerHTML = "";
    }

    // Final status line (what you wanted)
    setStatus(`Loaded ${items.length} items in ${label}.`);

    if (!items.length) {
      const suffix = (tag === "conferences" && state.confMode === "popular")
        ? " (Popular Conferences)"
        : "";
      state.list.innerHTML = `<p>No items found for <strong>${escapeHtml(label)}${escapeHtml(suffix)}</strong> yet.</p>`;
      return;
    }

    state.list.innerHTML = items.map(renderCard).join("\n");
  }

  function renderConferenceSubfilters() {
    // Subfilter buttons
    const allActive = state.confMode === "all";
    const popActive = state.confMode === "popular";

    const quickLinks =
      state.confPopularLinks.length
        ? `<div class="conference-quick-links" aria-label="Conference quick links">
             ${state.confPopularLinks
               .map((l) => `<a href="${escapeAttr(l.href)}">${escapeHtml(l.label)}</a>`)
               .join(" ")}
           </div>`
        : "";

    state.subfilters.innerHTML = `
      <div class="conference-subfilters" role="group" aria-label="Conferences filters">
        <button type="button" data-subfilter="all" aria-pressed="${allActive ? "true" : "false"}">
          All Conferences
        </button>
        <button type="button" data-subfilter="popular" aria-pressed="${popActive ? "true" : "false"}">
          Popular Conferences
        </button>
      </div>
      ${quickLinks}
    `;

    updateSubfilterButtons();
  }

  function updateSubfilterButtons() {
    const btns = state.subfilters.querySelectorAll("button[data-subfilter]");
    btns.forEach((b) => {
      const mode = b.dataset.subfilter;
      const isActive = mode === state.confMode;
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
      b.classList.toggle("active", isActive);
    });
  }

  function renderCard(item) {
    const lines = [];

    // These are the core “conference-ish” fields you asked to always show when present
    if (item.frequency) lines.push(metaRow("Frequency", item.frequency));
    if (item.dates) lines.push(metaRow("Dates", item.dates));
    if (item.location) lines.push(metaRow("Location", item.location));
    if (item.deadlines) lines.push(metaRow("Submission deadlines", item.deadlines));
    if (item.org) lines.push(metaRow("Organization", item.org));

    const extra = buildExtraFields(item._raw);

    // If your JSON objects have "id", we use it for anchor jump links (quick links).
    const rid = String(item._raw?.id ?? "");
    const articleId = rid ? ` id="${escapeAttr(rid)}"` : "";

    return `
      <article class="calendar-card" data-category="${escapeHtml(item._tag)}"${articleId}>
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
              ? `
                <details class="calendar-card__more">
                  <summary>More fields</summary>
                  <dl class="calendar-card__extra">
                    ${extra.join("")}
                  </dl>
                </details>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  function buildExtraFields(raw) {
    if (!raw || typeof raw !== "object") return [];

    // Hide stuff we already surfaced, plus obvious internal fields
    const HIDE = new Set([
      "title", "name", "program", "event",
      "website", "url", "link",
      "location", "city", "where",
      "dates", "date", "startDate", "start_date", "when", "schedule",
      "frequency", "cadence",
      "submissionDeadlines", "submissionDeadline", "applicationDeadline", "deadlines", "deadline", "datesDeadline",
      "organization", "organizer", "institution", "institutionProgram", "journal", "company", "department", "degreeType",
      "description", "details", "notes", "summary",
      "_tag", "_label", "_raw"
    ]);

    const rows = [];
    for (const [k, v] of Object.entries(raw)) {
      if (HIDE.has(k)) continue;
      if (v === null || v === "" || typeof v === "undefined") continue;

      const label = prettifyKey(k);
      const value = typeof v === "string" ? v : JSON.stringify(v, null, 2);

      rows.push(metaRow(label, value));
    }
    return rows;
  }

  function metaRow(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${nl2br(escapeHtml(value))}</dd></div>`;
  }

  function updateActiveButton(tag) {
    const buttons = state.menu.querySelectorAll("button[data-filter-tag]");
    buttons.forEach((b) => {
      const bTag = (b.dataset.filterTag ?? "").trim();
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

  function renderCategoryError(label, err) {
    return `
      <p><strong>Could not load ${escapeHtml(label)}.</strong></p>
      <p>${escapeHtml(err?.message ?? String(err))}</p>
      <p>Common causes:</p>
      <ul>
        <li>A JSON file has invalid JSON (e.g., NaN or trailing commas)</li>
        <li>A filename doesn’t match exactly (case-sensitive on GitHub)</li>
        <li>Wrong GitHub Pages publish folder/path (HTML returned instead of JSON)</li>
      </ul>
    `;
  }

  function getCategory(tag) {
    return CATEGORIES.find((c) => c.tag === tag) || null;
  }

  function coalesce(...vals) {
    for (const v of vals) {
      if (v === null || typeof v === "undefined") continue;
      const s = String(v).trim();
      if (s !== "") return s;
    }
    return "";
  }

  function prettifyKey(k) {
    return String(k)
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (m) => m.toUpperCase());
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
    // safe-ish for attributes and hrefs
    return String(s).replaceAll('"', "%22");
  }

  function nl2br(s) {
    return String(s).replaceAll("\n", "<br>");
  }
})();
