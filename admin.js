(function () {
  "use strict";

  const REPO_OWNER = "Reda6Dev";
  const REPO_NAME = "Reda6Dev.github.io";
  const SITE_BASE_URL = "https://reda6dev.github.io";
  const CONFIG_PATH = "site-config.json";
  const TOKEN_KEY = "reda6dev_gh_token";
  const PREVIEW_KEY = "reda6dev_preview_config";
  const IS_FILE_PROTOCOL = window.location.protocol === "file:";
  const DEFAULT_THEME = { bg: "#0b0f19", accent: "#8b5cf6", emerald: "#10b981" };
  const DEFAULT_SEO = {
    metaTitle: "REDA DEV | تطبيقات الأندرويد وأدوات الحاسوب والتعريب",
    metaDescription: "الموقع الرسمي للمطور REDA DEV (Reda6Dev).",
    keywords: "",
    ogImage: "https://reda6dev.github.io/assets/icons/atlas-icon.png",
  };

  let config = null;
  let pendingMediaBlob = null;
  let pendingMediaDataUrl = "";
  let releaseMode = "new";

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveAssetSrc(url) {
    const val = String(url ?? "").trim();
    if (!val) return "";
    if (/^(https?:\/\/|data:|blob:)/i.test(val)) return val;
    if (IS_FILE_PROTOCOL) {
      return `${SITE_BASE_URL}/${val.replace(/^\/+/, "")}`;
    }
    return val;
  }

  function showToast(msg, isError = false) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 4500);
  }

  function getSavedToken() {
    const inp = document.getElementById("gh-token");
    return ((inp && inp.value) || localStorage.getItem(TOKEN_KEY) || "").trim();
  }

  function authHeaders(extra = {}) {
    const headers = { Accept: "application/vnd.github+json", ...extra };
    const tok = getSavedToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    return headers;
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    return arrayBufferToBase64(bytes.buffer);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    const clean = String(b64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  function extractYouTubeId(input) {
    const raw = String(input ?? "").trim();
    if (!raw) return "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const u = new URL(raw);
      if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "").slice(0, 11);
      if (u.searchParams.get("v")) return u.searchParams.get("v").slice(0, 11);
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    } catch (_) {
      const m = raw.match(/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
    return "";
  }

  function formatSize(bytes) {
    if (!bytes || Number.isNaN(bytes)) return "0 KB";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function moveItem(arr, index, delta) {
    const target = index + delta;
    if (!Array.isArray(arr) || target < 0 || target >= arr.length) return;
    const [item] = arr.splice(index, 1);
    arr.splice(target, 0, item);
  }

  function applyThemePreview(theme) {
    const t = theme || DEFAULT_THEME;
    const root = document.documentElement;
    if (/^#[0-9a-fA-F]{6}$/.test(t.bg || "")) root.style.setProperty("--bg", t.bg);
    if (/^#[0-9a-fA-F]{6}$/.test(t.accent || "")) {
      root.style.setProperty("--accent", t.accent);
      root.style.setProperty("--accent-strong", t.accent);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(t.emerald || "")) root.style.setProperty("--emerald", t.emerald);
  }

  function readThemeInputs() {
    return {
      bg: document.getElementById("c-bg-hex").value.trim() || DEFAULT_THEME.bg,
      accent: document.getElementById("c-accent-hex").value.trim() || DEFAULT_THEME.accent,
      emerald: document.getElementById("c-emerald-hex").value.trim() || DEFAULT_THEME.emerald,
    };
  }

  function setThemeInputs(t) {
    const theme = { ...DEFAULT_THEME, ...(t || {}) };
    document.getElementById("c-bg").value = theme.bg;
    document.getElementById("c-bg-hex").value = theme.bg;
    document.getElementById("c-accent").value = theme.accent;
    document.getElementById("c-accent-hex").value = theme.accent;
    document.getElementById("c-emerald").value = theme.emerald;
    document.getElementById("c-emerald-hex").value = theme.emerald;
    applyThemePreview(theme);
  }

  function bindColorPair(colorId, hexId, onChange) {
    const picker = document.getElementById(colorId);
    const hex = document.getElementById(hexId);
    picker.addEventListener("input", () => {
      hex.value = picker.value;
      onChange();
    });
    hex.addEventListener("input", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) {
        picker.value = hex.value.trim();
        onChange();
      }
    });
  }

  /* ---- Announcement & SEO Live Previews ---- */
  function updateAnnouncementPreview() {
    const enabled = document.getElementById("ann-enabled").checked;
    const text = document.getElementById("ann-text").value.trim();
    const linkText = document.getElementById("ann-linkText").value.trim();
    const bg = /^#[0-9a-fA-F]{6}$/.test(document.getElementById("ann-bg-hex").value.trim())
      ? document.getElementById("ann-bg-hex").value.trim()
      : "#7c3aed";
    const box = document.getElementById("ann-preview");
    box.style.background = bg;
    box.style.opacity = enabled ? "1" : "0.5";
    box.innerHTML = `
      <span>${enabled ? "مفعّل:" : "معطّل (معاينة):"} ${escapeHtml(text || "اكتب نص الإعلان هنا...")}</span>
      ${linkText ? `<span class="announcement-link">${escapeHtml(linkText)}</span>` : ""}
    `;
  }

  function updateSeoPreview() {
    document.getElementById("seo-preview-title").textContent =
      document.getElementById("seo-title").value.trim() || DEFAULT_SEO.metaTitle;
    document.getElementById("seo-preview-desc").textContent =
      document.getElementById("seo-desc").value.trim() || DEFAULT_SEO.metaDescription;
  }

  function updateWeb3FormsBadge() {
    const key = document.getElementById("int-web3forms").value.trim();
    const badge = document.getElementById("web3forms-badge");
    if (key) {
      badge.className = "status-badge visible";
      badge.textContent = "نشط: نموذج البريد الإلكتروني";
    } else {
      badge.className = "status-badge hidden";
      badge.textContent = "بديل تلقائي: GitHub Issues";
    }
  }

  function updateTokenStatus() {
    const token = localStorage.getItem(TOKEN_KEY) || "";
    const status = document.getElementById("token-status");
    const input = document.getElementById("gh-token");
    if (token) {
      input.value = token;
      status.textContent = "الرمز محفوظ محلياً في متصفحك وجاهز للنشر ورفع الوسائط والإصدارات.";
      status.style.color = "#6ee7b7";
    } else {
      input.value = "";
      status.textContent = "لم يتم حفظ رمز بعد. أنشئ رمزاً عبر الزر أعلاه ثم الصقه هنا.";
      status.style.color = "#9ca3af";
    }
  }

  /* ---- Tab 1: Dashboard & GitHub Releases Stats ---- */
  function updateLocalDashboardKpis() {
    if (!config) return;
    const apps = config.androidApps || [];
    const tools = config.desktopTools || [];
    const visApps = apps.filter((a) => a.visible !== false).length;
    const visTools = tools.filter((t) => t.visible !== false).length;
    const secs = (config.atlasHelp && config.atlasHelp.sections) || [];
    const faqs = (config.atlasHelp && config.atlasHelp.faqs) || [];

    document.getElementById("kpi-apps").textContent = `${visApps} / ${apps.length}`;
    document.getElementById("kpi-apps-sub").textContent = "ظاهر في الموقع / الإجمالي";
    document.getElementById("kpi-tools").textContent = `${visTools} / ${tools.length}`;
    document.getElementById("kpi-tools-sub").textContent = "ظاهر في الموقع / الإجمالي";
    document.getElementById("kpi-help").textContent = `${secs.length} / ${faqs.length}`;
    document.getElementById("kpi-help-sub").textContent = "أقسام الشرح / الأسئلة الشائعة";
  }

  async function refreshDashboardStats() {
    if (!config) return;
    updateLocalDashboardKpis();
    const tbody = document.getElementById("dashboard-repos-body");
    const items = [
      ...(config.androidApps || []).map((a) => ({ name: a.name, type: "تطبيق أندرويد", repo: a.repo, visible: a.visible !== false })),
      ...(config.desktopTools || []).map((t) => ({ name: t.name, type: "أداة ويندوز", repo: t.repo, visible: t.visible !== false })),
    ].filter((x) => x.repo && x.repo.includes("/"));

    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;">جاري جلب الإحصائيات من GitHub API...</td></tr>`;

    let grandTotalDownloads = 0;
    const rows = await Promise.all(
      items.map(async (item) => {
        try {
          const res = await fetch(`https://api.github.com/repos/${item.repo}/releases?per_page=15`, {
            headers: authHeaders(),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const rels = await res.json();
          if (!Array.isArray(rels) || !rels.length) {
            return { ...item, latestTag: "لا يوجد إصدار", latestDl: 0, totalDl: 0, date: "-" };
          }
          const latest = rels[0];
          const latestDl = (latest.assets || []).reduce((acc, a) => acc + (a.download_count || 0), 0);
          const totalDl = rels.reduce(
            (sum, r) => sum + (r.assets || []).reduce((acc, a) => acc + (a.download_count || 0), 0),
            0
          );
          grandTotalDownloads += totalDl;
          const date = latest.published_at ? new Date(latest.published_at).toLocaleDateString("ar-EG") : "-";
          return { ...item, latestTag: latest.tag_name || latest.name || "-", latestDl, totalDl, date };
        } catch (err) {
          return { ...item, latestTag: `تعذّر (${err.message})`, latestDl: 0, totalDl: 0, date: "-" };
        }
      })
    );

    document.getElementById("kpi-downloads").textContent = grandTotalDownloads.toLocaleString("en-US");
    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td><strong>${escapeHtml(r.name)}</strong><div class="muted ltr-inline" style="font-size:0.76rem;">${escapeHtml(r.repo)}</div></td>
          <td>${escapeHtml(r.type)}</td>
          <td><span class="status-badge ${r.visible ? "visible" : "hidden"}">${r.visible ? "ظاهر" : "مخفي"}</span></td>
          <td><span class="version-badge">${escapeHtml(r.latestTag)}</span></td>
          <td><strong>${r.latestDl.toLocaleString("en-US")}</strong></td>
          <td><strong style="color:#6ee7b7;">${r.totalDl.toLocaleString("en-US")}</strong></td>
          <td>${escapeHtml(r.date)}</td>
          <td><a href="https://github.com/${escapeHtml(r.repo)}/releases" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">الإصدارات</a></td>
        </tr>
      `
      )
      .join("");
  }

  /* ---- Populate General Forms, Announcement, SEO, Integrations, YouTube ---- */
  function populateSiteAndSettingsForms() {
    const s = config.site || {};
    document.getElementById("f-brandName").value = s.brandName || "REDA DEV";
    document.getElementById("f-owner").value = s.owner || "Reda6Dev";
    document.getElementById("f-heroBadge").value = s.heroBadge || "";
    document.getElementById("f-heroTitle").value = s.heroTitle || "";
    document.getElementById("f-heroSubtitle").value = s.heroSubtitle || "";
    document.getElementById("f-bio").value = s.bio || "";
    document.getElementById("f-githubUrl").value = s.githubUrl || "https://github.com/Reda6Dev";

    setThemeInputs(config.theme);

    const ann = config.announcement || {};
    document.getElementById("ann-enabled").checked = Boolean(ann.enabled);
    document.getElementById("ann-text").value = ann.text || "";
    document.getElementById("ann-linkText").value = ann.linkText || "";
    document.getElementById("ann-linkUrl").value = ann.linkUrl || "";
    const annBg = /^#[0-9a-fA-F]{6}$/.test(ann.bgColor || "") ? ann.bgColor : "#7c3aed";
    document.getElementById("ann-bg").value = annBg;
    document.getElementById("ann-bg-hex").value = annBg;
    updateAnnouncementPreview();

    const seo = config.seo || DEFAULT_SEO;
    document.getElementById("seo-title").value = seo.metaTitle || "";
    document.getElementById("seo-desc").value = seo.metaDescription || "";
    document.getElementById("seo-keywords").value = seo.keywords || "";
    document.getElementById("seo-ogImage").value = seo.ogImage || "";
    updateSeoPreview();

    const an = config.analytics || {};
    document.getElementById("int-web3forms").value = an.web3formsAccessKey || "";
    document.getElementById("int-goatcounter").value = an.goatcounterCode || "";
    document.getElementById("int-cloudflare").value = an.cloudflareToken || "";
    updateWeb3FormsBadge();

    document.getElementById("f-youtubeUrl").value = s.youtubeUrl || "https://www.youtube.com/@rk2003";
    document.getElementById("f-youtubeHandle").value = s.youtubeHandle || "@rk2003";
    document.getElementById("f-youtubeChannelName").value = s.youtubeChannelName || "REDA DEV";
    document.getElementById("f-youtubeFeaturedVideoId").value = s.youtubeFeaturedVideoId || "";
    document.getElementById("f-youtubeDescription").value = s.youtubeDescription || "";
    updateYouTubePreview();
    renderYouTubeVideosEditor();
    populateReleaseRepoSelect();
  }

  function updateYouTubePreview() {
    const val = document.getElementById("f-youtubeFeaturedVideoId").value;
    const vid = extractYouTubeId(val);
    const box = document.getElementById("yt-preview-box");
    if (vid) {
      box.innerHTML = `
        <p class="muted" style="margin:0 0 8px;">معاينة الفيديو (<span class="ltr-inline">${escapeHtml(vid)}</span>):</p>
        <div class="yt-aspect" style="max-width:520px;">
          <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(vid)}?rel=0" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    } else {
      box.innerHTML = `<small class="muted">لا يوجد معرّف فيديو رئيسي حالياً — سيعرض الموقع بطاقة قناة @rk2003 أو الفيديوهات المضافة بالأسفل.</small>`;
    }
  }

  /* ---- YouTube Multi-Videos Editor ---- */
  function renderYouTubeVideosEditor() {
    const list = document.getElementById("admin-yt-videos-list");
    const videos = (config.site && config.site.youtubeVideos) || [];
    if (!videos.length) {
      list.innerHTML = `<p class="muted">لا توجد فيديوهات إضافية. اضغط «+ إضافة فيديو» لإضافة رابط يوتيوب.</p>`;
      return;
    }

    list.innerHTML = videos
      .map((v, i) => {
        const obj = typeof v === "string" ? { url: v, title: "" } : v;
        const vid = extractYouTubeId(obj.url || obj.id || "");
        return `
          <div class="admin-item-card" data-yt-index="${i}">
            <div class="admin-item-head">
              <h3>فيديو #${i + 1} ${vid ? `(<span class="ltr-inline">${escapeHtml(vid)}</span>)` : ""}</h3>
              <div class="admin-item-controls">
                <button type="button" class="btn btn-secondary btn-sm yt-move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="btn btn-secondary btn-sm yt-move-dn" data-index="${i}" ${i === videos.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="btn btn-danger btn-sm yt-del" data-index="${i}">حذف</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label>عنوان الفيديو</label>
                <input type="text" class="input yt-in-title" value="${escapeHtml(obj.title || "")}" placeholder="مثال: شرح تثبيت واستخدام أطلس">
              </div>
              <div class="form-field">
                <label>رابط الفيديو الكامل أو المعرّف</label>
                <input type="text" class="input input-ltr yt-in-url" value="${escapeHtml(obj.url || obj.id || "")}" placeholder="https://www.youtube.com/watch?v=...">
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".yt-move-up").forEach((b) =>
      b.addEventListener("click", () => {
        syncYouTubeVideosFromDom();
        moveItem(config.site.youtubeVideos, Number(b.dataset.index), -1);
        renderYouTubeVideosEditor();
      })
    );
    list.querySelectorAll(".yt-move-dn").forEach((b) =>
      b.addEventListener("click", () => {
        syncYouTubeVideosFromDom();
        moveItem(config.site.youtubeVideos, Number(b.dataset.index), 1);
        renderYouTubeVideosEditor();
      })
    );
    list.querySelectorAll(".yt-del").forEach((b) =>
      b.addEventListener("click", () => {
        syncYouTubeVideosFromDom();
        config.site.youtubeVideos.splice(Number(b.dataset.index), 1);
        renderYouTubeVideosEditor();
      })
    );
  }

  function syncYouTubeVideosFromDom() {
    const cards = document.querySelectorAll("#admin-yt-videos-list .admin-item-card");
    if (!config.site) config.site = {};
    if (!cards.length && (!config.site.youtubeVideos || !config.site.youtubeVideos.length)) return;
    const res = [];
    cards.forEach((card) => {
      const title = card.querySelector(".yt-in-title").value.trim();
      const rawUrl = card.querySelector(".yt-in-url").value.trim();
      const id = extractYouTubeId(rawUrl);
      if (rawUrl || title) {
        res.push({ title: title || (id ? `فيديو ${id}` : "فيديو"), url: rawUrl, id });
      }
    });
    config.site.youtubeVideos = res;
  }

  /* ---- Android Apps Editor (with visible toggle) ---- */
  function renderAppsEditor() {
    const list = document.getElementById("admin-apps-list");
    const apps = config.androidApps || [];
    if (!apps.length) {
      list.innerHTML = `<p class="muted">لا توجد تطبيقات بعد. اضغط «+ إضافة تطبيق جديد».</p>`;
      return;
    }

    list.innerHTML = apps
      .map((app, i) => {
        const isVisible = app.visible !== false;
        const featuresText = (app.features || []).join("\n");
        const shotsText = (app.screenshots || [])
          .map((sh) => (sh.caption ? `${sh.url} | ${sh.caption}` : sh.url))
          .join("\n");

        return `
          <div class="admin-item-card ${isVisible ? "" : "hidden-item-card"}" data-app-index="${i}" data-visible="${isVisible}">
            <div class="admin-item-head">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                ${app.icon ? `<img src="${escapeHtml(resolveAssetSrc(app.icon))}" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">` : ""}
                <h3>${escapeHtml(app.name || `تطبيق #${i + 1}`)}</h3>
                <span class="status-badge ${isVisible ? "visible" : "hidden"}">${isVisible ? "ظاهر في الموقع" : "مخفي مؤقتاً"}</span>
              </div>
              <div class="admin-item-controls">
                <button type="button" class="btn ${isVisible ? "btn-secondary" : "btn-emerald"} btn-sm app-toggle-vis" data-index="${i}">
                  ${isVisible ? "إخفاء في الموقع" : "إظهار في الموقع"}
                </button>
                <button type="button" class="btn btn-secondary btn-sm app-move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>أعلى ↑</button>
                <button type="button" class="btn btn-secondary btn-sm app-move-dn" data-index="${i}" ${i === apps.length - 1 ? "disabled" : ""}>أسفل ↓</button>
                <button type="button" class="btn btn-danger btn-sm btn-del-app" data-index="${i}">حذف</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label>اسم التطبيق</label>
                <input type="text" class="input app-in-name" value="${escapeHtml(app.name || "")}">
              </div>
              <div class="form-field">
                <label>المستودع على GitHub (owner/repo)</label>
                <input type="text" class="input input-ltr app-in-repo" value="${escapeHtml(app.repo || "")}" placeholder="Reda6Dev/AppName">
              </div>
              <div class="form-field">
                <label>رابط الأيقونة</label>
                <input type="text" class="input input-ltr app-in-icon" value="${escapeHtml(app.icon || "")}" placeholder="assets/icons/...">
              </div>
              <div class="form-field">
                <label>صفحة التطبيق الخاصة (اختياري)</label>
                <input type="text" class="input input-ltr app-in-page" value="${escapeHtml(app.pageUrl || "")}" placeholder="atlas.html">
              </div>
              <div class="form-field">
                <label>الوصف المختصر (Tagline)</label>
                <input type="text" class="input app-in-tagline" value="${escapeHtml(app.tagline || "")}">
              </div>
              <div class="form-field">
                <label>رقم الإصدار الاحتياطي</label>
                <input type="text" class="input input-ltr app-in-ver" value="${escapeHtml(app.fallbackVersion || "")}" placeholder="v1.0.0">
              </div>
              <div class="form-field full">
                <label>الوصف الكامل</label>
                <textarea class="textarea app-in-desc">${escapeHtml(app.description || "")}</textarea>
              </div>
              <div class="form-field">
                <label>المميزات (كل ميزة في سطر مستقل)</label>
                <textarea class="textarea app-in-features">${escapeHtml(featuresText)}</textarea>
              </div>
              <div class="form-field">
                <label>لقطات الشاشة (كل صورة في سطر: الرابط | التعليق)</label>
                <textarea class="textarea input-ltr app-in-shots">${escapeHtml(shotsText)}</textarea>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".app-toggle-vis").forEach((b) =>
      b.addEventListener("click", () => {
        syncAppsFromDom();
        const idx = Number(b.dataset.index);
        const cur = config.androidApps[idx].visible !== false;
        config.androidApps[idx].visible = !cur;
        renderAppsEditor();
        updateLocalDashboardKpis();
      })
    );
    list.querySelectorAll(".app-move-up").forEach((b) =>
      b.addEventListener("click", () => {
        syncAppsFromDom();
        moveItem(config.androidApps, Number(b.dataset.index), -1);
        renderAppsEditor();
      })
    );
    list.querySelectorAll(".app-move-dn").forEach((b) =>
      b.addEventListener("click", () => {
        syncAppsFromDom();
        moveItem(config.androidApps, Number(b.dataset.index), 1);
        renderAppsEditor();
      })
    );
    list.querySelectorAll(".btn-del-app").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncAppsFromDom();
        config.androidApps.splice(Number(btn.dataset.index), 1);
        renderAppsEditor();
        updateLocalDashboardKpis();
      });
    });
  }

  function syncAppsFromDom() {
    const cards = document.querySelectorAll("#admin-apps-list .admin-item-card");
    if (!cards.length && (!config.androidApps || !config.androidApps.length)) return;
    const updated = [];
    cards.forEach((card, idx) => {
      const prev = (config.androidApps && config.androidApps[idx]) || {};
      const name = card.querySelector(".app-in-name").value.trim();
      const repo = card.querySelector(".app-in-repo").value.trim();
      const icon = card.querySelector(".app-in-icon").value.trim();
      const pageUrl = card.querySelector(".app-in-page").value.trim();
      const tagline = card.querySelector(".app-in-tagline").value.trim();
      const fallbackVersion = card.querySelector(".app-in-ver").value.trim();
      const description = card.querySelector(".app-in-desc").value.trim();
      const features = card.querySelector(".app-in-features").value.split("\n").map((s) => s.trim()).filter(Boolean);
      const screenshots = card
        .querySelector(".app-in-shots")
        .value.split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("|");
          return { url: (parts[0] || "").trim(), caption: (parts[1] || "").trim() };
        });

      updated.push({
        id: prev.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `app-${idx + 1}`,
        visible: card.dataset.visible !== "false",
        name,
        tagline,
        description,
        repo,
        pageUrl,
        icon,
        fallbackVersion,
        features,
        screenshots,
      });
    });
    config.androidApps = updated;
  }

  /* ---- Desktop Tools Editor (with visible toggle) ---- */
  function renderToolsEditor() {
    const list = document.getElementById("admin-tools-list");
    const tools = config.desktopTools || [];
    if (!tools.length) {
      list.innerHTML = `<p class="muted">لا توجد أدوات بعد. اضغط «+ إضافة أداة جديدة».</p>`;
      return;
    }

    list.innerHTML = tools
      .map((tool, i) => {
        const isVisible = tool.visible !== false;
        const tagsStr = (tool.tags || []).join(", ");
        const cat = tool.category || "أدوات النظام والتطوير";
        return `
          <div class="admin-item-card ${isVisible ? "" : "hidden-item-card"}" data-tool-index="${i}" data-visible="${isVisible}">
            <div class="admin-item-head">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                ${tool.iconImg ? `<img src="${escapeHtml(resolveAssetSrc(tool.iconImg))}" alt="" style="width:28px;height:28px;border-radius:6px;object-fit:contain;">` : `<span>${escapeHtml(tool.icon || "🛠️")}</span>`}
                <h3>${escapeHtml(tool.name || `أداة #${i + 1}`)}</h3>
                <span class="status-badge ${isVisible ? "visible" : "hidden"}">${isVisible ? "ظاهر في الموقع" : "مخفي مؤقتاً"}</span>
              </div>
              <div class="admin-item-controls">
                <button type="button" class="btn ${isVisible ? "btn-secondary" : "btn-emerald"} btn-sm tool-toggle-vis" data-index="${i}">
                  ${isVisible ? "إخفاء في الموقع" : "إظهار في الموقع"}
                </button>
                <button type="button" class="btn btn-secondary btn-sm tool-move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>أعلى ↑</button>
                <button type="button" class="btn btn-secondary btn-sm tool-move-dn" data-index="${i}" ${i === tools.length - 1 ? "disabled" : ""}>أسفل ↓</button>
                <button type="button" class="btn btn-danger btn-sm btn-del-tool" data-index="${i}">حذف</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label>اسم الأداة</label>
                <input type="text" class="input input-ltr tool-in-name" value="${escapeHtml(tool.name || "")}">
              </div>
              <div class="form-field">
                <label>المستودع على GitHub (owner/repo)</label>
                <input type="text" class="input input-ltr tool-in-repo" value="${escapeHtml(tool.repo || "")}" placeholder="Reda6Dev/ToolName">
              </div>
              <div class="form-field">
                <label>التصنيف</label>
                <select class="select tool-in-cat">
                  <option value="تعريب الألعاب" ${cat === "تعريب الألعاب" ? "selected" : ""}>تعريب الألعاب</option>
                  <option value="أدوات النظام والتطوير" ${cat === "أدوات النظام والتطوير" ? "selected" : ""}>أدوات النظام والتطوير</option>
                </select>
              </div>
              <div class="form-field">
                <label>مسار صورة الأيقونة (اختياري)</label>
                <input type="text" class="input input-ltr tool-in-icon-img" value="${escapeHtml(tool.iconImg || "")}" placeholder="assets/icons/...">
              </div>
              <div class="form-field">
                <label>الأيقونة البديلة (رمز تعبيري)</label>
                <input type="text" class="input tool-in-icon" value="${escapeHtml(tool.icon || "🛠️")}">
              </div>
              <div class="form-field">
                <label>الإصدار الاحتياطي</label>
                <input type="text" class="input input-ltr tool-in-ver" value="${escapeHtml(tool.fallbackVersion || "")}">
              </div>
              <div class="form-field full">
                <label>الوسوم (مفصولة بفاصلة)</label>
                <input type="text" class="input tool-in-tags" value="${escapeHtml(tagsStr)}" placeholder="C#, WPF, Windows">
              </div>
              <div class="form-field full">
                <label>الوصف</label>
                <textarea class="textarea tool-in-desc">${escapeHtml(tool.description || "")}</textarea>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".tool-toggle-vis").forEach((b) =>
      b.addEventListener("click", () => {
        syncToolsFromDom();
        const idx = Number(b.dataset.index);
        const cur = config.desktopTools[idx].visible !== false;
        config.desktopTools[idx].visible = !cur;
        renderToolsEditor();
        updateLocalDashboardKpis();
      })
    );
    list.querySelectorAll(".tool-move-up").forEach((b) =>
      b.addEventListener("click", () => {
        syncToolsFromDom();
        moveItem(config.desktopTools, Number(b.dataset.index), -1);
        renderToolsEditor();
      })
    );
    list.querySelectorAll(".tool-move-dn").forEach((b) =>
      b.addEventListener("click", () => {
        syncToolsFromDom();
        moveItem(config.desktopTools, Number(b.dataset.index), 1);
        renderToolsEditor();
      })
    );
    list.querySelectorAll(".btn-del-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncToolsFromDom();
        config.desktopTools.splice(Number(btn.dataset.index), 1);
        renderToolsEditor();
        updateLocalDashboardKpis();
      });
    });
  }

  function syncToolsFromDom() {
    const cards = document.querySelectorAll("#admin-tools-list .admin-item-card");
    if (!cards.length && (!config.desktopTools || !config.desktopTools.length)) return;
    const updated = [];
    cards.forEach((card, idx) => {
      const prev = (config.desktopTools && config.desktopTools[idx]) || {};
      const name = card.querySelector(".tool-in-name").value.trim();
      const repo = card.querySelector(".tool-in-repo").value.trim();
      const category = card.querySelector(".tool-in-cat").value;
      const iconImg = card.querySelector(".tool-in-icon-img").value.trim();
      const icon = card.querySelector(".tool-in-icon").value.trim() || "🛠️";
      const fallbackVersion = card.querySelector(".tool-in-ver").value.trim();
      const tags = card.querySelector(".tool-in-tags").value.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
      const description = card.querySelector(".tool-in-desc").value.trim();

      updated.push({
        id: prev.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `tool-${idx + 1}`,
        visible: card.dataset.visible !== "false",
        name,
        category,
        icon,
        iconImg,
        description,
        repo,
        fallbackVersion,
        tags,
      });
    });
    config.desktopTools = updated;
  }

  /* ---- Atlas Help Center Editor ---- */
  function renderAtlasHelpEditor() {
    if (!config.atlasHelp) config.atlasHelp = { sections: [], faqs: [] };
    const sections = config.atlasHelp.sections || [];
    const faqs = config.atlasHelp.faqs || [];

    const secList = document.getElementById("admin-help-sections-list");
    secList.innerHTML = sections.length
      ? sections
          .map(
            (sec, i) => `
          <div class="admin-item-card" data-sec-index="${i}">
            <div class="admin-item-head">
              <h3>${escapeHtml(sec.icon || "📘")} ${escapeHtml(sec.title || `قسم #${i + 1}`)}</h3>
              <div class="admin-item-controls">
                <button type="button" class="btn btn-secondary btn-sm hsec-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="btn btn-secondary btn-sm hsec-dn" data-index="${i}" ${i === sections.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="btn btn-danger btn-sm hsec-del" data-index="${i}">حذف</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label>عنوان القسم</label>
                <input type="text" class="input hsec-in-title" value="${escapeHtml(sec.title || "")}">
              </div>
              <div class="form-field">
                <label>المعرّف للرابط المباشر (ID)</label>
                <input type="text" class="input input-ltr hsec-in-id" value="${escapeHtml(sec.id || "")}" placeholder="help-getting-started">
              </div>
              <div class="form-field">
                <label>الأيقونة</label>
                <input type="text" class="input hsec-in-icon" value="${escapeHtml(sec.icon || "📘")}">
              </div>
              <div class="form-field">
                <label>ملخص القسم</label>
                <input type="text" class="input hsec-in-summary" value="${escapeHtml(sec.summary || "")}">
              </div>
              <div class="form-field full">
                <label>خطوات وبنود الشرح (كل نقطة في سطر مستقل)</label>
                <textarea class="textarea hsec-in-items" style="min-height:125px;">${escapeHtml((sec.items || []).join("\n"))}</textarea>
              </div>
            </div>
          </div>
        `
          )
          .join("")
      : `<p class="muted">لا توجد أقسام مساعدة.</p>`;

    secList.querySelectorAll(".hsec-up").forEach((b) =>
      b.addEventListener("click", () => {
        syncAtlasHelpFromDom();
        moveItem(config.atlasHelp.sections, Number(b.dataset.index), -1);
        renderAtlasHelpEditor();
      })
    );
    secList.querySelectorAll(".hsec-dn").forEach((b) =>
      b.addEventListener("click", () => {
        syncAtlasHelpFromDom();
        moveItem(config.atlasHelp.sections, Number(b.dataset.index), 1);
        renderAtlasHelpEditor();
      })
    );
    secList.querySelectorAll(".hsec-del").forEach((b) =>
      b.addEventListener("click", () => {
        syncAtlasHelpFromDom();
        config.atlasHelp.sections.splice(Number(b.dataset.index), 1);
        renderAtlasHelpEditor();
      })
    );

    const faqList = document.getElementById("admin-faqs-list");
    faqList.innerHTML = faqs.length
      ? faqs
          .map(
            (faq, i) => `
          <div class="admin-item-card" data-faq-index="${i}">
            <div class="admin-item-head">
              <h3>سؤال #${i + 1}</h3>
              <div class="admin-item-controls">
                <button type="button" class="btn btn-secondary btn-sm faq-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="btn btn-secondary btn-sm faq-dn" data-index="${i}" ${i === faqs.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="btn btn-danger btn-sm faq-del" data-index="${i}">حذف</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-field full">
                <label>السؤال</label>
                <input type="text" class="input faq-in-q" value="${escapeHtml(faq.q || "")}">
              </div>
              <div class="form-field full">
                <label>الإجابة</label>
                <textarea class="textarea faq-in-a">${escapeHtml(faq.a || "")}</textarea>
              </div>
            </div>
          </div>
        `
          )
          .join("")
      : `<p class="muted">لا توجد أسئلة شائعة بعد.</p>`;

    faqList.querySelectorAll(".faq-up").forEach((b) =>
      b.addEventListener("click", () => {
        syncAtlasHelpFromDom();
        moveItem(config.atlasHelp.faqs, Number(b.dataset.index), -1);
        renderAtlasHelpEditor();
      })
    );
    faqList.querySelectorAll(".faq-dn").forEach((b) =>
      b.addEventListener("click", () => {
        syncAtlasHelpFromDom();
        moveItem(config.atlasHelp.faqs, Number(b.dataset.index), 1);
        renderAtlasHelpEditor();
      })
    );
    faqList.querySelectorAll(".faq-del").forEach((b) =>
      b.addEventListener("click", () => {
        syncAtlasHelpFromDom();
        config.atlasHelp.faqs.splice(Number(b.dataset.index), 1);
        renderAtlasHelpEditor();
      })
    );
  }

  function syncAtlasHelpFromDom() {
    if (!config.atlasHelp) config.atlasHelp = { sections: [], faqs: [] };
    const secCards = document.querySelectorAll("#admin-help-sections-list .admin-item-card");
    if (secCards.length || !config.atlasHelp.sections.length) {
      const secs = [];
      secCards.forEach((card, idx) => {
        const title = card.querySelector(".hsec-in-title").value.trim();
        const id = card.querySelector(".hsec-in-id").value.trim() || `help-sec-${idx + 1}`;
        const icon = card.querySelector(".hsec-in-icon").value.trim() || "📘";
        const summary = card.querySelector(".hsec-in-summary").value.trim();
        const items = card.querySelector(".hsec-in-items").value.split("\n").map((s) => s.trim()).filter(Boolean);
        secs.push({ id, title, icon, summary, items });
      });
      if (secCards.length) config.atlasHelp.sections = secs;
    }

    const faqCards = document.querySelectorAll("#admin-faqs-list .admin-item-card");
    if (faqCards.length) {
      const faqs = [];
      faqCards.forEach((card) => {
        const q = card.querySelector(".faq-in-q").value.trim();
        const a = card.querySelector(".faq-in-a").value.trim();
        if (q || a) faqs.push({ q, a });
      });
      config.atlasHelp.faqs = faqs;
    }
  }

  /* ---- Collect All Config From Forms ---- */
  function collectAllFromForms() {
    config.theme = readThemeInputs();
    config.announcement = {
      enabled: document.getElementById("ann-enabled").checked,
      text: document.getElementById("ann-text").value.trim(),
      linkText: document.getElementById("ann-linkText").value.trim(),
      linkUrl: document.getElementById("ann-linkUrl").value.trim(),
      bgColor: document.getElementById("ann-bg-hex").value.trim() || "#7c3aed",
    };
    config.seo = {
      metaTitle: document.getElementById("seo-title").value.trim(),
      metaDescription: document.getElementById("seo-desc").value.trim(),
      keywords: document.getElementById("seo-keywords").value.trim(),
      ogImage: document.getElementById("seo-ogImage").value.trim(),
    };
    config.analytics = {
      goatcounterCode: document.getElementById("int-goatcounter").value.trim(),
      cloudflareToken: document.getElementById("int-cloudflare").value.trim(),
      web3formsAccessKey: document.getElementById("int-web3forms").value.trim(),
    };
    syncYouTubeVideosFromDom();
    config.site = {
      ...(config.site || {}),
      brandName: document.getElementById("f-brandName").value.trim() || "REDA DEV",
      owner: document.getElementById("f-owner").value.trim() || "Reda6Dev",
      siteUrl: SITE_BASE_URL,
      heroBadge: document.getElementById("f-heroBadge").value.trim(),
      heroTitle: document.getElementById("f-heroTitle").value.trim(),
      heroSubtitle: document.getElementById("f-heroSubtitle").value.trim(),
      bio: document.getElementById("f-bio").value.trim(),
      githubUrl: document.getElementById("f-githubUrl").value.trim(),
      youtubeUrl: document.getElementById("f-youtubeUrl").value.trim(),
      youtubeHandle: document.getElementById("f-youtubeHandle").value.trim(),
      youtubeChannelName: document.getElementById("f-youtubeChannelName").value.trim() || "REDA DEV",
      youtubeFeaturedVideoId:
        extractYouTubeId(document.getElementById("f-youtubeFeaturedVideoId").value) ||
        document.getElementById("f-youtubeFeaturedVideoId").value.trim(),
      youtubeDescription: document.getElementById("f-youtubeDescription").value.trim(),
    };
    syncAppsFromDom();
    syncToolsFromDom();
    syncAtlasHelpFromDom();
    return config;
  }

  /* ---- Live Preview Modal (works over HTTP(S) AND file://) ---- */
  function buildStandalonePreviewHtml(draft) {
    const t = draft.theme || DEFAULT_THEME;
    const s = draft.site || {};
    const ann = draft.announcement || {};
    const apps = (draft.androidApps || []).filter((a) => a.visible !== false);
    const tools = (draft.desktopTools || []).filter((x) => x.visible !== false);
    const annHtml =
      ann.enabled && ann.text
        ? `<div class="announcement-bar" style="--announcement-bg:${escapeHtml(ann.bgColor || "#7c3aed")}"><div class="container announcement-inner"><span class="announcement-text">${escapeHtml(ann.text)}</span>${ann.linkText ? `<span class="announcement-link">${escapeHtml(ann.linkText)}</span>` : ""}</div></div>`
        : "";
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><base href="${SITE_BASE_URL}/"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="style.css"><style>:root{--bg:${escapeHtml(t.bg || "#0b0f19")};--accent:${escapeHtml(t.accent || "#8b5cf6")};--accent-strong:${escapeHtml(t.accent || "#8b5cf6")};--emerald:${escapeHtml(t.emerald || "#10b981")};}</style></head><body><div class="preview-banner">معاينة حيّة للمسودة من لوحة التحكم — التعديلات لم تُنشر بعد</div>${annHtml}<header class="navbar"><div class="container nav-inner"><span class="brand"><span class="brand-mark">R</span><span class="brand-text">${escapeHtml(s.brandName || "REDA DEV")}</span></span></div></header><section class="hero"><div class="container hero-inner"><div class="hero-badge">${escapeHtml(s.heroBadge || "")}</div><h1 class="hero-title">${escapeHtml(s.heroTitle || "")}</h1><p class="hero-subtitle">${escapeHtml(s.heroSubtitle || "")}</p><div class="hero-stats"><div class="stat-card"><span class="stat-value">${apps.length}</span><span class="stat-label">تطبيقات ظاهرة</span></div><div class="stat-card"><span class="stat-value">${tools.length}</span><span class="stat-label">أداة ظاهرة</span></div></div></div></section><section class="section"><div class="container"><h2 class="section-title">التطبيقات المعروضة (${apps.length})</h2><div class="apps-grid">${apps.map((a) => `<article class="app-card glass-card"><div class="app-info"><div class="app-header">${a.icon ? `<img class="app-icon" src="${escapeHtml(a.icon)}">` : ""}<div><h3 class="app-name">${escapeHtml(a.name)}</h3><p class="app-tagline">${escapeHtml(a.tagline || "")}</p></div></div><p class="app-desc">${escapeHtml(a.description || "")}</p></div></article>`).join("")}</div><h2 class="section-title" style="margin-top:36px;">الأدوات المعروضة (${tools.length})</h2><div class="tools-grid">${tools.map((x) => `<article class="tool-card glass-card"><div class="tool-top"><h3 class="tool-name">${escapeHtml(x.name)}</h3><span class="version-badge">${escapeHtml(x.fallbackVersion || "")}</span></div><p class="tool-desc">${escapeHtml(x.description || "")}</p></article>`).join("")}</div></div></section></body></html>`;
  }

  function openLivePreview() {
    const draft = collectAllFromForms();
    const modal = document.getElementById("preview-modal");
    const frame = document.getElementById("preview-iframe");
    if (IS_FILE_PROTOCOL) {
      frame.removeAttribute("src");
      frame.srcdoc = buildStandalonePreviewHtml(draft);
    } else {
      try {
        localStorage.setItem(PREVIEW_KEY, JSON.stringify(draft));
      } catch (_) {}
      frame.removeAttribute("srcdoc");
      frame.src = `index.html?preview=1&t=${Date.now()}`;
    }
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  /* ---- Tab 4: Media Manager (HTML5 Canvas Compressor + GitHub Upload + Browser) ---- */
  function processImageWithCanvas(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("يرجى اختيار ملف صورة صالح.", true);
      return;
    }
    const format = document.getElementById("media-format").value || "image/webp";
    const maxWidth = Number(document.getElementById("media-maxwidth").value) || 0;
    const quality = Number(document.getElementById("media-quality").value) || 0.82;

    const extMap = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
    const ext = extMap[format] || "webp";
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").toLowerCase() || `image-${Date.now()}`;
    document.getElementById("media-filename").value = `${baseName}.${ext}`;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (maxWidth > 0 && w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              showToast("تعذّر ضغط الصورة في المتصفح.", true);
              return;
            }
            pendingMediaBlob = blob;
            pendingMediaDataUrl = URL.createObjectURL(blob);
            document.getElementById("media-preview-img").src = pendingMediaDataUrl;
            document.getElementById("media-size-info").innerHTML =
              `الحجم الأصلي: <strong>${formatSize(file.size)}</strong> ← بعد الضغط: <strong style="color:#6ee7b7;">${formatSize(blob.size)}</strong> (${w}×${h})`;
            document.getElementById("media-preview-area").style.display = "block";
          },
          format,
          quality
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function uploadPendingMedia() {
    const token = getSavedToken();
    if (!token) {
      showToast("يرجى إدخال رمز GitHub Token في تبويب «الأمان» أولاً.", true);
      return;
    }
    if (!pendingMediaBlob) {
      showToast("اختر صورة أولاً للرفع.", true);
      return;
    }
    let name = document.getElementById("media-filename").value.trim().replace(/^\/+/, "");
    name = name.replace(/[^a-zA-Z0-9._-]/g, "-");
    if (!name) {
      showToast("اكتب اسم ملف صالحاً بالإنجليزية.", true);
      return;
    }

    const btn = document.getElementById("btn-upload-media");
    btn.disabled = true;
    btn.textContent = "جاري الرفع...";

    try {
      const targetPath = `assets/uploads/${name}`;
      const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetPath}`;

      let sha;
      const checkRes = await fetch(apiUrl, { headers: authHeaders() });
      if (checkRes.ok) {
        const meta = await checkRes.json();
        sha = meta.sha;
      }

      const buf = await pendingMediaBlob.arrayBuffer();
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          message: `Upload media asset ${name}`,
          content: arrayBufferToBase64(buf),
          branch: "main",
          ...(sha ? { sha } : {}),
        }),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${putRes.status}`);
      }

      const fullUrl = `${SITE_BASE_URL}/${targetPath}`;
      const resBox = document.getElementById("media-uploaded-result");
      resBox.style.display = "block";
      resBox.innerHTML = `
        <strong>تم رفع الصورة بنجاح!</strong>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <code class="ltr-inline">${escapeHtml(targetPath)}</code>
          <button type="button" class="btn btn-secondary btn-sm copy-btn" data-copy="${escapeHtml(targetPath)}">نسخ المسار النسبي</button>
          <button type="button" class="btn btn-primary btn-sm copy-btn" data-copy="${escapeHtml(fullUrl)}">نسخ الرابط الكامل</button>
        </div>
      `;
      bindCopyButtons(resBox);
      showToast(`تم رفع ${name} إلى assets/uploads/.`);
      document.getElementById("media-folder-select").value = "assets/uploads";
      loadMediaGallery();
    } catch (err) {
      showToast(`فشل رفع الصورة: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "رفع الصورة إلى GitHub الآن";
    }
  }

  function bindCopyButtons(scopeEl) {
    scopeEl.querySelectorAll(".copy-btn").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          showToast("تم نسخ الرابط بنجاح.");
        } catch (_) {
          showToast("تعذّر النسخ التلقائي، يمكنك النسخ يدوياً.", true);
        }
      });
    });
  }

  async function loadMediaGallery() {
    const folder = document.getElementById("media-folder-select").value;
    const grid = document.getElementById("media-gallery-grid");
    grid.innerHTML = `<div class="muted">جاري قراءة محتويات ${escapeHtml(folder)}...</div>`;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${folder}?ref=main`, {
        headers: authHeaders(),
      });
      if (res.status === 404) {
        grid.innerHTML = `<div class="muted">المجلد فارغ أو لم يُنشأ بعد — سيتكوّن تلقائياً عند رفع أول صورة.</div>`;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      const files = (Array.isArray(items) ? items : []).filter((it) => it.type === "file" && /\.(png|jpe?g|webp|gif|svg)$/i.test(it.name));
      if (!files.length) {
        grid.innerHTML = `<div class="muted">لا توجد صور في هذا المجلد حالياً.</div>`;
        return;
      }
      grid.innerHTML = files
        .map((f) => {
          const relPath = f.path;
          const fullUrl = `${SITE_BASE_URL}/${relPath}`;
          return `
            <div class="media-card">
              <img src="${escapeHtml(f.download_url || fullUrl)}" alt="${escapeHtml(f.name)}" loading="lazy">
              <div class="media-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="btn btn-secondary btn-sm copy-btn" style="flex:1;" data-copy="${escapeHtml(relPath)}">نسخ المسار</button>
                <button type="button" class="btn btn-primary btn-sm copy-btn" style="flex:1;" data-copy="${escapeHtml(fullUrl)}">الرابط</button>
              </div>
            </div>
          `;
        })
        .join("");
      bindCopyButtons(grid);
    } catch (err) {
      grid.innerHTML = `<div class="muted">تعذّر عرض المجلد (${escapeHtml(err.message)}).</div>`;
    }
  }

  /* ---- Tab 5: Release Publisher (GitHub Releases + Asset XHR Upload) ---- */
  function populateReleaseRepoSelect() {
    if (!config) return;
    const sel = document.getElementById("rel-repo-select");
    const repos = [
      ...(config.androidApps || []).map((a) => ({ name: a.name, repo: a.repo })),
      ...(config.desktopTools || []).map((t) => ({ name: t.name, repo: t.repo })),
    ].filter((x) => x.repo && x.repo.includes("/"));
    sel.innerHTML = repos.map((r) => `<option value="${escapeHtml(r.repo)}">${escapeHtml(r.name)} (${escapeHtml(r.repo)})</option>`).join("");
    updateReleaseLink();
  }

  function getSelectedReleaseRepo() {
    const custom = document.getElementById("rel-repo-custom").value.trim();
    return custom || document.getElementById("rel-repo-select").value;
  }

  function updateReleaseLink() {
    const repo = getSelectedReleaseRepo();
    const link = document.getElementById("rel-github-page-link");
    if (repo) link.href = `https://github.com/${repo}/releases`;
  }

  async function loadExistingReleasesForRepo() {
    const repo = getSelectedReleaseRepo();
    const sel = document.getElementById("rel-existing-select");
    if (!repo) return;
    sel.innerHTML = `<option>جاري الجلب...</option>`;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=15`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) {
        sel.innerHTML = `<option value="">لا توجد إصدارات سابقة في هذا المستودع</option>`;
        return;
      }
      sel.innerHTML = list
        .map((r) => `<option value="${escapeHtml(r.upload_url)}">${escapeHtml(r.tag_name)} — ${escapeHtml(r.name || "")}</option>`)
        .join("");
    } catch (err) {
      sel.innerHTML = `<option value="">تعذّر الجلب (${escapeHtml(err.message)})</option>`;
    }
  }

  function uploadAssetViaXhr(uploadUrlTemplate, file, token, onProgress) {
    return new Promise((resolve, reject) => {
      const cleanUrl = `${uploadUrlTemplate.replace(/\{.*$/, "")}?name=${encodeURIComponent(file.name)}`;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", cleanUrl, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Accept", "application/vnd.github+json");
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && typeof onProgress === "function") {
          onProgress(ev.loaded, ev.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed.message) msg = parsed.message;
          } catch (_) {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("تعذّر الاتصال بخادم رفع الملفات (uploads.github.com)"));
      xhr.send(file);
    });
  }

  async function publishReleaseNow() {
    const token = getSavedToken();
    if (!token) {
      showToast("يرجى حفظ رمز GitHub Token بصلاحية public_repo أولاً.", true);
      return;
    }
    const repo = getSelectedReleaseRepo();
    if (!repo || !repo.includes("/")) {
      showToast("اختر أو اكتب مسار المستودع بصيغة owner/repo.", true);
      return;
    }

    const files = Array.from(document.getElementById("rel-files").files || []);
    const btn = document.getElementById("btn-publish-release");
    const progWrap = document.getElementById("rel-progress-area");
    const progText = document.getElementById("rel-progress-text");
    const progBar = document.getElementById("rel-progress-bar");
    const resBox = document.getElementById("rel-result-box");

    btn.disabled = true;
    btn.textContent = "جاري النشر...";
    resBox.style.display = "none";

    let createdReleaseUrl = `https://github.com/${repo}/releases`;
    try {
      let uploadUrl = "";
      let releaseTag = "";
      if (releaseMode === "new") {
        releaseTag = document.getElementById("rel-tag").value.trim();
        const relName = document.getElementById("rel-name").value.trim() || releaseTag;
        const relBody = document.getElementById("rel-body").value.trim();
        const prerelease = document.getElementById("rel-prerelease").checked;
        const draft = document.getElementById("rel-draft").checked;
        if (!releaseTag) throw new Error("أدخل رقم الإصدار (Tag) أولاً.");

        progWrap.style.display = "block";
        progText.textContent = `جاري إنشاء الإصدار ${releaseTag} على ${repo}...`;
        progBar.style.width = "10%";

        const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            tag_name: releaseTag,
            name: relName,
            body: relBody,
            draft,
            prerelease,
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.message || `فشل إنشاء الإصدار (${createRes.status})`);
        }
        const relData = await createRes.json();
        uploadUrl = relData.upload_url;
        createdReleaseUrl = relData.html_url || createdReleaseUrl;
      } else {
        uploadUrl = document.getElementById("rel-existing-select").value;
        if (!uploadUrl) throw new Error("اختر إصداراً موجوداً أو اضغط «جلب الإصدارات» أولاً.");
        if (!files.length) throw new Error("اختر ملفاً واحداً على الأقل لرفعه.");
      }

      const uploadedAssets = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        progWrap.style.display = "block";
        const asset = await uploadAssetViaXhr(uploadUrl, f, token, (loaded, total) => {
          const pct = Math.round((loaded / Math.max(1, total)) * 100);
          progBar.style.width = `${pct}%`;
          progText.textContent = `رفع ملف (${i + 1}/${files.length}): ${f.name} — ${pct}% (${formatSize(loaded)} / ${formatSize(total)})`;
        });
        uploadedAssets.push(asset.name || f.name);
      }

      progBar.style.width = "100%";
      progText.textContent = "اكتمل نشر الإصدار بنجاح!";

      if (releaseMode === "new" && releaseTag && document.getElementById("rel-sync-fallback").checked) {
        let touched = false;
        (config.androidApps || []).forEach((a) => {
          if (a.repo === repo) {
            a.fallbackVersion = releaseTag;
            touched = true;
          }
        });
        (config.desktopTools || []).forEach((t) => {
          if (t.repo === repo) {
            t.fallbackVersion = releaseTag;
            touched = true;
          }
        });
        if (touched) {
          renderAppsEditor();
          renderToolsEditor();
          await publishToGitHub(`Update fallbackVersion for ${repo} to ${releaseTag}`);
        }
      }

      resBox.style.display = "block";
      resBox.innerHTML = `
        <strong>تم نشر الإصدار بنجاح على <span class="ltr-inline">${escapeHtml(repo)}</span></strong>
        ${uploadedAssets.length ? `<div>الملفات المرفوعة: <span class="ltr-inline">${escapeHtml(uploadedAssets.join(", "))}</span></div>` : ""}
        <div style="margin-top:8px;"><a href="${escapeHtml(createdReleaseUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">فتح صفحة الإصدار على GitHub</a></div>
      `;
      showToast("تم نشر الإصدار ورفع الملفات بنجاح!");
    } catch (err) {
      resBox.style.display = "block";
      resBox.innerHTML = `
        <strong>تعذّر إكمال رفع الملف:</strong> ${escapeHtml(err.message)}
        <div style="margin-top:8px;"><a href="${escapeHtml(createdReleaseUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">إكمال الرفع يدوياً على GitHub</a></div>
      `;
      showToast(`خطأ في ناشر الإصدارات: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "نشر الإصدار ورفع الملفات";
    }
  }

  /* ---- Tab 8: 1-Click Rollback & GitHub Commits History ---- */
  async function loadCommitsHistory() {
    const box = document.getElementById("commits-history-list");
    box.innerHTML = `<div class="muted">جاري جلب آخر 10 تعديلات لملف site-config.json...</div>`;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?path=${CONFIG_PATH}&per_page=10`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const commits = await res.json();
      if (!Array.isArray(commits) || !commits.length) {
        box.innerHTML = `<div class="muted">لا يوجد سجل تعديلات متاح.</div>`;
        return;
      }

      box.innerHTML = commits
        .map((c, idx) => {
          const sha = c.sha || "";
          const shortSha = sha.slice(0, 7);
          const msg = (c.commit && c.commit.message || "").split("\n")[0];
          const dt = c.commit && c.commit.author && c.commit.author.date
            ? new Date(c.commit.author.date).toLocaleString("ar-EG")
            : "";
          return `
            <div class="commit-row">
              <div class="commit-meta">
                <div><strong>${escapeHtml(msg)}</strong> ${idx === 0 ? '<span class="status-badge visible">الحالية</span>' : ""}</div>
                <div class="muted" style="font-size:0.82rem;">
                  <span class="commit-sha">${escapeHtml(shortSha)}</span> • ${escapeHtml(dt)}
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm btn-load-commit" data-sha="${escapeHtml(sha)}">تحميل للمعاينة</button>
                <button type="button" class="btn btn-emerald btn-sm btn-restore-commit" data-sha="${escapeHtml(sha)}">استعادة هذه النسخة</button>
              </div>
            </div>
          `;
        })
        .join("");

      box.querySelectorAll(".btn-load-commit").forEach((b) =>
        b.addEventListener("click", () => restoreFromCommit(b.dataset.sha, false))
      );
      box.querySelectorAll(".btn-restore-commit").forEach((b) =>
        b.addEventListener("click", () => restoreFromCommit(b.dataset.sha, true))
      );
    } catch (err) {
      box.innerHTML = `<div class="muted">تعذّر جلب سجل التعديلات (${escapeHtml(err.message)}).</div>`;
    }
  }

  async function restoreFromCommit(sha, publishImmediately) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}?ref=${encodeURIComponent(sha)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = await res.json();
      const rawJson = base64ToUtf8(meta.content || "");
      const parsed = JSON.parse(rawJson);
      config = parsed;
      renderAllSections();
      if (publishImmediately) {
        await publishToGitHub(`Restore ${CONFIG_PATH} from ${sha.slice(0, 7)}`);
      } else {
        showToast(`تم تحميل نسخة ${sha.slice(0, 7)} في المحرر — اضغط «معاينة حيّة» أو «حفظ ونشر».`);
      }
    } catch (err) {
      showToast(`تعذّر استعادة النسخة: ${err.message}`, true);
    }
  }

  /* ---- Core Load, Export, Test Token & Publish ---- */
  function downloadConfig() {
    const data = collectAllFromForms();
    const jsonText = JSON.stringify(data, null, 2) + "\n";
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = CONFIG_PATH;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("تم تصدير نسخة احتياطية site-config.json.");
  }

  async function testGitHubConnection() {
    const token = getSavedToken();
    const box = document.getElementById("github-user-info");
    if (!token) {
      showToast("أدخل رمز GitHub Token أولاً للاختبار.", true);
      return;
    }
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const scopes = res.headers.get("x-oauth-scopes") || "Fine-grained / Standard";
      const user = await res.json();
      localStorage.setItem(TOKEN_KEY, token);
      updateTokenStatus();
      box.innerHTML = `
        <div class="user-pill">
          <img src="${escapeHtml(user.avatar_url || "")}" alt="${escapeHtml(user.login || "")}">
          <div>
            <strong>تم الاتصال بنجاح: <span class="ltr-inline">${escapeHtml(user.login || "")}</span></strong>
            <div class="muted" style="font-size:0.82rem;">الصلاحيات: <span class="ltr-inline">${escapeHtml(scopes)}</span></div>
          </div>
        </div>
      `;
      showToast(`تم التحقق من الحساب (${user.login}) بنجاح.`);
      refreshDashboardStats();
      loadMediaGallery();
      loadCommitsHistory();
    } catch (err) {
      box.innerHTML = "";
      showToast(`فشل الاتصال: ${err.message}`, true);
    }
  }

  async function publishToGitHub(customMessage) {
    const token = getSavedToken();
    if (!token) {
      showToast("يرجى إدخال رمز GitHub Token من تبويب «الأمان وسجل التراجع» أولاً.", true);
      return;
    }

    const btn = document.getElementById("btn-publish");
    btn.disabled = true;
    btn.textContent = "جاري النشر...";

    try {
      const data = collectAllFromForms();
      const jsonText = JSON.stringify(data, null, 2) + "\n";
      const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}`;

      const getRes = await fetch(apiUrl, { headers: authHeaders() });
      let sha;
      if (getRes.ok) {
        const meta = await getRes.json();
        sha = meta.sha;
      } else if (getRes.status === 401 || getRes.status === 403) {
        throw new Error("الرمز غير صالح أو لا يملك صلاحية التعديل على المستودع.");
      }

      const commitMsg = typeof customMessage === "string" && customMessage.trim()
        ? customMessage.trim()
        : "Update site configuration";

      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          message: commitMsg,
          content: utf8ToBase64(jsonText),
          branch: "main",
          ...(sha ? { sha } : {}),
        }),
      });

      if (!putRes.ok) {
        const errBody = await putRes.json().catch(() => ({}));
        throw new Error(errBody.message || `فشل النشر (${putRes.status})`);
      }

      localStorage.setItem(TOKEN_KEY, token);
      updateTokenStatus();
      updateLocalDashboardKpis();
      loadCommitsHistory();
      showToast("تم حفظ ونشر التعديلات! سيتحدّث الموقع خلال دقيقة واحدة.");
    } catch (err) {
      showToast(`خطأ أثناء النشر: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "حفظ ونشر التعديلات";
    }
  }

  function renderAllSections() {
    populateSiteAndSettingsForms();
    renderAppsEditor();
    renderToolsEditor();
    renderAtlasHelpEditor();
    updateLocalDashboardKpis();
  }

  async function loadConfig() {
    try {
      if (IS_FILE_PROTOCOL) {
        try {
          const apiRes = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}?ref=main`,
            { headers: authHeaders() }
          );
          if (apiRes.ok) {
            const meta = await apiRes.json();
            config = JSON.parse(base64ToUtf8(meta.content || ""));
          }
        } catch (_) {}
        if (!config) {
          const liveRes = await fetch(`${SITE_BASE_URL}/${CONFIG_PATH}?t=${Date.now()}`, { cache: "no-store" });
          if (!liveRes.ok) throw new Error(`HTTP ${liveRes.status}`);
          config = await liveRes.json();
        }
      } else {
        const res = await fetch(`${CONFIG_PATH}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        config = await res.json();
      }
      renderAllSections();
      refreshDashboardStats();
      loadMediaGallery();
      loadCommitsHistory();
      showToast("تم تحميل بيانات الموقع.");
    } catch (err) {
      showToast(`تعذّر تحميل site-config.json: ${err.message}`, true);
    }
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".admin-tabs .filter-btn");
    const panes = document.querySelectorAll(".tab-pane");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.tab;
        panes.forEach((p) => {
          p.style.display = p.id === target ? "block" : "none";
        });
      });
    });

    document.querySelectorAll(".sub-tabs").forEach((bar) => {
      const subBtns = bar.querySelectorAll(".filter-btn[data-subtab]");
      if (subBtns.length) {
        subBtns.forEach((b) => {
          b.addEventListener("click", () => {
            subBtns.forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            const section = bar.closest("section");
            section.querySelectorAll(".subtab-pane").forEach((sp) => {
              sp.style.display = sp.id === b.dataset.subtab ? "block" : "none";
            });
          });
        });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    bindColorPair("c-bg", "c-bg-hex", () => applyThemePreview(readThemeInputs()));
    bindColorPair("c-accent", "c-accent-hex", () => applyThemePreview(readThemeInputs()));
    bindColorPair("c-emerald", "c-emerald-hex", () => applyThemePreview(readThemeInputs()));
    bindColorPair("ann-bg", "ann-bg-hex", updateAnnouncementPreview);
    updateTokenStatus();
    loadConfig();

    ["ann-enabled", "ann-text", "ann-linkText"].forEach((id) => {
      document.getElementById(id).addEventListener("input", updateAnnouncementPreview);
      document.getElementById(id).addEventListener("change", updateAnnouncementPreview);
    });
    ["seo-title", "seo-desc"].forEach((id) => {
      document.getElementById(id).addEventListener("input", updateSeoPreview);
    });
    document.getElementById("int-web3forms").addEventListener("input", updateWeb3FormsBadge);
    document.getElementById("f-youtubeFeaturedVideoId").addEventListener("input", updateYouTubePreview);

    document.getElementById("btn-reset-colors").addEventListener("click", () => {
      setThemeInputs(DEFAULT_THEME);
      showToast("تمت استعادة الألوان الافتراضية.");
    });

    /* Live Preview */
    document.getElementById("btn-live-preview").addEventListener("click", openLivePreview);
    document.getElementById("btn-live-preview-2").addEventListener("click", openLivePreview);
    document.getElementById("preview-close-btn").addEventListener("click", () => {
      const m = document.getElementById("preview-modal");
      m.classList.remove("open");
      m.setAttribute("aria-hidden", "true");
    });
    document.getElementById("preview-desktop-btn").addEventListener("click", () => {
      document.getElementById("preview-desktop-btn").classList.add("active");
      document.getElementById("preview-mobile-btn").classList.remove("active");
      document.getElementById("preview-iframe").classList.remove("mobile");
    });
    document.getElementById("preview-mobile-btn").addEventListener("click", () => {
      document.getElementById("preview-mobile-btn").classList.add("active");
      document.getElementById("preview-desktop-btn").classList.remove("active");
      document.getElementById("preview-iframe").classList.add("mobile");
    });

    /* Media Dropzone & Compressor */
    const dropzone = document.getElementById("media-dropzone");
    const mediaInput = document.getElementById("media-file-input");
    dropzone.addEventListener("click", () => mediaInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processImageWithCanvas(e.dataTransfer.files[0]);
      }
    });
    mediaInput.addEventListener("change", () => {
      if (mediaInput.files && mediaInput.files[0]) {
        processImageWithCanvas(mediaInput.files[0]);
      }
    });
    document.getElementById("media-quality").addEventListener("input", (e) => {
      document.getElementById("media-quality-val").textContent = e.target.value;
      if (mediaInput.files && mediaInput.files[0]) processImageWithCanvas(mediaInput.files[0]);
    });
    document.getElementById("media-format").addEventListener("change", () => {
      if (mediaInput.files && mediaInput.files[0]) processImageWithCanvas(mediaInput.files[0]);
    });
    document.getElementById("media-maxwidth").addEventListener("change", () => {
      if (mediaInput.files && mediaInput.files[0]) processImageWithCanvas(mediaInput.files[0]);
    });
    document.getElementById("btn-upload-media").addEventListener("click", uploadPendingMedia);
    document.getElementById("btn-refresh-media").addEventListener("click", loadMediaGallery);
    document.getElementById("media-folder-select").addEventListener("change", loadMediaGallery);

    /* Release Publisher */
    document.querySelectorAll("[data-relmode]").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("[data-relmode]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        releaseMode = b.dataset.relmode;
        document.getElementById("rel-new-box").style.display = releaseMode === "new" ? "block" : "none";
        document.getElementById("rel-existing-box").style.display = releaseMode === "existing" ? "block" : "none";
        if (releaseMode === "existing") loadExistingReleasesForRepo();
      });
    });
    document.getElementById("rel-repo-select").addEventListener("change", () => {
      updateReleaseLink();
      if (releaseMode === "existing") loadExistingReleasesForRepo();
    });
    document.getElementById("rel-repo-custom").addEventListener("input", updateReleaseLink);
    document.getElementById("btn-load-existing-rels").addEventListener("click", loadExistingReleasesForRepo);
    document.getElementById("rel-files").addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      document.getElementById("rel-files-summary").textContent = files.length
        ? files.map((f) => `${f.name} (${formatSize(f.size)})`).join(" • ")
        : "لم يتم اختيار ملفات بعد.";
    });
    document.getElementById("btn-publish-release").addEventListener("click", publishReleaseNow);

    /* Token Controls */
    document.getElementById("btn-toggle-token").addEventListener("click", () => {
      const inp = document.getElementById("gh-token");
      inp.type = inp.type === "password" ? "text" : "password";
    });
    document.getElementById("btn-save-token").addEventListener("click", () => {
      const val = document.getElementById("gh-token").value.trim();
      if (!val) {
        showToast("أدخل الرمز أولاً.", true);
        return;
      }
      localStorage.setItem(TOKEN_KEY, val);
      updateTokenStatus();
      showToast("تم حفظ الرمز محلياً في متصفحك.");
    });
    document.getElementById("btn-test-token").addEventListener("click", testGitHubConnection);
    document.getElementById("btn-clear-token").addEventListener("click", () => {
      localStorage.removeItem(TOKEN_KEY);
      document.getElementById("github-user-info").innerHTML = "";
      updateTokenStatus();
      showToast("تم مسح الرمز من المتصفح.");
    });

    /* Add Item Buttons */
    document.getElementById("btn-add-app").addEventListener("click", () => {
      syncAppsFromDom();
      config.androidApps = config.androidApps || [];
      config.androidApps.push({
        id: `app-${Date.now()}`,
        visible: true,
        name: "تطبيق جديد",
        tagline: "",
        description: "",
        repo: "Reda6Dev/",
        pageUrl: "",
        icon: "",
        fallbackVersion: "v1.0.0",
        features: ["ميزة أولى"],
        screenshots: [],
      });
      renderAppsEditor();
      updateLocalDashboardKpis();
    });

    document.getElementById("btn-add-tool").addEventListener("click", () => {
      syncToolsFromDom();
      config.desktopTools = config.desktopTools || [];
      config.desktopTools.push({
        id: `tool-${Date.now()}`,
        visible: true,
        name: "New Tool",
        category: "أدوات النظام والتطوير",
        icon: "🛠️",
        iconImg: "",
        description: "",
        repo: "Reda6Dev/",
        fallbackVersion: "v1.0.0",
        tags: ["Windows"],
      });
      renderToolsEditor();
      updateLocalDashboardKpis();
    });

    document.getElementById("btn-add-yt-video").addEventListener("click", () => {
      syncYouTubeVideosFromDom();
      if (!config.site) config.site = {};
      config.site.youtubeVideos = config.site.youtubeVideos || [];
      config.site.youtubeVideos.push({ title: "", url: "", id: "" });
      renderYouTubeVideosEditor();
    });

    document.getElementById("btn-add-help-sec").addEventListener("click", () => {
      syncAtlasHelpFromDom();
      if (!config.atlasHelp) config.atlasHelp = { sections: [], faqs: [] };
      config.atlasHelp.sections.push({
        id: `help-section-${Date.now()}`,
        title: "قسم مساعدة جديد",
        icon: "📘",
        summary: "",
        items: ["نقطة شرح أولى"],
      });
      renderAtlasHelpEditor();
      updateLocalDashboardKpis();
    });

    document.getElementById("btn-add-faq").addEventListener("click", () => {
      syncAtlasHelpFromDom();
      if (!config.atlasHelp) config.atlasHelp = { sections: [], faqs: [] };
      config.atlasHelp.faqs.push({ q: "سؤال جديد؟", a: "الإجابة هنا." });
      renderAtlasHelpEditor();
      updateLocalDashboardKpis();
    });

    /* Backup Import / Export / Refresh / Publish */
    document.getElementById("import-json-input").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed.site || !Array.isArray(parsed.androidApps)) {
            throw new Error("ملف JSON لا يطابق بنية الموقع.");
          }
          config = parsed;
          renderAllSections();
          showToast("تم استيراد النسخة الاحتياطية بنجاح! اضغط «حفظ ونشر» لتطبيقها على الموقع.");
        } catch (err) {
          showToast(`تعذّر قراءة الملف: ${err.message}`, true);
        }
      };
      reader.readAsText(file, "utf-8");
      e.target.value = "";
    });

    document.getElementById("btn-refresh-stats").addEventListener("click", refreshDashboardStats);
    document.getElementById("btn-load-commits").addEventListener("click", loadCommitsHistory);
    document.getElementById("btn-reload").addEventListener("click", loadConfig);
    document.getElementById("btn-download").addEventListener("click", downloadConfig);
    document.getElementById("btn-export-json").addEventListener("click", downloadConfig);
    document.getElementById("btn-publish").addEventListener("click", () => publishToGitHub());
  });
})();
