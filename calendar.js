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
Community contests and prizes highlighting creativity and achievement.
`,
  };

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

  // ✅ FIX 1: moved up
  const CATEGORY_SUBFILTERS = {
    online: [
      { label: "All", value: "" },
      { label: "Journal Clubs", value: "journal club" },
      { label: "Seminar Series", value: "seminar series" },
      { label: "Workshops/Webinars", value: "workshop" },
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

  const POPULAR_ID_SET = new Set(POPULAR_CONFERENCES.map(p => p.id));

  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    status: document.getElementById("calendar-status"),
    subfilters: document.getElementById("calendar-subfilters"),
    description: document.getElementById("category-description"),
    search: document.getElementById("calendar-search"),
  };

  const state = {
    activeTag: null,
    confMode: "all",
    activePopularLabel: null,
    activeSubfilter: "", // ✅ FIX 2
    cache: new Map(),
    searchQuery: "",
    allLoaded: false,
  };

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);
  els.subfilters.addEventListener("click", onCategorySubfilterClick); // ✅ FIX 3
  document.addEventListener("click", onPopularConferenceClick);

  if (els.search) els.search.addEventListener("input", onSearchInput);

  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    state.activeSubfilter = ""; // ✅ FIX 4
    clearSearch();

    const tag = btn.dataset.filterTag.trim();
    if (!tag) return reset();

    state.activeTag = tag;
    state.confMode = "all";

    await ensureLoaded(tag);
    render();
  }

  function onCategorySubfilterClick(e) {
    const btn = e.target.closest("button[data-subfilter]");
    if (!btn) return;
    state.activeSubfilter = btn.dataset.subfilter;
    render();
  }

  function renderCategorySubfilters() {
    const filters = CATEGORY_SUBFILTERS[state.activeTag];
    if (!filters) return;

    els.subfilters.innerHTML = `
      <div class="category-menu">
        ${filters.map(f => `
          <button data-subfilter="${f.value}" class="${state.activeSubfilter === f.value ? "active" : ""}">
            ${f.label}
          </button>`).join("")}
      </div>`;
  }

  function render() {
    let items = state.cache.get(state.activeTag) || [];

    renderCategorySubfilters(); // ✅ FIX 5

    if (state.activeTag === "online" && state.activeSubfilter) {
      const q = state.activeSubfilter;
      items = items.filter(i =>
        `${i.title} ${i.description}`.toLowerCase().includes(q)
      );
    }

    els.list.innerHTML = items.map(renderCard).join("");
  }

  function renderCard(item) {
    const schema = CATEGORY_SCHEMAS[state.activeTag] || [];
    return `
      <article class="calendar-card">
        <h3>${item.title}</h3>
        ${schema.filter(f => f !== "title").map(f =>
          item[f]
            ? f === "website"
              ? `<p><a href="${item[f]}" target="_blank">Website</a></p>`
              : `<p><strong>${f}:</strong> ${item[f]}</p>`
            : ""
        ).join("")}
      </article>`;
  }

  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;
    const cat = CATEGORIES.find(c => c.tag === tag);
    const res = await fetch(cat.file);
    const data = await res.json();
    state.cache.set(tag, data);
  }

  function reset() {
    state.activeTag = null;
    state.activeSubfilter = "";
    els.subfilters.innerHTML = "";
    els.list.innerHTML = "";
  }

  function clearSearch() {
    state.searchQuery = "";
    if (els.search) els.search.value = "";
  }

})();
