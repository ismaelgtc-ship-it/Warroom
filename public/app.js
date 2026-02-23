(() => {
  const LS_KEY = "WARROOM_CONFIG";

  function $(id){ return document.getElementById(id); }

  function readConfig(){
    // Priority: localStorage > window.WARROOM_CONFIG (from config.js)
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : (window.WARROOM_CONFIG || {});
      }
    }catch{}
    return window.WARROOM_CONFIG || {};
  }

  function writeConfig(cfg){
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }

  function setPill(el, up){
    el.classList.remove("up","down");
    el.classList.add(up ? "up":"down");
    el.textContent = up ? "UP":"DOWN";
  }

  async function fetchJson(url, opts){
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch{ data = { raw:text }; }
    return { ok: res.ok, status: res.status, data };
  }

  async function refreshGateway(){
    const cfg = readConfig();
    const statusEl = $("gatewayStatus");
    const hintEl = $("gatewayHint");

    if(!cfg.BACKEND_URL){
      setPill(statusEl, false);
      hintEl.textContent = "Config error: set WARROOM_CONFIG.BACKEND_URL";
      return;
    }
    const url = cfg.BACKEND_URL.replace(/\/+$/,"") + "/api/core/status";
    const headers = {};
    if(cfg.BACKEND_API_KEY) headers["X-API-Key"] = cfg.BACKEND_API_KEY;

    try{
      const r = await fetchJson(url, { headers });
      setPill(statusEl, r.ok);
      hintEl.textContent = r.ok ? "OK" : `HTTP ${r.status}`;
    }catch(e){
      setPill(statusEl, false);
      hintEl.textContent = "Network error";
    }
  }

  async function refreshRelay(){
    const cfg = readConfig();
    const statusEl = $("relayStatus");
    const hintEl = $("relayHint");

    if(!cfg.RELAY_URL){
      setPill(statusEl, false);
      hintEl.textContent = "Config error: set WARROOM_CONFIG.RELAY_URL";
      return;
    }
    const url = cfg.RELAY_URL.replace(/\/+$/,"") + "/health";
    const headers = {};
    if(cfg.RELAY_API_KEY) headers["X-API-Key"] = cfg.RELAY_API_KEY;

    try{
      const r = await fetchJson(url, { headers });
      setPill(statusEl, r.ok);
      hintEl.textContent = r.ok ? "OK" : `HTTP ${r.status}`;
    }catch(e){
      setPill(statusEl, false);
      hintEl.textContent = "Network error";
    }
  }

  function openSettings(){
    const cfg = readConfig();
    $("setBackendUrl").value = cfg.BACKEND_URL || "";
    $("setBackendKey").value = cfg.BACKEND_API_KEY || "";
    $("setRelayUrl").value   = cfg.RELAY_URL || "";
    $("setRelayKey").value   = cfg.RELAY_API_KEY || "";
    $("setGuildId").value    = cfg.GUILD_ID || "";

    const modal = $("settingsModal");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden","false");
  }

  function closeSettings(){
    const modal = $("settingsModal");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden","true");
  }

  function saveSettings(){
    const cfg = {
      BACKEND_URL: $("setBackendUrl").value.trim(),
      BACKEND_API_KEY: $("setBackendKey").value.trim(),
      RELAY_URL: $("setRelayUrl").value.trim(),
      RELAY_API_KEY: $("setRelayKey").value.trim(),
      GUILD_ID: $("setGuildId").value.trim(),
    };
    // normalize empties
    Object.keys(cfg).forEach(k => { if(!cfg[k]) delete cfg[k]; });
    writeConfig(cfg);
    closeSettings();
    refreshGateway();
    refreshRelay();
  }

  async function runCommand(){
    const cfg = readConfig();
    const errEl = $("cmdError");
    const outEl = $("cmdResult");
    errEl.textContent = "";
    outEl.value = "";

    if(!cfg.RELAY_URL){
      errEl.textContent = "Config error: set WARROOM_CONFIG.RELAY_URL";
      return;
    }
    const cmd = ($("cmdName").value || "").trim();
    if(!cmd){
      errEl.textContent = "Command is required.";
      return;
    }
    let opts = {};
    try{
      const raw = $("cmdOpts").value.trim();
      opts = raw ? JSON.parse(raw) : {};
    }catch{
      errEl.textContent = "Options must be valid JSON.";
      return;
    }

    const url = cfg.RELAY_URL.replace(/\/+$/,"") + "/api/dashboard/commands/execute";
    const headers = { "Content-Type":"application/json" };
    if(cfg.RELAY_API_KEY) headers["X-API-Key"] = cfg.RELAY_API_KEY;

    const payload = { name: cmd, options: opts, guildId: cfg.GUILD_ID };
    try{
      const r = await fetchJson(url, { method:"POST", headers, body: JSON.stringify(payload) });
      outEl.value = JSON.stringify({ ok:r.ok, status:r.status, data:r.data }, null, 2);
      if(!r.ok) errEl.textContent = `Execution failed (HTTP ${r.status}).`;
    }catch{
      errEl.textContent = "Network error calling Relay.";
    }
  }

  function bind(){
    // Button binding (fixed)
    $("settingsBtn")?.addEventListener("click", openSettings);
    $("cancelSettings")?.addEventListener("click", closeSettings);
    $("saveSettings")?.addEventListener("click", saveSettings);

    // Close modal when clicking backdrop
    $("settingsModal")?.addEventListener("click", (e) => {
      if(e.target && e.target.id === "settingsModal") closeSettings();
    });

    $("refreshGateway")?.addEventListener("click", refreshGateway);
    $("refreshRelay")?.addEventListener("click", refreshRelay);
    $("runCmd")?.addEventListener("click", runCommand);

    // Initial refresh
    refreshGateway();
    refreshRelay();
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
