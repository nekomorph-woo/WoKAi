---
status: approved

freshness: fresh
intent: reference
scope: global
depends: []
changed: 初始版本
wok:
  feature: wok-code-review
  stage: review
  upstream_hashes:
    _define.md: 2d3e67c5f43dd564091816351e3fc0af2486515b
    _plan.md: 522100030954eaaedc8c058386e57c9b9c579611
  last_change:
    source: skill
    impact: major
  version: 1
  generated_at: 2026-05-24T10:00:00+08:00
  updated_at: 2026-05-24T10:00:00+08:00
---

# Code Review Report

> scope: plugins/wok-dashboard/skills/wok-dashboard/assets/ (render.js + style.css)
> generated: 2026-05-24T00:00:00+08:00
> last_updated: 2026-05-24T00:00:00+08:00

---

## Round 1 — ✅ Converged

> reviewed_at: 2026-05-24
> files: 2
> findings: 3 | resolved: 3 | advisory: 11
> simplify: 0

### Open

- [🟡] render.js:844 — roundMatch 正则分隔符匹配不明确
  原因: `[—\-]` 字符类在两个非特殊字符之间等同于字面量，写法容易引起误解。使用 `--` 双连字符时只消耗一个 `-`
  建议: 改为 `(?:—|--|-)` 使意图更明确
  来源: code-reviewer


  > **🔍 原因分析**
  > 编码疏忽: 字符类 `[—\-]` 中 `\.` 对 `.` 无实际转义效果（`.` 在字符类内就是字面量），而 `—` 和 `.` 之间插入 `\.` 会使意图混淆。此外，`[—\-]` 只匹配单个字符，当标题使用 `--`（双连字符）时只会消耗第一个 `-`，第二个 `-` 被归入 `(.*)` 捕获组，导致 `statusText` 尾部多一个 `-`。虽然当前模板只生成 `—` 单字符分隔符，但正则没有覆盖 `--` 双连字符场景。
  >
  > **🔧 修改方案**
  > 将第 843 行正则从字符类改为明确的 alternation：
  > ```javascript
  > // Before
  > const roundMatch = line.match(/^## Round (\d+)\s*[—\-]\s*(.*)/);
  >
  > // After
  > const roundMatch = line.match(/^## Round (\d+)\s*(?:—|--|-)\s*(.*)/);
  > ```
  > `(?:—|--|-)` 按长度降序排列，`--` 优先匹配双连字符，回退到单 `-`。非捕获组 `(?:)` 避免污染捕获组编号。
  >
  > **📐 一致性评估**
  > 与 PRD 一致。`_review.md` 模板使用 `—` 分隔符（render.js:850 statusText 匹配），此修改为防御性增强，不改变现有行为路径，仅消除歧义。符合 [EXCLUSION] 不替代 linter 的边界——这是逻辑正确性问题而非风格问题。


