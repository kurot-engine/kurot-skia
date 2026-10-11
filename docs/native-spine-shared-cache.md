# Shared Spine animation cache

`NativeSpineAnimationCache` adds explicit sampled playback in Skia. Core and
the published Spine SDKs remain unchanged. Existing `SkeletonAnimation` objects
still evaluate live skeletons and expose the complete SDK API. This opt-in cache
is included from `@kurot/skia` 0.1.3.

## Use existing skeletons and atlases

Load skeleton data and atlas textures through the existing Spine asset manager.
Supply a factory creating a fresh, detached SDK player from that data. Configure
the final skin inside the factory if needed. Share one cache per
skeleton/action/skin configuration. Bake during scene loading: this synchronous
operation can block JS.

```ts
import type { Stage } from '@kurot/core';
import { NativeSpineAnimationCache } from '@kurot/skia';
import type { NativeScene } from '@kurot/skia';
import { SkeletonAnimation } from '@kurot/spine-4.2';
import type { SkeletonData } from '@kurot/spine-4.2';

export function createCrowd(stage: Stage, data: SkeletonData): NativeScene {
    const cache = new NativeSpineAnimationCache({
        createSource: () => new SkeletonAnimation(data), animation: 'walk', sampleRate: 60,
    });
    const actors = Array.from({ length: 20 }, (_, index) => {
        const actor = cache.createPlayer({ autoUpdate: false });
        actor.x = 30 + index % 5 * 70;
        actor.y = 120 + Math.floor(index / 5) * 140;
        actor.scaleX = actor.scaleY = 0.16;
        actor.seek(index * 61); // milliseconds; independent phases
        stage.addChild(actor);
        return actor;
    });
    return {
        update(deltaSeconds): void {
            for (const actor of actors) { actor.advanceTime(deltaSeconds * 1000); }
        },
        dispose(): void { cache.dispose(); },
    };
}
```

`createPlayer()` defaults to Core stage `ENTER_FRAME` updates. For a scene that
calls `advanceTime()` itself, set `autoUpdate: false` to avoid double updates.
`seek(ms)` wraps in either direction; `advanceTime(ms)` takes a nonnegative delta.
Each player owns its `paused`, `setTimeScale(scale)`, position, scale, rotation,
tint and alpha. `sampleTimeMs` identifies its pose; `currentTimeMs` is its
continuous clock within the loop.

## How it works and memory ownership

One temporary source evaluates a complete action. The cache copies and freezes
slot positions, UVs and triangles, retaining draw order, visibility, texture,
alpha, tint, blend and sampling state. Players select poses and assign those
immutable arrays to ordinary host Core Meshes. Steady playback skips bone
evaluation and world-vertex construction.

The cache stores geometry and borrows existing atlas images, without creating
raster sprite sheets. Native rendering reuses `SkVertices` across actors and
frames. Paint splits and parent transforms remain per actor. Ordinary mutable
meshes retain the existing per-frame pool.

CPU baking defaults to 600 samples and 32 MiB of numeric geometry payload per
cache; configure `maxFrames`/`maxBytes` to change them. Native memo storage uses
LRU eviction, at most 128 entries and 16 MiB of estimated vertex/index payload
per renderer. Live runs retain references after eviction. Budgets exclude JS
objects, temporary source state, native allocation overhead and atlas textures.
Multiple caches/renderers add their budgets; this is not a global memory cap.
`geometryBytes`, `frameCount`, `durationMs` and `sampleRate` expose the CPU payload
and sampling contract. Invalid inputs or exceeded budgets throw during baking.

`actor.dispose()` removes stage/ticker registrations and Mesh references.
`cache.dispose()` also disposes every registered player and releases CPU poses.
Native memo references are pruned on the next rendered frame or renderer
disposal. Atlas textures remain caller-owned: unload the original asset manager
after actors and renderers have released their references.

## Compatibility and tradeoffs

