import { deepEqual, equal, notEqual, throws } from 'node:assert/strict';
import { test } from 'node:test';
import type { Mesh } from '@kurot/core';
import type { SkVertices } from 'react-native-skia';
import { NativeMeshGeometryPool } from '../src/kurot/NativeMeshGeometryPool.js';
import { bindSpinePose, captureSpinePose, sharedSpineGeometryKey, spineFrameCount, spineFrameIndex } from '../src/kurot/spine-cache-data.js';
import type { SpineCacheScope, SpinePoseSnapshot } from '../src/kurot/spine-cache-data.js';

function mesh(zIndex = 0): Mesh {
    return { vertices: [0, 0, 8, 0, 8, 4], uvs: [0, 0, 1, 0, 1, 1], indices: [0, 1, 2],
        texture: { bitmapX: 10, bitmapY: 20, bitmapWidth: 8, bitmapHeight: 4, rotated: false },
        $getMatrix: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }), $filters: [],
        visible: true, alpha: 1, tint: 0xffffff, smoothing: true, zIndex } as unknown as Mesh;
}
function actor(pose: SpinePoseSnapshot): Mesh[] {
    return pose.slots.map((slot, index) => {
        const child = mesh(); Object.assign(child, slot); bindSpinePose(child, pose, index); return child;
    });
}
function capture(scope: SpineCacheScope, offset = 0): SpinePoseSnapshot {
    const source = mesh(); source.vertices[0] = offset;
    return captureSpinePose([source], scope, 1000).pose;
}

test('sampled animation wraps independent phases, non-integral duration, boundaries and validates budgets', () => {
    equal(spineFrameCount(1010, 60, 600), 61);
    deepEqual([0, 16.666666666666668, 61, 1009, 1010, -1].map((time) => spineFrameIndex(time, 1010, 60, 61)), [0, 1, 3, 60, 0, 60]);
    throws(() => spineFrameIndex(NaN, 1000, 60, 60));
    for (const value of [0, -1, Infinity, NaN]) throws(() => spineFrameCount(value, 60, 600));
    throws(() => spineFrameCount(1000, 241, 600));
    throws(() => spineFrameCount(11000, 60, 600));
    throws(() => spineFrameCount(1000, 60, 1.2));
});

test('pose snapshots copy and freeze geometry, retain order/paint and enforce memory/source invariants', () => {
    const source = [mesh(3), mesh(1), mesh(2)]; source[2].visible = false;
    const { pose, bytes } = captureSpinePose(source, { active: true }, 1000);
    equal(bytes, 360); deepEqual(pose.order, [1, 0]);
    source[0].vertices[0] = 99; equal(pose.slots[0].vertices[0], 0);
    throws(() => { pose.slots[0].vertices[0] = 1; }, TypeError);
    throws(() => captureSpinePose(source, pose.scope, bytes - 1), /byte budget/);
    source[0].uvs[0] = Infinity; throws(() => captureSpinePose(source, pose.scope, 1000), /finite/);
    const transformed = mesh(); transformed.$getMatrix = mesh(0).$getMatrix;
    transformed.anchorOffsetX = 1; throws(() => captureSpinePose([transformed], pose.scope, 1000), /identity-local/);
});

test('persistent identity keys reject modified topology/frame/order and separate independent pose caches', () => {
    const scope = { active: true }; const pose = captureSpinePose([mesh(), mesh(1)], scope, 1000).pose;
    const a = actor(pose); const b = actor(pose);
    equal(sharedSpineGeometryKey(a)!.key, sharedSpineGeometryKey(b)!.key);
    notEqual(sharedSpineGeometryKey(a)!.key, sharedSpineGeometryKey([a[0]])!.key);
    equal(sharedSpineGeometryKey([a[1], a[0]]), undefined);
    a[0].vertices = a[0].vertices.slice(); equal(sharedSpineGeometryKey(a), undefined);
    b[0].texture = { ...b[0].texture, bitmapX: 11 } as Mesh['texture']; equal(sharedSpineGeometryKey(b), undefined);
    const other = capture(scope); const old = actor(other);
    notEqual(sharedSpineGeometryKey(old)!.key, sharedSpineGeometryKey(actor(capture(scope)))!.key);
    scope.active = false; equal(sharedSpineGeometryKey(old), undefined);
});

test('sampled native buffers survive frames, share across actors and release after cache scope disposal', () => {
    const scope = { active: true }; const pose = capture(scope); const pool = new NativeMeshGeometryPool();
    let created = 0; let disposed = 0;
    const create = (): SkVertices[] => { created++; return [{ dispose: (): void => { disposed++; } } as SkVertices]; };
    const a = pool.acquire(actor(pose), create); const b = pool.acquire(actor(pose), create);
    equal(a, b); equal(created, 1); a.release(); b.release(); pool.clear(); equal(disposed, 0);
    const next = pool.acquire(actor(pose), create); equal(next, a); equal(created, 1);
    scope.active = false; pool.clear(); equal(disposed, 0);
    next.release(); equal(disposed, 1); pool.dispose(); equal(disposed, 1);
});

test('persistent native memo evicts least-used entries within byte/count budgets without killing live runs', () => {
    const scope = { active: true }; const pool = new NativeMeshGeometryPool(108, 2);
    let created = 0; let disposed = 0;
    const create = (): SkVertices[] => { created++; return [{ dispose: (): void => { disposed++; } } as SkVertices]; };
    const poses = [capture(scope, 0), capture(scope, 1), capture(scope, 2)];
    const live = pool.acquire(actor(poses[0]), create);
    pool.acquire(actor(poses[1]), create).release();
    pool.acquire(actor(poses[0]), create).release();
    pool.acquire(actor(poses[2]), create).release(); equal(disposed, 1);
    pool.acquire(actor(poses[0]), create).release(); equal(created, 3);
    pool.dispose(); equal(disposed, 2); live.release(); equal(disposed, 3);
    const tiny = new NativeMeshGeometryPool(1);
    tiny.acquire(actor(poses[0]), create).release(); tiny.acquire(actor(poses[0]), create).release();
    equal(created, 5); equal(disposed, 5); tiny.dispose();
});
