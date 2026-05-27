# Dashboard _review.md 渲染规格

dashboard 需要识别 `_review.md` 并渲染为审查报告视图。

## 文件识别

- 搜索 `plans/` 目录下的 `_review.md`
- 归入"审查文档"分组
- 新增"审查" tab (`data-tab="review"`)

## 解析规则

### 轮次标题

```
## Round <N> — <状态标记>
```

| 状态标记 | 含义 | 渲染 |
|----------|------|------|
| `✅ Converged` | 已收敛 | 绿色标签 |
| `⚠️ Max rounds` | 达到上限 | 橙色标签 |
| 无标记 | 仍有问题 | 默认 |

### 轮次元数据

```
> reviewed_at: <时间>
> files: <文件数>
> findings: <N> | resolved: <N> | advisory: <N>
> simplify: <N>
```

渲染为轮次头部统计卡片。

### 问题条目

Open 区域：

```
- [<severity>] <file>:<line> — <title>
  原因: <why>
  修复方案: <how>
  来源: <agent>
```

Resolved 区域：

```
- [<severity>→✅] <file>:<line> — <title>
  修复: <applied>
  简化: <status>
```

### 🟡 分析追加区块

cr-insight 追加的 3 个引用块：

```
> **🔍 原因分析**
> ...

> **🔧 修改方案**
> ...

> **📐 一致性评估**
> ...
```

渲染为可折叠的详情面板，仅在 🟡 Advisory 条目下显示。

### Header

```
# Code Review Report

> scope: <范围>
> generated: <时间>
> last_updated: <时间>
```

渲染为报告概览信息。

## 概览 tab 集成

在 pipeline phases 中新增"审查"阶段：

```
{ name: 'review', label: '审查', test: (n) => n === '_review.md' || n.endsWith('/_review.md') }
```

文档分组中新增"审查文档"：

```
{ title: '审查文档', test: (n) => n === '_review.md' || n.endsWith('/_review.md') }
```
