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

// Command console
const cmdNameEl = document.getElementById("cmdName");
const cmdOptionsEl = document.getElementById("cmdOptions");
const cmdRunBtn = document.getElementById("cmdRun");
const cmdResultEl = document.getElementById("cmdResult");
const cmdHintEl = document.getElementById("cmdHint");
const cmdPresetMirrorBtn = document.getElementById("cmdPresetMirror");

function must(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function baseUrl() {
  return (cfg.BACKEND_URL || "").replace(/\/$/, "");
}

function relayBaseUrl() {
  return (cfg.RELAY_URL || "").replace(/\/$/, "");
}

function headers() {
  const h = {};
  if (must(cfg.BACKEND_API_KEY)) h["X-API-Key"] = cfg.BACKEND_API_KEY;
  return h;
}

function relayHeaders() {
  const h = {};
  if (must(cfg.RELAY_API_KEY)) h["X-API-Key"] = cfg.RELAY_API_KEY;
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

async function relayApi(path, opts = {}) {
  const url = `${relayBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...relayHeaders()
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

function setCmdHint(msg) {
  cmdHintEl.textContent = msg || "";
}

function pretty(obj) {
  return JSON.stringify(obj ?? {}, null, 2);
}

function loadPreset(name) {
  const presets = {
    create_group: { name: "create_group", options: { name: "my-group" } },
    delete_group: { name: "delete_group", options: { name: "my-group" } },
    add_channel: { name: "add_channel", options: { group: "my-group", channel: "CHANNEL_ID", lang: "EN" } },
    remove_channel: { name: "remove_channel", options: { group: "my-group", channel: "CHANNEL_ID" } },
    mirror_list: { name: "mirror_list", options: {} },
    mirror_clear: { name: "mirror_clear", options: {} }
  };
  const p = presets[name];
  if (!p) return;
  cmdNameEl.value = p.name;
  cmdOptionsEl.value = pretty(p.options);
  cmdResultEl.textContent = "";
  setCmdHint("Loaded preset.");
}

async function runCommand() {
  cmdResultEl.textContent = "";
  setCmdHint("");

  if (!must(cfg.RELAY_URL)) {
    setCmdHint("Config error: set WARROOM_CONFIG.RELAY_URL");
    return;
  }
  if (!must(cfg.RELAY_API_KEY)) {
    setCmdHint("Config error: set WARROOM_CONFIG.RELAY_API_KEY");
    return;
  }

  const name = String(cmdNameEl.value || "").trim();
  if (!name) {
    setCmdHint("Missing command name.");
    return;
  }

  let options = {};
  const raw = String(cmdOptionsEl.value || "{}").trim();
  try {
    options = raw ? JSON.parse(raw) : {};
  } catch {
    setCmdHint("Options JSON is invalid.");
    return;
  }

  const guildId = must(cfg.GUILD_ID) ? cfg.GUILD_ID : undefined;
  const payload = { name, options };
  if (guildId) payload.guildId = guildId;

  const r = await relayApi("/api/dashboard/commands/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => null);

  if (!r) {
    setCmdHint("Relay unreachable.");
    return;
  }

  if (!r.ok) {
    setCmdHint(`Command failed (${r.status}).`);
    cmdResultEl.textContent = pretty(r.data);
    return;
  }

  setCmdHint("OK");
  cmdResultEl.textContent = pretty(r.data);
}

cmdRunBtn.addEventListener("click", runCommand);

cmdPresetMirrorBtn.addEventListener("click", () => {
  loadPreset("create_group");
});

document.querySelectorAll("button[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => loadPreset(btn.getAttribute("data-preset")));
});

mirrorSchemaEl.textContent = JSON.stringify(mirrorSchema(), null, 2);
refreshStatus();
