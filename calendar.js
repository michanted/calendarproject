/* calendar.js
   CVNet Community Calendar — clean, minimal, working
   (Category-aware subfilters + search)

   Required in HTML:
   - #category-menu
   - #calendar-status
   - #calendar-subfilters
   - #calendar-list
   - #calendar-search
*/

(() => {
  const DATA_BASE = "./";

  // -------------------------
  // Categories
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
  // Descriptions
  // -------------------------
  const CATEGORY_DESCRIPTIONS = {
    conferences: `Major academic and industry meetings in vision science and related fields.`,
    online: `Recurring journal clubs, seminars, and online workshops.`,
    "special-issue": `Special and feature issues across relevant journals.`,
    education: `Courses, workshops, and summer schools.`,
    "grad-program": `Masters and PhD programs.`,
    jobs: `Academic and research positions.`,
    funding: `Fellowships, grants, and awards.`,
    competitions: `Community competitions and prizes.`,
  };

  // -------------------------
  // Schemas
  // -------------------------
  const CATEGORY_SCHEMAS = {
    conferences: ["title", "frequency", "dates", "location", "submissionDeadlines", "website"],
    online: ["title", "frequency", "dates", "description", "website"],
    "special-issue": ["title", "journalType", "openAccessStatus", "website"],
    education: ["title", "programType", "dates", "location", "website"],
    "grad-program": ["title", "degreeType", "institution", "location", "website"],
    jobs: ["title", "roleType", "institution", "location", "website"],
    funding: ["title", "fundingType", "dates", "eligibility", "website"],
    competitions: ["title", "focusArea", "frequency", "eligibility", "website"],
  };

  // -------------------------
  // Subfilters
  // -------------------------
  const CATEGORY_SUBFILTERS = {
    online: [
      { label: "All", value: "" },
      { label: "Journal Clubs", value: "journal club" },
      { label: "Seminar Series", value: "seminar series" },
      { label: "Workshops / Webinars", value: "workshop" },
    ],
    "special-issue": [
      { label: "All", value: "" },
      { label: "Open", value: "open" },
      { label: "Hybrid", value: "hybrid" },
    ],
  };

  // -------------------------
  // Conferences
  // -------------------------
  const POPULAR_CONFERENCES = [
    { label: "VSS", id: "vision-sciences-society-vss-2026" },
    { label: "SfN", id: "society-for-neuroscience-sfn-2026" },
    { label: "ECVP", id: "european-conference-on-visual-perception-ecvp-2026" },
  ];
  const POPULAR_ID_SET = new Set(POPULAR_CONFERENCES.map(p => p.id));

  // -------------------------
  // Elements
  // -------------------------
  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    status: document.getElementById("calendar-status"),
    subfilters: document.getElementById("calendar-subfilters"),
    description: document.getElementById("category-description"),
    search: document.getElementById("calendar-search"),
  };

  if (!els.menu || !els.list || !els.subfilters) {
    console.error("calendar.js: Missing required HTML elements.");
    return;
  }

  // -------------------------
  // State
  // -------------------------
  const state = {
    activeTag: null,
    activeSubfilter: "",
    confMode: "all",
    cache: new Map(),
    searchQuery: "",
    allLoaded: false,
  };

  // -------------------------
  // Init
  // -------------------------
  els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
  els.subfilters.innerHTML = "";

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);
  if (els.search) els.search.addEventListener("input", onSearchInput);

  // -------------------------
  // Handlers
  // -------------------------
  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    state.activeSubfilter = "";
    state.searchQuery = "";

    const tag = (btn.dataset.filterTag || "").trim();
    if (!tag) return reset();

    state.activeTag = tag;
    state.confMode = "all";

    await ensureLoaded(tag);
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-subfilter],button[data-conf-filter]");
    if (!btn) return;

    if (btn.dataset.confFilter) {
      state.confMode = btn.dataset.confFilter;
    } else {
      state.activeSubfilter = btn.dataset.subfilter;
    }

    render();
  }

  async function onSearchInput() {
    state.searchQuery = els.search.value.trim().toLowerCase();
    if (!state.searchQuery) return render();

    await ensureAllLoaded();
    render();
  }

  // -------------------------
  // Data
  // -------------------------
  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = CATEGORIES.find(c => c.tag === tag);
    const res = await fetch(DATA_BASE + cat.file, { cache: "no-store" });
    const data = await res.json();

    state.cache.set(tag, data.map(d => ({ ...d, _id: d.id || "" })));
  }

  async function ensureAllLoaded() {
    if (state.allLoaded) return;
    await Promise.all(CATEGORIES.map(c => ensureLoaded(c.tag)));
    state.allLoaded = true;
  }

  // -------------------------
  // Render
  // -------------------------
  function render() {
    let items = [];

    if (state.searchQuery) {
      for (const v of state.cache.values()) items.push(...v);
      items = items.filter(i =>
        JSON.stringify(i).toLowerCase().includes(state.searchQuery)
      );
      els.subfilters.innerHTML = "";
      setStatus(`Search results (${items.length})`);
    } else {
      items = state.cache.get(state.activeTag) || [];

      if (state.activeTag === "online" && state.activeSubfilter) {
        items = items.filter(i =>
          `${i.title} ${i.description}`.toLowerCase().includes(state.activeSubfilter)
        );
      }

      if (state.activeTag === "special-issue" && state.activeSubfilter) {
        items = items.filter(i =>
          (i.openAccessStatus || "").toLowerCase() === state.activeSubfilter
        );
      }

      if (state.activeTag === "conferences") {
        renderConferenceControls();
        if (state.confMode === "popular") {
          items = items.filter(i => POPULAR_ID_SET.has(i._id));
        }
      } else {
        renderCategorySubfilters();
      }

      setStatus(`Loaded ${items.length} items.`);
    }

    if (els.description) {
      els.description.textContent = CATEGORY_DESCRIPTIONS[state.activeTag] || "";
      els.description.style.display = state.activeTag ? "block" : "none";
    }

    els.list.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<p>No items found.</p>`;
  }

  function renderConferenceControls() {
    els.subfilters.innerHTML = `
      <div class="category-menu">
        <button data-conf-filter="all" class="${state.confMode === "all" ? "active" : ""}">All</button>
        <button data-conf-filter="popular" class="${state.confMode === "popular" ? "active" : ""}">Popular</button>
      </div>
    `;
  }

  function renderCategorySubfilters() {
    const filters = CATEGORY_SUBFILTERS[state.activeTag];
    if (!filters) {
      els.subfilters.innerHTML = "";
      return;
    }

    els.subfilters.innerHTML = `
      <div class="category-menu">
        ${filters.map(f =>
          `<button data-subfilter="${f.value}" class="${state.activeSubfilter === f.value ? "active" : ""}">
            ${f.label}
          </button>`
        ).join("")}
      </div>
    `;
  }

  function renderCard(item) {
    return `
      <article class="calendar-card">
        <h3>${item.title}</h3>
        ${item.website ? `<p><a href="${item.website}" target="_blank">Website</a></p>` : ""}
      </article>
    `;
  }

  // -------------------------
  // Helpers
  // -------------------------
  function reset() {
    state.activeTag = null;
    state.activeSubfilter = "";
    state.confMode = "all";
    els.subfilters.innerHTML = "";
    els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
    setStatus("");
  }

  function setStatus(msg) {
    els.status.textContent = msg;
  }
})();
