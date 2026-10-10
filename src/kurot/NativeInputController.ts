/**
 * Dynamic TextField is native; editing needs a separate RN keyboard adapter.
 */
export class InputController {
    public constructor() {
        throw new Error('Skia prototype: TextField INPUT needs a native keyboard adapter. Use DYNAMIC text.');
    }
}
