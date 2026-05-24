# Report Writer 规格

`_review.md` 单文件管理规范。内部模块，由 review-engine Stage 4 调用。

## 输入数据结构

```yaml
# 必填
phase_dir: <string>           # _review.md 写入目标目录
round: <positive-int>         # 当前轮次号（从 1 开始）
scope: <string>               # 审查范围描述
findings_open:                # 本轮未修复问题列表
  - severity: <"🔴"|"🟠"|"🟡">
    file: <string>
    line: <positive-int>
    title: <string>
    reason: <string>
    fix: <string>
    source: <string>
    optimize_dim: <string>    # 可选，simplify 触发标记
findings_resolved:            # 本轮已修复的 🔴🟠
  - severity: <"🔴"|"🟠">
    file: <string>
    line: <positive-int>
    title: <string>
    fix_applied: <string>
    simplified: <boolean>
findings_advisory_new:        # 本轮新增的 🟡（仅首次出现）
  - file: <string>
    line: <positive-int>
    title: <string>
    reason: <string>
    suggestion: <string>
    source: <string>

# 可选
converged: <boolean>
max_rounds_reached: <boolean>
simplify_count: <positive-int>
```

## 输出文件格式

`<phase_dir>/_review.md`：

```markdown
# Code Review Report

> scope: <审查范围>
> generated: <首次生成时间 ISO 8601>
> last_updated: <最近更新时间 ISO 8601>

---

## Round <N> — <状态标记>

> reviewed_at: <时间 ISO 8601>
> files: <审查文件数>
> findings: <发现问题数> | resolved: <修复数> | advisory: <🟡数>
> simplify: <本轮 simplify 次数>

### Open

- [🔴] src/auth.py:42 — JWT 过期未校验
  原因: token 过期后仍接受请求
  修复方案: 添加 exp 字段校验
  来源: code-reviewer

- [🟡] src/utils.py:108 — 日期解析缺少时区处理
  原因: datetime.now() 不含时区信息
  建议: 使用 datetime.now(tz=timezone.utc)
  来源: type-design-analyzer

### Resolved

- [🟠→✅] src/api/handler.go:85 — 错误响应未包装
  原因: fmt.Errorf 仅包装错误消息，未携带原始 error
  修复: 使用 fmt.Errorf 包装原始错误
  简化: 已优化 ✅

---

## Round <N-1> — ✅ Converged

> 已解决。🔴 <N> 个修复，🟠 <N> 个修复。

---
```

## 状态标记

| 标记 | 含义 | 触发条件 |
|------|------|----------|
| `✅ Converged` | 无 🔴🟠 问题 | 所有 Blocking/Severe 已修复 |
| `⚠️ Max rounds` | 达到迭代上限 | `max_rounds_reached: true` |
| 无标记 | 仍有问题待修复 | 有未解决的 🔴🟠 |

## 状态管理协议

| 操作 | 行为 |
|------|------|
| 首次生成 | 创建文件，写入 header + Round 1 |
| 当前轮次覆写 | 定位 `## Round <N>`，替换该分区全部内容 |
| 历史轮次追加 | 旧 Round 下移，追加新 Round |
| 🔴🟠 修复 | 从 Open 移除，写入当前轮次 Resolved。保留原始 `原因`，追加 `修复` 和 `简化` |
| 🟡 首次发现 | 写入当前轮次 Open |
| 🟡 重复出现 | 不写入 Open，仅在元数据中计数 |
| 🟡 不再出现 | 自然消失 |
| 收敛 | 标题追加 `✅ Converged` |
| 迭代上限 | 标题追加 `⚠️ Max rounds`，元数据追加 `⚠️ 达到迭代上限，剩余问题降级为 Advisory` |

## 🟡 去重机制

提取已报告 🟡 的 `file:line + title` 作为去重集合。后续轮次发现相同 `file:line + title` 时，不写入 Open。

## 异常处理

| 场景 | 处理 |
|------|------|
| 文件不存在 | 首次调用时创建 |
| 文件已有内容 | 解析现有轮次，新 Round 追加到顶部 |
| 轮次号不连续 | 按传入值写入，不做连续性校验 |
| 无问题 | 写入空轮次，标记 `✅ Converged` |

## 约束

- 单文件操作，不创建辅助文件
- GitHub-flavored Markdown 兼容
- 轮次标题和问题条目格式为 dashboard 解析锚点
- DO NOT 记录代码 diff 或文件内容
- DO NOT 修改已写入的历史轮次内容
