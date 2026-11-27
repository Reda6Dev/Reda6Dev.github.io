(function () {
  "use strict";

  let atlasData = null;
  let helpData = null;
  let activeSectionId = null;
  let searchQuery = "";
  let lightboxShots = [];
  let lightboxIndex = 0;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(url, fallback = "#") {
    const val = String(url ?? "").trim();
    if (!val) return fallback;
    if (/^(https?:\/\/|assets\/|\.\/|[a-z0-9_-]+\.html)/i.test(val)) return val;
    return fallback;
  }

  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    if (/^#[0-9a-fA-F]{6}$/.test(theme.bg || "")) root.style.setProperty("--bg", theme.bg);
    if (/^#[0-9a-fA-F]{6}$/.test(theme.accent || "")) {
      root.style.setProperty("--accent", theme.accent);
      root.style.setProperty("--accent-strong", theme.accent);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(theme.emerald || "")) root.style.setProperty("--emerald", theme.emerald);
  }

  function applyAnnouncement(ann) {
    const bar = document.getElementById("announcement-bar");
    if (!bar) return;
    if (!ann || !ann.enabled || !String(ann.text || "").trim()) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    const bg = /^#[0-9a-fA-F]{6}$/.test(ann.bgColor || "") ? ann.bgColor : "#7c3aed";
    const linkHref = safeUrl(ann.linkUrl, "");
    const linkHtml =
      ann.linkText && linkHref
        ? `<a class="announcement-link" href="${escapeHtml(linkHref)}"${/^https?:\/\//i.test(linkHref) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(ann.linkText)}</a>`
        : "";
    bar.style.setProperty("--announcement-bg", bg);
    bar.innerHTML = `
      <div class="container announcement-inner">
        <span class="announcement-text">${escapeHtml(ann.text)}</span>
        ${linkHtml}
        <button type="button" class="announcement-close" aria-label="إغلاق الإعلان">×</button>
      </div>
    `;
    bar.hidden = false;
    const closeBtn = bar.querySelector(".announcement-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        bar.hidden = true;
      });
    }
  }

  function applyAnalytics(analytics) {
    if (!analytics) return;
    const gc = String(analytics.goatcounterCode || "").trim();
    if (/^[a-zA-Z0-9_-]+$/.test(gc) && !document.querySelector("script[data-goatcounter]")) {
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://gc.zgo.at/count.js";
      s.setAttribute("data-goatcounter", `https://${gc}.goatcounter.com/count`);
      document.head.appendChild(s);
    }
    const cf = String(analytics.cloudflareToken || "").trim();
    if (/^[a-fA-F0-9]+$/.test(cf) && !document.querySelector("script[data-cf-beacon]")) {
      const s = document.createElement("script");
      s.defer = true;
      s.src = "https://static.cloudflareinsights.com/beacon.min.js";
      s.setAttribute("data-cf-beacon", JSON.stringify({ token: cf }));
      document.head.appendChild(s);
    }
  }

  function formatSize(bytes) {
    if (!bytes || Number.isNaN(bytes)) return "";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function pickApkAsset(assets) {
    if (!Array.isArray(assets) || !assets.length) return null;
    const apks = assets.filter((a) => /\.apk$/i.test(a.name || ""));
    if (!apks.length) return null;
    const universal = apks.find((a) => !/(arm64|armeabi|x86)/i.test(a.name));
    if (universal) return universal;
    const arm64 = apks.find((a) => /arm64-v8a/i.test(a.name));
    return arm64 || apks[0];
  }

  async function hydrateLatestApk(repo, fallbackVersion) {
    const verEl = document.getElementById("atlas-version-badge");
    const dlEl = document.getElementById("atlas-dl-btn");
    const metaEl = document.getElementById("atlas-apk-meta");

    try {
      let res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (res.status === 404) {
        res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (res.ok) {
          const arr = await res.json();
          res = { ok: Array.isArray(arr) && arr.length > 0, json: async () => arr[0] };
        }
      }
      if (!res.ok) throw new Error("fetch failed");
      const rel = await res.json();
      if (rel?.tag_name) verEl.textContent = rel.tag_name;
      const apk = pickApkAsset(rel?.assets);
      if (apk) {
        dlEl.href = apk.browser_download_url;
        dlEl.textContent = `تحميل ${apk.name}`;
        const sz = formatSize(apk.size);
        metaEl.textContent = `أحدث إصدار: ${rel.tag_name}${sz ? ` • الحجم: ${sz}` : ""}`;
      } else {
        metaEl.textContent = `أحدث إصدار: ${rel?.tag_name || fallbackVersion || ""}`;
      }
    } catch (_) {
      metaEl.textContent = `الإصدار المتاح: ${fallbackVersion || "انظر صفحة الإصدارات"}`;
    }
  }

  function renderAtlasOverview(app) {
    document.getElementById("atlas-hero-title").textContent = app.name || "Atlas (أطلس)";
    document.getElementById("atlas-hero-tagline").textContent = app.tagline || "";
    document.getElementById("atlas-hero-desc").textContent = app.description || "";
    document.getElementById("atlas-version-badge").textContent = app.fallbackVersion || "v1.14.6";
    if (app.icon) {
      document.getElementById("atlas-hero-icon").src = safeUrl(app.icon);
    }

    const featsEl = document.getElementById("atlas-features-list");
    featsEl.innerHTML = (app.features || [])
      .map((f) => `<li>${escapeHtml(f)}</li>`)
      .join("");

    const shots = app.screenshots || [];
    const shotsEl = document.getElementById("atlas-shots-grid");
    shotsEl.innerHTML = shots
      .map(
        (sh, idx) => `
        <button type="button" class="shot-thumb" data-idx="${idx}" aria-label="تكبير ${escapeHtml(sh.caption || app.name)}">
          <img src="${escapeHtml(safeUrl(sh.url))}" alt="${escapeHtml(sh.caption || app.name)}" loading="lazy">
          <span class="shot-zoom-hint">تكبير</span>
        </button>
      `
      )
      .join("");

    shotsEl.querySelectorAll(".shot-thumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        openLightbox(shots, Number(btn.dataset.idx));
      });
    });

    hydrateLatestApk(app.repo || "Reda6Dev/Atlas", app.fallbackVersion);
  }

  function renderHelpCenter() {
    const sections = helpData?.sections || [];
    const sidebar = document.getElementById("help-sidebar");
    const area = document.getElementById("help-content-area");

    if (!sections.length) {
      sidebar.innerHTML = "";
      area.innerHTML = `<div class="loading-box">لا توجد أقسام مساعدة مضافة حالياً.</div>`;
      return;
    }

    if (!activeSectionId || !sections.some((s) => s.id === activeSectionId)) {
      activeSectionId = sections[0].id;
    }

    sidebar.innerHTML = sections
      .map(
        (sec) => `
        <button type="button" class="help-nav-btn ${sec.id === activeSectionId && !searchQuery ? "active" : ""}" data-id="${escapeHtml(sec.id)}">
          <span>${escapeHtml(sec.icon || "📘")}</span>
          <span>${escapeHtml(sec.title)}</span>
        </button>
      `
      )
      .join("");

    sidebar.querySelectorAll(".help-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        searchQuery = "";
        document.getElementById("help-search").value = "";
        activeSectionId = btn.dataset.id;
        history.replaceState(null, "", `#${activeSectionId}`);
        renderHelpCenter();
        renderFaqs();
      });
    });

    let visibleSections = sections;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      visibleSections = sections.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.summary || "").toLowerCase().includes(q) ||
          (s.items || []).some((it) => it.toLowerCase().includes(q))
      );
    } else {
      visibleSections = sections.filter((s) => s.id === activeSectionId);
    }

    if (!visibleSections.length) {
      area.innerHTML = `<div class="loading-box">لا توجد نتائج مطابقة لبحثك في أقسام المساعدة.</div>`;
      return;
    }

    area.innerHTML = visibleSections
      .map(
        (sec) => `
        <article id="${escapeHtml(sec.id)}" class="help-article glass-card">
          <div class="help-article-head">
            <span class="help-article-icon">${escapeHtml(sec.icon || "📘")}</span>
            <div>
              <h3>${escapeHtml(sec.title)}</h3>
              <p class="muted">${escapeHtml(sec.summary || "")}</p>
            </div>
          </div>
          <ol class="help-steps-list">
            ${(sec.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ol>
        </article>
      `
      )
      .join("");
  }

  function renderFaqs() {
    const faqs = helpData?.faqs || [];
    const list = document.getElementById("faq-list");
    let visible = faqs;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      visible = faqs.filter(
        (f) => (f.q || "").toLowerCase().includes(q) || (f.a || "").toLowerCase().includes(q)
      );
    }
    if (!visible.length) {
      list.innerHTML = `<div class="loading-box">لا توجد أسئلة مطابقة لبحثك.</div>`;
      return;
    }

    list.innerHTML = visible
      .map(
        (item, idx) => `
        <details class="faq-item glass-card" ${idx === 0 && !searchQuery ? "open" : ""}>
          <summary class="faq-q">${escapeHtml(item.q)}</summary>
          <div class="faq-a">${escapeHtml(item.a)}</div>
        </details>
      `
      )
      .join("");
  }

  function applyHashTarget() {
    const hash = window.location.hash.replace("#", "").trim();
    if (!hash || !helpData?.sections) return;
    if (helpData.sections.some((s) => s.id === hash)) {
      activeSectionId = hash;
      renderHelpCenter();
      const target = document.getElementById("help");
      if (target) target.scrollIntoView({ behavior: "smooth" });
    }
  }

  function openLightbox(shots, index) {
    lightboxShots = shots;
    lightboxIndex = index;
    updateLightbox();
    const lb = document.getElementById("lightbox");
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
  }

  function closeLightbox() {
    const lb = document.getElementById("lightbox");
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
  }

  function updateLightbox() {
    if (!lightboxShots.length) return;
    const shot = lightboxShots[lightboxIndex];
    const img = document.getElementById("lightbox-img");
    const cap = document.getElementById("lightbox-caption");
    img.src = safeUrl(shot.url);
    img.alt = shot.caption || "";
    cap.textContent = shot.caption || "";
  }

  function setupLightbox() {
    document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
    document.getElementById("lightbox-prev").addEventListener("click", () => {
      if (!lightboxShots.length) return;
      lightboxIndex = (lightboxIndex - 1 + lightboxShots.length) % lightboxShots.length;
      updateLightbox();
    });
    document.getElementById("lightbox-next").addEventListener("click", () => {
      if (!lightboxShots.length) return;
      lightboxIndex = (lightboxIndex + 1) % lightboxShots.length;
      updateLightbox();
    });
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      const lb = document.getElementById("lightbox");
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") document.getElementById("lightbox-next").click();
      if (e.key === "ArrowRight") document.getElementById("lightbox-prev").click();
    });
  }

  function setupMobileNav() {
    const toggle = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  async function init() {
    setupMobileNav();
    setupLightbox();

    document.getElementById("help-search").addEventListener("input", (e) => {
      searchQuery = e.target.value.trim();
      renderHelpCenter();
      renderFaqs();
    });

    try {
      const res = await fetch(`site-config.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cfg = await res.json();
      applyTheme(cfg.theme);
      applyAnnouncement(cfg.announcement);
      applyAnalytics(cfg.analytics);

      const site = cfg.site || {};
      document.getElementById("atlas-nav-brand").textContent = site.brandName || "REDA DEV";
      document.getElementById("footer-owner").textContent = site.owner || "Reda6Dev";
      document.getElementById("footer-year").textContent = String(new Date().getFullYear());

      atlasData = (cfg.androidApps || []).find((a) => a.id === "atlas" || /Atlas/i.test(a.repo || "")) || {};
      helpData = cfg.atlasHelp || { sections: [], faqs: [] };

      renderAtlasOverview(atlasData);
      renderHelpCenter();
      renderFaqs();
      applyHashTarget();
      window.addEventListener("hashchange", applyHashTarget);
    } catch (err) {
      document.getElementById("help-content-area").innerHTML =
        `<div class="loading-box">تعذّر تحميل مركز المساعدة (${escapeHtml(err.message)}).</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
