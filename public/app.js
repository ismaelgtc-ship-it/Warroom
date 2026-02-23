const cfg = window.WARROOM_CONFIG || {};

const gwStatusEl = document.getElementById("gwStatus");
const gwMetaEl = document.getElementById("gwMeta");
const statusJsonEl = document.getElementById("statusJson");
const modulesTbody = document.getElementById("modulesTbody");

const relayStatusEl = document.getElementById("relayStatus");
const relayMetaEl = document.getElementById("relayMeta");
const relayJsonEl = document.getElementById("relayJson");

const refreshRelayBtn = document.getElementById("refreshRelay");
const loadGuildBtn = document.getElementById("loadGuild");
const downloadBackupBtn = document.getElementById("downloadBackup");
const takeSnapshotBtn = document.getElementById("takeSnapshot");

const guildHintEl = document.getElementById("guildHint");

const channelsListEl = document.getElementById("channelsList");
const rolesListEl = document.getElementById("rolesList");
const membersListEl = document.getElementById("membersList");
const memberSearchEl = document.getElementById("memberSearch");

const channelJsonEl = document.getElementById("channelJson");
const memberJsonEl = document.getElementById("memberJson");
const renameChannelBtn = document.getElementById("renameChannelBtn");
const removeRoleBtn = document.getElementById("removeRoleBtn");
const channelHintEl = document.getElementById("channelHint");
const memberHintEl = document.getElementById("memberHint");

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
  if (must(cfg.RELAY_DASHBOARD_API_KEY)) h["X-API-Key"] = cfg.RELAY_DASHBOARD_API_KEY;
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

async function refreshRelay() {
  if (!must(cfg.RELAY_URL)) {
    setPill(relayStatusEl, false);
    relayMetaEl.textContent = "Config error: set WARROOM_CONFIG.RELAY_URL";
    relayJsonEl.textContent = "";
    return;
  }

  const health = await relayApi("/health", { method: "GET", headers: {} }).catch(() => null);
  if (!health || !health.ok) {
    setPill(relayStatusEl, false);
    relayMetaEl.textContent = "Relay unreachable";
    relayJsonEl.textContent = health ? JSON.stringify(health.data, null, 2) : "";
    return;
  }

  setPill(relayStatusEl, true);
  relayMetaEl.textContent = `ver: ${health.data?.version || ""}`;
  relayJsonEl.textContent = JSON.stringify(health.data || {}, null, 2);
}

let guildState = null;
let selectedChannelId = null;
let selectedMemberId = null;

function sortByPositionAsc(a, b) {
  return (a?.position ?? 0) - (b?.position ?? 0);
}

function buildChannelTree(channels) {
  const cats = new Map();
  const root = [];

  for (const c of channels) {
    if (c.parentId) {
      if (!cats.has(c.parentId)) cats.set(c.parentId, []);
      cats.get(c.parentId).push(c);
    } else {
      root.push(c);
    }
  }

  // parentId represents categories/parents. We don't have category objects here,
  // so we show a synthetic group header using the parentId.
  root.sort(sortByPositionAsc);
  for (const list of cats.values()) list.sort(sortByPositionAsc);

  return { root, cats };
}

function clearSelection() {
  selectedChannelId = null;
  selectedMemberId = null;
  channelJsonEl.textContent = "";
  memberJsonEl.textContent = "";
}

function renderChannels() {
  channelsListEl.innerHTML = "";
  if (!guildState) return;
  const { channels } = guildState;
  const { root, cats } = buildChannelTree(channels);

  function addItem(label, id, metaText, indent = false, isHeader = false) {
    const div = document.createElement("div");
    div.className = "item" + (id && id === selectedChannelId ? " active" : "");
    if (indent) div.classList.add("indent");
    div.innerHTML = `<div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
      <div><b>${esc(label)}</b></div>
      ${metaText ? `<span class="badge">${esc(metaText)}</span>` : ""}
    </div>`;
    if (id && !isHeader) {
      div.addEventListener("click", () => {
        selectedChannelId = id;
        renderChannels();
        renderSelected();
      });
    }
    channelsListEl.appendChild(div);
  }

  // Show uncategorized first
  for (const c of root) {
    addItem(`# ${c.name}`, c.id, "root");
  }

  // Show grouped by parentId (synthetic category)
  for (const [parentId, list] of Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    addItem(`Category ${parentId}`, null, "category", false, true);
    for (const c of list) {
      addItem(`# ${c.name}`, c.id, `pos ${c.position}`, true);
    }
  }
}

