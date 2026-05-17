(function () {
  'use strict';

  const SYSTEM_NAME = '{{SYSTEM_NAME}}';
  const STORAGE_KEY = 'wok-notes-' + SYSTEM_NAME;

  // ── State ──
  const state = {
    files: new Map(),      // fileName -> raw text
    parsed: new Map(),     // fileName -> { frontmatter, body, markers }
    activeTab: 'overview',
    notes: [],
    activeModule: null,
    dirHandle: null,       // File System Access API handle for refresh
  };

  // ── DOM refs ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const welcome = $('#welcome');
  const openDirBtn = $('#open-dir-btn');
  const dirInput = $('#dir-input');
  const notesPanel = $('#notes-panel');
  const notesToggleBtn = $('#notes-toggle-btn');
  const notesList = $('#notes-list');
  const noteTextarea = $('#note-textarea');
  const noteType = $('#note-type');
  const addNoteBtn = $('#add-note-btn');
  const copyAllBtn = $('#copy-all-btn');
  const refPopover = $('#ref-popover');

  // ── markdown-it setup ──
  let md;
  function initMarkdown() {
    md = window.markdownit({
      html: true,
      linkify: true,
      typographer: false,
    });

    // Source line tracking: inject data-source-file and data-source-line
    const defaultRender = md.renderer.rules.paragraph_open || function (tokens, idx, options) {
      return options.renderer.openTag(tokens, idx);
    };
    md.renderer.rules.paragraph_open = function (tokens, idx, options, env) {
      const line = tokens[idx].map && tokens[idx].map[0];
      if (line != null && env && env.sourceFile) {
        tokens[idx].attrSet('data-source-file', env.sourceFile);
        tokens[idx].attrSet('data-source-line', line);
      }
      return defaultRender(tokens, idx, options, env);
    };
  }

  // ── File Reading ──
  async function openDirectory() {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        state.dirHandle = dirHandle;
        await readDirectoryHandle(dirHandle);
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.warn('File System Access API failed, falling back:', e);
          dirInput.click();
        }
      }
    } else {
      dirInput.click();
    }
  }

  async function readDirectoryHandle(dirHandle) {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        // Recurse into phase subdirectories (e.g. p1-xxx/)
        for await (const sub of entry.values()) {
          if (sub.kind === 'file' && sub.name.endsWith('.md')) {
            const file = await sub.getFile();
            files.push(file);
          }
        }
      } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        // System-level files (e.g. _roadmap.md)
        const file = await entry.getFile();
        files.push(file);
      }
    }
    await loadFiles(files);
  }

  async function loadFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.name.endsWith('.md'));
    for (const file of files) {
      const text = await file.text();
      // Use relative path from webkitRelativePath as key (includes phase dir)
      const key = file.webkitRelativePath || file.name;
      state.files.set(key, text);
      state.parsed.set(key, parseMarkdown(text, key));
    }
    onFilesLoaded();
  }

  dirInput.addEventListener('change', (e) => {
    if (e.target.files.length) loadFiles(e.target.files);
  });

  // ── Parsing ──
  function parseMarkdown(text, fileName) {
    const frontmatter = extractFrontmatter(text);
    const body = frontmatter ? text.slice(frontmatter.raw.length).trim() : text;
    const markers = extractMarkers(body);
    return { frontmatter: frontmatter ? frontmatter.data : null, body, markers, raw: text };
  }

  function extractFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const data = {};
    match[1].split('\n').forEach(line => {
      const [key, ...rest] = line.split(':');
      if (key && rest.length) {
        let val = rest.join(':').trim();
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(s => s.trim());
        }
        data[key.trim()] = val;
      }
    });
    return { data, raw: match[0] };
  }

  function extractMarkers(body) {
    const markers = [];
    const lines = body.split('\n');
    for (const line of lines) {
      const hMatch = line.match(/^###?\s+\[(DECISION|OPEN)\]\s+(.+)$/);
      if (hMatch) {
        markers.push({ type: hMatch[1], title: hMatch[2] });
        continue;
      }
      const aMatch = line.match(/^-\s+\[ACTION\]\s+(.+)$/);
      if (aMatch) {
        markers.push({ type: 'ACTION', title: aMatch[1] });
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
    renderTab(state.activeTab);
  }

  function renderTab(tab) {
    switch (tab) {
      case 'overview': renderOverview(); break;
      case 'requirements': renderRequirements(); break;
      case 'design': renderDesign(); break;
      case 'check': renderCheck(); break;
      case 'execution': renderExecution(); break;
    }
  }

  // ── Overview Tab ──
  function renderOverview() {
    const el = $('#tab-overview');
    let html = '';

    // Pipeline progress (aggregate across all phases)
    const phaseKeys = new Set();
    for (const [key] of state.parsed) {
      const phase = extractPhase(key);
      if (phase) phaseKeys.add(phase);
    }

    const pipelineFiles = [
      { name: 'define', suffix: '_define.md' },
      { name: 'registry', suffix: 'modules/_registry.md' },
      { name: 'check', suffix: '_check.md' },
      { name: 'plan', suffix: '_plan.md' },
    ];
    const approvedCount = pipelineFiles.filter(s => {
      const key = findFile(s.suffix);
      const p = key ? state.parsed.get(key) : null;
      return p && p.frontmatter && p.frontmatter.status === 'approved';
    }).length;

    html += '<div class="overview-section"><h2>Pipeline 进度</h2><div class="pipeline-progress">';
    pipelineFiles.forEach((s, i) => {
      const key = findFile(s.suffix);
      const p = key ? state.parsed.get(key) : null;
      const done = p && p.frontmatter && p.frontmatter.status === 'approved';
      const current = !done && p && (p.frontmatter && p.frontmatter.status !== 'approved');
      html += `<div class="pipeline-step${done ? ' done' : ''}${current && i === approvedCount ? ' current' : ''}" title="${s.name}"></div>`;
    });
    html += '</div></div>';

    // Brief list
    html += '<div class="overview-section"><h2>文档概要</h2><ul class="brief-list">';
    for (const [name, parsed] of state.parsed) {
      const brief = extractBrief(parsed.raw);
      const status = parsed.frontmatter ? parsed.frontmatter.status : '';
      html += `<li class="brief-item" data-file="${name}"><span class="file-name">${name} [${status}]</span><br>${brief || '—'}</li>`;
    }
    html += '</ul></div>';

    // Marker aggregation
    const allMarkers = [];
    for (const [, parsed] of state.parsed) {
      allMarkers.push(...parsed.markers.map(m => ({ ...m })));
    }
    const decisionCount = allMarkers.filter(m => m.type === 'DECISION').length;
    const openCount = allMarkers.filter(m => m.type === 'OPEN').length;
    const actionCount = allMarkers.filter(m => m.type === 'ACTION').length;

    html += '<div class="overview-section"><h2>语义标记</h2><div class="marker-aggregate">';
    if (decisionCount) html += `<div class="marker-count decision">DECISION ${decisionCount}</div>`;
    if (openCount) html += `<div class="marker-count open">OPEN ${openCount}</div>`;
    if (actionCount) html += `<div class="marker-count action">ACTION ${actionCount}</div>`;
    if (!decisionCount && !openCount && !actionCount) html += '<span style="color:#737373;font-size:13px;">无语义标记</span>';
    html += '</div>';

    // Open items highlighted
    if (openCount > 0) {
      html += '<div style="margin-top:12px;">';
      for (const m of allMarkers.filter(m => m.type === 'OPEN')) {
        html += `<div class="marker open" style="padding:8px 12px;margin-bottom:4px;"><strong>${esc(m.title)}</strong></div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    el.innerHTML = html;

    // Brief item click -> switch to appropriate tab
    el.querySelectorAll('.brief-item').forEach(item => {
      item.addEventListener('click', () => {
        const file = item.dataset.file;
        if (file.includes('/modules/')) switchTab('design');
        else if (file.endsWith('/_check.md')) switchTab('check');
        else if (file.endsWith('/_plan.md')) switchTab('execution');
        else switchTab('requirements');
      });
    });
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
    if (defineKey) html += renderMd(state.parsed.get(defineKey).body, defineKey);
    if (roadmapKey) html += '<hr>' + renderMd(state.parsed.get(roadmapKey).body, roadmapKey);
    if (!defineKey && !roadmapKey) html = '<p style="color:#737373;">未找到需求文档（_define.md / _roadmap.md）</p>';
    el.innerHTML = html;
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
      const m = name.match(/\/modules\/([^/]+)\/design\.md$/);
      if (m && m[1] !== '_shared') modules.push(m[1]);
    }

    if (state.activeModule && !modules.includes(state.activeModule)) {
      state.activeModule = modules[0] || null;
    }
    if (!state.activeModule && modules.length) state.activeModule = modules[0];

    let html = '<div class="design-layout">';
    html += '<div class="module-tree"><h3>模块</h3>';
    // Registry link
    html += `<div class="module-item${!state.activeModule ? ' active' : ''}" data-module="">注册表</div>`;
    for (const mod of modules) {
      html += `<div class="module-item${state.activeModule === mod ? ' active' : ''}" data-module="${mod}">${mod}</div>`;
    }
    html += '</div>';

    html += '<div class="module-detail">';
    if (!state.activeModule) {
      html += renderMd(registry.body, registryKey);
    } else {
      const designKey = findFile(`modules/${state.activeModule}/design.md`);
      const decisionsKey = findFile(`modules/${state.activeModule}/decisions.md`);
      if (designKey) html += renderMd(state.parsed.get(designKey).body, designKey);
      if (decisionsKey) html += '<hr>' + renderMd(state.parsed.get(decisionsKey).body, decisionsKey);
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
  }

  // ── Check Tab ──
  function renderCheck() {
    const el = $('#tab-check');
    const checkKey = findFile('_check.md');
    if (!checkKey) {
      el.innerHTML = '<p style="color:#737373;">未找到校验文档（_check.md）</p>';
      return;
    }
    const check = state.parsed.get(checkKey);

    let html = '<div class="severity-filters">';
    html += '<button class="severity-btn active" data-severity="all">全部</button>';
    html += '<button class="severity-btn" data-severity="red">阻塞</button>';
    html += '<button class="severity-btn" data-severity="yellow">建议</button>';
    html += '<button class="severity-btn" data-severity="green">通过</button>';
    html += '</div>';
    html += '<div class="check-content">' + renderMd(check.body, checkKey) + '</div>';

    el.innerHTML = html;

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
    const blockedCount = steps.filter(s => s.blocked).length;
    const totalCount = steps.length;
    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

    let html = '';

    // Progress bar
    html += '<div class="exec-progress-section">';
    html += '<div class="exec-progress-bar"><div class="exec-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="exec-progress-meta">';
    html += `<span class="exec-stat done">${doneCount} 完成</span>`;
    if (blockedCount) html += `<span class="exec-stat blocked">${blockedCount} 阻塞</span>`;
    html += `<span class="exec-stat pending">${totalCount - doneCount - blockedCount} 待执行</span>`;
    html += `<span class="exec-stat pct">${pct}%</span>`;
    html += '</div>';

    // Step status chips
    html += '<div class="exec-step-chips">';
    for (const step of steps) {
      const cls = step.done ? 'done' : step.blocked ? 'blocked' : 'pending';
      const icon = step.done ? '✓' : step.blocked ? '!' : '';
      html += `<span class="exec-chip ${cls}" title="${esc(step.title)}">${icon} Step ${step.num}</span>`;
    }
    html += '</div></div>';

    // Refresh button
    html += '<button class="btn-sm refresh-btn" id="exec-refresh-btn">刷新</button>';

    // Render markdown body
    html += '<div class="plan-content">' + renderMd(plan.body, planKey) + '</div>';

    el.innerHTML = html;

    // Color step headings based on status
    el.querySelectorAll('.plan-content h3').forEach(h3 => {
      const stepMatch = h3.textContent.match(/^Step (\d+):/);
      if (!stepMatch) return;
      const stepNum = parseInt(stepMatch[1]);
      const step = steps.find(s => s.num === stepNum);
      if (!step) return;
      if (step.done) {
        h3.style.color = '#525252';
        h3.style.textDecoration = 'line-through';
      } else if (step.blocked) {
        h3.style.color = 'var(--accent)';
      }
    });

    // Refresh button
    el.querySelector('#exec-refresh-btn')?.addEventListener('click', async () => {
      if (state.dirHandle) {
        await readDirectoryHandle(state.dirHandle);
      }
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
          blocked: false,
          title: match[3],
        };
        continue;
      }
      if (currentStep && line.match(/^>\s*⚠️/)) {
        currentStep.blocked = true;
      }
    }
    if (currentStep) steps.push(currentStep);
    return steps;
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

    // Wrap severity items for check tab filtering
    processed = processed.replace(
      /^(-\s*\[.\]\s*(?:🔴|🟡|🟢)\s*.+)$/gm,
      (match) => {
        let severity = 'green';
        if (match.includes('🔴')) severity = 'red';
        else if (match.includes('🟡')) severity = 'yellow';
        return `<div class="severity-item" data-severity="${severity}">${match}</div>`;
      }
    );

    const html = md.render(processed, env);
    return html;
  }

  // ── Notes Panel ──
  function loadNotes() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      state.notes = stored ? JSON.parse(stored) : [];
    } catch {
      state.notes = [];
    }
    renderNotes();
  }

  function saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
  }

  function renderNotes() {
    if (!state.notes.length) {
      notesList.innerHTML = '<p style="color:#737373;font-size:12px;text-align:center;padding:24px;">暂无备注</p>';
      return;
    }
    let html = '';
    for (const note of state.notes) {
      html += `<div class="note-card">`;
      html += `<div class="note-type">[${noteType || 'decision'}] ${note.type}</div>`;
      html += `<div class="note-content">${esc(note.content)}</div>`;
      if (note.refs && note.refs.length) {
        html += '<div class="note-refs">';
        for (const ref of note.refs) {
          html += `<span class="note-ref" data-file="${esc(ref.file)}" data-line="${ref.line}">${esc(ref.file)}:${ref.line}</span>`;
        }
        html += '</div>';
      }
      html += '</div>';
    }
    notesList.innerHTML = html;

    // Ref click -> scroll to source
    notesList.querySelectorAll('.note-ref').forEach(ref => {
      ref.addEventListener('click', () => {
        scrollToSource(ref.dataset.file, parseInt(ref.dataset.line));
      });
    });
  }

  function addNote() {
    const content = noteTextarea.value.trim();
    if (!content) return;
    const note = {
      id: Date.now(),
      type: noteType.value,
      content,
      refs: pendingRefs.slice(),
    };
    state.notes.unshift(note);
    pendingRefs = [];
    noteTextarea.value = '';
    saveNotes();
    renderNotes();
  }

  function copyAllNotes() {
    if (!state.notes.length) return;
    const text = state.notes.map(n => {
      let line = `[${n.type}] ${n.content}`;
      if (n.refs && n.refs.length) {
        line += '\n  ref: ' + n.refs.map(r => `${r.file}:${r.line}`).join(', ');
      }
      return line;
    }).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      copyAllBtn.textContent = '已复制';
      setTimeout(() => { copyAllBtn.textContent = '复制全部'; }, 1500);
    });
  }

  function scrollToSource(file, line) {
    // Find the element with matching data-source-file and data-source-line
    const targets = document.querySelectorAll(`[data-source-file="${file}"][data-source-line="${line}"]`);
    if (targets.length) {
      targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      targets[0].classList.add('source-highlight');
      setTimeout(() => targets[0].classList.remove('source-highlight'), 2000);
    }
  }

  // ── Ref popover (text selection) ──
  let pendingRefs = [];
  let currentSelection = null;

  document.addEventListener('mouseup', (e) => {
    // Don't show popover inside notes panel
    if (notesPanel.contains(e.target)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      refPopover.style.display = 'none';
      return;
    }

    currentSelection = {
      text: selection.toString().trim(),
      file: e.target.closest('[data-source-file]')?.dataset.sourceFile || '',
      line: parseInt(e.target.closest('[data-source-line]')?.dataset.sourceLine || 0),
    };

    if (!currentSelection.file) {
      refPopover.style.display = 'none';
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    refPopover.style.display = 'block';
    refPopover.style.left = (rect.left + rect.width / 2 - 40) + 'px';
    refPopover.style.top = (rect.top - 30 + window.scrollY) + 'px';
  });

  refPopover.addEventListener('click', () => {
    if (currentSelection) {
      pendingRefs.push({ file: currentSelection.file, line: currentSelection.line, text: currentSelection.text });
      window.getSelection().removeAllRanges();
      refPopover.style.display = 'none';
      // Visual feedback
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
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Open directory
    openDirBtn.addEventListener('click', openDirectory);

    // Notes panel toggle
    notesToggleBtn.addEventListener('click', () => {
      notesPanel.classList.toggle('open');
      notesToggleBtn.classList.toggle('panel-open');
    });

    // Add note
    addNoteBtn.addEventListener('click', addNote);

    // Copy all notes
    copyAllBtn.addEventListener('click', copyAllNotes);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
