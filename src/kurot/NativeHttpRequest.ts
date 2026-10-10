import { Event } from '@kurot/core/dist/kurot/events/Event.js';
import { HTTPStatusEvent } from '@kurot/core/dist/kurot/events/HTTPStatusEvent.js';
import { IOErrorEvent } from '@kurot/core/dist/kurot/events/IOErrorEvent.js';
import { HttpMethod } from '@kurot/core/dist/kurot/net/HttpMethod.js';
import { HttpRequest as Transport } from '@kurot/core/dist/kurot/net/HttpRequest.js';
import type { HttpRequest as CoreHttpRequest, HttpMethod as CoreHttpMethod } from '@kurot/core';
import { HttpResponseType } from '@kurot/core/dist/kurot/net/HttpResponseType.js';

import { getNativeAsset, isNativeURI } from './native-assets.js';
import type { NativeAsset } from './native-assets.js';

const HttpRequestBase: typeof CoreHttpRequest = Transport;

/**
 * Bundled text/JSON uses Metro; URI requests retain Core's RN XMLHttpRequest transport.
 */
export class HttpRequest extends HttpRequestBase {
    private bundled = false;
    private asset?: NativeAsset;
    private method: CoreHttpMethod = HttpMethod.GET;
    private body?: string;
    private code = 0;
    private generation = 0;

    public override get response(): string | ArrayBuffer | undefined {
        return this.bundled ? this.body : super.response;
    }

    public override get status(): number {
        return this.bundled ? this.code : super.status;
    }

    public override open(url: string, method: CoreHttpMethod = HttpMethod.GET): void {
        super.open(url, method);
        this.asset = getNativeAsset(url);
        this.bundled = Boolean(this.asset) || !isNativeURI(url);
        this.method = method;
    }

    public override send(data?: string | ArrayBuffer | FormData): void {
        if (!this.bundled) {
            super.send(data);
            return;
        }
        const generation = ++this.generation;
        void Promise.resolve().then(() => {
            if (generation !== this.generation) {
                return;
            }
            const asset = this.asset;
            if (this.method !== HttpMethod.GET || this.responseType !== HttpResponseType.TEXT) {
                this.code = 405;
            } else if (!asset || asset.kind === 'image') {
                this.code = 404;
            } else {
                try {
                    // Fresh text prevents ResourceConfig's URL prefixing from mutating bundled JSON.
                    this.body = asset.kind === 'json' ? JSON.stringify(asset.value) : asset.value;
                    this.code = this.body === undefined ? 500 : 200;
                } catch {
                    this.code = 500;
                }
            }
            HTTPStatusEvent.dispatchHTTPStatusEvent(this, this.code);
            if (this.code === 200) {
                this.dispatchEventWith(Event.COMPLETE);
            } else {
                IOErrorEvent.dispatchIOErrorEvent(this);
            }
        });
    }

    public override abort(): void {
        this.generation++;
        this.body = undefined;
        this.code = 0;
        super.abort();
    }

    public override getAllResponseHeaders(): string {
        return this.bundled ? '' : super.getAllResponseHeaders();
    }

    public override getResponseHeader(header: string): string {
        return this.bundled ? '' : super.getResponseHeader(header);
    }
}
