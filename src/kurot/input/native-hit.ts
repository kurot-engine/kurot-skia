import type { DisplayObject } from '@kurot/core';

class PixelQuery {
	constructor(readonly owner: object, readonly sample: () => Promise<boolean>) {}
}

type Answers = Map<object, boolean>;
let active: Answers | undefined;

/**
 * Core traverses synchronously. Suspend only at a pixel-dependent hit and
 * replay the traversal with that answer; unrelated concurrent queries never
 * share their samples, and a later input never reuses stale scene pixels.
 */
export function nativePixelHit(owner: object, sample: () => Promise<boolean>): boolean {
	if (!active) {
		throw new Error('Native pixel hit tests require await hitTestNative(object, x, y).');
	}
	const answer = active.get(owner);
	if (answer !== undefined) {
		return answer;
	}
	throw new PixelQuery(owner, sample);
}

export async function hitTestNative(root: Pick<DisplayObject, '$hitTest'>, x: number, y: number): Promise<DisplayObject | undefined> {
	const answers: Answers = new Map();
	for (;;) {
		let query: PixelQuery;
		const previous = active;
		try {
			active = answers;
			return root.$hitTest(x, y);
		} catch (error) {
			if (!(error instanceof PixelQuery)) {
				throw error;
			}
			query = error;
		} finally {
			active = previous;
		}
		// One query represents one pointer location. Reuse the first sample for
		// each primitive even if the scene animates while the GPU is busy.
		answers.set(query.owner, await query.sample());
	}
}
