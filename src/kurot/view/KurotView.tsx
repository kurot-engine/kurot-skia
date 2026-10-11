import { Event, Stage, ticker } from '@kurot/core';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { SkiaGraphiteView } from 'react-native-skia';
import type { SkiaGraphiteViewRef } from 'react-native-skia';

import { NativeFrameLoop } from './NativeFrameLoop.js';
import type { FrameStats, NativeScene } from './NativeFrameLoop.js';
import { NativeFrameRenderer } from './NativeFrameRenderer.js';
import { NativeTouch } from '../input/NativeTouch.js';
import { createViewport } from './viewport.js';
import { NativeInputOverlay } from '../input/NativeInputOverlay.js';
import { blurNativeInput, updateNativeInput } from '../input/NativeInputController.js';

export type { FrameStats, NativeScene } from './NativeFrameLoop.js';

export interface KurotViewProps {
	width: number;
	height?: number;
	createScene(stage: Stage): NativeScene;
	onStats?(stats: FrameStats): void;
	onError(message: string): void;
}

export function KurotView({ width, height, createScene, onStats, onError }: KurotViewProps): ReactElement {
	const view = useRef<SkiaGraphiteViewRef | undefined>(undefined);
	const input = useRef<NativeTouch | undefined>(undefined);
	const callbacks = useRef({ onStats, onError });
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [inputStage, setInputStage] = useState<Stage>();
	// Omitting height fills the native view while retaining logical width.
	const stageHeight = height ?? (size.width > 0 ? (width * size.height) / size.width : 0);

	useEffect(() => {
		callbacks.current = { onStats, onError };
	}, [onStats, onError]);

	useEffect(() => {
		if (!view.current || size.width <= 0 || size.height <= 0) {
			return;
		}
		const renderer = new NativeFrameRenderer(view.current.getContext(), width, stageHeight);
		const stage = new Stage();
		stage.setContentSize(width, stageHeight);
		stage.frameRate = 60;
		const touch = new NativeTouch(stage);
		input.current = touch;
		let scene: NativeScene;
		try {
			scene = createScene(stage);
		} catch (error) {
			input.current = undefined;
			stage.removeChildren();
			renderer.dispose();
			callbacks.current.onError(error instanceof Error ? error.message : String(error));
			return;
		}
		setInputStage(stage);
		const player = new NativeFrameLoop({
			update(delta): void {
				scene.update(delta);
				updateNativeInput(stage);
			},
			draw: () => renderer.draw(stage),
			get onStats(): KurotViewProps['onStats'] {
				return callbacks.current.onStats;
			},
			onError(message): void {
				stop();
				console.error(message);
				callbacks.current.onError(message);
			},
		});
		const stop = (): void => {
			blurNativeInput(stage);
			touch.cancelAll();
			ticker.removePlayer(player);
			ticker.stop();
			player.stop();
		};
		const start = (): void => {
			if (!player.start()) return;
			ticker.addPlayer(player);
			ticker.start();
		};
		if (AppState.currentState === 'active') {
			start();
		}
		const subscription = AppState.addEventListener('change', state => {
			if (state === 'active') {
				stage.dispatchEventWith(Event.ACTIVATE);
				start();
			} else {
				stage.dispatchEventWith(Event.DEACTIVATE);
				stop();
			}
		});
		return () => {
			subscription.remove();
			stop();
			input.current = undefined;
			try {
				scene.dispose();
			} finally {
				stage.removeChildren();
				renderer.dispose();
				setInputStage(undefined);
			}
		};
	}, [width, stageHeight, size, createScene]);

	const forward = (event: GestureResponderEvent, action: 'begin' | 'move' | 'end'): void => {
		const viewport = createViewport(size.width, size.height, width, stageHeight);
		for (const touch of event.nativeEvent.changedTouches) {
			const x = (touch.locationX - viewport.x) / viewport.scale;
			const y = (touch.locationY - viewport.y) / viewport.scale;
			if (action === 'begin' && (x < 0 || y < 0 || x > width || y > stageHeight)) {
				continue;
			}
			input.current?.[action](x, y, Number(touch.identifier));
		}
	};

	return (
		<View
			style={styles.surface}
			onLayout={({ nativeEvent: { layout } }) =>
				setSize(previous =>
					previous.width === layout.width && previous.height === layout.height
						? previous
						: { width: layout.width, height: layout.height },
				)
			}
			onStartShouldSetResponder={() => true}
			onResponderTerminationRequest={() => false}
			onTouchStart={event => forward(event, 'begin')}
			onTouchMove={event => forward(event, 'move')}
			onTouchEnd={event => forward(event, 'end')}
			onTouchCancel={() => input.current?.cancelAll()}
			onResponderTerminate={() => input.current?.cancelAll()}
		>
			<SkiaGraphiteView
				ref={native => {
					view.current = native ?? undefined;
				}}
				style={styles.canvas}
				pointerEvents="none"
				opaque
			/>
			<NativeInputOverlay stage={inputStage} width={size.width} height={size.height} />
		</View>
	);
}

const styles = StyleSheet.create({ surface: { flex: 1, overflow: 'hidden' }, canvas: { flex: 1 } });
