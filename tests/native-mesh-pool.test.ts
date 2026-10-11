import { equal, notEqual } from 'node:assert/strict';
import { test } from 'node:test';
import type { Mesh } from '@kurot/core';
import type { SkVertices } from 'react-native-skia';
import { NativeMeshGeometryPool } from '../src/kurot/NativeMeshGeometryPool.js';

function mesh(): Mesh {
    return { vertices: [0, 0, 8, 0, 8, 4], uvs: [0, 0, 1, 0, 1, 1], indices: [0, 1, 2],
        texture: { bitmapX: 10, bitmapY: 20, bitmapWidth: 8, bitmapHeight: 4, rotated: false } } as Mesh;
}

test('identical actors share buffers with copied geometry snapshots and independent native ownership', () => {
    const pool = new NativeMeshGeometryPool(); let created = 0; let disposed = 0;
    const create = (): SkVertices[] => { created++; return [{ dispose: (): void => { disposed++; } } as SkVertices]; };
    const a = mesh(); const b = mesh();
    const first = pool.acquire([a], create); const second = pool.acquire([b], create);
    equal(first, second); equal(created, 1);
    a.vertices[0] = 2;
    const changed = pool.acquire([a], create); notEqual(first, changed); equal(created, 2);
    const unchanged = pool.acquire([b], create); equal(first, unchanged);
    pool.clear(); equal(disposed, 0);
    first.release(); second.release(); equal(disposed, 0);
    unchanged.release(); equal(disposed, 1);
    changed.release(); equal(disposed, 2);
    const nextFrame = pool.acquire([b], create); notEqual(first, nextFrame);
    nextFrame.release(); equal(disposed, 2);
    pool.clear(); equal(disposed, 3);
});

test('UVs, triangle order, frame geometry and mesh order are part of exact buffer equality', () => {
    const pool = new NativeMeshGeometryPool(); let created = 0;
    const create = (): SkVertices[] => { created++; return [{ dispose: (): void => {} } as SkVertices]; };
    const original = pool.acquire([mesh()], create);
    const variants = [mesh(), mesh(), mesh(), mesh()];
    variants[0].uvs[0] = .5;
    variants[1].indices = [2, 1, 0];
    variants[2].texture!.rotated = true;
    variants[3].vertices.push(3, 3); variants[3].uvs.push(0, 0);
    for (const variant of variants) {
        const geometry = pool.acquire([variant], create); notEqual(geometry, original); geometry.release();
    }
    const a = mesh(); const b = mesh(); b.vertices[0] = 10;
    const forward = pool.acquire([a, b], create); const backward = pool.acquire([b, a], create);
    notEqual(forward, backward); equal(created, 7);
    original.release(); forward.release(); backward.release(); pool.clear();
});

test('per-frame geometry memo limits release excluded buffers without retaining excess snapshots', () => {
    const pool = new NativeMeshGeometryPool(); let disposed = 0;
    const create = (): SkVertices[] => [{ dispose: (): void => { disposed++; } } as SkVertices];
    for (let i = 0; i < 16; i++) {
        const part = mesh(); part.vertices[0] = i;
        pool.acquire([part], create).release();
    }
    equal(disposed, 0);
    const excluded = mesh(); excluded.vertices[0] = 16;
    const first = pool.acquire([excluded], create); const second = pool.acquire([excluded], create);
    notEqual(first, second); first.release(); second.release(); equal(disposed, 2);
    pool.clear(); equal(disposed, 18);
    const large = mesh(); large.vertices = new Array<number>(131072).fill(0); large.uvs = large.vertices.slice();
    const a = pool.acquire([large], create); const b = pool.acquire([large], create);
    notEqual(a, b); a.release(); b.release(); equal(disposed, 20);
    pool.clear(); equal(disposed, 20);
});
