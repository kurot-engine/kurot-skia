# Kurot Skia：适配与测试计划

更新日期：2026-10-11。0.1.4 准备发布，收入原生渲染组织调整和保留场景的回调更新；0.1.3 已发布原生特性补全和可选的共享 Spine 动画缓存。完整能力矩阵、原生测试和性能结果见 [native-feature-assessment.md](native-feature-assessment.md)，缓存测量见 [native-spine-shared-cache.md](native-spine-shared-cache.md)。发布和 Demo 的 npm 采用需要单独检查；历史测试数据保留实际测试版本和构建摘要。

本文件记录当前能力、需要验证的假设和后续适配候选，不代表已经承诺支持全部功能。实际完成情况以测试结果和代码为准。

## 0.1.2 迁移基线（历史验收）

- 已将 Demo 的 SkiaRenderer、KurotView、Graphics、动态文字和纹理适配迁入库。
- 已将它们依赖的触摸、资源、字体测量、分词及主题平台接口一起迁入库。
- 由库提供 Metro 配置入口，统一选择原生 Core 模块及平台接口，避免应用复制内部路径规则。
- 保留 Node 的 `@kurot/skia/generator` 生成器入口；原生应用的运行时入口不引入 Node、KUI 编译器或 watcher。
- Demo 保留场景、生成资源、主题初始化和原生集成测试，使用 npm 0.1.2；源码修复在独立的本地包安装中验证。
- 暂时绑定已经验证的 Core 2.5.3、UI 3.5.0 和 React Native Skia 3.3.0。Core 的内部模块边界还不是正式的跨平台 SDK 合约，升级必须重新验证。

验收结果（2026-10-11）：库构建及 24 项 Node 测试通过；Demo 类型检查通过，lint 无错误（旧测试导入有 14 项重复导入警告）。Android API 36 的 Small_Phone 模拟器已完成 adapter、resource、TextField 和 UI/KUI 测试。iPhone SE 3（iOS 18.2）与 iPhone 17 Pro（iOS 26.5）完成既有原生测试及新增 48 项真实 GPU 九宫格测试。旧 npm 0.1.0 可复现接缝透明度损失；已发布 0.1.1 用 shader 修复，0.1.2 源码改用原生 drawImageNine 和源像素子图缓存，同一组 48 项用例不作修改即通过，覆盖分数变换、旋转/翻转、alpha、过滤、密度、trim、退化边框及原始 KUI 状态。新增缓存复用、状态切换、逐帧淘汰和销毁检查通过。首次复制源像素避免 GPU 中间图的 8 位预乘舍入误差；分割线需要整数物理像素，非整数显式报错。Android GPU 回归与 Release 真机性能仍待验证。Metro sourcemap 已确认运行时不包含生成器、编译器或 watcher；独立 tarball 安装的生成、类型检查、lint 和 Android export 已通过。迁移不增加下述未支持能力。

## 0.1.2 功能适配清单（历史基线）

| 能力 | 当前范围 | 后续适配或验证 |
| --- | --- | --- |
| 显示树与变换 | 基本层级、矩阵、anchor、alpha、排序、矩形裁剪 | 嵌套/旋转裁剪、居中翻转、负缩放、skew、极端变换与 Web 输出比较 |
| Bitmap / 图集 | 未旋转图集、scale、九宫格、纹理 density；iOS GPU 接缝、分数变换、透明度、trim 和边框退化已验证 | Android GPU 回归、rotated atlas、repeat、clip、tint、pixelHitTest、任意小数物理分割线、外边缘 AA 对比、宽色域/HDR 子图、更多跨密度像素边界 |
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

## 本次源码补全

原生 Bitmap 扩展、Mesh、BitmapText、粒子、缓存、内置滤镜、混合模式、渐变/虚线、RenderTexture、字体和输入桥已实现。发布版 Game、Spine 4.0–4.3、16 套原始皮肤及 5,000 条虚拟列表纳入独立原生测试。Node 生成器增加 Spine 多页图集与无损二进制资源，watch 跟踪新页面和二进制变更。动态字体测量采用最多 1,024 条短文本数值缓存，字体注册变更会清空；离屏显示缓存最多保留约 64 MiB RGBA 图像，单图上限 4096²。

DragonBones 的图像、旋转/trim 图集、加权/形变网格、嵌套骨架、动画事件和资源所有权已通过原生 GPU 检查；真实项目二进制/Surface 资源仍需专项验证。精灵批绘制仅用于完全不透明、至多 256² 物理像素的源帧，要求完整对象透明度及相同帧/tint/过滤方式；透明图与淡入淡出回退单张绘制，避免已复现的颜色舍入差异。粒子缓存旋转还原后的独立源帧，避免分数缩放采到相邻图集像素。首次复制/alpha 检查不计入预热后基准，需要单独测量。这里的实现不代表完整媒体、任意 WebGL Shader 或 Release 真机性能验收。原生输入桥的自动检查覆盖 UTF-16 选区、焦点、提交限制和拆卸；实际键盘/IME 与自定义字体编辑外观需要独立宿主验收。后续清单以评估报告的当前矩阵为准。

