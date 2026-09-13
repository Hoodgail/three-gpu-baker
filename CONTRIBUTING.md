# Contributing

Use Node.js 22.12+ or 24. Install with `npm ci`, then run `npm run dev` for the documentation and examples.

Keep transport, scene preparation, I/O, and display logic in their respective modules. Public APIs use strict TypeScript and generated declarations. Prefer descriptive names and short comments explaining radiometry, ownership, or a non-obvious invariant.

Before opening a pull request:

1. Run `npm run format` and `npm run check`.
2. For transport, packing, material, or renderer changes, run `npx playwright install chromium` and `npm run test:gpu`.
3. Inspect progressive camera renders in `artifacts/`. Compare direct, indirect, and AO independently.
4. Update the relevant Markdown guide and example when behavior changes.

Tests should check externally meaningful behavior: energy, CPU/GPU parity, corrupted input rejection, lifecycle ordering, and ownership. Avoid tests that merely mirror implementation details. Add a minimal procedural scene when reporting a lighting issue.

Bug reports should include browser, OS, GPU/adapter, Three.js version, bake settings, reproduction steps, and the smallest shareable scene. Never include private assets or credentials. OptiX issues should include SDK/CUDA/driver versions and native build output.

Changes are reviewed for compatibility with the documented diffuse scope. Proposals for new transport models or file formats should describe their radiometric convention and validation strategy.
