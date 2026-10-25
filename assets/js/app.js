// Drumuri bune - Main Application Logic & Store for Static Hosting
(function () {
  const STORAGE_KEY = "discover_romania_custom_articles_v3";
  const UGC_STORAGE_KEY = "discover_romania_ugc_submissions_v3";
  const EVENT_NAME = "discover-romania-articles-updated";
  const UGC_EVENT_NAME = "discover-romania-ugc-updated";

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
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(EVENT_NAME));
      }
    } catch (e) {
      console.error("Storage write error:", e);
    }
  }

  function getUgcSubmissions() {
    try {
      const raw = localStorage.getItem(UGC_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("UGC storage error:", e);
      return [];
    }
  }

  function saveUgcSubmissions(data) {
    try {
      localStorage.setItem(UGC_STORAGE_KEY, JSON.stringify(data));
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(UGC_EVENT_NAME));
      }
    } catch (e) {
      console.error("UGC storage write error:", e);
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
      localStorage.removeItem(UGC_STORAGE_KEY);
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(EVENT_NAME));
        window.dispatchEvent(new Event(UGC_EVENT_NAME));
      }
    },

    deleteAllArticles() {
      this.resetToDefault();
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

    // UGC (User Generated Content) Management
    getUgcSubmissions(filter = "all") {
      const list = getUgcSubmissions();
      if (filter === "all") return list;
      return list.filter((item) => item.status === filter);
    },

    getPendingUgcCount() {
      return this.getUgcSubmissions("pending").length;
    },

    getUgcSubmissionById(id) {
      return getUgcSubmissions().find((item) => item.id === id) || null;
    },

    submitUgcArticle(payload) {
      const all = getUgcSubmissions();
      const id = "ugc_" + Date.now();
      const slug = payload.topicSlug || (payload.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "articol");

      const newSubmission = {
        id,
        slug,
        countySlug: payload.countySlug,
        topicSlug: payload.topicSlug || "locuri-de-vizitat",
        topicLabel: payload.topicLabel || "Articol propus",
        title: payload.title.trim(),
        excerpt: payload.excerpt.trim() || payload.title.trim(),
        authorName: (payload.authorName || "Călător anonim").trim(),
        authorEmail: (payload.authorEmail || "").trim(),
        readMinutes: Number(payload.readMinutes) || 5,
        imageUrl: payload.imageUrl || undefined,
        sections: Array.isArray(payload.sections) ? payload.sections.filter((s) => s.heading.trim() || s.body.trim()) : [],
        tips: Array.isArray(payload.tips) ? payload.tips.filter((t) => t.trim().length > 0) : [],
        status: "pending", // "pending" | "approved" | "denied"
        submittedAt: new Date().toISOString(),
        isUgc: true
      };

      all.unshift(newSubmission);
      saveUgcSubmissions(all);

      if (typeof gtag === "function") {
        gtag("event", "ugc_article_submitted", {
          county: newSubmission.countySlug,
          topic: newSubmission.topicSlug,
          title: newSubmission.title,
          author: newSubmission.authorName
        });
      }

      return { success: true, item: newSubmission };
    },

    approveUgcArticle(id) {
      const all = getUgcSubmissions();
      const idx = all.findIndex((item) => item.id === id);
      if (idx === -1) return { success: false, error: "Propunerea nu a fost găsită" };

      const sub = all[idx];
      sub.status = "approved";
      sub.reviewedAt = new Date().toISOString();
      all[idx] = sub;
      saveUgcSubmissions(all);

      // Publică articolul în magazinul public de articole
      this.saveArticle(sub.countySlug, {
        slug: sub.slug,
        title: sub.title,
        excerpt: sub.excerpt,
        readMinutes: sub.readMinutes,
        imageUrl: sub.imageUrl,
        sections: sub.sections,
        tips: sub.tips,
        topicLabel: sub.topicLabel,
        isCustom: true,
        isUgc: true,
        authorName: sub.authorName,
        ugcId: sub.id,
        publishedAt: sub.reviewedAt
      });

      if (typeof gtag === "function") {
        gtag("event", "ugc_article_approved", {
          id: sub.id,
          county: sub.countySlug,
          title: sub.title
        });
      }

      return { success: true, item: sub };
    },

    denyUgcArticle(id, reason = "") {
      const all = getUgcSubmissions();
      const idx = all.findIndex((item) => item.id === id);
      if (idx === -1) return { success: false, error: "Propunerea nu a fost găsită" };

      const sub = all[idx];
      sub.status = "denied";
      sub.denyReason = reason || "Nu respectă cerințele editoriale";
      sub.reviewedAt = new Date().toISOString();
      all[idx] = sub;
      saveUgcSubmissions(all);

      // Dacă fusese aprobat anterior, îl retragem din articolele publice
      this.deleteArticle(sub.countySlug, sub.slug);

      if (typeof gtag === "function") {
        gtag("event", "ugc_article_denied", {
          id: sub.id,
          county: sub.countySlug,
          title: sub.title
        });
      }

      return { success: true, item: sub };
    },

    deleteUgcSubmission(id) {
      const all = getUgcSubmissions();
      const sub = all.find((item) => item.id === id);
      if (sub && sub.status === "approved") {
        this.deleteArticle(sub.countySlug, sub.slug);
      }
      const updated = all.filter((item) => item.id !== id);
      saveUgcSubmissions(updated);
      return true;
    }
  };

  // UGC Interactive Modal for Users
  window.openUgcModal = function (defaultCounty = null, defaultTopic = null) {
    let modal = document.getElementById("ugc-submit-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ugc-submit-modal";
      modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in";
      document.body.appendChild(modal);
    }

    const counties = window.ROMANIA_COUNTIES || [];
    const topics = window.ARTICLE_TOPICS || [
      { slug: "locuri-de-vizitat", label: "Locuri de vizitat" },
      { slug: "bucate-si-traditii", label: "Bucate și tradiții" },
      { slug: "natura-si-drumetii", label: "Natură și drumeții" }
    ];

    const selCounty = defaultCounty || (counties[0] ? counties[0].slug : "cluj");
    const selTopic = defaultTopic || "locuri-de-vizitat";

    modal.innerHTML = `
      <div class="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7 shadow-2xl">
        <!-- Close button -->
        <button id="ugc-modal-close" type="button" class="absolute top-4 right-4 h-8 w-8 rounded-full border border-[var(--border)] bg-[var(--background)] flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors cursor-pointer" aria-label="Închide">
          ✕
        </button>

        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
          <span>✍️ Comunitatea Drumuri bune</span>
        </div>
        <h2 class="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">Propune un articol turistic</h2>
        <p class="mt-1.5 text-xs sm:text-sm text-[var(--muted-foreground)] leading-relaxed">
          Împărtășește recomandările tale pentru locuri de vizitat, mâncare tradițională sau trasee montane.
          Articolul va fi revizuit în <b>Centrul de Control</b> înainte de publicare.
        </p>

        <form id="ugc-submission-form" class="mt-5 space-y-4">
          <!-- Autor & Email -->
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Numele tău / Pseudonim *</label>
              <input id="ugc-author-name" type="text" required placeholder="ex: Maria Ionescu sau Călător Urban" class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all" />
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Email (opțional, confidențial)</label>
              <input id="ugc-author-email" type="email" placeholder="nume@exemplu.ro" class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all" />
            </div>
          </div>

          <!-- Județ & Categorie -->
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Județ vizat *</label>
              <select id="ugc-county-select" class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all">
                ${counties.map(c => `<option value="${c.slug}" ${c.slug === selCounty ? "selected" : ""}>${c.name}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Categorie / Temă *</label>
              <select id="ugc-topic-select" class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all">
                ${topics.map(t => `<option value="${t.slug}" ${t.slug === selTopic ? "selected" : ""}>${t.label}</option>`).join("")}
              </select>
            </div>
          </div>

          <!-- Titlu & Rezumat -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Titlu articol *</label>
            <input id="ugc-title" type="text" required placeholder="ex: Secretele cetății medievale și cele mai bune plăcinte locale" class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all" />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Scurt rezumat / Introducere *</label>
            <textarea id="ugc-excerpt" rows="2" required placeholder="Rezumat de 1-3 fraze despre de ce merită vizitat acest loc..." class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all"></textarea>
          </div>

          <!-- Imagine reprezentativă -->
          <div>
            <div class="flex items-center justify-between">
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Imagine reprezentativă</label>
              <span class="text-[10px] text-[var(--muted-foreground)]">Alege un preset sau lipește un URL</span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5 mb-2">
              <button type="button" data-img="https://images.unsplash.com/photo-1549880338-65ddcdfd017b?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🏛️ Monument / Castel</button>
              <button type="button" data-img="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🌲 Munte & Drumeție</button>
              <button type="button" data-img="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🍲 Gastronomie</button>
              <button type="button" data-img="https://images.unsplash.com/photo-1584646098378-0874589d76b1?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🏘️ Oraș vechi</button>
            </div>
            <input id="ugc-image-url" type="url" placeholder="https://exemplu.ro/imagine.jpg (sau selectează mai sus)" class="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all" />
          </div>

          <!-- Secțiuni Conținut -->
          <div class="border-t border-[var(--border)]/60 pt-3">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Secțiuni conținut</label>
              <button id="ugc-add-section-btn" type="button" class="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer">+ Adaugă secțiune</button>
            </div>
            <div id="ugc-sections-container" class="space-y-3">
              <div class="ugc-sec-row rounded-lg border border-[var(--border)] bg-[var(--secondary)]/20 p-3 space-y-2">
                <input type="text" class="ugc-sec-head w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold outline-none" value="Ce trebuie să știi și cum ajungi" placeholder="Subtitlu secțiune..." required />
                <textarea rows="3" class="ugc-sec-body w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm outline-none" placeholder="Descrie experiența, atmosfera, reperele turistice..." required></textarea>
              </div>
            </div>
          </div>

          <!-- Sfaturi utile -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Sfat util pentru vizitatori (opțional)</label>
            <input id="ugc-tip" type="text" placeholder="ex: Este recomandat să ajungi înainte de prânz pentru a evita aglomerația." class="mt-1.5 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all" />
          </div>

          <!-- Alert de transparență moderare -->
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-900 text-xs flex items-start gap-2.5">
            <span class="text-base shrink-0">🛡️</span>
            <div>
              <p class="font-bold">Politica de moderare:</p>
              <p class="mt-0.5 leading-relaxed text-amber-800">
                Toate propunerile de articole sunt verificate și aprobate în <b>Centrul de Control</b> înainte de publicare pentru a garanta informații corecte și de calitate.
              </p>
            </div>
          </div>

          <!-- Buton Trimite -->
          <div class="flex items-center justify-end gap-3 pt-2">
            <button id="ugc-modal-cancel" type="button" class="rounded-lg border border-[var(--border)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--secondary)] cursor-pointer">
              Renunță
            </button>
            <button id="ugc-modal-submit" type="submit" class="rounded-lg bg-[var(--primary)] px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[var(--primary-hover)] cursor-pointer transition-all">
              🚀 Trimite spre moderare
            </button>
          </div>
        </form>

        <!-- Feedback de Succes -->
        <div id="ugc-modal-success" class="hidden text-center py-8">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
            ✓
          </div>
          <h3 class="mt-3 text-xl font-bold text-[var(--foreground)]">Articol trimis cu succes!</h3>
          <p class="mx-auto mt-2 max-w-md text-xs sm:text-sm text-[var(--muted-foreground)] leading-relaxed">
            Mulțumim pentru contribuție! Articolul tău a intrat în coada de verificare a <b>Centrului de Control</b>.
            De îndată ce este aprobat de echipa noastră, va deveni public în ghidul județului ales.
          </p>
          <div class="mt-6 flex justify-center gap-3">
            <button id="ugc-modal-done-btn" type="button" class="rounded-lg bg-[var(--primary)] px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[var(--primary-hover)] cursor-pointer">
              Am înțeles
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    // Setup events inside modal
    const closeBtn = document.getElementById("ugc-modal-close");
    const cancelBtn = document.getElementById("ugc-modal-cancel");
    const doneBtn = document.getElementById("ugc-modal-done-btn");
    const form = document.getElementById("ugc-submission-form");
    const successView = document.getElementById("ugc-modal-success");
    const addSecBtn = document.getElementById("ugc-add-section-btn");
    const secContainer = document.getElementById("ugc-sections-container");
    const imgUrlInput = document.getElementById("ugc-image-url");

    function closeModal() {
      modal.classList.add("hidden");
      document.body.style.overflow = "";
    }

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    doneBtn.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // Preset images clicks
    modal.querySelectorAll(".ugc-preset-btn").forEach((b) => {
      b.onclick = () => {
        imgUrlInput.value = b.getAttribute("data-img");
      };
    });

    // Add section
    addSecBtn.onclick = () => {
      const row = document.createElement("div");
      row.className = "ugc-sec-row rounded-lg border border-[var(--border)] bg-[var(--secondary)]/20 p-3 space-y-2 relative";
      row.innerHTML = `
        <button type="button" class="ugc-remove-sec absolute top-2 right-2 text-xs text-red-600 hover:underline">Șterge</button>
        <input type="text" class="ugc-sec-head w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold outline-none" placeholder="Subtitlu secțiune..." required />
        <textarea rows="3" class="ugc-sec-body w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm outline-none" placeholder="Conținut secțiune..." required></textarea>
      `;
      secContainer.appendChild(row);
      row.querySelector(".ugc-remove-sec").onclick = () => row.remove();
    };

    // Handle Form Submit
    form.onsubmit = (e) => {
      e.preventDefault();

      const countySlug = document.getElementById("ugc-county-select").value;
      const topicSlug = document.getElementById("ugc-topic-select").value;
      const topicObj = topics.find((t) => t.slug === topicSlug);
      const title = document.getElementById("ugc-title").value;
      const excerpt = document.getElementById("ugc-excerpt").value;
      const authorName = document.getElementById("ugc-author-name").value;
      const authorEmail = document.getElementById("ugc-author-email").value;
      const imageUrl = imgUrlInput.value.trim() || undefined;
      const tipVal = document.getElementById("ugc-tip").value.trim();

      const sections = [];
      secContainer.querySelectorAll(".ugc-sec-row").forEach((row) => {
        const h = row.querySelector(".ugc-sec-head").value.trim();
        const b = row.querySelector(".ugc-sec-body").value.trim();
        if (h || b) sections.push({ heading: h, body: b });
      });

      const tips = tipVal ? [tipVal] : [];

      AppStore.submitUgcArticle({
        countySlug,
        topicSlug,
        topicLabel: topicObj ? topicObj.label : "Articol",
        title,
        excerpt,
        authorName,
        authorEmail,
        imageUrl,
        sections,
        tips,
        readMinutes: 5
      });

      form.classList.add("hidden");
      successView.classList.remove("hidden");
    };
  };

  // Shared Helper to render Header
  window.renderSiteHeader = function (activePage) {
    const header = document.getElementById("site-header");
    if (!header) return;

    header.innerHTML = `
      <header class="sticky top-0 z-30 border-b border-[var(--border)] bg-[#f7f5ef]/95 backdrop-blur px-3.5 py-2.5 sm:px-6 sm:py-3.5">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <a href="index.html" class="flex items-baseline gap-1.5 sm:gap-2 text-decoration-none shrink-0">
            <span class="font-display text-lg sm:text-xl font-bold text-[var(--primary)]">Drumuri bune</span>
            <span class="hidden text-xs text-[var(--muted-foreground)] md:inline">ghid pe sectoare și județe</span>
          </a>
          <div class="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
            <nav class="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-medium">
              <a href="index.html" class="rounded-md px-2 py-1 sm:px-3 sm:py-1.5 transition-colors whitespace-nowrap ${
                activePage === "harta" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Harta</a>
              <a href="sectoare.html" class="rounded-md px-2 py-1 sm:px-3 sm:py-1.5 transition-colors whitespace-nowrap ${
                activePage === "sectoare" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Sectoare<span class="hidden sm:inline"> & Regiuni</span></a>
              <a href="despre.html" class="rounded-md px-2 py-1 sm:px-3 sm:py-1.5 transition-colors whitespace-nowrap ${
                activePage === "despre" ? "bg-[var(--secondary)] font-bold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }">Despre</a>
              <a href="panou.html" title="Centru de Control & Moderare (Acces protejat cu parolă)" class="rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5 transition-colors whitespace-nowrap text-amber-900 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 font-semibold ${
                activePage === "panou" ? "ring-2 ring-[var(--primary)]" : ""
              }">🔒 <span class="hidden sm:inline">Centru de </span>Control</a>
            </nav>

            <!-- UGC Button: Submit article -->
            <button id="btn-ugc-open-header" type="button" class="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--primary-hover)] active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0" title="Propune un articol pentru un județ">
              <span>✍️</span>
              <span>Propune articol</span>
            </button>
          </div>
        </div>
      </header>
    `;

    const ugcBtn = document.getElementById("btn-ugc-open-header");
    if (ugcBtn) {
      ugcBtn.addEventListener("click", () => {
        window.openUgcModal();
      });
    }
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
            <a href="despre.html" class="hover:text-[var(--primary)]">Despre Proiect</a>
            <button type="button" onclick="window.openUgcModal()" class="text-[var(--primary)] hover:underline cursor-pointer">✍️ Propune Articol</button>
            <a href="panou.html" class="hover:text-[var(--primary)] flex items-center gap-1">🔒 Centru de Control</a>
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
