import type { Mesh, Texture } from '@kurot/core';

export interface SpineCacheScope {
	active: boolean;
}
export interface SpineSlotSnapshot {
	vertices: number[];
	uvs: number[];
	indices: number[];
	texture: Texture | undefined;
	source: readonly [number, number, number, number, boolean];
	visible: boolean;
	alpha: number;
	tint: number;
	smoothing: boolean;
	blendMode: Mesh['blendMode'];
	zIndex: number;
}
export interface SpinePoseSnapshot {
	slots: SpineSlotSnapshot[];
	scope: SpineCacheScope;
	keys: Map<string, object>;
	order: number[];
}
const bindings = new WeakMap<Mesh, { pose: SpinePoseSnapshot; slot: number }>();

function frozenCopy(values: number[]): number[] {
	const copy = values.slice();
	Object.freeze(copy);
	return copy;
}

export function spineFrameCount(durationMs: number, sampleRate: number, maxFrames: number): number {
	if (
		!Number.isFinite(durationMs) ||
		durationMs <= 0 ||
		!Number.isFinite(sampleRate) ||
		sampleRate <= 0 ||
		sampleRate > 240 ||
		!Number.isSafeInteger(maxFrames) ||
		maxFrames < 1
	)
		throw new Error('Invalid Spine cache duration/sample budget.');
	const count = Math.ceil((durationMs * sampleRate) / 1000);
	if (count > maxFrames) throw new Error(`Spine cache requires ${count} frames; budget is ${maxFrames}.`);
	return count;
}

export function spineFrameIndex(timeMs: number, durationMs: number, sampleRate: number, count: number): number {
	if (!Number.isFinite(timeMs)) throw new Error('Spine cache time must be finite.');
	const wrapped = ((timeMs % durationMs) + durationMs) % durationMs;
	return Math.min(count - 1, Math.floor((wrapped * sampleRate) / 1000 + 1e-9));
}

export function captureSpinePose(
	meshes: readonly Mesh[],
	scope: SpineCacheScope,
	remainingBytes: number,
): {
	pose: SpinePoseSnapshot;
	bytes: number;
} {
	const bytes = meshes.reduce(
		(sum, mesh) => sum + (mesh.vertices.length + mesh.uvs.length + mesh.indices.length) * 8,
		0,
	);
	if (bytes > remainingBytes) throw new Error('Spine animation cache exceeds its geometry byte budget.');
	const slots = meshes.map((mesh): SpineSlotSnapshot => {
		const matrix = mesh.$getMatrix();
		if (
			matrix.a !== 1 ||
			matrix.b ||
			matrix.c ||
			matrix.d !== 1 ||
			matrix.tx ||
			matrix.ty ||
			mesh.$children?.length ||
			mesh.$filters.length ||
			mesh.$mask ||
			mesh.$maskRect ||
			mesh.$scrollRect ||
			mesh.$displayList ||
			mesh.$maskedObject ||
			mesh.anchorOffsetX ||
			mesh.anchorOffsetY
		) {
			throw new Error('Spine cache requires unmodified identity-local slot meshes.');
		}
		if (![mesh.vertices, mesh.uvs, mesh.indices].every(values => values.every(Number.isFinite))) {
			throw new Error('Spine cache geometry must be finite.');
		}
		const texture = mesh.texture;
		return {
			vertices: frozenCopy(mesh.vertices),
			uvs: frozenCopy(mesh.uvs),
			indices: frozenCopy(mesh.indices),
			texture,
			source: [
				texture?.bitmapX ?? 0,
				texture?.bitmapY ?? 0,
				texture?.bitmapWidth ?? 0,
				texture?.bitmapHeight ?? 0,
				texture?.rotated ?? false,
			],
			visible: mesh.visible,
			alpha: mesh.alpha,
			tint: mesh.tint,
			smoothing: mesh.smoothing,
			blendMode: mesh.blendMode,
			zIndex: mesh.zIndex,
		};
	});
	const order = slots
		.map((_, index) => index)
		.filter(index => slots[index].visible && slots[index].alpha > 0)
		.sort((a, b) => slots[a].zIndex - slots[b].zIndex || a - b);
	return { pose: { slots, scope, keys: new Map(), order }, bytes };
}

export function bindSpinePose(mesh: Mesh, pose: SpinePoseSnapshot, slot: number): void {
	bindings.set(mesh, { pose, slot });
}

/**
 * Identity reuse is restricted to frozen, unchanged cache snapshots. Ordinary
 * or replaced Core arrays continue through the exact per-frame geometry pool.
 */
export function sharedSpineGeometryKey(meshes: readonly Mesh[]): { key: object; scope: SpineCacheScope } | undefined {
	const first = bindings.get(meshes[0]);
	if (!first?.pose.scope.active) return undefined;
	const { pose } = first;
	const start = pose.order.indexOf(first.slot);
	if (start < 0) return undefined;
	for (let i = 0; i < meshes.length; i++) {
		const mesh = meshes[i];
		const binding = bindings.get(mesh);
		if (binding?.pose !== pose || binding.slot !== pose.order[start + i]) return undefined;
		const snapshot = pose.slots[binding.slot];
		const texture = mesh.texture;
		if (
			!texture ||
			mesh.vertices !== snapshot.vertices ||
			mesh.uvs !== snapshot.uvs ||
			mesh.indices !== snapshot.indices ||
			texture.bitmapX !== snapshot.source[0] ||
			texture.bitmapY !== snapshot.source[1] ||
			texture.bitmapWidth !== snapshot.source[2] ||
			texture.bitmapHeight !== snapshot.source[3] ||
			texture.rotated !== snapshot.source[4]
		)
			return undefined;
	}
	const range = `${start}:${meshes.length}`;
	let key = pose.keys.get(range);
	if (!key) {
		key = {};
		pose.keys.set(range, key);
	}
	return { key, scope: pose.scope };
}
