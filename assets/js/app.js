// Drumuri bune - Main Application Logic & Store for Static Hosting
(function () {
  const STORAGE_KEY = "discover_romania_custom_articles_v1";
  const EVENT_NAME = "discover-romania-articles-updated";

  function getCustomArticles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch (e) {
      console.error("Storage error:", e);
      return {};
    }
  }

  function saveCustomArticles(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch (e) {
      console.error("Storage write error:", e);
    }
  }

  window.AppStore = {
    // Return combined articles for a county
    getCountyArticles(countySlug) {
      const defaults = (window.DEFAULT_ARTICLES_BY_COUNTY && window.DEFAULT_ARTICLES_BY_COUNTY[countySlug]) || [];
      const customs = (getCustomArticles()[countySlug]) || [];

      const map = new Map();
      defaults.forEach((a) => map.set(a.slug, a));
      customs.forEach((a) => map.set(a.slug, { ...a, isCustom: true }));

      return Array.from(map.values());
    },

    findArticle(countySlug, articleSlug) {
      const list = this.getCountyArticles(countySlug);
      return list.find((a) => a.slug === articleSlug);
    },

    countiesWithArticles() {
      const set = new Set();
      if (window.DEFAULT_ARTICLES_BY_COUNTY) {
        Object.keys(window.DEFAULT_ARTICLES_BY_COUNTY).forEach((k) => set.add(k));
      }
      Object.keys(getCustomArticles()).forEach((k) => set.add(k));
      return Array.from(set).filter((k) => this.getCountyArticles(k).length > 0);
    },

    getAllArticles() {
      const list = [];
      const withArts = this.countiesWithArticles();
      withArts.forEach((cSlug) => {
        const arts = this.getCountyArticles(cSlug);
        arts.forEach((a) => list.push({ countySlug: cSlug, article: a }));
      });
      return list;
    },

    saveArticle(countySlug, article) {
      const all = getCustomArticles();
      if (!all[countySlug]) all[countySlug] = [];

      const existingIdx = all[countySlug].findIndex((a) => a.slug === article.slug);
      const toSave = {
        ...article,
        isCustom: true,
        createdAt: article.createdAt || new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        all[countySlug][existingIdx] = toSave;
      } else {
        all[countySlug].push(toSave);
      }

      saveCustomArticles(all);

      if (typeof gtag === "function") {
        gtag("event", "publish_article", {
          county: countySlug,
          title: article.title,
          topic: article.slug
        });
      }
    },

    deleteArticle(countySlug, articleSlug) {
      const all = getCustomArticles();
      if (!all[countySlug]) return false;

      all[countySlug] = all[countySlug].filter((a) => a.slug !== articleSlug);
      if (all[countySlug].length === 0) delete all[countySlug];

      saveCustomArticles(all);
      return true;
    },

    resetToDefault() {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(EVENT_NAME));
    },

    exportJson() {
      return JSON.stringify(getCustomArticles(), null, 2);
    },

    importJson(jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed !== "object" || parsed === null) return { success: false, error: "JSON invalid" };

        const current = getCustomArticles();
        let count = 0;
        for (const [cSlug, list] of Object.entries(parsed)) {
          if (Array.isArray(list)) {
            if (!current[cSlug]) current[cSlug] = [];
            list.forEach((item) => {
              if (item && item.slug && item.title) {
                const idx = current[cSlug].findIndex((a) => a.slug === item.slug);
                if (idx >= 0) {
                  current[cSlug][idx] = { ...item, isCustom: true };
                } else {
                  current[cSlug].push({ ...item, isCustom: true });
                }
                count++;
              }
            });
          }
        }
        saveCustomArticles(current);
        return { success: true, count };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    getSectorByCounty(countySlug) {
      if (!window.ROMANIA_SECTORS) return null;
      return window.ROMANIA_SECTORS.find((s) => s.counties.includes(countySlug)) || null;
    },

    getCountyObj(countySlug) {
      if (!window.ROMANIA_COUNTIES) return null;
      return window.ROMANIA_COUNTIES.find((c) => c.slug === countySlug) || null;
    },
  };

  // Shared Helper to render Header
  window.renderSiteHeader = function (activePage) {
    const header = document.getElementById("site-header");
    if (!header) return;

    header.innerHTML = `
      <header class="sticky top-0 z-30 border-b border-[var(--border)] bg-[#f7f5ef]/95 backdrop-blur px-6 py-3.5">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <a href="index.html" class="flex items-baseline gap-2 text-decoration-none">
            <span class="font-display text-xl font-bold text-[var(--primary)]">Drumuri bune</span>
            <span class="hidden text-xs text-[var(--muted-foreground)] sm:inline">ghid pe sectoare și județe</span>
          </a>
          <div class="flex items-center gap-2">
            <nav class="flex items-center gap-1 text-sm font-medium">
              <a href="index.html" class="rounded-md px-3 py-1.5 transition-colors ${
                activePage === "harta" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Harta</a>
              <a href="sectoare.html" class="rounded-md px-3 py-1.5 transition-colors ${
                activePage === "sectoare" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Sectoare & Regiuni</a>
              <a href="panou.html" class="rounded-md px-3 py-1.5 transition-colors ${
                activePage === "panou" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Panou Articole</a>
              <a href="despre.html" class="rounded-md px-3 py-1.5 transition-colors ${
                activePage === "despre" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Despre</a>
            </nav>
          </div>
        </div>
      </header>
    `;
  };

  // Shared Helper to render Footer
  window.renderSiteFooter = function () {
    const footer = document.getElementById("site-footer");
    if (!footer) return;

    footer.innerHTML = `
      <footer class="mt-16 border-t border-[var(--border)] bg-[#f7f5ef]">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-[var(--muted-foreground)]">
          <div class="flex items-center gap-2">
            <span class="font-bold text-[var(--foreground)]">Drumuri bune</span>
            <span>— ghid turistic județ cu județ</span>
          </div>
          <div class="flex items-center gap-4 text-xs font-semibold">
            <a href="index.html" class="hover:text-[var(--primary)]">Harta României</a>
            <a href="sectoare.html" class="hover:text-[var(--primary)]">Sectoare & Regiuni</a>
            <a href="panou.html" class="hover:text-[var(--primary)]">Panou Articole</a>
            <a href="despre.html" class="hover:text-[var(--primary)]">Despre Proiect</a>
          </div>
        </div>
      </footer>
    `;
  };

  // Utility to read query params
  window.getParam = function (name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  };
})();
