# Kurot-Skia

Source version 0.1.5 is prepared for publication with opt-in NativePictureCache,
runtime directory organization and grouped barrel exports. Publication remains
pending; a source bump or local commit does not confirm registry availability.
Version 0.1.4 is published, with registry integrity and compiled output verified
on 2026-10-11. The separate Demo installs exact npm 0.1.4. Never republish an
existing version or claim registry adoption from a source version alone.
Version 0.1.5 adds opt-in NativePictureCache commands, separate
from cacheAsTexture images. Read docs/native-runtime.md#picture-caching
before changing dirty observers, per-child opacity, source dependencies or
Picture ownership/budgets. Keep original performance workloads unchanged;
Picture comparisons use separately named fixtures and records.
Final Release comparison data and exact passing backend/source/build identities
are in docs/native-picture-cache-2026-10-11.json. Keep the explicit SwiftShader
batching-oracle failure separate from the passing auto/llvmpipe Android run.
Picture remains opt-in; total-time gains vary and native retained bytes are unmeasured.
Read docs/native-feature-assessment.md for coverage, measurements and remaining
physical-device/media/custom-effect gates. Native device tests and performance
fixtures live in tests/native/app with an explicit file dependency. They never
synchronize into the registry Demo. Source changes keep Core/UI/Game/Spine SDKs
and their Web workflows untouched.

Spine optimization details and the synchronized/different-phase scene limits
are in docs/native-spine-optimization.md; preserve the pre-optimization hashes
and measurements in docs/native-spine-baseline-2026-10-11.json.
The proposed C++ Spine backend is assessed in docs/native-spine-backend-assessment.md;
it is not implemented. Preserve its Core/API/resource and Skia linkage gates.
The opt-in sampled cache player is separate from that proposal. Read
docs/native-spine-shared-cache.md for phase, memory, disposal and API limits.
Keep original live-pose workloads/data unchanged and compare separately named
cache workloads at the explicit sampling rate; never weaken GPU pixel oracles.

The native Skia adapter and Node resource/KUI toolkit retain the 0.1.0 entries,
host versions and authored formats. Future publication remains a separate user action.
The Expo application in `../Kurot-Skia-Demo` consumes the installed package;
scenes, generated inputs and project-owned UI initialization stay in the Demo.
Native adapters live under `src/kurot`. The root export is RN-only,
`./metro` is a Node configuration helper, and `./generator` is Node build-time only.
Read `docs/native-runtime.md` and `docs/PLAN.md` before extending native support.

Runtime sources are grouped by responsibility: `view/` owns RN/view/frame lifecycle;
`rendering/` owns display-tree dispatch, primitives, batching and effects;
`cache/` owns image/Picture recordings, DisplayList and RenderTexture;
`text/` owns shaping, measurement, segmentation and fonts; `input/` owns touches
and RN editing; `resources/` owns transport, textures, assets, Theme and audio
ports; `spine/` owns optional sampled-animation caches. `index.ts`, `core-native.ts`
and the editor `tsconfig.json` remain at the root. Metro mappings use the nested
compiled paths. Keep imports direct and preserve the public package entries.
Historical benchmark source manifests retain their original paths and hashes;
do not relabel them as measurements of this source reorganization.
Both runtime barrels group re-exports by responsibility. Preserve the exported
names, types and target modules when arranging them.

Release adoption is explicit: the Demo's exact 0.1.4 declaration must be updated
after registry 0.1.5 is available if it adopts Picture caching. Compatible 0.1.x
ranges can adopt through installations/locks; the private native host retains
its file dependency. Restart Metro with --clear and rebuild embedded Release
bundles. Core 2.5.3, UI 3.5.0, Skia 3.3.0 and authored formats are unchanged.
Generator-only adoption is optional. Engine SDKs, templates/examples and other
applications need no release or incidental dependency update.

Native rendering separates KurotView's RN/session lifecycle, NativeFrameLoop's
headless timing, NativeFrameRenderer's Graphite viewport/ownership, and
SkiaRenderer's display-tree/compositing dispatch. NativeGraphicsRenderer owns
compiled paths, paints, cache eviction and hit geometry. Notification callback
changes preserve the scene; factory/viewport changes recreate it. Keep continuous
Core ticker rendering and existing cache/batch contracts. See the internal
responsibility table in docs/native-runtime.md before changing these boundaries.

The Demo consumes npm `@kurot/skia@0.1.4` and calls its installed
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
