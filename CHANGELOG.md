# Changelog

## 0.1.0 — 2026-10-11

Initial native rendering adapter and build-time resource/KUI toolkit, prepared for a public npm release. Registry publication is verified separately from this release entry.

### Features

- Extract the Demo's renderer, canvas, dynamic text, textures, Graphics, touch and resource/theme ports into the runtime root entry `@kurot/skia`.
- Provide `createKurotResolver()` through `@kurot/skia/metro`, composing host resolution and selecting one version-bound Core/UI installation.
- Provide the `kurot-project` command and Node APIs `generateProject()` and `watchProject()` through `@kurot/skia/generator`.
- Collect manifest resources, local sheet/bitmap-font image dependencies and runtime remote URLs; emit static Metro or URL asset references and embedded JSON/text.
- Recursively compile KUI, resolve project styles, generate skin factory registration/restoration and theme mappings, and accept explicit theme-map files.
- Watch authored inputs, coalesce saves, serialize regeneration, preserve successful output on errors and clean up an accompanying development command on exit. Normalize filesystem aliases when comparing input fingerprints to suppress delayed duplicate events.
- Validate output ownership and remove stale generated files only after successful compilation.

### Documentation and packaging

- Establish an English usage guide and a matching Chinese guide at `docs/README.zh-CN.md`, covering installation, development, CLI/API usage, generated outputs and host integration.
- Add a native runtime guide and a public adaptation/performance test plan; include all guides, this changelog and compiled code in the package file list.
- Organize runtime adapters in `src/kurot/`, generator tools in `src/generator/`, Metro integration in `src/metro.cts`, and local development tooling in `src/development/`. Keep compiler access behind the pinned KUI integration.
- Add a single Demo `pnpm dev` command for library compilation, installed file-package synchronization, resource watch and Expo; preserve successful output on errors and clean up managed processes.
- Enable public scoped-package publication, record repository metadata, clean and rebuild before packing, and run tests before publishing. Document npm installation separately from local source development.

### Compatibility

- Node.js >=20 for the generator; applications retain their own platform requirements.
- Existing local consumers retain the `file:` dependency and `kurot-project` command. The build API moves from `/project` to `/generator`; update imports, refresh installation and regenerate output to adopt the new ownership marker.
- Applications using the npm release consume installed package entries and commands without a neighboring library checkout. Joint source development remains available to applications declaring a local `file:` dependency.
- Core/UI host dependencies and other Kurot SDK versions require no migration or release for this package version.
- Native applications install the package as a runtime dependency and configure the library Metro resolver; the Demo migrates its imports and keeps its scenes and project-specific resource/theme initialization.
- Native peers are optional for generator-only users; the current adapter binds Core 2.5.3, UI 3.5.0 when used, and React Native Skia 3.3.0.
- Bitmap-font/audio rendering, text input, offscreen caches, filters and full component coverage remain future work documented in `docs/PLAN.md`.

### Release preparation verification — 2026-10-11

- Clean library build and all 24 Node tests pass; `git diff --check` passes.
- Packed entry targets and declarations are present, with obsolete generator paths excluded. An independently installed tarball runs resource/KUI generation without Core or native peers.
- The original Demo passes type checking and lint. A separate Demo installation using only the tarball passes generation, type checking, lint and Android Hermes export, including both image assets.
- These packaging checks do not establish iOS support or Release-device performance; pending native validation remains in `docs/PLAN.md`.
