# Midjourney shot list — Operating Ladder hero images

Style anchor: the two existing pieces (`hero.png`, `operating-map-hero.png`) — SNES-era
16-bit pixel art, real-world civic-infrastructure scenes, muted blue-gray + cream palette
with warm orange and teal accents, big cumulus clouds, clean composition, no readable text.

**Shared style suffix for every prompt** (once the site is live, the `--sref` URLs lock
Midjourney to the existing art; until then drop the flag and upload the two images as
style references instead):

```
detailed 16-bit pixel art illustration, SNES-era videogame aesthetic, crisp pixel
clusters, muted blue-gray and cream palette with warm orange and teal accents, soft
daytime light, large cumulus clouds, clean composition, no text, no lettering
--ar 16:9 --sref https://shanegring.com/images/hero.png https://shanegring.com/images/map-hero.png
```

> **Note (2026-07-31):** the second `--sref` used to be `operating-map-hero.png`. The
> offer restructure renamed it to `map-hero.png`, so the old URL 404s once that ships.
> `hero.png` is untouched. If you generate before the rename is live on production,
> the old filename still resolves — but log new work against the new one.

Export notes: placeholders are 16:9; export ~2464px wide for retina. The CSS renders
these with `image-rendering: pixelated`, so downscale with nearest-neighbor if needed.
Midjourney garbles written text — keep signs/boards abstract color blocks, like the
transit map in the existing Operating Map hero.

---

## 1. `/work-with-me` — the path ✅ DONE (`work-with-me-hero.png`, 2026-07-08)

**Idea to carry:** one continuous path, five distinct stops, rising toward something built.

> a hillside funicular railway climbing from a small seaside platform to a bright
> hilltop terminus, five distinct stations along the track, each station larger and
> more built-up than the last, one tram car mid-climb, terraced town and harbor below,
> [style suffix]

## 2. `/read` — the Read ✅ DONE (`read-hero.png`, 2026-07-08)

**Idea to carry:** a person closely reading a building the way I read a website.

> a building inspector on a rolling scaffold closely examining an aging storefront
> facade, clipboard in hand, small annotation flags pinned to the brickwork, warm
> light from the shop window, quiet street, [style suffix]

## 3. `/operating-site` — the build ✅ DONE (`operating-site-hero.png`, 2026-07-08)

**Idea to carry:** prefab modules, each complete, craned into one coherent building.

> a modular construction site, a tower crane lowering a fully furnished prefabricated
> room module into a half-assembled modern building, other completed modules already
> lit and occupied, workers guiding the module into place, [style suffix]

## 4. `/operating-partner` — the monthly rhythm ✅ DONE (`operating-partner-hero.png`, 2026-07-08)

**Idea to carry:** someone assigned to keep what the board says matched to what's true.

> a station master on a ladder updating a huge split-flap departure board in a grand
> train station at dusk, board tiles mid-flip rendered as abstract color blocks,
> commuters below, warm lamps against blue evening light, [style suffix]

---

## 5. Site-wide footer band — the whole city ✅ DONE (`footer-city.png`, 2026-07-08; footer background #2b5d64 continues the water)

**Idea to carry:** every motif in one skyline — the city the rest of the art lives in.
One strip used across all page footers.

> a wide panoramic city skyline at dusk seen from across the water, an elevated train
> crossing the full width on a viaduct, a funicular track climbing a hill on the left,
> a grand station facade and a tower crane among the rooftops, telecom towers with
> blinking lights, hundreds of small warm lit windows, harbor boats in the foreground,
> [style suffix but with] --ar 4:1

If 4:1 comes back mushy or repetitive, generate at --ar 21:9 and use Midjourney's
pan left/right to extend the strip, or upscale and crop a horizontal band.

---

## 7. `/scan` — the Scan hero ✅ DONE (`scan-hero.png`, 2026-07-08)

**Idea to carry:** a beam sweeping the city, lighting up what machines can see —
some of it lit, some in shadow.

> a lighthouse on a rocky point at the edge of a harbor city at dusk, its bright
> beam sweeping across the water and lighting up a slice of the buildings on the
> far shore, the lit buildings glowing warm while the rest sit in blue shadow,
> small boats on the water, [style suffix] --ar 16:9

Placement: below the scan intro (the CSS gauge card on the right stays — it's
replaced by live results when a scan runs).

## 8. `/approach` — the centralizing layer ✅ DONE (`approach-station.png`, 2026-07-09)

**Idea to carry:** the hub the whole city runs through — every line converges into it.

> a grand central railway station at the heart of a city seen from a high vantage
> point in morning light, many train lines converging into it from every direction,
> trains arriving and departing, the glass-roofed station hall glowing warm, the
> city's streets and buildings radiating outward around it, people flowing toward
> the entrances, [style suffix] --ar 21:9

