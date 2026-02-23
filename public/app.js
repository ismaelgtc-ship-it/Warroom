(function () {
  const LS_KEY = "WARROOM_CONFIG";

  const $ = (id) => document.getElementById(id);
  const safeJsonParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

  function normalizeUrl(u){
    u = (u || "").trim();
    if (!u) return "";
    u = u.replace(/\/+$/g, "");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    if (!/^https?:\/\//i.test(u)) return "";
    return u;
  }

  function loadConfig(){
    const base = (window.WARROOM_CONFIG && typeof window.WARROOM_CONFIG === "object") ? window.WARROOM_CONFIG : {};
    const raw = localStorage.getItem(LS_KEY);
    const ls = raw ? safeJsonParse(raw) : null;
    const cfg = Object.assign(
      { BACKEND_URL:"", BACKEND_API_KEY:"", RELAY_URL:"", RELAY_API_KEY:"", GUILD_ID:"" },
      base,
      (ls && typeof ls === "object") ? ls : {}
    );
    cfg.BACKEND_URL = normalizeUrl(cfg.BACKEND_URL);
    cfg.RELAY_URL = normalizeUrl(cfg.RELAY_URL);
    cfg.BACKEND_API_KEY = (cfg.BACKEND_API_KEY || "").trim();
    cfg.RELAY_API_KEY = (cfg.RELAY_API_KEY || "").trim();
    cfg.GUILD_ID = (cfg.GUILD_ID || "").trim();
    return cfg;
  }

  function saveConfig(cfg){
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }

  function setPill(id, up){
    const el = $(id);
    el.textContent = up ? "UP" : "DOWN";
    el.classList.toggle("up", !!up);
    el.classList.toggle("down", !up);
  }

  async function pingGateway(cfg){
    if (!cfg.BACKEND_URL) return setPill("gwStatus", false);
    try{
      const res = await fetch(cfg.BACKEND_URL + "/api/core/status", { headers: cfg.BACKEND_API_KEY ? { "X-API-Key": cfg.BACKEND_API_KEY } : {} });
      setPill("gwStatus", res.ok);
    }catch{ setPill("gwStatus", false); }
  }

  async function pingRelay(cfg){
    if (!cfg.RELAY_URL) return setPill("rlStatus", false);
    try{
      const res = await fetch(cfg.RELAY_URL + "/health", { headers: cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {} });
      setPill("rlStatus", res.ok);
    }catch{ setPill("rlStatus", false); }
  }

  function openSettings(cfg){
    $("inpBackendUrl").value = cfg.BACKEND_URL || "";
    $("inpBackendKey").value = cfg.BACKEND_API_KEY || "";
    $("inpRelayUrl").value = cfg.RELAY_URL || "";
    $("inpRelayKey").value = cfg.RELAY_API_KEY || "";
    $("inpGuildId").value = cfg.GUILD_ID || "";
    $("settingsMsg").textContent = "";
    $("settingsBackdrop").style.display = "flex";
    $("settingsBackdrop").setAttribute("aria-hidden","false");
  }
  function closeSettings(){
    $("settingsBackdrop").style.display = "none";
    $("settingsBackdrop").setAttribute("aria-hidden","true");
  }

  // --- Discord state ---
  let STATE = null;
  let SELECTED = { kind: null, id: null };

  function debugWrite(cfg){
    const dbg = {
      origin: location.origin,
      cfg: {
        BACKEND_URL: cfg.BACKEND_URL,
        RELAY_URL: cfg.RELAY_URL,
        GUILD_ID: cfg.GUILD_ID,
        BACKEND_API_KEY: cfg.BACKEND_API_KEY ? "***" : "",
        RELAY_API_KEY: cfg.RELAY_API_KEY ? "***" : ""
      },
      selected: SELECTED,
      snapshot: STATE ? { channels: STATE.channels?.length || 0, roles: STATE.roles?.length || 0, members: STATE.members?.length || 0 } : null
    };
    $("debugBox").value = JSON.stringify(dbg, null, 2);
  }

  async function fetchGuildState(cfg){
    if (!cfg.RELAY_URL) throw new Error("Missing RELAY_URL");
    const url = new URL(cfg.RELAY_URL + "/api/dashboard/guild/state");
    if (cfg.GUILD_ID) url.searchParams.set("guildId", cfg.GUILD_ID);
    const res = await fetch(url.toString(), { headers: cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {} });
    const txt = await res.text();
    let data; try{ data = JSON.parse(txt);}catch{ data = { raw: txt }; }
    if (!res.ok) throw new Error("Relay HTTP " + res.status + ": " + (data?.error || txt));
    return data;
  }

  function isCategory(c){
    // Discord.js ChannelType.GuildCategory = 4
    return c.type === 4;
  }

  function channelIcon(c){
    if (isCategory(c)) return "";
    // best-effort
    return "#";
  }

  function buildTree(){
    const tree = $("tree");
    tree.innerHTML = "";

    const channels = (STATE?.channels || []).slice();
    const categories = channels.filter(isCategory).sort((a,b)=>a.position-b.position);
    const byParent = new Map();
    for (const ch of channels){
      if (isCategory(ch)) continue;
      const p = ch.parentId || "__root__";
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(ch);
    }
    for (const [k, arr] of byParent) arr.sort((a,b)=>a.position-b.position);

    function renderChannel(ch){
      const el = document.createElement("div");
      el.className = "chan" + (SELECTED.kind === "channel" && SELECTED.id === ch.id ? " active" : "");
      el.dataset.kind = "channel";
      el.dataset.id = ch.id;
      el.innerHTML = `<span class="hash">${channelIcon(ch)}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(ch.name)}</span>`;
      el.addEventListener("click", () => selectItem("channel", ch.id));
      return el;
    }

    function renderCategory(cat){
      const wrap = document.createElement("div");
      wrap.className = "cat";
      const h = document.createElement("div");
      h.className = "cat-h";
      h.dataset.kind = "category";
      h.dataset.id = cat.id;
      const left = document.createElement("div");
      left.className = "left";
      left.innerHTML = `<span class="caret">▾</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cat.name)}</span>`;
      h.appendChild(left);
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "6px";
      const bSel = document.createElement("button");
      bSel.className = "btn secondary small";
      bSel.textContent = "Select";
      bSel.addEventListener("click", (e)=>{ e.stopPropagation(); selectItem("category", cat.id); });
      actions.appendChild(bSel);
      h.appendChild(actions);
      wrap.appendChild(h);

      const list = document.createElement("div");
      list.style.marginTop = "6px";
      (byParent.get(cat.id) || []).forEach(ch => list.appendChild(renderChannel(ch)));
      wrap.appendChild(list);

      let open = true;
      h.addEventListener("click", ()=>{
        open = !open;
        list.style.display = open ? "block" : "none";
        left.querySelector(".caret").textContent = open ? "▾" : "▸";
      });

      return wrap;
    }

    // Root channels
    const root = byParent.get("__root__") || [];
    if (root.length){
      const rootWrap = document.createElement("div");
      rootWrap.className = "cat";
      const h = document.createElement("div");
      h.className = "cat-h";
      h.innerHTML = `<div class="left"><span class="caret">▾</span><span>TEXT CHANNELS</span></div>`;
      rootWrap.appendChild(h);
      const list = document.createElement("div");
      list.style.marginTop = "6px";
      root.forEach(ch => list.appendChild(renderChannel(ch)));
      rootWrap.appendChild(list);
      let open = true;
      h.addEventListener("click", ()=>{
        open = !open;
        list.style.display = open ? "block" : "none";
        h.querySelector(".caret").textContent = open ? "▾" : "▸";
      });
      tree.appendChild(rootWrap);
    }

    categories.forEach(cat => tree.appendChild(renderCategory(cat)));

    // Parent selector
    const sel = $("createParent");
    sel.innerHTML = "";
    const optRoot = document.createElement("option");
    optRoot.value = "";
    optRoot.textContent = "(no parent)";
    sel.appendChild(optRoot);
    categories.forEach(cat => {
      const o = document.createElement("option");
      o.value = cat.id;
      o.textContent = cat.name;
      sel.appendChild(o);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  function selectItem(kind, id){
    SELECTED = { kind, id };
    const ch = (STATE?.channels || []).find(x=>x.id===id);
    const title = kind === "channel" ? `#${ch?.name || id}` : (kind === "category" ? (ch?.name || "Category") : "—");
    $("selTitle").textContent = title;
    $("selMeta").textContent = `${kind} • ${id}`;
    buildTree();
    debugWrite(loadConfig());
  }

  async function callRelay(cfg, path, body){
    const res = await fetch(cfg.RELAY_URL + path, {
      method: "POST",
      headers: Object.assign({ "Content-Type":"application/json" }, cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {}),
      body: JSON.stringify(body || {})
    });
    const txt = await res.text();
    let data; try{ data = JSON.parse(txt);}catch{ data = { raw: txt }; }
    return { ok: res.ok, status: res.status, data };
  }

  async function doRename(cfg){
    if (!SELECTED.id) return;
    const current = (STATE?.channels || []).find(x=>x.id===SELECTED.id);
    const name = prompt("New name", current?.name || "");
    if (!name) return;
    if (SELECTED.kind === "channel"){
      const r = await callRelay(cfg, "/api/dashboard/channel/rename", { channelId: SELECTED.id, name });
      $("actionOut").value = JSON.stringify(r, null, 2);
    } else if (SELECTED.kind === "category"){
      const r = await callRelay(cfg, "/api/dashboard/channel/rename", { channelId: SELECTED.id, name });
      $("actionOut").value = JSON.stringify(r, null, 2);
    }
    await reloadAll(cfg);
  }

  async function doMove(cfg){
    if (!SELECTED.id) return;
    if (SELECTED.kind !== "channel") return;
    const parentId = prompt("Move to categoryId (empty for root)", "");
    const r = await callRelay(cfg, "/api/dashboard/channel/move", { channelId: SELECTED.id, parentId: parentId || null });
    $("actionOut").value = JSON.stringify(r, null, 2);
    await reloadAll(cfg);
  }

  async function doDelete(cfg){
    if (!SELECTED.id) return;
    const yes = confirm("Delete selected item? This cannot be undone.");
    if (!yes) return;
    if (SELECTED.kind === "channel" || SELECTED.kind === "category"){
      const r = await callRelay(cfg, "/api/dashboard/channel/delete", { channelId: SELECTED.id });
      $("actionOut").value = JSON.stringify(r, null, 2);
      SELECTED = { kind: null, id: null };
      $("selTitle").textContent = "Select a channel";
      $("selMeta").textContent = "—";
      await reloadAll(cfg);
    }
  }

  async function doCreate(cfg){
    const type = $("createType").value;
    const name = ($("createName").value || "").trim();
    if (!name) return;
    let r;
    if (type === "category"){
      r = await callRelay(cfg, "/api/dashboard/category/create", { guildId: cfg.GUILD_ID || undefined, name });
    } else if (type === "channel"){
      const parentId = $("createParent").value || null;
      r = await callRelay(cfg, "/api/dashboard/channel/create", { guildId: cfg.GUILD_ID || undefined, name, parentId });
    } else if (type === "role"){
      r = await callRelay(cfg, "/api/dashboard/role/create", { guildId: cfg.GUILD_ID || undefined, name });
    }
    $("actionOut").value = JSON.stringify(r, null, 2);
    $("createName").value = "";
    await reloadAll(cfg);
  }

  async function runCommand(cfg){
    const out = $("cmdResult");
    out.value = "";
    if (!cfg.RELAY_URL) { out.value = "Config error: set RELAY_URL"; return; }
    const name = ($("cmdName").value || "").trim();
    if (!name) { out.value = "Missing command"; return; }

    const raw = $("cmdOptions").value || "{}";
    const parsed = safeJsonParse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) { out.value = "Options must be a JSON object"; return; }

    try{
      const res = await fetch(cfg.RELAY_URL + "/api/dashboard/commands/execute", {
        method: "POST",
        headers: Object.assign({ "Content-Type":"application/json" }, cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {}),
        body: JSON.stringify({ name, options: parsed, guildId: cfg.GUILD_ID || undefined })
      });
      const text = await res.text();
      let payload; try{ payload = JSON.parse(text);}catch{ payload = { raw: text }; }
      out.value = JSON.stringify({ status: res.status, payload }, null, 2);
    }catch(e){
      out.value = String(e && e.message ? e.message : e);
    }
  }

  async function reloadAll(cfg){
    await Promise.all([pingGateway(cfg), pingRelay(cfg)]);
    try{
      const data = await fetchGuildState(cfg);
      STATE = data;
      $("guildName").textContent = data.guild?.name || "Guild";
      buildTree();
    }catch(e){
      $("actionOut").value = "Failed to load guild state: " + String(e?.message || e);
    }
    debugWrite(cfg);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    let cfg = loadConfig();

    // Settings
    $("btnSettings").addEventListener("click", ()=>openSettings(cfg));
    $("btnCloseSettings").addEventListener("click", closeSettings);
    $("settingsBackdrop").addEventListener("click", (e)=>{ if (e.target === $("settingsBackdrop")) closeSettings(); });

    $("btnSaveConfig").addEventListener("click", ()=>{
      const next = {
        BACKEND_URL: normalizeUrl($("inpBackendUrl").value),
        BACKEND_API_KEY: ($("inpBackendKey").value || "").trim(),
        RELAY_URL: normalizeUrl($("inpRelayUrl").value),
        RELAY_API_KEY: ($("inpRelayKey").value || "").trim(),
        GUILD_ID: ($("inpGuildId").value || "").trim()
      };
      if (!next.BACKEND_URL) { $("settingsMsg").textContent = "Invalid Gateway URL"; return; }
      if (!next.RELAY_URL) { $("settingsMsg").textContent = "Invalid Relay URL"; return; }
      saveConfig(next);
      cfg = loadConfig();
      closeSettings();
      reloadAll(cfg);
    });

    $("btnClearConfig").addEventListener("click", ()=>{
      localStorage.removeItem(LS_KEY);
      cfg = loadConfig();
      $("settingsMsg").textContent = "Cleared.";
      openSettings(cfg);
      debugWrite(cfg);
    });

    // Reload
    $("btnReload").addEventListener("click", ()=>{ cfg = loadConfig(); reloadAll(cfg); });

    // Actions
    $("btnRename").addEventListener("click", ()=>{ cfg = loadConfig(); doRename(cfg); });
    $("btnMove").addEventListener("click", ()=>{ cfg = loadConfig(); doMove(cfg); });
    $("btnDelete").addEventListener("click", ()=>{ cfg = loadConfig(); doDelete(cfg); });

    // Create quick button
    $("btnCreate").addEventListener("click", ()=>{ document.querySelector("#createName").focus(); });
    $("btnCreateDo").addEventListener("click", ()=>{ cfg = loadConfig(); doCreate(cfg); });

    // Command
    $("btnRun").addEventListener("click", ()=>{ cfg = loadConfig(); runCommand(cfg); });

    // Auto-open settings if missing URLs
    if (!cfg.BACKEND_URL || !cfg.RELAY_URL) openSettings(cfg);

    await reloadAll(cfg);
  });
})();
