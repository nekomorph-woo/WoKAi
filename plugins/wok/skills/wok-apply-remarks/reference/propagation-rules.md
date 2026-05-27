# Impact Propagation 规则

## 管道依赖图

```
_define.md
  ↓
modules/_registry.md
  ↓
modules/*/design.md
  ↓
_check.md
  ↓
_plan.md
  ↓
_review.md
```

## 传播表

### _define.md 变更

| impact | 受影响文档 | freshness |
|--------|------------|-----------|
| PATCH | 无 | — |
| MINOR | registry, design, check, plan, review | `impacted` |
| MAJOR | registry, design, check, plan, review | `stale` |

### modules/_registry.md 变更

| impact | 受影响文档 | freshness |
|--------|------------|-----------|
| PATCH | 无 | — |
| MINOR | design modules, check, plan, review | `impacted` |
| MAJOR | design modules, check, plan, review | `stale` |

### modules/*/design.md 变更

| impact | 受影响文档 | freshness |
|--------|------------|-----------|
| PATCH | 无 | — |
| MINOR | check, plan | `impacted` |
| MAJOR | check, plan | `stale` |

### _check.md 变更

| impact | 受影响文档 | freshness |
|--------|------------|-----------|
| PATCH | 无 | — |
| MINOR | plan | `impacted` |
| MAJOR | plan | `stale` |

### _plan.md 变更

| impact | 受影响文档 | freshness |
|--------|------------|-----------|
| PATCH | 无 | — |
| MINOR | review | `impacted` |
| MAJOR | review | `stale` |

## Freshness 优先级

`fresh < impacted < stale`

传播时只升级不降级。降级时机：文档被对应 SKILL 重新生成时，freshness 重置为 `fresh`。
