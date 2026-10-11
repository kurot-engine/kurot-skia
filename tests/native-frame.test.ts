import { deepEqual, equal, throws } from 'node:assert/strict';
import { test } from 'node:test';

import { NativeFrameLoop } from '../src/kurot/NativeFrameLoop.js';
import type { FrameStats } from '../src/kurot/NativeFrameLoop.js';
import { recordNativeFrame } from '../src/kurot/native-frame.js';

test('recording submits a complete frame and releases local ownership after submission', () => {
	const events: string[] = [];
	const canvas = { value: 7 };
	const frame = { dispose(): void { events.push('dispose'); } };
	const context = {
		beginRecording(): typeof canvas { events.push('begin'); return canvas; },
		finishRecording(): typeof frame { events.push('finish'); return frame; },
		submit(recording: typeof frame): void { equal(recording, frame); events.push('submit'); },
	};
	const result = recordNativeFrame(context, target => {
		equal(target, canvas); events.push('draw'); return target.value;
	}, () => 123);
	deepEqual(result, { draws: 7, recordedAt: 123 });
	deepEqual(events, ['begin', 'draw', 'finish', 'submit', 'dispose']);
});

test('partial frames finish without submission; failed submissions still release recordings', () => {
	for (const failure of ['draw', 'submit']) {
		const events: string[] = [];
		const context = {
			beginRecording(): object { events.push('begin'); return {}; },
			finishRecording(): { dispose(): void } {
				events.push('finish'); return { dispose(): void { events.push('dispose'); } };
			},
			submit(): void { events.push('submit'); throw new Error('submit'); },
		};
		throws(() => recordNativeFrame(context, () => {
			if (failure === 'draw') throw new Error('draw');
			return 1;
		}), new RegExp(failure));
		deepEqual(events, failure === 'draw'
			? ['begin', 'finish', 'dispose'] : ['begin', 'finish', 'submit', 'dispose']);
	}
});

test('frame loop preserves update ordering, clamps delta and resets time after background resume', () => {
	let time = 100;
	const deltas: number[] = [];
	const events: string[] = [];
	const loop = new NativeFrameLoop({
		update(delta): void { deltas.push(delta); events.push('update'); },
		draw() { events.push('draw'); return { draws: 1, recordedAt: time }; },
		onError(message): void { throw new Error(message); },
	}, () => time);
	loop.render(); equal(events.length, 0);
	equal(loop.start(), true); equal(loop.start(), false);
	time += 16; loop.render();
	time += 1000; loop.render();
	loop.stop(); time += 10000; loop.render();
	equal(events.length, 4);
	equal(loop.start(), true); time += 20; loop.render();
	deepEqual(deltas, [0.016, 0.05, 0.02]);
	deepEqual(events, ['update', 'draw', 'update', 'draw', 'update', 'draw']);
});

test('frame profiles retain update/record/submit boundaries and use the current stats callback', () => {
	let time = 0;
	const oldReports: FrameStats[] = [];
	const newReports: FrameStats[] = [];
	const callbacks = {
		update(): void { time += 2; },
		draw() { time += 3; const recordedAt = time; time += 1; return { draws: 9, recordedAt }; },
		onStats(stats: FrameStats): void { oldReports.push(stats); },
		onError(message: string): void { throw new Error(message); },
	};
	const loop = new NativeFrameLoop(callbacks, () => time);
	loop.start(); time = 16; loop.render();
	callbacks.onStats = stats => { newReports.push(stats); };
	time = 1000; loop.render();
	equal(oldReports.length, 0); equal(newReports.length, 1);
	const report = newReports[0];
	equal(report.frames, 2); equal(report.fps, 2); equal(report.draws, 9);
	equal(report.profile?.samples, 2);
	equal(report.profile?.updateMs.p95, 2);
	equal(report.profile?.recordMs.p95, 3);
	equal(report.profile?.submitMs.p95, 1);
	equal(report.profile?.totalMs.p95, 6);
});

test('update and draw failures latch the loop stopped and reach the current error callback', () => {
	for (const failure of ['update', 'draw']) {
		const errors: string[] = [];
		let updates = 0; let draws = 0;
		const callbacks = {
			update(): void { updates++; if (failure === 'update') throw new Error('update'); },
			draw() { draws++; throw new Error('draw'); },
			onError(message: string): void { throw new Error(`obsolete: ${message}`); },
		};
		const loop = new NativeFrameLoop(callbacks, () => 10);
		loop.start(); callbacks.onError = message => { errors.push(message); };
		loop.render(); loop.render();
		equal(loop.start(), false);
		deepEqual(errors, [failure]); equal(updates, 1); equal(draws, failure === 'draw' ? 1 : 0);
	}
});
