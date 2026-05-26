(function () {
  'use strict';

  const SYSTEM_NAME = '{{SYSTEM_NAME}}';
  const SERVER_PORT = 18730;
  const FEATURE_BASE = window.location.protocol === 'file:'
    ? `http://127.0.0.1:${SERVER_PORT}/${SYSTEM_NAME}`
    : '/' + SYSTEM_NAME;

  // ── State ──
  const state = {
    files: new Map(),      // fileName -> raw text
    parsed: new Map(),     // fileName -> { frontmatter, body, markers }
    activeTab: 'overview',
    notes: [],
    activeModule: null,
  };

  // ── DOM refs ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const welcome = $('#welcome');
  const notesPanel = $('#notes-panel');
  const notesToggleBtn = $('#notes-toggle-btn');
  const notesList = $('#notes-list');
  const noteTextarea = $('#note-textarea');
  const addNoteBtn = $('#add-note-btn');
  const multiSelectBtn = $('#multi-select-btn');
  const generatePromptBtn = $('#generate-prompt-btn');
  const refPopover = $('#ref-popover');

  // ── markdown-it setup ──
  let md;
  function initMarkdown() {
    md = window.markdownit({
      html: true,
      linkify: true,
      typographer: false,
    });

    // Recursively inject source attrs on ALL block-level tokens
    md.core.ruler.push('inject_source_attrs', (state) => {
      const sourceFile = state.env && state.env.sourceFile;
      if (!sourceFile) return;
      function walk(tokens) {
        for (const token of tokens) {
          const injectable = (token.nesting === 1 ||
                              token.type === 'fence' ||
                              token.type === 'code_block') && token.map;
          if (injectable) {
            token.attrSet('data-source-file', sourceFile);
            token.attrSet('data-source-line', token.map[0]);
          }
          if (token.children) walk(token.children);
        }
      }
      walk(state.tokens);
    });
  }

  // ── File Reading (HTTP fetch) ──
  async function fetchAndLoadFiles() {
    try {
      const resp = await fetch(FEATURE_BASE + '/api/files');
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const filePaths = await resp.json();

      state.files.clear();
      state.parsed.clear();

      for (const path of filePaths) {
        const fileResp = await fetch(FEATURE_BASE + '/' + path.split('/').map(encodeURIComponent).join('/'));
        if (!fileResp.ok) continue;
        const text = await fileResp.text();
        state.files.set(path, text);
        state.parsed.set(path, parseMarkdown(text, path));
      }
      await checkFreshness();
      onFilesLoaded();
      updateApprovalBadge();
      renderGlobalStatusCard();
    } catch (e) {
      console.error('Failed to load files:', e);
      if (location.protocol === 'file:') {
        // file:// 协议回退到目录选择器
        const openDirBtn = document.getElementById('open-dir-btn');
        const dirInput = document.getElementById('dir-input');
        if (openDirBtn && dirInput) {
          welcome.querySelector('p').textContent = 'HTTP server 不可用，请手动选择 feature 目录。';
          openDirBtn.style.display = '';
          openDirBtn.addEventListener('click', () => dirInput.click());
          dirInput.addEventListener('change', (ev) => {
            if (ev.target.files.length) loadFilesFromInput(ev.target.files);
          });
        }
      } else {
        welcome.innerHTML = `
          <h2>连接失败</h2>
          <p style="font-family:var(--font-mono);font-size:12px;color:#737373;">${esc(e.message)}</p>
          <button class="btn-primary" onclick="location.reload()">重试</button>
        `;
      }
    }
  }

  // Fallback for file:// protocol
  async function loadFilesFromInput(fileList) {
    const files = Array.from(fileList).filter(f => f.name.endsWith('.md'));
    for (const file of files) {
      const text = await file.text();
      const key = file.webkitRelativePath || file.name;
      state.files.set(key, text);
      state.parsed.set(key, parseMarkdown(text, key));
    }
    onFilesLoaded();
  }

  // ── Parsing ──
  function parseMarkdown(text, fileName) {
    const frontmatter = extractFrontmatter(text);
    const bodyOffset = frontmatter ? frontmatter.raw.split('\n').length : 0;
    const body = frontmatter ? text.slice(frontmatter.raw.length).trim() : text;
    const markers = extractMarkers(body).map(m => ({ ...m, line: m.line + bodyOffset, file: fileName }));
    return { frontmatter: frontmatter ? frontmatter.data : null, body, markers, raw: text };
  }

  function extractFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const data = {};
    const lines = match[1].split('\n');
    const stack = [{ obj: data, indent: -1 }];

    for (const line of lines) {
      if (!line.trim()) continue;
      const indent = line.search(/\S/);

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();

      if (!val) {
        const newObj = {};
        stack[stack.length - 1].obj[key] = newObj;
        stack.push({ obj: newObj, indent });
      } else if (val.startsWith('[') && val.endsWith(']')) {
        stack[stack.length - 1].obj[key] = val.slice(1, -1).split(',').map(s => s.trim());
      } else {
        stack[stack.length - 1].obj[key] = val;
      }
    }

    return { data, raw: match[0] };
  }

  function extractMarkers(body) {
    const markers = [];
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const hMatch = lines[i].match(/^###?\s+\[(DECISION|OPEN)\]\s+(.+)$/);
      if (hMatch) {
        markers.push({ type: hMatch[1], title: hMatch[2], line: i + 1 });
        continue;
      }
      const aMatch = lines[i].match(/^-\s+\[ACTION\]\s+(.+)$/);
      if (aMatch) {
        markers.push({ type: 'ACTION', title: aMatch[1], line: i + 1 });
      }
    }
    return markers;
  }

  // ── Tab Switching ──
  function switchTab(tabName) {
    state.activeTab = tabName;
    $$('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    $$('.tab-content').forEach(el => el.classList.toggle('active', el.id === 'tab-' + tabName));
    renderTab(tabName);
  }

  // Find file by suffix (e.g. '_define.md' matches 'p1-xxx/_define.md')
  function findFile(suffix) {
    for (const [key] of state.parsed) {
      if (key.endsWith('/' + suffix) || key === suffix) return key;
    }
    // Defensive fallback: match by filename portion (handles misnested files)
    const fileName = suffix.includes('/') ? suffix.split('/').pop() : suffix;
    if (fileName !== suffix) {
      for (const [key] of state.parsed) {
        if (key.endsWith('/' + fileName) || key === fileName) return key;
      }
    }
    return null;
  }

  // Find all files matching suffix across phases
  function findAllFiles(suffix) {
    const results = [];
    for (const [key] of state.parsed) {
      if (key.endsWith('/' + suffix) || key === suffix) results.push(key);
    }
    return results;
  }

  // Extract phase name from key (e.g. 'p1-xxx/_define.md' → 'p1-xxx')
  function extractPhase(key) {
    const parts = key.split('/');
    return parts.length > 1 ? parts[0] : null;
  }

  function onFilesLoaded() {
    welcome.style.display = 'none';
    switchTab(state.activeTab);
  }

  function renderTab(tab) {
    switch (tab) {
      case 'overview': renderOverview(); break;
      case 'requirements': renderRequirements(); break;
      case 'design': renderDesign(); break;
      case 'check': renderCheck(); break;
      case 'execution': renderExecution(); break;
      case 'review': renderReview(); break;
    }
  }

  // ── Status API ──
  const VALID_STATUSES = ['draft', 'approved'];
  const STATUS_LABELS = { draft: '待确认', approved: '已确认' };
  const VALID_FRESHNESS = ['fresh', 'stale', 'impacted'];
  const FRESHNESS_LABELS = { fresh: 'fresh', stale: 'stale', impacted: 'impacted' };
  const FRESHNESS_PRIORITY = { fresh: 0, impacted: 1, stale: 2 };

  let freshnessMap = {};

  async function setStatus(file, newStatus, newFreshness) {
    try {
      const body = { file, status: newStatus };
      if (newFreshness) body.freshness = newFreshness;
      const resp = await fetch(FEATURE_BASE + '/api/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) return;
      await fetchAndLoadFiles();
      renderTab(state.activeTab);
      updateApprovalBadge();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  }

  async function checkFreshness() {
    try {
      const resp = await fetch(FEATURE_BASE + '/api/freshness');
      if (!resp.ok) return;
      freshnessMap = await resp.json();
      for (const [path, info] of Object.entries(freshnessMap)) {
        const parsed = state.parsed.get(path);
        if (parsed && parsed.frontmatter) {
          parsed.frontmatter.freshness = info.freshness;
          if (parsed.frontmatter.wok) {
            parsed.frontmatter.wok.staleReasons = info.staleReasons;
          }
        }
      }
    } catch (e) {
      console.error('Failed to check freshness:', e);
    }
  }

  async function propagateImpact(changedDoc, impactLevel) {
    try {
      const resp = await fetch(FEATURE_BASE + '/api/freshness/propagate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: changedDoc, impact: impactLevel }),
      });
      if (!resp.ok) return;
      await fetchAndLoadFiles();
    } catch (e) {
      console.error('Failed to propagate impact:', e);
    }
  }

  function renderStatusToggle(file, currentStatus, freshness) {
    const nextIdx = VALID_STATUSES.indexOf(currentStatus) + 1;
    const nextStatus = VALID_STATUSES[nextIdx % VALID_STATUSES.length];
    const cls = currentStatus === 'approved' ? 'approved' : 'draft';
    let html = `<span class="status-toggle ${cls}" data-file="${esc(file)}" data-status="${esc(currentStatus)}" title="点击切换为 ${nextStatus}">${esc(currentStatus)}</span>`;
    if (freshness && freshness !== 'fresh') {
      html += `<span class="status-freshness ${freshness}">${esc(freshness)}</span>`;
    }
    return html;
  }

  function renderFileStatusBar(fileKey) {
    if (!fileKey) return '';
    const parsed = state.parsed.get(fileKey);
    if (!parsed || !parsed.frontmatter) return '';
    const status = parsed.frontmatter.status;
    const freshness = parsed.frontmatter.freshness;
    const info = freshnessMap[fileKey];
    const staleReasons = info?.staleReasons || [];
    let staleHtml = '';
    if (freshness === 'stale' && staleReasons.length) {
      staleHtml = '<div class="stale-banner">';
      staleHtml += `<div class="stale-banner-title">⚠ 此文档可能已过期</div>`;
      staleHtml += `<div class="stale-banner-body">上游 ${staleReasons.join(', ')} 已发生变更</div>`;
      staleHtml += '</div>';
    }
    return `<div class="file-status-bar"><span class="file-status-name">${esc(fileKey)}</span>${renderStatusToggle(fileKey, status, freshness)}</div>${staleHtml}`;
  }

  function bindStatusToggles(root) {
    root.querySelectorAll('.status-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const file = toggle.dataset.file;
        const current = toggle.dataset.status;
        const idx = VALID_STATUSES.indexOf(current);
        const next = VALID_STATUSES[(idx + 1) % VALID_STATUSES.length];
        setStatus(file, next);
      });
    });
  }

  function updateApprovalBadge() {
    let draftCount = 0;
    let staleCount = 0;
    let totalCount = 0;
    for (const [, parsed] of state.parsed) {
      if (!parsed.frontmatter) continue;
      totalCount++;
      if (parsed.frontmatter.status !== 'approved') draftCount++;
      if (parsed.frontmatter.freshness === 'stale') staleCount++;
    }
    const badge = document.getElementById('approval-badge');
    if (!badge) return;
    const parts = [];
    if (draftCount > 0) parts.push(`⬤ ${draftCount} 待确认`);
    if (staleCount > 0) parts.push(`⚠ ${staleCount} stale`);
    if (parts.length > 0) {
      badge.textContent = parts.join(' · ');
      badge.className = 'approval-badge';
      badge.style.display = '';
    } else if (totalCount > 0) {
      badge.textContent = '✓ 全部已确认';
      badge.className = 'approval-badge all-done';
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Global Status Card ──
  function computeFeatureStatus() {
    let hasStale = false, hasBlocking = false, hasDraft = false, allApproved = true, totalCount = 0;
    let blockingCount = 0;
    const checkKey = findFile('_check.md');
    if (checkKey) {
      const check = state.parsed.get(checkKey);
      if (check) {
        const blocks = parseCheckBlocks(check.body);
        const redItems = blocks.filter(b => b.type === 'severity' && b.severity === 'red');
        // Check if red items have open findings (not resolved)
        for (const item of redItems) {
          if (!item.text.includes('✅') && !item.text.includes('→✅')) blockingCount++;
        }
        if (blockingCount > 0) hasBlocking = true;
      }
    }
    for (const [, parsed] of state.parsed) {
      if (!parsed.frontmatter) continue;
      totalCount++;
      if (parsed.frontmatter.status !== 'approved') { hasDraft = true; allApproved = false; }
      if (parsed.frontmatter.freshness === 'stale') hasStale = true;
    }
    if (totalCount === 0) return { status: 'EMPTY', label: '空', color: '#9E9E9E' };
    if (hasBlocking) return { status: 'BLOCKED', label: '阻塞', color: '#CC0000', blockingCount };
    if (hasStale) return { status: 'STALE', label: '过期', color: '#7B1FA2' };
    if (hasDraft) return { status: 'IN_PROGRESS', label: '进行中', color: '#E5A100' };
    // All approved + fresh — check if review converged
    const reviewKey = findFile('_review.md');
    if (reviewKey) {
      const review = state.parsed.get(reviewKey);
      if (review) {
        const rounds = parseReviewReport(review.body);
        const latest = rounds.reduce((a, b) => b.num > a.num ? b : a, rounds[0] || { num: 0, status: '' });
        if (latest.status !== 'converged') return { status: 'READY', label: '待审阅', color: '#22C55E' };
      }
    }
    return { status: 'DONE', label: '完成', color: '#22C55E' };
  }

  function computeNextAction() {
    const defineKey = findFile('_define.md');
    const registryKey = findFile('modules/_registry.md');
    const checkKey = findFile('_check.md');
    const planKey = findFile('_plan.md');
    const reviewKey = findFile('_review.md');

    // Stale docs — find earliest-stage root cause
    const staleDocs = Object.entries(freshnessMap).filter(([, info]) => info.freshness === 'stale');
    if (staleDocs.length) {
      const stageOrder = ['_define.md', '_registry.md', '/design.md', '_check.md', '_plan.md'];
      const skillMap = [
        { action: '需求已变更，重新设计下游文档', detail: '运行 wok-design --affected-only' },
        { action: '模块注册已变更，重新设计受影响模块', detail: '运行 wok-design --affected-only' },
        { action: '模块设计已变更，重新校验', detail: '运行 wok-design-review → wok-plan --refresh' },
        { action: '校验结果已变更，刷新计划', detail: '运行 wok-plan --refresh' },
        { action: '执行计划已变更，重新审查', detail: '运行 wok-code-review' },
      ];
      // Collect root causes from staleReasons
      const allReasons = new Set();
      for (const [, info] of staleDocs) {
        for (const r of (info.staleReasons || [])) allReasons.add(r);
      }
      // Find earliest stage among root causes
      let earliestIdx = stageOrder.length;
      for (const reason of allReasons) {
        for (let i = 0; i < stageOrder.length; i++) {
          if (reason.endsWith(stageOrder[i]) ||
              (stageOrder[i] === '/design.md' && reason.includes('/design.md'))) {
            earliestIdx = Math.min(earliestIdx, i);
            break;
          }
        }
      }
      const rec = skillMap[Math.min(earliestIdx, skillMap.length - 1)];
      return { action: rec.action, detail: `${rec.detail} · ${staleDocs.length} 个文档过期` };
    }

    // Blocking findings
    const fs = computeFeatureStatus();
    if (fs.blockingCount > 0) {
      return { action: `处理 ${fs.blockingCount} 个阻塞项`, detail: '运行 wok-design-review' };
    }

    // Define not approved
    if (defineKey) {
      const p = state.parsed.get(defineKey);
      if (p?.frontmatter?.status !== 'approved') return { action: '确认需求文档', detail: '审批 _define.md' };
    }

    // No registry
    if (!registryKey) return { action: '生成模块设计', detail: '运行 wok-design' };

    // Check design docs
    let hasDraftDesign = false;
    for (const [name, parsed] of state.parsed) {
      if (name.includes('modules/') && parsed.frontmatter?.status !== 'approved') hasDraftDesign = true;
    }
    if (hasDraftDesign) return { action: '审阅并审批设计文档', detail: '切换到设计 tab' };

    // No check
    if (!checkKey) return { action: '校验设计', detail: '运行 wok-design-review' };

    // No plan
    if (!planKey) return { action: '生成执行计划', detail: '运行 wok-plan' };

    // Plan not approved
    const planP = state.parsed.get(planKey);
    if (planP?.frontmatter?.status !== 'approved') return { action: '审阅并审批执行计划', detail: '切换到执行 tab' };

    // Plan approved → implement
    if (planP?.frontmatter?.status === 'approved') return { action: '开始实现', detail: '运行 wok-implement' };

    // Review converged
    if (reviewKey) {
      const review = state.parsed.get(reviewKey);
      if (review) {
        const rounds = parseReviewReport(review.body);
        const latest = rounds.reduce((a, b) => b.num > a.num ? b : a, rounds[0] || {});
        if (latest.status === 'converged') return { action: 'Feature 开发完成', detail: 'Review 已收敛' };
      }
    }

    return { action: '检查管道状态', detail: '' };
  }

  function renderGlobalStatusCard() {
    const card = document.getElementById('global-status-card');
    if (!card || state.parsed.size === 0) { if (card) card.style.display = 'none'; return; }

    const featureStatus = computeFeatureStatus();
    const nextAction = computeNextAction();

    // Remark stats (by type)
    const remarkStats = {
      open: state.notes.filter(n => (n.state || 'open') === 'open').length,
      applied: state.notes.filter(n => n.state === 'applied').length,
      decisions: state.notes.filter(n => n.type === 'decision').length,
      questions: state.notes.filter(n => n.type === 'question').length,
      suggestions: state.notes.filter(n => n.type === 'suggestion').length,
    };

    let html = '<div class="gs-left">';
    html += `<span class="gs-status-dot" style="background:${featureStatus.color}"></span>`;
    html += `<span class="gs-status-label">${esc(featureStatus.label)}</span>`;
    html += `<span class="gs-feature-name">${esc(SYSTEM_NAME)}</span>`;
    html += '</div>';

    html += '<div class="gs-center">';
    const remarkParts = [];
    if (remarkStats.open > 0) remarkParts.push(`${remarkStats.open} 条待处理`);
    if (remarkStats.applied > 0) remarkParts.push(`${remarkStats.applied} 条已应用`);
    if (remarkParts.length) {
      html += `<span class="gs-stat">备注：${remarkParts.join('，')}</span>`;
    }
    const typeParts = [];
    if (remarkStats.decisions > 0) typeParts.push(`${remarkStats.decisions} 条决策`);
    if (remarkStats.questions > 0) typeParts.push(`${remarkStats.questions} 条疑问`);
    if (remarkStats.suggestions > 0) typeParts.push(`${remarkStats.suggestions} 条建议`);
    if (typeParts.length) {
      html += `<span class="gs-stat">类型：${typeParts.join('，')}</span>`;
    }
    html += '</div>';

    html += '<div class="gs-right">';
    html += `<span class="gs-next-action">▶ ${esc(nextAction.action)}</span>`;
    if (nextAction.detail) html += `<span class="gs-next-detail">${esc(nextAction.detail)}</span>`;
    html += '</div>';

    card.innerHTML = html;
    card.style.display = '';
  }

  // ── Back-to-ledger floating panel ──
  let backToLedgerPanel = null;

  function blinkLedgerRow(file, line) {
    const row = document.querySelector(`.ledger-row[data-source-file="${file}"][data-source-line="${line}"]`);
    if (!row) return;
    row.classList.remove('ledger-row-blink');
    void row.offsetWidth;
    row.classList.add('ledger-row-blink');
    setTimeout(() => row.classList.remove('ledger-row-blink'), 5500);
  }

  function showBackToLedgerBtn(title, source, lineNo) {
    hideBackToLedgerBtn();
    const panel = document.createElement('div');
    panel.className = 'back-to-ledger-panel';

    const hint = document.createElement('div');
    hint.className = 'back-to-ledger-hint';
    hint.innerHTML = `<span class="back-to-ledger-source">${esc(source)}</span> <span class="back-to-ledger-line">L${lineNo}</span>`;
    const content = document.createElement('div');
    content.className = 'back-to-ledger-content';
    content.textContent = title;
    const btn = document.createElement('button');
    btn.className = 'back-to-ledger-btn';
    btn.textContent = '← 返回概览';
    btn.addEventListener('click', () => {
      const from = state.ledgerJumpFrom;
      hideBackToLedgerBtn();
      switchTab(from?.tab || 'overview');
      requestAnimationFrame(() => {
        if (from?.ledgerTab) {
          const tabBtn = document.querySelector(`.ledger-tab-btn[data-tab="${from.ledgerTab}"]`);
          if (tabBtn) tabBtn.click();
        }
        if (from?.scrollTo) {
          const main = document.querySelector('main');
          if (main) main.scrollTo({ top: from.scrollTo, behavior: 'smooth' });
        }
        if (from?.rowFile && from?.rowLine) {
          setTimeout(() => blinkLedgerRow(from.rowFile, from.rowLine), 500);
        }
      });
    });

    panel.appendChild(hint);
    panel.appendChild(content);
    panel.appendChild(btn);
    document.body.appendChild(panel);
    backToLedgerPanel = panel;
  }

  function hideBackToLedgerBtn() {
    if (backToLedgerPanel) { backToLedgerPanel.remove(); backToLedgerPanel = null; }
  }

  // ── Overview Tab ──
  function renderOverview() {
    const el = $('#tab-overview');
    let html = '';

    // Pipeline status — each phase shows approved ratio of its documents
    // Execution phase uses step completion + document status
    const planKey = findFile('_plan.md');
    const planParsed = planKey ? state.parsed.get(planKey) : null;
    const planSteps = planParsed ? extractSteps(planParsed.body) : [];
    const planStatus = planParsed?.frontmatter?.status === 'approved' ? 1 : 0;

    const pipelinePhases = [
      { name: 'define', label: '需求', test: (n) => /^_define|^_roadmap|^_findings/.test(n) },
      { name: 'registry', label: '设计', test: (n) => n.includes('modules/') },
      { name: 'check', label: '校验', test: (n) => n === '_check.md' || n.endsWith('/_check.md') },
      { name: 'plan', label: '执行', test: (n) => n === '_plan.md' || n.endsWith('/_plan.md') },
      { name: 'review', label: '审查', test: (n) => n === '_review.md' || n.endsWith('/_review.md') },
    ];

    html += '<div class="overview-section"><h2>Pipeline 状态</h2><div class="pipeline-progress">';
    for (const phase of pipelinePhases) {
      let total, approved, pct, maxFreshness = 'fresh', staleReasons = [];
      if (phase.name === 'plan' && planParsed) {
        const stepsDone = planSteps.filter(s => s.done).length;
        total = planSteps.length + 1;
        approved = stepsDone + planStatus;
        pct = Math.round((approved / total) * 100);
      } else {
        const phaseFiles = [];
        for (const [name, parsed] of state.parsed) {
          if (phase.test(name) && parsed.frontmatter) {
            phaseFiles.push(parsed.frontmatter);
            const f = parsed.frontmatter.freshness;
            if (FRESHNESS_PRIORITY[f] > FRESHNESS_PRIORITY[maxFreshness]) maxFreshness = f;
            const reasons = parsed.frontmatter.wok?.staleReasons || [];
            staleReasons.push(...reasons);
          }
        }
        total = phaseFiles.length;
        approved = phaseFiles.filter(f => f.status === 'approved').length;
        pct = total ? Math.round((approved / total) * 100) : 0;
      }
      const fillCls = maxFreshness !== 'fresh' ? ` ${maxFreshness}` : '';
      html += `<div class="pipeline-phase" title="${phase.label}: ${approved}/${total}${maxFreshness !== 'fresh' ? ' (' + maxFreshness + ')' : ''}">`;
      html += `<div class="pipeline-step"><div class="pipeline-step-fill${fillCls}" style="width:${pct}%"></div></div>`;
      html += `<span class="pipeline-step-title">${phase.label}</span>`;
      html += `</div>`;
    }
    html += '</div></div>';

    // Stale warnings banner
    const staleDocs = [];
    for (const [path, info] of Object.entries(freshnessMap)) {
      if (info.freshness === 'stale' && info.staleReasons && info.staleReasons.length) {
        staleDocs.push({ path, reasons: info.staleReasons });
      }
    }
    if (staleDocs.length) {
      html += '<div class="stale-banner">';
      html += '<div class="stale-banner-title">⚠ 过期文档</div>';
      html += '<div class="stale-banner-body">';
      for (const doc of staleDocs) {
        html += `<span class="stale-banner-item">${esc(doc.path)}: 上游 ${doc.reasons.join(', ')} 已变更</span>`;
      }
      html += '</div>';
      html += '<div class="stale-banner-action">建议：' + esc(computeNextAction().detail) + '</div>';
      html += '</div>';
    }

    // Findings baseline (if _findings.md exists at system level)
    const findingsKey = findFile('_findings.md');
    if (findingsKey) {
      const findings = state.parsed.get(findingsKey);
      html += '<div class="overview-section"><h2>代码探索基线</h2>';
      html += '<details class="findings-details"><summary class="findings-summary">wok-findings 探索结果</summary>';
      html += '<div class="findings-body">' + renderMd(findings.body, findingsKey) + '</div>';
      html += '</details></div>';
    }

    // Brief list — grouped by category
    const docGroups = [
      { title: '需求文档', test: (n) => /^_define|^_roadmap|^_findings/.test(n) },
      { title: '模块设计', test: (n) => n.includes('modules/') },
      { title: '校验文档', test: (n) => n === '_check.md' || n.endsWith('/_check.md') },
      { title: '执行文档', test: (n) => n === '_plan.md' || n.endsWith('/_plan.md') },
      { title: '审查文档', test: (n) => n === '_review.md' || n.endsWith('/_review.md') },
    ];
    const uncategorized = { title: '其他', items: [] };
    const groups = docGroups.map(g => ({ ...g, items: [] }));
    for (const [name, parsed] of state.parsed) {
      const brief = extractBrief(parsed.raw);
      const status = parsed.frontmatter ? parsed.frontmatter.status : '';
      const item = { name, brief, status, freshness: parsed.frontmatter?.freshness };
      const group = groups.find(g => g.test(name));
      (group ? group.items : uncategorized.items).push(item);
    }
    for (const group of [...groups, uncategorized]) {
      if (!group.items.length) continue;
      html += `<div class="overview-section"><h2>${group.title}</h2>`;
      if (group.title === '模块设计') {
        html += '<div class="module-cards">';
        const modMap = new Map();
        for (const item of group.items) {
          const m = item.name.match(/modules\/([^/]+)\/(.+)$/);
          if (!m) continue;
          const modName = m[1];
          const fileName = m[2];
          if (!modMap.has(modName)) modMap.set(modName, []);
          modMap.get(modName).push({ ...item, fileName });
        }
        for (const [modName, files] of modMap) {
          const mainFile = files.find(f => f.fileName === 'design.md') || files[0];
          const status = mainFile.status;
          const freshness = mainFile.freshness;
          const brief = mainFile.brief;
          html += `<div class="module-card" data-module="${modName}">`;
          html += `<div class="module-card-header">`;
          html += `<span class="module-card-name">${esc(modName)}</span>`;
          html += status ? renderStatusToggle(mainFile.name, status, freshness) : '';
          html += `</div>`;
          if (brief) html += `<div class="module-card-brief">${md.render(brief)}</div>`;
          const fileTags = files.map(f => f.fileName.replace('.md', '')).join(' · ');
          html += `<div class="module-card-files">${esc(fileTags)}</div>`;
          html += '</div>';
        }
        html += '</div>';
      } else {
        html += '<ul class="brief-list">';
        for (const item of group.items) {
          html += `<li class="brief-item" data-file="${item.name}"><div class="brief-item-header"><span class="file-name">${esc(item.name)}</span>`;
          html += item.status ? renderStatusToggle(item.name, item.status, item.freshness) : '';
          const briefHtml = item.brief || (item.name === '_review.md' || item.name.endsWith('/_review.md') ? buildReviewBrief(item.name) : null);
          html += `</div>${briefHtml ? md.render(briefHtml) : '<span style="color:#737373">—</span>'}</li>`;
        }
        html += '</ul>';
      }
      html += '</div>';
    }

    // Marker aggregation
    const allMarkers = [];
    for (const [, parsed] of state.parsed) {
      allMarkers.push(...parsed.markers.map(m => ({ ...m })));
    }

    // Marker Ledger (tabbed: DEC / OPEN / ACT)
    const markerTabs = [
      { key: 'decision', label: 'DEC 决策', test: (m) => m.type !== 'OPEN' && m.type !== 'ACTION' },
      { key: 'open', label: 'OPEN 待处理', test: (m) => m.type === 'OPEN' },
      { key: 'action', label: 'ACT 修复动作', test: (m) => m.type === 'ACTION' },
    ];

    html += '<div class="overview-section"><h2>标记账本</h2>';
    html += '<div class="ledger-tabs">';
    for (const tab of markerTabs) {
      const count = allMarkers.filter(tab.test).length;
      html += `<button class="ledger-tab-btn${tab.key === 'decision' ? ' active' : ''}" data-tab="${tab.key}">${tab.label} <span class="ledger-tab-count">${count}</span></button>`;
    }
    html += '</div>';
    html += '<div class="ledger-search-wrap"><input type="text" class="ledger-search" placeholder="搜索标记..." id="ledger-search"></div>';
    html += '<div class="ledger-panels">';

    for (const tab of markerTabs) {
      const items = allMarkers.filter(tab.test);
      html += `<div class="ledger-panel${tab.key === 'decision' ? ' active' : ''}" data-panel="${tab.key}">`;
      if (items.length) {
        html += '<table class="ledger-table"><thead><tr>';
        html += '<th>#</th><th>内容</th><th>来源</th><th>行</th>';
        html += '</tr></thead><tbody>';
        for (let di = 0; di < items.length; di++) {
          const d = items[di];
          const sourceParts = d.file.split('/');
          const sourceLabel = sourceParts.length > 1 ? sourceParts.slice(-2).join('/') : d.file;
          html += `<tr class="ledger-row" data-source-file="${esc(d.file)}" data-source-line="${d.line}">`;
          html += `<td class="ledger-idx">${di + 1}</td>`;
          html += `<td class="ledger-content">${esc(d.title)}</td>`;
          html += `<td class="ledger-source">${esc(sourceLabel)}</td>`;
          html += `<td class="ledger-line">L${d.line}</td>`;
          html += '</tr>';
        }
        html += '</tbody></table>';
      } else {
        html += '<div class="ledger-empty">无</div>';
      }
      html += '</div>';
    }
    html += '</div></div>';

    el.innerHTML = html;

    // Brief item / module card click -> switch to appropriate tab + select module
    el.querySelectorAll('.brief-item').forEach(item => {
      item.addEventListener('click', () => {
        const file = item.dataset.file;
        const modMatch = file.match(/(?:^|\/)modules\/([^/]+)/);
        const modName = modMatch ? modMatch[1] : null;
        if (modName && modName !== '_shared') {
          state.activeModule = modName;
          switchTab('design');
        } else if (file.startsWith('modules/')) {
          state.activeModule = null;
          switchTab('design');
        } else if (file === '_check.md' || file.endsWith('/_check.md')) {
          switchTab('check');
        } else if (file === '_plan.md' || file.endsWith('/_plan.md')) {
          switchTab('execution');
        } else if (file === '_review.md' || file.endsWith('/_review.md')) {
          switchTab('review');
        } else {
          switchTab('requirements');
        }
      });
    });
    el.querySelectorAll('.module-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.status-toggle')) return;
        const mod = card.dataset.module;
        if (mod === '_shared') {
          state.activeModule = '_shared';
        } else {
          state.activeModule = mod;
        }
        switchTab('design');
      });
    });
    // Status toggle click (overview)
    el.querySelectorAll('.status-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const file = toggle.dataset.file;
        const current = toggle.dataset.status;
        const idx = VALID_STATUSES.indexOf(current);
        const next = VALID_STATUSES[(idx + 1) % VALID_STATUSES.length];
        setStatus(file, next);
      });
    });
    // Marker tag click -> navigate to source
    // Decision ledger row click -> navigate
    el.querySelectorAll('.ledger-row').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const file = row.dataset.sourceFile;
        const line = parseInt(row.dataset.sourceLine);
        if (!file) return;
        // Extract row content for context display
        const cells = row.querySelectorAll('td');
        const title = cells[1]?.textContent || '';
        const source = cells[2]?.textContent || file;
        const mainEl = document.querySelector('main');
        const scrollTop = mainEl ? mainEl.scrollTop : 0;
        state.ledgerJumpFrom = {
          tab: 'overview',
          ledgerTab: el.querySelector('.ledger-tab-btn.active')?.dataset.tab || 'decision',
          scrollTo: scrollTop,
          rowFile: file,
          rowLine: line,
          title,
          source,
        };
        const modMatch = file.match(/modules\/([^/]+)/);
        if (modMatch && modMatch[1] !== '_shared') {
          state.activeModule = modMatch[1];
          switchTab('design');
        } else if (file.includes('modules/')) {
          state.activeModule = null;
          switchTab('design');
        } else if (file === '_check.md' || file.endsWith('/_check.md')) {
          switchTab('check');
        } else if (file === '_plan.md' || file.endsWith('/_plan.md')) {
          switchTab('execution');
        } else {
          switchTab('requirements');
        }
        setTimeout(() => {
          const target = document.querySelector(`[data-source-file="${file}"][data-source-line="${line}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showBackToLedgerBtn(state.ledgerJumpFrom.title, state.ledgerJumpFrom.source, line);
        }, 200);
      });
    });
    // Ledger tab switching
    el.querySelectorAll('.ledger-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.ledger-tab-btn').forEach(b => b.classList.remove('active'));
        el.querySelectorAll('.ledger-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = el.querySelector(`.ledger-panel[data-panel="${btn.dataset.tab}"]`);
        if (panel) panel.classList.add('active');
        const search = el.querySelector('#ledger-search');
        if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
      });
    });
    // Ledger search (within active panel)
    const ledgerSearch = el.querySelector('#ledger-search');
    if (ledgerSearch) {
      ledgerSearch.addEventListener('input', () => {
        const q = ledgerSearch.value.toLowerCase();
        const activePanel = el.querySelector('.ledger-panel.active');
        if (!activePanel) return;
        activePanel.querySelectorAll('.ledger-row').forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(q) ? '' : 'none';
        });
      });
    }
  }

  function extractBrief(raw) {
    const match = raw.match(/^---\n[\s\S]*?\n---\s*\n([\s\S]*?)(?=\n## )/);
    if (!match) return '';
    const blockquotes = match[1].match(/^>\s*(.+)$/gm);
    return blockquotes ? blockquotes.map(b => b.replace(/^>\s*/, '')).join(' ') : '';
  }

  // ── Requirements Tab ──
  function renderRequirements() {
    const el = $('#tab-requirements');
    let html = '';
    const roadmapKey = findFile('_roadmap.md');
    const defineKey = findFile('_define.md');
    if (!defineKey && !roadmapKey) {
      el.innerHTML = '<p style="color:#737373;">未找到需求文档（_define.md / _roadmap.md）</p>';
      return;
    }
    html += renderFileStatusBar(defineKey);
    if (defineKey) html += renderMd(state.parsed.get(defineKey).body, defineKey);
    if (roadmapKey) {
      html += renderFileStatusBar(roadmapKey);
      html += renderMd(state.parsed.get(roadmapKey).body, roadmapKey);
    }
    el.innerHTML = html;
    bindStatusToggles(el);
  }

  // ── Design Tab ──
  function renderDesign() {
    const el = $('#tab-design');
    const registryKey = findFile('modules/_registry.md');
    if (!registryKey) {
      el.innerHTML = '<p style="color:#737373;">未找到模块注册表（modules/_registry.md）</p>';
      return;
    }
    const registry = state.parsed.get(registryKey);

    // Extract module names from parsed files
    const modules = [];
    for (const name of state.files.keys()) {
      const m = name.match(/modules\/([^/]+)\/design\.md$/);
      if (m && m[1] !== '_shared') modules.push(m[1]);
    }

    // Collect _shared files
    const sharedFiles = [];
    for (const name of state.files.keys()) {
      if (name.match(/modules\/_shared\//)) sharedFiles.push(name);
    }

    if (state.activeModule && !modules.includes(state.activeModule) && state.activeModule !== '_shared') {
      state.activeModule = null;
    }

    let html = '<div class="design-layout">';
    html += '<div class="module-tree"><h3>模块</h3>';
    html += `<div class="module-item${!state.activeModule ? ' active' : ''}" data-module="">注册表</div>`;
    for (const mod of modules) {
      html += `<div class="module-item${state.activeModule === mod ? ' active' : ''}" data-module="${mod}">${mod}</div>`;
    }
    if (sharedFiles.length) {
      html += '<div class="module-tree-divider"></div>';
      html += `<div class="module-item${state.activeModule === '_shared' ? ' active' : ''}" data-module="_shared">共享</div>`;
    }
    html += '</div>';

    html += '<div class="module-detail">';
    if (!state.activeModule) {
      html += renderFileStatusBar(registryKey);
      html += renderMd(registry.body, registryKey);
    } else if (state.activeModule === '_shared') {
      for (const f of sharedFiles) {
        html += renderFileStatusBar(f);
        html += renderMd(state.parsed.get(f).body, f);
      }
    } else {
      const designKey = findFile(`modules/${state.activeModule}/design.md`);
      const decisionsKey = findFile(`modules/${state.activeModule}/decisions.md`);
      if (designKey) {
        html += '<div class="module-doc-section">';
        html += renderFileStatusBar(designKey);
        html += renderMd(state.parsed.get(designKey).body, designKey);
        html += '</div>';
      }
      if (decisionsKey) {
        html += '<div class="module-doc-section">';
        html += renderFileStatusBar(decisionsKey);
        html += renderMd(state.parsed.get(decisionsKey).body, decisionsKey);
        html += '</div>';
      }
      if (!designKey && !decisionsKey) html = '<p style="color:#737373;">未找到该模块的设计文档</p>';
    }
    html += '</div></div>';

    el.innerHTML = html;

    // Module tree click
    el.querySelectorAll('.module-item').forEach(item => {
      item.addEventListener('click', () => {
        state.activeModule = item.dataset.module || null;
        renderDesign();
      });
    });
    bindStatusToggles(el);
  }

  // ── Check Tab ──
  function parseCheckBlocks(body) {
    const lines = body.split('\n');
    const blocks = [];
    let cur = { type: 'static', lines: [] };

    function flush() {
      const text = cur.lines.join('\n').trim();
      if (text) blocks.push({ type: cur.type, severity: cur.severity, text });
      cur = { type: 'static', lines: [] };
    }

    for (const line of lines) {
      // Finding: line starts with severity emoji
      if (/^[🔴🟡🟢]/.test(line)) {
        const severity = line.includes('🔴') ? 'red' : line.includes('🟡') ? 'yellow' : 'green';
        flush();
        cur = { type: 'severity', severity, lines: [line] };
        continue;
      }
      // [OPEN] action item header — #### level stays in current block, ### level starts new block
      if (/^#{2,4}\s+\[OPEN\]/.test(line)) {
        const level = (line.match(/^(#+)/) || [''])[0].length;
        const severity = line.includes('🔴') ? 'red' : line.includes('🟡') ? 'yellow' : 'green';
        if (level >= 4 && cur.type === 'severity') {
          // #### [OPEN] under a finding — append to current block
          cur.lines.push(line);
        } else {
          // ### [OPEN] (standalone section) — new block
          flush();
          cur = { type: 'severity', severity, lines: [line] };
        }
        continue;
      }
      // ## or ### section header ends current severity block
      if (/^#{1,3}\s+(?!\[)/.test(line) && cur.type === 'severity') {
        flush();
        cur = { type: 'static', lines: [line] };
        continue;
      }
      cur.lines.push(line);
    }
    flush();
    return blocks;
  }

  function renderCheck() {
    const el = $('#tab-check');
    const checkKey = findFile('_check.md');
    if (!checkKey) {
      el.innerHTML = '<p style="color:#737373;">未找到校验文档（_check.md）</p>';
      return;
    }
    const check = state.parsed.get(checkKey);
    const blocks = parseCheckBlocks(check.body);

    let html = renderFileStatusBar(checkKey);
    html += '<div class="severity-filters">';
    html += '<button class="severity-btn active" data-severity="all">全部</button>';
    html += '<button class="severity-btn" data-severity="red">🔴 阻塞</button>';
    html += '<button class="severity-btn" data-severity="yellow">🟡 建议</button>';
    html += '<button class="severity-btn" data-severity="green">🟢 通过</button>';
    html += '</div>';
    html += '<div class="check-content">';
    for (const block of blocks) {
      const rendered = renderMd(block.text, checkKey);
      if (block.type === 'severity') {
        html += `<div class="severity-item" data-severity="${block.severity}">${rendered}</div>`;
      } else {
        html += rendered;
      }
    }
    html += '</div>';

    el.innerHTML = html;
    bindStatusToggles(el);

    el.querySelectorAll('.severity-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const severity = btn.dataset.severity;
        filterSeverity(severity);
      });
    });
  }

  function filterSeverity(severity) {
    const content = document.querySelector('.check-content');
    if (!content) return;
    const items = content.querySelectorAll('.severity-item');
    items.forEach(item => {
      if (severity === 'all') {
        item.style.display = '';
      } else {
        item.style.display = item.dataset.severity === severity ? '' : 'none';
      }
    });
  }

  // ── Execution Tab ──
  function renderExecution() {
    const el = $('#tab-execution');
    const planKey = findFile('_plan.md');
    if (!planKey) {
      el.innerHTML = '<p style="color:#737373;">未找到执行计划（_plan.md）</p>';
      return;
    }
    const plan = state.parsed.get(planKey);

    const steps = extractSteps(plan.body);
    const doneCount = steps.filter(s => s.done).length;
    const totalCount = steps.length;
    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

    let html = '';

    // Status bar
    html += renderFileStatusBar(planKey);

    // Progress section: vertical stack
    html += '<div class="exec-progress-section">';
    html += '<div class="exec-progress-bar"><div class="exec-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="exec-progress-meta">';
    html += `<span class="exec-stat done">${doneCount} 完成</span>`;
    html += `<span class="exec-stat pending">${totalCount - doneCount} 待执行</span>`;
    html += `<span class="exec-stat pct">${pct}%</span>`;
    html += '</div>';
    html += '<button class="btn-sm" id="exec-refresh-btn">进度刷新</button>';
    html += '<div class="exec-step-chips">';
    for (const step of steps) {
      const cls = step.done ? 'done' : 'pending';
      html += `<span class="exec-chip ${cls}" data-step="${step.num}" title="${esc(step.title)}">${step.done ? '✓ ' : ''}Step ${step.num}</span>`;
    }
    html += '</div>';
    html += '</div>';

    // Render markdown body
    html += '<div class="plan-content">' + renderMd(plan.body, planKey) + '</div>';

    el.innerHTML = html;
    bindStatusToggles(el);

    // Color step headings based on status
    el.querySelectorAll('.plan-content h3').forEach(h3 => {
      const stepMatch = h3.textContent.match(/^Step (\d+):/);
      if (!stepMatch) return;
      const stepNum = parseInt(stepMatch[1]);
      const step = steps.find(s => s.num === stepNum);
      if (!step) return;
      // Wrap step content in a step-block div for visual separation
      const wrapper = document.createElement('div');
      wrapper.className = 'step-block' + (step.done ? ' step-done' : '');
      wrapper.id = 'step-' + stepNum;
      while (h3.nextSibling && !(h3.nextSibling.nodeName === 'H3' && h3.nextSibling.textContent.match(/^Step \d+:/))) {
        wrapper.appendChild(h3.nextSibling);
      }
      h3.parentNode.insertBefore(wrapper, h3.nextSibling);
      wrapper.insertBefore(h3, wrapper.firstChild);

      if (step.done) {
        h3.style.color = '#525252';
        h3.style.textDecoration = 'line-through';
      }
    });

    // Chip click -> scroll to step
    el.querySelectorAll('.exec-chip[data-step]').forEach(chip => {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        const target = el.querySelector('#step-' + chip.dataset.step);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Refresh button
    el.querySelector('#exec-refresh-btn')?.addEventListener('click', () => {
      fetchAndLoadFiles();
    });
  }

  function extractSteps(body) {
    const steps = [];
    const lines = body.split('\n');
    let currentStep = null;
    for (const line of lines) {
      const match = line.match(/^### Step (\d+):\s+\[([ x])\]\s+(.+)$/);
      if (match) {
        if (currentStep) steps.push(currentStep);
        currentStep = {
          num: parseInt(match[1]),
          done: match[2] === 'x',
          title: match[3],
        };
      }
    }
    if (currentStep) steps.push(currentStep);
    return steps;
  }

  // ── Review Tab ──
  function buildReviewBrief(name) {
    const review = state.parsed.get(name);
    if (!review) return null;
    const rounds = parseReviewReport(review.body);
    if (!rounds.length) return null;
    const latest = rounds.reduce((a, b) => b.num > a.num ? b : a);
    const open = Object.values(latest.sections).flat().filter(f => !f.isResolved);
    const resolved = (latest.sections.Resolved || []).length;
    const red = open.filter(f => f.severity === '🔴').length;
    const orange = open.filter(f => f.severity === '🟠').length;
    const yellow = open.filter(f => f.severity === '🟡').length;
    const parts = [];
    if (latest.badgeClass) {
      const label = latest.status === 'converged' ? '✅ 已收敛' : '⚠️ 达到上限';
      parts.push(label);
    }
    parts.push(`Round ${latest.num}`);
    if (red) parts.push(`${red} 🔴`);
    if (orange) parts.push(`${orange} 🟠`);
    if (yellow) parts.push(`${yellow} 🟡`);
    if (resolved) parts.push(`${resolved} ✅`);
    if (!open.length && !resolved) parts.push('无问题');
    return parts.join(' · ');
  }

  function parseReviewReport(body) {
    const rounds = [];
    const lines = body.split('\n');
    let currentRound = null;
    let currentSection = null;
    let currentFinding = null;
    let currentInsight = null;

    function flushFinding() {
      if (currentInsight && currentFinding) {
        currentFinding.insight = currentInsight;
        currentInsight = null;
      }
      if (currentFinding) {
        if (currentSection) currentSection.findings.push(currentFinding);
        currentFinding = null;
      }
    }

    function flushSection() {
      flushFinding();
      if (currentSection && currentRound) {
        currentRound.sections[currentSection.name] = currentSection.findings;
      }
      currentSection = null;
    }

    for (const line of lines) {
      // Header
      const headerMatch = line.match(/^#\s+Code Review Report/);
      if (headerMatch) continue;

      // Round header: ## Round N — status
      const roundMatch = line.match(/^## Round (\d+)\s*[—\-]\s*(.*)/);
      if (roundMatch) {
        flushSection();
        if (currentRound) rounds.push(currentRound);
        const num = parseInt(roundMatch[1]);
        const statusText = roundMatch[2].trim();
        let status = '';
        let badgeClass = '';
        if (statusText.includes('Converged')) { status = 'converged'; badgeClass = 'converged'; }
        else if (statusText.includes('Max rounds')) { status = 'max-rounds'; badgeClass = 'max-rounds'; }
        currentRound = { num, status, badgeClass, meta: {}, sections: {} };
        continue;
      }

      // Round metadata
      const metaMatch = line.match(/^>\s*(\w+):\s*(.*)/);
      if (metaMatch && currentRound && !currentSection) {
        currentRound.meta[metaMatch[1]] = metaMatch[2].trim();
        continue;
      }

      // Section header: ### Open / ### Resolved / ### Accepted
      const secMatch = line.match(/^###\s+(Open|Resolved|Accepted)/);
      if (secMatch && currentRound) {
        flushSection();
        currentSection = { name: secMatch[1], findings: [] };
        continue;
      }

      // Separator
      if (line.match(/^---+$/)) {
        flushSection();
        continue;
      }

      // Finding line: - [severity] file:line — title
      const findingMatch = line.match(/^-\s+\[(🔴|🟠|🟡|🔴→✅|🟠→✅)\]\s+(.+?)(?::(\d+|file))?\s*(?:—|--|-)\s+(.*)/);
      if (findingMatch && currentSection) {
        flushFinding();
        const severityRaw = findingMatch[1];
        const isResolved = severityRaw.includes('→✅');
        const severity = isResolved ? severityRaw.split('→')[0] : severityRaw;
        // Determine finding state from section name or inline marker
        let findingState = 'open';
        if (isResolved) findingState = 'resolved';
        if (currentSection.name === 'Accepted') findingState = 'accepted';
        // Check inline (accepted) marker in title
        if (findingMatch[4] && /\(accepted\)/i.test(findingMatch[4])) findingState = 'accepted';
        currentFinding = {
          severity,
          isResolved,
          state: findingState,
          file: findingMatch[2],
          line: findingMatch[3] || 'file',
          title: findingMatch[4].replace(/\s*\(accepted\)\s*/i, ''),
          details: [],
          insight: null,
        };
        continue;
      }

      // Finding detail lines (indented)
      if (line.startsWith('  ') && currentFinding) {
        const trimmed = line.trimStart();
        // Insight block detection
        const insightMatch = trimmed.match(/^>\s*\*\*(🔍 原因分析|🔧 修改方案|📐 一致性评估)\*\*/);
        if (insightMatch) {
          if (!currentFinding.insight) currentFinding.insight = {};
          const type = insightMatch[1].startsWith('🔍') ? 'analysis' : insightMatch[1].startsWith('🔧') ? 'fix' : 'consistency';
          currentFinding.insight[type] = (currentFinding.insight[type] || '') + trimmed.replace(/^>\s*\*\*[^*]+\*\*\s*/, '');
          continue;
        }
        if (trimmed.startsWith('>') && currentFinding.insight) {
          const lastKey = Object.keys(currentFinding.insight).pop();
          if (lastKey) currentFinding.insight[lastKey] += '\n' + trimmed.replace(/^>\s*/, '');
          continue;
        }
        currentFinding.details.push(trimmed);
        continue;
      }

      // Non-matching lines — if inside finding, ignore; else flush
      if (currentSection || currentRound) {
        if (line.trim() === '') continue;
      }
    }

    flushSection();
    if (currentRound) rounds.push(currentRound);
    return rounds;
  }

  function renderReview() {
    const el = $('#tab-review');
    const reviewKey = findFile('_review.md');
    if (!reviewKey) {
      el.innerHTML = '<p style="color:#737373;">未找到审查报告（_review.md）</p>';
      return;
    }
    const review = state.parsed.get(reviewKey);
    const rounds = parseReviewReport(review.body);

    let html = renderFileStatusBar(reviewKey);

    // Sticky nav: stats + round groups with finding tags
    const sortedRounds = [...rounds].sort((a, b) => a.num - b.num);
    let totalFindings = 0;
    let totalResolved = 0;
    let totalAccepted = 0;
    for (const r of sortedRounds) {
      const all = [...(r.sections.Open || []), ...(r.sections.Resolved || []), ...(r.sections.Accepted || [])];
      totalFindings += all.length;
      totalResolved += all.filter(f => f.isResolved).length;
      totalAccepted += all.filter(f => f.state === 'accepted').length;
    }

    html += '<div class="review-nav">';
    const statsParts = [];
    statsParts.push(`${totalResolved} resolved`);
    if (totalAccepted) statsParts.push(`${totalAccepted} accepted`);
    statsParts.push(`${totalFindings - totalResolved - totalAccepted} open`);
    html += `<div class="review-nav-stats">${statsParts.join(' · ')}</div>`;
    html += '<div class="review-nav-rounds">';
    for (const round of sortedRounds) {
      const allFindings = [...(round.sections.Open || []), ...(round.sections.Resolved || []), ...(round.sections.Accepted || [])];
      if (!allFindings.length) continue;
      html += '<div class="review-nav-round">';
      html += `<span class="review-nav-round-label">Round ${round.num}</span>`;
      html += '<div class="review-nav-tags">';
      for (let i = 0; i < allFindings.length; i++) {
        const f = allFindings[i];
        const fId = `r${round.num}-f${i}`;
        const sevCls = f.severity === '🔴' ? 'red' : f.severity === '🟠' ? 'orange' : 'yellow';
        const shortTitle = f.title.length > 20 ? f.title.slice(0, 20) + '…' : f.title;
        const fState = f.state || (f.isResolved ? 'resolved' : 'open');
        const stateTag = fState !== 'open' ? ` ${fState}` : '';
        html += `<span class="review-nav-tag ${sevCls}${stateTag}" data-target="${fId}" title="${esc(f.file)}:${esc(f.line)} — ${esc(f.title)}">${esc(f.severity)} ${esc(shortTitle)}</span>`;
      }
      html += '</div></div>';
    }
    html += '</div></div>';

    // Render round content (newest first)
    const reverseRounds = [...sortedRounds].reverse();
    for (const round of reverseRounds) {
      html += `<div class="review-round" id="review-round-${round.num}">`;
      html += '<div class="review-round-header">';
      html += `<span class="review-round-title">Round ${round.num}</span>`;
      if (round.badgeClass) {
        html += `<span class="review-round-badge ${round.badgeClass}">${esc(round.status === 'converged' ? 'Converged' : 'Max rounds')}</span>`;
      }
      html += '</div>';

      // Round meta
      if (round.meta.findings || round.meta.files) {
        html += '<div class="review-round-meta">';
        if (round.meta.reviewed_at) html += `<span>${esc(round.meta.reviewed_at)}</span>`;
        if (round.meta.files) html += `<span>${esc(round.meta.files)}</span>`;
        if (round.meta.findings) html += `<span>${esc(round.meta.findings)}</span>`;
        if (round.meta.simplify) html += `<span>simplify: ${esc(round.meta.simplify)}</span>`;
        html += '</div>';
      }

      // Open section
      const openFindings = round.sections.Open || [];
      if (openFindings.length) {
        html += '<div class="review-section">';
        html += '<div class="review-section-title">Open</div>';
        for (let i = 0; i < openFindings.length; i++) {
          html += renderFinding(openFindings[i], `r${round.num}-f${i}`);
        }
        html += '</div>';
      }

      // Resolved section
      const resolvedFindings = round.sections.Resolved || [];
      const openLen = openFindings.length;
      if (resolvedFindings.length) {
        html += '<div class="review-section">';
        html += '<div class="review-section-title">Resolved</div>';
        for (let i = 0; i < resolvedFindings.length; i++) {
          html += renderFinding(resolvedFindings[i], `r${round.num}-f${openLen + i}`);
        }
        html += '</div>';
      }

      // Accepted section
      const acceptedFindings = round.sections.Accepted || [];
      const accOffset = openLen + resolvedFindings.length;
      if (acceptedFindings.length) {
        html += '<div class="review-section">';
        html += '<div class="review-section-title">Accepted</div>';
        for (let i = 0; i < acceptedFindings.length; i++) {
          html += renderFinding(acceptedFindings[i], `r${round.num}-f${accOffset + i}`);
        }
        html += '</div>';
      }

      html += '</div>';
    }

    if (!rounds.length) {
      html += '<p style="color:#737373;">报告内容为空</p>';
    }

    el.innerHTML = html;
    bindStatusToggles(el);

    // Tag click -> scroll to finding
    el.querySelectorAll('.review-nav-tag').forEach(tag => {
      tag.style.cursor = 'pointer';
      tag.addEventListener('click', () => {
        const target = el.querySelector(`#${CSS.escape(tag.dataset.target)}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderFinding(f, fId) {
    const severityClass = f.severity === '🔴' ? 'red' : f.severity === '🟠' ? 'orange' : 'yellow';
    const state = f.state || (f.isResolved ? 'resolved' : 'open');
    const stateClass = state === 'resolved' ? ' review-finding-resolved' : state === 'accepted' ? ' review-finding-accepted' : '';
    const stateBadge = state !== 'open' ? `<span class="finding-state-tag ${state}">${state === 'resolved' ? 'resolved' : 'accepted'}</span>` : '';
    const wrapResolved = state !== 'open';
    let html = `<div class="review-finding${stateClass}" id="${fId}" data-severity="${severityClass}" data-state="${state}" style="scroll-margin-top:120px">`;
    if (wrapResolved) {
      html += `<details class="review-resolved-details"><summary class="review-resolved-summary">【审查证据】[${state === 'resolved' ? 'RESOLVED' : 'ACCEPTED'}] ${esc(f.file)}:${esc(f.line)} — ${esc(f.title)}</summary>`;
    }
    html += '<div class="review-finding-header">';
    html += `<span class="review-finding-severity ${severityClass}">${esc(f.severity)}</span>`;
    html += `<span class="review-finding-location">${esc(f.file)}:${esc(f.line)}</span>`;
    html += stateBadge;
    html += `<span class="review-finding-title">${esc(f.title)}</span>`;
    html += '</div>';

    if (f.details.length) {
      html += '<div class="review-finding-body">';
      for (const d of f.details) {
        html += `<p>${esc(d)}</p>`;
      }
      html += '</div>';
    }

    // Insight blocks (from cr-insight)
    if (f.insight) {
      const hasAny = f.insight.analysis || f.insight.fix || f.insight.consistency;
      if (hasAny) {
        html += `<details class="review-insight-details"><summary class="review-insight-summary">【审查证据】${esc(f.file)}:${esc(f.line)} — ${esc(f.title)}</summary>`;
      }
      if (f.insight.analysis) {
        html += `<div class="review-insight analysis"><div class="review-insight-header">🔍 原因分析</div>${renderMd(f.insight.analysis, f.file || '')}</div>`;
      }
      if (f.insight.fix) {
        html += `<div class="review-insight fix"><div class="review-insight-header">🔧 修改方案</div>${renderMd(f.insight.fix, f.file || '')}</div>`;
      }
      if (f.insight.consistency) {
        html += `<div class="review-insight consistency"><div class="review-insight-header">📐 一致性评估</div>${renderMd(f.insight.consistency, f.file || '')}</div>`;
      }
      if (hasAny) {
        html += `</details>`;
      }
    }

    if (wrapResolved) {
      html += `</details>`;
    }
    html += '</div>';
    return html;
  }

  // ── Markdown Rendering with semantic markers ──
  function renderMd(body, sourceFile) {
    if (!md) return '<pre>' + esc(body) + '</pre>';
    const env = { sourceFile };

    // Pre-process: wrap semantic markers in divs
    let processed = body;

    // ### [DECISION] or ## [DECISION] → <div class="marker decision">
    processed = processed.replace(
      /^(#{2,3})\s+\[DECISION\]\s+(.+)$/gm,
      (match, hashes, title) => {
        const level = hashes.length;
        return `</div><div class="marker decision">\n${'#'.repeat(level)} ${esc(title)}\n`;
      }
    );

    // ### [OPEN] or ## [OPEN] → <div class="marker open">
    processed = processed.replace(
      /^(#{2,3})\s+\[OPEN\]\s+(.+)$/gm,
      (match, hashes, title) => {
        const level = hashes.length;
        return `</div><div class="marker open">\n${'#'.repeat(level)} ${esc(title)}\n`;
      }
    );

    // - [ACTION] → <div class="marker action">
    processed = processed.replace(
      /^-\s+\[ACTION\]\s+(.+)$/gm,
      (match, title) => {
        return `<div class="marker action"><span class="checkbox">☐</span> ${esc(title)}</div>`;
      }
    );

    const html = md.render(processed, env);
    return `<div data-source-file="${esc(sourceFile)}">${html}</div>`;
  }

  let selectedNoteType = 'decision';
  let multiSelectMode = false;
  const selectedNoteIds = new Set();
  let activeNoteFilter = 'default';
  let editingNoteId = null;

  // ── Notes Panel ──
  async function loadNotes() {
    try {
      const resp = await fetch(FEATURE_BASE + '/api/notes');
      if (!resp.ok) return;
      state.notes = await resp.json();
      renderNotes();
    } catch {
      state.notes = [];
      renderNotes();
    }
  }

  async function saveNote(note) {
    try {
      const resp = await fetch(FEATURE_BASE + '/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      if (resp.ok) {
        const created = await resp.json();
        state.notes.unshift(created);
        clearAllHighlights();
        renderNotes();
      }
    } catch (e) {
      console.error('Failed to save note:', e);
    }
  }

  async function deleteNoteRemote(id) {
    try {
      await fetch(FEATURE_BASE + '/api/notes/' + id, { method: 'DELETE' });
      state.notes = state.notes.filter(n => n.id !== id);
      renderNotes();
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  }

  async function deleteNoteRef(noteId, refIdx) {
    try {
      await fetch(FEATURE_BASE + '/api/notes/' + noteId + '/refs/' + refIdx, { method: 'DELETE' });
      const note = state.notes.find(n => n.id === noteId);
      if (note && note.refs) {
        note.refs.splice(refIdx, 1);
      }
      renderNotes();
    } catch (e) {
      console.error('Failed to delete ref:', e);
    }
  }

  const NOTE_STATE_LABELS = { open: '待处理', applied: '已应用', resolved: '已解决', rejected: '已拒绝', deferred: '已延期' };

  function getFilteredNotes() {
    const byUpdated = (a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
    switch (activeNoteFilter) {
      case 'all': return [...state.notes].sort(byUpdated);
      default: // 'focus' — applied (pending user confirmation) + open (pending skill), applied first
        const applied = state.notes.filter(n => n.state === 'applied' || n.state === 'resolved').sort(byUpdated);
        const open = state.notes.filter(n => (n.state || 'open') === 'open').sort(byUpdated);
        return [...applied, ...open];
    }
  }

  async function updateRemarkState(id, newState) {
    try {
      const resp = await fetch(FEATURE_BASE + '/api/notes/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      if (resp.ok) {
        const updated = await resp.json();
        const idx = state.notes.findIndex(n => n.id === id);
        if (idx >= 0) state.notes[idx] = updated;
        renderNotes();
      }
    } catch (e) {
      console.error('Failed to update remark state:', e);
    }
  }

  function renderNotes() {
    const filtered = getFilteredNotes();
    if (!filtered.length) {
      notesList.innerHTML = `<p style="color:#737373;font-size:12px;text-align:center;padding:24px;">${state.notes.length ? '当前筛选无结果' : '暂无备注'}</p>`;
      return;
    }
    const typeLabel = { decision: '决策', question: '疑问', suggestion: '建议' };
    let html = '';
    for (const note of filtered) {
      const noteState = note.state || 'open';
      const isLocked = noteState !== 'open' && noteState !== 'deferred';
      const canEdit = noteState === 'open' || noteState === 'deferred';
      const isEditing = editingNoteId === note.id;
      const selected = selectedNoteIds.has(note.id);
      html += `<div class="note-card${selected ? ' note-selected' : ''}${multiSelectMode ? ' note-multiselect' : ''}${isLocked ? ' note-locked' : ''}${isEditing ? ' editing' : ''}" data-id="${note.id}">`;
      if (multiSelectMode) {
        html += `<div class="note-checkbox"><input type="checkbox" class="note-select-cb" data-id="${note.id}" ${selected ? 'checked' : ''}></div>`;
      }
      html += `<div class="note-card-header">`;
      html += `<span class="note-type">${typeLabel[note.type] || note.type}</span>`;
      // State dropdown
      const stateMenuItems = {
        open: [{ state: 'deferred', label: '搁置' }, { state: 'rejected', label: '拒绝' }],
        applied: [{ state: 'resolved', label: '确认解决' }, { state: 'rejected', label: '拒绝' }],
        resolved: [{ state: 'open', label: '重新打开' }],
        rejected: [{ state: 'open', label: '重新打开' }],
        deferred: [{ state: 'open', label: '重新打开' }],
      };
      const stateLabel = NOTE_STATE_LABELS[noteState] || noteState;
      html += `<div class="note-state-dropdown">`;
      html += `<span class="note-state-badge ${noteState}">${stateLabel}</span>`;
      html += `<div class="note-state-menu">`;
      for (const t of (stateMenuItems[noteState] || [])) {
        html += `<button class="note-state-option" data-note-id="${note.id}" data-target-state="${t.state}">${t.label}</button>`;
      }
      html += `</div></div>`;
      html += `<div class="note-card-actions">`;
      if (canEdit) {
        html += `<button class="note-action-btn note-edit-btn" data-action="edit" data-id="${note.id}" title="编辑">编辑</button>`;
      }
      if (!isLocked) {
        html += `<button class="note-action-btn" data-action="delete" data-id="${note.id}" title="删除">删除</button>`;
      }
      html += `</div></div>`;
      if (!isLocked) {
        html += `<div class="note-content">${esc(note.content)}</div>`;
      } else {
        html += `<div class="note-content note-locked-content">${esc(note.content)}</div>`;
      }
      if (note.refs && note.refs.length) {
        html += '<div class="note-refs">';
        for (let ri = 0; ri < note.refs.length; ri++) {
          const ref = note.refs[ri];
          const stale = ref.stale;
          const staleLabel = stale ? '<span class="stale-label">[失效]</span> ' : '';
          const staleClass = stale ? ' stale' : '';
          const refLabel = ref.endLine && ref.endLine !== ref.line
            ? `${esc(ref.file)}:${ref.line}-${ref.endLine}`
            : `${esc(ref.file)}:${ref.line}`;
          html += `<span class="note-ref${staleClass}" data-file="${esc(ref.file)}" data-line="${ref.line}" title="${esc(ref.text || ref.absPath || '')}">${staleLabel}${refLabel}<span class="ref-remove" data-note-id="${note.id}" data-ref-idx="${ri}">&times;</span></span>`;
        }
        html += '</div>';
      }
      // Applied/resolved metadata: summary, impact, changedFiles, staleDownstream
      if (noteState === 'applied' || noteState === 'resolved') {
        const hasDetail = note.summary || note.changedFiles || note.impact || note.staleDownstream;
        if (hasDetail) {
          html += '<div class="note-applied-detail">';
          if (note.summary) {
            html += `<div class="note-applied-summary">${esc(note.summary)}</div>`;
          }
          const metaTags = [];
          if (note.impact) {
            const impactColors = { major: '#CC0000', minor: '#F59E0B', patch: '#737373' };
            const impactLabels = { major: 'MAJOR', minor: 'MINOR', patch: 'PATCH' };
            metaTags.push(`<span class="note-meta-tag" style="color:${impactColors[note.impact] || '#737373'}">${impactLabels[note.impact] || note.impact}</span>`);
          }
          if (note.appliedBy) {
            metaTags.push(`<span class="note-meta-tag">by ${esc(note.appliedBy)}</span>`);
          }
          if (metaTags.length) {
            html += `<div class="note-applied-meta">${metaTags.join(' ')}</div>`;
          }
          if (note.changedFiles && note.changedFiles.length) {
            html += `<div class="note-applied-files"><span class="note-applied-label">变更：</span>${note.changedFiles.map(f => `<span class="note-file-tag">${esc(f)}</span>`).join('')}</div>`;
          }
          if (note.staleDownstream && note.staleDownstream.length) {
            html += `<div class="note-applied-files"><span class="note-applied-label">影响：</span>${note.staleDownstream.map(f => `<span class="note-file-tag stale">${esc(f)}</span>`).join('')}</div>`;
          }
          html += '</div>';
        }
      }
      html += '</div>';
    }
    notesList.innerHTML = html;

    // State dropdown: badge click toggles menu
    notesList.querySelectorAll('.note-state-badge').forEach(badge => {
      badge.style.cursor = 'pointer';
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = badge.closest('.note-state-dropdown');
        document.querySelectorAll('.note-state-dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
        dd.classList.toggle('open');
      });
    });
    // State dropdown: option click -> transition
    notesList.querySelectorAll('.note-state-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = opt.dataset.noteId;
        const target = opt.dataset.targetState;
        opt.closest('.note-state-dropdown').classList.remove('open');
        updateRemarkState(id, target);
      });
    });

    // Multi-select checkbox
    if (multiSelectMode) {
      notesList.querySelectorAll('.note-select-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = cb.dataset.id;
          if (cb.checked) selectedNoteIds.add(id);
          else selectedNoteIds.delete(id);
          renderNotes();
          updateMultiSelectUI();
        });
      });
      notesList.querySelectorAll('.note-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.note-action-btn') || e.target.closest('.note-ref') || e.target.closest('.note-select-cb') || e.target.closest('.note-state-dropdown')) return;
          const id = card.dataset.id;
          if (selectedNoteIds.has(id)) selectedNoteIds.delete(id);
          else selectedNoteIds.add(id);
          renderNotes();
          updateMultiSelectUI();
        });
      });
    }

    // Single note actions
    notesList.querySelectorAll('.note-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (btn.dataset.action === 'delete') deleteSingleNote(id);
        if (btn.dataset.action === 'edit') startEditNote(id);
      });
    });

    // Ref click -> toggle highlight + navigate
    notesList.querySelectorAll('.note-ref').forEach(ref => {
      ref.addEventListener('click', (e) => {
        if (e.target.classList.contains('ref-remove')) {
          e.stopPropagation();
          const noteId = e.target.dataset.noteId;
          const refIdx = parseInt(e.target.dataset.refIdx);
          deleteNoteRef(noteId, refIdx);
          return;
        }
        toggleRefHighlight(ref.dataset.file, parseInt(ref.dataset.line));
      });
    });
  }

  function updateMultiSelectUI() {
    if (generatePromptBtn) {
      generatePromptBtn.style.display = multiSelectMode ? '' : 'none';
      generatePromptBtn.disabled = selectedNoteIds.size === 0;
      generatePromptBtn.textContent = selectedNoteIds.size > 0
        ? `生成 Prompt (${selectedNoteIds.size})`
        : '生成 Prompt';
    }
  }

  function addNote() {
    const content = noteTextarea.value.trim();
    if (!content) return;

    if (editingNoteId !== null) {
      fetch(`${FEATURE_BASE}/api/notes/${editingNoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, type: selectedNoteType, refs: pendingRefs.slice() }),
      }).then(r => r.json()).then(saved => {
        const idx = state.notes.findIndex(n => n.id === editingNoteId);
        if (idx !== -1) state.notes[idx] = saved;
        cancelEdit();
        renderNotes();
      }).catch(() => {
        const idx = state.notes.findIndex(n => n.id === editingNoteId);
        if (idx !== -1) state.notes[idx] = { ...state.notes[idx], content, type: selectedNoteType, refs: pendingRefs.slice() };
        cancelEdit();
        renderNotes();
      });
      return;
    }

    const note = {
      type: selectedNoteType,
      content,
      refs: pendingRefs.slice(),
    };
    pendingRefs = [];
    noteTextarea.value = '';
    saveNote(note);
  }

  function startEditNote(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    if (editingNoteId !== null && editingNoteId !== noteId) cancelEdit();
    editingNoteId = noteId;
    noteTextarea.value = note.content;
    pendingRefs = (note.refs || []).map(r => ({ ...r }));
    selectedNoteType = note.type || 'decision';
    document.querySelectorAll('.note-type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === selectedNoteType);
    });
    renderPendingRefs();
    addNoteBtn.textContent = '更新';
    noteTextarea.focus();
    noteTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    renderNotes();
  }

  function cancelEdit() {
    editingNoteId = null;
    noteTextarea.value = '';
    pendingRefs = [];
    selectedNoteType = 'decision';
    document.querySelectorAll('.note-type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'decision');
    });
    addNoteBtn.textContent = '添加';
    renderPendingRefs();
  }

  function deleteSingleNote(id) {
    deleteNoteRemote(id);
  }

  function generatePrompt() {
    if (!selectedNoteIds.size) return;
    const selected = state.notes.filter(n => selectedNoteIds.has(n.id));
    const ids = selected.map(n => n.id).join(', ');
    let prompt = `/wok-apply-remarks\n\n`;
    prompt += `仅处理以下 ID 的备注：${ids}\n\n`;
    prompt += `## 待处理备注数据\n\n`;
    prompt += '```jsonl\n';
    for (const note of selected) {
      const entry = {
        id: note.id,
        type: note.type,
        state: note.state || 'open',
        content: note.content,
        refs: (note.refs || []).map(r => ({ file: r.file, line: r.line, endLine: r.endLine, text: r.text })),
        createdAt: note.createdAt,
      };
      prompt += JSON.stringify(entry, null, 0) + '\n';
    }
    prompt += '```\n';
    navigator.clipboard.writeText(prompt).then(() => {
      generatePromptBtn.textContent = '已复制';
      setTimeout(() => updateMultiSelectUI(), 1500);
    });
  }

  function toggleMultiSelect() {
    multiSelectMode = !multiSelectMode;
    if (!multiSelectMode) {
      selectedNoteIds.clear();
    }
    multiSelectBtn.textContent = multiSelectMode ? '取消' : '选择应用';
    multiSelectBtn.classList.toggle('active', multiSelectMode);
    updateMultiSelectUI();
    renderNotes();
  }

  // ── Ref popover (text selection) ──
  let pendingRefs = [];
  let currentSelection = null;
  const highlightedRefs = new Set();

  function fileToTab(file) {
    if (file.endsWith('_define.md') || file.endsWith('_roadmap.md')) return 'requirements';
    if (file.includes('modules/')) return 'design';
    if (file === '_check.md' || file.endsWith('/_check.md')) return 'check';
    if (file === '_plan.md' || file.endsWith('/_plan.md')) return 'execution';
    if (file === '_review.md' || file.endsWith('/_review.md')) return 'review';
    return 'requirements';
  }

  function toggleRefHighlight(file, line) {
    const key = `${file}:${line}`;
    if (highlightedRefs.has(key)) {
      highlightedRefs.delete(key);
    } else {
      highlightedRefs.add(key);
      const tab = fileToTab(file);
      switchTab(tab);
    }
    requestAnimationFrame(() => applyHighlights(file, line));
  }

  function applyHighlights(scrollFile, scrollLine) {
    document.querySelectorAll('.source-highlight').forEach(el => el.classList.remove('source-highlight'));
    for (const key of highlightedRefs) {
      const [f, l] = key.split(':');
      document.querySelectorAll(`[data-source-file="${f}"][data-source-line="${l}"]`).forEach(el => {
        el.classList.add('source-highlight');
      });
    }
    if (scrollFile && scrollLine) {
      const el = document.querySelector(`[data-source-file="${scrollFile}"][data-source-line="${scrollLine}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    updateRefVisualStates();
    renderPendingRefs();
  }

  function clearAllHighlights() {
    highlightedRefs.clear();
    document.querySelectorAll('.source-highlight').forEach(el => el.classList.remove('source-highlight'));
    updateRefVisualStates();
    renderPendingRefs();
  }

  function updateRefVisualStates() {
    document.querySelectorAll('.note-ref, .ref-chip').forEach(el => {
      const key = `${el.dataset.file}:${el.dataset.line}`;
      el.classList.toggle('active', highlightedRefs.has(key));
    });
  }

  function renderPendingRefs() {
    const container = $('#pending-refs');
    if (!pendingRefs.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = pendingRefs.map((ref, i) => {
      const key = `${ref.file}:${ref.line}`;
      const active = highlightedRefs.has(key) ? ' active' : '';
      const label = ref.endLine && ref.endLine !== ref.line
        ? `${esc(ref.file)}:${ref.line}-${ref.endLine}`
        : `${esc(ref.file)}:${ref.line}`;
      return `<span class="ref-chip${active}" data-file="${esc(ref.file)}" data-line="${ref.line}" title="${esc(ref.text)}">${label}<span class="ref-remove" data-idx="${i}">&times;</span></span>`;
    }).join('');

    container.querySelectorAll('.ref-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('ref-remove')) return;
        toggleRefHighlight(chip.dataset.file, parseInt(chip.dataset.line));
      });
    });

    container.querySelectorAll('.ref-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const removed = pendingRefs.splice(idx, 1)[0];
        highlightedRefs.delete(`${removed.file}:${removed.line}`);
        document.querySelectorAll(`[data-source-file="${removed.file}"][data-source-line="${removed.line}"]`).forEach(el => {
          el.classList.remove('source-highlight');
        });
        renderPendingRefs();
      });
    });
  }

  document.addEventListener('mouseup', (e) => {
    if (notesPanel.contains(e.target)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      refPopover.style.display = 'none';
      return;
    }

    const anchor = selection.anchorNode;
    const anchorEl = anchor?.nodeType === 3 ? anchor.parentElement : anchor;
    const sourceFile = anchorEl?.closest('[data-source-file]')?.dataset.sourceFile || '';
    const sourceLine = parseInt(anchorEl?.closest('[data-source-line]')?.dataset.sourceLine || 0);

    if (!sourceFile) {
      refPopover.style.display = 'none';
      return;
    }

    const focus = selection.focusNode;
    const focusEl = focus?.nodeType === 3 ? focus.parentElement : focus;
    const endLine = parseInt(focusEl?.closest('[data-source-line]')?.dataset.sourceLine || sourceLine);

    currentSelection = {
      text: selection.toString().trim(),
      file: sourceFile,
      line: sourceLine,
      endLine: endLine,
    };

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    refPopover.style.display = 'block';
    refPopover.style.left = (rect.left + rect.width / 2 - 40) + 'px';
    refPopover.style.top = (rect.top - 30 + window.scrollY) + 'px';
  });

  refPopover.addEventListener('click', () => {
    if (currentSelection) {
      pendingRefs.push({ file: currentSelection.file, line: currentSelection.line, endLine: currentSelection.endLine, text: currentSelection.text });
      window.getSelection().removeAllRanges();
      refPopover.style.display = 'none';
      if (!notesPanel.classList.contains('open')) {
        notesPanel.classList.add('open');
        notesToggleBtn.classList.add('panel-open');
        const stb = $('#scroll-top-btn');
        if (stb) stb.classList.add('panel-open');
      }
      renderPendingRefs();
      refPopover.textContent = `已添加 (${pendingRefs.length})`;
      setTimeout(() => { refPopover.innerHTML = '&#x1F4CC; 添加引用'; }, 1000);
    }
  });

  // ── Utilities ──
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──
  function init() {
    initMarkdown();
    loadNotes();

    // Tab clicks
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        hideBackToLedgerBtn();
        switchTab(btn.dataset.tab);
      });
    });

    // Auto-load files from server
    fetchAndLoadFiles();

    // Notes panel toggle
    const scrollTopBtn = $('#scroll-top-btn');
    notesToggleBtn.addEventListener('click', () => {
      notesPanel.classList.toggle('open');
      notesToggleBtn.classList.toggle('panel-open');
      if (scrollTopBtn) scrollTopBtn.classList.toggle('panel-open');
    });

    // Scroll to top
    if (scrollTopBtn) {
      scrollTopBtn.addEventListener('click', () => {
        const main = document.querySelector('main');
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Add note
    addNoteBtn.addEventListener('click', addNote);

    // Note type toggle buttons
    $$('.note-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.note-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedNoteType = btn.dataset.type;
      });
    });

    // Multi-select / generate prompt
    multiSelectBtn.addEventListener('click', toggleMultiSelect);
    generatePromptBtn.addEventListener('click', generatePrompt);

    // Note filter buttons
    $$('.notes-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.notes-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeNoteFilter = btn.dataset.filter;
        renderNotes();
      });
    });

    // Help modal
    const helpOverlay = $('#notes-help-overlay');
    $('#notes-help-btn').addEventListener('click', () => { helpOverlay.style.display = 'flex'; });
    $('#notes-help-close').addEventListener('click', () => { helpOverlay.style.display = 'none'; });
    helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) helpOverlay.style.display = 'none'; });

    // Global click: close state dropdowns
    document.addEventListener('click', () => {
      document.querySelectorAll('.note-state-dropdown.open').forEach(d => d.classList.remove('open'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
