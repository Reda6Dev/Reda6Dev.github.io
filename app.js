(function () {
  "use strict";

  // Redirect ?admin=1 shortcut cleanly to admin.html
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") {
      window.location.replace("admin.html");
      return;
    }
  } catch (_) {}

  const RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;
  let currentFilter = "all";
  let siteConfig = null;
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

  function setMetaContent(selector, value) {
    if (!value) return;
    const el = document.querySelector(selector);
    if (el) el.setAttribute("content", value);
  }

  function applySeo(seo) {
    if (!seo) return;
    if (seo.metaTitle) {
      document.title = seo.metaTitle;
      setMetaContent('meta[property="og:title"]', seo.metaTitle);
    }
    if (seo.metaDescription) {
      setMetaContent('meta[name="description"]', seo.metaDescription);
      setMetaContent('meta[property="og:description"]', seo.metaDescription);
    }
    if (seo.keywords) {
      setMetaContent('meta[name="keywords"]', seo.keywords);
    }
    if (seo.ogImage) {
      setMetaContent('meta[property="og:image"]', seo.ogImage);
    }
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

  function applyAnalytics(analytics, isPreview) {
    if (!analytics || isPreview) return;
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

  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    if (/^#[0-9a-fA-F]{6}$/.test(theme.bg || "")) {
      root.style.setProperty("--bg", theme.bg);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(theme.accent || "")) {
      root.style.setProperty("--accent", theme.accent);
      root.style.setProperty("--accent-strong", theme.accent);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(theme.emerald || "")) {
      root.style.setProperty("--emerald", theme.emerald);
    }
  }

  function extractYouTubeId(input) {
    const raw = String(input ?? "").trim();
    if (!raw) return "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const u = new URL(raw);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "").slice(0, 11);
      }
      if (u.searchParams.get("v")) {
        return u.searchParams.get("v").slice(0, 11);
      }
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    } catch (_) {
      const m = raw.match(/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
    return "";
  }

  function formatSize(bytes) {
    if (!bytes || Number.isNaN(bytes)) return "";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  async function fetchLatestRelease(repo) {
    if (!repo) return null;
    const cacheKey = `gh_rel_${repo}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < RELEASE_CACHE_TTL_MS) {
          return parsed.data;
        }
      }
    } catch (_) {}

    let data = null;
    try {
      let res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (res.status === 404) {
        res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (res.ok) {
          const list = await res.json();
          data = Array.isArray(list) && list.length ? list[0] : null;
        }
      } else if (res.ok) {
        data = await res.json();
      }
    } catch (_) {
      return null;
    }

    if (data) {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
      } catch (_) {}
    }
    return data;
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

  function pickToolAsset(assets) {
    if (!Array.isArray(assets) || !assets.length) return null;
    const preferred = assets.find(
      (a) => /\.(exe|msi|zip|7z)$/i.test(a.name || "") && !/legacy/i.test(a.name || "")
    );
    return preferred || assets[0];
  }

  function renderHeaderAndHero(site) {
    document.getElementById("nav-brand").textContent = site.brandName || "REDA DEV";
    document.getElementById("nav-github").href = safeUrl(site.githubUrl, "https://github.com/Reda6Dev");
    document.getElementById("hero-badge").textContent = site.heroBadge || "";
    document.getElementById("hero-title").textContent = site.heroTitle || "";
    document.getElementById("hero-subtitle").textContent = site.heroSubtitle || "";
    document.getElementById("hero-youtube-btn").href = safeUrl(site.youtubeUrl, "https://www.youtube.com/@rk2003");
    document.getElementById("about-bio").textContent = site.bio || "";
    document.getElementById("about-github-link").href = safeUrl(site.githubUrl, "https://github.com/Reda6Dev");
    document.getElementById("footer-owner").textContent = site.owner || "Reda6Dev";
    document.getElementById("footer-year").textContent = String(new Date().getFullYear());
  }

  function renderYouTubePlayer(vid, channelName, ytUrl, handle) {
    const playerBox = document.getElementById("youtube-player-box");
    if (vid) {
      playerBox.innerHTML = `
        <div class="yt-aspect">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${escapeHtml(vid)}?rel=0"
            title="فيديو قناة ${escapeHtml(channelName)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
      `;
    } else {
      playerBox.innerHTML = `
        <div class="yt-placeholder">
          <div class="yt-play-circle">▶</div>
          <h3>قناة ${escapeHtml(channelName)}</h3>
          <p class="muted" style="max-width:460px;margin:0;">
            ترقّب الشروحات المرئية الجديدة للتطبيقات وأدوات التعريب على القناة قريباً، ويمكنك تفعيل جرس التنبيهات من زر الاشتراك.
          </p>
          <a href="${escapeHtml(ytUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-youtube btn-sm">
            فتح القناة الآن (${escapeHtml(handle)})
          </a>
        </div>
      `;
    }
  }

  function renderYouTubeSection(site) {
    const ytUrl = safeUrl(site.youtubeUrl, "https://www.youtube.com/@rk2003");
    const subUrl = ytUrl.includes("?") ? ytUrl : `${ytUrl}?sub_confirmation=1`;
    const channelName = site.youtubeChannelName || "REDA DEV";
    const handle = site.youtubeHandle || "@rk2003";

    document.getElementById("yt-handle-title").textContent = handle;
    document.getElementById("yt-channel-name").textContent = channelName;
    document.getElementById("yt-channel-handle").textContent = handle;
    document.getElementById("yt-section-desc").textContent = site.youtubeDescription || "";
    document.getElementById("yt-bio").textContent = site.youtubeDescription || "";
    document.getElementById("yt-subscribe-link").href = subUrl;
    document.getElementById("yt-visit-link").href = ytUrl;

    // Combine youtubeFeaturedVideoId + youtubeVideos array cleanly
    const videos = [];
    const seen = new Set();
    const listRaw = Array.isArray(site.youtubeVideos) ? site.youtubeVideos : [];
    for (const item of listRaw) {
      const id = extractYouTubeId(typeof item === "string" ? item : item?.id || item?.url);
      if (id && !seen.has(id)) {
        seen.add(id);
        videos.push({ id, title: (typeof item === "object" && item?.title) ? item.title : `فيديو ${videos.length + 1}` });
      }
    }
    const singleId = extractYouTubeId(site.youtubeFeaturedVideoId);
    if (singleId && !seen.has(singleId)) {
      seen.add(singleId);
      videos.unshift({ id: singleId, title: "الفيديو المميز" });
    }

    renderYouTubePlayer(videos[0]?.id || "", channelName, ytUrl, handle);

    const playlistBox = document.getElementById("yt-playlist-box");
    if (videos.length > 1) {
      playlistBox.innerHTML = `
        <div class="yt-playlist-label">فيديوهات القناة المميزة:</div>
        <div class="yt-playlist-items">
          ${videos
            .map(
              (v, i) => `
              <button type="button" class="yt-vid-chip ${i === 0 ? "active" : ""}" data-vid="${escapeHtml(v.id)}">
                ▶ ${escapeHtml(v.title)}
              </button>
            `
            )
            .join("")}
        </div>
      `;
      playlistBox.querySelectorAll(".yt-vid-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          playlistBox.querySelectorAll(".yt-vid-chip").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          renderYouTubePlayer(btn.dataset.vid, channelName, ytUrl, handle);
        });
      });
    } else {
      playlistBox.innerHTML = "";
    }
  }

  function renderApps(apps) {
    const container = document.getElementById("apps-container");
    const visibleApps = (apps || []).filter((a) => a && a.visible !== false);
    document.getElementById("stat-apps").textContent = String(visibleApps.length);

    if (!visibleApps.length) {
      container.innerHTML = `<div class="loading-box">لا توجد تطبيقات معروضة حالياً.</div>`;
      return;
    }

    container.innerHTML = visibleApps
      .map((app, appIndex) => {
        const iconHtml = app.icon
          ? `<img class="app-icon" src="${escapeHtml(safeUrl(app.icon))}" alt="${escapeHtml(app.name)}" loading="lazy">`
          : `<div class="app-icon-fallback" aria-hidden="true">🎮</div>`;

        const featuresHtml = (app.features || [])
          .map((feat) => `<li>${escapeHtml(feat)}</li>`)
          .join("");

        const shotsHtml = (app.screenshots || [])
          .map(
            (shot, shotIndex) => `
            <button type="button" class="shot-thumb" data-app-index="${appIndex}" data-shot-index="${shotIndex}" aria-label="تكبير ${escapeHtml(shot.caption || app.name)}">
              <img src="${escapeHtml(safeUrl(shot.url))}" alt="${escapeHtml(shot.caption || app.name)}" loading="lazy">
              <span class="shot-zoom-hint">تكبير</span>
            </button>
          `
          )
          .join("");

        const releasesUrl = `https://github.com/${app.repo}/releases`;
        const pageBtnHtml = app.pageUrl
          ? `<a href="${escapeHtml(safeUrl(app.pageUrl))}" class="btn btn-primary">صفحة التطبيق ومركز المساعدة</a>`
          : "";

        return `
          <article class="app-card glass-card" data-app-id="${escapeHtml(app.id)}">
            <div class="app-info">
              <div class="app-header">
                ${iconHtml}
                <div>
                  <div class="app-title-row">
                    <h3 class="app-name">${escapeHtml(app.name)}</h3>
                    <span class="version-badge" id="ver-app-${appIndex}">${escapeHtml(app.fallbackVersion || "جاري الجلب...")}</span>
                  </div>
                  <p class="app-tagline">${escapeHtml(app.tagline || "")}</p>
                </div>
              </div>
              <p class="app-desc">${escapeHtml(app.description || "")}</p>
              <ul class="features-list">${featuresHtml}</ul>
              <div class="app-actions">
                <a id="dl-app-${appIndex}" href="${escapeHtml(releasesUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-emerald">
                  تحميل APK المباشر
                </a>
                ${pageBtnHtml}
                <a href="${escapeHtml(releasesUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
                  صفحة الإصدارات
                </a>
                <a href="https://github.com/${escapeHtml(app.repo)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
                  المستودع
                </a>
              </div>
              <div class="apk-meta" id="meta-app-${appIndex}">جاري التحقق من أحدث ملف APK على GitHub...</div>
            </div>
            <div class="app-gallery">
              ${shotsHtml}
            </div>
          </article>
        `;
      })
      .join("");

    container.querySelectorAll(".shot-thumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        const aIdx = Number(btn.dataset.appIndex);
        const sIdx = Number(btn.dataset.shotIndex);
        const app = visibleApps[aIdx];
        if (app && Array.isArray(app.screenshots)) {
          openLightbox(app.screenshots, sIdx);
        }
      });
    });

    visibleApps.forEach(async (app, idx) => {
      const rel = await fetchLatestRelease(app.repo);
      const verEl = document.getElementById(`ver-app-${idx}`);
      const dlEl = document.getElementById(`dl-app-${idx}`);
      const metaEl = document.getElementById(`meta-app-${idx}`);
      if (!rel) {
        if (metaEl) metaEl.textContent = "يمكنك التحميل من صفحة الإصدارات الرسمية على GitHub.";
        return;
      }
      if (verEl && rel.tag_name) verEl.textContent = rel.tag_name;
      const apk = pickApkAsset(rel.assets);
      if (apk && dlEl) {
        dlEl.href = apk.browser_download_url;
        dlEl.textContent = `تحميل ${apk.name}`;
        if (metaEl) {
          const sz = formatSize(apk.size);
          metaEl.textContent = `أحدث إصدار: ${rel.tag_name}${sz ? ` • الحجم: ${sz}` : ""}`;
        }
      } else if (metaEl) {
        metaEl.textContent = `أحدث إصدار: ${rel.tag_name || app.fallbackVersion || ""}`;
      }
    });
  }

  function renderTools(tools) {
    const container = document.getElementById("tools-container");
    const visibleTools = (tools || []).filter((t) => t && t.visible !== false);
    document.getElementById("stat-tools").textContent = String(visibleTools.length);

    const filtered =
      currentFilter === "all"
        ? visibleTools
        : visibleTools.filter((t) => t.category === currentFilter);

    if (!filtered.length) {
      container.innerHTML = `<div class="loading-box">لا توجد أدوات ضمن هذا التصنيف حالياً.</div>`;
      return;
    }

    container.innerHTML = filtered
      .map((tool, idx) => {
        const safeId = `tool-${idx}-${String(tool.id || idx).replace(/[^a-zA-Z0-9_-]/g, "")}`;
        const releasesUrl = `https://github.com/${tool.repo}/releases`;
        const tagsHtml = (tool.tags || [])
          .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
          .join("");

        const iconBlock = tool.iconImg
          ? `<div class="tool-emoji tool-emoji-img"><img src="${escapeHtml(safeUrl(tool.iconImg))}" alt="${escapeHtml(tool.name)}" loading="lazy"></div>`
          : `<div class="tool-emoji" aria-hidden="true">${escapeHtml(tool.icon || "🛠️")}</div>`;

        return `
          <article class="tool-card glass-card">
            <div>
              <div class="tool-top">
                <div class="tool-title-group">
                  ${iconBlock}
                  <div>
                    <h3 class="tool-name">${escapeHtml(tool.name)}</h3>
                    <span class="tool-category">${escapeHtml(tool.category || "")}</span>
                  </div>
                </div>
                <span class="version-badge" id="ver-${safeId}">${escapeHtml(tool.fallbackVersion || "Release")}</span>
              </div>
              <p class="tool-desc">${escapeHtml(tool.description || "")}</p>
              <div class="tags-row">${tagsHtml}</div>
            </div>
            <div class="tool-actions">
              <a id="dl-${safeId}" href="${escapeHtml(releasesUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
                تحميل مباشر
              </a>
              <a href="https://github.com/${escapeHtml(tool.repo)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
                المستودع
              </a>
            </div>
          </article>
        `;
      })
      .join("");

    filtered.forEach(async (tool, idx) => {
      const safeId = `tool-${idx}-${String(tool.id || idx).replace(/[^a-zA-Z0-9_-]/g, "")}`;
      const rel = await fetchLatestRelease(tool.repo);
      if (!rel) return;
      const verEl = document.getElementById(`ver-${safeId}`);
      const dlEl = document.getElementById(`dl-${safeId}`);
      if (verEl && rel.tag_name) verEl.textContent = rel.tag_name;
      const asset = pickToolAsset(rel.assets);
      if (asset && dlEl) {
        dlEl.href = asset.browser_download_url;
        const sz = formatSize(asset.size);
        dlEl.textContent = sz ? `تحميل (${sz})` : "تحميل مباشر";
        dlEl.title = asset.name;
      }
    });
  }

  function setupFilters() {
    const bar = document.getElementById("tools-filter-bar");
    bar.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        bar.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.category || "all";
        if (siteConfig) renderTools(siteConfig.desktopTools || []);
      });
    });
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

  function renderContactSection(cfg) {
    const box = document.getElementById("contact-box");
    if (!box) return;
    const accessKey = String((cfg.analytics && cfg.analytics.web3formsAccessKey) || "").trim();
    const githubUrl = safeUrl(cfg.site && cfg.site.githubUrl, "https://github.com/Reda6Dev");

    if (!accessKey) {
      box.innerHTML = `
        <div class="contact-fallback">
          <div>
            <h3 style="margin:0 0 6px;">افتح بلاغاً أو اقترح ميزة مباشرة عبر GitHub</h3>
            <p>يمكنك إرسال ملاحظاتك أو الإبلاغ عن أي مشكلة تقنية عبر صفحة البلاغات الرسمية (Issues) ليتم تتبّعها والرد عليك مباشرة.</p>
          </div>
          <div class="about-actions">
            <a href="https://github.com/Reda6Dev/Atlas/issues" target="_blank" rel="noopener noreferrer" class="btn btn-primary">مشاكل واقتراحات Atlas</a>
            <a href="https://github.com/Reda6Dev/GameDealsHub/issues" target="_blank" rel="noopener noreferrer" class="btn btn-emerald">مشاكل Game Deals Hub</a>
            <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">بقية المستودعات على GitHub</a>
          </div>
        </div>
      `;
      return;
    }

    const projectOptions = [
      ...(cfg.androidApps || []).map((a) => a.name).filter(Boolean),
      ...(cfg.desktopTools || []).map((t) => t.name).filter(Boolean),
    ];

    box.innerHTML = `
      <form id="contact-form" class="contact-form">
        <input type="checkbox" name="botcheck" style="display:none;" tabindex="-1" autocomplete="off">
        <div class="form-grid">
          <div class="form-field">
            <label for="cf-name">الاسم</label>
            <input type="text" id="cf-name" class="input" required placeholder="اسمك الكريم">
          </div>
          <div class="form-field">
            <label for="cf-email">البريد الإلكتروني</label>
            <input type="email" id="cf-email" class="input input-ltr" required placeholder="name@example.com">
          </div>
          <div class="form-field full">
            <label for="cf-subject">المشروع أو الموضوع</label>
            <select id="cf-subject" class="select">
              <option value="استفسار عام / اقتراح">استفسار عام / اقتراح</option>
              ${projectOptions.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}
            </select>
          </div>
          <div class="form-field full">
            <label for="cf-message">الرسالة أو تفاصيل المشكلة</label>
            <textarea id="cf-message" class="textarea" required placeholder="اكتب رسالتك أو تفاصيل المشكلة بوضوح..."></textarea>
          </div>
        </div>
        <div class="about-actions" style="justify-content:space-between;align-items:center;">
          <button type="submit" id="cf-submit" class="btn btn-emerald">إرسال الرسالة</button>
          <a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">أو عبر GitHub Issues</a>
        </div>
        <div id="cf-status" class="contact-status" role="status" aria-live="polite"></div>
      </form>
    `;

    const form = document.getElementById("contact-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById("cf-status");
      const btn = document.getElementById("cf-submit");
      const botcheck = form.querySelector('input[name="botcheck"]');
      if (botcheck && botcheck.checked) return;

      btn.disabled = true;
      btn.textContent = "جاري الإرسال...";
      statusEl.className = "contact-status";
      statusEl.textContent = "";

      try {
        const res = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            access_key: accessKey,
            from_name: "REDA DEV Website",
            name: document.getElementById("cf-name").value.trim(),
            email: document.getElementById("cf-email").value.trim(),
            subject: `[REDA DEV] ${document.getElementById("cf-subject").value}`,
            message: document.getElementById("cf-message").value.trim(),
            botcheck: false,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.message || `HTTP ${res.status}`);
        }
        statusEl.className = "contact-status ok";
        statusEl.textContent = "تم إرسال رسالتك بنجاح! سأرد عليك في أقرب وقت.";
        form.reset();
      } catch (err) {
        statusEl.className = "contact-status err";
        statusEl.textContent = `تعذّر إرسال الرسالة حالياً (${err.message}). يمكنك المراسلة عبر GitHub Issues.`;
      } finally {
        btn.disabled = false;
        btn.textContent = "إرسال الرسالة";
      }
    });
  }

  async function init() {
    setupMobileNav();
    setupFilters();
    setupLightbox();

    let isPreview = false;
    try {
      const params = new URLSearchParams(window.location.search);
      isPreview = params.get("preview") === "1";
    } catch (_) {}

    try {
      if (isPreview) {
        const draftRaw = localStorage.getItem("reda6dev_preview_config");
        if (draftRaw) {
          siteConfig = JSON.parse(draftRaw);
          const banner = document.createElement("div");
          banner.className = "preview-banner";
          banner.textContent = "وضع المعاينة الحيّة من لوحة التحكم — التعديلات المعروضة لم تُنشر بعد.";
          document.body.prepend(banner);
        }
      }
      if (!siteConfig) {
        const res = await fetch(`site-config.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        siteConfig = await res.json();
      }
      applyTheme(siteConfig.theme);
      applySeo(siteConfig.seo);
      applyAnnouncement(siteConfig.announcement);
      applyAnalytics(siteConfig.analytics, isPreview);
      renderHeaderAndHero(siteConfig.site || {});
      renderApps(siteConfig.androidApps || []);
      renderTools(siteConfig.desktopTools || []);
      renderYouTubeSection(siteConfig.site || {});
      renderContactSection(siteConfig);
    } catch (err) {
      document.getElementById("apps-container").innerHTML =
        `<div class="loading-box">تعذّر تحميل ملف البيانات site-config.json (${escapeHtml(err.message)}).</div>`;
      document.getElementById("tools-container").innerHTML =
        `<div class="loading-box">تعذّر تحميل قائمة الأدوات.</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
