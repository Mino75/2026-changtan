(() => {
  "use strict";

  try {
    // ------------------------------------------------------------
    // CONFIG (host sets window.CTChatConfig before loading, optional)
    // ------------------------------------------------------------
    const DEFAULTS = {
      wsEndpoints: [],              // REQUIRED: array of websocket URLs
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
      // Optional: external session id if you have one
      conversationId: null,
      // Optional: identify host product/tenant
      client: { name: "embed", version: "1.0.0" }
    };

    const deepMerge = (a, b) => {
      const out = { ...(a || {}) };
      for (const k in (b || {})) {
        const av = out[k], bv = b[k];
        if (av && bv && typeof av === "object" && typeof bv === "object" && !Array.isArray(av) && !Array.isArray(bv)) {
          out[k] = deepMerge(av, bv);
        } else out[k] = bv;
      }
      return out;
    };

    const CFG = deepMerge(DEFAULTS, window.CTChatConfig || {});
    if (!Array.isArray(CFG.wsEndpoints)) CFG.wsEndpoints = [];
    CFG.wsEndpoints = CFG.wsEndpoints.filter(Boolean);

    // Prevent double injection
    if (window.__CHANGTAN_EMBED__) return;
    window.__CHANGTAN_EMBED__ = true;

    // ------------------------------------------------------------
    // DOM
    // ------------------------------------------------------------
    const $ = (tag, attrs = {}, children = []) => {
      const n = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") n.className = v;
        else if (k === "style") n.setAttribute("style", v);
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
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

      .ct-root{ position:fixed; left:${CFG.offset}px; bottom:${CFG.offset}px; z-index:${CFG.zIndex}; font-family:var(--ct-font); }
      .ct-launcher{
        width:56px;height:56px;border-radius:999px;border:1px solid var(--ct-border);
        background: radial-gradient(120% 120% at 20% 10%, rgba(47,107,255,0.18) 0%, rgba(255,255,255,0.03) 70%);
        box-shadow:var(--ct-shadow);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;user-select:none;
      }
      .ct-panel{
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
      .ct-panel.ct-open{ transform:scale(1);opacity:1;pointer-events:auto; }

      .ct-header{
        height:56px;display:flex;align-items:center;justify-content:space-between;
        padding:0 12px 0 14px;
        background: linear-gradient(180deg, rgba(17,24,39,0.9), rgba(15,23,42,0.7));
        border-bottom:1px solid var(--ct-border);
        color:var(--ct-text);
      }
      .ct-title{ display:flex;align-items:center;gap:10px; min-width:0; }
      .ct-name{ font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      .ct-pill{
        padding:5px 10px;border-radius:999px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color:var(--ct-muted);
        font-size:11px;
      }
      .ct-actions{ display:flex;gap:8px; }
      .ct-btn{
        width:34px;height:34px;border-radius:10px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color:var(--ct-text);cursor:pointer;user-select:none;
        display:flex;align-items:center;justify-content:center;
      }
      .ct-btn:hover{ background: rgba(255,255,255,0.06); }

      .ct-body{
        height: calc(100% - 56px - 84px);
        overflow:auto;
        padding: 14px 12px 18px 12px;
      }
      .ct-msg{ display:flex;gap:10px;margin:10px 0;align-items:flex-end; }
      .ct-msg.ct-user{ justify-content:flex-end; }
      .ct-bubble{
        max-width:84%;
        padding:10px 12px;border-radius:var(--ct-radius2);
        border:1px solid var(--ct-border);
        color:var(--ct-text);
        font-size:13.5px;line-height:1.35;
        white-space: pre-wrap; word-break: break-word;
        background: rgba(255,255,255,0.06);
      }
      .ct-user .ct-bubble{
        background: rgba(47,107,255,0.18);
        border-color: rgba(47,107,255,0.28);
      }
      .ct-meta{ font-size:10.5px;color:var(--ct-muted);margin-top:6px; }

      .ct-footer{
        height:84px;display:flex;flex-direction:column;gap:8px;
        padding:10px 12px;
        border-top:1px solid var(--ct-border);
        background: rgba(0,0,0,0.10);
      }
      .ct-row{ display:flex;gap:8px;align-items:flex-end; }
      .ct-input{
        flex:1;min-height:40px;max-height:120px;resize:none;
        padding:10px 10px;border-radius:14px;border:1px solid var(--ct-border);
        background: rgba(255,255,255,0.03);
        color: var(--ct-text);
        font-size:13.5px;outline:none;
      }
      .ct-input::placeholder{ color: rgba(229,231,235,0.45); }
      .ct-send{
        width:44px;height:44px;border-radius:14px;
        border:1px solid rgba(47,107,255,0.35);
        background: rgba(47,107,255,0.16);
        color: rgba(229,231,235,0.95);
        cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        user-select:none;
      }
      .ct-send:disabled{ opacity:0.5; cursor:not-allowed; }

      .ct-status{ display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--ct-muted); }
      .ct-status b{ color: rgba(229,231,235,0.9); font-weight:650; }
    `;

    const styleTag = $("style", { "data-changtan-style": "1" }, [document.createTextNode(CSS)]);
    document.head.appendChild(styleTag);

    const root = $("div", { class: "ct-root", "data-changtan": "1" });
    const panel = $("div", { class: "ct-panel", role: "dialog", "aria-label": "Changtan chat" });

    const sessionPill = $("span", { class: "ct-pill", "data-ct-session": "1" }, [
      document.createTextNode(CFG.conversationId ? `id:${String(CFG.conversationId).slice(0, 10)}…` : "anonymous")
    ]);
    const statusPill = $("span", { class: "ct-pill", "data-ct-status": "1" }, [document.createTextNode("disconnected")]);

    const header = $("div", { class: "ct-header" }, [
      $("div", { class: "ct-title" }, [
        $("div", { class: "ct-name" }, [document.createTextNode(`${CFG.launcherEmoji} ${CFG.title}`)]),
        sessionPill
      ]),
      $("div", { class: "ct-actions" }, [
        $("button", { class: "ct-btn", type: "button", title: "Clear", onClick: () => API.clear() }, [document.createTextNode("🧹")]),
        $("button", { class: "ct-btn", type: "button", title: "Close", onClick: () => API.close() }, [document.createTextNode("✖️")])
      ])
    ]);

    const body = $("div", { class: "ct-body" });
    const textarea = $("textarea", { class: "ct-input", rows: "1", placeholder: "Type a message… (Shift+Enter = new line)" });
    const sendBtn = $("button", { class: "ct-send", type: "button" }, [document.createTextNode("📨")]);

    const footer = $("div", { class: "ct-footer" }, [
      $("div", { class: "ct-row" }, [textarea, sendBtn]),
      $("div", { class: "ct-status" }, [
        $("span", {}, [document.createTextNode("Mode: "), $("b", {}, [document.createTextNode(CFG.modeLabel)])]),
        statusPill
      ])
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

    // Close on outside click
    document.addEventListener("mousedown", (e) => {
      if (!STATE.open) return;
      if (root.contains(e.target)) return;
      API.close();
    });

    // ------------------------------------------------------------
    // STATE + RENDERING
    // ------------------------------------------------------------
    const STATE = {
      open: false,
      connecting: false,
      connected: false,
      ws: null,
      endpointIndex: 0,
      conversationId: CFG.conversationId,
      streaming: false,
      messages: [],      // {role,user|assistant,content,ts}
      currentAssistantId: null
    };

    const setStatus = (txt) => { statusPill.textContent = txt; };

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
      return { wrap, bubble };
    };

    const addMessage = (role, content) => {
      const msg = { id: `${role[0]}_${Math.random().toString(16).slice(2)}`, role, content, ts: new Date().toISOString() };
      STATE.messages.push(msg);
      renderMsg(msg);
      return msg;
    };

    const upsertStreamingAssistant = () => {
      // Find an existing streaming bubble
      let node = body.querySelector('[data-ct-stream="1"]');
      if (node) return node;

      const wrap = $("div", { class: "ct-msg ct-bot", "data-ct-stream": "1" });
      const bubble = $("div", { class: "ct-bubble", "data-ct-stream-bubble": "1" }, []);
      const meta = $("div", { class: "ct-meta" }, [document.createTextNode("assistant • streaming")]);
      const stack = $("div", { style: "display:flex;flex-direction:column;gap:4px;max-width:84%;" }, [bubble, meta]);
      wrap.append(stack);
      body.append(wrap);
      scrollToBottom();
      return wrap;
    };

    const finalizeStreamingAssistant = () => {
      const wrap = body.querySelector('[data-ct-stream="1"]');
      if (!wrap) return "";
      wrap.removeAttribute("data-ct-stream");
      const bubble = wrap.querySelector('[data-ct-stream-bubble="1"]');
      bubble?.removeAttribute("data-ct-stream-bubble");
      const meta = wrap.querySelector(".ct-meta");
      if (meta) meta.textContent = `assistant • ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      return bubble ? bubble.textContent : "";
    };

    const system = (text) => addMessage("assistant", `⚠️ ${text}`);

    // ------------------------------------------------------------
    // WEBSOCKET STREAMING (no client intents, pure relay)
    // Contract (suggested):
    // Client -> Server: { type:"user", conversationId, text, meta }
    // Server -> Client:
    //   { type:"meta", conversationId }
    //   { type:"delta", text:"..." }   (stream tokens)
    //   { type:"done" }
    //   { type:"error", message:"..." }
    // ------------------------------------------------------------
    const WS = (() => {
      const nextEndpoint = () => {
        if (!CFG.wsEndpoints.length) return null;
        const idx = STATE.endpointIndex % CFG.wsEndpoints.length;
        return { url: CFG.wsEndpoints[idx], idx };
      };

      const close = () => {
        try { STATE.ws?.close?.(); } catch {}
        STATE.ws = null;
        STATE.connected = false;
        STATE.connecting = false;
        setStatus("disconnected");
      };

      const connect = async () => {
        if (STATE.connected || STATE.connecting) return true;
        if (!CFG.wsEndpoints.length) {
          setStatus("missing endpoint");
          system("No WebSocket endpoint configured (CTChatConfig.wsEndpoints).");
          return false;
        }

        STATE.connecting = true;
        setStatus("connecting…");

        // Attempt endpoints sequentially (failover)
        for (let attempt = 0; attempt < CFG.wsEndpoints.length; attempt++) {
          const ep = nextEndpoint();
          if (!ep) break;

          const ok = await new Promise((resolve) => {
            let ws;
            try {
              ws = new WebSocket(ep.url);
            } catch (e) {
              return resolve(false);
            }

            let settled = false;
            const settle = (v) => {
              if (settled) return;
              settled = true;
              resolve(v);
            };

            const timer = setTimeout(() => {
              try { ws.close(); } catch {}
              settle(false);
            }, 2500);

            ws.onopen = () => {
              clearTimeout(timer);
              STATE.ws = ws;
              STATE.connected = true;
              STATE.connecting = false;
              setStatus("connected");
              settle(true);
            };

            ws.onerror = () => {
              clearTimeout(timer);
              try { ws.close(); } catch {}
              settle(false);
            };

            ws.onclose = () => {
              // If it closes after being connected, reflect it
              if (STATE.ws === ws) close();
            };

            ws.onmessage = (ev) => {
              handleServerMessage(ev.data);
            };
          });

          if (ok) return true;
          STATE.endpointIndex = (STATE.endpointIndex + 1) % CFG.wsEndpoints.length;
        }

        STATE.connecting = false;
        STATE.connected = false;
        setStatus("unavailable");
        system("WebSocket connection failed. Please try again later.");
        return false;
      };

      const sendUser = async (text) => {
        const ok = await connect();
        if (!ok || !STATE.ws) return;

        // Start streaming UI
        STATE.streaming = true;
        const wrap = upsertStreamingAssistant();
        const bubble = wrap.querySelector('[data-ct-stream-bubble="1"]');
        if (bubble) bubble.textContent = "";

        const payload = {
          type: "user",
          conversationId: STATE.conversationId,
          text,
          meta: {
            client: CFG.client,
            page: { url: location.href, title: document.title },
            ts: Date.now()
          }
        };

        try {
          STATE.ws.send(JSON.stringify(payload));
        } catch (e) {
          STATE.streaming = false;
          body.querySelector('[data-ct-stream="1"]')?.remove();
          system("Failed to send message. Connection is not available.");
          close();
        }
      };

      const handleServerMessage = (raw) => {
        let msg = null;
        try { msg = JSON.parse(raw); } catch {
          // If server sends plain text tokens, treat as delta
          msg = { type: "delta", text: String(raw || "") };
        }

        if (!msg || typeof msg !== "object") return;

        if (msg.type === "meta" && msg.conversationId) {
          STATE.conversationId = msg.conversationId;
          sessionPill.textContent = `id:${String(msg.conversationId).slice(0, 10)}…`;
          return;
        }

        if (msg.type === "delta") {
          const wrap = upsertStreamingAssistant();
          const bubble = wrap.querySelector('[data-ct-stream-bubble="1"]');
          if (bubble) bubble.textContent += (msg.text || "");
          scrollToBottom();
          return;
        }

        if (msg.type === "done") {
          STATE.streaming = false;
          const final = finalizeStreamingAssistant();
          addMessage("assistant", final || "");
          return;
        }

        if (msg.type === "error") {
          STATE.streaming = false;
          body.querySelector('[data-ct-stream="1"]')?.remove();
          system(msg.message ? String(msg.message) : "Streaming error.");
          return;
        }
      };

      return { connect, close, sendUser };
    })();

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

    sendBtn.addEventListener("click", () => {
      const v = (textarea.value || "").trim();
      if (!v) return;
      textarea.value = "";
      autoResize();
      addMessage("user", v);
      WS.sendUser(v);
    });

    // ------------------------------------------------------------
    // PUBLIC API (generic + future-proof)
    // ------------------------------------------------------------
    const API = {
      open: () => {
        STATE.open = true;
        panel.classList.add("ct-open");
        textarea.focus();
        scrollToBottom();
        // Connect lazily but quickly, without blocking UI
        WS.connect();
      },
      close: () => {
        STATE.open = false;
        panel.classList.remove("ct-open");
      },
      toggle: () => (STATE.open ? API.close() : API.open()),
      clear: () => {
        STATE.messages = [];
        body.innerHTML = "";
        system("Chat cleared.");
      },
      setConversationId: (id) => {
        STATE.conversationId = id || null;
        sessionPill.textContent = STATE.conversationId ? `id:${String(STATE.conversationId).slice(0, 10)}…` : "anonymous";
      },
      getState: () => ({
        open: STATE.open,
        connected: STATE.connected,
        connecting: STATE.connecting,
        conversationId: STATE.conversationId,
        endpointIndex: STATE.endpointIndex,
        endpoints: CFG.wsEndpoints.slice(),
        messages: STATE.messages.slice()
      })
    };

    window.CTChat = API;

    // Minimal boot message (kept short; all English)
    addMessage("assistant", "Ready. Messages are streamed from the server.");
    setStatus(CFG.wsEndpoints.length ? "disconnected" : "missing endpoint");
    autoResize();

  } catch (e) {
    // Never break host page
    console.warn("[CHANGTAN] Fatal boot error:", e);
  }
})();
