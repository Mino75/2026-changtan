/*  CT Inline Chat Module — single-file embed
    - Injects HTML+CSS+JS at runtime
    - Fixed launcher bottom-left (20px, 20px)
    - Emoji-only UI (no icon fonts)
    - Two modes: 😺 Machine (enabled), 👽 General (disabled placeholder)
    - Streaming responses + typing indicator
    - postMessage bridge to an iframe/micro-frontend for history + conversationId
    - Capability discovery via window + optional external mainjs event

    Usage:
      1) Paste this whole file as `CT-chat.js`
      2) On any site: <script src="CT-chat.js"></script>

    Optional configuration before loading:
      <script>
        window.CTChatConfig = {
          theme: { accent: "#2f6bff" },
          endpoints: {
            // Your backend for 😺 mode (supports SSE streaming or chunked fetch)
            machineChat: "https://YOUR_DOMAIN/api/chat/machine"
          },
          bridge: {
            // If you have a micro-frontend iframe that stores history, set its URL:
            iframeSrc: "https://YOUR_DOMAIN/chat-bridge.html",
            // Allowed origins for postMessage (use explicit domains in prod)
            allowedOrigins: ["https://YOUR_DOMAIN"]
          },
          capabilityDiscovery: {
            // Where to look for capabilities exposed by host mainjs
            windowKeyCandidates: ["AppCapabilities", "Capabilities", "mainCapabilities"]
          }
        };
      </script>
      <script src="CT-chat.js"></script>
*/
(() => {
  "use strict";

  // ---------------------------
  // Config (merge defaults + window.CTChatConfig)
  // ---------------------------
  const DEFAULT_CONFIG = {
    theme: {
      accent: "#2f6bff",
      accentSoft: "rgba(47,107,255,0.14)",
      bg: "#0b0f19",
      panel: "#111827",
      panel2: "#0f172a",
      text: "#e5e7eb",
      muted: "rgba(229,231,235,0.65)",
      userBubble: "rgba(47,107,255,0.18)",
      botBubble: "rgba(255,255,255,0.07)",
      border: "rgba(255,255,255,0.10)",
      shadow: "0 16px 48px rgba(0,0,0,0.45)"
    },
    endpoints: {
      machineChat: "" // provide for real backend
    },
    bridge: {
      iframeSrc: "", // set to enable iframe bridge
      allowedOrigins: [] // in prod, set explicit origins (e.g. ["https://example.com"])
    },
    capabilityDiscovery: {
      windowKeyCandidates: ["AppCapabilities", "Capabilities", "mainCapabilities"]
    },
    ui: {
      launcherOffsetPx: 20,
      widthPx: 380,
      heightPx: 560,
      zIndex: 2147483000
    }
  };

  const deepMerge = (a, b) => {
    const out = Array.isArray(a) ? a.slice() : { ...a };
    for (const k in b || {}) {
      const av = out[k];
      const bv = b[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv) && av && typeof av === "object" && !Array.isArray(av)) {
        out[k] = deepMerge(av, bv);
      } else {
        out[k] = bv;
      }
    }
    return out;
  };

  const CONFIG = deepMerge(DEFAULT_CONFIG, window.CTChatConfig || {});
  const THEME = CONFIG.theme;

  // Prevent multiple injections
  if (window.__CTChatInjected) return;
  window.__CTChatInjected = true;

  // ---------------------------
  // DOM helpers
  // ---------------------------
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "style") node.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const c of children) node.append(c);
    return node;
  };

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const nowISO = () => new Date().toISOString();

  // ---------------------------
  // Capability discovery (host mainjs)
  // ---------------------------
  const CapabilityBus = (() => {
    let capabilities = {};
    const listeners = new Set();

    const set = (next) => {
      capabilities = { ...(capabilities || {}), ...(next || {}) };
      for (const fn of listeners) fn(capabilities);
    };

    const get = () => capabilities;

    const onChange = (fn) => {
      listeners.add(fn);
      try { fn(capabilities); } catch {}
      return () => listeners.delete(fn);
    };

    const discover = () => {
      // Heuristic: scan window keys
      for (const key of CONFIG.capabilityDiscovery.windowKeyCandidates) {
        if (window[key] && typeof window[key] === "object") {
          set({ source: "windowKey", key, ...window[key] });
          break;
        }
      }
      // Optional: host can dispatch event with details
      window.addEventListener("CT:capabilities", (ev) => {
        try {
          if (ev && ev.detail && typeof ev.detail === "object") set({ source: "event", ...ev.detail });
        } catch {}
      });
      // Optional: host can call this setter
      window.CTChatSetCapabilities = (obj) => set({ source: "direct", ...(obj || {}) });
    };

    discover();
    return { get, set, onChange };
  })();

  // ---------------------------
  // postMessage bridge (iframe micro-frontend)
  // ---------------------------
  const Bridge = (() => {
    let iframe = null;
    let ready = false;
    let conversationId = null; // null => anonymous
    let history = []; // only used if iframe doesn't provide it
    const pending = new Map(); // reqId => {resolve, reject, t}
    const allowedOrigins = (CONFIG.bridge.allowedOrigins || []).filter(Boolean);

    const isOriginAllowed = (origin) => {
      if (!allowedOrigins.length) return true; // dev-friendly
      return allowedOrigins.includes(origin);
    };

    const mkReqId = () => "req_" + Math.random().toString(16).slice(2) + "_" + Date.now();

    const send = (type, payload = {}) => {
      if (!iframe || !iframe.contentWindow) return;
      iframe.contentWindow.postMessage({ __CTChat: true, type, payload }, "*");
    };

    const request = (type, payload = {}, timeoutMs = 2500) =>
      new Promise((resolve, reject) => {
        const reqId = mkReqId();
        pending.set(reqId, { resolve, reject, t: Date.now() });
        send("request", { reqId, type, payload });
        setTimeout(() => {
          if (pending.has(reqId)) {
            pending.delete(reqId);
            reject(new Error("Bridge timeout"));
          }
        }, timeoutMs);
      });

    const init = () => {
      if (!CONFIG.bridge.iframeSrc) return;

      iframe = el("iframe", {
        class: "pc-bridge",
        src: CONFIG.bridge.iframeSrc,
        title: "CTChatBridge",
        "aria-hidden": "true"
      });
      document.body.appendChild(iframe);

      window.addEventListener("message", (ev) => {
        if (!ev || !ev.data || !ev.data.__CTChat) return;
        if (!isOriginAllowed(ev.origin)) return;

        const { type, payload } = ev.data;
        if (type === "ready") {
          ready = true;
          // Try to pull session state immediately
          request("getSession", {}, 2000)
            .then((res) => {
              conversationId = res?.conversationId ?? null;
              history = Array.isArray(res?.history) ? res.history : history;
              UI.syncSession({ conversationId, history });
            })
            .catch(() => {
              // stay anonymous
              UI.syncSession({ conversationId: null, history: [] });
            });
        } else if (type === "response") {
          const reqId = payload?.reqId;
          if (reqId && pending.has(reqId)) {
            pending.get(reqId).resolve(payload?.data);
            pending.delete(reqId);
          }
        } else if (type === "pushSession") {
          // Bridge pushes session updates (optional)
          conversationId = payload?.conversationId ?? conversationId;
          history = Array.isArray(payload?.history) ? payload.history : history;
          UI.syncSession({ conversationId, history });
        }
      });
    };

    const getSession = async () => {
      if (!iframe || !ready) return { conversationId: null, history: [] };
      try {
        const data = await request("getSession", {}, 2000);
        conversationId = data?.conversationId ?? null;
        history = Array.isArray(data?.history) ? data.history : [];
        return { conversationId, history };
      } catch {
        return { conversationId: null, history: [] };
      }
    };

    const putHistory = async (nextHistory) => {
      history = Array.isArray(nextHistory) ? nextHistory : history;
      if (!iframe || !ready) return;
      // fire-and-forget
      send("putHistory", { conversationId, history });
    };

    const setConversationId = async (id) => {
      conversationId = id ?? null;
      if (!iframe || !ready) return;
      send("setConversationId", { conversationId });
    };

    init();

    return {
      enabled: () => !!CONFIG.bridge.iframeSrc,
      getConversationId: () => conversationId,
      getHistoryLocal: () => history,
      getSession,
      putHistory,
      setConversationId
    };
  })();

  // ---------------------------
  // Streaming client (SSE or chunked fetch)
  // ---------------------------
  const StreamClient = (() => {
    // Strategy:
    // - If server supports SSE: POST -> returns text/event-stream is tricky in fetch.
    // - We'll support:
    //    A) fetch() + ReadableStream where server returns chunks (preferred)
    //    B) EventSource with GET endpoint (optional)
    //
    // Protocol recommendation for chunked fetch:
    //  - Response body chunks are plain text tokens OR JSON lines {"token":"..."}.
    //  - We'll accept both.
    const parseChunk = (chunkText) => {
      // Try JSONL token format
      const tokens = [];
      const lines = chunkText.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const obj = JSON.parse(trimmed);
            if (typeof obj.token === "string") tokens.push(obj.token);
            else if (typeof obj.text === "string") tokens.push(obj.text);
          } catch {
            tokens.push(trimmed);
          }
        } else {
          tokens.push(trimmed);
        }
      }
      return tokens.join("\n");
    };

    const streamFetch = async ({ url, body, headers = {}, onToken, onDone, onError, signal }) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
          signal
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const reader = res.body?.getReader?.();
        if (!reader) {
          const txt = await res.text();
          onToken?.(txt);
          onDone?.();
          return;
        }

        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Emit on reasonable boundaries to avoid fragmenting utf-8
          // We'll flush by lines if present, else by size threshold
          if (buffer.includes("\n")) {
            const parts = buffer.split("\n");
            buffer = parts.pop() || "";
            for (const p of parts) {
              const token = parseChunk(p);
              if (token) onToken?.(token);
            }
          } else if (buffer.length > 512) {
            const token = parseChunk(buffer);
            buffer = "";
            if (token) onToken?.(token);
          }
        }

        if (buffer.trim()) onToken?.(parseChunk(buffer));
        onDone?.();
      } catch (err) {
        if (signal?.aborted) return;
        onError?.(err);
      }
    };

    return { streamFetch };
  })();

  // ---------------------------
  // Intent detection (client-side stub) + function calling contract
  // ---------------------------
  const IntentEngine = (() => {
    // This is a light heuristic stub. The real intent detection should happen server-side.
    const detect = (text, caps) => {
      const t = (text || "").toLowerCase();
      const intents = [];

      if (/(help|support|issue|bug|problem|erreur|problème|aide)/.test(t)) intents.push({ name: "support_request", confidence: 0.62 });
      if (/(price|tarif|pricing|cost|€|\$)/.test(t)) intents.push({ name: "pricing_query", confidence: 0.58 });
      if (/(login|sign in|connexion|mot de passe|password)/.test(t)) intents.push({ name: "auth_issue", confidence: 0.60 });
      if (/(api|webhook|sdk|intégration|integration)/.test(t)) intents.push({ name: "developer_query", confidence: 0.60 });

      // Capabilities signal (host-provided)
      if (caps && typeof caps === "object") {
        if (caps.supportEmail && intents.some(i => i.name === "support_request")) {
          intents.push({ name: "can_offer_support_email", confidence: 0.75, data: { supportEmail: caps.supportEmail } });
        }
      }

      return intents.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 4);
    };

    // Function calling contract (placeholder)
    // Server can choose to call "tools" with args and return tool outputs.
    const toolRegistry = {
      // Example tool: open a support URL
      open_url: ({ url }) => {
        try { window.open(url, "_blank", "noopener,noreferrer"); } catch {}
        return { ok: true };
      }
    };

    return { detect, toolRegistry };
  })();

  // ---------------------------
  // UI injection
  // ---------------------------
  const STYLE = `
  :root{
    --pc-accent:${THEME.accent};
    --pc-accentSoft:${THEME.accentSoft};
    --pc-bg:${THEME.bg};
    --pc-panel:${THEME.panel};
    --pc-panel2:${THEME.panel2};
    --pc-text:${THEME.text};
    --pc-muted:${THEME.muted};
    --pc-userBubble:${THEME.userBubble};
    --pc-botBubble:${THEME.botBubble};
    --pc-border:${THEME.border};
    --pc-shadow:${THEME.shadow};
    --pc-radius:18px;
    --pc-radius2:14px;
    --pc-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
  }

  .pc-root{ position: fixed; left:${CONFIG.ui.launcherOffsetPx}px; bottom:${CONFIG.ui.launcherOffsetPx}px; z-index:${CONFIG.ui.zIndex}; font-family:var(--pc-font); }
  .pc-launcher{
    width:56px; height:56px; border-radius:999px; border:1px solid var(--pc-border);
    background: radial-gradient(120% 120% at 20% 10%, var(--pc-accentSoft) 0%, rgba(255,255,255,0.03) 70%);
    box-shadow: var(--pc-shadow);
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; user-select:none;
  }
  .pc-launcher:focus{ outline:none; box-shadow: 0 0 0 3px rgba(47,107,255,0.25), var(--pc-shadow); }
  .pc-launcher .pc-emoji{ font-size:26px; line-height:1; }
  .pc-launcher .pc-ring{
    position:absolute; inset:-4px; border-radius:999px;
    border:2px solid rgba(47,107,255,0.55);
    pointer-events:none;
    filter: drop-shadow(0 0 12px rgba(47,107,255,0.25));
  }

  .pc-panel{
    position:absolute; left:0; bottom:70px;
    width:${CONFIG.ui.widthPx}px; height:${CONFIG.ui.heightPx}px;
    border-radius:var(--pc-radius);
    border:1px solid var(--pc-border);
    background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
    box-shadow: var(--pc-shadow);
    overflow:hidden;
    transform-origin: bottom left;
    transform: scale(0.92);
    opacity:0;
    pointer-events:none;
    transition: transform .18s ease, opacity .18s ease;
    backdrop-filter: blur(10px);
  }
  .pc-panel.pc-open{ transform: scale(1); opacity:1; pointer-events:auto; }

  .pc-header{
    height:56px; display:flex; align-items:center; justify-content:space-between;
    padding:0 12px 0 14px;
    background: linear-gradient(180deg, rgba(17,24,39,0.85), rgba(15,23,42,0.65));
    border-bottom:1px solid var(--pc-border);
  }
  .pc-title{
    display:flex; align-items:center; gap:10px;
    color:var(--pc-text);
    min-width:0;
  }
  .pc-title .pc-badge{
    padding:6px 10px; border-radius:999px;
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.04);
    font-size:12px; color:var(--pc-muted);
    display:flex; align-items:center; gap:6px;
  }
  .pc-title .pc-name{
    font-size:14px; font-weight:650; letter-spacing:0.2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .pc-actions{ display:flex; align-items:center; gap:8px; }
  .pc-action{
    width:34px; height:34px; border-radius:10px;
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.03);
    color:var(--pc-text);
    cursor:pointer; user-select:none;
    display:flex; align-items:center; justify-content:center;
  }
  .pc-action:hover{ background: rgba(255,255,255,0.06); }
  .pc-action:active{ transform: translateY(1px); }
  .pc-action span{ font-size:16px; }

  .pc-modebar{
    display:flex; gap:8px; padding:10px 12px;
    background: rgba(0,0,0,0.06);
    border-bottom:1px solid var(--pc-border);
  }
  .pc-chip{
    flex:1; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:9px 10px;
    border-radius:999px;
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.03);
    color:var(--pc-muted);
    cursor:pointer; user-select:none;
    font-size:12.5px;
  }
  .pc-chip strong{ color:var(--pc-text); font-weight:650; }
  .pc-chip.pc-active{
    background: rgba(47,107,255,0.14);
    border-color: rgba(47,107,255,0.35);
    color: rgba(229,231,235,0.95);
  }
  .pc-chip.pc-disabled{
    opacity:0.55;
    cursor:not-allowed;
  }

  .pc-body{
    height: calc(100% - 56px - 54px - 84px);
    overflow:auto;
    padding: 14px 12px 18px 12px;
    background: radial-gradient(100% 80% at 0% 0%, rgba(47,107,255,0.10), rgba(0,0,0,0) 60%),
                radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.04), rgba(0,0,0,0) 60%),
                rgba(11,15,25,0.72);
  }
  .pc-msg{
    display:flex; gap:10px; margin: 10px 0;
    align-items:flex-end;
  }
  .pc-msg.pc-user{ justify-content:flex-end; }
  .pc-bubble{
    max-width: 84%;
    padding: 10px 12px;
    border-radius: var(--pc-radius2);
    border:1px solid var(--pc-border);
    color: var(--pc-text);
    font-size: 13.5px;
    line-height: 1.35;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .pc-user .pc-bubble{
    background: var(--pc-userBubble);
    border-color: rgba(47,107,255,0.28);
  }
  .pc-bot .pc-bubble{
    background: var(--pc-botBubble);
  }
  .pc-meta{
    font-size: 10.5px; color: var(--pc-muted);
    margin-top: 6px;
  }
  .pc-avatar{
    width:30px; height:30px; border-radius:12px;
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.03);
    display:flex; align-items:center; justify-content:center;
    flex: 0 0 auto;
  }
  .pc-avatar span{ font-size:16px; }

  .pc-typing{
    display:flex; align-items:center; gap:10px;
    margin: 10px 0;
  }
  .pc-dots{
    display:inline-flex; gap:4px; padding:10px 12px;
    border-radius: var(--pc-radius2);
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.05);
  }
  .pc-dot{
    width:6px; height:6px; border-radius:99px;
    background: rgba(229,231,235,0.55);
    animation: pc-bounce 1.1s infinite ease-in-out;
  }
  .pc-dot:nth-child(2){ animation-delay:.12s; }
  .pc-dot:nth-child(3){ animation-delay:.24s; }
  @keyframes pc-bounce{
    0%, 80%, 100%{ transform: translateY(0); opacity:.55; }
    40%{ transform: translateY(-4px); opacity:1; }
  }

  .pc-footer{
    height:84px;
    display:flex; flex-direction:column; gap:8px;
    padding: 10px 12px;
    background: linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.16));
    border-top: 1px solid var(--pc-border);
  }

  .pc-inputrow{
    display:flex; gap:8px; align-items:flex-end;
  }
  .pc-input{
    flex:1;
    min-height:40px;
    max-height:120px;
    resize:none;
    padding:10px 10px;
    border-radius: 14px;
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.03);
    color: var(--pc-text);
    font-size: 13.5px;
    outline:none;
  }
  .pc-input::placeholder{ color: rgba(229,231,235,0.45); }
  .pc-send{
    width:44px; height:44px; border-radius:14px;
    border:1px solid rgba(47,107,255,0.35);
    background: rgba(47,107,255,0.16);
    color: rgba(229,231,235,0.95);
    cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    user-select:none;
  }
  .pc-send:disabled{
    opacity:0.5; cursor:not-allowed;
  }
  .pc-send span{ font-size:18px; }

  .pc-footmeta{
    display:flex; align-items:center; justify-content:space-between;
    font-size: 11px; color: var(--pc-muted);
  }
  .pc-pill{
    padding:4px 8px; border-radius:999px;
    border:1px solid var(--pc-border);
    background: rgba(255,255,255,0.03);
  }

  .pc-bridge{
    position: fixed;
    left:-9999px; top:-9999px;
    width:1px; height:1px;
    opacity:0;
    border:0;
  }
  `;

  const ROOT = el("div", { class: "pc-root", "data-CT-chat": "1" });
  const styleTag = el("style", { "data-CT-chat-style": "1" }, [document.createTextNode(STYLE)]);

  // Launcher
  const launcher = el("button", {
    class: "pc-launcher",
    type: "button",
    "aria-label": "Open chat",
    onClick: () => UI.toggle()
  }, [
    el("span", { class: "pc-ring" }),
    el("span", { class: "pc-emoji" }, [document.createTextNode("🦜")])
  ]);

  // Panel
  const panel = el("div", { class: "pc-panel", role: "dialog", "aria-modal": "false", "aria-label": "CT chat panel" });

  // Header
  const titleName = el("div", { class: "pc-name" }, [document.createTextNode("CT Chat")]);
  const badge = el("div", { class: "pc-badge", title: "Session" }, [
    document.createTextNode("🧾 "),
    el("span", { "data-pc-session": "1" }, [document.createTextNode("anonyme")])
  ]);

  const closeBtn = el("button", { class: "pc-action", type: "button", "aria-label": "Close", onClick: () => UI.close() }, [
    el("span", {}, [document.createTextNode("✖️")])
  ]);
  const clearBtn = el("button", { class: "pc-action", type: "button", "aria-label": "Clear", onClick: () => UI.clear() }, [
    el("span", {}, [document.createTextNode("🧹")])
  ]);

  const header = el("div", { class: "pc-header" }, [
    el("div", { class: "pc-title" }, [
      el("div", { class: "pc-name" }, [document.createTextNode("🦜  ")]),
      el("div", {}, [titleName]),
      badge
    ]),
    el("div", { class: "pc-actions" }, [clearBtn, closeBtn])
  ]);

  // Mode bar
  const chipMachine = el("button", {
    class: "pc-chip pc-active",
    type: "button",
    "data-mode": "machine",
    onClick: () => UI.setMode("machine")
  }, [document.createTextNode("😺 "), el("strong", {}, [document.createTextNode("Machine")]), document.createTextNode("  •  Intent + tools")]);

  const chipGeneral = el("button", {
    class: "pc-chip pc-disabled",
    type: "button",
    disabled: "true",
    "data-mode": "general",
    title: "Désactivé pour l’instant",
    onClick: () => UI.setMode("general")
  }, [document.createTextNode("👽 "), el("strong", {}, [document.createTextNode("General")]), document.createTextNode("  •  LLM (off)")]);

  const modebar = el("div", { class: "pc-modebar" }, [chipMachine, chipGeneral]);

  // Body
  const body = el("div", { class: "pc-body" });

  // Footer
  const textarea = el("textarea", {
    class: "pc-input",
    placeholder: "Écrire un message… (Shift+Entrée = nouvelle ligne)",
    rows: "1"
  });

  const sendBtn = el("button", { class: "pc-send", type: "button" }, [el("span", {}, [document.createTextNode("📨")])]);

  const footMetaLeft = el("span", { class: "pc-pill", "data-pc-caps": "1" }, [document.createTextNode("capabilities: ∅")]);
  const footMetaRight = el("span", { class: "pc-pill", "data-pc-mode": "1" }, [document.createTextNode("mode: 😺")]);

  const footer = el("div", { class: "pc-footer" }, [
    el("div", { class: "pc-inputrow" }, [textarea, sendBtn]),
    el("div", { class: "pc-footmeta" }, [footMetaLeft, footMetaRight])
  ]);

  panel.append(header, modebar, body, footer);
  ROOT.append(launcher, panel);

  // Inject into DOM
  document.head.appendChild(styleTag);
  document.body.appendChild(ROOT);

  // ---------------------------
  // UI state + message model
  // ---------------------------
  const State = {
    open: false,
    mode: "machine", // "machine" | "general"
    conversationId: null, // null => anonymous
    historyEnabled: false,
    messages: [],
    streaming: {
      abort: null,
      active: false
    },
    capabilities: {}
  };

  const UI = (() => {
    const sessionNode = badge.querySelector("[data-pc-session]");
    const capsNode = footMetaLeft;
    const modeNode = footMetaRight;

    const scrollToBottom = () => {
      body.scrollTop = body.scrollHeight;
    };

    const renderMessage = (msg) => {
      const isUser = msg.role === "user";
      const wrapper = el("div", { class: `pc-msg ${isUser ? "pc-user" : "pc-bot"}` });

      if (!isUser) {
        wrapper.append(el("div", { class: "pc-avatar" }, [el("span", {}, [document.createTextNode(msg.mode === "general" ? "👽" : "😺")])]));
      }

      const bubble = el("div", { class: "pc-bubble" });
      bubble.innerHTML = escapeHtml(msg.content || "");
      const meta = el("div", { class: "pc-meta" }, [
        document.createTextNode(`${isUser ? "vous" : "assistant"} • ${new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
      ]);

      const container = el("div", { style: "display:flex;flex-direction:column;gap:4px;max-width:84%;" }, [bubble, meta]);

      wrapper.append(container);

      if (isUser) {
        wrapper.append(el("div", { class: "pc-avatar" }, [el("span", {}, [document.createTextNode("🙂")])]));
      }

      body.append(wrapper);
      scrollToBottom();
    };

    const renderTyping = (on) => {
      const existing = body.querySelector("[data-pc-typing]");
      if (on) {
        if (existing) return;
        const node = el("div", { class: "pc-typing", "data-pc-typing": "1" }, [
          el("div", { class: "pc-avatar" }, [el("span", {}, [document.createTextNode(State.mode === "general" ? "👽" : "😺")])]),
          el("div", { class: "pc-dots" }, [
            el("div", { class: "pc-dot" }),
            el("div", { class: "pc-dot" }),
            el("div", { class: "pc-dot" })
          ])
        ]);
        body.append(node);
        scrollToBottom();
      } else {
        existing?.remove();
      }
    };

    const upsertStreamingBotBubble = () => {
      let node = body.querySelector("[data-pc-streaming]");
      if (node) return node;

      const wrapper = el("div", { class: "pc-msg pc-bot", "data-pc-streaming": "1" });
      wrapper.append(el("div", { class: "pc-avatar" }, [el("span", {}, [document.createTextNode(State.mode === "general" ? "👽" : "😺")])]));

      const bubble = el("div", { class: "pc-bubble", "data-pc-streaming-bubble": "1" }, []);
      const meta = el("div", { class: "pc-meta" }, [document.createTextNode("assistant • en cours")]);
      const container = el("div", { style: "display:flex;flex-direction:column;gap:4px;max-width:84%;" }, [bubble, meta]);

      wrapper.append(container);
      body.append(wrapper);
      scrollToBottom();
      return wrapper;
    };

    const finalizeStreamingBotBubble = () => {
      const wrapper = body.querySelector("[data-pc-streaming]");
      if (!wrapper) return null;
      wrapper.removeAttribute("data-pc-streaming");

      const bubble = wrapper.querySelector("[data-pc-streaming-bubble]");
      bubble?.removeAttribute("data-pc-streaming-bubble");
      const meta = wrapper.querySelector(".pc-meta");
      if (meta) meta.textContent = `assistant • ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      return bubble?.textContent || "";
    };

    const setMode = (mode) => {
      if (mode === "general") return; // disabled for now
      State.mode = mode;

      chipMachine.classList.toggle("pc-active", mode === "machine");
      chipGeneral.classList.toggle("pc-active", mode === "general");

      modeNode.textContent = `mode: ${mode === "general" ? "👽" : "😺"}`;
    };

    const syncSession = ({ conversationId, history }) => {
      State.conversationId = conversationId ?? null;
      State.historyEnabled = !!State.conversationId;
      sessionNode.textContent = State.conversationId ? `id:${String(State.conversationId).slice(0, 10)}…` : "anonyme";

      // If we got history and we currently have no messages, preload it
      if (Array.isArray(history) && history.length && State.messages.length === 0) {
        State.messages = history.map((m) => ({
          id: m.id || ("h_" + Math.random().toString(16).slice(2)),
          role: m.role || "assistant",
          content: m.content || "",
          ts: m.ts || nowISO(),
          mode: m.mode || "machine"
        }));
        body.innerHTML = "";
        for (const m of State.messages) renderMessage(m);
      }
    };

    const open = () => {
      State.open = true;
      panel.classList.add("pc-open");
      textarea.focus();
      scrollToBottom();
      // try to fetch session if bridge enabled
      if (Bridge.enabled()) Bridge.getSession().then(syncSession).catch(() => {});
    };

    const close = () => {
      State.open = false;
      panel.classList.remove("pc-open");
    };

    const toggle = () => (State.open ? close() : open());

    const clear = () => {
      State.messages = [];
      body.innerHTML = "";
      // Keep session id; clear remote history too
      Bridge.putHistory([]).catch(() => {});
      renderSystem("🧹 Historique local effacé.");
    };

    const renderSystem = (text) => {
      const msg = {
        id: "sys_" + Math.random().toString(16).slice(2),
        role: "assistant",
        content: text,
        ts: nowISO(),
        mode: State.mode
      };
      State.messages.push(msg);
      renderMessage(msg);
    };

    const updateCapsBadge = (caps) => {
      const keys = Object.keys(caps || {}).filter(k => k !== "source");
      capsNode.textContent = `capabilities: ${keys.length ? keys.slice(0, 3).join(", ") + (keys.length > 3 ? "…" : "") : "∅"}`;
    };

    return {
      open, close, toggle, clear,
      setMode,
      renderMessage,
      renderTyping,
      upsertStreamingBotBubble,
      finalizeStreamingBotBubble,
      syncSession,
      renderSystem,
      updateCapsBadge
    };
  })();

  // ---------------------------
  // Message send pipeline
  // ---------------------------
  const Chat = (() => {
    const addMsg = (role, content) => {
      const msg = {
        id: (role[0] + "_" + Math.random().toString(16).slice(2)),
        role,
        content,
        ts: nowISO(),
        mode: State.mode
      };
      State.messages.push(msg);
      UI.renderMessage(msg);
      return msg;
    };

    const persist = () => {
      // Only persist if we have a conversationId OR bridge chooses to store anon sessions
      Bridge.putHistory(State.messages).catch(() => {});
    };

    const stopStreaming = () => {
      if (State.streaming.abort) {
        State.streaming.abort.abort();
        State.streaming.abort = null;
      }
      State.streaming.active = false;
      UI.renderTyping(false);
    };

    const callMachine = async (userText) => {
      const url = CONFIG.endpoints.machineChat;
      if (!url) {
        UI.renderSystem("⚠️ Endpoint machineChat non configuré. Renseignez window.CTChatConfig.endpoints.machineChat.");
        return;
      }

      const caps = CapabilityBus.get();
      const intents = IntentEngine.detect(userText, caps);

      // Server payload contract (suggestion):
      // - conversationId may be null for anonymous
      // - capabilities and intents help server tool-selection / function-calling
      const payload = {
        conversationId: State.conversationId, // null => anonymous
        mode: "machine",
        user: { text: userText },
        context: {
          intents,
          capabilities: caps
        },
        history: State.messages.slice(-30).map(m => ({ role: m.role, content: m.content, ts: m.ts, mode: m.mode }))
      };

      UI.renderTyping(true);

      State.streaming.abort = new AbortController();
      State.streaming.active = true;

      let aggregated = "";
      const wrapper = UI.upsertStreamingBotBubble();
      const bubble = wrapper.querySelector(".pc-bubble");

      const onToken = (tok) => {
        aggregated += tok;
        bubble.textContent = aggregated;
        bodyScrollSafe();
      };

      const onDone = () => {
        UI.renderTyping(false);
        State.streaming.active = false;
        const finalText = UI.finalizeStreamingBotBubble() || aggregated || "";
        addMsg("assistant", finalText);
        persist();
      };

      const onError = (err) => {
        UI.renderTyping(false);
        State.streaming.active = false;
        // Remove streaming bubble
        body.querySelector("[data-pc-streaming]")?.remove();
        UI.renderSystem(`⚠️ Erreur streaming: ${String(err?.message || err)}`);
      };

      const bodyScrollSafe = () => {
        // Keep pinned near bottom if user didn't scroll up
        const nearBottom = (body.scrollHeight - body.scrollTop - body.clientHeight) < 120;
        if (nearBottom) body.scrollTop = body.scrollHeight;
      };

      StreamClient.streamFetch({
        url,
        body: payload,
        onToken,
        onDone,
        onError,
        signal: State.streaming.abort.signal
      });
    };

    const callGeneral = async () => {
      UI.renderSystem("👽 Mode General désactivé pour l’instant.");
    };

    const send = async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;

      stopStreaming();
      addMsg("user", trimmed);
      persist();

      if (State.mode === "machine") await callMachine(trimmed);
      else await callGeneral(trimmed);
    };

    return { send, stopStreaming };
  })();

  // ---------------------------
  // Input handlers
  // ---------------------------
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
    if (e.key === "Escape") UI.close();
  });

  sendBtn.addEventListener("click", () => {
    const v = textarea.value;
    textarea.value = "";
    autoResize();
    Chat.send(v);
  });

  // Click outside panel to close (soft)
  document.addEventListener("mousedown", (e) => {
    if (!State.open) return;
    const t = e.target;
    if (!t) return;
    if (ROOT.contains(t)) return;
    UI.close();
  });

  // ---------------------------
  // Initial system message + capability updates
  // ---------------------------
  UI.renderSystem("🦜 Module chargé. 😺 mode actif. 👽 mode inactif.");
  CapabilityBus.onChange((caps) => {
    State.capabilities = caps || {};
    UI.updateCapsBadge(State.capabilities);
  });

  // If bridge enabled, try to get session right away (without forcing open)
  if (Bridge.enabled()) {
    Bridge.getSession()
      .then((s) => UI.syncSession(s))
      .catch(() => UI.syncSession({ conversationId: null, history: [] }));
  }

  // Public API (optional)
  window.CTChat = {
    open: UI.open,
    close: UI.close,
    toggle: UI.toggle,
    clear: UI.clear,
    send: (text) => Chat.send(text),
    stop: () => Chat.stopStreaming(),
    getState: () => ({ ...State, messages: State.messages.slice() })
  };
})();
