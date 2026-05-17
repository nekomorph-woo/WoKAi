# 管道技能规范

管道技能是彼此串联、上下游协作的能力单元。与独立技能不同，管道技能的输出是下一个技能的输入。

## Frontmatter 声明

管道技能在 SKILL.md 的 frontmatter 中声明上下游关系：

```yaml
---
name: <skill-name>
description: ...
pipeline:
  upstream: [skill-a, skill-b]    # 上游技能（无上游则留空数组）
  downstream: [skill-c]           # 下游技能
  gate: true                      # 完成后是否需要验证门
  output: document                # 产出物类型：document / none
  adaptive: true                  # 是否支持深度自适应
---
```

| 字段 | 说明 |
|------|------|
| `upstream` | 读取哪些技能的产出物作为输入 |
| `downstream` | 产出物供哪些技能消费 |
| `gate` | `true` = 完成后暂停等待用户确认，`false` = 自动流转 |
| `output` | `document` = 生成文件，`none` = 仅对话交互 |
| `adaptive` | `true` = 根据设计存量调整产出深度 |

## 验证门

验证门是管道中两个技能之间的确认点。

### 行为

1. 上游技能完成产出物后，**暂停执行**
2. 向用户展示验证内容（Brief + 关键决策 + 待确认项）
3. 用户确认后，验证门通过，可进入下游技能

### 验证内容

每个验证门的展示内容必须包含：

- **Brief**：产出了什么（3 行以内）
- **关键决策**：做了哪些方向性选择
- **阻塞项**：是否有未解决且影响下游的问题
- **下一步**：通过后进入哪个技能

### 展示格式

```
## ✅ 验证门

**产出**：<一句话>
**决策**：<关键决策列表>
**阻塞**：<阻塞项，无则写"无">
**下一步**：<downstream 技能名>

确认以上内容后，可执行 /<downstream> 进入下一阶段。
```

## 深度自适应

同一技能在不同设计存量下产出不同深度的工作。

### 判断设计存量

在技能的第一轮交互中，通过以下方式评估：

| 评估手段 | 获取信息 |
|----------|----------|
| 读取现有文档 frontmatter | 已有哪些设计产出物（`status: approved`） |
| 探索代码库 | 已有哪些模块、接口、测试 |
| 询问用户 | "这个功能涉及哪些已有模块？" |

### 深度分级

| 设计存量 | 产出深度 | 典型场景 |
|----------|----------|----------|
| 0%（0→1） | 全量产出 | 新项目、全新功能域 |
| 30-50% | 增量产出 + 受影响模块更新 | 部分模块已有设计 |
| 70%+ | 仅增量变更 | 存量系统加小功能 |

### 产出调整规则

- **全量模式**：生成所有章节，所有模块
- **增量模式**：只生成变更部分，标注与已有设计的关系
- **标记已有**：引用已有设计时标注文档 ID（`depends` 字段），不重复生成

## 文档传递协议

上下游技能通过文件系统传递产出物。

### 目录约定

所有管道产出物统一放在 `plans/<feature-name>/` 下：

```
plans/<feature-name>/
├── _roadmap.md             ← forage-the-market 产出
├── _define.md              ← define-a-delicacy 产出
├── modules/
│   ├── _registry.md        ← prepare-the-ingredient 产出
│   └── <module-name>/
│       ├── design.md       ← 模块设计（intent: reference）
│       └── decisions.md    ← 模块决策（intent: decision）
├── _check.md               ← season-the-dish 产出
└── _plan.md                ← write-a-recipe 产出
```

### 读取协议

下游技能启动时：

1. 读取上游产出物的 **frontmatter**（不读正文）
2. 根据 `status` 判断是否可以继续（`approved` 才能继续）
3. 根据 `depends` 加载依赖文档
4. 只在需要具体信息时才读取正文对应段落

### 写入协议

当前技能完成时：

1. 生成文档，遵循 [document-format.md](document-format.md)
2. 设置 `status: draft`
3. 通过验证门后更新为 `status: approved`