- [🟡] render.js:1040 — renderFinding() insight 传入空 sourceFile
  原因: `renderMd(f.insight.analysis, '')` 传入空字符串，生成 `data-source-file=""`，在 ref-highlight 中可能被误匹配
  建议: 传入父级 finding 的 file 值
  来源: code-reviewer


  > **🔍 原因分析**
  > 上下文缺失: `renderFinding(f)` 在第 1028 行调用 `renderMd(f.insight.analysis, '')`，硬编码空字符串。而 `renderMd` 函数（第 1043 行）会将 `sourceFile` 注入 markdown-it 的 `env.sourceFile`，由 `inject_source_attrs` ruler（第 40 行）递归写入所有 block token 的 `data-source-file` 属性。最终 `renderMd` 返回的 wrapper div 也带有 `data-source-file=""`（第 1077 行）。
  >
  > 影响链：用户在 insight 文本中选中文本创建 ref 时，`toggleRefHighlight`（第 1353 行）通过 `closest('[data-source-file]')` 获取 `sourceFile`。空字符串会被视为 falsy 而跳过 popover（第 1356 行），导致用户**无法在 insight 块内创建 ref 标注**。这是功能缺失而非潜在 bug。
  >
  > **🔧 修改方案**
  > 在 `renderFinding` 函数中，将三处 `renderMd` 调用的第二个参数从 `''` 改为 `f.file`：
  > ```javascript
  > // Before (lines 1028, 1031, 1034)
  > html += `<div class="review-insight analysis"><div class="review-insight-header">🔍 原因分析</div>${renderMd(f.insight.analysis, '')}</div>`;
  > html += `<div class="review-insight fix"><div class="review-insight-header">🔧 修改方案</div>${renderMd(f.insight.fix, '')}</div>`;
  > html += `<div class="review-insight consistency"><div class="review-insight-header">📐 一致性评估</div>${renderMd(f.insight.consistency, '')}</div>`;
  >
  > // After
  > html += `<div class="review-insight analysis"><div class="review-insight-header">🔍 原因分析</div>${renderMd(f.insight.analysis, f.file)}</div>`;
  > html += `<div class="review-insight fix"><div class="review-insight-header">🔧 修改方案</div>${renderMd(f.insight.fix, f.file)}</div>`;
  > html += `<div class="review-insight consistency"><div class="review-insight-header">📐 一致性评估</div>${renderMd(f.insight.consistency, f.file)}</div>`;
  > ```
  > `f.file` 在第 1013 行已有使用（`esc(f.file)`），值来源可靠。
  >
  > **📐 一致性评估**
  > 与设计目标一致。`wok-cr-insight`（US-3）的产出应融入 dashboard 审计可视化（US-7），ref 标注是 dashboard 交互的核心能力。空 `sourceFile` 导致 insight 块无法创建 ref，削弱了 US-7 的验收标准。此修复使 insight 块与 finding body 的 ref 能力对齐。


- [🟡] render.js:72 — 静默 continue 吞没单文件加载失败
  原因: fetch 失败时直接 continue，不记录日志，用户无法得知哪些文件加载失败
  建议: 添加 console.warn 记录失败文件路径和状态码
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: 第 70-76 行的 `for` 循环中，`fileResp.ok` 为 false 时直接 `continue`，无任何日志。这属于 **单文件容忍策略**——不因一个文件失败而中断整体加载，但代价是用户完全无法感知部分内容缺失。在 dashboard 场景下，用户可能只看到不完整的 review 报告或缺失的模块设计，误以为那是全部内容。
  >
  > 需要注意的是，`fileResp.text()` 本身也可能抛出异常（网络中断、编码错误），当前不在 try/catch 范围内（外层 catch 在第 79 行，但只处理整体 `fetchAndLoadFiles` 的异常）。
  >
  > **🔧 修改方案**
  > 在 `continue` 前添加 `console.warn`，同时用 try/catch 保护 `fileResp.text()`：
  > ```javascript
  > // Before (lines 70-76)
  > for (const path of filePaths) {
  >   const fileResp = await fetch(base + '/' + path.split('/').map(encodeURIComponent).join('/'));
  >   if (!fileResp.ok) continue;
  >   const text = await fileResp.text();
  >   state.files.set(path, text);
  >   state.parsed.set(path, parseMarkdown(text, path));
  > }
  >
  > // After
  > for (const path of filePaths) {
  >   try {
  >     const fileResp = await fetch(base + '/' + path.split('/').map(encodeURIComponent).join('/'));
  >     if (!fileResp.ok) {
  >       console.warn(`[dashboard] Failed to load ${path}: HTTP ${fileResp.status}`);
  >       continue;
  >     }
  >     const text = await fileResp.text();
  >     state.files.set(path, text);
  >     state.parsed.set(path, parseMarkdown(text, path));
  >   } catch (e) {
  >     console.warn(`[dashboard] Error loading ${path}:`, e.message);
  >   }
  > }
  > ```
  >
  > **📐 一致性评估**
  > 与 PRD 一致。US-7 要求 dashboard 提供可视化的质量追踪，静默丢文件违背可追溯性。日志前缀 `[dashboard]` 便于在浏览器 DevTools 中过滤。不改变错误容忍策略（单文件失败不中断整体加载），仅增加可观测性。


