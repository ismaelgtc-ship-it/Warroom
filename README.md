# warroom (Cloudflare Pages)

Static dashboard for monitoring.

## Deploy
- Cloudflare Pages: set **Build command** to none, **Output directory** to `public`.

## Config
Edit `public/config.js`:
- `GATEWAY_PUBLIC_URL` -> your gateway base URL (Render)

The dashboard only calls the **public** endpoint:
- `GET /api/core/public-status`

No secrets are embedded in the browser.
