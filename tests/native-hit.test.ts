import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitTestNative, nativePixelHit } from '../src/kurot/input/native-hit.js';

test('overlapping pointers replay Core traversal with independent GPU samples', async () => {
	const front = {}, back = {};
	const releases: (() => void)[] = [];
	let frontReads = 0;
	let backReads = 0;
	const results: [number, boolean][] = [];
	const tree = {
		$hitTest(x: number): undefined {
			const hit = nativePixelHit(front, async () => {
				frontReads++;
				await new Promise<void>(resolve => releases.push(resolve));
				return x === 1;
			}) || nativePixelHit(back, async () => {
				backReads++;
				return false;
			});
			results.push([x, hit]);
			return undefined;
		},
	};
	const first = hitTestNative(tree, 1, 0);
	const second = hitTestNative(tree, 2, 0);
	releases[1]();
	await second;
	releases[0]();
	await first;
	assert.deepEqual(results, [[2, false], [1, true]]);
	assert.equal(frontReads, 2);
	assert.equal(backReads, 1);
});

test('GPU errors propagate and leave no active synchronous hit context', async () => {
	const owner = {};
	const tree = {
		$hitTest(): undefined {
			nativePixelHit(owner, async () => { throw new Error('GPU unavailable'); });
			return undefined;
		},
	};
	await assert.rejects(hitTestNative(tree, 0, 0), /GPU unavailable/);
	assert.throws(() => tree.$hitTest(), /await hitTestNative/);
});