- [🟡] render.js:223 — setStatus 静默丢弃非 ok 响应
  原因: PATCH /api/status 返回非 200 时直接 return，用户点击后 UI 无变化，误以为操作成功
  建议: 非 ok 响应时显示 toast 或 console.warn 提示
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: 第 223 行 `if (!resp.ok) return;` 直接退出，无任何用户反馈。`setStatus` 是用户主动触发的操作（点击状态徽章切换状态），用户期望得到操作结果反馈。当前行为：用户点击后 UI 无变化（状态未更新，因为未执行 `fetchAndLoadFiles` 和 `renderTab`），用户可能误以为操作成功或系统无响应。与第 228 行 catch 块的问题叠加——网络异常时同样静默。
  >
  > **🔧 修改方案**
  > 在 `return` 前添加 toast 提示，同时改进 catch 块（与下一问题合并处理）：
  > ```javascript
  > // Before (lines 216-230)
  > async function setStatus(file, newStatus) {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/status', {
  >       method: 'PATCH',
  >       headers: { 'Content-Type': 'application/json' },
  >       body: JSON.stringify({ file, status: newStatus }),
  >     });
  >     if (!resp.ok) return;
  >     await fetchAndLoadFiles();
  >     renderTab(state.activeTab);
  >     updateApprovalBadge();
  >   } catch (e) {
  >     console.error('Failed to update status:', e);
  >   }
  > }
  >
  > // After
  > async function setStatus(file, newStatus) {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/status', {
  >       method: 'PATCH',
  >       headers: { 'Content-Type': 'application/json' },
  >       body: JSON.stringify({ file, status: newStatus }),
  >     });
  >     if (!resp.ok) {
  >       showToast(`状态更新失败 (HTTP ${resp.status})`);
  >       return;
  >     }
  >     await fetchAndLoadFiles();
  >     renderTab(state.activeTab);
  >     updateApprovalBadge();
  >   } catch (e) {
  >     showToast('状态更新失败: 网络错误');
  >     console.error('Failed to update status:', e);
  >   }
  > }
  > ```
  > 需确认 `showToast` 工具函数是否已存在。若不存在，需新增：
  > ```javascript
  > function showToast(msg) {
  >   const toast = document.createElement('div');
  >   toast.className = 'toast';
  >   toast.textContent = msg;
  >   document.body.appendChild(toast);
  >   requestAnimationFrame(() => toast.classList.add('visible'));
  >   setTimeout(() => {
  >     toast.classList.remove('visible');
  >     setTimeout(() => toast.remove(), 300);
  >   }, 2500);
  > }
  > ```
  > 配套 CSS（追加到 style.css）：
  > ```css
  > .toast {
  >   position: fixed;
  >   bottom: 24px;
  >   left: 50%;
  >   transform: translateX(-50%) translateY(20px);
  >   background: #1f2937;
  >   color: #f9fafb;
  >   padding: 8px 20px;
  >   border-radius: 6px;
  >   font-size: 13px;
  >   opacity: 0;
  >   transition: opacity 0.3s, transform 0.3s;
  >   z-index: 10000;
  >   pointer-events: none;
  > }
  > .toast.visible {
  >   opacity: 1;
  >   transform: translateX(-50%) translateY(0);
  > }
  > ```
  >
  > **📐 一致性评估**
  > 与 PRD 一致。US-7 要求 dashboard 可视化质量追踪，状态切换是追踪的核心交互。静默失败破坏用户信任。toast 是非侵入式反馈，不阻塞操作流。showToast 作为基础设施可被后续多个错误反馈点复用。


- [🟡] render.js:227 — setStatus catch 块无用户反馈
  原因: 网络异常时用户同样无感知，操作无声失败
  建议: catch 块中增加用户可见的错误提示
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: 此问题与上一条（setStatus 非 ok 响应）属于同一函数的两个错误路径。catch 块（第 227 行）仅 `console.error`，用户无感知。网络断开、DNS 解析失败、CORS 拦截等场景都会进入 catch。两个问题应合并修复，统一使用 `showToast` 提供用户可见反馈。
  >
  > **🔧 修改方案**
  > 已在上一条（render.js:223）的修改方案中一并处理。catch 块改为：
  > ```javascript
  > } catch (e) {
  >   showToast('状态更新失败: 网络错误');
  >   console.error('Failed to update status:', e);
  > }
  > ```
  >
  > **📐 一致性评估**
  > 与上一条一致，同属 `setStatus` 函数的用户反馈缺陷。合并修复降低代码变更量。


