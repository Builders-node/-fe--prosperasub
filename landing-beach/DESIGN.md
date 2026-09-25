# Beach Club landing — design system

Everything on this page comes from one file, `index.html`: markup, tokens, CSS
and motion. No build step, no framework, no external request at runtime.

This document is the reference for changing it. Read the **Invariants** section
before touching motion — three separate bugs on this page have come from the
same mistake, and it is not one the type checker or a build can catch.

---

## Tokens

All in `:root`. Nothing on the page should use a raw value that has a token.

### Palette

The five brand values are fixed and must not be substituted.

| Token | Value | Where it is allowed |
|---|---|---|
| `--azure` | `#084887` | dark section grounds |
| `--azure-deep` | `#04294c` | photo-slot fallback under an unloaded image |
| `--orange` | `#F58A07` | the CTA pill, and the `◆` before a micro-label |
| `--sand` | `#F9AB55` | the hero wordmark; accent inside dark copy |
| `--lavender` | `#909CC2` | hairlines only |
| `--ghost` | `#F7F5FB` | light pill fills, type on dark |

Plus the neutrals the interface is actually built from:

| Token | Value | Role |
|---|---|---|
| `--paper` | `#EFEDF4` | page ground |
| `--paper-up` | `#F7F5FB` | a section lifted off the page |
| `--ink` | `#0A1622` | body and display type |
| `--ink-60` | `#56606B` | secondary copy, labels |
| `--rule` | `rgba(10,22,34,.13)` | hairlines |

**The interface is achromatic; colour arrives from content.** This is the rule
that keeps the palette usable. The first version of this page put lavender
labels on paper (2.51:1), orange chapter numbers (2.28:1) and white on the
orange CTA (2.46:1) — three AA failures, the worst of them on the single most
important element. Demoting colour to content fixed all three at once instead
of patching them one at a time.

**Orange is never text on paper.** It measures 2.46:1, which fails even the
3:1 allowed at display sizes. When a headline "wants" to be orange, the answer
is ink, and the colour comes from a photograph instead.

### Type

One family. `--mono` is deliberately an alias of `--sans`: micro-labels used to
use a system mono, and their technical texture now comes from the treatment —
uppercase, `.1em` tracking, 11px — rather than a second typeface.

```
--t-label 11   --t-micro 13   --t-body 16   --t-lead 20
--t-h3    32   --t-h2    64   --t-display 140
```

The scale jumps on purpose and there is almost nothing between the steps. Two
display sizes are set outside it, in `clamp()`, because they have to fill a
measured width rather than hit a step:

- `.mega-h` — `clamp(32px,6.4vw,96px)`, the centred display in §01 and §03
- `.mast-word` — `17.4vw`, tuned so "Beach Club" fills ~85% of the viewport

Inter, self-hosted, **latin subset only** (71 KB), variable, roman only. The
italic face was 78 KB serving nothing. `font-feature-settings:"tnum" 1,"cv11" 1`
on `body` — tabular figures so `$75` and the `01–06` list don't shift width
between weights.

### Spacing, radius, measure

```
--s-2 8   --s-3 12  --s-4 16  --s-6 24  --s-8 32
--s-12 48 --s-16 64 --s-24 96 --s-32 128 --s-40 160 --s-50 200
--gut 40                        page gutter
--r-frame 18px                  every photo frame
```

`.wrap` is `max-width:1440px` centred with `--gut` padding. Section rhythm is
`--s-40` (160px) top and bottom.

**`--r-frame` applies to photo frames only** — `.abc .shot`, `.band`, `.pcard`,
`.card`. Sections, panels and the pill keep their own shapes. Before the token
existed the page carried three different corners; if you add a framed image,
use the token rather than a number.

### Mobile scale

Mobile gets its **own** scale in `@media (max-width:900px)`, not an
interpolated desktop one — display sizes do not shrink gracefully:

```
--t-h3 24  --t-h2 36  --t-display 64  --t-lead 17
--s-24 64  --s-32 72  --s-40 88  --s-50 96  --gut 20
```

---

## Page structure

AIDA down the page, Hook Model across the offer.

| | Section | What it does |
|---|---|---|
| ATTENTION | `header.mast` | photograph, then the name at display size |
| INTEREST | `section` (§01) | the sentence they say to themselves |
| | `#included` (§02) | horizontal rail — six things, shown not described |
| DESIRE | `.bleed` (§03) | the rhythm of a week, type only |
| | `.bands` | three full-bleed photo strips |
| | `#courts` (§04) | the part you actively use |
| | `#membership` (§05) | the whole number |
| ACTION | `#questions` (§06) | the last three reasons to leave |
| | `.close` (§07) | the same tap as the masthead |

