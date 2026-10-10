# Library and Demo development

The library and Expo Demo remain separate projects and repositories. This guide describes source development for `@kurot/skia` 0.1.0 using an installed local file package.

Applications consuming the npm release use the installed `kurot-project` command and package entries without this supervisor. After publication, install `@kurot/skia@0.1.0` and use the resource-watch scripts from the [README](../README.md). The current Demo's `pnpm dev` is specifically for joint source development and requires its local `file:` dependency.

## Start once

Install each project's dependencies once. Build the library before the Demo's initial installation:

```sh
# Kurot-Skia
pnpm install
pnpm build

# Kurot-Skia-Demo
pnpm install --ignore-scripts
```

Create the native development build with `pnpm android` or `pnpm ios` if the device does not already have it. Then, from the Demo, use:

```sh
pnpm dev --android
# or:
pnpm dev --ios
```

`pnpm dev` alone starts the dev-client server without opening a device. Arguments are forwarded to Expo, for example `pnpm dev --offline --port 8088 --android`.

The Demo delegates to the library's development script, without importing a neighboring compiled module. It continues consuming `@kurot/skia` through `file:../Kurot-Skia` and installed package entries. React, React Native, Skia and Core still resolve through the application's installed peers.

The Demo sets `verifyDepsBeforeRun: false` in its existing pnpm configuration because the supervisor explicitly refreshes the local package. This prevents pnpm from running an additional installation before launching the script. Initial dependency installation is still required. See [pnpm's setting](https://pnpm.io/settings/build#verifydepsbeforerun).

## What the command runs

1. Compile only `src/development/` to bootstrap the supervisor, so an initial runtime or generator type error can still recover in watch mode.
2. Watch library `src/`, build configurations and `package.json`.
3. Compile Node tools and the native runtime into temporary staging. Both must pass before updating `dist/`.
4. Refresh the Demo's local dependency using offline `pnpm install --ignore-scripts` at startup and when package metadata changes. pnpm retains ownership of dependency links and executable shims.
5. Synchronize changed compiled files, public documentation and package metadata into the installed file package. Additions and removals are included. Atomic replacement avoids writing through pnpm hardlinks; unchanged files retain their timestamps.
6. Launch the installed `kurot-project --watch`. Its first successful generation starts Expo in the Demo directory.

Library saves are debounced and serialized. Type errors keep the last successful runtime and generator installed; fixing the source resumes compilation and synchronization. Saves during a rebuild schedule another pass.

Runtime-only changes update installed modules for Metro without restarting Expo. Generator changes restart the resource watcher so it loads new code. Metro helper or package metadata changes restart Expo to reload Node configuration. Expo's exit closes both watchers and forwards its exit code. Ctrl+C stops the watchers and managed processes; POSIX cleanup also terminates their process groups.

Offline installation requires the necessary packages in pnpm's store. New dependency declarations may need normal project installation first; the development tool does not download packages or run dependency lifecycle scripts. Changes to the development supervisor itself take effect when `pnpm dev` is restarted.

## Resource updates

The resource watcher tracks the manifest, local images, atlas descriptors, KUI and styles, and regenerates the Demo's `src/generated/kurot/`. Invalid inputs retain the last generated output and recover on the next valid save.

Generation and Metro refresh do not replace existing Core resource caches or skin instances in place. Reload the app if it retains old resources. The resource generator currently replaces its output directory after successful compilation; avoiding unchanged generated-file writes is separate work.

`pnpm start`, `pnpm android`, `pnpm ios` and `pnpm test:native` retain the installed-package resource-watch workflow. Use `pnpm dev` when editing the library and Demo together. Direct `pnpm exec expo ...` bypasses these watchers.

## Other local applications

The target must declare `@kurot/skia` as a `file:` dependency on this library and have dependencies installed. From the library, run:

```sh
pnpm dev --project ../MyGame -- expo start --dev-client
```

Only that declared installed local package is synchronized. Registry packages and source-checkout links are rejected. Do not run multiple supervisors against the same application.

## Source and package entries

| Source | Package entry / purpose |
| --- | --- |
| `src/kurot/index.ts` | `@kurot/skia`: native runtime |
| `src/generator/index.ts` | `@kurot/skia/generator`: Node generation API |
| `src/generator/cli.ts` | Installed `kurot-project` command |
| `src/metro.cts` | `@kurot/skia/metro`: CommonJS Metro helper |
| `src/development/` | Local build/sync/process supervisor |

The former `@kurot/skia/project` entry has been removed. Update build imports to `/generator`. Earlier private generated output has an older ownership marker; remove only the generator-owned output directory and regenerate when migrating. The Demo has already been migrated.