Placement: likely below the "Looked at vs. run from" section; the existing
approach-hero.svg diagram stays in the hero (it labels what radiates from the
site — real explanatory content). Fall back to --ar 16:9 + crop if 21:9 is mushy.

## 6. Path icons — all five stages ✅ v2 DONE (`icons/*.png`, 2026-07-09)
(v1 had too much variance. v2: flat front-facing enforced, one color per rung —
Scan teal, Read sky blue, Map cobalt, Site warm orange, Partner brick red. The
ramp runs cool diagnostics → warm build/run, matching the ladder.)

> **Correction (2026-07-31):** sampled from the delivered PNGs, the actual hues
> are Scan 178°, Read 214°, Map **292° — purple, not cobalt**, Site 27°, Partner
> 9°. Worth knowing before picking any new icon colour, because purple is taken.

Generate all five together so the set matches (the hand-coded `icons/map.svg` gets
replaced too). MJ returns 1024px squares, not true 16px grids — Claude downscales
nearest-neighbor to the 56px slots and cleans backgrounds on delivery.

**Shared suffix:**

```
simple pixel art icon, chunky 16x16-style pixel sprite, thick blocky pixels, flat
cobalt blue and sky blue palette (#4a90e2, #5ba3f5, #6bb6ff) on a plain white
background, single centered object, retro videogame inventory icon, no text,
no border --ar 1:1 --stylize 50
```

