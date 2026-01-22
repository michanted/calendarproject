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

const CATEGORY_DESCRIPTIONS = {
  conferences: `
Major academic and industry meetings in vision science, neuroscience, imaging, color, and related fields.
Includes key dates for abstracts, registration, and workshops.
Conferences are listed in chronological order by event date (not by submission deadlines).
`,

  online: `
Recurring journal clubs and seminar series open to the community, plus selected online webinars and workshops.
`,

  "special-issue": `
Click here for a comprehensive list of relevant journals, complete with website information, type of journal, open access status, and more.

For special or feature issues, we try to keep up to date with the following journals:
Attention, Perception & Performance; Color Research and Application; IOVS; JOSA A/B; JOV;
Multisensory Perception; Perception; and Vision Research.

We also provide permanent links for some journals’ special or feature issues.
If you have suggestions for journals or calls we should track, or would like to share information
about a special issue, please contact us.
`,

  education: `
Workshops, classes, and summer schools to build skills in perception, imaging, analysis, and research methods.
`,

  "grad-program": `
Doctoral and Masters opportunities.
Includes dedicated PhD and MSc programs submitted by members.
`,

  jobs: `
PhD, postdoc, RA, and faculty positions in vision, perception, neuroscience, imaging, and allied areas.
`,

  funding: `
Travel awards, fellowships, and research support opportunities with typical timelines and eligibility notes.
`,

  competitions: `
Community contests and prizes highlighting creativity and achievement
(e.g., Illusion of the Year).
`,
};

const CATEGORY_SCHEMAS = {
  conferences: [
    "title",
    "frequency",
    "dates",
    "location",
    "submissionDeadlines",
    "website",
  ],

  online: [
    "title",
    "frequency",
    "dates",
    "description",
    "website",
  ],

  "special-issue": [
    "title",              // journal name
    "journalType",
    "openAccessStatus",
    "website",
  ],

  education: [
    "title",
    "programType",
    "dates",
    "location",
    "website",
  ],

  "grad-program": [
    "title",
    "degreeType",
    "institution",
    "location",
    "website",
  ],

  jobs: [
    "title",
    "roleType",
    "institution",
    "location",
    "website",
  ],

  funding: [
    "title",
    "fundingType",
    "dates",
    "eligibility",
    "website",
  ],

  competitions: [
    "title",
    "focusArea",
    "frequency",
    "eligibility",
    "website",
  ],
};

   
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

  const POPULAR_JOURNALS = [
  { label: "Vision Research", id: "vision-research" },
  { label: "Journal of Vision", id: "journal-of-vision" },
  { label: "IOVS", id: "iovs" },
];

const POPULAR_JOURNAL_ID_SET = new Set(
  POPULAR_JOURNALS.map(j => j.id)
);


  const POPULAR_ID_SET = new Set(POPULAR_CONFERENCES.map(p => p.id));

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

  const state = {
    activeTag: null,
    confMode: "all", // "all" | "popular"
    activePopularLabel: null, 
    activeSubfilter: "",            // ✅ FIX 1
    cache: new Map(),
    searchQuery: "",
    allLoaded: false,
  };

  // Init UI
  els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
  els.subfilters.innerHTML = "";
  setStatus("");

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);
  els.subfilters.addEventListener("click", onCategorySubfilterClick);
  document.addEventListener("click", onPopularConferenceClick);

  if (els.search) {
    els.search.addEventListener("input", onSearchInput);
  }

    // -------------------------
  // Handlers
  // -------------------------

  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    // Reset state
    state.activeSubfilter = "";
    clearSearch();

    const tag = (btn.dataset.filterTag ?? "").trim();

    // CLEAR button
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

    setStatus("Loading…");
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(tag);
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn) return;

    // Conference-only filters
    if (state.activeTag !== "conferences") return;
    if (state.searchQuery) return;

    const mode = btn.dataset.confFilter;
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    state.activePopularLabel = null;

    render();
  }

  function onPopularConferenceClick(e) {
    const btn = e.target.closest("button[data-pop-conf]");
    if (!btn) return;

    state.activePopularLabel = btn.dataset.popConf;
    render();
  }

  async function onSearchInput() {
    state.searchQuery = (els.search.value || "").trim().toLowerCase();

    if (!state.searchQuery) {
      render();
      return;
    }

    setStatus("Loading all categories for search…");
    els.subfilters.innerHTML = "";

    await ensureAllLoaded();
    render();
  }

  function onCategorySubfilterClick(e) {
    const btn = e.target.closest("button[data-subfilter]");
    if (!btn) return;

    state.activeSubfilter = btn.dataset.subfilter;
    render();
  }

 // -------------------------
