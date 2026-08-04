# Hockey Pipeline — Team Trends

Live dashboard: NHL team stats fetched nightly, cached in Cloudflare KV, served
from a single Worker (API + static frontend).

## Already done for you

- KV namespace created: `hockey-pipeline-team-stats` (id: `edd6875957fa43e4806ba12c9d78f957`)
- `wrangler.toml` is wired with that ID already

## Deploy (run from this project's root)

```bash
npm install
npx wrangler login          # opens a browser, one-time auth
npm run deploy               # builds the frontend + deploys the Worker
```

That's it — `npm run deploy` runs `vite build` then `wrangler deploy`, which
uploads both the Worker code and the static assets in one shot.

Your site will be live at `https://hockey-pipeline.<your-subdomain>.workers.dev`.
Wrangler prints the exact URL at the end of `deploy`.

## First data load

The cron (`0 9 * * *`, once daily) keeps data fresh, but the very first
request for any team/season computes on demand and caches it — so the site
isn't empty on day one. Give the first load per team a few seconds.

## Custom domain

If you want this on a subdomain of elskatemm.com (matching your other
projects), add a route in `wrangler.toml`:

```toml
[[routes]]
pattern = "hockey.elskatemm.com/*"
zone_name = "elskatemm.com"
```

Then add a CNAME for `hockey` pointing to your Workers subdomain in the
Cloudflare DNS dashboard, and redeploy.

## Known placeholder

`xGoalsFor` in the computed stats is `null` — a real expected-goals model
needs shot x/y coordinates from play-by-play data, which is a bigger next
step if you want to go there.
