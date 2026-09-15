# Handled templates

Four single-page site templates the client picks between during the intake, at
`/handled-templates/`. Each one is a complete page — not a mockup — so Shane
copies the file, replaces the content, and ships.

## Why these four

They are abstracted from sites already built this way, not invented. Every one
has shipped, which means Shane can rebuild it quickly and the client is looking
at something real when they choose.

| Template | For | Built around |
|---|---|---|
| **The Standard** | Work a third party verifies — certification, inspection, accreditation | The seal as hero. For this business the mark *is* the product. |
| **The Practice** | One person whose work is judgement — advisor, coach, counsel | Restraint as the credential. No accent colour anywhere. |
| **The Signal** | An idea the market hasn't caught up with | An abstract light source instead of a photograph. |
| **The Field** | Physical work you can photograph — trades, contractors | The photographs are the argument. Phone-first. |

## Rules they all follow

**Self-contained.** One file, its own styles, its own fonts. No dependency on
shanegring.com — the file becomes the client's site. Do not factor shared CSS
out of them; coupling four client sites to one stylesheet is how you end up
unable to change any of them.

**Every replaceable string is `{BRACKETED}`.** Find them all with a search for
`{`. The prompts say what belongs there rather than reading "Lorem ipsum",
because the hard part of filling a template in is knowing what the section is
*for*.

**Contrast is checked, not eyeballed.** Every text/background pair clears 4.5:1
(3:1 for large display text). Some palette variables carry a comment saying
what they must not be changed to and why — The Field's orange in particular
needs black text on it, and darkening the orange to take white would break it
as the eyebrow colour on black.

**No invented proof.** Testimonial and review slots say to use real ones or
delete the section. A fabricated review is worse than no reviews.

## Changing a template

1. Edit the file in `handled-templates/`.
2. Re-shoot its preview, or the picker will show a page that no longer exists.
3. `node tools/version-assets.mjs` and commit.

### Re-shooting a preview

The previews in `images/handled/templates/` are screenshots of the live pages,
which is what keeps the picker honest. Any headless browser will do; the only
things that matter are a ~1450px-wide viewport and capturing from the top of
the page.

```bash
npx playwright screenshot --viewport-size=1459,812 \
  http://127.0.0.1:8788/handled-templates/field \
  images/handled/templates/field.jpg
```

## Adding a fifth

Nothing counts to four. Add the file, shoot the preview, and add an entry to
`assets/handled/templates.js` with `id`, `name`, `description`, `previewImage`
and `viewUrl`. The picker renders whatever is in that array.

Write the `description` for the client, not for a designer: it should help
someone recognise their own business, not describe a visual style. "For
physical work you can photograph" beats "bold, high-contrast, editorial".
