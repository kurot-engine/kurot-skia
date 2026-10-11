import type { DisplayObject, Mesh } from '@kurot/core';
import { BlendMode, FilterMode, MipmapMode, Skia, TileMode, VertexMode } from 'react-native-skia';
import type { SkCanvas, SkImage, SkShader, SkVertices } from 'react-native-skia';

import { buildMeshBatches, MeshBatchBuilder } from './mesh-geometry.js';
import { NativeImagePaint } from './NativeImagePaint.js';
import { NativeMeshGeometryPool } from './NativeMeshGeometryPool.js';
import type { SharedMeshGeometry } from './NativeMeshGeometryPool.js';
import { nativeBlendMode } from './blend.js';
import { getSkiaImage } from './textures.js';
import { sharedSpineGeometryKey } from './spine-cache-data.js';

interface MeshCache {
	vertices: SkVertices[];
	image: SkImage;
	version: number;
	geometry?: SharedMeshGeometry;
}

interface MeshRun extends MeshCache {
	members: Mesh[];
	builder: MeshBatchBuilder;
}

function eligible(object: DisplayObject): Mesh | undefined {
	if (
		object.$renderObjectType !== 2 ||
		!object.visible ||
		object.alpha <= 0 ||
		object.$maskedObject ||
		object.$mask ||
		object.$maskRect ||
		object.$scrollRect ||
		object.$displayList ||
		object.$filters.length ||
		object.$children?.length ||
		object.anchorOffsetX ||
		object.anchorOffsetY
	)
		return undefined;
	const mesh = object as Mesh;
	if (!mesh.texture?.bitmapData || !mesh.indices.length || mesh.vertices.length / 2 > 65535) return undefined;
	const matrix = mesh.$getMatrix();
	if (matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1 || matrix.tx !== 0 || matrix.ty !== 0)
		return undefined;
	return mesh;
}

export class NativeMeshRenderer {
	private readonly paint = new NativeImagePaint();
	private readonly geometryPool = new NativeMeshGeometryPool();
	private readonly meshes = new Map<Mesh, MeshCache>();
	private readonly runs = new Map<Mesh, MeshRun>();
	private readonly usedRuns = new Set<Mesh>();
	private readonly members: Mesh[] = [];
	private readonly shaders = new Map<SkImage, Map<boolean, SkShader>>();
	private readonly used = new Set<Mesh>();
	private readonly usedImages = new Set<SkImage>();

	public beginFrame(): void {
		this.used.clear();
		this.usedRuns.clear();
		this.usedImages.clear();
		this.geometryPool.clear();
	}

	public draw(mesh: Mesh, canvas: SkCanvas, alpha: number, tint: number, blend = BlendMode.SrcOver): number {
		const texture = mesh.texture;
		const bitmap = texture?.bitmapData;
		if (!texture || !bitmap || mesh.indices.length === 0) return 0;
		const image = getSkiaImage(bitmap);
		if (!image) throw new Error('A native Mesh requires a native texture.');
		this.used.add(mesh);
		this.usedImages.add(image);
		let cache = this.meshes.get(mesh);
		if (!cache || mesh.$renderDirty || cache.image !== image || cache.version !== bitmap.contentVersion) {
			// A pixel hit may consume dirtiness before the main batched draw.
			for (const run of this.runs.values()) {
				if (run.members.includes(mesh)) {
					run.version = -1;
				}
			}
			const create = (): SkVertices[] => {
				const batches = buildMeshBatches(mesh.vertices, mesh.uvs, mesh.indices, {
					x: texture.bitmapX,
					y: texture.bitmapY,
					width: texture.bitmapWidth,
					height: texture.bitmapHeight,
					rotated: texture.rotated,
				});
				const next: SkVertices[] = [];
				try {
					for (const batch of batches) {
						next.push(
							Skia.MakeVertices(
								VertexMode.Triangles,
								batch.positions,
								batch.coordinates,
								undefined,
								batch.indices,
								false,
							),
						);
					}
				} catch (error) {
					for (const vertices of next) {
						vertices.dispose();
					}
					throw error;
				}
				return next;
			};
			const geometry = sharedSpineGeometryKey([mesh]) ? this.geometryPool.acquire([mesh], create) : undefined;
			const next = geometry?.vertices ?? create();
			if (cache?.geometry) {
				cache.geometry.release();
			} else {
				for (const vertices of cache?.vertices ?? []) {
					vertices.dispose();
				}
			}
			cache = { vertices: next, geometry, image, version: bitmap.contentVersion };
			this.meshes.set(mesh, cache);
			mesh.$renderDirty = false;
		}
		return this.drawVertices(cache.vertices, image, mesh.smoothing, canvas, alpha, tint, blend);
	}

