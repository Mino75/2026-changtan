// styles.js — Feature demonstrator styling bundle
// Purpose: keep index.html clean and ship a single styling payload.
// Loads by injecting a <style> tag (no build tooling required).

(function () {
  "use strict";

  const css = `
:root{
  --bgA:#06113a;
  --bgB:#030922;
  --card:rgba(255,255,255,.06);
  --border:rgba(255,255,255,.12);
  --text:rgba(255,255,255,.92);
  --muted:rgba(255,255,255,.70);
  --accent:#2f6bff;
  --radius:18px;
  --radius2:16px;
  --shadow:0 20px 70px rgba(0,0,0,.55);
  --font: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";
}

*{ box-sizing:border-box; }
html,body{ height:100%; }
body{
  margin:0;
  font-family:var(--font);
  color:var(--text);
  background:
    radial-gradient(1200px 800px at 20% 10%, rgba(47,107,255,.28) 0%, rgba(47,107,255,0) 55%),
    radial-gradient(900px 700px at 85% 20%, rgba(105,255,232,.12) 0%, rgba(105,255,232,0) 60%),
    linear-gradient(180deg, var(--bgA), var(--bgB));
}

.wrap{
  max-width:1180px;
  margin:0 auto;
  padding:46px 18px 70px;
}

.panel{
  border:1px solid var(--border);
  border-radius:var(--radius);
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.04));
  box-shadow:var(--shadow);
}

.hero{
  padding:22px;
  display:grid;
  grid-template-columns: 1.25fr .75fr;
  gap:16px;
  align-items:start;
}

@media (max-width: 980px){
  .hero{ grid-template-columns: 1fr; }
}

.kicker{
  display:flex;
  align-items:center;
  gap:10px;
  color:var(--muted);
  font-size:13px;
  letter-spacing:.2px;
  flex-wrap:wrap;
}

.badge{
  padding:6px 10px;
  border-radius:999px;
  border:1px solid var(--border);
  background: rgba(255,255,255,.05);
  color: var(--muted);
  font-size:12px;
  white-space:nowrap;
}

.badge--muted{
  border-color: rgba(255,255,255,.10);
  background: rgba(0,0,0,.12);
}

h1{
  margin:12px 0 10px;
  font-size:38px;
  line-height:1.08;
  font-weight:780;
  letter-spacing:-.6px;
}

.sub{
  margin:0;
  color:var(--muted);
  line-height:1.6;
  font-size:14.8px;
  max-width:78ch;
}

.cta-row{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-top:16px;
}

.btn{
  appearance:none;
  border:1px solid rgba(47,107,255,.35);
  background: rgba(47,107,255,.14);
  color: rgba(255,255,255,.92);
  padding:10px 12px;
  border-radius:14px;
  cursor:pointer;
  font-weight:750;
  font-size:13px;
}
.btn:hover{ background: rgba(47,107,255,.20); }

.btn.secondary{
  border:1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.05);
  font-weight:700;
}
.btn.secondary:hover{ background: rgba(255,255,255,.08); }

.note{
  margin:14px 0 0;
  color: var(--muted);
  font-size:12.8px;
  line-height:1.6;
}

.hero__right{
  display:flex;
  flex-direction:column;
  gap:14px;
}

.mini{
  overflow:hidden;
}

.mini__head{
  padding:12px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  border-bottom:1px solid rgba(255,255,255,.08);
  background: rgba(0,0,0,.10);
  color: rgba(255,255,255,.86);
  font-weight:800;
  font-size:13px;
  letter-spacing:.2px;
}

.mini__body{
  padding:14px;
  color: var(--muted);
  font-size:13.2px;
  line-height:1.6;
  background: rgba(0,0,0,.10);
}

.kv{
  display:grid;
  grid-template-columns: 120px 1fr;
  gap:10px;
  padding:8px 0;
  border-bottom:1px solid rgba(255,255,255,.08);
}
.kv:last-child{ border-bottom:none; }
.kv__k{ color: rgba(255,255,255,.82); font-weight:800; font-size:12.5px; }
.kv__v{ color: var(--muted); }

.list{
  margin:0;
  padding-left:18px;
}
.list li{ margin:8px 0; }

.content{
  margin-top:16px;
  padding:18px 22px 22px;
}

.content__head h2{
  margin:0;
  font-size:18px;
  font-weight:820;
  letter-spacing:-.2px;
}
.content__head p{
  margin:10px 0 0;
  color:var(--muted);
  line-height:1.6;
  font-size:13.8px;
  max-width:92ch;
}

.scroll{
  margin-top:14px;
  max-height: 520px;
  overflow:auto;
  border:1px solid rgba(255,255,255,.10);
  border-radius:16px;
  background: rgba(0,0,0,.12);
}

table{ width:100%; border-collapse:collapse; font-size:13px; }
th, td{ padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.08); vertical-align:top; }
th{
  position: sticky;
  top:0;
  z-index:1;
  backdrop-filter: blur(10px);
  background: rgba(6,17,58,.70);
  text-align:left;
  font-weight:850;
  color: rgba(255,255,255,.86);
}

code{
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.10);
  padding:2px 6px;
  border-radius:8px;
  color: rgba(255,255,255,.90);
}

.foot{
  margin-top:16px;
  padding:16px 2px 0;
}
.foot__inner{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  color: var(--muted);
  font-size:12.8px;
}
.foot__brand{
  color: rgba(255,255,255,.86);
  font-weight:850;
  letter-spacing:.2px;
}

/* Widget override: make the parrot launcher bigger WITHOUT editing main.js */
.ct-launcher{
  width:78px !important;
  height:78px !important;
  font-size:32px !important;
}
`;

  const tag = document.createElement("style");
  tag.setAttribute("data-changtan-demo-style", "1");
  tag.appendChild(document.createTextNode(css));
  document.head.appendChild(tag);
})();
