import { Bitmap, Event, SpriteSheet, Stage, ticker } from '@kurot/core';
import { MovieClip, MovieClipDataFactory, ParticleSystem, Tween, URLLoader, URLRequest } from '@kurot/game';
import { createSkiaTexture, SkiaRenderer } from '@kurot/skia';

import { assert, imageFromPixels, near, readGPU, rgba } from './gpu';

export async function runGameChecks(): Promise<void> {
    const bytes = new Uint8Array(16 * 8 * 4);
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 16; x++) bytes.set(x < 8 ? [220, 40, 40, 255] : [40, 180, 220, 255], (y * 16 + x) * 4);
    }
    const image = imageFromPixels(16, 8, bytes);
    const texture = createSkiaTexture(image);
    const stage = new Stage();
    const renderer = new SkiaRenderer();
    let particles: ParticleSystem | undefined;
    try {
        const factory = new MovieClipDataFactory({
            res: { red: { x: 0, y: 0, w: 8, h: 8 }, blue: { x: 8, y: 0, w: 8, h: 8 } },
            mc: { run: { frameRate: 12, frames: [{ res: 'red', duration: 2 }, { res: 'blue' }, {}],
                labels: [{ name: 'loop', frame: 1, end: 3 }], events: [{ frame: 3, name: 'blue-frame' }] } },
        }, texture);
        const data = factory.generateMovieClipData('run');
        assert(data && data.frameCount === 4 && factory.generateMovieClipData('run') === data, 'duration expansion and factory cache');
        const clip = new MovieClip(data);
        assert(clip instanceof Bitmap, 'Game uses the host Core Bitmap');
        const events: string[] = [];
        clip.addEventListener('blue-frame', () => events.push('blue'));
        clip.addEventListener(Event.COMPLETE, () => events.push('complete'));
        stage.addChild(clip);
        clip.gotoAndPlay('loop', 1);
        near(rgba(readGPU(stage, renderer), 3, 3), [220, 40, 40, 255], 'MovieClip first frame');
        clip.advanceFrame();
        assert(clip.currentFrame === 2, 'duration holds the same texture for the second frame');
        clip.advanceFrame();
        near(rgba(readGPU(stage, renderer), 3, 3), [40, 180, 220, 255], 'MovieClip third frame');
        clip.advanceFrame();
        assert(!clip.isPlaying && events.join(',') === 'blue,complete', 'label range and events');
        clip.gotoAndStop(4);
        near(rgba(readGPU(stage, renderer), 3, 3), [0, 0, 0, 0], 'blank frame');
        clip.gotoAndPlay(1, -1);
        stage.removeChild(clip);
        assert(!clip.isPlaying, 'MovieClip stops on stage removal');

        const tweened = new Bitmap(texture);
        stage.addChild(tweened);
        const tween = Tween.get(tweened).to({ x: 20, alpha: 0.5 }, 100);
        tween.setPosition(50);
        assert(Math.abs(tweened.x - 10) < 0.01 && Math.abs(tweened.alpha - 0.75) < 0.01, 'Tween native properties');
        assert(readGPU(stage, renderer).some((value, index) => index % 4 === 3 && value > 0), 'Tween draw after seek');
        Tween.removeTweens(tweened);
        await tween;
        assert(Tween.getCount(tweened) === 0, 'Tween cleanup completes its promise');
        stage.removeChildren();

        const sheet = new SpriteSheet(texture);
        const frame = sheet.createTexture('red', 0, 0, 8, 8);
        particles = new ParticleSystem(frame, 100);
        particles.setCurrentParticles(3);
        particles.particles.forEach((particle, index) => { particle.x = 10 + index * 20; particle.y = 10; });
        stage.addChild(particles);
        near(rgba(readGPU(stage, renderer), 10, 10), [220, 40, 40, 255], 'particle native atlas batch');
        particles.particles[1].alpha = 0.5;
        near(rgba(readGPU(stage, renderer), 30, 10), [220, 40, 40, 128], 'per-particle alpha');
        particles.particles[2].rotation = 45;
        particles.particles[2].blendMode = 1;
        readGPU(stage, renderer);
        particles.stop(true);
        assert(particles.numParticles === 0, 'particle clear');
        stage.removeChildren();

        const loader = new URLLoader();
        const loaded = new Promise<void>((resolve, reject) => {
            loader.addEventListener(Event.COMPLETE, () => resolve());
            loader.addEventListener('ioError', () => reject(new Error('Game URLLoader text failed')));
        });
        loader.load(new URLRequest('resource/resource.json'));
        await loaded;
        assert(typeof loader.data === 'string' && loader.data.includes('kui'), 'Game URLLoader uses the native transport');
    } finally {
        particles?.stop(true);
        Tween.removeAllTweens();
        stage.removeChildren();
        renderer.dispose();
        texture.dispose();
        image.dispose();
    }
    console.info('Kurot Skia: Game checks passed (MovieClip factory/labels/events/pixels, Tween, particles, URLLoader).');
}
