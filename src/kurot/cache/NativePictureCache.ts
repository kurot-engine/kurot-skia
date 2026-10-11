import { DisplayObject, DisplayObjectContainer } from '@kurot/core';

interface PictureLease {
	release(): void;
}

const caches = new WeakMap<DisplayObject, NativePictureCache>();
let observers = 0;
let restoreObservers: (() => void) | undefined;

function invalidateAncestors(object: DisplayObject | undefined, includeSelf: boolean): void {
	let current = includeSelf ? object : object?.parent;
	while (current) {
		caches.get(current)?.releasePictures();
		current = current.parent;
	}
}

function invalidateMaskUsers(object: DisplayObject): void {
	let current: DisplayObject | undefined = object;
	while (current) {
		if (current.$maskedObject) {
			invalidateAncestors(current.$maskedObject, true);
		}
		current = current.parent;
	}
}

function acquireObservers(): void {
	if (observers++ > 0) return;
	const previousDirty = DisplayObject.$onRenderableDirty;
	const previousStructure = DisplayObjectContainer.$onContainerStructureChange;
	const dirty = (object: DisplayObject): void => {
		const contentDirty = object.$renderDirty || object.$cacheDirty;
		previousDirty?.(object);
		// Core distinguishes content dirtiness from root placement through this
		// flag; the native painter consumes it only after a successful draw.
		invalidateAncestors(object, contentDirty);
		invalidateMaskUsers(object);
	};
	const structure = (object: DisplayObjectContainer): void => {
		previousStructure?.(object);
		invalidateAncestors(object, true);
		invalidateMaskUsers(object);
	};
	DisplayObject.$onRenderableDirty = dirty;
	DisplayObjectContainer.$onContainerStructureChange = structure;
	restoreObservers = (): void => {
		if (DisplayObject.$onRenderableDirty === dirty) {
			DisplayObject.$onRenderableDirty = previousDirty;
		}
		if (DisplayObjectContainer.$onContainerStructureChange === structure) {
			DisplayObjectContainer.$onContainerStructureChange = previousStructure;
		}
	};
}

/**
 * Opt-in native command cache for a display subtree. The renderer owns each
 * recorded Picture; dispose this handle to disable caching and release them.
 * Effective alpha/tint changes rebuild commands, preserving per-child opacity.
 */
export class NativePictureCache {
	private readonly leases = new Set<PictureLease>();
	private disposed = false;
	private revision = 0;

	public constructor(public readonly root: DisplayObject) {
		if (caches.has(root)) throw new Error('This object already has a native Picture cache.');
		if (root.isCachedAsTexture) throw new Error('Choose Picture or texture caching for the same object.');
		caches.set(root, this);
		acquireObservers();
		invalidateAncestors(root, false);
	}

	public get version(): number {
		return this.revision;
	}

	/**
	 * Call after directly editing mutable drawing data without a Core setter.
	 */
	public invalidate(): void {
		if (this.disposed) throw new Error('Native Picture cache has been disposed.');
		const seen = new Set<DisplayObject>();
		const pending = [this.root];
		while (pending.length) {
			const object = pending.pop();
			if (!object || seen.has(object)) continue;
			seen.add(object);
			object.$cacheDirty = true;
			object.$markDirty();
			if (object.graphics) {
				object.graphics.canvasCacheDirty = true;
			}
			if (object.$mask) {
				pending.push(object.$mask);
			}
			pending.push(...object.$children ?? []);
		}
		this.root.$cacheDirtyUp();
		invalidateAncestors(this.root, true);
	}

	public dispose(): void {
		if (this.disposed) return;
		this.releasePictures();
		invalidateAncestors(this.root, false);
		caches.delete(this.root);
		this.disposed = true;
		if (--observers === 0) {
			restoreObservers?.();
			restoreObservers = undefined;
		}
	}

	public retain(lease: PictureLease): void {
		this.leases.add(lease);
	}

	public release(lease: PictureLease): void {
		this.leases.delete(lease);
	}

	public releasePictures(): void {
		this.revision++;
		for (const lease of this.leases) {
			lease.release();
		}
	}
}

export function getNativePictureCache(object: DisplayObject): NativePictureCache | undefined {
	return caches.get(object);
}
