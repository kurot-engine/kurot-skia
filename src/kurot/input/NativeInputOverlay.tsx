import type { Stage } from '@kurot/core';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { TextInput } from 'react-native';

import { activeNativeInput, nativeInputRevision, subscribeNativeInput } from './NativeInputController.js';
import { createViewport } from '../view/viewport.js';

export interface NativeInputOverlayProps {
	stage?: Stage;
	width: number;
	height: number;
}

/**
 * Only the focused field has an RN view. Unfocused text and its UI stay in Skia.
 */
export function NativeInputOverlay({ stage, width, height }: NativeInputOverlayProps): ReactElement | undefined {
	useSyncExternalStore(subscribeNativeInput, nativeInputRevision);
	const controller = activeNativeInput(stage);
	const input = useRef<TextInput | undefined>(undefined);
	useEffect(() => {
		const element = input.current;
		if (controller) element?.focus();
		// ref.blur() skips an already-unregistered Fabric input in RN 0.86.
		return () => TextInput.State.blurTextInput(element);
	}, [controller]);
	if (!controller || !stage || width <= 0 || height <= 0) return undefined;
	const field = controller.field;
	const viewport = createViewport(width, height, stage.stageWidth, stage.stageHeight);
	const m = field.$getConcatenatedMatrix();
	const scale = viewport.scale;
	const color = '#' + field.textColor.toString(16).padStart(6, '0');
	return (
		<TextInput
			key={controller.viewKey}
			ref={element => {
				input.current = element ?? undefined;
			}}
			testID="kurot-native-input"
			accessibilityLabel="Kurot text input"
			value={controller.value}
			selection={controller.selection}
			onChangeText={value => controller.acceptText(value)}
			onSelectionChange={({ nativeEvent }) =>
				controller.acceptSelection(nativeEvent.selection.start, nativeEvent.selection.end)
			}
			onEndEditing={() => controller.commitText()}
			onBlur={() => controller.hideInput()}
			onSubmitEditing={() => {
				controller.commitText();
				if (!field.multiline) controller.hideInput();
			}}
			maxLength={field.maxChars > 0 ? field.maxChars : undefined}
			secureTextEntry={field.displayAsPassword || field.inputType === 'password'}
			keyboardType={field.inputType === 'tel' ? 'phone-pad' : 'default'}
			multiline={field.multiline}
			allowFontScaling={false}
			autoCapitalize="none"
			autoCorrect={false}
			underlineColorAndroid="transparent"
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: field.width,
				height: field.height,
				color,
				padding: 0,
				margin: 0,
				fontSize: field.size,
				fontWeight: field.bold ? '700' : '400',
				fontStyle: field.italic ? 'italic' : 'normal',
				textAlign: field.textAlign === 'right' || field.textAlign === 'center' ? field.textAlign : 'left',
				textAlignVertical:
					field.verticalAlign === 'top' || field.verticalAlign === 'bottom' ? field.verticalAlign : 'center',
				transformOrigin: [0, 0, 0],
				transform: [
					{
						matrix: [
							m.a * scale,
							m.b * scale,
							0,
							0,
							m.c * scale,
							m.d * scale,
							0,
							0,
							0,
							0,
							1,
							0,
							viewport.x + m.tx * scale,
							viewport.y + m.ty * scale,
							0,
							1,
						],
					},
				],
			}}
		/>
	);
}
