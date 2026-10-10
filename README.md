# Kurot-Skia

私有库项目的起点，版本 `0.0.0`。当前实现的是 **Node 构建时项目入口生成器**；
RN/Skia 渲染、输入、资源端口和 UI 适配仍在相邻的 `Kurot-Skia-Demo`。
这里不依赖 React Native、Expo、Skia、Core 或 UI 运行时，也尚未发布 npm 包。

库实现直接放在 `src/kurot/`，沿用原引擎的目录习惯，不另设 `project` 子目录。
包入口 `@kurot/skia/project` 专供 Node 构建脚本使用，由 package.json 映射到
编译产物，与源码目录名无关。

## 开始

Node >=20，pnpm。

```sh
cd ~/Workspace/Kurot/Kurot-Skia
pnpm install
pnpm build
pnpm test
pnpm generate:demo
```

Demo 已消费生成结果。之后在 `../Kurot-Skia-Demo` 中执行 `pnpm start`、
`pnpm android`、`pnpm ios` 或 `pnpm test:native` 会先重新生成入口。
单独更新资源/皮肤时执行 `pnpm generate:project`。直接执行 `pnpm exec expo ...`
会绕过这个生成步骤，需要先手动运行生成命令。

## 输入与输出

默认读取 `resource/resource.json`，递归扫描其所在目录中的所有 `.kui.xml`，
并在存在时读取 `resource/config/style.json`。输出到 `src/generated/kurot/`：

| 文件 | 用途 |
| --- | --- |
| `assets.ts` | 静态资源表、清单 URL、资源根路径、远程 URL 列表 |
| `skins/**/*.ts` | 每份原始 KUI 的编译工厂，保留相对目录 |
| `skins.ts` | 全部皮肤的静态导入、完整类名工厂表、主题映射/URL、注册/恢复函数 |
| `theme.json` | 生成的主题配置 |
| `index.ts` | 项目统一入口 |
| `.kurot-project.json` | 生成目录的所有权与文件清单 |

原始资源名称、groups、subkeys、九宫格、图集 resolution 和 XML 不被改写。
JSON/文本内嵌到入口；图片与音频产生静态资源引用。图集的 `file` 和 bitmap-font
描述文件的图片依赖自动收集，不需要手工登记。修改 JSON/文本后也要重新生成。
远程资源保持原 URL，不在构建时下载或发现远程描述文件的依赖。

目前识别 Core 内置的 `image`、`sheet`、`json`、`text`、`font`、`sound` 六类资源。
`font` 在资源清单中指 bitmap-font 描述文件；音频以 `kind: "file"` 输出。
资源打包不等于原生解码/渲染支持：Demo 目前没有接入 bitmap-font、音频或
style.json 字体文件的注册。style.json 当前只参与编译期样式解析。

默认主题映射沿用 CLI 内置控件的 `<控件名>Skin` 命名约定。其他皮肤一样会编译并
注册完整类名，可以通过显式 `skinName` 使用。自定义 host 映射或默认皮肤重名时，
用 `--theme-map` 指定 `{ "Button": "alternate.ButtonSkin" }` 这样的 JSON 对象。
该映射文件相对于命令执行目录；其他路径参数相对于 `--project`。
当前尚未接入项目自定义组件命名空间发现，未知 KUI 组件会明确报错。

## 生成其他项目

```sh
node dist/kurot/cli.js --project ../MyGame

# CLI 游戏项目使用 default.res.json，可显式指定清单
node dist/kurot/cli.js --project ../MyGame \
  --manifest resource/default.res.json \
  --skins resource/ui \
  --output src/generated/kurot
```

默认 `--assets metro` 产生字面量 `require(...)` 和无扩展名的静态皮肤导入。
`--assets url` 产生 `new URL(..., import.meta.url).href` 与 `.js` ESM 导入，供
支持这些语义的构建器使用。输出都是 TypeScript，需要由宿主项目编译/打包；
这个选项不会实现某个平台的运行时资源加载器。

也可以从构建脚本调用 `@kurot/skia/project` 导出的 `generateProject`：

```ts
import { generateProject } from '@kurot/skia/project';

await generateProject({
    projectRoot: '/path/to/game',
    manifest: 'resource/resource.json',
    outputDir: 'src/generated/kurot',
});
```

当前 Demo 使用相邻目录的已构建 CLI；安装为本地构建依赖后可以使用上述包入口。
该 Node 入口应只出现在构建脚本中，不能导入 RN 应用运行时。

## 宿主消费

资源适配层将生成的 `bundledAssets` 交给自己的注册函数；UI 适配层消费
`theme`，调用 `registerSkinFactories()` 注册全部工厂并保留其恢复回调。
不需要逐个写资源路径、导入皮肤或维护完整类名注册表。

```ts
import { bundledAssets, resourceConfigURL, resourceRoot } from './generated/kurot/assets';
import { theme, themeConfigURL, registerSkinFactories } from './generated/kurot/skins';
```

生成入口不自动启动引擎或安装平台端口。Demo 的 `src/resources/bundled.ts` 和
`src/ui/native-ui.ts` 展示现有平台适配如何消费它。

## 实现边界与验证

使用固定的 registry CLI `3.6.0` 和 ui-document `0.13.1`，复用 KUI 编译器的
资源默认值、Label 预设、颜色与状态语义。CLI 尚无公开 compiler 子路径，暂时
在 `src/kurot/compiler.ts` 隔离内部路径引用；升级 CLI 时必须重新验证。
TypeScript AST 只补工厂返回类型和 Skin 动态字段类型，保留原编译器的字段赋值。
布局对象也能保留原来的注册方式，不受 `Skin.setPart` 的显示对象类型限制。

所有输入验证/编译成功后才替换生成目录；缺文件、未知组件、重复类名或模糊默认
映射会失败并保留旧输出。生成目录中发现未登记的文件也会拒绝覆盖；不要把
手写代码放进这个目录。删除源皮肤后，下一次生成会删除对应旧产物。

`pnpm test` 覆盖资源依赖、嵌套 KUI、原始状态/样式/九宫格、静态工厂注册与恢复、
确定性、陈旧文件清理、失败保留以及错误输入。另已用原引擎示例的全部 17 份 KUI
验证生成，包括 DefaultUISkin 和 16 份控件皮肤；编译支持不代表这些控件已完成 RN 适配。
