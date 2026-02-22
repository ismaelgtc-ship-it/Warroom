const cfg = window.WARROOM_CONFIG || {};

const gwStatusEl = document.getElementById("gwStatus");
const gwMetaEl = document.getElementById("gwMeta");
const statusJsonEl = document.getElementById("statusJson");
const modulesTbody = document.getElementById("modulesTbody");

const mirrorJsonEl = document.getElementById("mirrorJson");
const mirrorSchemaEl = document.getElementById("mirrorSchema");
const mirrorHintEl = document.getElementById("mirrorHint");

const refreshBtn = document.getElementById("refresh");
const loadMirrorBtn = document.getElementById("loadMirror");
const saveMirrorBtn = document.getElementById("saveMirror");

function must(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function baseUrl() {
  return (cfg.BACKEND_URL || "").replace(/\/$/, "");
}

function headers() {
  const h = {};
  if (must(cfg.BACKEND_API_KEY)) h["X-API-Key"] = cfg.BACKEND_API_KEY;
  return h;
}

async function api(path, opts = {}) {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...headers()
    }
  });
  const txt = await res.text().catch(() => "");
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  return { ok: res.ok, status: res.status, data };
}

function setPill(el, up) {
  el.classList.remove("up", "down");
  el.classList.add(up ? "up" : "down");
  el.textContent = up ? "UP" : "DOWN";
}

function esc(s) {
  return String(s || "").replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function rowButton(label, cls, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  if (cls) btn.className = cls;
  btn.addEventListener("click", onClick);
  return btn;
}

async function refreshStatus() {
  if (!must(cfg.BACKEND_URL)) {
    setPill(gwStatusEl, false);
    gwMetaEl.textContent = "Config error: set WARROOM_CONFIG.BACKEND_URL";
    statusJsonEl.textContent = "";
    modulesTbody.innerHTML = "";
    return;
  }

  // Public health
  const health = await api("/api/core/health", { method: "GET", headers: {} }).catch(() => null);
  if (!health || !health.ok) {
    setPill(gwStatusEl, false);
    gwMetaEl.textContent = "Gateway unreachable";
    statusJsonEl.textContent = health ? JSON.stringify(health.data, null, 2) : "";
    modulesTbody.innerHTML = "";
    return;
  }

  setPill(gwStatusEl, true);
  gwMetaEl.textContent = `ts: ${health.data?.ts || ""}`;

  // Auth status + services
  const status = await api("/api/core/status", { method: "GET" }).catch(() => null);
  statusJsonEl.textContent = JSON.stringify(status?.data || {}, null, 2);

  // Modules
  const mods = await api("/api/modules", { method: "GET" }).catch(() => null);
  renderModules(mods?.data?.modules || []);
}

function renderModules(modules) {
  modulesTbody.innerHTML = "";
  for (const m of modules) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.innerHTML = `<div><b>${esc(m.name)}</b></div><div class="muted">${esc(m.description || "")}</div>`;

    const tdOwner = document.createElement("td");
    tdOwner.textContent = m.owner || "";

    const tdActive = document.createElement("td");
    tdActive.textContent = m.active ? "true" : "false";

    const tdLocked = document.createElement("td");
    tdLocked.innerHTML = m.locked
      ? `<span class="pill down">LOCKED</span><div class="muted">${esc(m.lockReason || "")}</div>`
      : `<span class="pill up">OPEN</span>`;

    const tdActions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "actions";

    wrap.appendChild(rowButton(m.active ? "Disable" : "Enable", "secondary", async () => {
      await api(`/api/modules/${encodeURIComponent(m.name)}/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !m.active })
      });
      await refreshStatus();
    }));

    wrap.appendChild(rowButton(m.locked ? "Unlock" : "Lock", m.locked ? "secondary" : "danger", async () => {
      if (m.locked) {
        await api(`/api/modules/${encodeURIComponent(m.name)}/unlock`, { method: "POST" });
      } else {
        const reason = prompt("Lock reason (optional)", "") || "";
        await api(`/api/modules/${encodeURIComponent(m.name)}/lock`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason })
        });
      }
      await refreshStatus();
    }));

    if (m.name === "mirror") {
      wrap.appendChild(rowButton("Edit", "secondary", async () => {
        await loadMirror();
        mirrorJsonEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }));
    }

    tdActions.appendChild(wrap);

    tr.appendChild(tdName);
    tr.appendChild(tdOwner);
    tr.appendChild(tdActive);
    tr.appendChild(tdLocked);
    tr.appendChild(tdActions);

    modulesTbody.appendChild(tr);
  }
}

function mirrorSchema() {
  return {
    groups: [
      {
        name: "group-name",
        channels: {
          "CHANNEL_ID_1": "EN",
          "CHANNEL_ID_2": "ES"
        }
      }
    ]
  };
}

async function loadMirror() {
  mirrorHintEl.textContent = "";
  const r = await api("/api/modules/mirror", { method: "GET" });
  if (!r.ok) {
    mirrorHintEl.textContent = "Cannot load mirror module (check API key)";
    return;
  }
  mirrorJsonEl.value = JSON.stringify(r.data?.module?.config || {}, null, 2);
}

async function saveMirror() {
  mirrorHintEl.textContent = "";
  let parsed = null;
  try {
    parsed = JSON.parse(mirrorJsonEl.value || "{}")
  } catch (e) {
    mirrorHintEl.textContent = "Invalid JSON";
    return;
  }

  const r = await api("/api/modules/mirror/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config: parsed })
  });

  if (!r.ok) {
    mirrorHintEl.textContent = `Save failed (${r.status})`;
    return;
  }

  mirrorHintEl.textContent = "Saved";
  await refreshStatus();
}

refreshBtn.addEventListener("click", refreshStatus);
loadMirrorBtn.addEventListener("click", loadMirror);
saveMirrorBtn.addEventListener("click", saveMirror);

mirrorSchemaEl.textContent = JSON.stringify(mirrorSchema(), null, 2);
refreshStatus();
