# dsh-context-boost

为 DeepSeek Harness 扩展**单个对话上下文容量**的插件。

DeepSeek Harness 默认把每个模型的上下文窗口解析为
`llm-deepseek` 设置段里的 `models[].contextWindow`（模型级）或
`defaultContextWindow`（兜底），出厂默认 **1e6（1M token）**。
本插件不改任何应用代码，只通过官方设置服务把你想填的值写进该命名空间，
从而让对话能携带更大的上下文。

## 安装
```
dsh plugin --profile web add "github:wotylor/dsh-context-boost"
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

## 卸载
   ```
   dsh plugin --profile web remove dsh-context-boost
   ``` 
## 许可证

MIT
