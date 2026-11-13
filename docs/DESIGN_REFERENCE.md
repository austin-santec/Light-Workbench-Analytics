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
- Reused original layout, navigation icons, cards, SVG charts, heatmaps, tables, synthetic fixture values and presentation calculations. M0 retained JavaScript calculation modules with typed boundaries; M1 migrated all four to strict TypeScript with explicit contracts and pure functions.
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
- Overview now places a clearly separated **Live · test database** run-activity card below the filters. It preserves the reference card hierarchy and Workbench tokens in both themes while distinguishing bounded FastAPI aggregates from every synthetic KPI. Loading, reporting-off, backend-down, sanitized database-failure, incomplete-sample and connected states share the same responsive surface; the card has manual refresh only.
- The live card now includes a horizontally scrollable **Test time by configuration** table below run activity. It uses the established configuration-table density and tokens, labels the values as run-level diagnostics rather than per-unit T12, preserves null channel groups, and shows the same loading/off/down/failure states. Mixed purpose selections suppress non-combinable statistics. Purpose-chip counts identify live-window counts when connected and otherwise retain demo counts; the app chrome now accurately describes demo fixtures plus optional live test-database panels.
- The fixed 30-day configuration histogram now keeps its own mean/median consistent with its table; the selected-range average remains a separate synthetic KPI.
- Query result bars use Recharts with the same horizontal layout, series colors and data. Narrow tables/charts scroll within panels. Narrow navigation uses two columns; the unit channel map uses six columns for readable cells.
- Unit lookup now keeps the complete accepted synthetic screen whenever reporting is off, unreachable or returns a sanitized database failure, with one compact connection-state note added above the existing header card. When reporting is connected, the same card, timeline, insertion-loss chart, channel-map and table hierarchy renders bounded live evidence. Live-only run selection and saved-analysis sections are deliberate additions required by the approved API; every live panel carries a **Live · test database** label, saved no-recovery analysis is explicitly separated from final disposition, and unsupported values render as `—` rather than copied demo values.
- The established **Channels tested** KPI tile and daily bar-card positions now switch as a pair to the bounded channel-activity diagnostic when connected. The tile keeps the reference typography and sparkline, removes its comparison badge in live mode, adds attempts/units and a source/purpose label, and marks today's sparkline point partial. The daily chart keeps the reference SVG/bar treatment while expanding to 31 Pacific local dates and styling today as partial. Reporting-off or failed requests retain the original demo values with compact Demo markers; no duplicate connection banner was added.
- Failures & replacements now begins with a clearly separated **Live · test database** replacement-activity panel using that screen's KPI-strip density. It adds its own four-range control, attribution counts and compact 31-day event bars while leaving every original synthetic KPI/chart/table unchanged below it. Unavailable states remain inside the live panel.
- The live insertion-loss chart preserves the reference's paired-bar geometry but colors bars by the server classification, adds the saved too-good/warning/fail reference lines, and labels its wavelength control from the selected run. Live tables scroll inside their panels, channel-map history is available on hover and keyboard focus, and the sidebar swaps demo examples for up to five locally remembered live units only while connected.

Visual comparison is qualitative, not a pixel-diff assertion. Screens were inspected against the original at desktop and narrow sizes; recognizable information hierarchy and design identity were retained.

## Milestone 1 refinements

The accepted M0 screenshots in `docs/design/` remain unchanged. M1 reference captures are in `docs/design/milestone1/`; full before/after browser matrices remain local in `.local/milestone1/`.

- One shared shell/sidebar now renders the same frame, icons, active states and offline block. Specialized analytical cards/charts remain screen-local. The configuration list is a semantic table with selectable buttons; its density, values and histogram arrangement remain recognizable.
- Native disabled previews share a visible explanation and styling. Saved views are static preview text; the Unit sidebar now says Example units instead of implying collected browsing history.
- Scope descriptions clarify that Overview range/purpose affect counts/yields/outcomes/activity; average time follows range/configuration only. Historical charts and sparklines stay fixed. Failure channel count and Unit wavelength selection affect their own charts; query title search does not change result data.
- Shared segmented controls retain button/pressed semantics. Keyboard navigation, skip-to-content, page focus, empty-state resets, schema disclosure relationships, and horizontally scrollable panels are accessible without mouse hover.
- Workbench surfaces and brand red remain. Selected navigation text uses darker red in light mode and a lighter Workbench red in dark mode; dark chart strokes/focus indicators are lighter for visibility. Disabled previews are visibly muted. These and the short scope notes are deliberate visual differences, not a redesign.
- Failed route imports retain navigation and show an actionable reload state. Synthetic calculation outputs were compared with the accepted baseline across 452 states; no numerical changes were introduced.
