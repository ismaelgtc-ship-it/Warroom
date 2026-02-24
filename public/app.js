
(() => {
  const LS_KEY = "WARROOM_CONFIG";
  const $ = (id) => document.getElementById(id);

  const state = {
    cfg: null,
    guild: null,
    categories: [],
    channels: [],
    selected: null, // {kind:'channel'|'category', id}
    collapsedCats: new Set()
  };

  const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

  function normalizeUrl(u){
    u = (u || "").trim();
    if (!u) return "";
    u = u.replace(/\/+$/g, "");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    if (!/^https?:\/\//i.test(u)) return "";
    return u;
  }

  function loadCfg(){
    const base = (window.WARROOM_CONFIG && typeof window.WARROOM_CONFIG === "object") ? window.WARROOM_CONFIG : {};
    const raw = localStorage.getItem(LS_KEY);
    const ls = raw ? safeJson(raw) : null;
    const cfg = Object.assign({ BACKEND_URL:"", BACKEND_API_KEY:"", RELAY_URL:"", RELAY_API_KEY:"", GUILD_ID:"" }, base, (ls && typeof ls === "object") ? ls : {});
    cfg.BACKEND_URL = normalizeUrl(cfg.BACKEND_URL);
    cfg.RELAY_URL = normalizeUrl(cfg.RELAY_URL);
    cfg.BACKEND_API_KEY = (cfg.BACKEND_API_KEY || "").trim();
    cfg.RELAY_API_KEY = (cfg.RELAY_API_KEY || "").trim();
    cfg.GUILD_ID = (cfg.GUILD_ID || "").trim();
    return cfg;
  }

  function saveCfg(cfg){ localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }

  function setStatus(which, up, detail){
    const dot = which === "gateway" ? $("gwDot") : $("rlDot");
    const label = which === "gateway" ? $("gwStatus") : $("rlStatus");
    dot.classList.toggle("ok", !!up);
    label.textContent = up ? "UP" : "DOWN";
    if (!up && detail) label.textContent = "DOWN";
  }

  async function pingGateway(){
    const cfg = state.cfg;
    if (!cfg.BACKEND_URL) return setStatus("gateway", false);
    try{
      const res = await fetch(cfg.BACKEND_URL + "/api/core/status", { headers: cfg.BACKEND_API_KEY ? { "X-API-Key": cfg.BACKEND_API_KEY } : {} });
      setStatus("gateway", res.ok);
    }catch{ setStatus("gateway", false); }
  }

  async function pingRelay(){
    const cfg = state.cfg;
    if (!cfg.RELAY_URL) return setStatus("relay", false);
    try{
      const res = await fetch(cfg.RELAY_URL + "/health", { headers: cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {} });
      setStatus("relay", res.ok);
    }catch{ setStatus("relay", false); }
  }

  async function relayGet(path){
    const cfg = state.cfg;
    const url = cfg.RELAY_URL + path;
    const res = await fetch(url, { headers: Object.assign({}, cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {}) });
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return { ok: res.ok, status: res.status, data };
  }

  async function relayPost(path, body){
    const cfg = state.cfg;
    const url = cfg.RELAY_URL + path;
    const res = await fetch(url, {
      method:"POST",
      headers: Object.assign({ "Content-Type":"application/json" }, cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {}),
      body: JSON.stringify(body || {})
    });
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return { ok: res.ok, status: res.status, data };
  }

  function renderDebug(){
    const dbg = {
      origin: location.origin,
      cfg: state.cfg,
      guild: state.guild ? { id: state.guild.id, name: state.guild.name } : null,
      selected: state.selected
    };
    $("debugBox").value = JSON.stringify(dbg, null, 2);
  }

  function iconForChannel(ch){
    if (ch.type === 2) return "🔊";
    return "#";
  }

  function selectItem(kind, id){
    state.selected = { kind, id };
    const title = kind === "category" ? (state.categories.find(c=>c.id===id)?.name || "Category") : (state.channels.find(c=>c.id===id)?.name || "Channel");
    $("selectedTitle").textContent = title;
    renderTree();
    renderDebug();
  }

  function toggleCat(id){
    if (state.collapsedCats.has(id)) state.collapsedCats.delete(id); else state.collapsedCats.add(id);
    renderTree();
  }

  function renderTree(){
    const pane = $("channelsPane");
    pane.innerHTML = "";
    const cats = [...state.categories].sort((a,b)=>a.position-b.position);
    const chans = [...state.channels].sort((a,b)=>a.position-b.position);

    // Build parent map
    const byParent = new Map();
    for (const ch of chans){
      const key = ch.parentId || "none";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(ch);
    }

    // Uncategorized first
    const unc = byParent.get("none") || [];
    if (unc.length){
      const head = document.createElement("div");
      head.className = "cat-head";
      head.textContent = "TEXT CHANNELS";
      pane.appendChild(head);
      for (const ch of unc){
        const row = document.createElement("div");
        row.className = "ch" + (state.selected?.kind==="channel" && state.selected?.id===ch.id ? " active":"");
        row.innerHTML = `<span class="hash">${iconForChannel(ch)}</span><span>${escapeHtml(ch.name)}</span>`;
        row.onclick = () => selectItem("channel", ch.id);
        pane.appendChild(row);
      }
    }

    for (const cat of cats){
      const catWrap = document.createElement("div");
      catWrap.className = "cat";
      const head = document.createElement("div");
      head.className = "cat-head";
      head.innerHTML = `<span>${escapeHtml(cat.name)}</span><span>${state.collapsedCats.has(cat.id) ? "▸":"▾"}</span>`;
      head.onclick = () => toggleCat(cat.id);
      head.ondblclick = () => selectItem("category", cat.id);
      catWrap.appendChild(head);

      if (!state.collapsedCats.has(cat.id)){
        const list = byParent.get(cat.id) || [];
        for (const ch of list){
          const row = document.createElement("div");
          row.className = "ch" + (state.selected?.kind==="channel" && state.selected?.id===ch.id ? " active":"");
          row.innerHTML = `<span class="hash">${iconForChannel(ch)}</span><span>${escapeHtml(ch.name)}</span>`;
          row.onclick = () => selectItem("channel", ch.id);
          catWrap.appendChild(row);
        }
      }
      pane.appendChild(catWrap);
    }
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
  }

  async function loadGuild(){
    const cfg = state.cfg;
    if (!cfg.RELAY_URL){
      $("actionLog").textContent = "Missing Relay URL. Open Settings.";
      openSettings();
      return;
    }
    $("actionLog").textContent = "Loading guild state…";
    const qs = cfg.GUILD_ID ? `?guildId=${encodeURIComponent(cfg.GUILD_ID)}` : "";
    const out = await relayGet("/api/dashboard/guild/state"+qs);
    if (!out.ok){
      $("actionLog").textContent = `Failed to load guild state: ${out.status} ${JSON.stringify(out.data)}`;
      return;
    }
    state.guild = out.data.guild;
    state.categories = out.data.categories || [];
    state.channels = out.data.channels || [];
    $("guildName").textContent = state.guild?.name || "Guild";

    // Populate parent select
    const sel = $("createParent");
    sel.innerHTML = "";
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "(none)";
    sel.appendChild(optNone);
    for (const c of state.categories.sort((a,b)=>a.position-b.position)){
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    }

    renderTree();
    renderDebug();
    $("actionLog").textContent = "OK";
  }

  async function doRename(){
    if (!state.selected){ $("actionLog").textContent="Select an item first"; return; }
    const name = prompt("New name:");
    if (!name) return;
    if (state.selected.kind === "channel" || state.selected.kind === "category"){
      const channelId = state.selected.id;
      const out = await relayPost("/api/dashboard/channel/rename", { channelId, name });
      $("actionLog").textContent = JSON.stringify(out, null, 2);
      await loadGuild();
    }
  }

  async function doMove(){
    if (!state.selected || state.selected.kind !== "channel"){ $("actionLog").textContent="Select a channel first"; return; }
    const parentId = prompt("Parent category ID (empty for none):", "");
    const out = await relayPost("/api/dashboard/channel/move", { channelId: state.selected.id, parentId: parentId || null });
    $("actionLog").textContent = JSON.stringify(out, null, 2);
    await loadGuild();
  }

  async function doDelete(){
    if (!state.selected){ $("actionLog").textContent="Select an item first"; return; }
    if (!confirm("Delete selected item?")) return;
    const out = await relayPost("/api/dashboard/channel/delete", { channelId: state.selected.id });
    $("actionLog").textContent = JSON.stringify(out, null, 2);
    state.selected = null;
    $("selectedTitle").textContent = "Select a channel";
    await loadGuild();
  }

  async function doCreate(){
    const type = $("createType").value;
    const name = ($("createName").value || "").trim();
    const parentId = $("createParent").value || null;
    if (!name){ $("actionLog").textContent="Missing name"; return; }
    const guildId = state.cfg.GUILD_ID || undefined;

    let out;
    if (type === "category"){
      out = await relayPost("/api/dashboard/category/create", { guildId, name });
    } else if (type === "role"){
      out = await relayPost("/api/dashboard/role/create", { guildId, name });
    } else {
      out = await relayPost("/api/dashboard/channel/create", { guildId, name, parentId, type });
    }
    $("actionLog").textContent = JSON.stringify(out, null, 2);
    $("createName").value = "";
    await loadGuild();
  }

  async function runCmd(){
    const name = ($("cmdName").value || "").trim();
    const obj = safeJson($("cmdOptions").value || "");
    if (!name){ $("cmdLog").textContent="Missing command"; return; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)){ $("cmdLog").textContent="Options must be a JSON object"; return; }
    const out = await relayPost("/api/dashboard/commands/execute", { name, options: obj, guildId: state.cfg.GUILD_ID || undefined });
    $("cmdLog").textContent = JSON.stringify(out, null, 2);
  }

  // Settings modal
  function openSettings(){
    const cfg = state.cfg;
    $("inpBackendUrl").value = cfg.BACKEND_URL || "";
    $("inpBackendKey").value = cfg.BACKEND_API_KEY || "";
    $("inpRelayUrl").value = cfg.RELAY_URL || "";
    $("inpRelayKey").value = cfg.RELAY_API_KEY || "";
    $("inpGuildId").value = cfg.GUILD_ID || "";
    $("settingsMsg").style.display="none";
    $("settingsBackdrop").style.display="flex";
  }
  function closeSettings(){ $("settingsBackdrop").style.display="none"; }

  function showSettingsMsg(text, ok){
    const el = $("settingsMsg");
    el.style.display="block";
    el.className = "msg " + (ok ? "ok":"err");
    el.textContent = text;
  }

  function bind(){
    $("btnOpenSettings").onclick = openSettings;
    $("btnCloseSettings").onclick = closeSettings;
    $("settingsBackdrop").onclick = (e) => { if (e.target === $("settingsBackdrop")) closeSettings(); };

    $("btnSaveCfg").onclick = async () => {
      const next = {
        BACKEND_URL: normalizeUrl($("inpBackendUrl").value),
        BACKEND_API_KEY: ($("inpBackendKey").value || "").trim(),
        RELAY_URL: normalizeUrl($("inpRelayUrl").value),
        RELAY_API_KEY: ($("inpRelayKey").value || "").trim(),
        GUILD_ID: ($("inpGuildId").value || "").trim()
      };
      if (!next.RELAY_URL) return showSettingsMsg("Relay URL invalid", false);
      saveCfg(next);
      state.cfg = loadCfg();
      closeSettings();
      renderDebug();
      await boot();
    };

    $("btnClearCfg").onclick = async () => {
      localStorage.removeItem(LS_KEY);
      state.cfg = loadCfg();
      renderDebug();
      showSettingsMsg("Cleared. Fill URLs and Save.", true);
    };

    $("btnReload").onclick = () => boot();
    $("btnRename").onclick = () => doRename();
    $("btnMove").onclick = () => doMove();
    $("btnDelete").onclick = () => doDelete();
    $("btnCreate").onclick = () => doCreate();
    $("btnRunCmd").onclick = () => runCmd();
  }

  async function boot(){
    state.cfg = loadCfg();
    renderDebug();
    await pingGateway();
    await pingRelay();
    await loadGuild();

    // auto-open settings if missing
    if (!state.cfg.RELAY_URL) openSettings();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    state.cfg = loadCfg();
    bind();
    await boot();
  });
})();
