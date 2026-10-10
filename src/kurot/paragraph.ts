import { FontSlant, FontWeight, Skia } from 'react-native-skia';
import type { SkPaint, SkParagraph, SkTextStyle } from 'react-native-skia';

/**
 * One Core run stays on one line; Core owns all wrapping and line placement.
 */
export function createParagraph(text: string, style: SkTextStyle, paint?: SkPaint): SkParagraph {
    const builder = Skia.ParagraphBuilder.Make({ maxLines: 1, textStyle: style });
    let paragraph: SkParagraph;
    try {
        paragraph = builder.pushStyle(style, paint).addText(text).pop().build();
    } finally {
        // Skia 3.3's native builder exposes reset; unlike Paragraph, it has no dispose method.
        builder.reset();
    }
    try {
        paragraph.layout(1_000_000_000);
        return paragraph;
    } catch (error) {
        paragraph.dispose();
        throw error;
    }
}

export function nativeFontStyle(family: string, size: number, bold: boolean, italic: boolean): SkTextStyle {
    return {
        fontFamilies: family.split(',').map((name) => name.trim().replace(/^['"]|['"]$/g, '')),
        fontSize: size,
        fontStyle: { weight: bold ? FontWeight.Bold : FontWeight.Normal, slant: italic ? FontSlant.Italic : FontSlant.Upright },
    };
}
