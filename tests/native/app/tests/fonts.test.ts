import { cacheFontResource, Event, HttpRequest, HttpResponseType, registerFontMapping, Stage, TextField } from '@kurot/core';
import { clearNativeFonts, measureText, measureTextMetrics, SkiaRenderer } from '@kurot/skia';
import { assert, readGPU } from './gpu';
export async function runFontChecks(): Promise<void> {
    const url = 'resource/assets/fonts/ChakraPetch-Regular.ttf';
    const request = new HttpRequest();
    request.responseType = HttpResponseType.ARRAY_BUFFER;
    const loaded = new Promise<void>((resolve, reject) => {
        request.addEventListener(Event.COMPLETE, () => resolve());
        request.addEventListener('ioError', () => reject(new Error('bundled font transport')));
    });
    request.open(url); request.send(); await loaded;
    assert(request.response instanceof ArrayBuffer && request.response.byteLength > 1000, 'font bytes preserved');
    cacheFontResource(url, request.response);
    registerFontMapping('NativeTestFont', url);
    registerFontMapping('NativeTestFont', 'resource/assets/fonts/ChakraPetch-Bold.ttf');
    const stage = new Stage(); const renderer = new SkiaRenderer();
    try {
        const field = new TextField(); field.fontFamily = 'NativeTestFont'; field.text = 'Native 字体 123';
        field.width = 220; field.height = 48; field.size = 24; stage.addChild(field);
        const regular = readGPU(stage, renderer, 256, 64); const before = measureText('123', field.fontFamily, 24, false, false);
        for (let i = 0; i < 20; i++) registerFontMapping('NativeTestFont', url);
        assert(measureText('123', field.fontFamily, 24, false, false) === before, 'font registration idempotent');
        assert(regular.some((value, index) => index % 4 === 3 && value > 0), 'custom font with CJK system fallback');
        const measured = measureTextMetrics('123', field.fontFamily, 24, false, false); measured.width = -1;
        assert(measureTextMetrics('123', field.fontFamily, 24, false, false).width > 0, 'measurement cache returns independent values');
        field.bold = true;
        assert(readGPU(stage, renderer, 256, 64).some((value, index) => value !== regular[index]), 'real bold face native shaping');
        stage.removeChildren(); readGPU(stage, renderer, 256, 64);
        console.info('Kurot Skia: font checks passed (binary transport, custom regular/bold, CJK fallback, repeated registration).');
    } finally { stage.removeChildren(); renderer.dispose(); clearNativeFonts(); }
}
