# Kurot Skia

`@kurot/skia` **0.1.0** — 为 Kurot 应用生成资源与 KUI 皮肤入口的构建时工具。

[English](../README.md) · [变更记录](../CHANGELOG.md)

将已有的 `resource.json`、本地资源和 KUI XML 皮肤转换成打包器可识别的静态 TypeScript 入口。生成器自动维护资源表、皮肤导入、工厂注册和主题映射，并在编辑项目时同步更新。

0.1.0 提供 Node CLI 和构建脚本 API。原生渲染、输入以及运行时资源/主题适配目前仍在相邻的 `Kurot-Skia-Demo` 项目中。本包保持私有，尚未发布到 npm，使用本地开发依赖接入。

## 安装

生成器需要 Node.js >=20 和 pnpm。应用本身还有独立的平台要求；Demo 使用的 Expo SDK 57 需要 Node.js >=22.13（[Expo SDK 文档](https://docs.expo.dev/versions/v57.0.0/)）。

先构建库项目：

```sh
# 在 Kurot-Skia 中
pnpm install
pnpm build
```

然后在与库相邻的现有 Kurot 应用中安装：

```sh
# 在应用项目中
pnpm add --save-dev '@kurot/skia@file:../Kurot-Skia'
```

Expo 应用在这一步使用 [Expo 安装命令](https://docs.expo.dev/more/expo-cli/#install-dependencies)：

```sh
pnpm exec expo install '@kurot/skia@file:../Kurot-Skia' --dev --pnpm
```

现有 Demo 已声明这个依赖。构建库后，在 `Kurot-Skia-Demo` 中执行 `pnpm install`，再执行 `pnpm start --dev-client` 或 `pnpm android`。

修改库源码后，在库中执行 `pnpm build`；新增编译文件或修改包元数据后，在应用中执行 `pnpm install`。应用脚本使用安装包提供的命令，无需引用相邻目录的 `dist`。

## 生成项目入口

典型的输入目录如下：

```text
resource/
├── resource.json
├── assets/
│   ├── logo.png
│   └── ui/
│       ├── ui.json
│       └── ui.png
├── config/
│   └── style.json             # 可选的项目样式
└── ui/
    └── ButtonSkin.kui.xml
```

保留原有资源格式。例如，独立图片可以这样声明：

```json
{
  "resources": [
    { "name": "logo", "type": "image", "url": "assets/logo.png" }
  ],
  "groups": [
    { "name": "preload", "keys": "logo" }
  ]
}
```

资源 URL 相对于清单所在目录。图集和位图字体描述文件中的图片路径，相对于描述文件自身。照常在清单中声明资源；生成器追踪这些声明，并扫描皮肤目录下的全部 `.kui.xml`。

在应用目录中执行一次生成：

```sh
pnpm exec kurot-project --project .
```

默认清单是 `resource/resource.json`，皮肤扫描目录是 `resource/`，可选样式是 `resource/config/style.json`，输出目录是 `src/generated/kurot/`。指定其他清单时，资源与样式默认目录会跟随清单位置。

Kurot CLI 游戏项目使用 `default.res.json` 时：

```sh
pnpm exec kurot-project --project . \
  --manifest resource/default.res.json \
  --skins resource/ui \
  --output src/generated/kurot
```

## 开发时自动监听

只运行生成器并监听：

```sh
pnpm exec kurot-project --project . --watch
```

也可以让生成器和开发服务器一起运行：

```sh
pnpm exec kurot-project --project . --watch -- expo start --dev-client
```

在 Expo 应用的 `package.json` 中添加：

```json
{
  "scripts": {
    "generate:project": "kurot-project --project .",
    "watch:project": "kurot-project --project . --watch",
    "start": "kurot-project --project . --watch -- expo start",
    "android": "kurot-project --project . --watch -- expo run:android",
    "ios": "kurot-project --project . --watch -- expo run:ios"
  }
}
```

此后执行 `pnpm start --dev-client` 即可生成入口并启动 Expo。保存清单、图片、图集描述、文本、KUI 或项目样式后会自动重新生成。新增、移动和删除皮肤时，静态导入、工厂注册和主题同步更新。清单引用的资源目录外本地文件也会被监听。

Watcher 会短暂等待写入稳定，合并连续保存，并串行执行生成任务。无效输入会输出错误并保留上次成功产物，修复后自动继续。生成文件和临时目录不会触发自身生成。

`--` 后的命令在项目目录中运行，首次生成成功后启动，共用终端和环境变量，后续保存不会重启该命令。命令退出时关闭 watcher 并传递退出码；Ctrl+C 或 SIGTERM 会关闭 watcher 并停止命令。直接执行 Expo 时，需要另开终端运行 watcher。

## 使用生成产物

生成器输出以下文件：

| 产物 | 用途 |
| --- | --- |
| `assets.ts` | `bundledAssets`、`resourceConfigURL`、`resourceRoot` 和 `remoteURLs` |
| `skins/**/*.ts` | 每个 KUI 对应的编译工厂，保留相对路径 |
| `skins.ts` | 静态导入、`skinFactories`、`theme`、`themeConfigURL` 和 `registerSkinFactories()` |
| `theme.json` | 组件到皮肤的主题映射及皮肤模块引用 |
| `index.ts` | 统一导出资源和皮肤入口 |
| `.kurot-project.json` | 生成目录所有权及输出文件清单 |

在应用运行时代码中导入生成入口：

```ts
import {
    bundledAssets, resourceConfigURL, resourceRoot,
    skinFactories, theme, themeConfigURL, registerSkinFactories,
} from './generated/kurot';
```

将这些值接到宿主适配器中：

1. 将 `bundledAssets` 注册到宿主资源加载器。JSON/文本条目包含值，图片/文件条目包含打包器引用。加载器负责把这些条目转换为平台的文本和图片加载合约。
2. 安装加载器后，使用 `resourceConfigURL` 和 `resourceRoot` 调用 Kurot 的 `Resource.loadConfig()`。资源名称、分组和 subkeys 保留项目原来的定义。
3. 调用 `registerSkinFactories()` 并保留返回的恢复回调。默认在 `globalThis` 上按完整类名注册，也可以传入自己的 `Record<string, unknown>`。使用独立工厂查找机制的宿主也可直接消费 `skinFactories`。
4. 通过宿主主题适配器提供 `theme`，以 `themeConfigURL` 作为逻辑配置 URL。静态模块加载器可以在请求 `theme.skinsJs` 时注册工厂。宿主会话销毁时恢复原注册。

Demo 的 `src/resources/bundled.ts` 和 `src/ui/native-ui.ts` 实现了这些连接，原生加载器位于 `src/skia/`。新建原生应用还需要运行时适配器和渲染器；生成模块本身不会安装它们或启动引擎。

生成的皮肤模块导入 `@kurot/core` 和 `@kurot/ui`，由宿主提供这两个包。Demo 已验证的基线是 Core 2.5.3 和 UI 3.5.0。生成器本身没有 Core/UI 运行时依赖或 peer。

### 主题映射

皮肤完整类名的最后一段，若为内置组件名加 `Skin`，就会成为该组件的默认皮肤。例如 `skins.ButtonSkin` 自动映射到 `Button`。其他皮肤同样按完整类名编译和注册，可通过显式 `skinName` 使用。

需要选择默认皮肤或映射自定义 host key 时，可以提供 JSON：

```json
{ "Button": "alternate.ButtonSkin" }
```

```sh
pnpm exec kurot-project --project . --theme-map config/theme-map.json --watch
```

映射中的类必须存在于扫描到的 KUI 中。重复的完整类名和不明确的默认皮肤会报错。映射文件在每次生成时重新读取。

## 工作原理

```mermaid
flowchart LR
    A["resource.json 与本地资源"] --> G["kurot-project · Node"]
    B["KUI XML 与 style.json"] --> G
    G --> E["生成的 TypeScript 入口"]
    E --> M["Metro / ESM 打包器"]
    M --> H["宿主资源与主题适配器"]
    H --> K["Kurot UI 与显示树"]
    K --> S["Skia 渲染器 · Demo"]
```

生成器校验资源声明、收集本地依赖，再使用固定版本的 Kurot CLI 编译全部 KUI。项目样式在编译时解析 Label 预设和颜色引用。原始清单、资源名、分组、object subkeys、XML、九宫格和图集 resolution 都被保留。

JSON 和文本内嵌到 TypeScript。图片与音频产生静态引用：`--assets metro` 输出字面量 `require(...)` 和无扩展名皮肤导入；`--assets url` 输出 `new URL(..., import.meta.url).href` 和 `.js` 皮肤导入。打包器需要支持所选模式，并编译生成的 TypeScript。两种模式都不复制源资源。

全部输入校验和编译成功后，才替换归生成器所有的输出目录。删除皮肤后不会留下旧工厂。缺失资源、无效 KUI 或输出目录中未登记的文件会使生成失败，并保留此前结果。手写代码应放在生成目录之外。

手机消费的是已打包的代码和资源，因此运行时无需解析 KUI XML 或动态发现主题模块。资源缓存、图片解码、主题应用和渲染仍由宿主负责。

## CLI 参数

| 参数 | 默认值或含义 |
| --- | --- |
| `--project <dir>` | 当前目录，作为项目根目录 |
| `--manifest <file>` | `resource/resource.json` |
| `--skins <dir>` | 清单所在目录，递归扫描 `.kui.xml` |
| `--style <file>` | `<清单目录>/config/style.json`，未显式指定时可缺省 |
| `--output <dir>` | `src/generated/kurot` |
| `--assets metro\|url` | `metro`，决定资源引用和导入方式 |
| `--theme-map <file>` | 可选的 host key 到皮肤完整类名的 JSON 对象 |
| `--watch`、`-w` | 初次生成后持续监听 |
| `--help`、`-h` | 显示命令帮助 |

清单、皮肤、样式和输出路径相对于 `--project`，并且必须位于项目内部。`--theme-map` 相对于命令执行目录。在满足相同约束时也可使用绝对路径。`-- <command> <args...>` 仅能与 `--watch` 一起使用。

## 构建脚本 API

在 Node 构建脚本中从 `@kurot/skia/project` 导入 API；应用运行时代码导入生成文件。

```ts
import { generateProject } from '@kurot/skia/project';

const result = await generateProject({
    projectRoot: '/path/to/game',
    manifest: 'resource/resource.json',
    outputDir: 'src/generated/kurot',
    assetMode: 'metro',
});
console.info(result.outputDir, result.assets, result.skins);
```

`ProjectOptions` 还支持 `skinsDir`、`styleSheet`，以及二选一的 `themeSkins`（host 到类名的映射）或 `themeMapFile`（JSON 文件）。API 路径均相对于 `projectRoot`，包括 `themeMapFile`。`ProjectResult` 提供 `outputDir`、`resourceConfigURL`、`assets`、`remoteURLs`、`skins` 和 `files`；资源 URL 是相对于项目的逻辑路径，输出文件路径相对于输出目录。

持续运行的构建脚本可以这样写：

```ts
import { watchProject } from '@kurot/skia/project';

const stopped = new Promise<void>(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
});
const watcher = await watchProject({ projectRoot: '/path/to/game' }, {
    debounceMs: 100,
    onGenerated: result => console.info(result.outputDir),
    onError: error => console.error(error.message),
});
await stopped;
await watcher.close();
```

`watchProject()` 执行初次生成后返回 `ProjectWatcher`。生成失败会调用 `onError` 并继续监听，包括初次输入无效的情况；成功时调用 `onGenerated`。`close()` 可重复调用，会取消计划中的任务，并等待当前任务完成。API 调用者负责信号和开发服务器生命周期；CLI 已内置这些处理。

## 支持范围与限制

生成器识别 `image`、`sheet`、`json`、`text`、`font` 和 `sound`。这里的 `font` 指位图字体描述文件及其图片页；音频输出为 `file` 条目。本地资源 URL 必须是没有查询参数、片段或反斜杠的普通路径，且解析后位于项目内部。扫描皮肤目录时拒绝符号链接和特殊文件。

远程 URL 保留给运行时加载，不会下载或监听，也不会发现远程图集/字体描述文件中的依赖。未知资源类型和未知 KUI 组件命名空间需要明确增加构建时支持。

资源生成不会自动提供全部资源类型的平台渲染能力。Demo 目前没有位图字体/音频运行时集成或打包字体注册，`style.json` 仅用于编译。其 UI 运行时验证主要覆盖 Label 和 Button；编译出其他皮肤不代表已完成所有控件的原生适配。

编译语义来自固定版本的 `@kurot/cli` 3.6.0 和 `@kurot/ui-document` 0.13.1。内部编译器导入隔离在 `src/kurot/compiler.ts`，升级 CLI 时需要重新验证。

## 开发库项目

```sh
pnpm build
pnpm test
```

测试覆盖资源发现、KUI 编译、静态工厂注册与恢复、确定性输出、旧文件清理、失败处理，以及 watcher/开发命令生命周期。实现直接位于 `src/kurot/`。
