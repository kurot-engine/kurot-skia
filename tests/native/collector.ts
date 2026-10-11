import { appendFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import * as path from 'node:path';
const directory = path.resolve(process.argv[2] ?? 'tests/native/results');
const output = path.join(directory, 'native-results.jsonl');
await mkdir(directory, { recursive: true });
const server = createServer((request, response): void => {
    if (request.method !== 'POST' || request.url !== '/results') { response.writeHead(404).end(); return; }
    let body = '';
    request.on('data', (chunk: Buffer): void => {
        body += chunk.toString('utf8');
        if (body.length > 1024 * 1024) request.destroy();
    });
    request.on('end', (): void => {
        void (async (): Promise<void> => {
            const value: unknown = JSON.parse(body);
            if (!value || typeof value !== 'object') { response.writeHead(400).end(); return; }
            await appendFile(output, JSON.stringify({ collectedAt: new Date().toISOString(), ...value }) + '\n');
            response.writeHead(204).end();
        })().catch(() => response.writeHead(400).end());
    });
});
server.listen(9085, '127.0.0.1', (): void => { console.info('Native test collector: http://127.0.0.1:9085/results'); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, (): void => {
    server.close(); server.closeIdleConnections();
});
