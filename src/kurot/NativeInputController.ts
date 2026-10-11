import { Event } from '@kurot/core/dist/kurot/events/Event.js';
import { FocusEvent } from '@kurot/core/dist/kurot/events/FocusEvent.js';
import { TouchEvent } from '@kurot/core/dist/kurot/events/TouchEvent.js';
import type { Stage, TextField } from '@kurot/core';

const listeners = new Set<() => void>();
let active: InputController | undefined;
let revision = 0;

function notify(): void {
	revision++;
	for (const listener of listeners) listener();
}

export function subscribeNativeInput(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function nativeInputRevision(): number {
	return revision;
}

export function activeNativeInput(stage?: Stage): InputController | undefined {
	return active?.field.stage === stage ? active : undefined;
}

export function blurNativeInput(stage: Stage): void {
	activeNativeInput(stage)?.hideInput();
}

export function updateNativeInput(stage: Stage): void {
	activeNativeInput(stage)?.updateProperties();
}

/**
 * RN owns the editing surface, caret and IME; Core retains text/focus events.
 * Only a staged field may acquire focus, and detaching always releases it.
 */
export class InputController {
	private static nextViewKey = 0;

	public readonly viewKey = ++InputController.nextViewKey;
	public selection?: { start: number; end: number };
	public value = '';
	private staged = false;
	private properties = '';

	public constructor(public readonly field: TextField) {}

	public addStageText(): void {
		if (this.staged) return;
		this.staged = true;
		this.field.touchEnabled = true;
		this.field.addEventListener(TouchEvent.TOUCH_TAP, this.onTap);
		this.setText(this.field.text);
	}

	public removeStageText(): void {
		if (!this.staged) return;
		this.hideInput();
		this.field.removeEventListener(TouchEvent.TOUCH_TAP, this.onTap);
		this.staged = false;
	}

	public setText(value: string): void {
		if (this.value === value) return;
		this.value = value;
		if (active === this) notify();
	}

	public setSelection(start: number, end: number): void {
		this.selection = { start: Math.min(start, end), end: Math.max(start, end) };
		if (active === this) notify();
	}

	public setScrollTop(_value: number): void {}

	public setColor(_value: number): void {
		this.updateProperties();
	}

	public focus(_active = false): void {
		if (!this.staged || !this.field.visible || !this.field.stage || active === this) return;
		active?.hideInput();
		active = this;
		this.selection = {
			start: Math.min(this.field.selectionBeginIndex, this.field.selectionEndIndex),
			end: Math.max(this.field.selectionBeginIndex, this.field.selectionEndIndex),
		};
		this.field.setIsTyping(true);
		this.field.stage.addEventListener(TouchEvent.TOUCH_BEGIN, this.onStageDown);
		this.field.dispatchEvent(new FocusEvent(FocusEvent.FOCUS_IN, true));
		this.value = this.field.text;
		notify();
	}

	public hideInput(): void {
		if (active !== this) return;
		this.commitText();
		active = undefined;
		this.field.stage?.removeEventListener(TouchEvent.TOUCH_BEGIN, this.onStageDown);
		this.field.setIsTyping(false);
		this.field.dispatchEvent(new FocusEvent(FocusEvent.FOCUS_OUT, true));
		notify();
	}

	public updateProperties(): void {
		if (active !== this) return;
		let visible = true;
		for (let parent = this.field.parent; parent; parent = parent.parent) {
			if (!parent.visible || parent.alpha <= 0) visible = false;
		}
		if (!visible || !this.field.stage || !this.field.visible || this.field.alpha <= 0) {
			this.hideInput();
			return;
		}
		const field = this.field;
		const m = field.$getConcatenatedMatrix();
		const next = [
			m.a,
			m.b,
			m.c,
			m.d,
			m.tx,
			m.ty,
			field.width,
			field.height,
			field.textColor,
			field.size,
			field.fontFamily,
			field.bold,
			field.italic,
			field.multiline,
			field.inputType,
			field.displayAsPassword,
			field.maxChars,
			field.textAlign,
			field.verticalAlign,
		].join('|');
		if (next !== this.properties) {
			this.properties = next;
			notify();
		}
	}

	public acceptText(value: string): void {
		this.selection = undefined;
		this.value = value;
		if (this.field.$setTextFromInput(value)) this.field.dispatchEvent(new Event(Event.CHANGE, true));
		notify();
	}

	public acceptSelection(start: number, end: number): void {
		this.field.$setSelectionFromInput(start, end);
		this.selection = undefined;
	}

	public commitText(): void {
		let value = this.value;
		// RN does not expose composing ranges to JS. Restrict only committed
		// content so a filter never destroys the platform's preedit/IME text.
		if (this.field.restrictAnd !== undefined) {
			value = value.match(new RegExp('[' + this.field.restrictAnd + ']', 'g'))?.join('') ?? '';
		}
		if (this.field.restrictNot !== undefined)
			value = value.replace(new RegExp('[' + this.field.restrictNot + ']', 'g'), '');
		this.acceptText(value);
	}

	private readonly onTap = (): void => this.focus(true);

	private readonly onStageDown = (event: TouchEvent): void => {
		if (event.target !== this.field) this.hideInput();
	};
}