	/**
	 * Only consecutive, identity-local meshes with identical paint state merge.
	 * Parent transforms/layers remain on the canvas; hidden children add no pixels.
	 */
	public drawBatch(
		children: readonly DisplayObject[],
		start: number,
		canvas: SkCanvas,
		alpha: number,
		inheritedTint: number,
	): { end: number; draws: number } | undefined {
		const first = eligible(children[start]);
		if (!first) return undefined;
		const bitmap = first.texture!.bitmapData!;
		const image = getSkiaImage(bitmap);
		if (!image) return undefined;
		const tint = first.tint === 0xffffff ? inheritedTint : first.tint;
		this.members.length = 0;
		let vertices = 0;
		let end = start;
		for (; end < children.length; end++) {
			const child = children[end];
			if (!child.visible || child.alpha <= 0 || child.$maskedObject) continue;
			const mesh = eligible(child);
			if (
				!mesh ||
				getSkiaImage(mesh.texture!.bitmapData!) !== image ||
				mesh.smoothing !== first.smoothing ||
				mesh.alpha !== first.alpha ||
				(mesh.tint === 0xffffff ? inheritedTint : mesh.tint) !== tint ||
				mesh.blendMode !== first.blendMode ||
				vertices + mesh.vertices.length / 2 > 65535
			)
				break;
			vertices += mesh.vertices.length / 2;
			this.members.push(mesh);
		}
		if (this.members.length < 2) return undefined;
		this.usedRuns.add(first);
		this.usedImages.add(image);
		let run = this.runs.get(first);
		if (!run) {
			run = { vertices: [], image, version: -1, members: [], builder: new MeshBatchBuilder() };
			this.runs.set(first, run);
		}
		const changedMembers =
			run.members.length !== this.members.length ||
			this.members.some((mesh, index) => mesh !== run.members[index]);
		if (
			run.image !== image ||
			run.version !== bitmap.contentVersion ||
			changedMembers ||
			this.members.some(mesh => mesh.$renderDirty)
		) {
			const builder = run.builder;
			const next = this.geometryPool.acquire(this.members, () => {
				builder.reset();
				for (const mesh of this.members) {
					const texture = mesh.texture!;
					builder.append(mesh.vertices, mesh.uvs, mesh.indices, {
						x: texture.bitmapX,
						y: texture.bitmapY,
						width: texture.bitmapWidth,
						height: texture.bitmapHeight,
						rotated: texture.rotated,
					});
				}
				return [
					Skia.MakeVertices(
						VertexMode.Triangles,
						builder.positions,
						builder.coordinates,
						undefined,
						builder.indices,
						false,
					),
				];
			});
			run.geometry?.release();
			run.geometry = next;
			run.vertices = next.vertices;
			run.image = image;
			run.version = bitmap.contentVersion;
			if (changedMembers) {
				run.members = this.members.slice();
			}
		}
		for (const mesh of this.members) {
			mesh.$renderDirty = false;
			mesh.$cacheDirty = false;
		}
		return {
			end,
			draws: this.drawVertices(
				run.vertices,
				image,
				first.smoothing,
				canvas,
				alpha * first.alpha,
				tint,
				nativeBlendMode(first.blendMode),
			),
		};
	}

	public endFrame(): void {
		this.members.length = 0;
		for (const [mesh, run] of this.runs) {
			if (!this.usedRuns.has(mesh)) {
				run.geometry?.release();
				this.runs.delete(mesh);
			}
		}
		for (const [mesh, cache] of this.meshes) {
			if (!this.used.has(mesh)) {
				if (cache.geometry) {
					cache.geometry.release();
				} else {
					for (const vertices of cache.vertices) {
						vertices.dispose();
					}
				}
				this.meshes.delete(mesh);
			}
		}
		for (const [image, shaders] of this.shaders) {
			if (!this.usedImages.has(image)) {
				for (const shader of shaders.values()) {
					shader.dispose();
				}
				this.shaders.delete(image);
			}
		}
		this.geometryPool.clear();
	}

	public dispose(): void {
		this.used.clear();
		this.usedRuns.clear();
		this.usedImages.clear();
		this.endFrame();
		this.geometryPool.dispose();
		this.paint.dispose();
	}

	private drawVertices(
		vertices: readonly SkVertices[],
		image: SkImage,
		smoothing: boolean,
		canvas: SkCanvas,
		alpha: number,
		tint: number,
		blend: BlendMode,
	): number {
		let shaders = this.shaders.get(image);
		if (!shaders) {
			shaders = new Map();
			this.shaders.set(image, shaders);
		}
		let shader = shaders.get(smoothing);
		if (!shader) {
			shader = image.makeShaderOptions(
				TileMode.Clamp,
				TileMode.Clamp,
				smoothing ? FilterMode.Linear : FilterMode.Nearest,
				MipmapMode.None,
			);
			shaders.set(smoothing, shader);
		}
		const paint = this.paint.get(alpha, tint, blend);
		paint.setShader(shader);
		try {
			for (const geometry of vertices) {
				canvas.drawVertices(geometry, BlendMode.Modulate, paint);
			}
		} finally {
			paint.setShader(null);
		}
		return vertices.length;
	}
}
