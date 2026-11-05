# Third-party notices and publication audit

- Supplied Claude dashboard markup, fixture logic and original inline vectors were adapted under the user's explicit instruction to initialize and publish this project. The supplied custom runtime and bundled UMD files remain local and ignored; they are not required to run the app or included in build output.
- Geist and Geist Mono are installed through Fontsource and served locally. Original SIL Open Font License texts ship in [`public/licenses/geist.txt`](../public/licenses/geist.txt) and [`public/licenses/geist-mono.txt`](../public/licenses/geist-mono.txt).
- The local button follows the MIT-licensed shadcn/ui Radix button pattern, customized for this palette. Its [upstream license](../public/licenses/shadcn-ui.txt) is included. Supporting Slot, CVA, clsx and tailwind-merge dependencies are installed through npm.
- React, React DOM, Vite, Tailwind, Recharts, TanStack Table, lint/type tooling and Playwright Core are npm dependencies with upstream package licenses. Versions and integrity hashes are locked in `package-lock.json`; no unlicensed third-party artwork, photographs or brand-logo downloads were added.
- The favicon and navigation vectors come from the user-supplied dashboard design. Sanitized app screenshots are generated from this adaptation.
- FastAPI, Pydantic/Pydantic Settings, Uvicorn and backend development tools are installed from Python packages with upstream licenses, constrained in `backend/requirements-dev.lock`. No Python vendor sources or binaries are committed. FastAPI's standard Swagger page references public CDN assets.
- The separate Light Workbench repository was read only to verify palette values and, in Milestone 2, consult database/data architecture documentation. Its source code, database content and binary assets are not redistributed here.

No root license for the application's own code is chosen by Milestone 0. Project licensing remains an owner decision; bundled third-party licenses continue to apply.
