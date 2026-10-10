#!/usr/bin/env node
import { parseArgs } from 'node:util';
import * as path from 'node:path';
import { generateProject } from './index.js';
import { logGenerated, runWatchCommand } from './watch-command.js';
import type { ProjectOptions } from './types.js';

try {
	const args = process.argv.slice(2);
	const separator = args.indexOf('--');
	const command = separator < 0 ? [] : args.slice(separator + 1);
	const { values } = parseArgs({
		args: separator < 0 ? args : args.slice(0, separator),
		options: {
			project: { type: 'string', default: '.' },
			manifest: { type: 'string' },
			skins: { type: 'string' },
			style: { type: 'string' },
			output: { type: 'string' },
			assets: { type: 'string', default: 'metro' },
			'theme-map': { type: 'string' },
			help: { type: 'boolean', short: 'h' },
			watch: { type: 'boolean', short: 'w' },
		},
	});
	if (values.help) {
		console.info('kurot-project --project <dir> [--manifest resource/resource.json]');
		console.info('  [--skins <dir>] [--style <json>] [--output src/generated/kurot]');
		console.info('  [--assets metro|url] [--theme-map <json>] [--watch]');
		console.info('  --watch [-- <command> <args...>] generates, watches and runs a dev command.');
	} else {
		if (values.assets !== 'metro' && values.assets !== 'url') {
			throw new Error('--assets must be metro or url');
		}
		if (separator >= 0 && (!values.watch || !command.length)) {
			throw new Error('A command after -- requires --watch and a nonempty command.');
		}
		const options: ProjectOptions = {
			projectRoot: values.project,
			manifest: values.manifest,
			skinsDir: values.skins,
			styleSheet: values.style,
			outputDir: values.output,
			assetMode: values.assets,
			themeMapFile: values['theme-map'] === undefined ? undefined : path.resolve(values['theme-map']),
		};
		if (values.watch) {
			await runWatchCommand(options, command);
		} else {
			logGenerated(await generateProject(options));
		}
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
