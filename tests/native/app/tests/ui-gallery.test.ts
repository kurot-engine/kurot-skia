import { EventDispatcher, FocusEvent, Resource, Stage, TextField, ticker } from '@kurot/core';
import { ArrayCollection, Binding, Button, CheckBox, ComboBox, Component, EditableText, Group,
    HScrollBar, HSlider, ItemRenderer, Label, List, Panel, ProgressBar, PropertyEvent, RadioButton,
    Scroller, TextInput, ToggleButton, ToggleSwitch, UIEvent, VerticalLayout, VScrollBar, VSlider } from '@kurot/ui';
import { activeNativeInput, blurNativeInput, NativeTouch, SkiaRenderer, updateNativeInput } from '@kurot/skia';
import { installNativeUI } from '../src/ui/native-ui';
import { assert, readGPU } from './gpu';

export class Row extends ItemRenderer {
    public static created = 0;
    public constructor() {
        super(); Row.created++;
        this.hostComponentKey = 'ItemRenderer'; this.height = 48;
    }
}
class Model extends EventDispatcher {
    public value = 'first';
    public change(value: string): void {
        this.value = value; PropertyEvent.dispatchPropertyEvent(this, 'value');
    }
}
export function makeGallery(): Group {
    const root = new Group(); root.width = 512; root.height = 1024;
    const controls: Component[] = [new Button(), new CheckBox(), new RadioButton(), new ToggleButton(),
        new ToggleSwitch(), new HSlider(), new VSlider(), new ProgressBar(), new HScrollBar(),
        new VScrollBar(), new ComboBox(), new TextInput(), new Panel(), new ItemRenderer(), new Scroller()];
    const close = new Button(); close.skinName = 'skins.CloseButtonSkin'; controls.push(close);
    controls.forEach((control, index) => {
        control.x = 16 + (index % 2) * 248; control.y = 16 + Math.floor(index / 2) * 124;
        control.width = 220; control.height = 96;
        if (control instanceof Button) control.label = control.constructor.name;
        if (control instanceof Panel) control.title = '原生 Panel';
        if (control instanceof TextInput) control.prompt = '输入中文 / IME';
        if (control instanceof ComboBox) {
            control.dataProvider = new ArrayCollection(['one', 'two', 'three']); control.selectedIndex = 1;
        }
        root.addChild(control);
    });
    return root;
}
export async function runGalleryChecks(): Promise<void> {
    const resources = new Resource(); const stage = new Stage(); stage.setContentSize(512, 1024);
    const renderer = new SkiaRenderer(); const input = new NativeTouch(stage);
    const player = { render: (): void => {} }; ticker.addPlayer(player);
    let restore: (() => void) | undefined;
    const validate = (): void => { ticker.update(true); };
    const tap = (component: Component, id: number): void => {
        const p = component.localToGlobal(component.width / 2, Math.min(component.height / 2, 24));
        input.begin(p.x, p.y, id); input.end(p.x, p.y, id); validate();
    };
    try {
        await resources.loadConfig('resource/resource.json', 'resource/'); await resources.loadGroup('preload');
        restore = installNativeUI(resources);
        const gallery = makeGallery(); stage.addChild(gallery); await Promise.resolve(); validate();
        const controls = gallery.$children as Component[];
        for (const component of controls) assert(component.skin, `original skin missing: ${component.constructor.name}`);
        const pixels = readGPU(stage, renderer, 512, 1024);
        for (const component of controls) {
            if (component instanceof Scroller) continue;
            let ink = 0;
            for (let y = component.y; y < component.y + component.height; y++) {
                for (let x = component.x; x < component.x + component.width; x++) {
                    if (pixels[(y * 512 + x) * 4 + 3] > 0) ink++;
                }
            }
            assert(ink > 0, `skin draws GPU pixels: ${component.constructor.name}`);
        }
        const check = controls.find((c): c is CheckBox => c instanceof CheckBox); assert(check, 'CheckBox exists');
        const checkboxPoint = check.localToGlobal(16, 16);
        input.begin(checkboxPoint.x, checkboxPoint.y, 11); input.end(checkboxPoint.x, checkboxPoint.y, 11); validate();
        assert(check.selected && !check.touchCaptured && check.skin?.currentState === 'downAndSelected', 'native toggle selects skin');
        const slider = controls.find((c): c is HSlider => c instanceof HSlider); assert(slider?.thumb, 'HSlider thumb');
        slider.minimum = 0; slider.maximum = 100; slider.value = 20; validate();
        const start = slider.thumb.localToGlobal(slider.thumb.width / 2, slider.thumb.height / 2);
        input.begin(start.x, start.y, 12); input.move(start.x + 90, start.y, 12); input.end(start.x + 90, start.y, 12); validate();
        assert(slider.value > 20, 'native slider drag');
        const combo = controls.find((c): c is ComboBox => c instanceof ComboBox); assert(combo, 'ComboBox exists');
        combo.open(); validate(); assert(combo.isOpen && combo.list?.numElements === 3, 'ComboBox populated popup');
        combo.selectedIndex = 2; combo.close(); validate(); assert(combo.text === 'three' && !combo.isOpen, 'ComboBox close');
        const panel = controls.find((c): c is Panel => c instanceof Panel); assert(panel?.closeButton, 'Panel close part');
        const cancel = (event: UIEvent): void => event.preventDefault(); panel.addEventListener(UIEvent.CLOSING, cancel);
        tap(panel.closeButton, 13); assert(panel.parent === gallery, 'cancelled panel close');
        panel.removeEventListener(UIEvent.CLOSING, cancel); tap(panel.closeButton, 14); assert(!panel.parent, 'Panel close');
        const model = new Model(); const label = new Label();
        const binding = Binding.bindProperty(model, ['value'], label, 'text'); assert(label.text === 'first', 'binding initial');
        model.change('second'); assert(String(label.text) === 'second', 'binding event');
        binding?.unwatch(); model.change('third'); assert(String(label.text) === 'second', 'binding disposal');
        stage.removeChildren();
        const list = new List(); list.width = 320; list.height = 240; list.itemRenderer = Row;
        const layout = new VerticalLayout(); layout.gap = 0; list.layout = layout;
        list.useVirtualLayout = true; list.scrollEnabled = true;
        list.dataProvider = new ArrayCollection(Array.from({ length: 5000 }, (_, i) => `row ${i}`));
        Row.created = 0; stage.addChild(list); validate();
        assert(list.numElements === 5000 && Row.created < 30, 'virtual list creates visible rows only');
        for (const offset of [4800, 48000, 120000, 0]) {
            list.scrollV = offset; validate(); readGPU(stage, renderer, 512, 1024);
            assert(list.$children.length < 30 && Row.created < 40, 'virtual list recycling');
        }
        const selected = list.$children.find((child) => child instanceof Row); assert(selected instanceof Row, 'visible row');
        tap(selected, 15); assert(list.selectedIndex >= 0, 'native virtual list selection'); stage.removeChildren();
        const edit = new EditableText(); edit.prompt = 'placeholder'; edit.width = 200; edit.height = 48;
        stage.addChild(edit); validate(); let focused = 0; let blurred = 0;
        edit.addEventListener(FocusEvent.FOCUS_IN, () => { focused++; }); edit.addEventListener(FocusEvent.FOCUS_OUT, () => { blurred++; });
        edit.setFocus(); const controller = activeNativeInput(stage);
        assert(controller && !edit.text && controller.value === '', 'EditableText focus clears prompt');
        controller.acceptText('中文 ABC'); controller.acceptSelection(3, 6);
        assert(edit.text === '中文 ABC' && edit.selectionBeginIndex === 3, 'UTF-16 native selection');
        edit.restrict = '0-9'; controller.acceptText('a12中3'); blurNativeInput(stage);
        assert(String(edit.text) === '123' && focused === 1 && blurred === 1, 'blur commits restriction once');
        edit.setFocus(); stage.visible = false; updateNativeInput(stage); assert(!activeNativeInput(stage), 'hidden ancestor blurs');
        stage.visible = true; edit.setFocus(); stage.removeChild(edit); assert(!activeNativeInput(stage), 'detached field blurs');
        assert(edit.$children.some((child) => child instanceof TextField), 'UI owns Core input');
        console.info(`Kurot Skia: UI gallery passed (16 skins, controls, binding, 5000 rows / ${Row.created} renderers, editing).`);
    } finally {
        blurNativeInput(stage); input.cancelAll(); stage.removeChildren(); restore?.(); renderer.dispose();
        ticker.removePlayer(player); resources.destroyAll();
    }
}
