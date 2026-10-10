import { Segmenter } from '@formatjs/intl-segmenter';
import type { Segments } from '@formatjs/intl-segmenter';

// Hermes has no Intl.Segmenter; use the implementation directly without changing globals.
const words = new Segmenter(undefined, { granularity: 'word' });
const graphemes = new Segmenter(undefined, { granularity: 'grapheme' });

export function getWordSegments(text: string): Segments {
    return words.segment(text);
}

export function getGraphemeSegments(text: string): Segments {
    return graphemes.segment(text);
}

export function getGraphemeEndPositions(text: string): number[] {
    return Array.from(getGraphemeSegments(text), (segment) => segment.index + segment.segment.length);
}