function renderRoles() {
  rolesListEl.innerHTML = "";
  if (!guildState) return;
  for (const r of guildState.roles || []) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
      <div><b>${esc(r.name)}</b></div>
      <span class="badge">pos ${esc(r.position)}</span>
    </div>
    <div class="muted">${r.managed ? "managed" : ""}</div>`;
    rolesListEl.appendChild(div);
  }
}

function matchesMember(m, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    String(m.id || "").toLowerCase().includes(s) ||
    String(m.tag || "").toLowerCase().includes(s) ||
    String(m.nickname || "").toLowerCase().includes(s)
  );
}

function renderMembers() {
  membersListEl.innerHTML = "";
  if (!guildState) return;
  const q = String(memberSearchEl.value || "").trim();
  const members = (guildState.members || []).filter((m) => matchesMember(m, q));
  for (const m of members.slice(0, 200)) {
    const div = document.createElement("div");
    div.className = "item" + (m.id === selectedMemberId ? " active" : "");
    div.innerHTML = `<div><b>${esc(m.tag)}</b></div><div class="muted">${esc(m.nickname || "")}</div>`;
    div.addEventListener("click", () => {
      selectedMemberId = m.id;
      renderMembers();
      renderSelected();
    });
    membersListEl.appendChild(div);
  }
}

function renderSelected() {
  channelHintEl.textContent = "";
  memberHintEl.textContent = "";
  if (!guildState) {
    channelJsonEl.textContent = "";
    memberJsonEl.textContent = "";
    return;
  }
  const ch = (guildState.channels || []).find((c) => c.id === selectedChannelId) || null;
  const mb = (guildState.members || []).find((m) => m.id === selectedMemberId) || null;
  channelJsonEl.textContent = ch ? JSON.stringify(ch, null, 2) : "";
  memberJsonEl.textContent = mb ? JSON.stringify(mb, null, 2) : "";
}

async function loadGuildState() {
  guildHintEl.textContent = "";
  if (!must(cfg.RELAY_URL)) {
    guildHintEl.textContent = "Config error: set RELAY_URL";
    return;
  }
  if (!must(cfg.RELAY_DASHBOARD_API_KEY)) {
    guildHintEl.textContent = "Config error: set RELAY_DASHBOARD_API_KEY";
    return;
  }

  const guildId = must(cfg.GUILD_ID) ? cfg.GUILD_ID : "";
  const qs = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const r = await relayApi(`/api/dashboard/guild/state${qs}`, { method: "GET" });
  if (!r.ok) {
    guildHintEl.textContent = `Cannot load guild state (${r.status})`;
    return;
  }
  guildState = r.data;
  clearSelection();
  renderChannels();
  renderRoles();
  renderMembers();
  renderSelected();
  guildHintEl.textContent = `Loaded: ${r.data?.guild?.name || ""} • channels: ${(r.data?.channels || []).length} • roles: ${(r.data?.roles || []).length} • members: ${(r.data?.members || []).length}`;
}

async function renameSelectedChannel() {
  channelHintEl.textContent = "";
  if (!guildState || !selectedChannelId) {
    channelHintEl.textContent = "Select a channel";
    return;
  }
  const ch = (guildState.channels || []).find((c) => c.id === selectedChannelId);
  if (!ch) {
    channelHintEl.textContent = "Channel not found";
    return;
  }

  const name = prompt("New channel name", ch.name || "");
  if (!name) return;

  const r = await relayApi("/api/dashboard/channel/rename", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channelId: selectedChannelId, name })
  });
  if (!r.ok) {
    channelHintEl.textContent = `Rename failed (${r.status})`;
    return;
  }
  channelHintEl.textContent = "Renamed";
  await loadGuildState();
}

async function removeRoleFromSelectedMember() {
  memberHintEl.textContent = "";
  if (!guildState || !selectedMemberId) {
    memberHintEl.textContent = "Select a member";
    return;
  }
  const m = (guildState.members || []).find((x) => x.id === selectedMemberId);
  if (!m) {
    memberHintEl.textContent = "Member not found";
    return;
  }
  const roleId = prompt("Role ID to remove", (m.roles && m.roles[0]) ? m.roles[0] : "");
  if (!roleId) return;

  const r = await relayApi("/api/dashboard/member/role/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guildId: guildState.guild?.id, userId: selectedMemberId, roleId })
  });
  if (!r.ok) {
    memberHintEl.textContent = `Remove role failed (${r.status})`;
    return;
  }
  memberHintEl.textContent = "Role removed";
  await loadGuildState();
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function downloadBackup() {
  const out = {
    takenAt: new Date().toISOString(),
    gateway: null,
    modules: null,
    mirror: null,
    discord: guildState || null
  };

  // best-effort — do not block backup if one part fails
  const status = await api("/api/core/status", { method: "GET" }).catch(() => null);
  if (status && status.ok) out.gateway = status.data;

  const mods = await api("/api/modules", { method: "GET" }).catch(() => null);
  if (mods && mods.ok) out.modules = mods.data;

  const mirror = await api("/api/modules/mirror", { method: "GET" }).catch(() => null);
  if (mirror && mirror.ok) out.mirror = mirror.data;

  const safeName = (guildState?.guild?.name || "guild").replace(/[^a-z0-9-_]+/gi, "_");
  downloadJson(`warroom_backup_${safeName}_${Date.now()}.json`, out);
}

async function takeSnapshot() {
  guildHintEl.textContent = "";
  if (!must(cfg.SNAPSHOT_API_KEY)) {
    guildHintEl.textContent = "Snapshot disabled: set SNAPSHOT_API_KEY in Warroom config";
    return;
  }
  if (!must(cfg.RELAY_URL)) {
    guildHintEl.textContent = "Config error: set RELAY_URL";
    return;
  }
  const guildId = must(cfg.GUILD_ID) ? cfg.GUILD_ID : "";
  const qs = new URLSearchParams();
  qs.set("key", cfg.SNAPSHOT_API_KEY);
  if (guildId) qs.set("guildId", guildId);
  const r = await relayApi(`/api/snapshot/take?${qs.toString()}`, { method: "POST" });
  if (!r.ok) {
    guildHintEl.textContent = `Snapshot failed (${r.status})`;
    return;
  }
  guildHintEl.textContent = `Snapshot saved • ${r.data?.takenAt || ""}`;
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

refreshRelayBtn.addEventListener("click", refreshRelay);
loadGuildBtn.addEventListener("click", loadGuildState);
downloadBackupBtn.addEventListener("click", downloadBackup);
takeSnapshotBtn.addEventListener("click", takeSnapshot);
memberSearchEl.addEventListener("input", () => renderMembers());
renameChannelBtn.addEventListener("click", renameSelectedChannel);
removeRoleBtn.addEventListener("click", removeRoleFromSelectedMember);

mirrorSchemaEl.textContent = JSON.stringify(mirrorSchema(), null, 2);
refreshStatus();
refreshRelay();
