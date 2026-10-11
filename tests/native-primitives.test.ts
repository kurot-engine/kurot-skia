import { deepEqual, equal, throws, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { buildMeshBatches, MeshBatchBuilder } from '../src/kurot/mesh-geometry.js';
import { frameProfile, timingDistribution } from '../src/kurot/frame-stats.js';

const source = { x: 10, y: 20, width: 8, height: 4, rotated: false };
test('mesh UVs use physical atlas coordinates including clockwise frames', () => {
    const positions = [0, 0, 8, 0, 8, 4]; const uvs = [0, 0, 1, 0, 1, 1];
    const [normal] = buildMeshBatches(positions, uvs, [2, 0, 1], source);
    deepEqual(normal.positions, [{ x: 8, y: 4 }, { x: 0, y: 0 }, { x: 8, y: 0 }]);
    deepEqual(normal.coordinates, [{ x: 18, y: 24 }, { x: 10, y: 20 }, { x: 18, y: 20 }]);
    const [rotated] = buildMeshBatches(positions, uvs, [0, 1, 2], { ...source, rotated: true });
    deepEqual(rotated.coordinates, [{ x: 14, y: 20 }, { x: 14, y: 28 }, { x: 10, y: 28 }]);
});
test('native mesh splits uint16 batches without truncating triangle order or UVs', () => {
    const count = 65538;
    const positions = Array.from({ length: count * 2 }, (_, i) => i);
    const uvs = positions.map((i) => i / (count * 2));
    const indices = Array.from({ length: count }, (_, i) => i);
    const batches = buildMeshBatches(positions, uvs, indices, source);
    equal(batches.length, 2);
    const reconstructed = batches.flatMap((batch) => batch.indices.map((index) => batch.positions[index].x / 2));
    deepEqual(reconstructed, indices);
    for (const batch of batches) ok(batch.indices.every((index) => index < 65535));
    equal(batches[1].positions[0].x, 65535 * 2);
});
test('invalid mesh data is rejected before allocating native vertices', () => {
    throws(() => buildMeshBatches([0, 0], [0], [], source), /paired/);
    throws(() => buildMeshBatches([0, NaN], [0, 0], [], source), /finite/);
    throws(() => buildMeshBatches([0, 0], [0, 0], [0], source), /triangles/);
    for (const invalid of [-1, .5, 1, NaN]) throws(() => buildMeshBatches([0, 0], [0, 0], [0, 0, invalid], source), /index/);
    deepEqual(buildMeshBatches([], [], [], source), []);
});
test('frame profiles report nearest-rank percentiles without mutating input', () => {
    const values = [4, 1, 3, 2];
    deepEqual(timingDistribution(values), { p50: 2, p95: 4, p99: 4, max: 4 });
    deepEqual(values, [4, 1, 3, 2]);
    equal(timingDistribution([]).p99, 0);
    const profile = frameProfile([{ updateMs: 2, recordMs: 3, submitMs: 1, totalMs: 6 }]);
    equal(profile.samples, 1); equal(profile.totalMs.p95, 6); equal(profile.recordMs.p50, 3);
});

test('ordered mesh merging retains triangles and separate UV frames while reusing point storage', () => {
    const builder = new MeshBatchBuilder();
    const vertices = [0, 0, 8, 0, 8, 4]; const uvs = [0, 0, 1, 0, 1, 1];
    builder.append(vertices, uvs, [2, 0, 1], source);
    builder.append(vertices, uvs, [0, 2, 1], { ...source, rotated: true });
    deepEqual(builder.indices, [2, 0, 1, 3, 5, 4]);
    deepEqual(builder.coordinates.slice(3), [{ x: 14, y: 20 }, { x: 14, y: 28 }, { x: 10, y: 28 }]);
    const point = builder.positions[0]; const coordinate = builder.coordinates[0];
    builder.reset(); builder.append([2, 3, 4, 5, 6, 7], uvs, [0, 1, 2], source);
    equal(builder.positions[0], point); equal(builder.coordinates[0], coordinate);
    deepEqual(point, { x: 2, y: 3 }); equal(builder.positions.length, 3);
    throws(() => builder.append([0, Infinity], [0, 0], [0, 0, 0], source), /finite/);
    builder.reset(); throws(() => builder.append([0, 0], [0, 0], [0, 0, 1], source), /index/);
    builder.reset(); throws(() => builder.append(new Array<number>(65536 * 2).fill(0),
        new Array<number>(65536 * 2).fill(0), [0, 1, 2], source), /uint16/);
});