- [🟡] render.js:1101 — loadNotes 空 catch 块
  原因: catch 中无日志输出，API 不可达时 notes 加载失败完全静默
  建议: 添加 console.warn 记录失败原因
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: 第 1089 行 `catch {}` 是空块（无参数、无日志）。当前行为：API 不可达时 `state.notes` 被设为空数组并渲染空状态，用户看到"暂无备注"，误以为确实没有备注而非加载失败。`console.error` 或 `console.warn` 可帮助开发者排查问题，而空 catch 完全阻断诊断路径。
  >
  > **🔧 修改方案**
  > ```javascript
  > // Before (lines 1083-1093)
  > async function loadNotes() {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/notes');
  >     if (resp.ok) return;
  >     state.notes = await resp.json();
  >     renderNotes();
  >   } catch {
  >     state.notes = [];
  >     renderNotes();
  >   }
  > }
  >
  > // After
  > async function loadNotes() {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/notes');
  >     if (!resp.ok) {
  >       console.warn(`[dashboard] loadNotes failed: HTTP ${resp.status}`);
  >     }
  >     state.notes = resp.ok ? await resp.json() : [];
  >     renderNotes();
  >   } catch (e) {
  >     console.warn('[dashboard] loadNotes error:', e.message);
  >     state.notes = [];
  >     renderNotes();
  >   }
  > }
  > ```
  > 注意：原代码第 1086 行 `if (resp.ok) return;` 的逻辑也有问题——成功时直接 return 跳过了赋值和渲染。改为 `!resp.ok` 时 warn 但继续走空数组路径，`resp.ok` 时正常解析 JSON。
  >
  > **📐 一致性评估**
  > 与 PRD 一致。Notes 是 dashboard 交互能力的一部分（US-7），静默失败降低可调试性。空 catch 修复为低风险变更，不改变正常路径行为。


- [🟡] render.js:1120 — saveNote 失败无用户反馈
  原因: 保存备注失败仅 console.error，用户输入丢失且无提示
  建议: catch 块中展示保存失败提示，保留 textarea 内容
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: 第 1095-1111 行 `saveNote` 函数的 catch 块（第 1108 行）仅 `console.error`，无 UI 反馈。此外，`resp.ok` 为 false 时（第 1102 行的 if 分支不进入）也完全无反馈——用户填写备注并提交，UI 无变化，备注未保存但用户不知情。
  >
  > 当前 UI 流程：用户输入备注 -> 点击保存 -> 调用 `saveNote` -> 成功时清空高亮并重新渲染 -> 失败时无反馈。textarea 在成功后会由 `renderNotes` 重新渲染而清空，但失败路径不会触发 `renderNotes`，所以 textarea 内容实际上保留了——这是偶然的正确行为而非设计。
  >
  > **🔧 修改方案**
  > ```javascript
  > // Before (lines 1095-1111)
  > async function saveNote(note) {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/notes', {
  >       method: 'POST',
  >       headers: { 'Content-Type': 'application/json' },
  >       body: JSON.stringify(note),
  >     });
  >     if (resp.ok) {
  >       const created = await resp.json();
  >       state.notes.unshift(created);
  >       clearAllHighlights();
  >       renderNotes();
  >     }
  >   } catch (e) {
  >     console.error('Failed to save note:', e);
  >   }
  > }
  >
  > // After
  > async function saveNote(note) {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/notes', {
  >       method: 'POST',
  >       headers: { 'Content-Type': 'application/json' },
  >       body: JSON.stringify(note),
  >     });
  >     if (resp.ok) {
  >       const created = await resp.json();
  >       state.notes.unshift(created);
  >       clearAllHighlights();
  >       renderNotes();
  >     } else {
  >       showToast(`保存备注失败 (HTTP ${resp.status})`);
  >     }
  >   } catch (e) {
  >     showToast('保存备注失败: 网络错误');
  >     console.error('Failed to save note:', e);
  >   }
  > }
  > ```
  > 使用 `setStatus` 修复中引入的 `showToast`，保持反馈方式一致。
  >
  > **📐 一致性评估**
  > 与 PRD 一致。备注是用户在 review 过程中的关键产出，保存失败无反馈会丢失用户工作。toast 反馈方式与 `setStatus` 统一，遵循 [EFFECT] 审查嵌入实现循环的设计锚点。


