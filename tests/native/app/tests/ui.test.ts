import { Bitmap, Event, Rectangle, Resource, Stage, TextField, ticker } from '@kurot/core';
import type { Texture } from '@kurot/core';
import { Button, Group, Image, Label } from '@kurot/ui';
import { AlphaType, ColorType, Skia } from 'react-native-skia';

import { NativeTouch } from '@kurot/skia';
import { SkiaRenderer } from '@kurot/skia';
import { installNativeUI, NativeUIAssetAdapter } from '../src/ui/native-ui';

const width = 360;
const height = 360;

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Native UI check failed: ${message}`);
    }
}

function pixels(stage: Stage, renderer: SkiaRenderer): Uint8Array {
    const surface = Skia.Surface.Make(width, height);
    assert(!!surface, 'native surface');
    try {
        const canvas = surface.getCanvas();
        canvas.clear(Skia.Color('transparent'));
        renderer.render(stage, canvas);
        const image = surface.makeImageSnapshot();
        try {
            const result = image.readPixels(0, 0, {
                width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul,
            });
            assert(result instanceof Uint8Array, 'RGBA pixels');
            return result;
        } finally {
            image.dispose();
        }
    } finally {
        surface.dispose();
    }
}

/**
 * Exercises published UI components, the original compiled KUI skin, native
 * input, actual ticker validation and raster pixels at different button sizes.
 */
export async function runUIChecks(): Promise<void> {
    const resources = new Resource();
    const stage = new Stage();
    stage.setContentSize(width, height);
    const renderer = new SkiaRenderer();
    const input = new NativeTouch(stage);
    // Core flushes callLater only when a player is registered, as in KurotView.
    const player = { render: (): void => {} };
    ticker.addPlayer(player);
    let restoreUI: (() => void) | undefined;
    try {
        await resources.loadConfig('resource/resource.json', 'resource/');
        await resources.loadGroup('preload');
        restoreUI = installNativeUI(resources);
        const root = new Group();
        root.width = width;
        root.height = height;
        const caption = new Label('中文 Label 自动布局与换行');
        caption.left = caption.right = 20;
        caption.top = 20;
        caption.height = 48;
        caption.size = 18;
        caption.multiline = true;
        const button = new Button();
        button.hostComponentKey = 'Button';
        button.label = '开始游戏';
        button.x = 20;
        button.y = 100;
        button.width = 120;
        button.height = 56;
        const fit = new Label('按钮中的超长文字自动缩小');
        fit.x = 20;
        fit.y = 190;
        fit.width = 150;
        fit.height = 28;
        fit.size = 24;
        fit.minFontSize = 12;
        fit.multiline = false;
        fit.textFit = 'shrink';
        root.addChild(caption);
        root.addChild(button);
        root.addChild(fit);
        stage.addChild(root);
        // The button is created while Theme awaits its static module loader.
        await Promise.resolve();
        ticker.update(true);
        assert(caption.width === 320 && caption.x === 20, 'BasicLayout resolves left/right constraints');
        assert(!!button.skin && !!button.labelDisplay && !!button.iconDisplay, 'deferred theme binds original parts');
        const background = button.skin.elementsContent[0];
        assert(background instanceof Image && !!background.bitmap, 'skin Image creates a real Core Bitmap');
        const bitmap = background.bitmap;
        assert(bitmap.texture === resources.get<Texture>('kui.button_up'), 'skin shares Resource atlas texture');
        assert(bitmap.texture?.resolution === 2 && bitmap.scale9Grid?.x === 16, 'manifest grids stay logical at 2×');
        assert(button.labelDisplay.text === '开始游戏', 'Button binds labelDisplay');
        const automatic = new Button(); automatic.label = 'Automatic theme'; automatic.x = 20; automatic.y = 270;
        automatic.width = 160; automatic.height = 48; root.addChild(automatic); ticker.update(true);
        assert(!!automatic.skin && automatic.labelDisplay?.text === 'Automatic theme', 'production default theme resolves an ordinary Button without a host key override');
        const fitted = fit.$children.find((child) => child instanceof TextField);
        assert(fitted instanceof TextField && fitted.size < 24, 'native metrics drive Label shrink');
        const small = pixels(stage, renderer);
        button.width = 280;
        button.label = '现在是一条更宽的按钮';
        ticker.update(true);
        const wide = pixels(stage, renderer);
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const index = ((y + 100) * width + x + 20) * 4;
                assert(small.slice(index, index + 4).every((value, channel) =>
                    Math.abs(value - wide[index + channel]) <= 2), 'nine-slice retains fixed corner pixels after resize');
            }
        }
        assert(wide[((140 * width) + 285) * 4 + 3] > 200, 'nine-slice fills the expanded destination');
        let changes = 0;
        button.addEventListener(Event.CHANGE, () => { changes++; });
        input.begin(70, 125, 1);
        ticker.update(true);
        assert(String(button.skin.currentState) === 'down' && String(background.source) === 'kui.button_down', 'native press selects down texture');
        assert(Number(button.labelDisplay.y) === 12, 'original pressed caption offset is applied');
        const pressed = pixels(stage, renderer);
        assert(pressed[(140 * width + 280) * 4] !== wide[(140 * width + 280) * 4]
            || pressed[(140 * width + 280) * 4 + 1] !== wide[(140 * width + 280) * 4 + 1], 'pressed texture changes actual pixels');
        input.end(70, 125, 1);
        ticker.update(true);
        assert(changes === 1 && button.skin.currentState === 'up', 'release restores up and dispatches one CHANGE');
        assert(button.labelDisplay.y === 10, 'caption offset restores');
        input.begin(70, 125, 2);
        input.end(340, 300, 2);
        ticker.update(true);
        assert(changes === 1 && !button.touchCaptured, 'release outside cancels activation');
        input.begin(70, 125, 3);
        input.cancelAll();
        ticker.update(true);
        assert(changes === 1 && button.skin.currentState === 'up', 'cancel restores state');
        button.enabled = false;
        ticker.update(true);
        assert(String(background.source) === 'kui.button_disabled' && !button.touchEnabled, 'disabled skin and input state');
        assert(button.labelDisplay.textColor === 0x7c8799, 'original disabled palette');
        input.begin(70, 125, 4);
        input.end(70, 125, 4);
        ticker.update(true);
        assert(changes === 1, 'disabled button does not activate');
        button.enabled = true;
        ticker.update(true);
        assert(background.source === 'kui.button_up' && button.touchEnabled, 'enable restores original state');
        input.begin(70, 125, 5);
        stage.removeChild(root);
        ticker.update(true);
        assert(!button.touchCaptured, 'removal releases stage touch listeners');
        input.cancelAll();
        // Verify uncached Resource names through the same UI adapter.
        resources.destroy('mascot_png');
        const loaded = await new Promise<Texture | undefined>((resolve) => {
            new NativeUIAssetAdapter(resources).getAsset('mascot_png', (texture) => resolve(texture));
        });
        assert(loaded === resources.get('mascot_png') && !!loaded, 'UI adapter loads an uncached configured resource');
        const missing = await new Promise<Texture | undefined>((resolve) => {
            new NativeUIAssetAdapter(resources).getAsset('unknown-resource', (texture) => resolve(texture));
        });
        assert(!missing, 'missing UI source completes with undefined');

        const tiny = new Bitmap(resources.get<Texture>('kui.button_up'));
        tiny.scale9Grid = new Rectangle(16, 16, 16, 16);
        tiny.width = tiny.height = 20;
        stage.addChild(tiny);
        assert(pixels(stage, renderer)[(10 * width + 10) * 4 + 3] > 200, 'small nine-slice uses Core scale fallback');
    } finally {
        input.cancelAll();
        stage.removeChildren();
        restoreUI?.();
        renderer.dispose();
        ticker.removePlayer(player);
        resources.destroyAll();
    }
}
