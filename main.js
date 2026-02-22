(() => {
  "use strict";

  try {
    // ------------------------------------------------------------
    // Changtan Embed (No WS)
    // Fixed API base URL
    // User enters token once in a hidden modal (password field)
    // Token kept in memory only
    //
    // Models: GET  {baseUrl}/getAvailableTextModels   header: x-api-key: <token>
    // Infer:  POST {baseUrl}/inferChatWithoutStream   header: x-api-key: <token>
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
      api: {
        baseUrl: "https://mpanatitra.kahiether.com",
        modelsPath: "/getAvailableTextModels",
        inferPath: "/inferChatWithoutStream",
        apiKeyHeader: "x-api-key",
        requestTimeoutMs: 25000
      },
      ui: {
        defaultModel: null
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

    if (window.__CHANGTAN_EMBED__) return;
    window.__CHANGTAN_EMBED__ = true;

    // ------------------------------------------------------------
    // Helpers
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

    const normalizeBaseUrl = (u) => String(u || "").trim().replace(/\/+$/, "");
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
        return await fetch(url, {
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          redirect: "follow",
          ...opts,
          signal: controller.signal
        });
      } finally {
        clearTimeout(t);
      }
    };

    const readErrorBody = async (res) => {
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const j = await res.json();
          return j?.error || j?.message || JSON.stringify(j);
        }
        return (await res.text()) || "";
      } catch {
        return "";
      }
    };

    // ------------------------------------------------------------
    // Styles
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

      /* dark mode if possible*/
      [data-changtan="1"].ct-root,
      [data-changtan="1"] .ct-panel,
      [data-changtan="1"] .ct-select,
      [data-changtan="1"] .ct-text,
      [data-changtan="1"] .ct-input{
        color-scheme: dark;
      }

      /* Select + options (support variable selon navigateur/OS) */
      [data-changtan="1"] .ct-select{
        background-color: rgba(17,24,39,0.92);
        color: var(--ct-text);
      }
      [data-changtan="1"] .ct-select option,
      [data-changtan="1"] .ct-select optgroup{
        background-color: rgba(17,24,39,0.98);
        color: var(--ct-text);
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

        /* Responsive: exploite l’espace sans full-screen */
        width: min(520px, calc(100vw - ${CFG.offset * 2}px));
        height: min(720px, calc(100dvh - ${CFG.offset * 2 + 70}px));

        border-radius:var(--ct-radius);
        border:1px solid var(--ct-border);
        background: rgba(11,15,25,0.85);
        box-shadow:var(--ct-shadow);
        overflow:hidden;

        display:flex;
        flex-direction:column;

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
      
        /* CRITIQUE : garder le flex */
        display:flex !important;
        flex-direction:column !important;
      
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
      [data-changtan="1"] .ct-btn:disabled{ opacity:0.5; cursor:not-allowed; }

      [data-changtan="1"] .ct-body{
        flex: 1;
        overflow:auto;
        padding: 14px 12px 18px 12px;
        overscroll-behavior: contain;
        min-height: 0;        /* indispensable en flex */
        scrollbar-width: thin;
        scrollbar-color: rgba(229,231,235,0.28) rgba(255,255,255,0.06);
        -webkit-overflow-scrolling: touch;
      }

      [data-changtan="1"] .ct-msg{ display:flex;gap:10px;margin:10px 0;align-items:flex-end; }
      [data-changtan="1"] .ct-msg.ct-user{ justify-content:flex-end; }
      [data-changtan="1"] .ct-bubble{
        max-width:84%;
        padding:10px 12px;border-radius:var(--ct-radius2);
        border:1px solid var(--ct-border);
        color:var(--ct-text);
        font-size:13.5px;line-height:1.35;
        white-space: pre-wrap;
        word-break: normal;
        overflow-wrap: break-word;   /* break only when needed */
        hyphens: none;
        background: rgba(255,255,255,0.06);
      }
      [data-changtan="1"] .ct-user .ct-bubble{
        background: rgba(47,107,255,0.18);
        border-color: rgba(47,107,255,0.28);
      }
      [data-changtan="1"] .ct-meta{ font-size:10.5px;color:var(--ct-muted);margin-top:6px; }

      [data-changtan="1"] .ct-footer{
        flex: 0 0 auto;
        display:flex;
        flex-direction:column;
        gap:8px;
        padding:10px 12px calc(10px + env(safe-area-inset-bottom, 0px)) 12px;
        border-top:1px solid var(--ct-border);
        background: rgba(0,0,0,0.10);
        flex-shrink: 0;      
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

      /* Modal */
      [data-changtan="1"] .ct-modal{
        position:absolute;
        inset: 0;
        display:none;
        align-items:center;
        justify-content:center;
        background: rgba(0,0,0,0.35);
        backdrop-filter: blur(6px);
        z-index: 10;
      }
      [data-changtan="1"] .ct-modal.ct-show{ display:flex; }
      [data-changtan="1"] .ct-modal-card{
        width: calc(100% - 28px);
        max-width: 420px;
        border-radius: 16px;
        border: 1px solid var(--ct-border);
        background: rgba(17,24,39,0.95);
        box-shadow: var(--ct-shadow);
        padding: 12px;
      }
      [data-changtan="1"] .ct-modal-head{
        display:flex;align-items:center;justify-content:space-between;
        color: var(--ct-text);
        margin-bottom: 10px;
      }
      [data-changtan="1"] .ct-modal-title{
        font-size: 13px;
        font-weight: 650;
      }
      [data-changtan="1"] .ct-modal-body{
        display:flex;flex-direction:column;gap:10px;
      }
      [data-changtan="1"] .ct-modal-actions{
        display:flex;gap:8px;justify-content:flex-end;
        margin-top: 10px;
      }
      [data-changtan="1"] .ct-primary{
        border: 1px solid rgba(47,107,255,0.45);
        background: rgba(47,107,255,0.18);
      }


      [data-changtan="1"] .ct-body::-webkit-scrollbar{
        width: 10px;
        height: 10px;
      }
      [data-changtan="1"] .ct-body::-webkit-scrollbar-track{
        background: rgba(255,255,255,0.05);
        border-radius: 999px;
      }
      [data-changtan="1"] .ct-body::-webkit-scrollbar-thumb{
        background: rgba(229,231,235,0.22);
        border: 2px solid rgba(255,255,255,0.05);
        border-radius: 999px;
      }
      [data-changtan="1"] .ct-body::-webkit-scrollbar-thumb:hover{
        background: rgba(229,231,235,0.30);
      }

      @media (min-width: 1024px){
        [data-changtan="1"] .ct-panel{
          width: min(640px, calc(100vw - ${CFG.offset * 2}px));
          height: min(820px, calc(100dvh - ${CFG.offset * 2 + 70}px));
        }
        [data-changtan="1"] .ct-bubble{ max-width: 78%; }
      }
      
      @media (max-width: 480px){
        [data-changtan="1"].ct-root{
          left: 12px;
          bottom: 12px;
        }
        [data-changtan="1"] .ct-panel{
          bottom: 64px;
          width: calc(100vw - 24px);
          height: calc(100dvh - 24px - 64px);
        }
        [data-changtan="1"] .ct-btn{
          width:30px;
          height:30px;
          border-radius:10px;
          font-size:16px;     /* réduit les emojis */
          line-height:1;
        }
      
        [data-changtan="1"] .ct-send{
          width:40px;
          height:40px;
          border-radius:14px;
          font-size:16px;
          line-height:1;
        }
      
        [data-changtan="1"] .ct-launcher{
          width:52px;
          height:52px;
          font-size:22px;
          line-height:1;
        }
      
        [data-changtan="1"] .ct-modal-card{
          max-width: 360px;
        }
        [data-changtan="1"] .ct-modal-actions .ct-btn{
          width:auto;                 /* boutons texte */
          height:34px;
          padding:0 10px;
          font-size:13px;
        }
      }
      
    `;

    document.head.appendChild($("style", { "data-changtan-style": "1" }, [document.createTextNode(CSS)]));

    const STATE = {
      open: false,
      token: null, // memory only
      models: [],
      selectedModel: CFG.ui.defaultModel || null,
      messages: [],
      busy: false,
      useHistory: true
    };

    
    // ------------------------------------------------------------
    // UI build
    // ------------------------------------------------------------
    const root = $("div", { class: "ct-root", "data-changtan": "1" });
    const panel = $("div", { class: "ct-panel", role: "dialog", "aria-label": "Changtan chat" });
    
    const historyBtn = $("button", {
      class: "ct-btn",
      type: "button",
      title: "History: on",
      "aria-label": "Toggle history",
      onClick: () => {
        STATE.useHistory = !STATE.useHistory;
        refreshHistoryBtn();
        system(`History ${STATE.useHistory ? "enabled" : "disabled"}.`);
      }
    }, [document.createTextNode("🧠")]);
    
    const refreshHistoryBtn = () => {
      historyBtn.textContent = STATE.useHistory ? "🧠" : "🧠🚫";
      historyBtn.title = `History: ${STATE.useHistory ? "on" : "off"}`;
      historyBtn.setAttribute("aria-pressed", STATE.useHistory ? "true" : "false");
    };
    
    const statusPill = $("span", { class: "ct-pill", "data-ct-status": "1" }, [document.createTextNode("disconnected")]);
    const modelPill = $("span", { class: "ct-pill", "data-ct-model": "1" }, [document.createTextNode("model: -")]);

    const body = $("div", { class: "ct-body" });
    const textarea = $("textarea", { class: "ct-input", rows: "1", placeholder: "Type a message…" });
    const sendBtn = $("button", { class: "ct-send", type: "button" }, [document.createTextNode("📨")]);

    const modelSelect = $("select", { class: "ct-select" }, [
      $("option", { value: "" }, [document.createTextNode("Connect to load models")])
    ]);

    const header = $("div", { class: "ct-header" }, [
      $("div", { class: "ct-title" }, [
        $("div", { class: "ct-name" }, [document.createTextNode(`${CFG.launcherEmoji} ${CFG.title}`)]),
        modelPill
      ]),
      $("div", { class: "ct-actions" }, [
        $("button", { class: "ct-btn", type: "button", title: "Connect", onClick: () => UI.showTokenModal() }, [document.createTextNode("🔑")]),
        historyBtn,
        $("button", { class: "ct-btn", type: "button", title: "Refresh models", onClick: () => Actions.refreshModels() }, [document.createTextNode("↻")]),
        $("button", { class: "ct-btn", type: "button", title: "Clear", onClick: () => API.clear() }, [document.createTextNode("🧹")]),
        $("button", { class: "ct-btn", type: "button", title: "Close", onClick: () => API.close() }, [document.createTextNode("✖️")])
      ])
    ]);

    const footer = $("div", { class: "ct-footer" }, [
      $("div", { class: "ct-config" }, [
        $("div", { class: "ct-field" }, [
          $("div", { class: "ct-label" }, [
            document.createTextNode("Model"),
            $("span", { class: "ct-mini" }, [statusPill])
          ]),
          modelSelect
        ])
      ]),
      $("div", { class: "ct-row" }, [textarea, sendBtn])
    ]);

    // Token modal (password field)
    const modal = $("div", { class: "ct-modal", "aria-hidden": "true" });
    const tokenInput = $("input", {
      class: "ct-text",
      type: "password",
      placeholder: "Token"
    });

    const modalCard = $("div", { class: "ct-modal-card" }, [
      $("div", { class: "ct-modal-head" }, [
        $("div", { class: "ct-modal-title" }, [document.createTextNode("Connect")]),
        $("button", { class: "ct-btn", type: "button", title: "Close", onClick: () => UI.hideTokenModal() }, [document.createTextNode("✖️")])
      ]),
      $("div", { class: "ct-modal-body" }, [
        $("div", { class: "ct-field" }, [
          $("div", { class: "ct-label" }, [
            document.createTextNode("API token"),
            $("span", { class: "ct-mini" }, [document.createTextNode("required")])
          ]),
          tokenInput
        ]),
        $("div", { class: "ct-modal-actions" }, [
          $("button", { class: "ct-btn", type: "button", onClick: () => UI.hideTokenModal() }, [document.createTextNode("Cancel")]),
          $("button", { class: "ct-btn ct-primary", type: "button", onClick: () => Actions.connectWithToken() }, [document.createTextNode("Connect")])
        ])
      ])
    ]);

    modal.append(modalCard);
    panel.append(header, body, footer, modal);

    const launcher = $("button", {
      class: "ct-launcher",
      type: "button",
      "aria-label": "Open chat",
      onClick: () => API.toggle()
    }, [document.createTextNode(CFG.launcherEmoji)]);

    root.append(launcher, panel);
    document.body.appendChild(root);

    // Close on outside click
    document.addEventListener("mousedown", (e) => {
      if (!STATE.open) return;
      if (root.contains(e.target)) return;
      API.close();
    });

    // ------------------------------------------------------------
    // STATE
    // ------------------------------------------------------------


    const setStatus = (txt) => { statusPill.textContent = txt; };
    const setModelPill = (modelId) => { modelPill.textContent = modelId ? `model: ${modelId}` : "model: -"; };
    const scrollToBottom = () => { body.scrollTop = body.scrollHeight; };

    const whoLabel = (role) => (role === "user" ? "you" : "papougai");

    const renderMsg = (m) => {
      const wrap = $("div", { class: `ct-msg ${m.role === "user" ? "ct-user" : "ct-bot"}` });
      const bubble = $("div", { class: "ct-bubble" });
      bubble.innerHTML = esc(m.content || "");
      const meta = $("div", { class: "ct-meta" }, [
        document.createTextNode(`${whoLabel(m.role)} • ${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
      ]);
      const stack = $("div", { style: "display:flex;flex-direction:column;gap:4px;max-width:84%;" }, [bubble, meta]);
      wrap.append(stack);
      body.append(wrap);
      scrollToBottom();
    };

