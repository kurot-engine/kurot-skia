#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { generateProject } from './index.js';
import { isRecord, readJSON } from './paths.js';

try {
    const { values } = parseArgs({
        options: {
            project: { type: 'string', default: '.' }, manifest: { type: 'string' },
            skins: { type: 'string' }, style: { type: 'string' }, output: { type: 'string' },
            assets: { type: 'string', default: 'metro' }, 'theme-map': { type: 'string' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (values.help) {
        console.info('kurot-project --project <dir> [--manifest resource/resource.json]');
        console.info('  [--skins <dir>] [--style <json>] [--output src/generated/kurot]');
        console.info('  [--assets metro|url] [--theme-map <json>]');
    } else {
        if (values.assets !== 'metro' && values.assets !== 'url') {
            throw new Error('--assets must be metro or url');
        }
        let themeSkins: Record<string, string> | undefined;
        if (values['theme-map']) {
            const raw = await readJSON(values['theme-map']);
            if (!isRecord(raw) || !Object.values(raw).every(value => typeof value === 'string')) {
                throw new Error('--theme-map must contain a JSON object of host → skin class names');
            }
            themeSkins = raw as Record<string, string>;
        }
        const result = await generateProject({
            projectRoot: values.project, manifest: values.manifest, skinsDir: values.skins,
            styleSheet: values.style, outputDir: values.output, assetMode: values.assets, themeSkins,
        });
        console.info(`Generated ${result.assets.length} local assets, ${result.skins.length} skins → ${result.outputDir}`);
        if (result.remoteURLs.length) {
            console.info(`${result.remoteURLs.length} remote URLs remain runtime-loaded.`);
        }
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
