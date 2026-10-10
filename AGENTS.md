# Kurot-Skia

This is a private library scaffold, separate from the Expo application in
`../Kurot-Skia-Demo`. Native rendering, input, resource ports and UI adapters
remain in the Demo until explicitly extracted.

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
