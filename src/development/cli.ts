import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runDevelopment } from './runner.js';

try {
	const args = process.argv.slice(2);
	const separator = args.indexOf('--');
	const { values } = parseArgs({
		args: separator < 0 ? args : args.slice(0, separator),
		options: { project: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
	});
	if (values.help) {
		console.info('pnpm dev --project <app> -- <command> <args...>');
	} else {
		if (!values.project || separator < 0 || separator === args.length - 1) {
			throw new Error('Specify --project <app> and a development command after --.');
		}
		process.exitCode = await runDevelopment({
			libraryRoot: fileURLToPath(new URL('../../', import.meta.url)),
			projectRoot: path.resolve(values.project),
			command: args.slice(separator + 1),
		});
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
