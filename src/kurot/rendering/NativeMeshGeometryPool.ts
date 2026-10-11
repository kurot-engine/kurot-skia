import type { Mesh } from '@kurot/core';
import type { SkVertices } from 'react-native-skia';
import { sharedSpineGeometryKey } from '../spine/spine-cache-data.js';
import type { SpineCacheScope } from '../spine/spine-cache-data.js';

interface Part {
	positions: number[];
	coordinates: number[];
	indices: number[];
	source: readonly [number, number, number, number, boolean];
}

export class SharedMeshGeometry {
	private references = 1;

	public constructor(public readonly vertices: SkVertices[]) {}

	public retain(): void {
		this.references++;
	}

	public release(): void {
		if (--this.references === 0) {
			for (const vertices of this.vertices) {
				vertices.dispose();
			}
		}
	}
}

function source(mesh: Mesh): Part['source'] {
	const texture = mesh.texture!;
	return [texture.bitmapX, texture.bitmapY, texture.bitmapWidth, texture.bitmapHeight, texture.rotated];
}

function equal(left: readonly number[], right: readonly number[]): boolean {
	if (left.length !== right.length) return false;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return false;
	}
	return true;
}

function matches(meshes: readonly Mesh[], parts: readonly Part[]): boolean {
	if (meshes.length !== parts.length) return false;
	for (let i = 0; i < meshes.length; i++) {
		const mesh = meshes[i];
		const part = parts[i];
		const texture = mesh.texture!;
		if (
			!equal(mesh.vertices, part.positions) ||
			texture.bitmapX !== part.source[0] ||
			texture.bitmapY !== part.source[1] ||
			texture.bitmapWidth !== part.source[2] ||
			texture.bitmapHeight !== part.source[3] ||
			texture.rotated !== part.source[4] ||
			!equal(mesh.uvs, part.coordinates) ||
			!equal(mesh.indices, part.indices)
		)
			return false;
	}
	return true;
}

/**
 * Identical geometry may share an immutable native buffer across independent
 * actors. Equality includes every position, UV, triangle and source frame;
 * paint and parent transforms remain per draw. Snapshots own copied numbers,
 * never mutable Core arrays. Ordinary memo storage lasts one frame. Frozen
 * Spine poses additionally use a bounded LRU until scope/renderer disposal.
 */
export class NativeMeshGeometryPool {
	private readonly entries: { parts: Part[]; geometry: SharedMeshGeometry }[] = [];
	private readonly persistent = new Map<
		object,
		{ scope: SpineCacheScope; geometry: SharedMeshGeometry; bytes: number }
	>();
	private numbers = 0;
	private persistentBytes = 0;

	public constructor(
		private readonly maxPersistentBytes = 16 * 1024 * 1024,
		private readonly maxPersistentEntries = 128,
	) {}

	public acquire(meshes: readonly Mesh[], create: () => SkVertices[]): SharedMeshGeometry {
		const shared = sharedSpineGeometryKey(meshes);
		if (shared) {
			const hit = this.persistent.get(shared.key);
			if (hit) {
				this.persistent.delete(shared.key);
				this.persistent.set(shared.key, hit);
				hit.geometry.retain();
				return hit.geometry;
			}
			const geometry = new SharedMeshGeometry(create());
			const bytes = meshes.reduce(
				(sum, mesh) => sum + (mesh.vertices.length + mesh.uvs.length) * 4 + mesh.indices.length * 2,
				0,
			);
			if (bytes <= this.maxPersistentBytes && this.maxPersistentEntries > 0) {
				while (
					this.persistent.size >= this.maxPersistentEntries ||
					this.persistentBytes + bytes > this.maxPersistentBytes
				) {
					this.evict(this.persistent.keys().next().value!);
				}
				geometry.retain();
				this.persistent.set(shared.key, { scope: shared.scope, geometry, bytes });
				this.persistentBytes += bytes;
			}
			return geometry;
		}
		for (const entry of this.entries) {
			if (matches(meshes, entry.parts)) {
				entry.geometry.retain();
				return entry.geometry;
			}
		}
		const geometry = new SharedMeshGeometry(create());
		const numbers = meshes.reduce(
			(count, mesh) => count + mesh.vertices.length + mesh.uvs.length + mesh.indices.length,
			0,
		);
		if (this.entries.length < 16 && this.numbers + numbers <= 262144) {
			const parts = meshes.map(mesh => ({
				positions: mesh.vertices.slice(),
				coordinates: mesh.uvs.slice(),
				indices: mesh.indices.slice(),
				source: source(mesh),
			}));
			geometry.retain();
			this.entries.push({ parts, geometry });
			this.numbers += numbers;
		}
		return geometry;
	}

	public clear(): void {
		for (const entry of this.entries) {
			entry.geometry.release();
		}
		this.entries.length = this.numbers = 0;
		for (const [key, entry] of this.persistent) {
			if (!entry.scope.active) {
				this.evict(key);
			}
		}
	}

	public dispose(): void {
		this.clear();
		for (const key of this.persistent.keys()) {
			this.evict(key);
		}
	}

	private evict(key: object): void {
		const entry = this.persistent.get(key)!;
		entry.geometry.release();
		this.persistentBytes -= entry.bytes;
		this.persistent.delete(key);
	}
}
