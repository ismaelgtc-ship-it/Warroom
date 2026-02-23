(function () {
  const LS_KEY = "WARROOM_CONFIG";

  function byId(id){ return document.getElementById(id); }
  function safeJsonParse(s){ try { return JSON.parse(s); } catch { return null; } }

  // ✅ FIX: auto-add https:// if missing
  function normalizeUrl(u){
    u = (u || "").trim();
    if (!u) return "";
    u = u.replace(/\/+$/g, "");

    // If user pasted without scheme, assume https
    if (!/^https?:\/\//i.test(u)) {
      u = "https://" + u;
    }

    // Final sanity check
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

  function setStatus(kind, up, hint){
    const el = byId(kind+"Status");
    const hintEl = byId(kind+"Hint");
    el.textContent = up ? "UP" : "DOWN";
    el.classList.toggle("up", !!up);
    el.classList.toggle("down", !up);
    hintEl.textContent = hint || "";
  }

  async function pingGateway(cfg){
    if (!cfg.BACKEND_URL) return setStatus("gateway", false, "Config error: set WARROOM_CONFIG.BACKEND_URL");
    try{
      const res = await fetch(cfg.BACKEND_URL + "/api/core/status", {
        headers: cfg.BACKEND_API_KEY ? { "X-API-Key": cfg.BACKEND_API_KEY } : {}
      });
      if (!res.ok) return setStatus("gateway", false, "HTTP " + res.status);
      setStatus("gateway", true, "OK");
    }catch(e){
      setStatus("gateway", false, String(e && e.message ? e.message : e));
    }
  }

  async function pingRelay(cfg){
    if (!cfg.RELAY_URL) return setStatus("relay", false, "Config error: set WARROOM_CONFIG.RELAY_URL");
    try{
      const res = await fetch(cfg.RELAY_URL + "/health", {
        headers: cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {}
      });
      if (!res.ok) return setStatus("relay", false, "HTTP " + res.status);
      setStatus("relay", true, "OK");
    }catch(e){
      setStatus("relay", false, String(e && e.message ? e.message : e));
    }
  }

  function openSettings(cfg){
    const bd = byId("settingsBackdrop");
    byId("inpBackendUrl").value = cfg.BACKEND_URL || "";
    byId("inpBackendKey").value = cfg.BACKEND_API_KEY || "";
    byId("inpRelayUrl").value = cfg.RELAY_URL || "";
    byId("inpRelayKey").value = cfg.RELAY_API_KEY || "";
    byId("inpGuildId").value = cfg.GUILD_ID || "";

    const msg = byId("settingsMsg");
    msg.style.display="none";
    msg.textContent="";
    bd.style.display="flex";
    bd.setAttribute("aria-hidden","false");
  }

  function closeSettings(){
    const bd = byId("settingsBackdrop");
    bd.style.display="none";
    bd.setAttribute("aria-hidden","true");
  }

  function showSettingsMsg(text, ok){
    const msg = byId("settingsMsg");
    msg.style.display="block";
    msg.className = ok ? "ok" : "err";
    msg.textContent = text;
  }

  function refreshDebug(cfg){
    const debug = {
      storage: true,
      origin: window.location.origin,
      cfg,
      extra: {
        missing: (!cfg.BACKEND_URL ? "BACKEND_URL" : (!cfg.RELAY_URL ? "RELAY_URL" : "")) || ""
      }
    };
    byId("debugBox").value = JSON.stringify(debug, null, 2);
    return debug;
  }

  async function runCommand(cfg){
    const out = byId("cmdResult");
    out.value = "";
    if (!cfg.RELAY_URL) { out.value = "Config error: set WARROOM_CONFIG.RELAY_URL"; return; }

    const name = (byId("cmdName").value || "").trim();
    if (!name) { out.value = "Missing command"; return; }

    const raw = byId("cmdOptions").value || "{}";
    const parsed = safeJsonParse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      out.value = "Options must be a JSON object";
      return;
    }

    try{
      const res = await fetch(cfg.RELAY_URL + "/api/dashboard/commands/execute", {
        method: "POST",
        headers: Object.assign(
          { "Content-Type":"application/json" },
          cfg.RELAY_API_KEY ? { "X-API-Key": cfg.RELAY_API_KEY } : {}
        ),
        body: JSON.stringify({ name, options: parsed, guildId: cfg.GUILD_ID || undefined })
      });

      const text = await res.text();
      let payload;
      try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

      out.value = JSON.stringify({ status: res.status, payload }, null, 2);
    }catch(e){
      out.value = String(e && e.message ? e.message : e);
    }
  }

  function applyPreset(preset){
    byId("cmdName").value = preset;
    const presets = {
      create_group: { name: "HMB" },
      delete_group: { name: "HMB" },
      add_channel: { group: "HMB", channel: "123456789012345678", lang: "EN" },
      remove_channel: { group: "HMB", channel: "123456789012345678" },
      mirror_list: {},
      mirror_clear: {}
    };
    const obj = presets[preset] || {};
    byId("cmdOptions").value = JSON.stringify(obj, null, 2);
  }

  document.addEventListener("DOMContentLoaded", () => {
    let cfg = loadConfig();
    refreshDebug(cfg);
    pingGateway(cfg);
    pingRelay(cfg);

    byId("btnSettings").addEventListener("click", () => openSettings(cfg));
    byId("btnCloseSettings").addEventListener("click", closeSettings);
    byId("settingsBackdrop").addEventListener("click", (e) => {
      if (e.target === byId("settingsBackdrop")) closeSettings();
    });

    byId("btnSaveConfig").addEventListener("click", () => {
      const next = {
        BACKEND_URL: normalizeUrl(byId("inpBackendUrl").value),
        BACKEND_API_KEY: (byId("inpBackendKey").value || "").trim(),
        RELAY_URL: normalizeUrl(byId("inpRelayUrl").value),
        RELAY_API_KEY: (byId("inpRelayKey").value || "").trim(),
        GUILD_ID: (byId("inpGuildId").value || "").trim()
      };

      if (!next.BACKEND_URL) return showSettingsMsg("Invalid Gateway URL", false);
      if (!next.RELAY_URL) return showSettingsMsg("Invalid Relay URL", false);

      saveConfig(next);
      cfg = loadConfig();
      refreshDebug(cfg);
      closeSettings();
      pingGateway(cfg);
      pingRelay(cfg);
    });

    byId("btnClearConfig").addEventListener("click", () => {
      localStorage.removeItem(LS_KEY);
      cfg = loadConfig();
      refreshDebug(cfg);
      showSettingsMsg("Cleared. Fill URLs and Save.", true);
    });

    byId("btnRefreshGateway").addEventListener("click", () => { cfg = loadConfig(); refreshDebug(cfg); pingGateway(cfg); });
    byId("btnRefreshRelay").addEventListener("click", () => { cfg = loadConfig(); refreshDebug(cfg); pingRelay(cfg); });

    byId("btnRun").addEventListener("click", () => { cfg = loadConfig(); refreshDebug(cfg); runCommand(cfg); });

    document.querySelectorAll("[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset")));
    });

    byId("btnCopyDebug").addEventListener("click", async () => {
      const dbg = refreshDebug(loadConfig());
      const txt = JSON.stringify(dbg, null, 2);
      try { await navigator.clipboard.writeText(txt); } catch {}
    });

    if (!cfg.BACKEND_URL || !cfg.RELAY_URL){
      openSettings(cfg);
    }
  });
})();
