# UIKit 启动与本地 SDK 联调契约（IM Demo / websdk2 source link / Vite 热更新）

> 命中本 skill 时，先说一句：**本次命中 skill: uikit-local-sdk-debugging**。

## 触发词

- `启动 UIKit` / `启动 IM demo` / `跑 IM 应用` / `pnpm dev:demo`
- `本地 SDK` / `调试 SDK` / `websdk2 联调` / `源码联调`
- `link:../websdk2` / `pnpm overrides` / `SDK 热更新`
- `Identifier 'h' has already been declared` / `outside of Vite serving allow list`
- `恢复 npm SDK` / `取消本地 SDK` / `切回线上 SDK`

## 目标

把 IM UIKit Demo 启动和同级 `websdk2` 源码联调串成一个可验证闭环，避免：

1. 把源码联调误做成 tgz 快照联调，SDK 修改后不生效；
2. 只链接 SDK 包却不运行 SDK watch build，误以为 link 会直接读取 `src`；
3. Vite 扫描仓库外 SDK 产物，自动注入 Vue `h` 并与 SDK 压缩变量重名；
4. 配置 `server.fs.allow` 后漏掉 UIKit 仓库根，导致源码模块 403；
5. 用 `sdk:use-npm` 恢复 `link:` override，实际仍在使用本地 SDK；
6. 把个人机器路径和本地 override 提交到仓库。

## 1. 先判定联调模式

本仓库有三种 SDK 引入方式：

- **npm 模式**：生产默认，子包依赖保持 `easemob-websdk: ^5.0.0`；
- **tgz 模式**：根目录固定 tgz 快照，使用 `pnpm sdk:use-tgz`；
- **source-link 模式**：根 `pnpm.overrides.easemob-websdk` 指向
  `link:../websdk2`，配合 SDK watch build；本 skill 处理这一模式。

源码热联调**不使用** `pnpm sdk:use-tgz`。`scripts/switch-sdk.mjs` 只识别固定 tgz
override，不识别 `link:`；因此 `pnpm sdk:status` 可能把 source-link 误报为 npm，
`pnpm sdk:use-npm` 也不会删除 `link:`。

开始前确认：

- UIKit 仓库：`/Users/stwang/Desktop/work/easemob-uikit-vue`；
- SDK 仓库默认位于同级：`/Users/stwang/Desktop/work/websdk2`；
- SDK `package.json` 的包名是 `easemob-websdk`；
- SDK exports 指向 `dist`，不是 `src`。

路径不同时必须按实际目录计算相对路径，并同步调整 demo Vite 的 `localSdkRoot`。

完整 source-link 联调按 **§3 配置 link → §4 配置 Vite → §5 先启动 SDK watcher、
再启动 demo → §6 验证** 的顺序执行。§2 只描述不联调本地 SDK 时的普通启动。

## 2. 普通启动 IM UIKit Demo

在 UIKit 仓库执行：

```bash
pnpm install
pnpm dev:demo
```

默认地址通常为 `http://localhost:5173/`，以 Vite 输出为准。

若首次启动报 `packages/uikit-im/dist/theme/index.css` 或 core theme 不存在，先生成主题
产物，再重启 demo：

```bash
pnpm -F @easemob-community/uikit-core exec vite build
pnpm -F @easemob-community/uikit-im exec vite build
pnpm dev:demo
```

demo 运行时 alias 直连 UIKit 源码，改 `packages/uikit-im/src` 会热更新；但
`@easemob-community/uikit-im/theme` 仍可能引用构建产物。公开 API 类型验证另见
`uikit-demo-development` 与 `uikit-release-build`。

## 3. 建立 websdk2 source link

根 `package.json` 添加或合并以下本地配置：

```json
{
  "pnpm": {
    "overrides": {
      "easemob-websdk": "link:../websdk2"
    }
  }
}
```

然后在 UIKit 仓库重新安装：

```bash
pnpm install
```

不要修改各子包的 `easemob-websdk` 版本声明。override 只匹配
`easemob-websdk`，不会替换 webim4 使用的 npm alias `easemob-websdk-4`。

