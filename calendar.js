/* calendar.js
   CVNet Community Calendar — clean, minimal, working

   Requirements in HTML:
   - #category-menu (buttons with data-filter-tag)
   - #calendar-status
   - #calendar-subfilters
   - #calendar-list
*/

(() => {
  const DATA_BASE = "./";

  /* =======================
     Categories
  ======================== */
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

  /* =======================
     Popular Conferences
     (ID-based, authoritative)
  ======================== */
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

  /* =======================
     State
  ======================== */
  const state = {
    activeTag: null,
    confMode: "all", // "all" | "popular"
    cache: new Map(),
  };

  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    status: document.getElementById("calendar-status"),
    subfilters: document.getElementById("calendar-subfilters"),
  };

  if (!els.menu || !els.list || !els.subfilters) {
    console.error("calendar.js: Missing required HTML elements.");
    return;
  }

  els.list.innerHTML = `<p>Select a category above to view items.</p>`;

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);

  /* =======================
     Menu click
  ======================== */
  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = btn.dataset.filterTag;

    if (!tag) {
      reset();
      return;
    }

    state.activeTag = tag;
    state.confMode = "all";
    highlightMenu(tag);

    const cat = getCategory(tag);
    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(tag);
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn) return;

    state.confMode = btn.dataset.confFilter;
    render();
  }

  /* =======================
     Data loading
  ======================== */
  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = getCategory(tag);
    const res = await fetch(DATA_BASE + cat.file);
    const json = await res.json();

    state.cache.set(tag, json.map(obj => ({
      ...obj,
      _id: obj.id || "",
      _category: cat.label,
    })));
  }

  /* =======================
     Rendering
  ======================== */
  function render() {
    const tag = state.activeTag;
    const cat = getCategory(tag);
    let items = state.cache.get(tag) || [];

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

    els.list.innerHTML = items.map(renderCard).join("");
  }

  function renderConferenceControls() {
    const links =
      state.confMode === "popular"
        ? `<nav style="margin:8px 0;">
            ${POPULAR_CONFERENCES.map(
              p => `<a href="#${p.id}">${p.label}</a>`
            ).join(" ")}
          </nav>`
        : "";

    els.subfilters.innerHTML = `
      <div style="margin:8px 0;">
        <button data-conf-filter="all">All Conferences</button>
        <button data-conf-filter="popular">Popular Conferences</button>
      </div>
      ${links}
    `;
  }

  function renderCard(item) {
    const idAttr = item._id ? `id="${item._id}"` : "";

    return `
      <article class="calendar-card" ${idAttr}>
        <h3>${escape(item.title || "(Untitled)")}</h3>
        ${item.frequency ? `<p><strong>Frequency:</strong> ${escape(item.frequency)}</p>` : ""}
        ${item.dates ? `<p><strong>Dates:</strong> ${escape(item.dates)}</p>` : ""}
        ${item.location ? `<p><strong>Location:</strong> ${escape(item.location)}</p>` : ""}
        ${item.submissionDeadlines ? `<p><strong>Submission deadlines:</strong> ${escape(item.submissionDeadlines)}</p>` : ""}
        ${item.website ? `<p><a href="${item.website}" target="_blank">Website</a></p>` : ""}
      </article>
    `;
  }

  /* =======================
     Helpers
  ======================== */
  function getCategory(tag) {
    return CATEGORIES.find(c => c.tag === tag);
  }

  function reset() {
    state.activeTag = null;
    state.confMode = "all";
    els.subfilters.innerHTML = "";
    els.list.innerHTML = `<p>Select a category above to view items.</p>`;
    setStatus("Cleared selection.");
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  function highlightMenu(tag) {
    els.menu.querySelectorAll("button").forEach(b => {
      b.classList.toggle("active", b.dataset.filterTag === tag);
    });
  }

  function escape(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
})();