// Data
// -------------------------
async function ensureLoaded(tag) {
  if (state.cache.has(tag)) return;

  const category = getCategory(tag);
  if (!category) return;

  const response = await fetch(
    new URL(DATA_BASE + category.file, location),
    { cache: "no-store" }
  );

  const rawData = await response.json();
  const normalized = rawData.map(item => normalizeItem(item, category));

  state.cache.set(tag, normalized);
}

async function ensureAllLoaded() {
  if (state.allLoaded) return;

  await Promise.all(
    CATEGORIES.map(cat => ensureLoaded(cat.tag))
  );

  state.allLoaded = true;
}

function normalizeItem(raw, category) {
  return {
    _id: String(raw?.id ?? ""),
    _category: category.label,

    title: raw.title || raw.name || raw.id || "(Untitled)",
    description: raw.description || "",
    website: raw.website || raw.url || "",

    location: raw.location || "",
    dates: raw.dates || "",
    frequency: raw.frequency || "",
    submissionDeadlines: raw.submissionDeadlines || "",

    // category-specific fields pass through untouched
    ...raw,
  };
}


  function render() {
  if (!state.activeTag && !state.searchQuery) return;

  let items = [];

  // -------------------------
  // SEARCH MODE
  // -------------------------
  if (state.searchQuery) {
    for (const arr of state.cache.values()) items.push(...arr);

    const q = state.searchQuery;
    items = items.filter(item =>
      Object.values(item).join(" ").toLowerCase().includes(q)
    );

    els.subfilters.innerHTML = "";
    setStatus(`Search results (${items.length})`);
  }

  // -------------------------
  // CATEGORY MODE
  // -------------------------
  else {
    const category = getCategory(state.activeTag);
    items = state.cache.get(state.activeTag) || [];

    // ---- Category subfilter logic
    if (state.activeSubfilter) {
      // Online Seminars
      if (state.activeTag === "online") {
        const q = state.activeSubfilter;
        items = items.filter(item =>
          `${item.title} ${item.description}`.toLowerCase().includes(q)
        );
      }

      // Special / Feature Issues
      if (state.activeTag === "special-issue") {
        if (state.activeSubfilter === "popular") {
          items = items.filter(item => item.isPopular === true);
        } else if (
          state.activeSubfilter === "open" ||
          state.activeSubfilter === "hybrid"
        ) {
          items = items.filter(
            item => item.openAccessStatus === state.activeSubfilter
          );
        }
      }
    }

    // ---- Conferences (special case)
    if (state.activeTag === "conferences") {
      renderConferenceControls();

      if (state.confMode === "popular") {
        items = items.filter(item => POPULAR_ID_SET.has(item._id));

        if (state.activePopularLabel) {
          const match = POPULAR_CONFERENCES.find(
            p => p.label === state.activePopularLabel
          );
          if (match) {
            items = items.filter(item => item._id === match.id);
          }
        }

        renderPopularConferenceButtons();

        setStatus(
          state.activePopularLabel
            ? `Loaded 1 item (${state.activePopularLabel}).`
            : `Loaded ${items.length} items in Popular Conferences.`
        );
      } else {
        hidePopularConferenceButtons();
        renderCategorySubfilters();
        setStatus(`Loaded ${items.length} items in ${category.label}.`);
      }
    }

    // ---- All other categories
    else {
      hidePopularConferenceButtons();
      renderCategorySubfilters();
      setStatus(`Loaded ${items.length} items in ${category.label}.`);
    }
  }

  // -------------------------
  // Category description
  // -------------------------
  if (els.description) {
    const text = CATEGORY_DESCRIPTIONS[state.activeTag];
    if (text) {
      els.description.textContent = text.trim();
      els.description.style.display = "block";
    } else {
      els.description.textContent = "";
      els.description.style.display = "none";
    }
  }

  // -------------------------
  // Render cards
  // -------------------------
  els.list.innerHTML = items.length
    ? items.map(renderCard).join("")
    : `<p>No items found.</p>`;
}


// -------------------------
// Helpers
// -------------------------
function getCategory(tag) {
  return CATEGORIES.find(c => c.tag === tag);
}

function reset() {
  state.activeTag = null;
  state.confMode = "all";
  state.activePopularLabel = null;
  state.activeSubfilter = "";

  hidePopularConferenceButtons();
  hidePopularJournalButtons();

  els.subfilters.innerHTML = "";
  els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
  setStatus("Cleared selection.");

  if (els.description) {
    els.description.textContent = "";
    els.description.style.display = "none";
  }
}

function hidePopularJournalButtons() {
  const c = document.getElementById("popular-journal-filters");
  if (!c) return;

  c.innerHTML = "";
  c.style.display = "none";
}

function clearSearch() {
  state.searchQuery = "";
  if (els.search) els.search.value = "";
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function highlightMenu(tag) {
  els.menu.querySelectorAll("button").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.filterTag === tag)
  );
}
})();