Hook: **trigger** the ad, then §01 naming the feeling · **action** one tap to
checkout, no form, no callback · **reward** §03, deliberately *variable* — six
doors, so a Saturday is never the same twice; a fixed perk stops pulling by the
third visit · **investment** §04, booking a court and adding family at $10 —
small deposits that make the next visit likelier, not a bigger bill.

### Recurring blocks

**`.mega`** — centred display: uppercase headline capped at `17ch`, optional
oval photo cut-outs (`.blobs` > `.blob--a…d`) placed to cut *into* the text
column, centred lede, optional rule-and-arrow link. Used by §01 (with ovals)
and §03 (`.mega--plain`, without). It is shared, not copied, so the two cannot
drift apart.

The ovals are `aria-hidden` and captionless. Everything they could be read as
saying is also said at full contrast in text that nothing overlaps — they are
texture, so losing them costs only the look.

**`.chap`** — a section heading with an aside beside it. No rule above it; the
section rhythm already separates chapters and the hairline was the weaker of
the two doing the same job.

**Photo frames** — `.shot` for inline, `.card` for rail items, `.pcard` for the
mounted cards in §05, `.band` for full-bleed strips.

---

## Photography

Every `<img>` carries its path in **`data-src`, not `src`**. An inline probe
loads the file first and only then assigns `src` and sets `data-loaded`, which
the CSS uses to fade the image in. A missing photo therefore leaves the frame's
own designed fill on screen rather than a broken-image icon.

Note the probe does *not* avoid the 404 — the probe request itself 404s. What
it buys is that the failure is invisible and the layout is still finished.

Every frame is designed to survive with no photograph: `.shot` has a palette
wash plus its brief, the bands have their own gradients and the hero's grain.

### Adding a photo

1. Drop the file in `photos/` under the name the markup already points at.
2. **Check its edges.** `sun-water.jpg` arrived from a stock service as a
   1024×720 frame pillarboxed to 1280×720 with pure `rgb(254,0,0)` — the
   element measured full width with `object-fit:cover` and no transform, so
   nothing in the code looked wrong. Bars live inside the JPEG. Sample the
   middle row of pixels at both ends before trusting a file.
3. `sips -c <height> <width> in.jpg --out in.jpg` crops from the centre. There
   is no ImageMagick or PIL on this machine.

### Current state — read this before shipping

**The photographs are comps and several are plainly wrong.** They came from a
keyword stock service: the pools frame is a Christmas display in a hotel
atrium, the gym is a slogan t-shirt, the tennis is Wimbledon stewards, Pete's
range is a driving range in winter, and the hero is a resort hotel facade.

This page sells membership of one specific club in Roatán. **It must not take
paid traffic until they are replaced.** `photos/README.md` carries the shot
list.

---

## Contrast

Every text colour on this page is measured, not chosen. Two methods, depending
on the ground:

**Flat ground** — arithmetic. White on `#060C14` is 19.6:1. Ink on `--paper` is
15.7:1. `--ink-60` on paper is 5.5:1.

**Photographic ground** — sample the composited frame. Draw the image to a
canvas, map viewport coordinates through the `object-fit:cover` transform,
apply the veil's own gradient stops analytically at each point, then compute
the ratio per pixel and report the **worst** case, not the mean. A hero
sentence that averages 12:1 can still fail on the 6% of its area that crosses
sunlit stucco — which is exactly what happened, and it was fixed by extending
the side gradient rather than by moving the text.

Thresholds: 4.5:1 for body and labels, 3:1 for display sizes.

Current worst cases, for reference when you change a veil:

| Where | Element | Worst |
|---|---|---|
| Hero | sentence | 4.94 |
| Hero | wordmark (sand) | 3.68 |
| §05 | heading | 7.08 |
| §05 | price | 6.41 |
| §05 | terms | 9.52 |

---

## Motion

Lenis + GSAP ScrollTrigger, both self-hosted in `vendor/` — 132 KB against
66 KB of page, which is why they load `defer` and nothing waits on them.

`prefers-reduced-motion` bails out entirely rather than degrading: no Lenis, no
triggers, scrolling handed back to the browser, and CSS smooth-scroll
re-enabled in that block only (Lenis and `scroll-behavior` fight each other).

### Effects

