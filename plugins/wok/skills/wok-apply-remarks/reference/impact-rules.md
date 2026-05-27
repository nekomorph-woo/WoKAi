# Impact Level 判定规则

## 变更类型 → Impact 映射

| 变更类型 | impact | 下游处理 |
|----------|--------|----------|
| typo / 措辞修正 | PATCH | 无需影响下游 |
| 补充背景说明 | PATCH / MINOR | 下游 `impacted` |
| 修改问题定义 | MAJOR | design/check/plan `stale` |
| 修改目标 | MAJOR | design/check/plan `stale` |
| 修改非目标 | MAJOR | design/check/plan `stale` |
| 修改用户故事 | MAJOR | design/check/plan `stale` |
| 修改验收标准 | MAJOR | plan/check `stale` |
| 修改模块职责 | MAJOR | affected module + check + plan `stale` |
| 修改接口契约 | MAJOR | affected modules + check + plan `stale` |
| 修改依赖关系 | MAJOR | registry + check + plan `stale` |
| 解决 check finding | MINOR / MAJOR | check refresh, plan `impacted` |
| 修改执行步骤 | MINOR | implement `impacted` |
| 新增/删除模块 | MAJOR | 全下游 `stale` |

## 判定流程

1. **自动推断**：LLM 根据备注内容和变更类型推断 impact level
2. **用户确认**：展示推断结果，用户可接受或调整为其他等级
3. **传播执行**：按等级执行 freshness 传播

## 恢复策略

根据 impact level 推荐下游恢复操作：

| impact | 恢复策略 | 建议操作 |
|--------|----------|----------|
| PATCH | 仅重校验 | 无需重跑下游 skill；dashboard 刷新即可 |
| MINOR | 增量修补 | 运行 `wok-design --affected-only`，然后 `wok-design-review` |
| MAJOR | 全量重生成 | 运行 `wok-design`（全量），然后 `wok-design-review`，最后 `wok-plan --refresh` |

**`--affected-only`**：仅重新生成 freshness 为 stale/impacted 的模块，跳过 fresh 模块（由 wok-design 支持）。
**`--refresh`**：仅重新生成受上游变更影响的步骤，保留未受影响步骤（由 wok-plan 支持）。

## 多备注执行规则

### 按文档执行

同一文档的多条备注合并处理。打开文档后按行号从后往前应用修改，避免行号偏移。

### 执行顺序

按管道深度从浅到深处理文档组：

```
_define.md → _registry.md → */design.md → _check.md → _plan.md
```

### 脚本命令

更新备注状态：

```bash
python3 scripts/update-remark.py <phase-dir>/_remark.jsonl \
  --id <remark-id> --state applied --applied-by claude-code \
  --impact <major|minor|patch> --summary "<描述>" \
  --changed-files <f1> <f2> --stale-downstream <f3> <f4>
```

传播 freshness：

```bash
python3 scripts/set-freshness.py <downstream-doc-path> \
  --freshness <impacted|stale> --reason "<变更源文件名>"
```