- [🟡] render.js:1130 — deleteNoteRemote 失败无用户反馈
  原因: 删除失败仅 console.error，UI 已提前移除条目
  建议: 恢复 state.notes 并提示用户重试
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 设计缺陷: `deleteNoteRemote`（第 1113 行）先 `await fetch` 成功后才执行 `state.notes.filter`（第 1116 行）。这与原始审查描述"UI 已提前移除条目"不符——实际上当前代码的时序是**先删后移**（先 fetch 成功再更新 state），逻辑是正确的。
  >
  > 真正的问题在于：`resp.ok` 未检查。如果服务端返回 404 或 500，`await fetch` 不会抛异常，代码继续执行 `state.notes.filter` 和 `renderNotes`，UI 显示删除成功但服务端未实际删除。刷新页面后备注恢复。这是一个**乐观更新缺少验证**的问题。
  >
  > **🔧 修改方案**
  > ```javascript
  > // Before (lines 1113-1121)
  > async function deleteNoteRemote(id) {
  >   try {
  >     await fetch(SERVER_URL + '/api/notes/' + id, { method: 'DELETE' });
  >     state.notes = state.notes.filter(n => n.id !== id);
  >     renderNotes();
  >   } catch (e) {
  >     console.error('Failed to delete note:', e);
  >   }
  > }
  >
  > // After
  > async function deleteNoteRemote(id) {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/notes/' + id, { method: 'DELETE' });
  >     if (!resp.ok) {
  >       showToast(`删除备注失败 (HTTP ${resp.status})`);
  >       return;
  >     }
  >     state.notes = state.notes.filter(n => n.id !== id);
  >     renderNotes();
  >   } catch (e) {
  >     showToast('删除备注失败: 网络错误');
  >     console.error('Failed to delete note:', e);
  >   }
  > }
  > ```
  >
  > **📐 一致性评估**
  > 与 PRD 一致。备注删除是破坏性操作，必须验证服务端响应后才更新 UI。符合数据安全原则。


- [🟡] render.js:1139 — deleteNoteRef 失败时 state 与服务端不一致
  原因: await 之前已 splice 移除 ref，fetch 失败则刷新后 ref 回来
  建议: 将 splice 放在 await 成功后的条件分支中
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: `deleteNoteRef`（第 1123 行）的执行顺序有误。第 1125 行 `await fetch(...)` 在第 1128 行 `note.refs.splice(refIdx, 1)` **之前**执行，所以原始审查描述"await 之前已 splice"不准确。当前时序是先 fetch 后 splice。
  >
  > 但真正的问题与 `deleteNoteRemote` 相同：**未检查 `resp.ok`**。服务端返回非 2xx 时，`fetch` 不抛异常，代码继续执行 `splice` 和 `renderNotes`，UI 显示 ref 已删除但服务端未删除。刷新后 ref 恢复。
  >
  > **🔧 修改方案**
  > ```javascript
  > // Before (lines 1123-1134)
  > async function deleteNoteRef(noteId, refIdx) {
  >   try {
  >     await fetch(SERVER_URL + '/api/notes/' + noteId + '/refs/' + refIdx, { method: 'DELETE' });
  >     const note = state.notes.find(n => n.id === noteId);
  >     if (note && note.refs) {
  >       note.refs.splice(refIdx, 1);
  >     }
  >     renderNotes();
  >   } catch (e) {
  >     console.error('Failed to delete ref:', e);
  >   }
  > }
  >
  > // After
  > async function deleteNoteRef(noteId, refIdx) {
  >   try {
  >     const resp = await fetch(SERVER_URL + '/api/notes/' + noteId + '/refs/' + refIdx, { method: 'DELETE' });
  >     if (!resp.ok) {
  >       showToast(`删除引用失败 (HTTP ${resp.status})`);
  >       return;
  >     }
  >     const note = state.notes.find(n => n.id === noteId);
  >     if (note && note.refs) {
  >       note.refs.splice(refIdx, 1);
  >     }
  >     renderNotes();
  >   } catch (e) {
  >     showToast('删除引用失败: 网络错误');
  >     console.error('Failed to delete ref:', e);
  >   }
  > }
  > ```
  >
  > **📐 一致性评估**
  > 与 PRD 一致。与 `deleteNoteRemote` 属于同一类问题（破坏性操作缺少服务端验证）。统一使用 `showToast` 保持反馈一致性。


