# Claude dashboard reference and adaptation

## Original audit — November 5, 2026

At inspection the project root contained only `Claude-generated analytics dashboard sample/`; there was no Git repository, package manifest, application scaffold, or other root file. All seven supplied files remain byte-for-byte unchanged at their original locations. The directory name and project root have not changed.

| Relative file inside the sample directory | Bytes | Purpose |
| --- | ---: | --- |
| `Main.dc.html` | 58,633 | Overview: filters, six KPIs, configuration table/histogram, failure trend, throughput, outcomes, stations, 48-channel heatmap, recent activity |
| `Failures.dc.html` | 31,118 | Replacement KPIs, weekly outcomes, reasons, channel-count histogram, top channels/ports, unit table |
| `Unit.dc.html` | 30,870 | Unit header, timeline, wavelength chart, channel map, extra ports, replacements and attempts |
| `Queries.dc.html` | 33,212 | Query library/schema, illustrative SQL, result table/chart, history |
| `support.js` | 46,105 | Custom generated Design Component runtime; no supplied redistribution license |
| `vendor/react.js` | 10,751 | React 18.3.1 UMD production runtime, MIT header |
| `vendor/react-dom.js` | 131,835 | React DOM UMD production runtime, MIT header |

The screens use `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{bindings}}`, and `DCLogic` JavaScript classes. They are HTML/custom templates backed by React, not TSX components. Styling uses inline declarations and light/dark CSS variables, Geist/Geist Mono via Google Fonts, original inline SVG icons/charts, flex wrapping and scrollable tables. No raster images or additional external assets were supplied. Navigation links the four HTML files. Range/purpose/configuration, wavelength, channel-count and result-tab controls had handlers; many other controls were static.

The sample ran over local HTTP with its bundled scripts. All four screens were opened in headless Edge before adaptation, with desktop and narrow captures; no page errors occurred. Original screenshots and file hashes are retained in ignored `.local/`.

## Adaptation

- Converted the four template trees to ordinary React TSX screens with direct bindings and state. Removed all custom runtime/browser evaluation requirements. No iframe or original vendor/runtime script ships in the app.
- Reused original layout, navigation icons, cards, SVG charts, heatmaps, tables, synthetic fixture values and presentation calculations. Retained calculation modules in `src/mock/*.js` with typed state/activity boundaries for the incremental migration. TypeScript checks the application and boundaries, not all legacy calculation internals.
- Added Vite, Tailwind, a manually adapted shadcn/ui button for theme switching, TanStack activity table, and Recharts for the query result bar chart. Routes are browser hashes and support direct reloads without a server router. Route imports have an actual loading fallback.
- Replaced serials/operators with explicit `DEMO-*` identifiers and demo operator names. Removed connection/role/migration claims, automatic refresh claims and executed-query timings. All schema/SQL is illustrative text, with execution disabled.
- Original files are ignored and protected from Vite file serving. They remain available locally but are **not published** because `support.js` licensing is unspecified and the originals contain production-like connection labels. A fresh clone runs independently. Versioned adapted screenshots in `docs/design/` preserve a distributable visual reference.

## Workbench palette authority

Read-only inspection of [Light Workbench `ilm_app.py` at `810ec42`](https://github.com/austin-santec/Light-Workbench/blob/810ec42c46ed656eda90ddb5f14dec11fa77a2d8/ilm_app.py#L232) confirmed the source palette. No production repository files were changed or copied into this repository.

| Role | Light | Dark |
| --- | --- | --- |
| Brand accent | `#e60013` | `#e60013` |
| Workspace | `#eceff1` | `#202124` |
| Panels / secondary surfaces | `#ffffff` / `#f7f8f9` | `#2b2e33` / `#373a40` |
| Text / muted text | `#202124` / `#587073` | `#e8eaed` / `#b3bbc5` |
| Borders | `#c7cdd1` | `#4a4f57` |
| Reading/link blue | `#164e6b` | `#8bc9ee` |

The sample's green/amber semantic status tones and orange heatmap ramp remain; outcome series use Workbench red with a lighter related tone.

## Deliberate differences

- Workbench red/gray colors replace the sample's blue/cool-gray brand palette, as requested. Text labels now say Analytics.
- Added a compact synthetic/offline banner, theme toggle, honest preview labels and empty/loading states. Unsupported actions stay visible but disabled. Removed the nonfunctional Custom date-range button.
- Bundled fonts locally instead of calling Google Fonts; fixed SQL line breaks in TSX. SVG axes and text render through normal React.
- Recent activity adds table-local filters/sorting and explicit serial links; results follow range/purpose selection. Aggregate figures and the tiny recent list are separate illustrative datasets.
- Most historical charts retain fixed demo periods. Their original calculation quirks are not a production metrics contract. Unit lookup has one complete detailed fixture; other unit links show an honest empty state.
- The fixed 30-day configuration histogram now keeps its own mean/median consistent with its table; the selected-range average remains a separate synthetic KPI.
- Query result bars use Recharts with the same horizontal layout, series colors and data. Narrow tables/charts scroll within panels. Narrow navigation uses two columns; the unit channel map uses six columns for readable cells.

Visual comparison is qualitative, not a pixel-diff assertion. Screens were inspected against the original at desktop and narrow sizes; recognizable information hierarchy and design identity were retained.
