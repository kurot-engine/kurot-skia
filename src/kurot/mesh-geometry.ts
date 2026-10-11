export interface MeshBatch {
	positions: { x: number; y: number }[];
	coordinates: { x: number; y: number }[];
	indices: number[];
}

export interface MeshSource {
	x: number;
	y: number;
	width: number;
	height: number;
	rotated: boolean;
}

/**
 * Retains JS point storage for ordered native batches. Each input keeps its own
 * UV frame and triangle order; indices are offset rather than deduplicated.
 */
export class MeshBatchBuilder implements MeshBatch {
	public readonly positions: { x: number; y: number }[] = [];
	public readonly coordinates: { x: number; y: number }[] = [];
	public readonly indices: number[] = [];
	private readonly positionPool: { x: number; y: number }[] = [];
	private readonly coordinatePool: { x: number; y: number }[] = [];

	public reset(): void {
		this.positions.length = this.coordinates.length = this.indices.length = 0;
	}

	public append(
		vertices: readonly number[],
		uvs: readonly number[],
		indices: readonly number[],
		source: MeshSource,
	): void {
		if (vertices.length !== uvs.length || vertices.length % 2 !== 0 || indices.length % 3 !== 0) {
			throw new Error('Mesh requires finite paired positions/UVs and complete triangles.');
		}
		const offset = this.positions.length;
		const count = vertices.length / 2;
		if (offset + count > 65535) throw new RangeError('Native mesh batch exceeds uint16 vertex capacity.');
		for (let i = 0; i < vertices.length; i += 2) {
			const x = vertices[i];
			const y = vertices[i + 1];
			const u = uvs[i];
			const v = uvs[i + 1];
			if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(u) || !Number.isFinite(v)) {
				throw new Error('Mesh requires finite paired positions/UVs and complete triangles.');
			}
			const index = offset + i / 2;
			const position = (this.positionPool[index] ??= { x: 0, y: 0 });
			const coordinate = (this.coordinatePool[index] ??= { x: 0, y: 0 });
			position.x = x;
			position.y = y;
			coordinate.x = source.x + (source.rotated ? (1 - v) * source.height : u * source.width);
			coordinate.y = source.y + (source.rotated ? u * source.width : v * source.height);
			this.positions.push(position);
			this.coordinates.push(coordinate);
		}
		for (const index of indices) {
			if (!Number.isInteger(index) || index < 0 || index >= count) {
				throw new Error('Mesh triangle index is outside its vertex array.');
			}
			this.indices.push(offset + index);
		}
	}
}

/**
 * SkVertices indices are uint16. Remapping preserves triangle order and permits
 * large Core meshes without silent index truncation in the native binding.
 */
export function buildMeshBatches(
	vertices: readonly number[],
	uvs: readonly number[],
	indices: readonly number[],
	source: MeshSource,
): MeshBatch[] {
	if (
		vertices.length !== uvs.length ||
		vertices.length % 2 !== 0 ||
		indices.length % 3 !== 0 ||
		!vertices.every(Number.isFinite) ||
		!uvs.every(Number.isFinite)
	) {
		throw new Error('Mesh requires finite paired positions/UVs and complete triangles.');
	}
	const count = vertices.length / 2;
	if (!indices.every(index => Number.isInteger(index) && index >= 0 && index < count)) {
		throw new Error('Mesh triangle index is outside its vertex array.');
	}
	const batches: MeshBatch[] = [];
	let batch: MeshBatch = { positions: [], coordinates: [], indices: [] };
	let remap = new Map<number, number>();
	for (let i = 0; i < indices.length; i += 3) {
		if (remap.size + 3 > 65535) {
			batches.push(batch);
			batch = { positions: [], coordinates: [], indices: [] };
			remap = new Map();
		}
		for (let j = i; j < i + 3; j++) {
			const index = indices[j];
			let mapped = remap.get(index);
			if (mapped === undefined) {
				mapped = remap.size;
				remap.set(index, mapped);
				batch.positions.push({ x: vertices[index * 2], y: vertices[index * 2 + 1] });
				const u = uvs[index * 2];
				const v = uvs[index * 2 + 1];
				batch.coordinates.push(
					source.rotated
						? { x: source.x + (1 - v) * source.height, y: source.y + u * source.width }
						: { x: source.x + u * source.width, y: source.y + v * source.height },
				);
			}
			batch.indices.push(mapped);
		}
	}
	if (batch.indices.length > 0) batches.push(batch);
	return batches;
}