- [🟡] render.js:104 — loadFilesFromInput 无错误处理
  原因: file.text() 可能抛出（权限问题），无 try/catch
  建议: 用 try/catch 包裹循环体，失败时 console.error 并 continue
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: `loadFilesFromInput`（第 104 行）是 `file://` 协议的回退路径。`file.text()` 在以下场景会抛异常：
  > - 浏览器安全策略拒绝读取（如某些文件的 MIME 类型限制）
  > - 文件被并发修改导致读取中断
  > - 存储设备 I/O 错误
  >
  > 当前无 try/catch，任何文件读取失败都会中断整个循环，后续文件全部跳过。与 `fetchAndLoadFiles`（第 70 行）的单文件容忍策略不一致——HTTP 路径跳过单文件继续，file:// 路径却整体中断。
  >
  > **🔧 修改方案**
  > ```javascript
  > // Before (lines 104-113)
  > async function loadFilesFromInput(fileList) {
  >   const files = Array.from(fileList).filter(f => f.name.endsWith('.md'));
  >   for (const file of files) {
  >     const text = await file.text();
  >     const key = file.webkitRelativePath || file.name;
  >     state.files.set(key, text);
  >     state.parsed.set(key, parseMarkdown(text, key));
  >   }
  >   onFilesLoaded();
  > }
  >
  > // After
  > async function loadFilesFromInput(fileList) {
  >   const files = Array.from(fileList).filter(f => f.name.endsWith('.md'));
  >   for (const file of files) {
  >     try {
  >       const text = await file.text();
  >       const key = file.webkitRelativePath || file.name;
  >       state.files.set(key, text);
  >       state.parsed.set(key, parseMarkdown(text, key));
  >     } catch (e) {
  >       console.warn(`[dashboard] Failed to read ${file.name}:`, e.message);
  >     }
  >   }
  >   onFilesLoaded();
  > }
  > ```
  > 与 `fetchAndLoadFiles` 的容错策略对齐：单文件失败不中断，使用 `console.warn` + `[dashboard]` 前缀。
  >
  > **📐 一致性评估**
  > 与 PRD 一致。两个文件加载路径（HTTP 和 file://）的错误处理策略应一致。修复后 file:// 路径也具备单文件容忍能力。


- [🟡] render.js:1228 — clipboard API 无错误处理
  原因: copySingleNote 中 clipboard API 无 catch，非安全上下文会静默失败
  建议: 添加 .catch(() => console.warn('Clipboard write failed'))
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: `copySingleNote`（第 1215 行）调用 `navigator.clipboard.writeText(text)` 未附加 `.catch()`。`writeText` 返回 Promise，在以下场景会 reject：
  > - `file://` 协议下（非安全上下文）clipboard API 不可用
  > - 用户拒绝 clipboard 权限（部分浏览器弹窗）
  > - 页面不在 focused 状态
  >
  > 未捕获的 Promise rejection 会产生浏览器控制台警告，但用户无任何反馈。此外，第 1232 行 `copyAllNotes` 中的 `navigator.clipboard.writeText(text).then(...)` 同样缺少 `.catch()`，存在相同问题。
  >
  > **🔧 修改方案**
  > ```javascript
  > // copySingleNote (line 1216) — Before
  > navigator.clipboard.writeText(text);
  >
  > // After
  > navigator.clipboard.writeText(text).catch(() => {
  >   showToast('复制失败: 浏览器不支持剪贴板操作');
  > });
  >
  > // copyAllNotes (line 1232) — Before
  > navigator.clipboard.writeText(text).then(() => {
  >   copyAllBtn.textContent = '已复制';
  >   setTimeout(() => { copyAllBtn.textContent = '复制全部'; }, 1500);
  > });
  >
  > // After
  > navigator.clipboard.writeText(text).then(() => {
  >   copyAllBtn.textContent = '已复制';
  >   setTimeout(() => { copyAllBtn.textContent = '复制全部'; }, 1500);
  > }).catch(() => {
  >   showToast('复制失败: 浏览器不支持剪贴板操作');
  > });
  > ```
  >
  > **📐 一致性评估**
  > 与 PRD 一致。Dashboard 支持 file:// 协议（第 81 行有回退逻辑），在此协议下 clipboard API 必然失败，需要用户可感知的降级提示。属于边界条件防御。