const MAX_HISTORY_CHARS = 800;

const historyLine = (m) => {
  const t = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const who = whoLabel(m.role); // "you" ou "papougai"
  const content = String(m.content || "").replace(/\s+$/g, "");
  return `[${t}] ${who}: ${content}`;
};

  // History
  const buildHistoryString = () => {
    // Option :  "Ready." 
    const msgs = STATE.messages.filter((m) =>
      m && m.content && m.content !== "Ready." &&
      (m.role === "user" || m.role === "assistant") &&
      !String(m.content).startsWith("⚠️")
    );
  
    const picked = [];
    let total = 0;
  
    // recenet to old
    for (let i = msgs.length - 1; i >= 0; i--) {
      const line = historyLine(msgs[i]);
      const addLen = (picked.length ? 1 : 0) + line.length; // + "\n" if content
  
      if (total + addLen > MAX_HISTORY_CHARS) break;
  
      picked.push(line);
      total += addLen;
    }
  
    return picked.reverse().join("\n");
  };
  

    
    const addMessage = (role, content) => {
      const msg = { id: `${role[0]}_${Math.random().toString(16).slice(2)}`, role, content, ts: new Date().toISOString() };
      STATE.messages.push(msg);
      renderMsg(msg);
      return msg;
    };

    const system = (text) => addMessage("assistant", `⚠️ ${text}`);

    const setBusy = (v) => {
      STATE.busy = !!v;
      sendBtn.disabled = STATE.busy || !STATE.token;
      modelSelect.disabled = STATE.busy || !STATE.token;
      tokenInput.disabled = STATE.busy;

      header.querySelectorAll("button.ct-btn").forEach((btn) => {
        btn.disabled = STATE.busy;
      });
    };

    // ------------------------------------------------------------
    // UI controls
    // ------------------------------------------------------------
    const UI = {
      showTokenModal: () => {
        modal.classList.add("ct-show");
        modal.setAttribute("aria-hidden", "false");
        tokenInput.value = "";
        tokenInput.focus();
      },
      hideTokenModal: () => {
        modal.classList.remove("ct-show");
        modal.setAttribute("aria-hidden", "true");
      }
    };

    // Modal: click outside card closes
    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) UI.hideTokenModal();
    });

    // ------------------------------------------------------------
    // API client
    // ------------------------------------------------------------
    const ApiClient = (() => {
      const timeoutMs = CFG.api.requestTimeoutMs | 0;
      const baseUrl = normalizeBaseUrl(CFG.api.baseUrl);
      const apiKeyHeaderName = String(CFG.api.apiKeyHeader || "x-api-key");

      const requireToken = () => {
        if (!STATE.token) throw new Error("Not connected.");
        return STATE.token;
      };

      const authHeaders = () => ({ [apiKeyHeaderName]: requireToken() });

      const listModels = async () => {
        const url = joinUrl(baseUrl, CFG.api.modelsPath);
        const res = await abortableFetch(url, { method: "GET", headers: { ...authHeaders() } }, timeoutMs);
        if (!res.ok) {
          const body = await readErrorBody(res);
          throw new Error(`Model list failed (${res.status}). ${body}`.trim());
        }
        const json = await res.json().catch(() => null);
        const arr = json?.data;
        if (!Array.isArray(arr)) throw new Error("Invalid models response (expected {data:[...]}).");
        return arr;
      };

      const infer = async (text, modelId) => {
        const url = joinUrl(baseUrl, CFG.api.inferPath);
        const history = STATE.useHistory ? buildHistoryString() : null;
        
        const payload = {
          text: String(text || ""),
          model: String(modelId || ""),
          history // null si désactivé, sinon string <= 800 chars
        };

        const res = await abortableFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload)
        }, timeoutMs);

        if (!res.ok) {
          const body = await readErrorBody(res);
          throw new Error(`Infer failed (${res.status}). ${body}`.trim());
        }

        const json = await res.json().catch(() => null);
        const content = json?.choices?.[0]?.message?.content ?? null;
        if (!content) throw new Error("Invalid infer response (missing content).");
        return String(content);
      };

      return { listModels, infer };
    })();

    // ------------------------------------------------------------
    // Models UI
    // ------------------------------------------------------------
    const rebuildModelSelect = () => {
      modelSelect.innerHTML = "";

      if (!STATE.token) {
        modelSelect.append($("option", { value: "" }, [document.createTextNode("Connect to load models")]));
        modelSelect.value = "";
        STATE.selectedModel = null;
        setModelPill(null);
        return;
      }

      if (!STATE.models.length) {
        modelSelect.append($("option", { value: "" }, [document.createTextNode("No models")]));
        modelSelect.value = "";
        STATE.selectedModel = null;
        setModelPill(null);
        return;
      }

      const preferred = STATE.selectedModel || CFG.ui.defaultModel;
      for (const m of STATE.models) {
        const id = String(m?.id || "");
        const name = String(m?.model_spec?.name || id || "model");
        modelSelect.append($("option", { value: id }, [document.createTextNode(`${name} (${id})`)]));
      }

      const firstId = String(STATE.models[0]?.id || "");
      const chosen =
        preferred && STATE.models.some((x) => String(x?.id) === String(preferred))
          ? String(preferred)
          : firstId;

      modelSelect.value = chosen;
      STATE.selectedModel = chosen;
      setModelPill(chosen);
    };

    // ------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------
    const Actions = {
      connectWithToken: async () => {
        const tok = String(tokenInput.value || "").trim();
        if (!tok) {
          system("Token is required.");
          return;
        }

        setBusy(true);
        setStatus("connecting…");

        try {
          STATE.token = tok;

          const models = await ApiClient.listModels();
          STATE.models = models;

          rebuildModelSelect();
          setStatus("ready");
          UI.hideTokenModal();

          addMessage("assistant", "Connected.");
        } catch (e) {
          STATE.token = null;
          STATE.models = [];
          rebuildModelSelect();
          setStatus("unavailable");
          system(String(e?.message || e));
        } finally {
          setBusy(false);
        }
      },

      refreshModels: async () => {
        if (!STATE.token) {
          UI.showTokenModal();
          return;
        }
        setBusy(true);
        setStatus("loading…");
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
      },

      send: async () => {
        const v = (textarea.value || "").trim();
        if (!v) return;

        if (!STATE.token) {
          UI.showTokenModal();
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
      }
    };

    // ------------------------------------------------------------
    // Input behavior
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

    sendBtn.addEventListener("click", () => Actions.send());

    modelSelect.addEventListener("change", () => {
      STATE.selectedModel = modelSelect.value || null;
      setModelPill(STATE.selectedModel);
    });

    // ------------------------------------------------------------
    // Public API
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
        UI.hideTokenModal();
      },
      toggle: () => (STATE.open ? API.close() : API.open()),
      clear: () => {
        STATE.messages = [];
        body.innerHTML = "";
        addMessage("assistant", "Chat cleared.");
      },
      disconnect: () => {
        STATE.token = null;
        STATE.models = [];
        STATE.selectedModel = null;
        rebuildModelSelect();
        setStatus("disconnected");
        setModelPill(null);
      },
      getState: () => ({
        connected: !!STATE.token,
        model: STATE.selectedModel,
        baseUrl: normalizeBaseUrl(CFG.api.baseUrl)
      })
    };

    window.CTChat = API;

    // ------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------
    addMessage("assistant", "Ready.");
    setStatus("disconnected");
    rebuildModelSelect();
    autoResize();
    sendBtn.disabled = true;
    refreshHistoryBtn();
    
  } catch (e) {
    console.warn("[CHANGTAN] Fatal boot error:", e);
  }
})();
