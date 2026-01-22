/* calendar.js
   CVNet Community Calendar — clean, minimal, working
   (Conferences subfilters + full-page DOS-style search)

   Required in HTML:
   - #category-menu (buttons with data-filter-tag; CLEAR has data-filter-tag="")
   - #calendar-status
   - #calendar-subfilters
   - #calendar-list
   - #calendar-search
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

  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    status: document.getElementById("calendar-status"),
    subfilters: document.getElementById("calendar-subfilters"),
    search: document.getElementById("calendar-search"),
  };

  if (!els.menu || !els.list || !els.subfilters) {
    console.error("calendar.js: Missing required HTML elements.");
    return;
  }

  const state = {
    activeTag: null,
    confMode: "all", // "all" | "popular"
    cache: new Map(), // tag -> normalized array
    searchQuery: "",
    allLoaded: false,
  };

  // Init UI
  els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
  els.subfilters.innerHTML = "";
  setStatus("");

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);

  if (els.search) {
    els.search.addEventListener("input", onSearchInput);
  }

  // Initial load from URL (?section=...)
  (async () => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (!section) return;

    const cat = getCategory(section);
    if (!cat) return;

    state.activeTag = section;
    state.confMode = "all";
    highlightMenu(section);

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(section);
    render();
  })();

  // Back/Forward support
  window.addEventListener("popstate", async () => {
    // clear search on navigation changes (keeps behavior sane)
    clearSearch();

    const section = new URLSearchParams(window.location.search).get("section");
    if (!section) {
      reset();
      return;
    }

    const cat = getCategory(section);
    if (!cat) return;

    state.activeTag = section;
    state.confMode = "all";
    highlightMenu(section);

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(section);
    render();
  });

  // -------------------------
  // Handlers
  // -------------------------
  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    // selecting a category = exit search mode
    clearSearch();

    const tag = (btn.dataset.filterTag ?? "").trim();

    // CLEAR
    if (tag === "") {
      history.pushState({}, "", window.location.pathname);
      reset();
      return;
    }

    state.activeTag = tag;
    state.confMode = "all";

    const url = new URL(window.location.href);
    url.searchParams.set("section", tag);
    history.pushState({}, "", url);

    highlightMenu(tag);

    const cat = getCategory(tag);
    if (!cat) {
      els.list.innerHTML = `<p>Unknown category: ${escapeHtml(tag)}</p>`;
      return;
    }

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(tag);
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn) return;

    if (state.activeTag !== "conferences") return;
    if (state.searchQuery) return; // no conf subfilters during global search

    const mode = btn.dataset.confFilter;
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    render();
  }

  async function onSearchInput() {
    state.searchQuery = (els.search.value || "").trim().toLowerCase();

    if (!state.searchQuery) {
      // back to normal view
      render();
      return;
    }

    // global search requires loading everything once
    setStatus("Loading all categories for search…");
    els.subfilters.innerHTML = "";
    await ensureAllLoaded();
    render();
  }

  // -------------------------
  // Data
  // -------------------------
  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = getCategory(tag);
    if (!cat) {
      state.cache.set(tag, []);
      return;
    }

    const url = new URL(DATA_BASE + cat.file, window.location.href);
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      state.cache.set(tag, []);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(await res.text());
    } catch {
      state.cache.set(tag, []);
      return;
    }

    if (!Array.isArray(parsed)) {
      state.cache.set(tag, []);
      return;
    }

    state.cache.set(tag, parsed.map(o => normalizeItem(o, cat)));
  }

  async function ensureAllLoaded() {
    if (state.allLoaded) return;

    await Promise.all(CATEGORIES.map(c => ensureLoaded(c.tag)));
    state.allLoaded = true;
  }

  function normalizeItem(raw, cat) {
    return {
      _id: String(raw?.id ?? ""),
      _category: cat.label,

      title: coalesce(raw.title, raw.name, raw.program, raw.event, raw.id) || "(Untitled)",
      website: coalesce(raw.website, raw.url, raw.link) || "",
      location: coalesce(raw.location, raw.city, raw.where) || "",

      dates: coalesce(raw.dates, raw.date, raw.startDate, raw.start_date, raw.when, raw.schedule) || "",
      frequency: coalesce(raw.frequency, raw.cadence) || "",
      submissionDeadlines: coalesce(
        raw.submissionDeadlines,
        raw.submissionDeadline,
        raw.deadlines,
        raw.deadline,
        raw.applicationDeadline
      ) || "",
      description: coalesce(raw.description, raw.details, raw.notes, raw.summary) || "",
    };
  }

  // -------------------------
  // Rendering
  // -------------------------
  function render() {
    const searching = !!state.searchQuery;

    // If not searching and no category selected, keep the prompt.
    if (!searching && !state.activeTag) return;

    let items = [];

    if (searching) {
      // global search across all cached categories
      for (const arr of state.cache.values()) items.push(...arr);

      const q = state.searchQuery;
      items = items.filter(item => {
        const haystack = [
          item.title,
          item.description,
          item.location,
          item.dates,
          item.frequency,
          item.submissionDeadlines,
          item._category,
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      });

      els.subfilters.innerHTML = "";
      setStatus(`Search results (${items.length})`);
    } else {
      const cat = getCategory(state.activeTag);
      items = state.cache.get(state.activeTag) || [];

      if (state.activeTag === "conferences") {
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
    }

    els.list.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<p>No items found.</p>`;
  }

  function renderConferenceControls() {
  const allActive = state.confMode === "all";
  const popActive = state.confMode === "popular";

  els.subfilters.innerHTML = `
    <div class="category-menu" style="margin:8px 0;">
      <button
        type="button"
        data-conf-filter="all"
        class="${allActive ? "active" : ""}"
        aria-pressed="${allActive}"
      >
        All Conferences
      </button>

      <button
        type="button"
        data-conf-filter="popular"
        class="${popActive ? "active" : ""}"
        aria-pressed="${popActive}"
      >
        Popular Conferences
      </button>
    </div>
  `;
}

function renderPopularConferenceButtons() {
  const container = document.getElementById("popular-conference-filters");
  if (!container) return;

  container.innerHTML = "";

  POPULAR_CONFERENCES
    .map(p => p.label)
    .sort()
    .forEach(label => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = "calendar-subfilter";
      btn.dataset.popConf = label;
      container.appendChild(btn);
    });

  container.style.display = "block";
}

   
  function renderCard(item) {
    const idAttr = item._id ? ` id="${escapeAttr(item._id)}"` : "";
    const catLine = state.searchQuery ? `<p><strong>Category:</strong> ${escapeHtml(item._category)}</p>` : "";

    return `
      <article class="calendar-card"${idAttr}>
        <h3>${escapeHtml(item.title)}</h3>
        ${catLine}
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
    els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
    setStatus("Cleared selection.");
  }

  function clearSearch() {
    state.searchQuery = "";
    if (els.search) els.search.value = "";
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
// -------------------------
// Last updated (footer)
// -------------------------
const lastUpdatedEl = document.getElementById("last-updated");
if (lastUpdatedEl) {
  const d = new Date(document.lastModified);

  const formatted = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  lastUpdatedEl.textContent = `Last Updated: ${formatted}`;
}   
})();