## 4. 配置 demo Vite 监听仓库外 SDK

检查 `apps/demo/vite.config.ts`；缺少时补齐以下四组配置：

1. `localSdkRoot = resolve(__dirname, '../../../websdk2')`；
2. `optimizeDeps.exclude` 包含 `easemob-websdk`；
3. `server.watch.ignored` 保留 `.git` / `node_modules` 默认忽略，并放行 SDK link 与真实目录；
4. `server.fs.allow` 同时包含 UIKit 仓库根和 `localSdkRoot`。

`server.fs.allow` 会替换 Vite 默认名单，不能只写 `localSdkRoot`：

```ts
server: {
  watch: {
    ignored: [
      '**/.git/**',
      '**/node_modules/**',
      '!**/node_modules/easemob-websdk/**',
      `!${localSdkRoot}/**`,
    ],
  },
  fs: {
    allow: [resolve(__dirname, '../..'), localSdkRoot],
  },
},
optimizeDeps: {
  exclude: ['easemob-websdk'],
},
```

`unplugin-auto-import` 的 `exclude` 传入后会替换插件默认值，必须同时保留
`node_modules`、`.git` 和 `websdk2`：

```ts
AutoImport({
  imports: ['vue'],
  dts: true,
  exclude: [
    /[\\/]node_modules[\\/]/,
    /[\\/]\.git[\\/]/,
    /[\\/]websdk2[\\/]/,
  ],
})
```

否则本地 SDK 的压缩产物可能被注入 `import { h } from 'vue'`，与产物内部 `const h`
冲突，浏览器报 `Identifier 'h' has already been declared`。

修改 Vite 配置后必须重启 demo；普通 SDK `dist` 更新可由 watcher 触发刷新。

## 5. 两个终端组成联调闭环

终端一在 SDK 仓库持续构建 `dist`：

```bash
cd /Users/stwang/Desktop/work/websdk2
npm install
npm run dev
```

终端二在 UIKit 仓库启动 demo：

```bash
cd /Users/stwang/Desktop/work/easemob-uikit-vue
pnpm dev:demo
```

实际链路：

```text
websdk2/src 修改
→ npm run dev 重建 websdk2/dist
→ demo Vite 监听到 dist 变化
→ 浏览器 HMR 或页面刷新
```

`npm run dev` 通常只 watch JS 构建，不持续生成 `.d.ts`。修改 SDK 公开类型后按 SDK
仓库现有脚本执行 `npm run build:types`，或执行一次完整 `npm run build`。

连接初始化、事件注册、WebSocket 生命周期相关改动不能只依赖 HMR，应硬刷新并重新登录。
demo 需选择 5.x/websdk5；若本地存储恢复成 4.x，当前 websdk2 改动不会进入运行链路。

## 6. 验证实际使用本地 SDK

先验证 pnpm link 的真实路径：

```bash
node -e "console.log(require('fs').realpathSync('apps/demo/node_modules/easemob-websdk'))"
```

预期输出 `/Users/stwang/Desktop/work/websdk2`。不要用
`require('easemob-websdk/package.json')`，SDK exports 未开放 `package.json` 子路径。

再验证：

- SDK watcher 修改源码后出现重新构建成功；
- demo 页面和关键模块 HTTP 200；
- 浏览器 DevTools → Network/Sources 中搜索 `websdk2`，确认 SDK 模块来自
  `/@fs/.../websdk2/dist/`，不是 `.pnpm/easemob-websdk@...`；
- 修改一个可观测日志或行为后生效；
- 页面仍使用 websdk5 adapter。

如果配置正确但依赖预构建缓存未刷新，停止 demo 后用以下命令重启：

```bash
pnpm dev:demo -- --force
```

## 7. 常见故障定位

### `Identifier 'h' has already been declared`

检查 Vite 返回的 SDK chunk 顶部是否被 AutoImport 注入 Vue `h`。修复
`AutoImport.exclude`，保留三个排除项，重启 demo 并硬刷新。

### `outside of Vite serving allow list`

检查 `server.fs.allow` 是否同时包含 `resolve(__dirname, '../..')` 和
`localSdkRoot`。只允许 SDK 会把 UIKit 自己的源码挡掉。

### SDK 修改后不生效

依次确认：

1. SDK `npm run dev` 仍在运行；
2. `dist` 文件时间已更新；
3. link realpath 指向当前 SDK 仓库；
4. `optimizeDeps.exclude` 已排除 SDK；
5. demo 当前选择 websdk5；
6. 生命周期改动已硬刷新并重新登录。

### 类型检查提示 SDK 没有声明文件

source-link 的 watch build 未生成 `.d.ts` 时，这是本地 SDK 产物不完整，不应误判为
UIKit 业务代码错误。先在 SDK 仓库生成类型，再重新验证。

## 8. 恢复 npm 模式

1. 停止 SDK watcher 和 demo；
2. 手动删除根 `package.json` 的
   `pnpm.overrides.easemob-websdk = "link:../websdk2"`；
3. `overrides` 或 `pnpm` 变空时一并移除空对象；
4. 按开始联调前的 diff 恢复 `apps/demo/vite.config.ts`；若这些配置本来就是团队基线，
   不要机械删除；
5. 在 UIKit 仓库执行 `pnpm install`；
6. 验证 realpath 不再指向 `/Users/stwang/Desktop/work/websdk2`；
7. 用 `pnpm dev:demo -- --force` 重启。

不要只执行 `pnpm sdk:use-npm`：当前脚本无法识别和删除 `link:` override。

## 硬规则 vs 软约定

**硬规则：**

- source-link 模式必须同时运行 SDK watch build 与 UIKit demo。
- `server.fs.allow` 必须保留 UIKit 仓库根；AutoImport exclude 必须保留插件默认排除项。
- 不得把个人绝对路径、`link:` override 或本地调试专用 Vite 配置提交到共享分支。
- 恢复 npm 必须手动移除 `link:` 并重新 `pnpm install`，不能只跑 `sdk:use-npm`。
- 验证依赖必须看 realpath，不能只信 `sdk:status`。

**软约定：**

- SDK 与 UIKit 仓库保持同级，使用稳定相对路径 `link:../websdk2`。
- 改 SDK 生命周期代码后优先硬刷新并重新登录，避免 HMR 状态污染判断。
- 需要长期共享 source-link 流程时，应扩展切换脚本，不要继续复制个人配置。

## 已知漂移（改到相关文件时注意）

- `scripts/switch-sdk.mjs` 目前只有 npm / 固定 tgz 两种识别结果，source-link 会显示为 npm。
- `apps/demo/vite.config.ts` 的 `localSdkRoot` 默认按同级 `websdk2` 计算；目录布局变化后需同步修改。
- websdk2 的 package 版本可能与 UIKit 声明的 `^5.0.0` 不同；source-link 会绕过常规版本选择，
  这是本地开发行为，发布前必须恢复 npm。
- 本流程未单独登记 TECH-DEBT；若要把 source-link 正式产品化，应先登记切换脚本与配置参数化债务。

## 反面清单

- ❌ 用 `sdk:use-tgz` 做源码热联调——tgz 是静态快照，SDK 修改不会自动进入 UIKit。
- ❌ 只加 `link:` 不跑 SDK watcher——包入口读取旧 `dist`。
- ❌ `server.fs.allow` 只放行 websdk2——UIKit 源码请求被 Vite 403。
- ❌ AutoImport exclude 只写 websdk2——默认 node_modules / .git 排除被覆盖。
- ❌ 看到 `sdk:status` 显示 npm 就认为 link 已解除——脚本不识别 source-link。
- ❌ 直接 `require('easemob-websdk/package.json')` 查版本——exports 会拒绝该子路径。
- ❌ 生命周期改动只等 HMR——旧连接和事件监听可能继续存活。
- ❌ 提交根 override 或个人路径——污染其他开发者安装与发布环境。
