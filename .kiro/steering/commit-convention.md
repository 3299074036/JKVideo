---
inclusion: always
---

# 提交规范（Conventional Commits）

所有 git commit 必须遵循以下格式：

```
<type>(<scope>): <描述>

[可选正文]
```

## 类型说明

| 类型 | 含义 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构（不改变功能） |
| docs | 文档更新 |
| chore | 构建脚本、依赖更新等 |
| style | 代码格式（不影响逻辑） |
| perf | 性能优化 |

## 示例

```
feat(danmaku): 添加弹幕字体大小设置
fix(player): 修复 DASH MPD 解析在 Android 12 上崩溃的问题
docs: 更新 README 快速开始步骤
```
