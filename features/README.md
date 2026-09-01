# features/

One folder per business domain, named after the route it backs (see `RESTRUCTURE.md` for the
full mapping and rationale). This is where `app/<route>/page.tsx` logic actually lives the
page component itself, plus every piece, hook, and helper that only that feature uses.

## Pattern

Each feature folder follows the shape already used by `components/ravenslaw-todo/` and
`components/ravenslaw-calendar/` before this reorg copy that shape, don't reinvent it:

```
features/<name>/
  index.ts(x)          Barrel export for the feature, OR
  <Name>Page.tsx        the page-level component when the feature backs a full route
  components/           pieces only this feature uses
  hooks/                 data-fetching / state only this feature uses
  utils/                 helpers only this feature uses
  types.ts               types only this feature uses
```

Not every feature needs every piece a small feature might just be a flat set of files under
`components/`, a large one might have all five. Add `hooks/`, `utils/`, etc. only when there's
more than one file that belongs there.

## Rules

- `app/<route>/page.tsx` should import and render exactly one component from `features/<route>/`
  and contain no business logic itself.
- Anything used by only one feature stays inside that feature's folder don't leave it behind
  in a flat `components/<name>/` folder.
- Anything used by two or more features (or has no domain a generic button, modal, dropzone)
  belongs in `components/common/` or `components/ui/`, not in `features/`.
- `components/layout/` holds cross-feature layout chrome (header, footer, navbar, sidebar,
  mobile bottom nav) that's intentionally outside `features/` too.
