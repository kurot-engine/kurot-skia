# Changelog

## 0.1.0 — 2026-10-11

Initial versioned build-time resource and KUI project entry toolkit. The package remains private and is consumed locally; this entry does not announce npm publication.

### Features

- Provide the `kurot-project` command and Node APIs `generateProject()` and `watchProject()` through `@kurot/skia/project`.
- Collect manifest resources, local sheet/bitmap-font image dependencies and runtime remote URLs; emit static Metro or URL asset references and embedded JSON/text.
- Recursively compile KUI, resolve project styles, generate skin factory registration/restoration and theme mappings, and accept explicit theme-map files.
- Watch authored inputs, coalesce saves, serialize regeneration, preserve successful output on errors and clean up an accompanying development command on exit.
- Validate output ownership and remove stale generated files only after successful compilation.

### Documentation and packaging

- Establish an English usage guide and a matching Chinese guide at `docs/README.zh-CN.md`, covering installation, development, CLI/API usage, generated outputs and host integration.
- Include both guides, this changelog and compiled code in the package file list.
- Keep the implementation in `src/kurot/` and compiler access behind the existing pinned KUI compiler integration.

### Compatibility

- Node.js >=20 for the generator; applications retain their own platform requirements.
- Existing local consumers retain the `file:` dependency, command name, API entry and generated formats; refresh their installation after this metadata update.
- Core/UI host dependencies and other Kurot SDK versions require no migration or release for this package version.
- RN/Skia rendering, input and runtime resource/theme adapters remain in the Demo. Bitmap-font/audio rendering, bundled font registration and custom KUI component discovery are outside this version's implementation.