Objects (each echoes its page's hero scene):

1. Scan — `a radar dial gauge with a sweeping needle,`
2. Read — `a clipboard with a magnifying glass over it,`
3. Map — `a folded transit map with route lines,`
4. Site — `a crane hook lifting a small building block,`
5. Partner — `a split-flap departure board tile mid-flip,`

Tips: generate all five in one session; reroll drifters with `--seed` from the best
job; `--stylize 50` keeps MJ literal instead of illustrative.

---

## 9. Guide heroes — `images/guides/*.png`

Same style suffix, `--ar 16:9`, exported 1456x816 and quantized to PNG8 (~380–460KB)
so they sit alongside the offer heroes. The first ten were generated in one pass on
2026-07-14 and their prompts were never recorded — only the `og:image:alt` on each
guide page survives as a description of the scene. Log new ones here.

### `what-is-a-fractional-coo.png` ✅ DONE (2026-07-27)

**Idea to carry:** a senior specialist who comes aboard for the hard passage and then
leaves — the ship was never theirs, and there is another one waiting. Part-time,
serves more than one company, and the port runs fine without them.

> a harbor pilot cutter pulling away from a large cargo ship that continues under
> its own power into a busy well-run port, cranes working and lamps lit along the
> quay, the small cutter already turning toward a second ship waiting outside the
> harbor mouth, terraced town rising behind, [style suffix] --ar 16:9

Conversion: `magick SRC -strip -colors 256 -dither None PNG8:DEST` (378KB, no
visible banding). `pngquant` is not installed on this machine; ImageMagick is.

## 10. `/ai-operations` — the unclaimed flank ✅ DONE (`ai-operations-hero.png`, 2026-07-27)

**Idea to carry:** rules encoded into the infrastructure so most of the work routes
itself, and a person only for the exception. Which is literally the DRVN story the
page tells — what the agent may change on its own vs. what it flags.

> a busy freight rail sorting yard seen from beside the tracks, dozens of wagons
> routing themselves through automated track switches that throw on their own,
> signal lights and lamps along the rails, one single wagon held on a short side
> track beside a small lit signal cabin where a keeper watches from the window,
> harbor cranes and a terraced town in the background, [style suffix] --ar 16:9

Deliberately not a harbor-pilot or hillside-climbing composition — those are the
fractional-COO guide and `/work-with-me`, and the set was starting to repeat itself.

### `claude-in-chrome-stop-screenshots.png` ✅ DONE (2026-07-28)

**Idea to carry:** driving by the map instead of by looking. The operator sets routes
from the illuminated board alone and never looks out the window. The render's window
came back split — daylight clouds on one pane, lamplit night on the other — kept on
purpose: it's surreal, but the clouds are the house motif and the split reads as
"the view doesn't matter." Wired into the guide page hero, the `/guides/` thumb, and
og:image. 301KB PNG8 via the standard magick conversion.

> a night railway signal box interior seen from behind the operator, a large
> illuminated track diagram board showing every route and switch as glowing lines,
> the operator setting a route by lever from the board alone while the window shows
> only darkness and lamps outside, warm cabin light, [style suffix] --ar 16:9

---

## 11. `/install` — the Install hero (`install-hero.png`) ⬜ TO GENERATE

Currently reusing the renamed `ai-operations-hero.png` (the sorting yard), which is a
picture of automation running itself — the opposite of what this page sells. The
Install is one day, your hands on the keyboard, and me leaving.

**Idea to carry:** the fit-out is finished, the tools are mounted and in order, the
owner is running the machine for the first time, and the installer is packing up to
go. The whole product is that he leaves and it still works.

> a small workshop at the end of a fit-out day, a newly installed workbench with
> hand tools mounted in neat order on a pegboard wall, the owner standing at the
> bench running the new machine for the first time with both hands on the controls
> and a first finished piece in front of him, an installer by the open door
> shouldering his toolbag about to leave, warm work-lamp light inside, a harbor town
> and evening sky through the window, [style suffix] --ar 16:9

Deliberately an interior and deliberately not transport infrastructure — the rail and
harbor motifs are used up (sorting yard, signal box, pilot cutter, station, funicular)
and the set had started to repeat itself.

## 12. `/guides/install-requirements` (`install-requirements.png`) ⬜ TO GENERATE

No image at all today, which is why the guide is not listed on `/guides/` — the index
item requires a thumbnail. Generating this unblocks that listing.

**Idea to carry:** the same workshop the morning *before*, everything staged and one
thing missing. The guide's whole argument is that the day dies in the first two hours
if a key nobody has is the thing you go looking for at 9:15.

> the same small workshop at dawn before the fit-out begins, a wall-mounted key
> cabinet standing open beside the door with rows of tagged keys on hooks rendered as
> abstract color blocks and one hook conspicuously empty, crates and equipment staged
> on the floor in three separate neat groups ready for the day, the machine still
> under a dust sheet, cool blue dawn light through the window, [style suffix] --ar 16:9

The three staged groups are the three tiers and the empty hook is the blocking item
(registrar access). Pairs with #11 as before/after of one room — the guide is the prep
for that day, so the continuity is the point.

## 13. Track icons — the three ways in ⬜ TO GENERATE (`icons/track-*.png`)

Replaces the numbered dashed placeholders (`icons/placeholder-{1,2,3}.svg`) now
sitting on the homepage cards and in the nav dropdown.

Different constraint from the five Path icons above: those each echo their page's
hero scene, but these must **not** depict a product. The tracks are deliberately
generic — the reader self-identifies first and meets the offers afterward — so the
mark has to carry the intent, not the thing being sold.

Colour: the five-rung ramp was cool diagnostics → warm build/run. These three are
parallel choices rather than a progression, so they read as siblings — teal for
diagnosis, warm orange for handing it over, cobalt for doing it yourself. Swap the
palette line per icon rather than using the shared one.

**Shared suffix (palette swapped per icon):**

```
simple pixel art icon, chunky 16x16-style pixel sprite, thick blocky pixels, flat
[PALETTE] on a plain white background, single centered object, retro videogame
inventory icon, no text, no border --ar 1:1 --stylize 50
```

1. **Find out what's wrong** — `a magnifying glass held over a small document,`
   palette: `teal palette (#2b8a8a, #3fa9a9, #5fc4c4)`
2. **Have it done for you** — `a construction hard hat,`
   palette: `warm orange palette (#d97a2b, #e8933f, #f2ab5c)`
3. **Learn to do it yourself** — `a wrench and a screwdriver crossed,`
   palette: `cobalt blue palette (#4a90e2, #5ba3f5, #6bb6ff)`

Legibility is the whole job here — these render at 22px in the nav dropdown and
44px on the homepage cards, so silhouette beats detail. Hard hat and crossed tools
both survive 22px; a keyboard was the first choice for #3 and was dropped because
the key grid turns to mush at that size.

Generate all three in one session so the set matches, and reroll drifters with
`--seed` from the best job. Downscale nearest-neighbour, clean the background to
transparent, and deliver as PNG alongside the existing `icons/*.png`.

### Generated 2026-07-31 — picks

| Icon | Job | Pick | Why |
|---|---|---|---|
| Find out what's wrong | `f4672a21-4c42-4a23-a940-e8eaff974ca7` | index 0 | Chunkiest pixels, and the only variant with a document actually inside the lens, which is what carries the meaning. |
| Have it done for you | `df519e51-08a3-4e52-b7ba-3d08a8b78a2b` | index 2 | The only front-facing one. The other three are 3/4 angled, which breaks the flat-front rule the v2 Path icons settled on. |
| Learn to do it yourself | `f5d682c6-8656-48a2-9ef1-3b4c89dd9d90` | index 0 | Boldest, thickest pixel clusters. Index 2 came back smooth and vector-like, off-brief for a 16-bit sprite. |

Full-res URL pattern: `https://cdn.midjourney.com/<job>/0_<index>.png`


## 14. The three missing offer icons ✅ DONE (`icons/seat|install|session.png`, 2026-08-01)

The restructure left `/work-with-me` inconsistent: Scan, Read, Map, Site and
Partner carry a `path-mark` icon and the Seat, Install and Session do not. Worst
inside bucket two, where the Seat sits bare beside three offers that have one.

Same recipe as section 6 (the v2 Path icons): flat, front-facing, one colour each,
`--stylize 50`, downscaled to 112x112 with the white knocked out to transparent.
The five-rung ramp ran cool diagnostics to warm build-and-run, so these continue
it — the Seat deepest since it is the largest done-for-you commitment, and the two
learn-it-yourself offers in a green that sits outside the ramp entirely.

**Shared suffix (palette swapped per icon):**

```
simple pixel art icon, chunky 16x16-style pixel sprite, thick blocky pixels, flat
[PALETTE] on a plain white background, single centered object, retro videogame
inventory icon, no text, no border --ar 1:1 --stylize 50
```

Colours are picked from the two gaps left on the wheel. Taken already: 9°, 23°,
27°, 176°, 178°, 214°, 226°, 292°. That leaves greens (~90–150°) and gold
(~45–70°) genuinely open — everything else would collide at 22px.

1. **The Seat** — `a high-backed office chair seen from the front,`
   palette: `warm gold palette (#c8891a, #e0a52f, #f0bd55)` — ~48°
   Literal on purpose: the offer is named for the seat, and a chair reads at 22px
   where anything more abstract will not. Gold rather than the burgundy first
   planned, which sat at ~350° and would have been mush next to Partner's 9°
   brick red at icon size.
2. **The Install** — `a power plug going into a wall socket,`
   palette: `forest green palette (#2f6b46, #3d8a5a, #52a872)` — ~150°
   "Installed and running" in one shape. A laptop or terminal window was the
   obvious choice and was dropped — a screen at 22px is a grey rectangle, and
   crossed tools already carry the do-it-yourself idea on the track icon.
3. **The Session** — `a single speech bubble,`
   palette: `sage green palette (#6f8f4a, #87a75f, #a3c17e)` — ~95°
   One call, one problem. Same green family as the Install so the two
   learn-it-yourself offers read as siblings, but 55° apart and lighter, so they
   are still told apart.

Alternative if these are not worth generating: strip the `path-mark` images from
the five offers that have them on `/work-with-me` so all eight match. Cheaper, but
loses the colour coding the Path already established.

### Generated 2026-07-31 — picks

| Icon | Job | Pick | Why |
|---|---|---|---|
| The Seat | `659441e5-f187-44fa-8e7d-e50f7d2ef93c` | index 0 | Brightest gold of the four, which is what keeps it clear of Site's dark brown at 27°. Front-facing with arms and a full five-star base, so the silhouette survives 22px. |
| The Install | `45752656-42af-49d3-8a1c-8631bb261802` | index 2 | The only variant whose plug reads as a plug at icon size, and the brightest green of the set. The two that included a wall plate lost the plug to it. |
| The Session | `50cc08a5-dc89-44d3-a6c2-bce95c00d0d5` | index 2 | Most saturated sage of the four — the other three came back grey-green, which would have defeated the point of colour coding. Clean rounded bubble with a legible tail. |

Full-res URL pattern: `https://cdn.midjourney.com/<job>/0_<index>.png`

### Delivered and installed 2026-08-01

Two of the three came in on a different index than the table above picked. The
files delivered win — the picks above were made from grid thumbnails, the choice
below was made from the full-res image:

| Icon | Job | Index picked | Index delivered |
|---|---|---|---|
| The Seat | `659441e5` | 0 | **3** — gold chair, arms, four-leg base rather than the five-star. Reads clean at 22px. |
| The Install | `45752656` | 2 | **neither** — all four were unusable at icon size. Redrawn by hand; see below. |
| The Session | `50cc08a5` | 2 | **2** — as picked. |

**The Install was redrawn by hand — it is the one icon in the set Midjourney did
not produce.** Every variant lost the plug at 22px: side-on, prongs merging into
the body, a socket behind it that never resolved. The socket was the problem, not
the execution — two objects cannot both survive at 22px, and the plug is the one
carrying the meaning.

The replacement is a 16×16 sprite in `icons/install-sprite.py`: prongs up and on
the outer silhouette, a wide body, a narrowing strain relief at the foot. Three
shapes that stay distinguishable at icon size. Palette is the assigned forest
green lifted one value step — the shotlist hex read as near-black at 22px next to
the Seat and the Session.

Edit `GRID` in that file and re-run the two commands in its docstring to change
it. Point-upscale to 1024 first, then downscale through the same pipeline as the
other seven, so the edge softening matches rather than coming out harder.

If you would rather have a generated one after all, the prompt to try is the plug
**straight-on with no socket**, prongs clear of the body on the outer edge —
that is what the hand-drawn one proves reads.

The Seat is also the only icon in the set with no dark outline, so it sits a
little flatter than its neighbours. Fine at 30px on `/work-with-me`, visible at
48px in the hero.

Processing recipe, same for all three (matches the five originals — trimmed to a
104px long side, centred on a 112×112 transparent canvas):

```
magick SRC -alpha set -channel RGBA -fuzz 12% \
  -fill none -floodfill +0+0 white -fill none -floodfill +1023+0 white \
  -fill none -floodfill +0+1023 white -fill none -floodfill +1023+1023 white \
  +channel -trim +repage \
  -resize 104x104 -background none -gravity center -extent 112x112 OUT
```

Floodfill from the four corners rather than `-transparent white`, so a near-white
highlight inside the sprite can never be punched into a hole.

Wired in at the same time: `path-mark` on all three offers on `/work-with-me`
(they were the only three of eight without one) and `offer-mark` in the heroes of
`/seat`, `/install` and `/session`.

With these three the set is complete: all eight offers carry a colour, and the
three tracks carry theirs. Hues in delivery order — Partner 9°, Session ~95°,
Install ~150°, Scan 178°, Read 214°, Map 292°, Site 27°, Seat ~48°.

---

## 15. The three way-in pages ✅ DONE (`find-out|done-for-you|do-it-yourself-hero.png`, 2026-08-01)

`/find-out`, `/done-for-you` and `/do-it-yourself` (built 2026-08-01) are the only
pages in the offer set with no hero. These are **full-bleed** bands rather than boxed
images, so they run at `--ar 21:9`, not the 16:9 the rest of the list uses. Export
~3000px wide.

Each prompt is one scene and one action. The three-clause prompts earlier in this file
reliably lose their third clause; these are cut to what Midjourney will actually hold.

Scenes were picked to avoid everything already in use — the funicular (`/work-with-me`),
the facade inspection (`/read`), the crane and modules (`/site`), the split-flap board
(`/partner`), the pegboard workshop (`/install`) — while staying inside the same
civic-infrastructure-by-the-water world.

1. **`/find-out`** — what was under the surface all along
   > a utility locator marking a quiet street with bright survey paint, the buried pipe
   > and cable network faintly visible beneath the pavement,

2. **`/done-for-you`** — a crew owns the work while the owner stands off it
   (**renamed `handled-hero.png` on 2026-09-11**: /done-for-you became a 301 to
   /work-with-me, orphaning this art, and /handled needed exactly this scene.
   See section 19.)
   > a ship in a dry dock with a full crew at work on its hull from scaffolding, the
   > owner watching from the quayside with his hands in his pockets, harbor town rising
   > behind,

   **The first draft of this was a harbor pilot boarding a ship — dropped.** The pilot
   cutter is already `what-is-a-fractional-coo.png` (section 9), and section 11 records
   that the harbor and rail motifs were declared used up. A dry dock is neither: it is
   the one waterside scene the set has not spent, and it says the thing this page says —
   somebody else is doing the work, and you are not on the scaffold.

3. **`/do-it-yourself`** — your hands on it, the expert standing back
   > a boat owner turning the gate wheel of a canal lock themselves, the lock keeper
   > standing back with hands behind his back, water rising in the chamber,

**Composition note:** at 21:9 keep the subject about a third in from the left. The right
side has to stay quiet — that is where the headline sits.

**`--sref` trap (2026-08-01) — read this before generating anything.** The first run of
these three came back with "Invalid image link" on the style reference, because
`https://shanegring.com/images/map-hero.png` **does not exist on production**. The July
rename lives on the `offers/rename-and-restructure` branch and has never been deployed.

**Checking the status code is not enough.** Cloudflare Pages serves its 404 page with
HTTP **200** and `content-type: text/html`, so `curl -o /dev/null -w '%{http_code}'`
reports 200 for a missing image and the URL looks fine. Check the content type:

```
curl -sI https://shanegring.com/images/NAME.png | grep -i content-type
# image/png  = real file
# text/html  = missing, and --sref will fail silently on a 200
```

Live on production today: `hero.png`, `operating-map-hero.png`, `read-hero.png`,
`scan-hero.png`, `work-with-me-hero.png`. **Not** live: `map-hero.png`, `partner-hero.png`,
`site-hero.png` — all renames waiting on the merge.

So until that branch ships, the working suffix ends:

```
--ar 21:9 --sref https://shanegring.com/images/hero.png https://shanegring.com/images/operating-map-hero.png
```

Swap back to `map-hero.png` the day the rename is deployed, and not before. The note in
the header of this file has it the wrong way round for exactly this reason: it warned that
the *old* name would break once the rename shipped, but the rename has not shipped, so it
is the *new* name that breaks.

> **Correction (2026-08-27): the rename HAS now shipped — the state above is
> resolved.** Verified by content-type check on production: `map-hero.png` serves
> `image/png` (live), `operating-map-hero.png` serves `text/markdown` (dead as an
> sref). The working sref pair for everything is now
> `https://shanegring.com/images/hero.png https://shanegring.com/images/map-hero.png`
> — the header suffix at the top of this file is correct as written. This paragraph
> and the one above it are kept as history of the trap, not live guidance.

**Delivered 2026-08-01.** All three ran at `--ar 21:9` (Midjourney shows it as 7:3).
The first batch of three was discarded — broken sref.

| Page | Job | Pick |
|---|---|---|
| `/find-out` | `71568f1a-bd07-461c-a613-76472f075bbe` | index 0 |
| `/done-for-you` | `5276f8c1-5c5d-49d1-976e-940f47aed0a5` | index 0 |
| `/do-it-yourself` | `1a6eec82-2f8f-4f4a-a4eb-33be9935ccac` | index 2 |

Delivered at 1680x720, converted with the standard `magick SRC -strip -colors 256
-dither None PNG8:DEST` (400–428KB each).

**These are used as the hero background with the copy on top**, not as a band under it —
`.track-hero` in styles.css. Two things that cost time and are worth knowing before the
next one:

- **`object-position`'s X does nothing here.** The hero band is wider than the art's 21:9,
  so `object-fit: cover` scales to the width and crops top/bottom only. There is no
  horizontal overflow to pan. Composition has to come from the prompt, not from CSS.
- **The scrim has to clear early.** A gentle full-width wash makes the whole piece look
  milky. The gradient runs 0.97 opaque to 42%, then falls to fully transparent by 84%, so
  the headline sits on near-white and the right-hand third of the art is untouched. That
  is also why the "subject a third in from the left" note above is wrong for this use —
  for a background hero you want the subject on the **right**, clear of the copy.

---

## 16. Blog cards — `images/blog/*.png` ✅ DONE (all twelve, 2026-08-11)

The newsletter archive at `/blog` uses a different register from the guides on
purpose. Guides get a **wide establishing scene** (16:9) — a funicular, an
inspector on scaffolding, a whole place. Blog cards get **one object, close**
(1:1) — the same pixel art, the same palette, but a still life rather than a
landscape. Read side by side, the two sections look related and not
interchangeable, which is the point.

These are *not* the flat cobalt icons from section 8. Those are 16x16 sprites on
white for the nav. These carry the full scene palette and soft daylight, just
framed tight on a single thing.

**Shared style suffix for every blog card:**

```
detailed 16-bit pixel art illustration, SNES-era videogame aesthetic, crisp pixel
clusters, muted blue-gray and cream palette with warm orange and teal accents,
a single object seen close, tabletop still life, soft daylight, plain uncluttered
background, no text, no lettering
--ar 1:1 --sref https://shanegring.com/images/hero.png https://shanegring.com/images/map-hero.png
```

**Export 512x512, not 736.** Midjourney returns 1024px squares, and 1024->512
is a clean 2:1 so nearest-neighbour lands every source pixel on an exact 2x2
block and the pixel edges stay hard. A non-integer target like 736 smears
them. 512 is still 5.5x the 92px the card renders at, which covers any retina
density. Quantize to PNG8; the set came out 61-121KB each.

`magick <in> -filter point -resize 512x512 -colors 256 PNG8:<out>`

Filename must match the issue's site slug exactly — `tools/build-blog.mjs` looks
for `images/blog/<slug>.png` and falls back to a text-only card when it is
missing, so these can land one at a time without breaking anything.

| # | File (slug) | Object |
|---|---|---|
| 1 | `early-recognition-is-borrowed.png` | a small new brass nameplate freshly screwed to a door just beneath a larger, older, tarnished one |
| 2 | `certification-readiness-test.png` | a clipboard holding a checklist of ten empty boxes, a pencil laid across it |
| 3 | `from-course-to-credential.png` | a stack of thin course booklets with one embossed certificate lying across the top |
| 4 | `what-taylor-swift-taught-me-about-certifications.png` | a beaded friendship bracelet coiled beside a laminated pass on a lanyard |
| 5 | `your-website-is-a-product-not-a-poster.png` | a rolled paper poster lying beside an open control panel with dials and one lit indicator |
| 6 | `the-70-percent-rule-for-certification.png` | a hardback book left open, sticky tabs down the fore edge, a rubber stamp resting beside it |
| 7 | `certification-that-actually-matters.png` | four tall brass signal levers in a row on a frame, one pulled forward |
| 8 | `good-enough-websites-cost-more.png` | one cracked floor tile lifted away, dark rot in the cavity underneath |
| 9 | `the-four-customers-your-certification-has.png` | four differently shaped keys hanging together on a single ring |
| 10 | `why-more-content-isnt-the-answer.png` | a tall untidy stack of loose paper beside one index card with a single arrow drawn on it |
| 11 | `is-your-website-pulling-its-weight.png` | a folded tourist brochure beside a small industrial control panel with one lit button |
| 12 | `the-one-thing-i-tell-every-certification-leader.png` | a heavy embossing seal press alone on a desk, jaws open |

Tips: generate in one session so the set holds together; reroll drifters with
`--seed` from the best job. If a prompt comes back as a wide scene rather than a
close object, add `macro, tightly cropped, object fills the frame`.

---

## 17. Agent avatars — `~/ClaudeCode/apps/agents/<slug>/avatar.png` ⬜ IN PROGRESS

Slack-bridge agent avatars. Flat pixel-icon register (like §8's offer icons):
chunky 16x16-style sprite, plain white background, single centered object,
`--ar 1:1 --stylize 50`, **no `--sref`**. Deliver 1024px. ONE literal object
that names the agent's job, one color family per agent.

**This hue registry is separate from the offer-icon wheel** — collisions across
the two sets are fine (Doc's red ≈ Partner 9°, Atlas's lavender ≈ Map 292°);
collisions *within* the agent set are not.

| Agent | Object | Color | Status |
|---|---|---|---|
| Muse | (see avatar.png) | magenta | ✅ delivered |
| Scribe | quill | pink | ✅ delivered |
| Doc | first-aid kit | red | ✅ delivered |
| Atlas | globe | lavender | ✅ delivered |
| Warden | lantern | indigo | ✅ delivered |
| Teller | cash register / bill spike / toll gate — winner not stated | warm amber (#d98f1f, #eaa83d, #f5c266) | ✅ confirmed 2026-08-29, PNG not yet filed on disk |
| Scout | binoculars / spyglass / lure proposed | olive green (reserved) | ⬜ awaiting pick |
| Postman | — | teal (proposed) | ⬜ prompts issued 2026-08-29 |
| Copy | (see avatar.png — light blue, #95D8FD/#6AC1F4) | blue | ✅ delivered 2026-08-30 (lighter than the #1f6fd0 spec issued; the file wins) |
| Design | paint roller / paint-chip fan / spirit level issued | bright orange (#c85a14, #e2761f, #f09c4e) | ⬜ prompts issued 2026-08-30 |
| Onboard | **life ring** (Shane changed from welcome mat 2026-08-31 — "better than the welcome mat") | fresh green (#2f8f4a, #43a862, #6ac48b) | ⬜ life-ring prompts issued 2026-08-31; supersedes the welcome-mat PNG Shane holds |
| Sweeper | broom / push broom / dustpan issued | steel gray (#55636e, #74838f, #9aa8b3) | ⬜ prompts issued 2026-08-30 — **not in registry.json**; assumed cleanup/maintenance agent |
| Ranger, Pollen, Concierge, Alert, Mason, Pitch | — | open: brown (soft-held for Mason's brick/trowel), yellow, warm neutral… | ⬜ queued |

Taken agent hues: red, pink, magenta, lavender, indigo, amber, blue; orange,
green and steel gray issued 2026-08-30; olive soft-held for Scout, teal proposed
for Postman, brown soft-held for Mason.

**Slack app icons ship opaque.** Do NOT run the corner-floodfill transparency
recipe on avatars — a transparent PNG renders on black in some Slack surfaces.
Downscale 1024 → 512 nearest-neighbour and flatten onto white:

```
magick SRC -filter point -resize 512x512 -background white -alpha remove -alpha off OUT
```

Copy is the *writing* agent and Scribe already owns the quill — keep Copy off
nib/feather objects so the two read apart at 22px.

---

## 18. Style-LoRA training sets ✅ ASSEMBLED (2026-08-30)

Staged at `~/ClaudeCode/flux-training/` (outside the deployable tree on purpose)
for the Flux-LoRA / Recraft plan discussed in #visuals. Two zips, two registers:

- `scene-training-v1.zip` — 41 images: 14 page heroes, 15 guide heroes, 12 blog
  cards (`blog--` prefix). Excludes `portrait.png` (off-palette red background),
  photos, and all flat icons.
- `icon-style-v1.zip` — 16 images: the 11 site icons (processed 112px
  transparent versions) + 5 agent avatars (1024px originals).

Sources are the PNG8 web exports — near-lossless for pixel art, and the scene
originals were never archived, so this is the corpus. Details and exclusion
rationale in that folder's `README.md`. Bake-off before adoption: regenerate
`map-hero` + one guide card via the trained LoRA and compare against the MJ
versions.

## 19. `/handled` — the Handled hero ⬜ TO GENERATE (`handled-hero.png`)

Full-bleed band, so `--ar 21:9` like the three way-in pages, not 16:9. Export
~3000px wide.

**Standing in right now:** `done-for-you-hero.png`, renamed to
`handled-hero.png` on 2026-09-11 when /handled was rebuilt — /done-for-you had
become a 301 to /work-with-me, so its art was orphaned, and the dry dock says
what this page says. Section 15 records its prompt and why it was picked. It is
a stand-in only because it was written for a different page's aspect and
subject placement, not because it is wrong.

**Scenes already spent, and this one has to avoid all of them:** the funicular
(`/work-with-me`), the facade inspection (`/read`), the crane and modules
(`/site`), the split-flap board (`/partner`), the pegboard workshop
(`/install`), the lighthouse (`/scan`), the central station (`/approach`), the
utility locator (`/find-out`), the dry dock (`/done-for-you`), the pilot cutter
(`what-is-a-fractional-coo`) — and above all **the canal lock**, which is
`/do-it-yourself` and is this page's exact inverse: there, the owner works the
gate and the keeper stands back. Section 11 also declared the harbor and rail
motifs used up, which rules out the obvious bridge-keeper answer.

**Idea to carry:** the thing a town depends on, kept up by someone else, while
everyone who relies on it gets on with their day and never thinks about it.

1. **Option A — the water tower** (preferred: one simple standing structure,
   which is what a one-page site is)
   > a small-town water tower with a maintenance crew at work on its catwalk,
   > the streets below going about their day,

2. **Option B — the clock tower**
   > a tower keeper winding the great clock movement inside a town clock tower,
   > the square below going about its day,

   Weigh this one against `/partner`'s split-flap board before generating. Both
   are "somebody keeps the public face true," and two pages saying that with
   the same idea in different housings is worse than one.

**Composition.** Section 15's note holds — subject about a third in from the
left — but the reason changes, so read this before framing. The way-in bands
are left-aligned copy with a left-to-right scrim, so their right side stays
quiet. **This hero centres its copy over a radial scrim**, which means the
middle third of the frame washes out to near white, and the left and right
edges are the parts that survive. So: structure a third in from the left, open
sky through the centre, and something quiet but present at the right edge.
Bright daytime — a dark frame under a white scrim goes muddy.

**`--sref` check (2026-09-11).** Both reference URLs were fetched and return
`content-type: image/png`, so the 2026-08-01 trap in section 15 is not live
today. Re-check before blaming Midjourney if the style drifts: Cloudflare Pages
answers a missing asset with 200 and an HTML body, so a status-code check
passes while the reference silently fails.

### 19b. The moving version (`handled-hero.mp4`)

The hero takes a loop as well as a still, and the page is already wired for it:
drop `/images/handled-hero.mp4` in and the hero moves, take it away and it is a
still again, no other edit either way. The `<img>` stays the LCP element and the
permanent fallback; the loop fades in only once it can play, so a missing file,
Save-Data, a 2g connection or `prefers-reduced-motion: reduce` all leave the
still in place. Both paths verified in the browser on 2026-09-11.

Generate the still first, then animate that image. Motion prompt, kept to one
action the same way the stills are:

> the crew works on slowly and the clouds drift, everything else still,
> locked-off camera

- **Locked-off camera, low motion.** Copy sits on this. A pan behind fixed text
  reads as the page sliding, and it drags the scrim's washed-out centre across a
  moving subject.
- **Nothing crosses the centre third.** That is where the wash is strongest; a
  subject that walks into it disappears. Keep the movement at the edges.
- **It has to loop.** Midjourney will not return a seamless one — either keep
  the motion ambient enough that a hard cut is invisible, or crossfade the tail
  into the head afterwards.
- **Budget it like an ad asset**, under ~2 MB, since this page is bought with
  click money:
  `ffmpeg -i in.mp4 -an -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -r 12 -movflags +faststart handled-hero.mp4`
  `-an` because the element is muted and the audio track is dead weight; 12 fps
  suits pixel art and roughly halves the file against 24.
