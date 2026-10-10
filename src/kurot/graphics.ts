import type { Graphics, GraphicsCommand, PathCommandType } from '@kurot/core';
import { PaintStyle, Skia, StrokeCap, StrokeJoin } from 'react-native-skia';
import type { SkPaint, SkPath } from 'react-native-skia';

// Core publishes a const enum (types only); Metro cannot inline imported const enums.
const Command = {
    MoveTo: 0, LineTo: 1, CurveTo: 2, CubicCurveTo: 3, DrawRect: 4,
    DrawRoundRect: 5, DrawCircle: 6, DrawEllipse: 7, DrawArc: 8,
    BeginFill: 9, BeginGradientFill: 10, EndFill: 11, LineStyle: 12, Clear: 13,
} as const;

export interface GraphicsDraw {
    path: SkPath;
    paint: SkPaint;
    color: number;
    alpha: number;
    hitPath: SkPath;
}

export function skColor(color: number, tint = 0xffffff): Float32Array {
    return Float32Array.of(
        ((color >> 16) & 255) * ((tint >> 16) & 255) / 65025,
        ((color >> 8) & 255) * ((tint >> 8) & 255) / 65025,
        (color & 255) * (tint & 255) / 65025,
        1,
    );
}

export function compileGraphics(graphics: Graphics): GraphicsDraw[] {
    const draws: GraphicsDraw[] = [];
    const builder = Skia.PathBuilder.Make();
    let fill: Extract<GraphicsCommand, { type: PathCommandType.BeginFill }> | undefined;
    let stroke: Extract<GraphicsCommand, { type: PathCommandType.LineStyle }> | undefined;

    const flush = (close = false, strokeOnly = false): void => {
        if (builder.isEmpty()) {
            return;
        }
        const path = builder.detach();
        if (fill && !strokeOnly) {
            const paint = Skia.Paint();
            paint.setAntiAlias(true);
            draws.push({ path, hitPath: path, paint, color: fill.color, alpha: fill.alpha });
        }
        if (stroke) {
            const outlineBuilder = Skia.PathBuilder.MakeFromPath(path);
            if (close) {
                outlineBuilder.close();
            }
            const outline = outlineBuilder.detach();
            outlineBuilder.dispose();
            const cap = stroke.caps === 'round' ? StrokeCap.Round
                : stroke.caps === 'square' ? StrokeCap.Square : StrokeCap.Butt;
            const join = stroke.joints === 'miter' ? StrokeJoin.Miter
                : stroke.joints === 'bevel' ? StrokeJoin.Bevel : StrokeJoin.Round;
            const paint = Skia.Paint();
            paint.setAntiAlias(true);
            paint.setStyle(PaintStyle.Stroke);
            paint.setStrokeWidth(stroke.thickness);
            paint.setStrokeCap(cap);
            paint.setStrokeJoin(join);
            paint.setStrokeMiter(stroke.miterLimit);
            if (stroke.lineDash?.length) {
                throw new Error('Skia prototype: dashed Graphics strokes are not implemented.');
            }
            const hitPath = Skia.Path.Stroke(outline, {
                width: stroke.thickness, cap, join, miter_limit: stroke.miterLimit,
            }) ?? outline;
            draws.push({ path: outline, hitPath, paint, color: stroke.color, alpha: stroke.alpha });
        }
        if (!fill || strokeOnly) {
            path.dispose();
        }
    };

    try {
        for (const command of graphics.commands) {
            switch (command.type) {
                case Command.BeginFill:
                    flush();
                    fill = command;
                    break;
                case Command.BeginGradientFill:
                    throw new Error('Skia prototype: Graphics gradient fills are not implemented.');
                case Command.EndFill:
                    flush(true);
                    fill = undefined;
                    break;
                case Command.LineStyle:
                    flush();
                    stroke = command;
                    break;
                case Command.MoveTo:
                    builder.moveTo(command.x, command.y);
                    break;
                case Command.LineTo:
                    builder.lineTo(command.x, command.y);
                    break;
                case Command.CurveTo:
                    builder.quadTo(command.cx, command.cy, command.ax, command.ay);
                    break;
                case Command.CubicCurveTo:
                    builder.cubicTo(command.cx1, command.cy1, command.cx2, command.cy2, command.ax, command.ay);
                    break;
                case Command.DrawRect:
                    flush();
                    builder.addRect({ x: command.x, y: command.y, width: command.w, height: command.h });
                    flush();
                    break;
                case Command.DrawRoundRect:
                    flush();
                    builder.addRRect({
                        rect: { x: command.x, y: command.y, width: command.w, height: command.h },
                        rx: Math.min(command.ew / 2, command.w / 2),
                        ry: Math.min(command.eh / 2, command.h / 2),
                    });
                    flush();
                    break;
                case Command.DrawCircle:
                    flush();
                    builder.addCircle(command.x, command.y, command.r);
                    flush();
                    break;
                case Command.DrawEllipse:
                    flush();
                    builder.addOval({ x: command.x, y: command.y, width: command.w, height: command.h });
                    flush();
                    break;
                case Command.DrawArc: {
                    flush();
                    const tau = Math.PI * 2;
                    const delta = command.end - command.start;
                    const full = command.ccw ? -delta >= tau : delta >= tau;
                    const sweep = full ? (command.ccw ? -tau : tau)
                        : command.ccw ? -(((-delta % tau) + tau) % tau) : ((delta % tau) + tau) % tau;
                    builder.addArc({
                        x: command.x - command.r, y: command.y - command.r,
                        width: command.r * 2, height: command.r * 2,
                    }, command.start * 180 / Math.PI, sweep * 180 / Math.PI);
                    flush(false, true);
                    break;
                }
                case Command.Clear:
                    builder.reset();
                    fill = undefined;
                    stroke = undefined;
                    break;
            }
        }
        flush();
        return draws;
    } catch (error) {
        disposeGraphics(draws);
        throw error;
    } finally {
        builder.dispose();
    }
}

export function disposeGraphics(draws: GraphicsDraw[]): void {
    const paths = new Set<SkPath>();
    for (const draw of draws) {
        paths.add(draw.path);
        paths.add(draw.hitPath);
        draw.paint.dispose();
    }
    for (const path of paths) {
        path.dispose();
    }
}
