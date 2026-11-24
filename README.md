# Data Explorer (decomposition tree)

A Power BI–style decomposition tree for any CSV file. Load a CSV and each column becomes a level you can drill into; reorder or hide levels to slice the data different ways. The last file you opened, and your level layout for it, are remembered between visits.

## CSV format

The first row holds the column headers. Prefix a header to control how it's used:

| Prefix | Meaning |
|---|---|
| `***` | Ignore the column completely |
| `**` | Show in the detail card only (not as a level) |
| `*` or none | Drillable level, and shown in the card |

Example header: `Genre,Venue,Date,Event,**Description,**Ticket Link,***ID`

- Comma, semicolon or tab separated; Excel's "CSV UTF-8" export works.
- Quoted cells can contain commas and line breaks.
- Dates are read **day-first** (`15/04/2026`), plus `2026-04-15`, `15 April 2026`, `Wed 15th Apr 2026`, `April 2026`. A column counts as a date column when at least 80% of its values are dates; those levels sort chronologically.
- Values that look like web links (`https://…`, `www.…`) are shown as links.
- If several rows share the same path through every level, all of them are shown as cards.

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # static build into out/ (deployed by Netlify)
pnpm typecheck
```

## Code layout

- `app/page.tsx` – page shell, reloads the last file
- `components/file-picker.tsx` – drag-and-drop / browse for a CSV
- `components/dynamic-tree.tsx` – the tree, toolbar and detail cards
- `lib/csv-data.ts` – CSV parsing, date parsing and column detection
- `lib/storage.ts` – remembers the last file (IndexedDB) and tree settings (localStorage)
