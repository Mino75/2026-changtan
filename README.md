# 🦜 Changtan

**Changtan** (長談) means *"long conversation"*.  
It is an embeddable chat widget designed to integrate into any web page via a single `<script>` tag.

---

## 📦 What it is

Changtan is a standalone frontend widget (`main.js`) that renders a floating chat panel. It communicates with an external HTTP API to fetch available models and send messages. Currently, responses are received all at once — **streaming support is coming**.

It has **no client-side dependencies** — no framework, no third-party library.

---

## 🗂️ Project structure

```
changtan/
├── main.js          # Embeddable widget (standalone bundle)
├── index.html       # Demo page
├── styles.js        # Demo page CSS (injected via JS)
├── server.js        # Express server — serves static files
├── package.json
├── Dockerfile
└── .github/
    └── workflows/
        └── main.yaml  # Manual CI/CD to Docker Hub
```

---

## 🚀 Setup & running

### Locally

```bash
npm install
node server.js
# → http://localhost:3000
```

### Via Docker

```bash
docker build -t changtan .
docker run -p 3000:3000 changtan
```

### Via Docker Hub (CI/CD)

The GitHub Actions workflow `.github/workflows/main.yaml` is triggered **manually** (`workflow_dispatch`). It builds the image and pushes it to Docker Hub using the `DOCKER_HUB_USER` and `DOCKER_HUB_TOKEN` secrets.

---

## 🔌 Widget integration

Add these two blocks to your page **before** `</body>`:

```html
<script>
  window.CTChatConfig = {
    title: "Changtan",
    launcherEmoji: "🦜",
    api: {
      baseUrl: "https://your-api.example.com"
    }
  };
</script>

<script src="https://changtan.kahiether.com/main.js" defer></script>
```

The widget initializes automatically on load. A global `window.CTChat` instance is exposed.

---

## ⚙️ Configuration (`window.CTChatConfig`)

All keys are optional — defaults are applied if omitted.

| Key | Type | Default | Description |
|---|---|---|---|
| `title` | string | `"Changtan"` | Name displayed in the header |
| `launcherEmoji` | string | `"🦜"` | Floating button emoji |
| `modeLabel` | string | `"Chat"` | Mode label |
| `zIndex` | number | `2147483000` | Widget z-index |
| `width` | number | `380` | Panel width (px) |
| `height` | number | `560` | Panel height (px) |
| `offset` | number | `20` | Margin from bottom-left edge (px) |
| `theme` | object | see below | Color tokens |
| `api` | object | see below | API configuration |
| `ui.defaultModel` | string \| null | `null` | Pre-selected model |

### 🎨 `theme`

```js
theme: {
  accent: "#2f6bff",
  bg:     "#0b0f19",
  panel:  "#111827",
  text:   "#e5e7eb",
  muted:  "rgba(229,231,235,0.65)",
  border: "rgba(255,255,255,0.12)",
  shadow: "0 16px 48px rgba(0,0,0,0.45)"
}
```

### 🔧 `api`

```js
api: {
  baseUrl:          "https://mpanatitra.kahiether.com",
  modelsPath:       "/getAvailableTextModels",
  inferPath:        "/inferChatWithoutStream",
  apiKeyHeader:     "x-api-key",
  requestTimeoutMs: 25000
}
```

---

## 🔑 Authentication

The widget does **not** persist the token (no `localStorage`, no cookie). The token is entered via a password field in a modal, then kept **in memory only** for the duration of the session.

The modal opens via the 🔑 button in the panel header.

---

## 🌐 Expected API endpoints

### `GET {baseUrl}/getAvailableTextModels`

- **Header**: `x-api-key: <token>`
- **Expected response**:

```json
{
  "data": [
    { "id": "model-id", "model_spec": { "name": "Model name" } }
  ]
}
```

### `POST {baseUrl}/inferChatWithoutStream`

- **Headers**: `x-api-key: <token>`, `Content-Type: application/json`
- **Body**:

```json
{ "text": "user message", "model": "model-id" }
```

- **Expected response**:

```json
{
  "choices": [{ "message": { "content": "model reply" } }]
}
```

> ⏳ **Streaming** support is planned — a streaming endpoint will be added in an upcoming release.

---

## 🧩 Public API (`window.CTChat`)

```js
CTChat.open()        // Open the panel
CTChat.close()       // Close the panel
CTChat.toggle()      // Toggle open/closed
CTChat.clear()       // Clear the displayed history
CTChat.disconnect()  // Reset the token and models
CTChat.getState()    // Returns { connected, model, baseUrl }
```

---

## 🖌️ CSS customization

The floating button exposes the `.ct-launcher` class. Example override without modifying the bundle:

```css
.ct-launcher {
  width: 78px !important;
  height: 78px !important;
  font-size: 32px !important;
}
```

---

## 🩺 Server health check

```
GET /health
→ { "status": "ok", "uptime": 123.45, "timestamp": "..." }
```

---

## 📋 Notes

- Mixed content is blocked by browsers — use `https://` / `wss://` endpoints only in production.
- Server-side caching is disabled (`no-store`) to simplify development iterations.
- Only one widget per page: the `window.__CHANGTAN_EMBED__` flag prevents double initialization.

---

## 📄 License

MIT
