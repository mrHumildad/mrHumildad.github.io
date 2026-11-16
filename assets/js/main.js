/* ==========================================================================
   SQUAD SELECT — page behaviour
   Language switch, GitHub stats render, theme, receipt counter, two easter eggs.
   No dependencies, no build step.
   ========================================================================== */
(() => {
  "use strict";

  const root = document.documentElement;
  const KEY = { lang: "mh.lang", theme: "mh.theme", visits: "mh.visits", sound: "mh.sound" };
  const SUPPORTED = ["en", "es"];

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* private mode, fine */ }
    }
  };

  let lang = "en";
  let dict = null;
  let lastStats = null;
  let soundOn = store.get(KEY.sound) === "on";
  let audioCtx = null;

  const locale = () => (lang === "es" ? "es-ES" : "en-GB");
  const nf = () => new Intl.NumberFormat(locale());

  /* ---------------------------------------------------------------- i18n */
  const textEls = [...document.querySelectorAll("[data-i18n]")];
  const ariaEls = [...document.querySelectorAll("[data-i18n-aria]")];
  const metaEls = [...document.querySelectorAll("[data-i18n-content]")];

  const originals = new Map();
  const originalAria = new Map();
  const originalMeta = new Map();
  const originalTitle = document.title;

  textEls.forEach((el) => originals.set(el, el.textContent));
  ariaEls.forEach((el) => originalAria.set(el, el.getAttribute("aria-label") || ""));
  metaEls.forEach((el) => originalMeta.set(el, el.getAttribute("content") || ""));

  function pickLang() {
    const fromQuery = new URLSearchParams(location.search).get("lang");
    if (fromQuery && SUPPORTED.includes(fromQuery)) return fromQuery;
    const saved = store.get(KEY.lang);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return SUPPORTED.includes(nav) ? nav : "en";
  }

  let dictPending = null;

  // The dictionary loads as a <script> rather than a fetch: fetch() of a local
  // file is blocked, so the toggle would silently do nothing when index.html
  // is opened straight from disk.
  function loadDict() {
    if (dict) return Promise.resolve(dict);
    if (dictPending) return dictPending;

    dictPending = new Promise((resolve, reject) => {
      if (window.MH_I18N_ES) {
        dict = window.MH_I18N_ES;
        resolve(dict);
        return;
      }
      const script = document.createElement("script");
      script.src = "assets/i18n/es.js";
      script.async = true;
      script.onload = () => {
        if (!window.MH_I18N_ES) {
          reject(new Error("es.js loaded without a dictionary"));
          return;
        }
        dict = window.MH_I18N_ES;
        resolve(dict);
      };
      script.onerror = () => reject(new Error("es.js failed to load"));
      document.head.appendChild(script);
    });

    // A failed load must stay retryable on the next click.
    dictPending.catch(() => { dictPending = null; });
    return dictPending;
  }

  function t(key) {
    if (lang === "es" && dict && typeof dict[key] === "string") return dict[key];
    return null;
  }

  function applyLang() {
    textEls.forEach((el) => {
      const value = t(el.dataset.i18n);
      el.textContent = value !== null ? value : originals.get(el);
    });

    ariaEls.forEach((el) => {
      const value = t(el.dataset.i18nAria);
      el.setAttribute("aria-label", value !== null ? value : originalAria.get(el));
    });

    metaEls.forEach((el) => {
      const value = t(el.dataset.i18nContent);
      el.setAttribute("content", value !== null ? value : originalMeta.get(el));
    });

    const title = t("meta.title");
    document.title = title !== null ? title : originalTitle;

    const langToggle = document.getElementById("lang-toggle");
    if (langToggle) {
      langToggle.textContent = lang === "en" ? "ES" : "EN";
      langToggle.setAttribute(
        "aria-label",
        t("topbar.lang.aria") || "Switch language to Spanish"
      );
    }

    renderThemeAria();
    renderSound();
    renderVisits();
    if (lastStats) renderStats(lastStats);
  }

  function setLang(next, { persist = true } = {}) {
    lang = SUPPORTED.includes(next) ? next : "en";
    root.lang = lang;
    if (persist) store.set(KEY.lang, lang);

    if (lang === "es") {
      loadDict()
        .then(applyLang)
        .catch((err) => {
          // Without the copy the switch would lie: label says EN, page stays
          // English. Go back to a truthful English state instead.
          console.warn("[i18n] Spanish copy unavailable, staying in English:", err);
          lang = "en";
          root.lang = "en";
          if (persist) store.set(KEY.lang, "en");
          applyLang();
        });
    } else {
      applyLang();
    }
  }

  /* --------------------------------------------------------------- theme */
  function currentTheme() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }

  function renderThemeAria() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const dark = currentTheme() === "dark";
    const fallback = dark ? "Switch to light theme" : "Switch to dark theme";
    btn.setAttribute("aria-label", t(dark ? "topbar.theme.ariaDark" : "topbar.theme.ariaLight") || fallback);
  }

  function setTheme(theme, { persist = true } = {}) {
    root.dataset.theme = theme === "light" ? "light" : "dark";
    if (persist) store.set(KEY.theme, root.dataset.theme);
    renderThemeAria();
  }

  /* --------------------------------------------------------------- sound */
  function renderSound() {
    const btn = document.getElementById("sound-toggle");
    if (!btn) return;
    const key = soundOn ? "footer.sound.on" : "footer.sound.off";
    btn.textContent = t(key) || (soundOn ? "♪ Sound on" : "♪ Sound off");
    btn.setAttribute("aria-pressed", String(soundOn));
  }

  function chime() {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const at = t0 + i * 0.085;
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.05, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.18);
      });
    } catch { /* audio unavailable, never fatal */ }
  }

  /* ----------------------------------------------------------- stats view */
  function setTile(id, value, missing = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.dataset.missing = String(missing);
  }

  function unavailable() {
    return t("stats.unavailable") || "n/a";
  }

  function drawContributions(weeks, total) {
    const holder = document.getElementById("contrib");
    if (!holder || !Array.isArray(weeks) || !weeks.length) return;

    const NS = "http://www.w3.org/2000/svg";
    const cell = 10;
    const gap = 3;
    const cols = weeks.length;
    const width = cols * (cell + gap) - gap;
    const height = 7 * (cell + gap) - gap;

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "contrib-svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      (t("stats.contrib.aria") || "{n} contributions in the last year").replace("{n}", nf().format(total || 0))
    );

    let unit = 1;
    weeks.forEach((week) => week.forEach((n) => { if (n > unit) unit = n; }));

    weeks.forEach((week, x) => {
      week.forEach((count, y) => {
        const rect = document.createElementNS(NS, "rect");
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / unit) * 4));
        rect.setAttribute("x", x * (cell + gap));
        rect.setAttribute("y", y * (cell + gap));
        rect.setAttribute("width", cell);
        rect.setAttribute("height", cell);
        rect.setAttribute("rx", 2);
        if (level > 0) rect.setAttribute("class", "lvl" + level);
        svg.appendChild(rect);
      });
    });

    holder.replaceChildren(svg);
    const totalEl = document.getElementById("contrib-total");
    if (totalEl) {
      totalEl.textContent = (t("stats.contrib.total") || "Total {n}").replace("{n}", nf().format(total || 0));
    }
  }

  function renderLanguages(languages) {
    const holder = document.getElementById("langs");
    if (!holder) return;
    holder.replaceChildren();

    (languages || []).slice(0, 4).forEach((entry) => {
      const row = document.createElement("div");
      row.className = "lang";

      const name = document.createElement("span");
      name.className = "lang-name";
      name.textContent = entry.name;

      const bar = document.createElement("span");
      bar.className = "lang-bar";
      const fill = document.createElement("i");
      fill.style.width = Math.max(2, Math.min(100, entry.pct)) + "%";
      bar.appendChild(fill);

      const pct = document.createElement("span");
      pct.className = "lang-pct";
      pct.textContent = entry.pct + "%";

      row.append(name, bar, pct);
      holder.appendChild(row);
    });
  }

  function renderPendingCalendar() {
    const holder = document.getElementById("contrib");
    if (holder) {
      const box = document.createElement("p");
      box.className = "contrib-pending";
      box.textContent =
        t("stats.contrib.pending") ||
        "Contribution calendar arrives with the morning bot run (04:17 UTC).";
      holder.replaceChildren(box);
    }
    const totalEl = document.getElementById("contrib-total");
    if (totalEl) totalEl.textContent = "";
  }

  function renderStats(stats) {
    lastStats = stats;
    const haveContrib = stats.contributions && Array.isArray(stats.contributions.weeks);
    const total = haveContrib ? stats.contributions.total || 0 : null;

    setTile("stat-repos", nf().format(stats.public_repos || 0));
    setTile("stat-stars", nf().format(stats.stars || 0));
    setTile("stat-followers", nf().format(stats.followers || 0));
    setTile("stat-commits", total === null ? unavailable() : nf().format(total), total === null);
    setTile(
      "stat-streak",
      stats.longest_streak && stats.longest_streak.days
        ? (t("stats.days") || "{n} d").replace("{n}", nf().format(stats.longest_streak.days))
        : unavailable(),
      !stats.longest_streak || !stats.longest_streak.days
    );

    renderLanguages(stats.top_languages);

    if (haveContrib) {
      drawContributions(stats.contributions.weeks, total);
    } else {
      renderPendingCalendar();
    }

    const updated = document.getElementById("stats-updated");
    if (updated && stats.generated_at) {
      const date = new Date(stats.generated_at);
      if (!Number.isNaN(date.getTime())) {
        updated.textContent =
          (t("stats.updated") || "Updated") + " " +
          new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }).format(date);
      }
    }
  }

  function showLiveStats() {
    const live = document.getElementById("stats-live");
    if (live) {
      live.hidden = false;
      // The observer cannot see them while hidden, so reveal them explicitly.
      live.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    }
    const fallback = document.getElementById("stats-fallback");
    if (fallback) fallback.hidden = true;
  }

  async function loadStats() {
    const note = document.getElementById("stats-note");
    try {
      const res = await fetch("stats.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      renderStats(await res.json());
      showLiveStats();
      if (note) note.hidden = true;
    } catch (err) {
      console.warn("[stats]", err);
      // Keep the static snapshot visible; it is already in the document.
      ["stat-commits", "stat-streak"].forEach((id) => setTile(id, unavailable(), true));
      if (note) note.hidden = false;
    }
  }

  /* -------------------------------------------------------------- receipt */
  let visitCount = 1;

  function bumpVisits() {
    const previous = Number.parseInt(store.get(KEY.visits) || "0", 10);
    visitCount = (Number.isFinite(previous) && previous > 0 ? previous : 0) + 1;
    store.set(KEY.visits, String(visitCount));
  }

  function renderVisits() {
    const numberEl = document.getElementById("visit-number");
    if (numberEl) numberEl.textContent = nf().format(visitCount);

    const dateEl = document.getElementById("visit-date");
    if (dateEl) {
      dateEl.textContent = new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(new Date());
    }
  }

  /* ---------------------------------------------------------------- reveal */
  function listenReveal() {
    const items = [...document.querySelectorAll(".reveal")];
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    const saved = store.get(KEY.theme);
    setTheme(saved === "light" ? "light" : "dark", { persist: false });
    bumpVisits();
    setLang(pickLang(), { persist: false });
    listenReveal();
    loadStats();

    document.getElementById("lang-toggle")?.addEventListener("click", () => {
      setLang(lang === "en" ? "es" : "en");
    });

    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
      chime();
    });

    document.getElementById("sound-toggle")?.addEventListener("click", () => {
      soundOn = !soundOn;
      store.set(KEY.sound, soundOn ? "on" : "off");
      renderSound();
      if (soundOn) chime();
    });

    // Animated clips fall back to their first-frame poster when motion is reduced.
    const animated = document.querySelector("img[data-still]");
    if (animated && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animated.src = animated.dataset.still;
    }

    document.getElementById("terminal")?.addEventListener("click", chime);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
