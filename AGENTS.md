# Kurot-Skia

Version 0.1.0 is a private Node build-time resource and KUI entry toolkit,
separate from the Expo application in
`../Kurot-Skia-Demo`. Native rendering, input, resource ports and UI adapters
remain in the Demo until explicitly extracted.

The Demo consumes this package as a `file:` development dependency and calls
its `kurot-project` binary. Keep compiled output in the package's `files` list.
The English README is the primary usage guide; its Chinese counterpart is
`docs/README.zh-CN.md`. Keep their commands, options and lifecycle guidance aligned.
Ship both guides and CHANGELOG.md with the compiled package. A version update
does not imply npm publication or extraction of the Demo's runtime adapters.
Do not make consumer scripts address this checkout's `dist` directory directly.

The first feature is a Node build-time project entry generator under
`src/kurot`. Keep implementation directly in this directory without a `project`
subdirectory.
It must not import React Native, Expo or Skia. Reuse the pinned
registry KUI compiler; do not fork its parser, resource defaults or style rules.
The compiler's internal subpath is isolated in `compiler.ts` and must be
revalidated before upgrading CLI.

Use TypeScript, strict ESM, named exports and explicit exported return types.
Avoid new `any`, application `null`, suppression directives and files over
300 lines. Node >=20, pnpm. Run `pnpm build` and `pnpm test` after changes.
Do not bump or publish Kurot SDKs for private scaffold changes.

Generated output directories are owned by the generator. Do not place authored
files there. Resource manifests, KUI XML and style files remain authored input.

Watch mode must serialize regeneration, preserve output on failed saves and
exclude its own output/staging directories. Demo dev commands use the package's
`--watch -- <command>` runner; keep its signal and child-exit cleanup intact.
