(function () {
  'use strict';

  const SYSTEM_NAME = '{{SYSTEM_NAME}}';
  const SERVER_URL = '{{SERVER_URL}}';

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
      const base = SERVER_URL || '';
      const resp = await fetch(base + '/api/files');
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const filePaths = await resp.json();

      state.files.clear();
      state.parsed.clear();

      for (const path of filePaths) {
        const fileResp = await fetch(base + '/' + encodeURIComponent(path));
        if (!fileResp.ok) continue;
        const text = await fileResp.text();
        state.files.set(path, text);
        state.parsed.set(path, parseMarkdown(text, path));
      }
      onFilesLoaded();
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

    // Findings baseline (if _findings.md exists at system level)
    const findingsKey = findFile('_findings.md');
    if (findingsKey) {
      const findings = state.parsed.get(findingsKey);
      html += '<div class="overview-section"><h2>代码探索基线</h2>';
      html += '<details class="findings-details"><summary class="findings-summary">wok-findings 探索结果</summary>';
      html += '<div class="findings-body">' + renderMd(findings.body, findingsKey) + '</div>';
      html += '</details></div>';
    }

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
    return `<div data-source-file="${esc(sourceFile)}">${html}</div>`;
  }

  let selectedNoteType = 'decision';

  // ── Notes Panel ──
  async function loadNotes() {
    try {
      const resp = await fetch(SERVER_URL + '/api/notes');
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
      const resp = await fetch(SERVER_URL + '/api/notes', {
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
      await fetch(SERVER_URL + '/api/notes/' + id, { method: 'DELETE' });
      state.notes = state.notes.filter(n => n.id !== id);
      renderNotes();
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  }

  async function deleteNoteRef(noteId, refIdx) {
    try {
      await fetch(SERVER_URL + '/api/notes/' + noteId + '/refs/' + refIdx, { method: 'DELETE' });
      const note = state.notes.find(n => n.id === noteId);
      if (note && note.refs) {
        note.refs.splice(refIdx, 1);
      }
      renderNotes();
    } catch (e) {
      console.error('Failed to delete ref:', e);
    }
  }

  function renderNotes() {
    if (!state.notes.length) {
      notesList.innerHTML = '<p style="color:#737373;font-size:12px;text-align:center;padding:24px;">暂无备注</p>';
      return;
    }
    const typeLabel = { decision: '决策', question: '疑问', suggestion: '建议' };
    let html = '';
    for (const note of state.notes) {
      html += `<div class="note-card" data-id="${note.id}">`;
      html += `<div class="note-card-header">`;
      html += `<span class="note-type">${typeLabel[note.type] || note.type}</span>`;
      html += `<div class="note-card-actions">`;
      html += `<button class="note-action-btn" data-action="copy" data-id="${note.id}" title="复制">复制</button>`;
      html += `<button class="note-action-btn" data-action="delete" data-id="${note.id}" title="删除">删除</button>`;
      html += `</div></div>`;
      html += `<div class="note-content">${esc(note.content)}</div>`;
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
      html += '</div>';
    }
    notesList.innerHTML = html;

    // Single note actions
    notesList.querySelectorAll('.note-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (btn.dataset.action === 'copy') copySingleNote(id);
        else if (btn.dataset.action === 'delete') deleteSingleNote(id);
      });
    });

    // Ref click -> toggle highlight + navigate
    // Ref × click -> delete ref
    notesList.querySelectorAll('.note-ref').forEach(ref => {
      ref.addEventListener('click', (e) => {
        if (e.target.classList.contains('ref-remove')) {
          e.stopPropagation();
          const noteId = parseInt(e.target.dataset.noteId);
          const refIdx = parseInt(e.target.dataset.refIdx);
          deleteNoteRef(noteId, refIdx);
          return;
        }
        toggleRefHighlight(ref.dataset.file, parseInt(ref.dataset.line));
      });
    });
  }

  function addNote() {
    const content = noteTextarea.value.trim();
    if (!content) return;
    const note = {
      type: selectedNoteType,
      content,
      refs: pendingRefs.slice(),
    };
    pendingRefs = [];
    noteTextarea.value = '';
    saveNote(note);
  }

  function copySingleNote(id) {
    const note = state.notes.find(n => n.id === id);
    if (!note) return;
    const typeLabel = { decision: '决策', question: '疑问', suggestion: '建议' };
    let text = `[${typeLabel[note.type] || note.type}] ${note.content}`;
    if (note.refs && note.refs.length) {
      text += '\n  ref: ' + note.refs.map(r => `${r.file}:${r.line}`).join(', ');
    }
    navigator.clipboard.writeText(text);
  }

  function deleteSingleNote(id) {
    deleteNoteRemote(id);
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

  // ── Ref popover (text selection) ──
  let pendingRefs = [];
  let currentSelection = null;
  const highlightedRefs = new Set();

  function fileToTab(file) {
    if (file.endsWith('_define.md') || file.endsWith('_roadmap.md')) return 'requirements';
    if (file.includes('modules/')) return 'design';
    if (file.endsWith('_check.md')) return 'check';
    if (file.endsWith('_plan.md')) return 'execution';
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
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Auto-load files from server
    fetchAndLoadFiles();

    // Notes panel toggle
    notesToggleBtn.addEventListener('click', () => {
      notesPanel.classList.toggle('open');
      notesToggleBtn.classList.toggle('panel-open');
    });

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

    // Copy all notes
    copyAllBtn.addEventListener('click', copyAllNotes);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
