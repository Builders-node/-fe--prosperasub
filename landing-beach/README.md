# Beach Club landing — `beachclub.everysub.net`

A single static page for paid traffic. One HTML file, no framework, no build.

**Style, tokens, motion contract and the invariants that keep breaking live in
[`DESIGN.md`](DESIGN.md).** Read that before changing how the page looks or
moves. This file is the operational side: why it exists, how to run it, how to
deploy it.

## Why it isn't a route in the main app

Paid traffic pays for every second. The marketplace SPA ships ~540 KB of vendor
bundle before it can paint. Keeping this separate also means an ad campaign can
never be taken down by a deploy to the marketplace, and the marketplace can
never be taken down by someone editing landing copy.

The one thing it does NOT duplicate is checkout. Every CTA links straight into
the real product at `everysub.net/services/beach-club/checkout/<planId>` — no
second payment implementation to keep in sync.

## Running it

Any static server. There is nothing to build.

```bash
cd frontend/landing-beach && python3 -m http.server 4321
```

## Deploying

Its own Vercel project, **`everysub-beachclub`** (team `frorexstudios-projects`),
serving `beachclub.everysub.net`. Framework **Other**, no build, output `.`.
No environment variables, no backend, no database.

The source lives in `frontend/landing-beach/`, so it travels with the frontend
mirror (`-fe--prosperasub`), but it is NOT part of the marketplace build: Vite
never reads it (it is outside `src/` and `public/`) and eslint only lints
`.ts/.tsx`. It cannot ride the frontend Vercel project either: one project
serves one build, so the subdomain added there would serve the marketplace SPA.

**Deploy from a copy outside the git repo.** Run inside the repo, the CLI sends
git commit metadata and Vercel's Hobby "team collaboration" check marks the
deployment `BLOCKED` (the command still prints a URL and exits cleanly). With no
git around it the same upload goes `READY`:

```bash
rm -rf /tmp/lb && rsync -a --exclude .env.local frontend/landing-beach/ /tmp/lb/ \
  && cd /tmp/lb && npx vercel deploy --prod --yes
```

Check the state in the Vercel dashboard, not the exit code. The directory is
linked (`.vercel/`, git-ignored), which is what the copy carries along. `vercel link` also writes a `.env.local`
holding a Vercel OIDC token; it is git-ignored and Vercel does not upload it,
but never commit it.

DNS for `everysub.net` is at Namecheap, not Vercel:
`CNAME beachclub → 8e56acbea0f9d32a.vercel-dns-017.com.`

## Weight

| | |
|---|---|
| document | 65 KB |
| font (Inter, latin subset, roman) | 71 KB |
| vendor (Lenis + GSAP + ScrollTrigger) | 126 KB |
| icons | 6 KB |
| **photos (16)** | **2 279 KB** |
| **total first visit** | **~2.5 MB** |

Two things about that number are worth knowing before this goes live:

- **`loading="lazy"` currently does nothing.** The probe in `index.html` sets it
  on the `<img>` *after* its own `new Image()` has already fetched the file, so
  every one of the sixteen photographs is downloaded on load regardless of
  where it sits on the page. Worth fixing when the real photography lands,
  since the comps are not worth optimising.
- **`photos/sun-water.jpg` is reused** — it is the `og:image`, the closing
  section's background and one mosaic blob, standing in for the missing
  `close-sunset.jpg` / `members.jpg`. Court 1's frame borrows `tennis.jpg`.

The page began at 28 KB with no photography at all. That figure appears in old
commit messages and is no longer true.

## Before this takes paid traffic

The photographs are comps from a keyword stock service and several are plainly
wrong — the pools frame is a Christmas display in a hotel atrium, the gym is a
slogan t-shirt, the tennis is Wimbledon stewards, and the hero is a resort
hotel facade. This page sells membership of one specific club in Roatán.

`photos/README.md` carries the shot list. See **Photography** in `DESIGN.md`
for how to add files and what to check about them first.

## When the offer changes

Every number is hard-coded from `beach_club_plans` / `beach_club_courts` as they
were on 2026-08-09. A static page cannot know when those change: **if the plan
is edited, this page is wrong until someone edits it too.** The table of facts
and their source columns is in `DESIGN.md` under *Invariants → The offer is
hard-coded*. The plan id lives in one `CHECKOUT` constant at the bottom of
`index.html`.
