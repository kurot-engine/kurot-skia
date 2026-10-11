import type { SkTextStyle } from 'react-native-skia';

import { createParagraph, nativeFontStyle } from './paragraph.js';
import { nativeFontRevision } from './NativeFontManager.js';

interface FontFrame {
	ascent: number;
	descent: number;
}

export interface NativeTextMetrics {
	width: number;
	actualBoundingBoxLeft: number;
	actualBoundingBoxRight: number;
	actualBoundingBoxAscent: number;
	actualBoundingBoxDescent: number;
	fontBoundingBoxAscent: number;
	fontBoundingBoxDescent: number;
}

// Only numeric system-font frames are retained, never text or shaped paragraphs.
const frames = new Map<string, FontFrame>();
const measurements = new Map<string, NativeTextMetrics>();
let measuredRevision = -1;

function getFontFrame(key: string, style: SkTextStyle): FontFrame {
	let frame = frames.get(key);
	if (!frame) {
		const paragraph = createParagraph(' ', style);
		try {
			const line = paragraph.getLineMetrics()[0];
			frame = { ascent: line?.ascent ?? 0, descent: line?.descent ?? 0 };
		} finally {
			paragraph.dispose();
		}
		if (frames.size >= 64) {
			frames.clear();
		}
		frames.set(key, frame);
	}
	return frame;
}

export function getFontString(size: number, family: string, bold: boolean, italic: boolean): string {
	return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${family}`;
}

export function measureText(text: string, family: string, size: number, bold: boolean, italic: boolean): number {
	return measureTextMetrics(text, family, size, bold, italic).width;
}

/**
 * Native shaping and fallback ink mapped to Core's existing TextMetrics contract.
 */
export function measureTextMetrics(
	text: string,
	family: string,
	size: number,
	bold: boolean,
	italic: boolean,
): NativeTextMetrics {
	const revision = nativeFontRevision();
	if (measuredRevision !== revision) {
		measurements.clear();
		measuredRevision = revision;
	}
	// Retain short metrics only, never paragraphs or arbitrarily long user text.
	const font = getFontString(size, family, bold, italic);
	const key = text.length <= 256 ? `${font.length}:${font}:${text}` : undefined;
	const previous = key === undefined ? undefined : measurements.get(key);
	if (previous && key !== undefined) {
		measurements.delete(key);
		measurements.set(key, previous);
		return { ...previous };
	}
	const style = nativeFontStyle(family, size, bold, italic);
	const frame = getFontFrame(`${nativeFontRevision()}:${getFontString(size, family, bold, italic)}`, style);
	let width = 0;
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	if (text) {
		const paragraph = createParagraph(text, style);
		try {
			width = paragraph.getMaxIntrinsicWidth();
			const baseline = paragraph.getLineMetrics()[0]?.baseline ?? 0;
			paragraph.extendedVisit((_line, info) => {
				if (!info) {
					return;
				}
				try {
					for (let i = 0; i < info.bounds.length; i++) {
						const bounds = info.bounds[i];
						if (bounds.width <= 0 || bounds.height <= 0) {
							continue;
						}
						const x = info.origin.x + info.positions[i].x + bounds.x;
						const y = info.origin.y + info.positions[i].y + bounds.y - baseline;
						left = Math.min(left, x);
						top = Math.min(top, y);
						right = Math.max(right, x + bounds.width);
						bottom = Math.max(bottom, y + bounds.height);
					}
				} finally {
					info.font.dispose();
				}
			});
		} finally {
			paragraph.dispose();
		}
	}
	const result: NativeTextMetrics = {
		width,
		actualBoundingBoxLeft: left === Infinity ? 0 : -left,
		actualBoundingBoxRight: right === -Infinity ? 0 : right,
		actualBoundingBoxAscent: top === Infinity ? 0 : -top,
		actualBoundingBoxDescent: bottom === -Infinity ? 0 : bottom,
		fontBoundingBoxAscent: frame.ascent,
		fontBoundingBoxDescent: frame.descent,
	};
	if (key !== undefined) {
		if (measurements.size >= 1024) measurements.delete(measurements.keys().next().value!);
		measurements.set(key, result);
	}
	return { ...result };
}
