// Drumuri bune - Main Application Logic & Store for Static Hosting
(function () {
  const STORAGE_KEY = "discover_romania_custom_articles_v3";
  const UGC_STORAGE_KEY = "discover_romania_ugc_submissions_v3";
  const FIREBASE_CONFIG_KEY = "discover_romania_firebase_config_v1";
  const EVENT_NAME = "discover-romania-articles-updated";
  const UGC_EVENT_NAME = "discover-romania-ugc-updated";
  const CLOUD_SYNC_EVENT = "discover-romania-cloud-sync-status";

  // =========================================================================
  // 🔥 CONFIGURARE GOOGLE FIREBASE FIRESTORE (Sincronizare Multi-Dispozitiv)
  // Conectat automat pentru sincronizarea în timp real pe mobil, PC și vizitatori.
  // =========================================================================
  window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
    apiKey: "AIzaSyCbrdK11GioakzE5PXtl9cS4RevFvPvqnA",
    authDomain: "drumuri-bune.firebaseapp.com",
    projectId: "drumuri-bune",
    storageBucket: "drumuri-bune.firebasestorage.app",
    messagingSenderId: "1093268932070",
    appId: "1:1093268932070:web:0423a0a895675e951d0227",
    measurementId: "G-G0FRS6ZV7B"
  };

  let db = null;
  let isFirestoreActive = false;
  let hasSyncedInitialArticles = false;
  let hasSyncedInitialUgc = false;

  function getActiveFirebaseConfig() {
    if (window.FIREBASE_CONFIG && (window.FIREBASE_CONFIG.projectId || window.FIREBASE_CONFIG.apiKey)) {
      return window.FIREBASE_CONFIG;
    }
    try {
      const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.projectId || parsed.apiKey)) return parsed;
      }
    } catch (e) {
      console.warn("Storage read error for Firebase config:", e);
    }
    return null;
  }

  function initFirebase() {
    if (typeof firebase === "undefined") {
      return false;
    }
    const config = getActiveFirebaseConfig();
    if (!config || (!config.projectId && !config.apiKey)) {
      return false;
    }

    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(config);
      }
      db = firebase.firestore();
      isFirestoreActive = true;
      console.log("🔥 [Drumuri bune] Conexiune activă la Google Firebase Firestore!");

      setupFirestoreArticlesListener();
      setupFirestoreUgcListener();

      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(CLOUD_SYNC_EVENT, { detail: { active: true, projectId: config.projectId } }));
      }
      return true;
    } catch (err) {
      console.error("🔥 [Drumuri bune] Eroare la inițializarea Firebase:", err);
      isFirestoreActive = false;
      return false;
    }
  }

  function setupFirestoreArticlesListener() {
    if (!db) return;
    try {
      db.collection("articles").onSnapshot((snapshot) => {
        const grouped = {};
        snapshot.forEach((doc) => {
          const item = doc.data();
          if (item && item.countySlug && item.slug) {
            if (!grouped[item.countySlug]) grouped[item.countySlug] = [];
            grouped[item.countySlug].push({
              ...item,
              isCustom: true
            });
          }
        });

        // Cache into local storage without re-triggering cloud uploads
        saveCustomArticles(grouped, true);

        // Auto-sync: if local storage has articles not yet in Firestore, upload them
        if (!hasSyncedInitialArticles) {
          hasSyncedInitialArticles = true;
          autoSyncLocalArticlesToFirestore(grouped);
        }
      }, (err) => {
        console.warn("Firestore articles listener notification:", err);
        if (err && (err.code === "permission-denied" || (err.message && err.message.includes("permission")))) {
          console.error("⚠️ [Firebase Firestore Rules] Ai nevoie de permisiuni de citire/scriere. Intră în consola Firebase -> Firestore Database -> Rules și setează: allow read, write: if true;");
        }
      });
    } catch (e) {
      console.error("Eroare la configurarea listener-ului de articole Firestore:", e);
    }
  }

  function setupFirestoreUgcListener() {
    if (!db) return;
    try {
      db.collection("ugc_submissions").onSnapshot((snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          const item = doc.data();
          if (item && item.id) {
            list.push(item);
          }
        });

        list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        saveUgcSubmissions(list, true);

        if (!hasSyncedInitialUgc) {
          hasSyncedInitialUgc = true;
          autoSyncLocalUgcToFirestore(list);
        }
      }, (err) => {
        console.warn("Firestore UGC listener notification:", err);
        if (err && (err.code === "permission-denied" || (err.message && err.message.includes("permission")))) {
          console.error("⚠️ [Firebase Firestore Rules] Permisiuni necesare în Firebase Console -> Firestore Database -> Rules.");
        }
      });
    } catch (e) {
      console.error("Eroare la configurarea listener-ului UGC Firestore:", e);
    }
  }

  function autoSyncLocalArticlesToFirestore(cloudGrouped) {
    if (!db || !isFirestoreActive) return;
    const local = getCustomArticles();
    let count = 0;
    for (const [cSlug, list] of Object.entries(local)) {
      if (Array.isArray(list)) {
        list.forEach((art) => {
          const cloudList = cloudGrouped[cSlug] || [];
          const exists = cloudList.some((ca) => ca.slug === art.slug);
          if (!exists) {
            const docId = `${cSlug}__${art.slug}`;
            db.collection("articles").doc(docId).set({
              ...art,
              countySlug: cSlug,
              isCustom: true,
              createdAt: art.createdAt || new Date().toISOString()
            }, { merge: true }).catch((e) => console.warn("Auto-sync article error:", e));
            count++;
          }
        });
      }
    }
    if (count > 0) {
      console.log(`🔥 S-au sincronizat automat ${count} articole locale în Firestore!`);
    }
  }

  function autoSyncLocalUgcToFirestore(cloudList) {
    if (!db || !isFirestoreActive) return;
    const local = getUgcSubmissions();
    let count = 0;
    local.forEach((sub) => {
      const exists = cloudList.some((cs) => cs.id === sub.id);
      if (!exists) {
        db.collection("ugc_submissions").doc(sub.id).set(sub, { merge: true })
          .catch((e) => console.warn("Auto-sync UGC error:", e));
        count++;
      }
    });
    if (count > 0) {
      console.log(`🔥 S-au sincronizat automat ${count} propuneri UGC locale în Firestore!`);
    }
  }

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

  function saveCustomArticles(data, triggerEvent = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (triggerEvent && typeof window.dispatchEvent === "function") {
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

  function saveUgcSubmissions(data, triggerEvent = true) {
    try {
      localStorage.setItem(UGC_STORAGE_KEY, JSON.stringify(data));
      if (triggerEvent && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(UGC_EVENT_NAME));
      }
    } catch (e) {
      console.error("UGC storage write error:", e);
    }
  }

  // Initialize Firebase when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFirebase);
  } else {
    initFirebase();
  }

  // Client-Side Image Compressor & Reader
  // Compresses files client-side to lightweight WebP/JPEG Data URLs (~60-120 KB)
  window.compressAndReadImage = function (file, maxWidth = 1200, maxHeight = 900, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Niciun fișier selectat"));
      if (!file.type || !file.type.startsWith("image/")) {
        return reject(new Error("Fișierul selectat nu este o imagine"));
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Eroare la citirea fișierului"));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Imaginea nu a putut fi decodată"));
        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.max(1, Math.round(width * ratio));
              height = Math.max(1, Math.round(height * ratio));
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            let dataUrl = canvas.toDataURL("image/webp", quality);
            if (!dataUrl.startsWith("data:image/webp")) {
              dataUrl = canvas.toDataURL("image/jpeg", quality);
            }
            resolve(dataUrl);
          } catch (err) {
            resolve(e.target.result);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Thematic fallback travel cover image
  window.getDefaultArticleImage = function (topicSlug) {
    if (topicSlug === "natura-si-drumetii") {
      return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop";
    }
    if (topicSlug === "bucate-si-traditii") {
      return "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=1200&auto=format&fit=crop";
    }
    if (topicSlug === "locuri-de-vizitat") {
      return "https://images.unsplash.com/photo-1549880338-65ddcdfd017b?q=80&w=1200&auto=format&fit=crop";
    }
    return "https://images.unsplash.com/photo-1584646098378-0874589d76b1?q=80&w=1200&auto=format&fit=crop";
  };

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
        countySlug: countySlug,
        isCustom: true,
        createdAt: article.createdAt || new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        all[countySlug][existingIdx] = toSave;
      } else {
        all[countySlug].push(toSave);
      }

      saveCustomArticles(all, true);

      // Save to Firebase Firestore
      if (db && isFirestoreActive) {
        const docId = `${countySlug}__${article.slug}`;
        db.collection("articles").doc(docId).set(toSave, { merge: true })
          .catch((err) => console.error("Firestore save article error:", err));
      }

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

      saveCustomArticles(all, true);

      // Delete from Firebase Firestore
      if (db && isFirestoreActive) {
        const docId = `${countySlug}__${articleSlug}`;
        db.collection("articles").doc(docId).delete()
          .catch((err) => console.error("Firestore delete article error:", err));
      }

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
                const toSave = { ...item, countySlug: cSlug, isCustom: true };
                if (idx >= 0) {
                  current[cSlug][idx] = toSave;
                } else {
                  current[cSlug].push(toSave);
                }
                if (db && isFirestoreActive) {
                  const docId = `${cSlug}__${item.slug}`;
                  db.collection("articles").doc(docId).set(toSave, { merge: true }).catch(() => {});
                }
                count++;
              }
            });
          }
        }
        saveCustomArticles(current, true);
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
      const titleSlug = (payload.title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = payload.slug || titleSlug || payload.topicSlug || ("articol-" + Date.now());

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
      saveUgcSubmissions(all, true);

      // Save to Firebase Firestore
      if (db && isFirestoreActive) {
        db.collection("ugc_submissions").doc(id).set(newSubmission)
          .catch((err) => console.error("Firestore submit UGC error:", err));
      }

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
      saveUgcSubmissions(all, true);

      if (db && isFirestoreActive) {
        db.collection("ugc_submissions").doc(id).update({
          status: "approved",
          reviewedAt: sub.reviewedAt
        }).catch((err) => console.error("Firestore update UGC error:", err));
      }

      // Publică articolul în magazinul public de articole
      this.saveArticle(sub.countySlug, {
        slug: sub.slug,
        title: sub.title,
        excerpt: sub.excerpt,
        readMinutes: sub.readMinutes,
        imageUrl: sub.imageUrl,
        sections: sub.sections,
        tips: sub.tips,
        topicSlug: sub.topicSlug,
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
      saveUgcSubmissions(all, true);

      if (db && isFirestoreActive) {
        db.collection("ugc_submissions").doc(id).update({
          status: "denied",
          denyReason: sub.denyReason,
          reviewedAt: sub.reviewedAt
        }).catch((err) => console.error("Firestore deny UGC error:", err));
      }

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
      saveUgcSubmissions(updated, true);

      if (db && isFirestoreActive) {
        db.collection("ugc_submissions").doc(id).delete()
          .catch((err) => console.error("Firestore delete UGC error:", err));
      }

      return true;
    },

    // Cloud status and configuration
    isCloudActive() {
      return Boolean(db && isFirestoreActive);
    },

    getCloudConfig() {
      return getActiveFirebaseConfig();
    },

    setCloudConfig(config) {
      try {
        if (!config || (!config.projectId && !config.apiKey)) {
          localStorage.removeItem(FIREBASE_CONFIG_KEY);
          window.FIREBASE_CONFIG = null;
          isFirestoreActive = false;
          db = null;
          if (typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent(CLOUD_SYNC_EVENT, { detail: { active: false } }));
          }
          return { success: true, message: "Deconectat de la Cloud. Se folosește salvarea locală." };
        }

        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
        window.FIREBASE_CONFIG = config;
        const ok = initFirebase();
        return { success: ok, message: ok ? "Conexiune la Cloud realizată cu succes!" : "Eroare la conectarea Firebase. Verifică datele de configurare." };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },

    syncLocalToCloudNow() {
      if (!db || !isFirestoreActive) {
        return { success: false, message: "Baza de date Cloud nu este activă. Configurează mai întâi Firebase." };
      }
      try {
        const local = getCustomArticles();
        let artsCount = 0;
        for (const [cSlug, list] of Object.entries(local)) {
          if (Array.isArray(list)) {
            list.forEach((art) => {
              const docId = `${cSlug}__${art.slug}`;
              db.collection("articles").doc(docId).set({
                ...art,
                countySlug: cSlug,
                isCustom: true
              }, { merge: true });
              artsCount++;
            });
          }
        }

        const ugcs = getUgcSubmissions();
        ugcs.forEach((sub) => {
          db.collection("ugc_submissions").doc(sub.id).set(sub, { merge: true });
        });

        return { success: true, count: artsCount, ugcCount: ugcs.length, message: `S-au trimis ${artsCount} articole și ${ugcs.length} propuneri UGC în Cloud!` };
      } catch (e) {
        return { success: false, message: e.message };
      }
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
              <span class="text-[10px] text-[var(--muted-foreground)]">Încarcă foto, alege un preset sau lipește URL</span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-1.5 mb-2">
              <button type="button" data-img="https://images.unsplash.com/photo-1549880338-65ddcdfd017b?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🏛️ Monument / Castel</button>
              <button type="button" data-img="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🌲 Munte & Drumeție</button>
              <button type="button" data-img="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🍲 Gastronomie</button>
              <button type="button" data-img="https://images.unsplash.com/photo-1584646098378-0874589d76b1?q=80&w=1200&auto=format&fit=crop" class="ugc-preset-btn rounded-md border border-[var(--border)] bg-[var(--secondary)]/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--secondary)]">🏘️ Oraș vechi</button>
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
              <input id="ugc-image-url" type="text" placeholder="Lipește URL sau selectează fișier din telefon/calculator" class="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs sm:text-sm outline-none focus:border-[var(--ring)] transition-all" />
              <label for="ugc-image-file" class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-xs font-semibold hover:bg-[var(--secondary)]/80 text-[var(--foreground)]">
                📁 Încarcă foto
              </label>
              <input type="file" id="ugc-image-file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" />
            </div>
            <p id="ugc-image-status" class="mt-1 text-[11px] text-[var(--muted-foreground)]">Poți încărca orice poză (JPG, PNG, WEBP) sau alege din preseturi.</p>
            <div id="ugc-image-preview-wrap" class="hidden mt-2 relative w-full h-32 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--secondary)]/30">
              <img id="ugc-image-preview-img" src="" alt="Previzualizare copertă" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
              <button type="button" id="ugc-image-clear-btn" class="absolute top-2 right-2 bg-black/70 hover:bg-black text-white text-[11px] font-bold px-2 py-1 rounded shadow cursor-pointer">Șterge foto</button>
            </div>
          </div>

          <!-- Secțiuni Conținut -->
          <div class="border-t border-[var(--border)]/60 pt-3">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">Secțiuni conținut</label>
              <button id="ugc-add-section-btn" type="button" class="text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer">+ Adaugă secțiune</button>
            </div>
            <div id="ugc-sections-container" class="space-y-3">
              <div class="ugc-sec-row rounded-lg border border-[var(--border)] bg-[var(--secondary)]/20 p-3 space-y-2 relative">
                <input type="text" class="ugc-sec-head w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold outline-none" value="Ce trebuie să știi și cum ajungi" placeholder="Subtitlu secțiune..." required />
                <textarea rows="3" class="ugc-sec-body w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm outline-none" placeholder="Descrie experiența, atmosfera, reperele turistice..." required></textarea>

                <!-- Foto în corpul secțiunii -->
                <div class="rounded-md border border-dashed border-[var(--border)] bg-white p-2.5 space-y-1.5">
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="font-semibold text-[var(--foreground)]">🖼️ Foto pentru această secțiune (opțional):</span>
                    <button type="button" class="ugc-sec-del-img hidden text-red-600 hover:underline cursor-pointer">Șterge foto</button>
                  </div>
                  <div class="flex flex-col sm:flex-row gap-2">
                    <input type="text" class="ugc-sec-img-url flex-1 rounded-md border border-[var(--input)] bg-white px-2 py-1 text-xs outline-none" placeholder="Lipește URL imagine sau apasă Încarcă" />
                    <label class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--secondary)]/80 text-[var(--foreground)]">
                      📁 Încarcă foto
                      <input type="file" class="ugc-sec-img-file sr-only" accept="image/*" />
                    </label>
                  </div>
                  <input type="text" class="ugc-sec-img-caption w-full rounded-md border border-[var(--input)] bg-white px-2 py-1 text-[11px] outline-none" placeholder="Descriere / legendă foto (opțional)" />
                  <div class="ugc-sec-status text-[10px] text-[var(--muted-foreground)]"></div>
                  <div class="ugc-sec-preview-wrap hidden mt-1 h-24 w-full max-w-xs rounded overflow-hidden border border-[var(--border)]">
                    <img src="" alt="" class="ugc-sec-preview-img h-full w-full object-cover" referrerpolicy="no-referrer" />
                  </div>
                </div>
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

    const fileInput = document.getElementById("ugc-image-file");
    const imgStatus = document.getElementById("ugc-image-status");
    const previewWrap = document.getElementById("ugc-image-preview-wrap");
    const previewImg = document.getElementById("ugc-image-preview-img");
    const clearImgBtn = document.getElementById("ugc-image-clear-btn");

    function updateUgcPreview(src) {
      if (src && src.trim()) {
        previewImg.src = src.trim();
        previewWrap.classList.remove("hidden");
      } else {
        previewImg.src = "";
        previewWrap.classList.add("hidden");
      }
    }

    // Preset images clicks
    modal.querySelectorAll(".ugc-preset-btn").forEach((b) => {
      b.onclick = () => {
        const u = b.getAttribute("data-img");
        imgUrlInput.value = u;
        updateUgcPreview(u);
        imgStatus.textContent = "Preset selectat.";
        imgStatus.classList.remove("text-red-600");
      };
    });

    // File upload change
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (!file.type || !file.type.startsWith("image/")) {
        imgStatus.textContent = "Fișierul selectat nu este o imagine validă.";
        imgStatus.classList.add("text-red-600");
        return;
      }

      imgStatus.textContent = `Se optimizează „${file.name}”...`;
      imgStatus.classList.remove("text-red-600");

      try {
        const dataUrl = await window.compressAndReadImage(file);
        imgUrlInput.value = dataUrl;
        updateUgcPreview(dataUrl);
        imgStatus.textContent = `✓ Fotografia «${file.name}» a fost pregătită cu succes!`;
      } catch (err) {
        imgStatus.textContent = "Eroare la optimizarea imaginii: " + (err.message || "");
        imgStatus.classList.add("text-red-600");
      }
    };

    imgUrlInput.oninput = () => {
      updateUgcPreview(imgUrlInput.value);
    };

    clearImgBtn.onclick = () => {
      imgUrlInput.value = "";
      updateUgcPreview("");
      imgStatus.textContent = "Imagine înlăturată.";
    };

    function setupUgcSectionEvents(row) {
      const delBtn = row.querySelector(".ugc-remove-sec");
      if (delBtn) delBtn.onclick = () => row.remove();

      const imgInput = row.querySelector(".ugc-sec-img-url");
      const fileInput = row.querySelector(".ugc-sec-img-file");
      const previewWrap = row.querySelector(".ugc-sec-preview-wrap");
      const previewImg = row.querySelector(".ugc-sec-preview-img");
      const delImgBtn = row.querySelector(".ugc-sec-del-img");
      const statusEl = row.querySelector(".ugc-sec-status");

      function updatePreview(url) {
        if (url && url.trim()) {
          previewImg.src = url.trim();
          previewWrap.classList.remove("hidden");
          if (delImgBtn) delImgBtn.classList.remove("hidden");
        } else {
          previewImg.src = "";
          previewWrap.classList.add("hidden");
          if (delImgBtn) delImgBtn.classList.add("hidden");
        }
      }

      if (imgInput) {
        imgInput.oninput = () => updatePreview(imgInput.value);
      }

      if (delImgBtn) {
        delImgBtn.onclick = () => {
          if (imgInput) imgInput.value = "";
          updatePreview("");
          if (statusEl) statusEl.textContent = "";
        };
      }

      if (fileInput) {
        fileInput.onchange = async () => {
          const file = fileInput.files[0];
          fileInput.value = "";
          if (!file) return;
          if (statusEl) statusEl.textContent = `Se optimizează „${file.name}”...`;
          try {
            const dataUrl = await window.compressAndReadImage(file);
            if (imgInput) imgInput.value = dataUrl;
            updatePreview(dataUrl);
            if (statusEl) statusEl.textContent = `✓ Foto încărcată`;
          } catch (err) {
            if (statusEl) statusEl.textContent = "Eroare la optimizarea foto.";
          }
        };
      }
    }

    // Attach to initial rows
    secContainer.querySelectorAll(".ugc-sec-row").forEach(setupUgcSectionEvents);

    // Add section
    addSecBtn.onclick = () => {
      const row = document.createElement("div");
      row.className = "ugc-sec-row rounded-lg border border-[var(--border)] bg-[var(--secondary)]/20 p-3 space-y-2 relative";
      row.innerHTML = `
        <button type="button" class="ugc-remove-sec absolute top-2 right-2 text-xs text-red-600 hover:underline cursor-pointer">✕ Șterge</button>
        <input type="text" class="ugc-sec-head w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold outline-none" placeholder="Subtitlu secțiune..." required />
        <textarea rows="3" class="ugc-sec-body w-full rounded-md border border-[var(--input)] bg-white px-2.5 py-1.5 text-xs sm:text-sm outline-none" placeholder="Conținut secțiune..." required></textarea>

        <!-- Foto în corpul secțiunii -->
        <div class="rounded-md border border-dashed border-[var(--border)] bg-white p-2.5 space-y-1.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-[var(--foreground)]">🖼️ Foto pentru această secțiune (opțional):</span>
            <button type="button" class="ugc-sec-del-img hidden text-red-600 hover:underline cursor-pointer">Șterge foto</button>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <input type="text" class="ugc-sec-img-url flex-1 rounded-md border border-[var(--input)] bg-white px-2 py-1 text-xs outline-none" placeholder="Lipește URL imagine sau apasă Încarcă" />
            <label class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--secondary)]/80 text-[var(--foreground)]">
              📁 Încarcă foto
              <input type="file" class="ugc-sec-img-file sr-only" accept="image/*" />
            </label>
          </div>
          <input type="text" class="ugc-sec-img-caption w-full rounded-md border border-[var(--input)] bg-white px-2 py-1 text-[11px] outline-none" placeholder="Descriere / legendă foto (opțional)" />
          <div class="ugc-sec-status text-[10px] text-[var(--muted-foreground)]"></div>
          <div class="ugc-sec-preview-wrap hidden mt-1 h-24 w-full max-w-xs rounded overflow-hidden border border-[var(--border)]">
            <img src="" alt="" class="ugc-sec-preview-img h-full w-full object-cover" referrerpolicy="no-referrer" />
          </div>
        </div>
      `;
      secContainer.appendChild(row);
      setupUgcSectionEvents(row);
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
        const h = row.querySelector(".ugc-sec-head")?.value.trim() || "";
        const b = row.querySelector(".ugc-sec-body")?.value.trim() || "";
        const img = row.querySelector(".ugc-sec-img-url")?.value.trim() || undefined;
        const cap = row.querySelector(".ugc-sec-img-caption")?.value.trim() || undefined;
        if (h || b || img) {
          sections.push({
            heading: h,
            body: b,
            imageUrl: img,
            imageCaption: cap
          });
        }
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
