(function () {
  "use strict";

  const REPO_OWNER = "Reda6Dev";
  const REPO_NAME = "Reda6Dev.github.io";
  const CONFIG_PATH = "site-config.json";
  const TOKEN_KEY = "reda6dev_gh_token";

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
      status.textContent = "لم يتم حفظ رمز بعد. يمكنك حفظ الرمز أو استخدام زر تحميل site-config.json.";
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
        <div class="yt-aspect" style="max-width:560px;">
          <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(vid)}?rel=0" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    } else {
      box.innerHTML = `<small class="muted">لا يوجد معرف فيديو محدد حالياً — سيعرض الموقع بطاقة قناة @rk2003.</small>`;
    }
  }

  function populateSiteForm() {
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
    document.getElementById("f-youtubeFeaturedVideoId").value = s.youtubeFeaturedVideoId || "";
    document.getElementById("f-youtubeDescription").value = s.youtubeDescription || "";
    updateYouTubePreview();
  }

  function renderAppsEditor() {
    const list = document.getElementById("admin-apps-list");
    const apps = config.androidApps || [];
    if (!apps.length) {
      list.innerHTML = `<p class="muted">لا توجد تطبيقات بعد. اضغط على «+ إضافة تطبيق جديد».</p>`;
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
              <h3>${escapeHtml(app.name || `تطبيق #${i + 1}`)}</h3>
              <button type="button" class="btn btn-danger btn-sm btn-del-app" data-index="${i}">حذف التطبيق</button>
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
              <div class="form-field full">
                <label>وصف مختصر (Tagline)</label>
                <input type="text" class="input app-in-tagline" value="${escapeHtml(app.tagline || "")}">
              </div>
              <div class="form-field full">
                <label>الوصف الكامل</label>
                <textarea class="textarea app-in-desc">${escapeHtml(app.description || "")}</textarea>
              </div>
              <div class="form-field">
                <label>رابط الأيقونة (اختياري)</label>
                <input type="text" class="input input-ltr app-in-icon" value="${escapeHtml(app.icon || "")}" placeholder="assets/screenshots/...">
              </div>
              <div class="form-field">
                <label>رقم الإصدار الاحتياطي</label>
                <input type="text" class="input input-ltr app-in-ver" value="${escapeHtml(app.fallbackVersion || "")}" placeholder="v1.0.0">
              </div>
              <div class="form-field">
                <label>المميزات (كل ميزة في سطر مستقل)</label>
                <textarea class="textarea app-in-features">${escapeHtml(featuresText)}</textarea>
              </div>
              <div class="form-field">
                <label>روابط لقطات الشاشة (كل صورة في سطر: الرابط | التعليق)</label>
                <textarea class="textarea input-ltr app-in-shots">${escapeHtml(shotsText)}</textarea>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".btn-del-app").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncAppsFromDom();
        const idx = Number(btn.dataset.index);
        config.androidApps.splice(idx, 1);
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
      const tagline = card.querySelector(".app-in-tagline").value.trim();
      const description = card.querySelector(".app-in-desc").value.trim();
      const icon = card.querySelector(".app-in-icon").value.trim();
      const fallbackVersion = card.querySelector(".app-in-ver").value.trim();
      const features = card
        .querySelector(".app-in-features")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const screenshots = card
        .querySelector(".app-in-shots")
        .value.split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("|");
          return {
            url: (parts[0] || "").trim(),
            caption: (parts[1] || "").trim(),
          };
        });

      updated.push({
        id: prev.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `app-${idx + 1}`,
        name,
        tagline,
        description,
        repo,
        icon,
        fallbackVersion,
        features,
        screenshots,
      });
    });
    config.androidApps = updated;
  }

  function renderToolsEditor() {
    const list = document.getElementById("admin-tools-list");
    const tools = config.desktopTools || [];
    if (!tools.length) {
      list.innerHTML = `<p class="muted">لا توجد أدوات بعد. اضغط على «+ إضافة أداة جديدة».</p>`;
      return;
    }

    list.innerHTML = tools
      .map((tool, i) => {
        const tagsStr = (tool.tags || []).join(", ");
        const cat = tool.category || "أدوات النظام والتطوير";
        return `
          <div class="admin-item-card" data-tool-index="${i}">
            <div class="admin-item-head">
              <h3>${escapeHtml(tool.icon || "🛠️")} ${escapeHtml(tool.name || `أداة #${i + 1}`)}</h3>
              <button type="button" class="btn btn-danger btn-sm btn-del-tool" data-index="${i}">حذف الأداة</button>
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
                <label>الأيقونة (رمز تعبيري)</label>
                <input type="text" class="input tool-in-icon" value="${escapeHtml(tool.icon || "🛠️")}">
              </div>
              <div class="form-field">
                <label>الإصدار الاحتياطي</label>
                <input type="text" class="input input-ltr tool-in-ver" value="${escapeHtml(tool.fallbackVersion || "")}">
              </div>
              <div class="form-field">
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

    list.querySelectorAll(".btn-del-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        syncToolsFromDom();
        const idx = Number(btn.dataset.index);
        config.desktopTools.splice(idx, 1);
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
      const icon = card.querySelector(".tool-in-icon").value.trim() || "🛠️";
      const fallbackVersion = card.querySelector(".tool-in-ver").value.trim();
      const tags = card
        .querySelector(".tool-in-tags")
        .value.split(/[،,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const description = card.querySelector(".tool-in-desc").value.trim();

      updated.push({
        id: prev.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `tool-${idx + 1}`,
        name,
        category,
        icon,
        description,
        repo,
        fallbackVersion,
        tags,
      });
    });
    config.desktopTools = updated;
  }

  function collectAllFromForms() {
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
      youtubeFeaturedVideoId: extractYouTubeId(document.getElementById("f-youtubeFeaturedVideoId").value) || document.getElementById("f-youtubeFeaturedVideoId").value.trim(),
      youtubeDescription: document.getElementById("f-youtubeDescription").value.trim(),
    };
    syncAppsFromDom();
    syncToolsFromDom();
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
    showToast("تم تحميل ملف site-config.json إلى جهازك.");
  }

  async function publishToGitHub() {
    const token = (document.getElementById("gh-token").value || localStorage.getItem(TOKEN_KEY) || "").trim();
    if (!token) {
      showToast("يرجى إدخال رمز GitHub Token أولاً أو استخدام التحميل اليدوي.", true);
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

      let sha = undefined;
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
      showToast("تم حفظ ونشر التعديلات بنجاح! سيتحدّث الموقع خلال دقيقة واحدة.");
    } catch (err) {
      showToast(`خطأ أثناء النشر: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "حفظ ونشر التعديلات";
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${CONFIG_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      config = await res.json();
      populateSiteForm();
      renderAppsEditor();
      renderToolsEditor();
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
    updateTokenStatus();
    loadConfig();

    document.getElementById("f-youtubeFeaturedVideoId").addEventListener("input", updateYouTubePreview);

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

    document.getElementById("btn-clear-token").addEventListener("click", () => {
      localStorage.removeItem(TOKEN_KEY);
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
        description: "",
        repo: "Reda6Dev/",
        fallbackVersion: "v1.0.0",
        tags: ["Windows"],
      });
      renderToolsEditor();
    });

    document.getElementById("btn-reload").addEventListener("click", loadConfig);
    document.getElementById("btn-download").addEventListener("click", downloadConfig);
    document.getElementById("btn-publish").addEventListener("click", publishToGitHub);
  });
})();
