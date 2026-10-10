// CLI has no public compiler subpath yet. Keep this pinned integration isolated.
import { generateCode, parseToIR } from '@kurot/cli/dist/core/kui/index.js';
import type { UIResourceConfigEntry, UIStyleSheet } from '@kurot/ui-document';
import * as ts from 'typescript';

export interface CompiledSkin {
	readonly className: string;
	readonly factoryName: string;
	readonly source: string;
}

/**
 * Uses the registry compiler's resource, style and state semantics. Only factory
 * typing and dynamic-field typing are adapted for strict TS output.
 */
export function compileSkin(
	source: string,
	resources: readonly UIResourceConfigEntry[],
	style?: UIStyleSheet,
): CompiledSkin {
	const ir = parseToIR(source, undefined, [], resources, undefined, style);
	if (ir.unresolvedTags.length) {
		throw new Error(`Unresolved KUI components: ${ir.unresolvedTags.map(tag => tag.name).join(', ')}`);
	}
	const parsed = ts.createSourceFile('skin.ts', generateCode(ir, { format: 'esm' }), ts.ScriptTarget.ES2022, true);
	const factory = parsed.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node));
	if (!factory?.name) {
		throw new Error(`KUI compiler did not emit a named factory: ${ir.className}`);
	}
	const transformed = ts.transform(parsed, [
		(context): ts.Transformer<ts.SourceFile> => {
			const visit: ts.Visitor = node => {
				if (ts.isFunctionDeclaration(node)) {
					const visited = ts.visitEachChild(node, visit, context);
					return ts.factory.updateFunctionDeclaration(
						visited,
						visited.modifiers,
						visited.asteriskToken,
						visited.name,
						visited.typeParameters,
						visited.parameters,
						ts.factory.createTypeReferenceNode('Skin'),
						visited.body,
					);
				}
				if (
					ts.isVariableDeclaration(node) &&
					ts.isIdentifier(node.name) &&
					node.name.text === 'skin' &&
					node.initializer &&
					ts.isNewExpression(node.initializer) &&
					ts.isIdentifier(node.initializer.expression) &&
					node.initializer.expression.text === 'Skin'
				) {
					const type = ts.factory.createIntersectionTypeNode([
						ts.factory.createTypeReferenceNode('Skin'),
						ts.factory.createTypeReferenceNode('Record', [
							ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
							ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
						]),
					]);
					return ts.factory.updateVariableDeclaration(
						node,
						node.name,
						node.exclamationToken,
						node.type,
						ts.factory.createAsExpression(node.initializer, type),
					);
				}
				return ts.visitEachChild(node, visit, context);
			};
			return (file): ts.SourceFile => ts.visitNode(file, visit, ts.isSourceFile) ?? file;
		},
	]);
	try {
		return {
			className: ir.className,
			factoryName: factory.name.text,
			source: ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed.transformed[0]),
		};
	} finally {
		transformed.dispose();
	}
}
