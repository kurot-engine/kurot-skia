import { mkdtemp, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as ts from 'typescript';
import { mirrorDirectory } from './files.js';

const diagnosticHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (file): string => file,
    getCurrentDirectory: (): string => process.cwd(),
    getNewLine: (): string => '\n',
};

function check(diagnostics: readonly ts.Diagnostic[]): void {
    const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
        throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, diagnosticHost));
    }
}

/**
 * Both Node and native projects must pass before publishing any compiled files.
 * A fresh staging directory also removes output for deleted source modules.
 */
export async function buildLibrary(root: string): Promise<string[]> {
    const staging = await mkdtemp(path.join(root, '.kurot-build-'));
    try {
        for (const name of ['tsconfig.json', 'tsconfig.native.json']) {
            const config = ts.readConfigFile(path.join(root, name), ts.sys.readFile);
            check(config.error ? [config.error] : []);
            const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
                outDir: staging, noEmitOnError: true,
            }, path.join(root, name));
            check(parsed.errors);
            const program = ts.createProgram(parsed.fileNames, parsed.options);
            check(ts.getPreEmitDiagnostics(program));
            const emitted = program.emit();
            check(emitted.diagnostics);
            if (emitted.emitSkipped) { throw new Error(`Compilation did not emit ${name}.`); }
        }
        return await mirrorDirectory(staging, path.join(root, 'dist'));
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}
