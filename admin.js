(function () {
  "use strict";

  const REPO_OWNER = "Reda6Dev";
  const REPO_NAME = "Reda6Dev.github.io";
  const CONFIG_PATH = "site-config.json";
  const TOKEN_KEY = "reda6dev_gh_token";
  const DEFAULT_THEME = { bg: "#0b0f19", accent: "#8b5cf6", emerald: "#10b981" };

  let config = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(msg, isError = false) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 4200);
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

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
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

  function bindColorPair(colorId, hexId) {
    const picker = document.getElementById(colorId);
    const hex = document.getElementById(hexId);
    picker.addEventListener("input", () => {
      hex.value = picker.value;
      applyThemePreview(readThemeInputs());
    });
    hex.addEventListener("input", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) {
        picker.value = hex.value.trim();
        applyThemePreview(readThemeInputs());
      }
    });
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

  function moveItem(arr, index, delta) {
    const target = index + delta;
    if (!Array.isArray(arr) || target < 0 || target >= arr.length) return;
    const [item] = arr.splice(index, 1);
    arr.splice(target, 0, item);
  }

  function updateTokenStatus() {
    const token = localStorage.getItem(TOKEN_KEY) || "";
    const status = document.getElementById("token-status");
    const input = document.getElementById("gh-token");
    if (token) {
      input.value = token;
      status.textContent = "الرمز محفوظ محلياً في متصفحك وجاهز للنشر المباشر.";
      status.style.color = "#6ee7b7";
    } else {
      input.value = "";
      status.textContent = "لم يتم حفظ رمز بعد. أنشئ رمزاً عبر الزر أعلاه ثم الصقه هنا.";
      status.style.color = "#9ca3af";
    }
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
      box.innerHTML = `<small class="muted">لا يوجد معرف فيديو رئيسي حالياً — سيعرض الموقع بطاقة قناة @rk2003 أو الفيديوهات المضافة بالأسفل.</small>`;
    }
  }

  function populateSiteAndYouTubeForms() {
    const s = config.site || {};
    document.getElementById("f-brandName").value = s.brandName || "REDA DEV";
    document.getElementById("f-owner").value = s.owner || "Reda6Dev";
    document.getElementById("f-heroBadge").value = s.heroBadge || "";
    document.getElementById("f-heroTitle").value = s.heroTitle || "";
    document.getElementById("f-heroSubtitle").value = s.heroSubtitle || "";
    document.getElementById("f-bio").value = s.bio || "";
    document.getElementById("f-githubUrl").value = s.githubUrl || "https://github.com/Reda6Dev";

    document.getElementById("f-youtubeUrl").value = s.youtubeUrl || "https://www.youtube.com/@rk2003";
    document.getElementById("f-youtubeHandle").value = s.youtubeHandle || "@rk2003";
    document.getElementById("f-youtubeChannelName").value = s.youtubeChannelName || "REDA DEV";
    document.getElementById("f-youtubeFeaturedVideoId").value = s.youtubeFeaturedVideoId || "";
    document.getElementById("f-youtubeDescription").value = s.youtubeDescription || "";

    setThemeInputs(config.theme);
    updateYouTubePreview();
    renderYouTubeVideosEditor();
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

  /* ---- Android Apps Editor ---- */
  function renderAppsEditor() {
    const list = document.getElementById("admin-apps-list");
    const apps = config.androidApps || [];
    if (!apps.length) {
      list.innerHTML = `<p class="muted">لا توجد تطبيقات بعد. اضغط «+ إضافة تطبيق جديد».</p>`;
      return;
    }

    list.innerHTML = apps
      .map((app, i) => {
        const featuresText = (app.features || []).join("\n");
        const shotsText = (app.screenshots || [])
          .map((sh) => (sh.caption ? `${sh.url} | ${sh.caption}` : sh.url))
          .join("\n");

        return `
          <div class="admin-item-card" data-app-index="${i}">
            <div class="admin-item-head">
              <div style="display:flex;align-items:center;gap:10px;">
                ${app.icon ? `<img src="${escapeHtml(app.icon)}" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">` : ""}
                <h3>${escapeHtml(app.name || `تطبيق #${i + 1}`)}</h3>
              </div>
              <div class="admin-item-controls">
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

  /* ---- Desktop Tools Editor ---- */
  function renderToolsEditor() {
    const list = document.getElementById("admin-tools-list");
    const tools = config.desktopTools || [];
    if (!tools.length) {
      list.innerHTML = `<p class="muted">لا توجد أدوات بعد. اضغط «+ إضافة أداة جديدة».</p>`;
      return;
    }

    list.innerHTML = tools
      .map((tool, i) => {
        const tagsStr = (tool.tags || []).join(", ");
        const cat = tool.category || "أدوات النظام والتطوير";
        return `
          <div class="admin-item-card" data-tool-index="${i}">
            <div class="admin-item-head">
              <div style="display:flex;align-items:center;gap:10px;">
                ${tool.iconImg ? `<img src="${escapeHtml(tool.iconImg)}" alt="" style="width:28px;height:28px;border-radius:6px;object-fit:contain;">` : `<span>${escapeHtml(tool.icon || "🛠️")}</span>`}
                <h3>${escapeHtml(tool.name || `أداة #${i + 1}`)}</h3>
              </div>
              <div class="admin-item-controls">
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

  function collectAllFromForms() {
    config.theme = readThemeInputs();
    syncYouTubeVideosFromDom();
    config.site = {
      ...(config.site || {}),
      brandName: document.getElementById("f-brandName").value.trim() || "REDA DEV",
      owner: document.getElementById("f-owner").value.trim() || "Reda6Dev",
      siteUrl: "https://reda6dev.github.io",
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
    const token = (document.getElementById("gh-token").value || localStorage.getItem(TOKEN_KEY) || "").trim();
    const box = document.getElementById("github-user-info");
    if (!token) {
      showToast("أدخل رمز GitHub Token أولاً للاختبار.", true);
      return;
    }
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const user = await res.json();
      localStorage.setItem(TOKEN_KEY, token);
      updateTokenStatus();
      box.innerHTML = `
        <div class="user-pill">
          <img src="${escapeHtml(user.avatar_url || "")}" alt="${escapeHtml(user.login || "")}">
          <div>
            <strong>تم الاتصال بنجاح: <span class="ltr-inline">${escapeHtml(user.login || "")}</span></strong>
            <div class="muted" style="font-size:0.82rem;">${escapeHtml(user.name || "جاهز للنشر المباشر")}</div>
          </div>
        </div>
      `;
      showToast(`تم التحقق من الحساب (${user.login}) بنجاح.`);
    } catch (err) {
      box.innerHTML = "";
      showToast(`فشل الاتصال: ${err.message}`, true);
    }
  }

  async function publishToGitHub() {
    const token = (document.getElementById("gh-token").value || localStorage.getItem(TOKEN_KEY) || "").trim();
    if (!token) {
      showToast("يرجى إدخال رمز GitHub Token من تبويب «الربط السريع» أولاً.", true);
      return;
    }

    const btn = document.getElementById("btn-publish");
    btn.disabled = true;
    btn.textContent = "جاري النشر...";

    try {
      const data = collectAllFromForms();
      const jsonText = JSON.stringify(data, null, 2) + "\n";
      const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}`;

      const getRes = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      let sha;
      if (getRes.ok) {
        const meta = await getRes.json();
        sha = meta.sha;
      } else if (getRes.status === 401 || getRes.status === 403) {
        throw new Error("الرمز غير صالح أو لا يملك صلاحية التعديل على المستودع.");
      }

      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Update site configuration",
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
      showToast("تم حفظ ونشر التعديلات! سيتحدّث الموقع خلال دقيقة واحدة.");
    } catch (err) {
      showToast(`خطأ أثناء النشر: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "حفظ ونشر التعديلات";
    }
  }

  function renderAllSections() {
    populateSiteAndYouTubeForms();
    renderAppsEditor();
    renderToolsEditor();
    renderAtlasHelpEditor();
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${CONFIG_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      config = await res.json();
      renderAllSections();
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
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    bindColorPair("c-bg", "c-bg-hex");
    bindColorPair("c-accent", "c-accent-hex");
    bindColorPair("c-emerald", "c-emerald-hex");
    updateTokenStatus();
    loadConfig();

    document.getElementById("f-youtubeFeaturedVideoId").addEventListener("input", updateYouTubePreview);

    document.getElementById("btn-reset-colors").addEventListener("click", () => {
      setThemeInputs(DEFAULT_THEME);
      showToast("تمت استعادة الألوان الافتراضية.");
    });

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

    document.getElementById("btn-add-app").addEventListener("click", () => {
      syncAppsFromDom();
      config.androidApps = config.androidApps || [];
      config.androidApps.push({
        id: `app-${Date.now()}`,
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
    });

    document.getElementById("btn-add-tool").addEventListener("click", () => {
      syncToolsFromDom();
      config.desktopTools = config.desktopTools || [];
      config.desktopTools.push({
        id: `tool-${Date.now()}`,
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
    });

    document.getElementById("btn-add-faq").addEventListener("click", () => {
      syncAtlasHelpFromDom();
      if (!config.atlasHelp) config.atlasHelp = { sections: [], faqs: [] };
      config.atlasHelp.faqs.push({ q: "سؤال جديد؟", a: "الإجابة هنا." });
      renderAtlasHelpEditor();
    });

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

    document.getElementById("btn-reload").addEventListener("click", loadConfig);
    document.getElementById("btn-download").addEventListener("click", downloadConfig);
    document.getElementById("btn-export-json").addEventListener("click", downloadConfig);
    document.getElementById("btn-publish").addEventListener("click", publishToGitHub);
  });
})();
