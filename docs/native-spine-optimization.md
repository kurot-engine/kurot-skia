# Native Spine rendering optimization

Measured on 2026-10-11 against the unreleased source checkout. npm 0.1.2 and
the registry Demo do not contain this work. Core, UI, Game and Spine SDK sources,
dependency ranges and Web workflows are unchanged.

The original 20-Spineboy scene now fits the **p95** 16.67 ms diagnostic budget
on both iOS Release simulators. Android software Vulkan remains over budget.
Different animation phases and p99 tails still prevent an unrestricted 60 FPS
claim.

## What changed

`NativeMeshRenderer` merges consecutive identity-local meshes with matching
source image, sampling, effective tint, alpha and blend into one native
`SkVertices` draw. It keeps every triangle in painter order and maps each mesh's
physical atlas UV frame separately. Parent placement and compositing stay on the
canvas. Local transforms, anchors, clips, masks, filters, caches and intervening
display kinds retain their ordinary drawing paths. This Spineboy scene changes
from 18 operations per actor to one: **360 → 20** adapter draw operations.
These counts are not hardware draw calls.

`MeshBatchBuilder` retains JS point storage. A bounded frame-local pool may share
immutable native geometry only when **all** raw positions, UVs, indices and
physical source-frame fields match exactly. Actor transforms, image shaders and
paint remain independent. This benefits actors in the same pose; different poses
create their own buffers. Each actor still evaluates its own skeleton every frame.
There is no animation frame skipping, quantization, LOD or shared pose evaluator.

Pool snapshots copy numbers rather than borrowing mutable SDK arrays. At most
16 entries and 262,144 position/UV/index values are memoized for one frame (about
2 MiB of numeric payload, plus source-frame metadata and JS overhead). Visible runs own reference-counted
native buffers; replacement, removal and renderer disposal release those owners.
The source images remain caller-owned. An individual pixel hit invalidates any
merged run containing that mesh, preserving pending main-renderer geometry edits.

## Release measurements

The original 15 workloads retain their actors, resolution, updates and sample
counts. The Spine 4.2 `walk` scene contains 20 independent actors with synchronized
phases. A new sixteenth fixture offsets each actor by `index * 61` ms before
measuring, exposing different poses separately. Both update every actor by
`1000 / 60` ms on each frame.

Each fixture renders a 360×640 logical stage to a 720×1280 GPU surface, with
30 warm-up and 120 measured frames. Total includes pose update, native command
recording and synchronous `flush(true)` GPU completion. This is an offscreen
diagnostic, not presented FPS. Native builds are Release with embedded production
Hermes JS (`__DEV__ === false`); only one test client ran at a time and no build
jobs ran during measurements. Other desktop workload was not controlled.

The host is an Apple M1 Max Mac. iOS uses simulator Metal. Android API 36 reports
`llvmpipe (LLVM 21.1.4, 128 bits)` / Vulkan CPU device type; it does not measure
a phone GPU. The user deferred physical-device testing for this round.

| Original synchronized scene | Before p95 total ms | After p95 total ms | Reduction | After p99 ms | Frames over budget |
| --- | ---: | ---: | ---: | ---: | ---: |
| iOS 26.5 simulator | 25.334 | 13.240 | 47.7% | 19.396 | 3.3% |
| iOS 18.2 simulator | 26.639 | 13.131 | 50.7% | 21.028 | 1.7% |
| Android API 36 software Vulkan | 36.063 | 18.242 | 49.4% | 23.040 | 13.3% |

| Different-phase scene | p50 total ms | p95 total ms | p99 total ms | Frames over budget |
| --- | ---: | ---: | ---: | ---: |
| iOS 26.5 simulator | 14.851 | 16.954 | 18.589 | 9.2% |
| iOS 18.2 simulator | 14.299 | 16.905 | 18.469 | 8.3% |
| Android API 36 software Vulkan | 19.094 | 23.217 | 25.039 | 100% |

The different-phase fixture has no pre-optimization measurement; it is an added
boundary check, not a before/after comparison. Geometry sharing explains why
the original synchronized fixture has more headroom.

| Synchronized scene recording | Before p95 ms | After p95 ms | After update p95 ms | After GPU-wait p95 ms |
| --- | ---: | ---: | ---: | ---: |
| iOS 26.5 simulator | 14.225 | 4.165 | 7.449 | 1.644 |
| iOS 18.2 simulator | 14.453 | 4.316 | 7.589 | 1.745 |
| Android API 36 software Vulkan | 20.106 | 4.996 | 9.018 | 4.505 |

These component percentiles are independent and must not be added to derive the
total percentile. Pose evaluation remains on the JS thread. Different-phase
recording rises to 7.032 / 6.689 / 10.177 ms p95; native vertex construction and
upload remain relevant. This change alone does not meet every scene/platform
budget. Further work should profile real project poses and native vertex uploads
on physical devices before selecting another architecture.

## Verification and provenance

- Library clean build and 35/35 Node tests pass, including merged UV/topology
  validation, uint16 limits, immutable snapshots, ownership and memo limits.
- Full native functional/GPU suites pass in all three Release environments.
  Ordered Mesh batches and all four real Spine versions compare RGBA pixels with
  a fresh individual painter using the unchanged two-channel-unit tolerance.
  Tests cover fractional parent transforms, alpha/tint, rotated/density UVs,
  topology changes, hidden slots, blend/sampling splits, local fallbacks, pixel
  hits, diverging actor geometry, sharing, reattachment and disposal.
- The original 48 nine-slice GPU cases remain unchanged. Existing image, particle,
  DragonBones, UI, resource, cache and input lifecycle checks also pass. Each run
  includes all 16 benchmarks, three mounted RN focus/switch/unmount checks and
  final complete pass. Host type checking and lint pass with zero warnings/errors.
- Production iOS/Android Hermes exports pass the source-map audit: no generator,
  development supervisor, Metro helper, CLI, document kernel or Node compiler/
  watcher enters runtime bundles. Package inspection includes the renderer,
  declarations and reports while excluding native test sources/assets and the
  deleted UV-cache experiment. `git diff --check` passes.

Completed runs: iOS 26.5 at 04:02:41.951 UTC, iOS 18.2 at 04:04:04.534 UTC,
Android at 04:05:34.704 UTC on 2026-10-11. Full distributions, actual build hashes
and source fingerprint are in [the current records](native-benchmarks-2026-10-11.json).
[The retained baseline](native-spine-baseline-2026-10-11.json) keeps its original
02:05–02:07 UTC measurements, build hashes and source fingerprint; it is not
relabeled with the optimized source hash. Superseded optimization experiments,
failed runs and debugging probes are excluded from the final records.

See [the complete feature assessment](native-feature-assessment.md) and
[test instructions](../tests/native/README.md). A p95 pass allows missed frames;
presented frame timelines, phone CPU/GPU/memory and thermal acceptance remain
unverified. No new Skia version has been published for these source changes.
