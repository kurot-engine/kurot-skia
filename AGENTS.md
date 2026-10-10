# Kurot-Skia

Version 0.1.2 is prepared for publication with native drawImageNine and cached
pixel crops, validated by the same 48 iOS GPU cases and native cache lifecycle checks.
Source frames and nine-slice boundaries must be integer physical pixels; read the
runtime guide before adopting fractional grids. Published 0.1.1 retains its shader
implementation. Never republish an existing version with changed contents.
The native Skia adapter and Node resource/KUI toolkit retain the 0.1.0 entries,
host versions and authored formats. Publishing 0.1.2 remains a separate user action.
The Expo application in `../Kurot-Skia-Demo` consumes the installed package;
scenes, generated inputs and project-owned UI initialization stay in the Demo.
Native adapters live under `src/kurot`. The root export is RN-only,
`./metro` is a Node configuration helper, and `./generator` is Node build-time only.
Read `docs/native-runtime.md` and `docs/PLAN.md` before extending native support.

The Demo consumes npm `@kurot/skia@0.1.0` and calls its installed
`kurot-project` binary. Keep compiled output in the package's `files` list.
The npm release is public. `prepack` cleans and rebuilds shipped output, and
`prepublishOnly` runs tests. Verify registry availability before changing the
Demo to a registry version; publication is separate from release preparation.
The English README is the primary usage guide; its Chinese counterpart is
`docs/README.zh-CN.md`. Keep their commands, options and lifecycle guidance aligned.
Ship both guides and CHANGELOG.md with the compiled package. A version update
does not imply npm publication or a Kurot SDK release.
Do not make consumer scripts address this checkout's `dist` directory directly.

The Node build-time generator lives in `src/generator`, Metro integration in
`src/metro.cts`, and local development tooling in `src/development`. Keep all
Node tools outside the runtime barrel.
Keep Core/UI SDK sources unchanged; native adaptation belongs in this package's
Metro resolver and adapters. Do not add SDK platform entries as part of Skia work.
The generator must not import React Native, Expo or Skia. The native root must
not import the generator, Node APIs, compiler or watcher. Metro routes native
Core imports to the host installation; private Core/UI mappings are bound to
Core 2.5.3/UI 3.5.0 and must be tested before widening version support. Reuse the pinned
registry KUI compiler; do not fork its parser, resource defaults or style rules.
The compiler's internal subpath is isolated in `compiler.ts` and must be
revalidated before upgrading CLI.

Use TypeScript, strict ESM, named exports and explicit exported return types.
Avoid new `any`, application `null`, suppression directives and files over
300 lines. Node >=20, pnpm. Run `pnpm build` and `pnpm test` after changes.
Do not bump or publish other Kurot SDKs for this package's changes.

Generated output directories are owned by the generator. Do not place authored
files there. Resource manifests, KUI XML and style files remain authored input.

Watch mode must serialize regeneration, preserve output on failed saves and
exclude its own output/staging directories. Demo dev commands use the package's
`--watch -- <command>` runner; keep its signal and child-exit cleanup intact.

Joint library/application development requires an explicitly declared `file:`
dependency and this checkout's `pnpm dev --project <application> -- <command>`.
Use an isolated Demo installation to validate unpublished fixes without changing
the registry consumer. Never synchronize into its npm installation.
Compile both projects into staging before synchronizing
the installed file package. Keep pnpm's dependency links and host peers intact;
do not switch the Demo to a source link. Synchronize only changed compiled bytes,
including additions/removals, and never write through pnpm hardlinks. Restart
the installed generator after its code changes and the host command after Metro
or package configuration changes. Read `docs/development.md` for the lifecycle.