- Sampling selects the preceding pose. At 60 Hz, visual time trails the clock
  by less than 16.67 ms. Higher rendering rates repeat poses unless a higher
  sample rate is selected. There is no vertex interpolation.
- Playback loops one fixed action/skin. There is no live skeleton, track queue,
  crossfade/mixing, layered animation, finite completion promise or Spine
  timeline/track event API. Use the original SDK player for those features.
  This mode is not a drop-in conversion of a live SDK object.
- Source-computed IK, deform, attachment changes and clipping can be sampled.
  Runtime bone edits, external targets and physics depending on previous loops
  do not remain live. Validate each asset; nonperiodic simulation can produce
  a loop discontinuity.
- Source slots require identity local transforms and no custom children,
  masks, filters or bitmap caches. Per-player root transforms/effects remain
  available. Do not edit frozen arrays or mutate shared atlas textures.
  Build a new cache when action/skin/source configuration changes.
- Existing SDK limitations, including multiply/screen slot mapping, remain.

## Acceptance

The final Release run on 2026-10-11 measured the following different-phase
20-actor results. Total time includes update, recording and synchronous GPU wait.

| Environment | Live p95 ms | Cache p95 ms | Reduction | Cache p99 ms | Frames over 16.67 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| iOS 26.5 / M1 Max Metal | 16.352 | 7.369 | 54.9% | 9.709 | 0 / 120 |
| iOS 18.2 / M1 Max Metal | 17.696 | 7.847 | 55.7% | 8.258 | 0 / 120 |
| Android API 36 / software Vulkan llvmpipe | 21.836 | 10.137 | 53.6% | 11.246 | 0 / 120 |

All three full native suites completed, with 18 diagnostic workloads and three
mounted-view checks each. Library build, 40 Node tests, host type checking and
lint passed. Original nine-slice/painter oracles retain their pixel tolerance.
The one-second action has 60 cached poses and 1,023,840 bytes of numeric geometry
payload, shared by all 20 actors. Synchronous baking took 31.67/32.63/35.38 ms.
Both playback modes still submit 20 adapter vertex draws per frame; the cache
reduces CPU evaluation/construction and reuses native geometry, rather than
reducing this draw count. This counter is not a GPU driver draw-call count.

These are short, warm, simulator diagnostics on one Mac with uncontrolled
desktop workload. The cached scene stayed within the chosen frame budget in
these samples; physical-device sustained performance and presentation still
require separate measurement. iOS uses the Mac GPU, Android uses software GPU
execution. They do not measure corresponding phone GPUs.

The native host retains the original 16 workloads and adds two cached 20-actor
workloads. The different-phase case uses the same Spineboy 4.2 `walk`, 61 ms
offsets, 16.67 ms updates, positions/.16 scale, 720×1280 GPU surface, 30 warm-up
and 120 measured frames. Its changed sampling contract is explicit in the name.
The legacy live fixture also retains the SDK Track's loop-restart behavior,
which can discard overshoot on a large time step; cached clocks wrap that
overshoot. Comparisons measure these two playback modes, not frame-by-frame
equivalence of their continuously evolving clocks. Cached actors retain 20
distinct sampled phases for the tested one-second action and 61 ms offsets.

Node tests cover sampling, frozen copies, budget rejection, identity invalidation
and native LRU/reference ownership. GPU tests compare Spine 4.0–4.3 weighted
poses at the **same sampled timestamps**, independent phases/transforms/paint,
looping, pause, time scale, native reuse and lifecycle. Pixel tolerance stays
2 per channel; this does not assert equality with unsampled continuous poses.

Release distributions and build/source provenance are recorded separately in
[native-spine-cache-2026-10-11.json](native-spine-cache-2026-10-11.json). Earlier live-pose measurements in
[native-benchmarks-2026-10-11.json](native-benchmarks-2026-10-11.json) retain their original hashes. Offscreen
update/record/synchronous-GPU-wait diagnostics do not certify presented
60/120 FPS, physical-device memory, battery or thermal behavior.