### 0.1.4 原生渲染组织调整

借鉴 Popkorn 的宿主、帧循环和绘制资源分工，拆出无原生运行时依赖的 NativeFrameLoop、管理 Graphite 上下文与录制事务的 NativeFrameRenderer，以及负责路径/画笔缓存与命中的 NativeGraphicsRenderer。KurotView 保留 RN 布局、场景、输入和前后台生命周期；SkiaRenderer 保留显示树、合成与图元派发。Core ticker 的持续绘制、现有合批、缓存预算和绘制语义保持原样，模块职责见 [native-runtime.md](native-runtime.md#internal-rendering-responsibilities)。

通知回调通过已提交的引用更新：替换 onStats/onError 保留场景，工厂或视口变化仍重建。调整后库构建、45 项 Node 测试、独立宿主类型检查和零警告 lint 通过；重新构建的 iOS 26.5 Release 模拟器宿主通过完整功能/GPU 套件、18 个性能场景和三轮回调替换、输入与卸载检查。下述多平台性能基线保留原始测试身份；本次组织调整的原生复测覆盖 iOS 26.5。

## 性能验证

本次源码验收：库构建、35/35 Node 测试、独立宿主类型检查和零警告 lint、iOS/Android 生产 JS 导出均通过。独立 iOS 模拟器 Release 与 Android arm64-v8a Release 测试包已编译安装；iOS 26.5、iOS 18.2 和 Android API 36 在 Release 客户端完成整套功能/像素检查、每平台 16 个预热后性能场景，以及 3 次实际 RN 视图焦点切换/卸载，不需要 Metro。48 个既有 GPU 九宫格用例未修改；新增 24 个 Bitmap 组合、4 个粒子图集边缘对照，以及独立 RenderTexture 抓图后主渲染器更新 Graphics、缓存容器和 Mesh 的像素回归；抓图不再消耗主画面的待更新标记。此前的未签名 iPhoneOS Release 编译也通过，未安装真机。

最终 Release 数据替换此前 Debug 原生客户端的诊断。在 M1 Max 上的两种 iOS 模拟环境里，16 套 UI gallery 的 p95 总耗时约 6.9–7.2 ms，5,000 条虚拟列表约 8.2–8.6 ms，100 个序列帧对象约 6.0–6.6 ms，1,000 个同帧不透明精灵约 8.5–8.9 ms。持续变化的 100 个文字对象约 13.8–14.0 ms，5,000 个粒子约 11.7–11.8 ms，p95 在预算内，仍不能保证每帧达标。

Spine 渲染在 Skia 层增加连续 Mesh 合批、JS 点存储复用和完全相同几何数据的原生缓冲共享。原有 20 个同步动画 Spineboy 保持每个角色独立更新，绘制操作从 360 降到 20，p95 从 25.3–26.6 ms 降到 13.1–13.2 ms。新增错开相位的场景约 16.9 ms，仍略超预算；同步场景的 p99 约 19.4–21.0 ms，也不能宣称稳定 60 FPS。Android 软件 Vulkan 的原有 20 角色从 36.06 ms 降到 18.24 ms，错开相位为 23.22 ms；千精灵、大量粒子和变化文字仍超预算。真实手机 GPU 效率不能从软件模拟推断。

原有 15 个基准的人数、分辨率和更新方式均未调整。Mesh 合批及缓冲所有权新增 Node 与 GPU 像素回归，4 个 Spine 版本与单独绘制器对比通过；像素容差未放宽。前后数据和限制见 [Spine 优化报告](native-spine-optimization.md)。旧基线保留原始源代码/构建摘要；完整最新分布、构建摘要、环境和源代码指纹见 [测试数据](native-benchmarks-2026-10-11.json)及 [评估报告](native-feature-assessment.md)。首次输入框挂载/焦点切换仍有长尾。

这些通过项只证明所列功能及模拟环境诊断。用户已明确本轮只测模拟器，真机安装、签名及 Release 呈现帧率/内存/温升测试留待后续。Mac 解锁后，iOS 18.2 和 26.5 的实际屏幕键盘已验证拼音候选、密码/maxChars、选区替换、多行回车和焦点切换；18.2 另测限制提交及 emoji UTF-16 删除。详情见[键盘验收记录](native-input-acceptance.md)。Android 模拟器窗口无法被当前 UI 工具控制，真实键入/IME 仍未验证。音视频媒体后端、自定义 Shader、项目专用骨骼资源及编辑外观还需继续接入/验证。

先建立 Release 真机基线，再决定是否需要改变线程或渲染架构。当前 FPS 回调只统计帧录制/提交频率；GPU 呈现帧率和用户看到的掉帧需另行测量。

- 分开记录游戏 update、UI validation、显示树遍历、JSI 命令录制、原生提交和 GPU 执行耗时。
- 报告帧时间的 p50/p95/p99、超过 16.67 ms 的比例，以及呈现帧率；120 Hz 设备另外使用 8.33 ms 的预算。
- 记录 CPU/GPU 使用率、内存、纹理占用、GC、资源加载峰值，以及持续运行后的功耗、温升与降频。
- 场景按规模递增：静态 UI、移动 sprites、动态图集、频繁变化的文字、复杂 Graphics、大量 alpha 层、滚动列表及资源重复加载/卸载。
- 分别评估纯 update、纯绘制、综合场景，区分 JS 与 GPU 瓶颈。比较对象数量、实际绘制数量、分辨率和纹理大小。
- 原生九宫格子图缓存仍需测量首次像素复制/GPU 源读回延迟、缓存占用、实际上传频率及复用后的帧耗时，并与 0.1.1 shader 实现对比；不从 API 调用数量推断硬件性能。
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

1. 已完成：独立原生测试宿主的功能与 Release 模拟器验证，保留已知限制；npm Demo 未同步未发布源码。
2. 建立真机 Release 性能场景和基线报告，补齐呈现帧率与资源生命周期数据。
3. 补齐真实键盘/IME、媒体宿主、实际项目骨骼资源和自定义 UI 控件；每次适配附对应原生回归场景。
4. 根据真机与项目场景的测量继续优化合批、顶点构建、线程、离屏缓存与特效；Spine 不同相位和 p99 帧耗时仍需改善。

### Spine 原生后端候选（仅评估）

Skia 层先增加了可选的[共享动画缓存](native-spine-shared-cache.md)：按 60 Hz 预采样一个固定动作/皮肤，不同角色保留独立相位并共享不可变姿态和跨帧 SkVertices。原 SDK 实时 API 保持原样，缓存播放器不提供可变骨骼、混合或时间轴事件；需要这些能力时继续走实时路径。CPU 数值缓存与原生 LRU 有独立预算，预计算在加载阶段完成。单独的 Release 缓存基准保留原 16 个实时工作负载，不用降采样结果替换原始数据。

最终 Release 模拟器对照中，20 人错开相位的实时/缓存 p95 为 iOS 26.5 的 16.35/7.37 ms、iOS 18.2 的 17.70/7.85 ms、Android 软件 Vulkan 的 21.84/10.14 ms；缓存的 360 个采样帧均未超 16.67 ms。一次预采样约 32–35 ms，60 个姿态的数值数据约 1 MB，额外对象/原生存储/图集不计入该数字。三平台完整 GPU 套件及 40 个 Node 用例通过。该结果验证缓存模式的模拟器帧预算，不能替代真机持续 FPS、内存和热量测试；详细限制与完整分布见缓存文档和独立测量 JSON。

[原生后端评估](native-spine-backend-assessment.md) 建议先在独立测试宿主验证 Spine 4.2 C++ runtime 和批量顶点缓冲桥接。Core、资源格式和现有 JS 兼容路径保持不变。Android 现有 Skia 的底层几何符号没有动态导出，需先证明复用同一份 Skia 的扩展方式；若需 RN Skia 补丁，单独衡量其维护成本。常用播放 API、原始可变骨骼/Slot API 的兼容范围和原生帧调度分开验收。120 FPS 的 8.33 ms 目标尚无原生后端测量结果，不用现有 60 Hz 模拟器基准代替。

## 本地开发流程（已接入）

运行时在 `src/kurot`，生成器在 `src/generator`，Metro 入口在 `src/metro.cts`。Demo 的 `pnpm dev` 使用 npm 安装包，管理项目资源 watch 和 Expo。联合源码开发要选择明确声明本地 `file:` 依赖的应用，从库执行 `pnpm dev --project <应用目录> -- <命令>`；验证未发布修复时使用独立安装。成功构建才同步本地包；新增/删除模块也同步，生成器变化重启 watcher，Metro 配置变化重启服务器。npm 安装不会被同步覆盖。旧 `/project` 构建 API 改为 `/generator`，命令名仍为 `kurot-project`。

本次重组验收：24 项 Node 测试通过，包含初次编译失败后恢复、文件增删、硬链接隔离、生成器/Metro 重启、退出码及子进程清理。实际 Demo 的一键启动、库变更同步和错误恢复通过；Android 原生 adapter、resource、TextField 和 UI/KUI 集成测试通过。资源生成仍不提供已实例化 Texture/Skin 的原位热替换。