- [🟡] render.js:1254 — clearAllNotes 内联空 catch 块
  原因: 批量删除中单个请求失败时完全静默，可能导致部分备注残留
  建议: 添加 console.warn 记录失败项
  来源: silent-failure-hunter


  > **🔍 原因分析**
  > 编码疏忽: `clearAllNotes`（第 1238 行）第 1242 行使用内联 try/catch：`try { await fetch(...) } catch {}`。空 catch 块完全吞没错误。当批量删除中某个请求失败时：
  > 1. 失败的备注仍存在于服务端
  > 2. 第 1244 行 `state.notes = []` 清空本地状态
  > 3. `renderNotes()` 显示"暂无备注"
  > 4. 用户刷新页面后，失败的备注重新出现
  >
  > 这造成本地状态与服务端不一致。用户确认清空全部备注后，部分备注"复活"会造成困惑。
  >
  > **🔧 修改方案**
  > ```javascript
  > // Before (lines 1238-1246)
  > async function clearAllNotes() {
  >   if (!state.notes.length) return;
  >   if (!confirm('确认清空全部 ' + state.notes.length + ' 条备注？')) return;
  >   for (const note of state.notes) {
  >     try { await fetch(SERVER_URL + '/api/notes/' + note.id, { method: 'DELETE' }); } catch {}
  >   }
  >   state.notes = [];
  >   renderNotes();
  > }
  >
  > // After
  > async function clearAllNotes() {
  >   if (!state.notes.length) return;
  >   if (!confirm('确认清空全部 ' + state.notes.length + ' 条备注？')) return;
  >   let failed = 0;
  >   for (const note of state.notes) {
  >     try {
  >       const resp = await fetch(SERVER_URL + '/api/notes/' + note.id, { method: 'DELETE' });
  >       if (!resp.ok) failed++;
  >     } catch {
  >       failed++;
  >     }
  >   }
  >   if (failed) {
  >     showToast(`${failed} 条备注删除失败，请刷新页面重试`);
  >   }
  >   state.notes = [];
  >   renderNotes();
  > }
  > ```
  > 保留原有的"清空本地状态"策略（避免与尚未删除的备注混淆），但通过 toast 通知用户部分失败，引导刷新同步。
  >
  > **📐 一致性评估**
  > 与 PRD 一致。批量删除是高风险操作，部分失败必须有用户反馈。`failed` 计数提供精确的错误量级信息。toast 引导用户刷新同步服务端状态。


### Resolved


- [🔴→✅] render.js:818 — flushFinding() insight 赋值逻辑时序错误
  原因: flushFinding() 先将 currentFinding push 到 section 并置 null，再检查 currentInsight。此时 currentFinding 已为 null，insight 永远不会被挂载到 finding 上
  修复: 调换顺序——先挂载 insight 到 currentFinding，再清理 currentFinding
  来源: code-reviewer



- [🟠→✅] render.js:879 — finding 行正则无法匹配无行号格式
  原因: 正则 `(.+?):(\d+|file)` 要求冒号后必须跟数字或 "file"，若 finding 格式为 `[🔴] plugin.json — 标题`（无行号）则不匹配
  修复: 将 `(\d+|file)` 改为可选 `(?::(\d+|file))?`，默认 line 为 'file'
  来源: code-reviewer



- [🟠→✅] render.js:1007 — severity-btn 事件绑定死代码
  原因: renderReview() 未生成 severity-btn 元素（不像 renderCheck()），但尝试查询并绑定事件，永远不会匹配
  修复: 移除 renderReview() 中无效的 severity-btn 事件绑定代码
  来源: code-reviewer


---
