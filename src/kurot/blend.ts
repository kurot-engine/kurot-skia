import { BlendMode } from 'react-native-skia';

const modes: Readonly<Record<string, BlendMode>> = {
	'source-over': BlendMode.SrcOver,
	lighter: BlendMode.Plus,
	'destination-out': BlendMode.DstOut,
	multiply: BlendMode.Multiply,
	screen: BlendMode.Screen,
	lighten: BlendMode.Lighten,
	darken: BlendMode.Darken,
	difference: BlendMode.Difference,
	overlay: BlendMode.Overlay,
	'hard-light': BlendMode.HardLight,
	'soft-light': BlendMode.SoftLight,
	'color-dodge': BlendMode.ColorDodge,
	'color-burn': BlendMode.ColorBurn,
	exclusion: BlendMode.Exclusion,
	hue: BlendMode.Hue,
	saturation: BlendMode.Saturation,
	color: BlendMode.Color,
	luminosity: BlendMode.Luminosity,
};

export function nativeBlendMode(mode: string): BlendMode {
	const blend = modes[mode];
	if (blend === undefined) throw new Error(`Unsupported native blend mode: ${mode}`);
	return blend;
}
