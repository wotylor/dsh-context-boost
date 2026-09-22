# dsh-context-boost

为 DeepSeek Harness 扩展**单个对话上下文容量**的插件。

DeepSeek Harness 默认把每个模型的上下文窗口解析为
`llm-deepseek` 设置段里的 `models[].contextWindow`（模型级）或
`defaultContextWindow`（兜底），出厂默认 **1e6（1M token）**。
本插件不改任何应用代码，只通过官方设置服务把你想填的值写进该命名空间，
从而让对话能携带更大的上下文。

## 安装

### 方式一：从 GitHub 安装（推荐，发布到 GitHub 后）

```
dsh plugin --profile web add "github:<你的用户名>/dsh-context-boost"
```

- 需要指定分支/标签时追加 `#`：`github:<用户>/dsh-context-boost#main`
- 命令会自动把 `dsh-context-boost` 写入 profile 的 `dependencies` 与
  `dsh.profile.bundles`，并在 `node_modules` 下建立链接——无需手工改动。
- 仓库根目录需包含 `package.json`（含 `dsh.bundle.patch` 声明）、
  `cordis.patch.yml` 和 `lib/`。本插件为纯 JS、无构建步骤，克隆即用。

### 方式二：本地 link 安装（未发布时）

```
dsh plugin --profile web add "link:D:/Deepseek-Harness/DEEPSE~1/resources/plugins/dsh-context-boost"
```

路径含空格时 pnpm 会解析失败，因此使用 Windows 8.3 短路径
（`DEEPSE~1` 是 `Deepseek Harness Desktop` 的短名）。

> 其他 profile 同理：把 `web` 换成 `tauri` 等即可。
> 与内置插件的挂载方式一致：profile 通过依赖引用 `resources` 下的包，
> `dsh.bundle.patch` 声明 patch 层，`dsh plugin add` 自动完成 reconcile。

## 使用：随意填写

创建配置文件 `%USERPROFILE%\.dsh\dsh-context-boost.json`：

```json
{
  "enabled": true,
  "contextWindow": 4000000,
  "maxTokens": 262144,
  "models": {
    "deepseek-flash": 8000000
  }
}
```

| 字段 | 含义 | 默认 |
| --- | --- | --- |
| `enabled` | 总开关 | `true` |
| `contextWindow` | 应用到所有模型的上下文容量（token） | 不修改 |
| `maxTokens` | 单次请求最大输出 token 数（可选） | 不修改 |
| `models` | 按模型 id 单独覆盖（可选，优先于 `contextWindow`） | 无 |

- 值必须是正整数；未填的字段保持原设置不动。
- 文件优先于插件 patch 里的 `config`。
- 插件每 5 秒轮询一次该文件，改动后**自动热生效**，无需重启。

## 验证

启动后看服务日志，出现类似输出即成功：

```
[dsh-context-boost] applied contextWindow=4000000 maxTokens=262144 (4 models) -> llm-deepseek
```

也可以在 `%USERPROFILE%\.dsh\settings.yaml` 里确认
`llm-deepseek.defaultContextWindow` 与各模型 `contextWindow` 已变为目标值。

## 卸载

1. 用官方命令移除（以 web profile 为例）：
   ```
   dsh plugin --profile web remove dsh-context-boost
   ```
   （或从 `%USERPROFILE%\.dsh\profiles\web\package.json` 的
   `dependencies` 与 `dsh.profile.bundles` 中手动移除，再删除
   `node_modules\dsh-context-boost` 链接。）
2. （可选）删除 `%USERPROFILE%\.dsh\dsh-context-boost.json`，并手动把
   `settings.yaml` 中 `llm-deepseek` 段的数值改回。

## 注意事项

- 把 `contextWindow` 调大只是让 Harness **允许**更大上下文；模型 API 侧若
  存在真实上限，超出时仍可能报错，请以官方模型规格为准。
- 修改的是 `llm-deepseek` 设置段，若你同时用设置面板改动模型，两者会
  合并，本插件只写入它负责的字段。

## 许可证

MIT
