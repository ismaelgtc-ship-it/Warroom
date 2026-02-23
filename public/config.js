// Warroom runtime config (edit on Cloudflare Pages build)
//
// BACKEND_URL: Gateway public URL (Render)
// BACKEND_API_KEY: must match DASHBOARD_API_KEY on Gateway
// RELAY_URL: Relay public URL (Render)
// RELAY_DASHBOARD_API_KEY: must match DASHBOARD_API_KEY on Relay
// SNAPSHOT_API_KEY: optional (enables /api/snapshot/* on Relay)
// GUILD_ID: optional (defaults to Relay env.GUILD_ID)
// OVERSEER_PUBLIC_URL: optional (for direct heavy debug views)

window.WARROOM_CONFIG = {
  BACKEND_URL: "",
  BACKEND_API_KEY: "",
  RELAY_URL: "",
  RELAY_DASHBOARD_API_KEY: "",
  SNAPSHOT_API_KEY: "",
  GUILD_ID: "",
  OVERSEER_PUBLIC_URL: ""
};
