# Kurot Skia：适配与测试计划

更新日期：2026-10-11。版本：0.1.0 本地开发。

本文件记录当前能力、需要验证的假设和后续适配候选，不代表已经承诺支持全部功能。实际完成情况以测试结果和代码为准。

## 当前迁移范围（已完成）

- 已将 Demo 的 SkiaRenderer、KurotView、Graphics、动态文字和纹理适配迁入库。
- 已将它们依赖的触摸、资源、字体测量、分词及主题平台接口一起迁入库。
- 由库提供 Metro 配置入口，统一选择原生 Core 模块及平台接口，避免应用复制内部路径规则。
- 保留 Node 的 `@kurot/skia/generator` 生成器入口；原生应用的运行时入口不引入 Node、KUI 编译器或 watcher。
- Demo 保留场景、生成资源、主题初始化和原生集成测试，已改为通过安装的本地包使用库。
- 暂时绑定已经验证的 Core 2.5.3、UI 3.5.0 和 React Native Skia 3.3.0。Core 的内部模块边界还不是正式的跨平台 SDK 合约，升级必须重新验证。

验收结果（2026-10-11）：库构建通过，17 项 Node 测试通过，Demo 类型检查和 lint 通过；Android API 36 的 Small_Phone 模拟器完成 adapter、resource、TextField 和 UI/KUI 原生集成测试，普通 Demo 画布和按钮交互正常。Metro sourcemap 确认运行时只包含安装包的原生适配，不包含生成器、编译器或 watcher；tarball 包含原生代码、Metro helper 和文档。iOS、Release 真机性能及隔离 tarball 应用的端到端运行仍待验证。迁移不增加下述未支持能力。

## 功能适配清单

| 能力 | 当前范围 | 后续适配或验证 |
| --- | --- | --- |
| 显示树与变换 | 基本层级、矩阵、anchor、alpha、排序、矩形裁剪 | 嵌套/旋转裁剪、居中翻转、负缩放、skew、极端变换与 Web 输出比较 |
| Bitmap / 图集 | 未旋转图集、scale、九宫格、纹理 density | rotated atlas、repeat、clip、trim 组合、tint、pixelHitTest、跨密度像素边界 |
| Graphics | 基本路径、纯色填充、实线描边及命中 | 渐变、虚线、复杂曲线、填充规则与命中一致性 |
| TextField | 动态文字、系统字体 shaping、富文本运行、描边、对齐 | 中文/emoji/组合字符/RTL、换行和空行、字体 fallback、baseline 与 Web 的差异 |
| Label / Button | KUI 工厂、皮肤状态、Label 测量与 Button 交互 | multiline shrink、状态切换、disabled、异步字体就绪、主题切换与反复挂载 |
| 其他 UI | 可以编译 KUI，不代表全部控件已原生验证 | Group/layout、List/虚拟化、Scroller、Slider、Panel、输入控件，逐项建立交互用例 |
| BitmapText / BitmapLabel | 生成器可收集字体描述和图片 | glyph 绘制、kerning、基线、密度、行布局、资源销毁 |
| 原生文本输入 | 尚未适配 | RN 键盘、IME 中文输入、选区/光标、密码、焦点、滚动、键盘遮挡 |
| 遮罩与特效 | 普通 source-over；显示对象 mask/filter/cache 尚未适配 | 离屏 surface、alpha mask、混合模式、滤镜、多 pass、缓存失效和资源释放 |
| 资源 | Metro 内嵌 JSON/text、Skia 图片解码、URI 网络请求 | 网络失败/取消/重试、资源释放竞争、音频、打包字体、长列表资源回收 |
| 音视频 | 尚未提供平台媒体适配 | 播放/暂停、音频焦点、后台策略、音量、视频纹理及资源生命周期 |
| 触摸 | RN responder 转 Kurot TouchEvent | 多指、取消、舞台外释放、滚动冲突、手势、命中树、大尺寸缩放 |
| 游戏扩展 | 尚未逐项集成验证 | Tween/MovieClip、粒子、DragonBones/Spine、mesh 与资源共享 |

## 性能验证

先建立 Release 真机基线，再决定是否需要改变线程或渲染架构。当前 FPS 回调只统计帧录制/提交频率；GPU 呈现帧率和用户看到的掉帧需另行测量。

