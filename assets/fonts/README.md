# Bundled fonts

These are embedded into stamped PDFs by `app/api/lib/export/pdfOverlay.ts`.

pdf-lib's built-in fonts are WinAnsi only and cannot encode Devanagari or
Gurmukhi at all, so a Hindi or Punjabi court form would stamp as blanks without
these. They are bundled rather than fetched so that stamping never depends on a
network call at request time.

| File | Covers | Licence |
| --- | --- | --- |
| `NotoSans-Regular.ttf` | Latin, Greek, Cyrillic | OFL 1.1 |
| `NotoSansDevanagari-Regular.ttf` | Devanagari + Latin | OFL 1.1 |
| `MuktaMahee-Regular.ttf` | Gurmukhi + Latin | OFL 1.1 |

## Why Mukta Mahee rather than Noto Sans Gurmukhi

`@pdf-lib/fontkit` cannot parse Noto Sans Gurmukhi's glyph table -- every build
of it (hinted, unhinted, full) throws `Cannot read properties of null (reading
'xCoordinate')` during shaping. Mukta Mahee shapes correctly through the same
code path. If you swap this font, run `tests/api/pdf-overlay.test.ts`: it stamps
Gurmukhi and reads the text back out, so a font fontkit cannot shape fails there
rather than silently reaching a registry as empty boxes.
