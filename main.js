(() => {
  "use strict";

  try {
    // ------------------------------------------------------------
    // Changtan Embed (No WS). Simple API (token -> list models -> infer)
    // Token is stored in-memory only (lost on page close).
    // ------------------------------------------------------------

    const DEFAULTS = {
      title: "Changtan",
      launcherEmoji: "🦜",
      modeLabel: "Chat",
      zIndex: 2147483000,
      width: 380,
      height: 560,
      offset: 20,
      theme: {
        accent: "#2f6bff",
        bg: "#0b0f19",
        panel: "#111827",
        text: "#e5e7eb",
        muted: "rgba(229,231,235,0.65)",
        border: "rgba(255,255,255,0.12)",
        shadow: "0 16px 48px rgba(0,0,0,0.45)"
      },

      // API config:
      // - user provides baseUrl in UI (not known by front at build time)
      // - token endpoint name is configurable (default: /getToken)
      api: {
        defaultBaseUrl: "https://mpanatitra.kahiether.com",
        tokenPath: "/getToken", // <-- adjust if your token endpoint differs
        modelsPath: "/getAvailableTextModels",
        inferPath: "/inferChatWithoutStream",
        apiKeyHeader: "x-api-key",
        requestTimeoutMs: 25000
      },

      // UI defaults
      ui: {
        defaultModel: null, // if null => choose first returned model
        showModelPicker: true
      }
    };

    const deepMerge = (a, b) => {
      const out = { ...(a || {}) };
      for (const k in (b || {})) {
        const av = out[k], bv = b[k];
        if (
          av && bv &&
          typeof av === "object" && typeof bv === "object" &&
          !Array.isArray(av) && !Array.isArray(bv)
        ) out[k] = deepMerge(av, bv);
        else out[k] = bv;
      }
      return out;
    };

    const CFG = deepMerge(DEFAULTS, window.CTChatConfig || {});

    // Prevent double injection
    if (window.__CHANGTAN_EMBED__) return;
    window.__CHANGTAN_EMBED__ = true;

    // ------------------------------------------------------------
    // DOM helpers
    // ------------------------------------------------------------
    const $ = (tag, attrs = {}, children = []) => {
      const n = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") n.className = v;
        else if (k === "style") n.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v !== undefined && v !== null) n.setAttribute(k, String(v));
      }
      for (const c of children) n.append(c);
      return n;
    };

    const esc = (s) =>
      String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const normalizeBaseUrl = (u) => {
      let s = String(u || "").trim();
      if (!s) return "";
      s = s.replace(/\/+$/, "");
      return s;
    };

    const joinUrl = (base, path) => {
      const b = normalizeBaseUrl(base);
      const p = String(path || "");
      if (!b) return "";
      if (!p) return b;
      if (p.startsWith("/")) return b + p;
      return b + "/" + p;
    };

    const abortableFetch = async (url, opts = {}, timeoutMs = 25000) => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs | 0));
      try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        return res;
      } finally {
        clearTimeout(t);
      }
    };

    // ------------------------------------------------------------
    // Styles (hardened)
    // ------------------------------------------------------------
    const THEME = CFG.theme;

    const CSS = `
      :root{
        --ct-accent:${THEME.accent};
        --ct-bg:${THEME.bg};
        --ct-panel:${THEME.panel};
        --ct-text:${THEME.text};
        --ct-muted:${THEME.muted};
        --ct-border:${THEME.border};
        --ct-shadow:${THEME.shadow};
        --ct-radius:18px;
        --ct-radius2:14px;
        --ct-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      }

      [data-changtan="1"].ct-root{
        position:fixed;
        left:${CFG.offset}px;
        bottom:${CFG.offset}px;
        z-index:${CFG.zIndex};
        font-family:var(--ct-font);
        pointer-events:auto;
      }

      [data-changtan="1"] .ct-launcher{
        all: unset;
        box-sizing: border-box;
        width:56px;height:56px;border-radius:999px;
        border:1px solid var(--ct-border);
        background: radial-gradient(120% 120% at 20% 10%, rgba(47,107,255,0.18) 0%, rgba(255,255,255,0.03) 70%);
        box-shadow:var(--ct-shadow);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;user-select:none;
        pointer-events:auto;

        font-family: var(--ct-font);
        font-size: 26px;
        line-height: 1;
        padding: 0;
        margin: 0;
        -webkit-appearance: none;
        appearance: none;
        font-variant-emoji: emoji;

        transition: transform .12s ease, filter .12s ease, background .12s ease, box-shadow .12s ease;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }

      @media (hover:hover) and (pointer:fine){
        [data-changtan="1"] .ct-launcher:hover{
          background: radial-gradient(120% 120% at 20% 10%,
            rgba(47,107,255,0.28) 0%,
            rgba(255,255,255,0.06) 70%);
          filter: brightness(1.06);
          transform: translateY(-1px);
        }
      }

      [data-changtan="1"] .ct-launcher:active{
        transform: translateY(0px) scale(0.98);
        filter: brightness(0.98);
      }

      [data-changtan="1"] .ct-launcher:focus-visible{
        outline: 2px solid rgba(47,107,255,0.75);
        outline-offset: 3px;
      }

      [data-changtan="1"] .ct-panel{
        position:absolute;left:0;bottom:70px;
        width:${CFG.width}px;height:${CFG.height}px;
        border-radius:var(--ct-radius);
        border:1px solid var(--ct-border);
        background: rgba(11,15,25,0.85);
        box-shadow:var(--ct-shadow);
        overflow:hidden;
        transform-origin: bottom left;
        transform: scale(0.92);
        opacity:0;
        pointer-events:none;
        transition: transform .18s ease, opacity .18s ease;
        backdrop-filter: blur(10px);
      }

      [data-changtan="1"] .ct-panel.ct-open{
        transform:scale(1) !important;
        opacity:1 !important;
        pointer-events:auto !important;
        display:block !important;
        visibility:visible !important;
      }

      [data-changtan="1"] .ct-header{
        height:56px;display:flex;align-items:center;justify-content:space-between;
        padding:0 12px 0 14px;
        background: linear-gradient(180deg, rgba(17,24,39,0.9), rgba(15,23,42,0.7));
        border-bottom:1px solid var(--ct-border);
        color:var(--ct-text);
      }
      [data-changtan="1"] .ct-title{ display:flex;align-items:center;gap:10px; min-width:0; }
      [data-changtan="1"] .ct-name{ font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      [data-changtan="1"] .ct-pill{
        padding:5px 10px;border-radius:999px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color:var(--ct-muted);
        font-size:11px;
      }
      [data-changtan="1"] .ct-actions{ display:flex;gap:8px; }
      [data-changtan="1"] .ct-btn{
        width:34px;height:34px;border-radius:10px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color:var(--ct-text);cursor:pointer;user-select:none;
        display:flex;align-items:center;justify-content:center;
      }
      [data-changtan="1"] .ct-btn:hover{ background: rgba(255,255,255,0.06); }

      [data-changtan="1"] .ct-body{
        height: calc(100% - 56px - 110px);
        overflow:auto;
        padding: 14px 12px 18px 12px;
      }
      [data-changtan="1"] .ct-msg{ display:flex;gap:10px;margin:10px 0;align-items:flex-end; }
      [data-changtan="1"] .ct-msg.ct-user{ justify-content:flex-end; }
      [data-changtan="1"] .ct-bubble{
        max-width:84%;
        padding:10px 12px;border-radius:var(--ct-radius2);
        border:1px solid var(--ct-border);
        color:var(--ct-text);
        font-size:13.5px;line-height:1.35;
        white-space: pre-wrap; word-break: break-word;
        background: rgba(255,255,255,0.06);
      }
      [data-changtan="1"] .ct-user .ct-bubble{
        background: rgba(47,107,255,0.18);
        border-color: rgba(47,107,255,0.28);
      }
      [data-changtan="1"] .ct-meta{ font-size:10.5px;color:var(--ct-muted);margin-top:6px; }

      [data-changtan="1"] .ct-footer{
        height:110px;display:flex;flex-direction:column;gap:8px;
        padding:10px 12px;
        border-top:1px solid var(--ct-border);
        background: rgba(0,0,0,0.10);
      }

      [data-changtan="1"] .ct-config{
        display:flex;gap:8px;align-items:center;
      }
      [data-changtan="1"] .ct-field{
        flex:1;
        display:flex;flex-direction:column;gap:4px;
        min-width: 0;
      }
      [data-changtan="1"] .ct-label{
        font-size:10.5px;color:var(--ct-muted);
        display:flex;justify-content:space-between;gap:8px;
      }
      [data-changtan="1"] .ct-mini{
        font-size:10.5px;color:rgba(229,231,235,0.85);
        opacity:0.9;
      }
      [data-changtan="1"] .ct-select, [data-changtan="1"] .ct-text{
        width:100%;
        border-radius:12px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color: var(--ct-text);
        font-size:12.5px;outline:none;
        padding:8px 10px;
        box-sizing:border-box;
      }
      [data-changtan="1"] .ct-text::placeholder{ color: rgba(229,231,235,0.45); }

      [data-changtan="1"] .ct-row{ display:flex;gap:8px;align-items:flex-end; }
      [data-changtan="1"] .ct-input{
        flex:1;min-height:40px;max-height:120px;resize:none;
        padding:10px 10px;border-radius:14px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color: var(--ct-text);
        font-size:13.5px;outline:none;
        box-sizing:border-box;
      }
      [data-changtan="1"] .ct-input::placeholder{ color: rgba(229,231,235,0.45); }
      [data-changtan="1"] .ct-send{
        width:44px;height:44px;border-radius:14px;
        border:1px solid rgba(47,107,255,0.35);
        background: rgba(47,107,255,0.16);
        color: rgba(229,231,235,0.95);
        cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        user-select:none;
      }
      [data-changtan="1"] .ct-send:disabled{ opacity:0.5; cursor:not-allowed; }

      [data-changtan="1"] .ct-status{ display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--ct-muted); }
      [data-changtan="1"] .ct-status b{ color: rgba(229,231,235,0.9); font-weight:650; }

      [data-changtan="1"] .ct-linkbtn{
        all: unset;
        cursor: pointer;
        font-size: 10.5px;
        color: rgba(229,231,235,0.9);
        opacity: 0.9;
        text-decoration: underline;
      }
      [data-changtan="1"] .ct-linkbtn:hover{ opacity: 1; }
    `;

    document.head.appendChild($("style", { "data-changtan-style": "1" }, [document.createTextNode(CSS)]));

    // ------------------------------------------------------------
    // UI build
    // ------------------------------------------------------------
    const root = $("div", { class: "ct-root", "data-changtan": "1" });
    const panel = $("div", { class: "ct-panel", role: "dialog", "aria-label": "Changtan chat" });

    const statusPill = $("span", { class: "ct-pill", "data-ct-status": "1" }, [document.createTextNode("unconfigured")]);
    const modelPill = $("span", { class: "ct-pill", "data-ct-model": "1" }, [document.createTextNode("model: -")]);

    const body = $("div", { class: "ct-body" });
    const textarea = $("textarea", { class: "ct-input", rows: "1", placeholder: "Type a message…" });
    const sendBtn = $("button", { class: "ct-send", type: "button" }, [document.createTextNode("📨")]);

    // Config controls
    const baseUrlInput = $("input", { class: "ct-text", type: "text", placeholder: "API base URL (https://…)", value: CFG.api.defaultBaseUrl || "" });
    const tokenBtn = $("button", { class: "ct-btn", type: "button", title: "Connect" }, [document.createTextNode("🔑")]);
    const refreshModelsBtn = $("button", { class: "ct-btn", type: "button", title: "Refresh models" }, [document.createTextNode("↻")]);

    const modelSelect = $("select", { class: "ct-select" }, [
      $("option", { value: "" }, [document.createTextNode("Loading models…")])
    ]);

    const header = $("div", { class: "ct-header" }, [
      $("div", { class: "ct-title" }, [
        $("div", { class: "ct-name" }, [document.createTextNode(`${CFG.launcherEmoji} ${CFG.title}`)]),
        modelPill
      ]),
      $("div", { class: "ct-actions" }, [
        $("button", { class: "ct-btn", type: "button", title: "Clear" , onClick: () => API.clear() }, [document.createTextNode("🧹")]),
        $("button", { class: "ct-btn", type: "button", title: "Close" , onClick: () => API.close() }, [document.createTextNode("✖️")])
      ])
    ]);

    const configRow = $("div", { class: "ct-config" }, [
      $("div", { class: "ct-field" }, [
        $("div", { class: "ct-label" }, [
          document.createTextNode("API Endpoint"),
          $("button", {
            class: "ct-linkbtn",
            type: "button",
            title: "Token is kept in memory only",
            onClick: () => addMessage("assistant", "Token is stored in memory only and disappears when the tab closes.")
          }, [document.createTextNode("memory-only token")])
        ]),
        baseUrlInput
      ]),
      tokenBtn,
      refreshModelsBtn
    ]);

    const modelRow = $("div", { class: "ct-config" }, [
      $("div", { class: "ct-field" }, [
        $("div", { class: "ct-label" }, [
          document.createTextNode("Model"),
          $("span", { class: "ct-mini" }, [statusPill])
        ]),
        modelSelect
      ])
    ]);

    const footer = $("div", { class: "ct-footer" }, [
      configRow,
      modelRow,
      $("div", { class: "ct-row" }, [textarea, sendBtn])
    ]);

    panel.append(header, body, footer);

    const launcher = $("button", {
      class: "ct-launcher",
      type: "button",
      "aria-label": "Open chat",
      onClick: () => API.toggle()
    }, [document.createTextNode(CFG.launcherEmoji)]);

    root.append(launcher, panel);
    document.body.appendChild(root);

    // ------------------------------------------------------------
    // STATE
    // ------------------------------------------------------------
    const STATE = {
      open: false,
      token: null,           // in-memory only
      baseUrl: normalizeBaseUrl(CFG.api.defaultBaseUrl || ""),
      models: [],
      selectedModel: CFG.ui.defaultModel || null,
      messages: [],
      busy: false
    };

    const setStatus = (txt) => { statusPill.textContent = txt; };
    const setModelPill = (modelId) => { modelPill.textContent = modelId ? `model: ${modelId}` : "model: -"; };
    const scrollToBottom = () => { body.scrollTop = body.scrollHeight; };

    const renderMsg = (m) => {
      const wrap = $("div", { class: `ct-msg ${m.role === "user" ? "ct-user" : "ct-bot"}` });
      const bubble = $("div", { class: "ct-bubble" });
      bubble.innerHTML = esc(m.content || "");
      const meta = $("div", { class: "ct-meta" }, [
        document.createTextNode(`${m.role === "user" ? "you" : "assistant"} • ${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
      ]);
      const stack = $("div", { style: "display:flex;flex-direction:column;gap:4px;max-width:84%;" }, [bubble, meta]);
      wrap.append(stack);
      body.append(wrap);
      scrollToBottom();
    };

    const addMessage = (role, content) => {
      const msg = { id: `${role[0]}_${Math.random().toString(16).slice(2)}`, role, content, ts: new Date().toISOString() };
      STATE.messages.push(msg);
      renderMsg(msg);
      return msg;
    };

    const setBusy = (v) => {
      STATE.busy = !!v;
      sendBtn.disabled = STATE.busy;
      tokenBtn.disabled = STATE.busy;
      refreshModelsBtn.disabled = STATE.busy;
      baseUrlInput.disabled = STATE.busy;
      modelSelect.disabled = STATE.busy || !STATE.token;
    };

    const system = (text) => addMessage("assistant", `⚠️ ${text}`);

    // Close on outside click
    document.addEventListener("mousedown", (e) => {
      if (!STATE.open) return;
      if (root.contains(e.target)) return;
      API.close();
    });

    // ------------------------------------------------------------
    // API client (token in memory only)
    // ------------------------------------------------------------
    const ApiClient = (() => {
      const timeoutMs = CFG.api.requestTimeoutMs | 0;

      const getBaseUrl = () => normalizeBaseUrl(STATE.baseUrl);
      const tokenHeaderName = String(CFG.api.apiKeyHeader || "x-api-key");

      const requireBaseUrl = () => {
        const b = getBaseUrl();
        if (!b) throw new Error("Missing API base URL.");
        return b;
      };

      const requireToken = () => {
        if (!STATE.token) throw new Error("Not connected (missing token). Click 🔑 to fetch token.");
        return STATE.token;
      };

      const authHeaders = () => {
        const tok = requireToken();
        return { [tokenHeaderName]: tok };
      };

      const fetchToken = async () => {
        const base = requireBaseUrl();
        const url = joinUrl(base, CFG.api.tokenPath);
        const res = await abortableFetch(url, { method: "GET" }, timeoutMs);
        const txt = await res.text().catch(() => "");
        if (!res.ok) throw new Error(`Token request failed (${res.status}). ${txt || ""}`.trim());

        let data;
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

        // Flexible parsing:
        // accept {token:"..."} or {data:{token:"..."}} or plain string
        const token =
          (typeof data === "string" && data) ||
          data?.token ||
          data?.data?.token ||
          data?.key ||
          data?.data?.key ||
          (typeof data?.data === "string" ? data.data : null);

        if (!token) throw new Error("Token response did not contain a token field.");
        return String(token);
      };

      const listModels = async () => {
        const base = requireBaseUrl();
        const url = joinUrl(base, CFG.api.modelsPath);
        const res = await abortableFetch(url, { method: "GET", headers: { ...authHeaders() } }, timeoutMs);
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`Model list failed (${res.status}).`);
        const arr = json?.data;
        if (!Array.isArray(arr)) throw new Error("Invalid models response (expected {data:[...]}).");
        return arr;
      };

      const infer = async (text, modelId) => {
        const base = requireBaseUrl();
        const url = joinUrl(base, CFG.api.inferPath);
        const payload = { text: String(text || ""), model: String(modelId || "") };

        const res = await abortableFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload)
        }, timeoutMs);

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = json?.error || json?.message || `Infer failed (${res.status}).`;
          throw new Error(String(msg));
        }

        const content =
          json?.choices?.[0]?.message?.content ??
          json?.data?.choices?.[0]?.message?.content ??
          json?.message?.content ??
          null;

        if (!content) throw new Error("Invalid infer response (missing assistant content).");
        return String(content);
      };

      return { fetchToken, listModels, infer };
    })();

    // ------------------------------------------------------------
    // Models UI
    // ------------------------------------------------------------
    const rebuildModelSelect = () => {
      modelSelect.innerHTML = "";
      if (!STATE.models.length) {
        modelSelect.append($("option", { value: "" }, [document.createTextNode("No models")]));
        modelSelect.value = "";
        setModelPill(null);
        STATE.selectedModel = null;
        return;
      }

      const preferred = STATE.selectedModel || CFG.ui.defaultModel;
      for (const m of STATE.models) {
        const id = String(m?.id || "");
        const name = String(m?.model_spec?.name || id || "model");
        const opt = $("option", { value: id }, [document.createTextNode(`${name} (${id})`)]);
        modelSelect.append(opt);
      }

      const firstId = String(STATE.models[0]?.id || "");
      const chosen = (preferred && STATE.models.some(x => String(x?.id) === String(preferred)))
        ? String(preferred)
        : firstId;

      modelSelect.value = chosen;
      STATE.selectedModel = chosen;
      setModelPill(chosen);
    };

    const connectAndLoadModels = async () => {
      STATE.baseUrl = normalizeBaseUrl(baseUrlInput.value);
      if (!STATE.baseUrl) {
        system("Please provide an API base URL.");
        return;
      }

      setBusy(true);
      setStatus("connecting…");
      try {
        const tok = await ApiClient.fetchToken();
        STATE.token = tok;
        setStatus("token ok");

        const models = await ApiClient.listModels();
        STATE.models = models;

        rebuildModelSelect();
        setStatus("ready");
        addMessage("assistant", "Connected. Models loaded.");
      } catch (e) {
        STATE.token = null;
        STATE.models = [];
        rebuildModelSelect();
        setStatus("unavailable");
        system(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    };

    const refreshModels = async () => {
      if (!STATE.token) {
        system("Not connected. Click 🔑 first.");
        return;
      }
      setBusy(true);
      setStatus("loading models…");
      try {
        const models = await ApiClient.listModels();
        STATE.models = models;
        rebuildModelSelect();
        setStatus("ready");
      } catch (e) {
        setStatus("unavailable");
        system(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    };

    // ------------------------------------------------------------
    // INPUT
    // ------------------------------------------------------------
    const autoResize = () => {
      textarea.style.height = "0px";
      const h = Math.min(120, Math.max(40, textarea.scrollHeight));
      textarea.style.height = h + "px";
    };

    textarea.addEventListener("input", autoResize);

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
      if (e.key === "Escape") API.close();
    });

    const send = async () => {
      const v = (textarea.value || "").trim();
      if (!v) return;

      if (!STATE.token) {
        system("Not connected. Set API base URL, then click 🔑.");
        return;
      }
      const model = modelSelect.value || STATE.selectedModel;
      if (!model) {
        system("No model selected.");
        return;
      }

      textarea.value = "";
      autoResize();
      addMessage("user", v);

      setBusy(true);
      setStatus("thinking…");
      try {
        const out = await ApiClient.infer(v, model);
        addMessage("assistant", out);
        setStatus("ready");
      } catch (e) {
        setStatus("ready");
        system(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    };

    sendBtn.addEventListener("click", send);

    tokenBtn.addEventListener("click", connectAndLoadModels);
    refreshModelsBtn.addEventListener("click", refreshModels);

    modelSelect.addEventListener("change", () => {
      STATE.selectedModel = modelSelect.value || null;
      setModelPill(STATE.selectedModel);
    });

    baseUrlInput.addEventListener("change", () => {
      // changing base url invalidates token + models
      const next = normalizeBaseUrl(baseUrlInput.value);
      if (next !== STATE.baseUrl) {
        STATE.baseUrl = next;
        STATE.token = null;
        STATE.models = [];
        STATE.selectedModel = null;
        rebuildModelSelect();
        setStatus("unconfigured");
      }
    });

    // ------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------
    const API = {
      open: () => {
        STATE.open = true;
        panel.classList.add("ct-open");
        textarea.focus();
        scrollToBottom();
      },
      close: () => {
        STATE.open = false;
        panel.classList.remove("ct-open");
      },
      toggle: () => (STATE.open ? API.close() : API.open()),
      clear: () => {
        STATE.messages = [];
        body.innerHTML = "";
        addMessage("assistant", "Chat cleared.");
      },
      // Optional helpers for host page:
      isConnected: () => !!STATE.token,
      getSelectedModel: () => STATE.selectedModel,
      disconnect: () => {
        // memory-only token: clear in-memory state
        STATE.token = null;
        STATE.models = [];
        STATE.selectedModel = null;
        rebuildModelSelect();
        setStatus("unconfigured");
        addMessage("assistant", "Disconnected (token cleared).");
      }
    };

    window.CTChat = API;

    // ------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------
    addMessage("assistant", "Ready. Set API base URL, click 🔑, select model, then chat.");
    setStatus("unconfigured");
    rebuildModelSelect();
    autoResize();

  } catch (e) {
    console.warn("[CHANGTAN] Fatal boot error:", e);
  }
})();