- 分开记录游戏 update、UI validation、显示树遍历、JSI 命令录制、原生提交和 GPU 执行耗时。
- 报告帧时间的 p50/p95/p99、超过 16.67 ms 的比例，以及呈现帧率；120 Hz 设备另外使用 8.33 ms 的预算。
- 记录 CPU/GPU 使用率、内存、纹理占用、GC、资源加载峰值，以及持续运行后的功耗、温升与降频。
- 场景按规模递增：静态 UI、移动 sprites、动态图集、频繁变化的文字、复杂 Graphics、大量 alpha 层、滚动列表及资源重复加载/卸载。
- 分别评估纯 update、纯绘制、综合场景，区分 JS 与 GPU 瓶颈。比较对象数量、实际绘制数量、分辨率和纹理大小。
- 优化候选包括裁剪不可见对象、减少临时分配、缓存文字/path、批量绘制、图集复用、离屏缓存，以及必要时在 worklet/原生代码中录制命令。每项需要前后对照数据。
- 若与 C++/Metal/Vulkan 或其他引擎对比，必须使用同一设备、同一视觉内容、同一分辨率和帧率目标；不预设“原生慢多少/快多少”的比例。

## 设备与生命周期矩阵

- Android / iOS：至少覆盖一台较旧设备和一台较新设备，记录 OS、GPU、驱动与 Skia 版本；模拟器结果与真机结果分别标注。
- Web/桌面作为后续候选分别评估宿主和打包方式；当前运行时及 Metro 路由只验证 Android/iOS。
- Graphite：Android Vulkan 与 iOS Metal 分别确认后端、资源上传及错误；不把某个平台测试结果当作另一个平台验证。
- 前后台切换、锁屏/解锁、窗口尺寸变化、旋转、Safe Area、屏幕密度、反复挂载与卸载。
- 场景创建失败、绘制失败、异步加载中销毁、主题模块注册恢复、输入取消与本地资源注册隔离。
- 明确单舞台限制：当前 Core ticker、Graphics 命中接口和 UI Theme 含全局状态；多 KurotView 并行使用需要单独设计与测试。
- 验证 Expo development build、Release 打包、离线启动，以及库 tarball 在无相邻源码目录的应用中安装后可运行。

## 库与 SDK 边界

- 原生入口依赖宿主提供的 Core、React、React Native 和 React Native Skia；UI 接入按需使用宿主 UI。避免第二份 Core 或不同实例的纹理/显示对象。
- Metro 配置需要组合应用已有 resolver。库负责自身的原生模块路由，应用负责业务模块和原生测试 App 的选择。
- Node-only 用户不需要安装原生运行时；所有原生 peers 按入口要求检查，运行时 bundle 不包含生成器依赖。
- 继续通过库内 Metro 映射和原生适配接入发布版 Core/UI，不修改 SDK 源码，也不以新增 Core 平台入口作为后续功能的前提。Core/UI 升级时，先验证内部模块映射、对象共享及原生回归场景，再扩大支持版本。
- Core 的 WebGPU 渲染后端设计单独推进；Skia 适配不预先定义 Core 的通用纹理、滤镜、离屏缓存或设备接口。只有具体功能无法在适配层实现时，再单独评估最小 SDK 改动。
- 字体、音频、输入、复杂 UI 和游戏扩展各自完成前，不宣称完整 Egret/Kurot 原生兼容。

## 后续执行顺序

1. 已完成：本次迁移及 Android Demo 集成验证，保留现有功能与已知限制。
2. 建立真机 Release 性能场景和基线报告，补齐呈现帧率与资源生命周期数据。
3. 按实际项目需要选择位图字体、输入、Bitmap 扩展或其他 UI 控件；每次适配附对应原生回归场景。
4. 再根据测量结果决定批量绘制、线程迁移、离屏缓存与特效实现。

## 本地开发流程（已接入）

运行时在 `src/kurot`，生成器在 `src/generator`，Metro 入口在 `src/metro.cts`。Demo 的 `pnpm dev` 同时管理库编译、安装包同步、资源 watch 和 Expo。成功构建才更新 Demo；新增/删除模块也同步，生成器变化重启 watcher，Metro 配置变化重启服务器。旧 `/project` 构建 API 改为 `/generator`，命令名仍为 `kurot-project`。

本次重组验收：24 项 Node 测试通过，包含初次编译失败后恢复、文件增删、硬链接隔离、生成器/Metro 重启、退出码及子进程清理。实际 Demo 的一键启动、库变更同步和错误恢复通过；Android 原生 adapter、resource、TextField 和 UI/KUI 集成测试通过。资源生成仍不提供已实例化 Texture/Skin 的原位热替换。
