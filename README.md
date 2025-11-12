# Static Auction Site (GitHub Pages-ready)

This is a single-page, **static** auction website you can host on GitHub Pages. It includes:

- **Dark blue** theme with a centered **Current bid** area and an **info section** below.
- A client-side **Admin** panel at `/admin` (same build, powered by SPA routing).
- Create multiple auctions like `/{auction-name}` with:
  - Start time & duration
  - Starting bid
  - Min/Max bid increment
  - Description content (shown under the bid area)
  - Optional **reserve** and **buy-it-now** price
  - Anti‑sniping auto‑extension (configurable)
- **Change admin username/password** in the Admin settings (default `admin` / `password123`). Passwords are stored as SHA‑256 hashes in `localStorage`.
- **Bid history**, countdown timer, and currency symbol setting.
- **No build step** needed; pure HTML/CSS/JS.

> ⚠️ **Important:** This is a front‑end demo using the browser’s `localStorage`. Data is not shared between different visitors or devices, and it can be cleared by the user’s browser. For a real auction, use a server + database.

## Run locally

Just open `index.html` (use a simple static server for best results).

```bash
# Python 3
python -m http.server 8080
# then visit http://localhost:8080/
```

## Deploy to GitHub Pages

1. Create a new repository and add these files.
2. Commit and push to `main` (or `master`).
3. In **Settings → Pages**, set **Source** to `Deploy from a branch`, branch = `main`, folder = `/ (root)`.
4. Wait for the Pages site to build. Your app will be served at `https://{username}.github.io/{repo}/`.

### Routing notes

- The app uses SPA routing (client‑side). We include a `404.html` that mirrors `index.html` so deep links like `/admin` or `/auction-name` work on GitHub Pages.
- If your Pages site lives under a subpath (e.g., `/my-repo`), GitHub Pages still serves `/index.html` and `/404.html` properly. The app uses absolute paths; if you prefer, you can switch to relative paths in `index.html` and `404.html` (change `/assets/...` to `assets/...`).

## Default login

- **Username:** `admin`
- **Password:** `password123`

You can change both in **Admin → Settings**.

## Feature ideas you can enable later

- Require bidder verification (email/OTP) — needs a backend
- WebSocket live updates — needs a backend
- Image gallery per auction
- Categories and search
- CSV export of bids
- Server‑side anti‑sniping and payment integration

## Security note

Because this is a static site, **authentication is client‑side only** and can be bypassed by a determined user. This is fine for a demo, class project, or local testing, but **not** for real money. For production: add a server (Node, Python, etc.), move the admin behind real auth, and store auctions/bids in a database.

---

MIT License.