- masthead: photo settles, copy arrives, the name lands last and from furthest
- §01/§03 `.mega`: headline rises, ovals arrive over it, each drifts at its own rate
- §02 rail: the section pins and the row walks sideways for exactly its overflow
- bands: parallax inside the frame, label fades up
- §05: the section pins and the card column walks up through a full-screen window
- opacity-focus on the §01 stack — the line nearest viewport centre is the live one
- magnetic pills, `pointer:fine` only; on a touchscreen the transform would
  leave the button offset under the finger

### Pinned sections

Both pins measure their own travel and pin for exactly that distance, so the
section releases the moment the traverse finishes rather than holding the
reader on a finished screen:

```
rail   travel = rail.scrollWidth - innerWidth + 120
price  travel = rail.scrollHeight - col.clientHeight
```

`invalidateOnRefresh:true` and function-valued `end`/`x`/`y` so a resize
re-measures instead of keeping a stale number.

### The clip is gated on the pin

`html.has-price-motion` is added by the script and *removed again* if travel
comes out ≤ 0. The class is what gives `.price-col` its height and
`overflow:hidden`. Applied unconditionally, a script that failed to arrive
would leave four of six cards clipped inside a box that never scrolls — the
offer's own argument, hidden by its own animation. Same shape for
`has-rail-motion`.

---

## Invariants

Break these and the page breaks quietly — no error, no failed build.

### 1. One element, one tween

`gsap.from()` records its start value on first render. A second tween on the
same element and property reads whatever the first one left there and treats it
as a destination. Two `from()` tweens on one element therefore animate
`0 → 0`, and the element never appears at any scroll position.

This has cost three elements on this page:

- the hero wordmark — a scrub tween created while the intro held it at opacity 0
- §03's heading — `.mega`'s reveal plus the older `.bleed h2` reveal
- (caught before shipping) `.mega`'s blobs selected globally, handing §03's
  ovals to §01's trigger

Fixes in place: the hero parallax runs on `.mast-bottom` while the reveal runs
on `.mast-word`; the `.bleed h2` reveal skips any heading inside a `.mega`; the
`.mega` block scopes its blobs with `mega.querySelectorAll`.

**If an element must both reveal and parallax, put one of them on its parent.**

### 2. Nothing may be hidden by CSS

Every reveal is `gsap.from()`, which reads the element's current state as its
destination, so a blocked or not-yet-arrived script leaves the page finished.
The genre's usual failure is `opacity:0` in a stylesheet plus a script that
never runs — a blank page bought with ad money.

Verify by serving the page with `vendor/` removed. Last run: 132 elements
checked, hero all at opacity 1, all six price cards visible, the column
unclipped, the rail a native `overflow-x` scroller.

### 3. Every horizontal scroller has a no-JS fallback

`.rail` is a real `overflow-x:auto` scroller with `scroll-snap`. GSAP only
takes over once `has-rail-motion` is on. Without it you get a swipeable row,
not cards stranded off-screen.

### 4. The offer is hard-coded

Every number came from `beach_club_plans` / `beach_club_courts` as they were on
2026-08-09. A static page cannot know when those change — **if the plan is
edited this page is wrong until someone edits it too.** That is the trade for
the load time. The plan id lives in one `CHECKOUT` constant at the bottom of
`index.html`.

| Fact | Value | Source |
|---|---|---|
| Price | $75 / person / month | `beach_club_plans.price_per_person_cents` |
| Extra person | $10 / month | `beach_club_plans.extra_per_person_cents` |
| Amenities | 6 | `beach_club_plans.amenities` |
| Courts | 2 tennis + 1 pickleball | `beach_club_courts` |
| Court hours | 08:00–19:00 | `beach_club_courts.open_hour/close_hour` |

### 5. Attribution passes through

The CTA carries `utm_*`, `gclid`, `fbclid`, `ttclid`, `msclkid` and `ref`
through to checkout. Without it every conversion lands in analytics as direct
traffic and the campaign looks dead while it is working. A visit with no
campaign parameters still gets `utm_source=beach-landing`.

---

## Known rough edges

- **Breakpoints are not a system.** The page uses 760, 820, 900, 901 and 1440
  in different places: `--r-frame`-era CSS on 900, the rail's JS gate on 820,
  the blob layout on 760, the price pin on 901. They were each chosen for the
  thing they gate and never reconciled. Adding a fifth is worse than reusing
  one of these.
- **Deviations from the §05 reference**, both deliberate: corners stay on the
  18px token though the reference squares them, and the left column keeps the
  `$75` the reference has no equivalent for.
- **Never deployed.** No Vercel project exists for this directory yet; see
  `README.md` for the intended setup.
