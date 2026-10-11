export interface NativeFrameResult {
	draws: number;
	recordedAt: number;
}

interface Recording {
	dispose(): void;
}

interface RecordingContext<Canvas, Frame extends Recording> {
	beginRecording(): Canvas;
	finishRecording(): Frame;
	submit(frame: Frame): void;
}

/**
 * Every opened recording is finished; only complete frames are submitted.
 * Submission retains its own native ownership before the local frame is released.
 */
export function recordNativeFrame<Canvas, Frame extends Recording>(
	context: RecordingContext<Canvas, Frame>,
	draw: (canvas: Canvas) => number,
	now: () => number = () => performance.now(),
): NativeFrameResult {
	const canvas = context.beginRecording();
	let draws = 0;
	let recordedAt = 0;
	let complete = false;
	try {
		draws = draw(canvas);
		complete = true;
	} finally {
		const frame = context.finishRecording();
		recordedAt = now();
		try {
			if (complete) context.submit(frame);
		} finally {
			frame.dispose();
		}
	}
	return { draws, recordedAt };
}
