/* calendar.js
   CVNet Community Calendar — clean, minimal, working (with Conferences subfilters + popular quick links)

   Required in HTML:
   - #category-menu (buttons with data-filter-tag; CLEAR should have data-filter-tag="")
   - #calendar-status
   - #calendar-subfilters
   - #calendar-list
*/

(() => {
  const DATA_BASE = "./";

  // -------------------------
  // Categories (JSON files)
  // -------------------------
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

  // -------------------------
  // Popular Conferences (IDs must match conferences.json "id")
  // -------------------------
  const POPULAR_CONFERENCES = [
    { label: "APA", id: "american-psychological-association-apa-2026" },
    { label: "APCV", id: "epc-apcv-2026" },
    { label: "APS", id: "association-for-psychological-science-aps-2026" },
    { label: "ARVO", id: "association-for-research-in-vision-and-ophthalmology-arvo-2026" },
    { label: "AVA", id: "applied-vision-association-ava-2026" },
    { label: "BAVRD", id: "bay-area-vision-research-day-bavrd-2026" },
    { label: "ECVP", id: "european-conference-on-visual-perception-ecvp-2026" },
    { label: "Gruppo del Colore", id: "gruppo-del-colore-annual-meeting-2026" },
    { label: "HVEI", id: "human-vision-and-electronic-imaging-hvei-2026" },
    { label: "ICVS", id: "international-colour-vision-society-icvs-2026" },
    { label: "MODVIS", id: "models-in-vision-science-modvis" },
    { label: "Optica Fall Vision", id: "optica-fall-vision-meeting-2026" },
    { label: "Psychonomics", id: "psychonomic-society-annual-meeting-2026" },
    { label: "SfN", id: "society-for-neuroscience-sfn-2026" },
    { label: "VSAC", id: "visual-science-art-conference-vsac-2026" },
    { label: "VSS", id: "vision-sciences-society-vss-2026" },
  ];

  const POPULAR_ID_SET = new Set(POPULAR_CONFERENCES.map(p => p.id));

  // -------------------------
  // DOM
  // -------------------------
  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    status: document.getElementById("calendar-status"),
    subfilters: document.getElementById("calendar-subfilters"),
    loadingMsg: document.getElementById("calendar-loading-message"), // optional
  };

  if (!els.menu || !els.list || !els.subfilters) {
    console.error("calendar.js: Missing required HTML elements (#category-menu, #calendar-list, #calendar-subfilters).");
    return;
  }

  // -------------------------
  // State
  // -------------------------
  const state = {
    activeTag: null,
    confMode: "all", // "all" | "popular"
    cache: new Map(), // tag -> normalized array
  };

  // Initial UI
  els.list.innerHTML = `<p>Select a category above to view items.</p>`;
  els.subfilters.innerHTML = "";
  setStatus("");

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);

  // -------------------------
  // Initial load from URL (Step 1)
  // -------------------------
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const sectionFromURL = params.get("section");

    if (!sectionFromURL) return;

    const cat = getCategory(sectionFromURL);
    if (!cat) return;

    state.activeTag = sectionFromURL;
    state.confMode = "all";
    highlightMenu(sectionFromURL);

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(sectionFromURL);
    render();
  })();

   
  // -------------------------
  // Handlers
  // -------------------------
  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag ?? "").trim();

    // CLEAR
    if (tag === "") {
      reset();
      return;
    }

    state.activeTag = tag;
    state.confMode = "all";
    highlightMenu(tag);

    const cat = getCategory(tag);
    if (!cat) {
      els.list.innerHTML = `<p>Unknown category: ${escapeHtml(tag)}</p>`;
      return;
    }

    if (els.loadingMsg) {
      els.loadingMsg.remove();
      els.loadingMsg = null;
    }

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(tag); // ✅ guarantees cache exists before render()
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn) return;

    if (state.activeTag !== "conferences") return;

    const mode = btn.dataset.confFilter; // "all" | "popular"
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    render(); // ✅ render from cache; no loading
  }

  // -------------------------
  // Data
  // -------------------------
  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = getCategory(tag);
    const url = new URL(DATA_BASE + cat.file, window.location.href);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      els.list.innerHTML = `<p><strong>Could not load ${escapeHtml(cat.label)}.</strong> (HTTP ${res.status})</p>`;
      state.cache.set(tag, []);
      return;
    }

    const text = await res.text();
    const trimmed = text.trim();

    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      els.list.innerHTML = `<p><strong>Could not load ${escapeHtml(cat.label)}.</strong> JSON path returned HTML.</p>`;
      state.cache.set(tag, []);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      els.list.innerHTML = `<p><strong>Invalid JSON in ${escapeHtml(cat.file)}.</strong> ${escapeHtml(err.message)}</p>`;
      state.cache.set(tag, []);
      return;
    }

    if (!Array.isArray(parsed)) {
      els.list.innerHTML = `<p><strong>${escapeHtml(cat.file)} must be a JSON array</strong> (e.g., [] or [{...}]).</p>`;
      state.cache.set(tag, []);
      return;
    }

    const normalized = parsed.map(obj => normalizeItem(obj, cat));
    state.cache.set(tag, normalized);
  }

  function normalizeItem(raw, cat) {
    return {
      _raw: raw,
      _id: String(raw?.id ?? ""),
      _category: cat.label,

      title: coalesce(raw.title, raw.name, raw.program, raw.event, raw.id) || "(Untitled)",
      website: coalesce(raw.website, raw.url, raw.link) || "",
      location: coalesce(raw.location, raw.city, raw.where) || "",

      dates: coalesce(raw.dates, raw.date, raw.startDate, raw.start_date, raw.when, raw.schedule) || "",
      frequency: coalesce(raw.frequency, raw.cadence) || "",
      submissionDeadlines: coalesce(raw.submissionDeadlines, raw.submissionDeadline, raw.deadlines, raw.deadline, raw.applicationDeadline) || "",
      description: coalesce(raw.description, raw.details, raw.notes, raw.summary) || "",
    };
  }

  // -------------------------
  // Rendering
  // -------------------------
  function render() {
    const tag = state.activeTag;
    if (!tag) return;

    const cat = getCategory(tag);
    const cached = state.cache.get(tag);

    if (!cached) {
      els.list.innerHTML = `<p>Loading…</p>`;
      return;
    }

    let items = cached;

    if (tag === "conferences") {
      renderConferenceControls();

      if (state.confMode === "popular") {
        items = items.filter(i => POPULAR_ID_SET.has(i._id));
        setStatus(`Loaded ${items.length} items in Popular Conferences.`);
      } else {
        setStatus(`Loaded ${items.length} items in ${cat.label}.`);
      }
    } else {
      els.subfilters.innerHTML = "";
      setStatus(`Loaded ${items.length} items in ${cat.label}.`);
    }

    els.list.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<p>No items found.</p>`;
  }

  function renderConferenceControls() {
    const allActive = state.confMode === "all";
    const popActive = state.confMode === "popular";

    const linksHtml = popActive
      ? `
        <nav aria-label="Popular conference quick links" style="margin:8px 0;">
          <strong>Popular:</strong><br>
          ${POPULAR_CONFERENCES.map(p => `<a href="#${escapeAttr(p.id)}">${escapeHtml(p.label)}</a>`).join(" | ")}
        </nav>
      `
      : "";

    els.subfilters.innerHTML = `
      <div style="margin:8px 0;">
        <button type="button" data-conf-filter="all" aria-pressed="${allActive ? "true" : "false"}">All Conferences</button>
        <button type="button" data-conf-filter="popular" aria-pressed="${popActive ? "true" : "false"}">Popular Conferences</button>
      </div>
      ${linksHtml}
    `;
  }

  function renderCard(item) {
    const idAttr = item._id ? ` id="${escapeAttr(item._id)}"` : "";

    return `
      <article class="calendar-card"${idAttr}>
        <h3>${escapeHtml(item.title)}</h3>

        ${item.frequency ? `<p><strong>Frequency:</strong> ${escapeHtml(item.frequency)}</p>` : ""}
        ${item.dates ? `<p><strong>Dates:</strong> ${escapeHtml(item.dates)}</p>` : ""}
        ${item.location ? `<p><strong>Location:</strong> ${escapeHtml(item.location)}</p>` : ""}
        ${item.submissionDeadlines ? `<p><strong>Submission deadlines:</strong> ${escapeHtml(item.submissionDeadlines)}</p>` : ""}

        ${item.website ? `<p><a href="${escapeAttr(item.website)}" target="_blank" rel="noopener">Website</a></p>` : ""}
        ${item.description ? `<p>${nl2br(escapeHtml(item.description))}</p>` : ""}
      </article>
    `;
  }

  // -------------------------
  // Helpers
  // -------------------------
  function getCategory(tag) {
    return CATEGORIES.find(c => c.tag === tag) || null;
  }

  function reset() {
    state.activeTag = null;
    state.confMode = "all";
    highlightMenu("");
    els.subfilters.innerHTML = "";
    els.list.innerHTML = `<p>Select a category above to view items.</p>`;
    setStatus("Cleared selection.");
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  function highlightMenu(tag) {
    els.menu.querySelectorAll("button[data-filter-tag]").forEach(b => {
      const bTag = (b.dataset.filterTag ?? "").trim();
      b.classList.toggle("active", bTag === tag);
      b.setAttribute("aria-pressed", bTag === tag ? "true" : "false");
    });
  }

  function coalesce(...vals) {
    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) return s;
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

