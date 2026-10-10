# Changelog

## 0.1.1 — 2026-10-11

GPU nine-slice rendering correction, prepared for npm publication. Publication remains a separate step; the Demo still installs npm 0.1.0.

### Fixed

- Eliminate horizontal/vertical joins on Graphite GPU surfaces at fractional scales and rotated transforms by sampling all nine regions in one image shader and blending one rectangle.
- Preserve physical source coordinates, logical borders, density, trim, strict region sampling, nearest/linear filtering, source/object opacity and outer-edge AA. Collapsed centers and Core's small-size scale fallback remain supported; the fix does not overlap patches or allocate offscreen textures.
- Compile the effect lazily per renderer and release per-draw shaders, paint and the runtime effect through their owners. `FrameStats.draws` now counts one operation for a nine-slice bitmap rather than up to nine region operations; it remains an adapter-operation count, not a hardware draw-call metric.

### Documentation and verification

- Update the English and Chinese README installation examples to 0.1.1, explain adoption from 0.1.0 and retain the distinction between source preparation and npm publication.
- Document GPU validation and correct the npm Demo workflow versus explicitly selected local file-package development.
- Release preparation passes `pnpm build`, all 24 Node tests with `FORCE_COLOR=1`, and `git diff --check`. `pnpm pack` performs a clean rebuild; the 0.1.1 tarball includes the corrected renderer, all export targets/declarations and both usage guides.
- Validate the fix with the Demo's 48 native GPU regression cases for fractional transforms, rotation/flip, transparency, atlas density/trim, fixed borders and original KUI button states. The regression fails on npm 0.1.0; the fix and existing native suites pass on iPhone SE (3rd generation), iOS 18.2, and iPhone 17 Pro, iOS 26.5. Normal button joins and touch interaction are also verified. Android GPU validation and Release-device performance remain pending.

### Compatibility and adoption

- Public package entries/APIs and resource/KUI formats are unchanged. Core 2.5.3, UI 3.5.0 when used, Skia 3.3.0 and other dependency/peer requirements are unchanged; no Kurot SDK source changes or dependent SDK releases are required.
- Native applications adopt the fix by updating their Skia installation/lockfile to 0.1.1 after publication and restarting Metro with `--clear`. An exact 0.1.0 declaration must be updated explicitly; compatible 0.1.x ranges can adopt through their lockfile.
- Existing development builds containing Skia 3.3.0 can be reused. No authored-resource, skin or generated-entry migration is required. Generator-only users may adopt the patch separately; Core/UI development locks, engine templates/examples and other applications remain unchanged.

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
- Make the process-cleanup test record its PID directly instead of parsing colored console output, validate that PID, and accept only the expected missing-process error during cleanup polling.

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
- The npm prepublish hook passes all 24 tests with `FORCE_COLOR=1`; the descendant-cleanup regression passes 20 consecutive runs in that environment.
- Packed entry targets and declarations are present, with obsolete generator paths excluded. An independently installed tarball runs resource/KUI generation without Core or native peers.
- The original Demo passes type checking and lint. A separate Demo installation using only the tarball passes generation, type checking, lint and Android Hermes export, including both image assets.
- These packaging checks do not establish iOS support or Release-device performance; pending native validation remains in `docs/PLAN.md`.
