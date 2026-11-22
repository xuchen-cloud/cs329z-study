/**
 * Build the standalone publication-grade HTML course documentation from Markdown files.
 * Math is typeset at build time using the bundled KaTeX distribution.
 * Run: node tools/build_html.mjs
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { renderCourseNavigation } from './course-navigation.mjs';
import katex from './vendor/katex/katex-0.19.1.min.cjs';
import { studyCases } from './study-cases.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'html');
const lectures = fs
  .readdirSync(root)
  .filter((f) => /^\d\d-.*\.md$/.test(f))
  .sort();

const groups = [
  ['课程导览', ['README.md']],
  ['一 · 基础与核心组件', lectures.slice(0, 4)],
  ['二 · 架构、记忆与优化', lectures.slice(4, 9)],
  ['三 · 数据飞轮与评测工程', lectures.slice(9, 14)],
  ['四 · 安全防护与前沿应用', lectures.slice(14, 19)],
  [
    '工程实践与代码指南',
    [
      'exercises/HW1-从零搭建Agent-Harness.md',
      'exercises/HW2-评测Agent.md',
      'exercises/学期项目-设计构建与评测.md',
      'exercises/Paper-Video-论文讲解与复现.md',
      'code-guide.md',
    ],
  ],
];

groups.push(['阅读说明', ['course-guide.md', 'docs/editorial-notes.md']]);

const files = groups.flatMap((g) => g[1]);
const ids = Object.fromEntries(
  files.map((f, i) => [
    f,
    i === 0 ? 'overview' : /^\d\d-/.test(f) ? 'lecture' + f.slice(0, 2) : 'lab' + i,
  ])
);

const esc = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const plain = (s) =>
  s
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (s) =>
  s
    .toLowerCase()
    .replaceAll('`', '')
    .replace(/[^\p{L}\p{N}\p{M}\-_ ]/gu, '')
    .replaceAll(' ', '-');

// Keep only the presentation tree. Chapter titles and search snippets use textContent,
// which otherwise includes the hidden TeX annotation a second time.
function renderMath(tex, displayMode, file) {
  try {
    const result = katex.renderToString(tex.trim(), { output: 'mathml', displayMode, throwOnError: true });
    return result.replace(/<annotation encoding="application\/x-tex">[\s\S]*?<\/annotation>/g, '');
  } catch (error) {
    throw new Error(`Invalid formula in ${file}: ${tex}`, { cause: error });
  }
}

/**
 * Self-contained GFM + LaTeX Markdown parser tailored for CS329Z course documents.
 */
function createInlineParser(currentFile) {
  function resolveLink(href) {
    let url = href.trim();
    if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
      const [p, fragment] = url.split('#');
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(currentFile), decodeURIComponent(p || path.posix.basename(currentFile)))
      );
      if (target === 'html/' || target === 'html/index.html') return '#/overview';
      if (target === 'exercises/') return '#/lab25/' + encodeURIComponent('实战作业与项目指南');
      if (ids[target]) {
        url = '#/' + ids[target] + (fragment ? '/' + encodeURIComponent(decodeURIComponent(fragment)) : '');
      } else {
        url = path.posix.join('..', path.posix.dirname(currentFile), p) + (fragment ? '#' + fragment : '');
      }
    }
    return url;
  }

  return function parseInline(text) {
    const slots = [];
    const saveSlot = (html) => {
      const i = slots.push(html) - 1;
      return `\u0000SLOT_${i}\u0000`;
    };

    // 1. Inline code `...`
    let s = text.replace(/`([^`\n]+)`/g, (_, code) => saveSlot(`<code>${esc(code)}</code>`));

    // 2. Inline math $...$
    s = s.replace(/\$([^\n$]+?)\$/g, (_, tex) =>
      saveSlot(`<span class="math-inline">${renderMath(tex, false, currentFile)}</span>`)
    );

    // 3. Explicit <br> tags used inside table cells
    s = s.replace(/<br\s*\/?>/gi, () => saveSlot('<br>'));

    // 4. Escape HTML entities in remaining text
    s = esc(s);

    // 5. Markdown links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, rawHref) => {
      const rawUrl = rawHref.replaceAll('&amp;', '&');
      const resolved = resolveLink(rawUrl);
      const external = /^https?:/i.test(resolved);
      // Parse inline formatting inside link label
      const formattedLabel = label
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return saveSlot(
        `<a href="${esc(resolved)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${formattedLabel}</a>`
      );
    });

    // 6. Bold **...** and Italic *...*
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^\s*][^*]*?)\*/g, '<em>$1</em>');

    // Restore slots iteratively
    for (let pass = 0; pass < 3; pass++) {
      s = s.replace(/\u0000SLOT_(\d+)\u0000/g, (_, i) => slots[Number(i)]);
    }
    return s;
  };
}

function parseMarkdownDocument(rawMd, currentFile, parseInline = createInlineParser(currentFile)) {
  const headings = [];
  const usedIds = new Set();
  const lines = rawMd.replace(/\r\n/g, '\n').split('\n');
  const outHtml = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Course figures travel with the single-file reader. The following 图注 line
    // carries the reading cue and a deep link to the source slide.
    const figure = line.trim().match(/^!\[([^\]]+)\]\((docs\/figures\/[\w-]+\.png)\)$/);
    if (figure) {
      const png = fs.readFileSync(path.join(root, figure[2]));
      const caption = lines[i + 1]?.match(/^图注：\s*(.+)$/);
      const image = `<img src="data:image/png;base64,${png.toString('base64')}" alt="${esc(figure[1])}" width="${png.readUInt32BE(16)}" height="${png.readUInt32BE(20)}" loading="lazy">`;
      const credit = caption ? parseInline(caption[1]) : '';
      outHtml.push(`<figure class="lecture-figure">${image}<figcaption>${credit}</figcaption></figure>`);
      i += caption ? 2 : 1;
      continue;
    }

    // Fenced code block ```lang
    const fenceMatch = line.match(/^(\s*)```([^`]*)$/);
    if (fenceMatch) {
      const lang = (fenceMatch[2].trim() || 'text').toUpperCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      outHtml.push(
        `<div class="code-block"><div class="code-header"><span class="code-lang">${esc(
          lang
        )}</span><button type="button" class="copy-btn" aria-label="复制代码">复制代码</button></div><pre><code>${esc(
          codeLines.join('\n')
        )}</code></pre></div>`
      );
      continue;
    }

    // Display math block $$...$$
    if (line.trim().startsWith('$$')) {
      let tex = line.trim().slice(2);
      if (tex.endsWith('$$') && tex.length > 2) {
        tex = tex.slice(0, -2);
        i++;
      } else {
        const mathLines = [tex];
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) {
          mathLines.push(lines[i].trim().slice(0, -2));
          i++;
        }
        tex = mathLines.join('\n');
      }
      outHtml.push(`<div class="math-block">${renderMath(tex, true, currentFile)}</div>`);
      continue;
    }

    // Horizontal rule ---
    if (/^---+\s*$/.test(line.trim())) {
      outHtml.push('<hr>');
      i++;
      continue;
    }

    // Heading # ...
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const renderedTitle = parseInline(rawTitle);
      const idText = rawTitle.replace(/\$([^$]+)\$/g, '$1');
      const base = slug(idText);
      let id = base;
      let n = 0;
      while (usedIds.has(id)) id = `${base}-${++n}`;
      usedIds.add(id);
      headings.push({ id, depth, label: plain(renderedTitle) });
      outHtml.push(`<h${depth} id="${esc(id)}">${renderedTitle}</h${depth}>`);
      i++;
      continue;
    }

    // GFM Table
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (rowLine) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(line);
      const aligns = parseRow(lines[i + 1]).map((a) => {
        if (a.startsWith(':') && a.endsWith(':')) return ' style="text-align:center"';
        if (a.endsWith(':')) return ' style="text-align:right"';
        return '';
      });
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers
        .map((h, idx) => `<th${aligns[idx] || ''}>${parseInline(h)}</th>`)
        .join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map(
          (r) =>
            `<tr>${headers
              .map((_, idx) => `<td${aligns[idx] || ''}>${parseInline(r[idx] || '')}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody>`;
      outHtml.push(`<div class="table-scroll" tabindex="0"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Blockquote > ...
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const [marker, ...linesOfBody] = quoteLines;
      const body = linesOfBody.map(s => s.trim()).filter(Boolean);
      if (marker.trim() === '[!NOTE]') {
        const [title, ...entries] = body;
        const caption = title?.match(/^\*\*(.+)\*\*$/);
        const items = entries.map(entry => entry.match(/^- \*\*(.+?)\*\*[：:]\s*(.+)$/));
        if (!caption || items.length < 2 || items.length > 4 || items.some(item => !item)) {
          throw new Error(`Malformed comparison in ${currentFile} near line ${i}`);
        }
        const cards = items.map(([, term, meaning]) =>
          `<div><dt>${parseInline(term)}</dt><dd>${parseInline(meaning)}</dd></div>`
        ).join('');
        outHtml.push(`<figure class="concept-comparison"><figcaption>${parseInline(caption[1])}</figcaption><dl>${cards}</dl></figure>`);
        continue;
      }
      if (['[!TIP]', '[!IMPORTANT]'].includes(marker.trim())) {
        const kind = marker.trim() === '[!TIP]' ? 'tip' : 'distinction';
        if (!body.length) throw new Error(`Empty reading note in ${currentFile} near line ${i}`);
        outHtml.push(`<div class="reading-note ${kind}" role="note"><p>${parseInline(body.join(' '))}</p></div>`);
        continue;
      }
      const paragraphs = quoteLines
        .join('\n')
        .split(/\n{2,}/)
        .map((p) => `<p>${parseInline(p.trim())}</p>`)
        .join('');
      outHtml.push(`<blockquote>${paragraphs}</blockquote>`);
      continue;
    }

    // Lists (unordered - / * / • or ordered 1.)
    const listMatch = line.match(/^(\s*)(?:([-*•])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const isOrdered = Boolean(listMatch[3]);
      const tag = isOrdered ? 'ol' : 'ul';
      const items = [];

      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(?:([-*•])|(\d+)\.)\s+(.+)$/);
        if (!m) break;
        const itemLines = [m[4]];
        i++;
        // Collect indented continuation lines, sub-lists, or code blocks inside the list item
        while (i < lines.length) {
          const nextLine = lines[i];
          if (!nextLine.trim()) {
            if (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
              itemLines.push('');
              i++;
              continue;
            }
            break;
          }
          if (/^\s{2,}/.test(nextLine)) {
            itemLines.push(nextLine.replace(/^\s{2,4}/, ''));
            i++;
          } else {
            break;
          }
        }

        // Render item body: check if it has sub-lists or display math
        const rawItem = itemLines.join('\n');
        if (/\n\s*(?:[-*•]|\d+\.)\s+|\n\s*\$\$|\n\s*```/.test(rawItem)) {
          const firstBreak = rawItem.indexOf('\n');
          const lead = parseInline(rawItem.slice(0, firstBreak).trim());
          const restHtml = parseMarkdownDocument(rawItem.slice(firstBreak + 1), currentFile).html;
          items.push(`<li>${lead}${restHtml}</li>`);
        } else {
          items.push(`<li>${parseInline(rawItem.replace(/\n+/g, ' ').trim())}</li>`);
        }
      }

      outHtml.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Standard Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|\$\$|---+\s*$|>\s?|\s*(?:[-*•]|\d+\.)\s+|\s*\|)/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) {
      outHtml.push(`<p>${parseInline(paraLines.join(' '))}</p>`);
    } else {
      i++;
    }
  }

  return { html: outHtml.join('\n'), headings };
}

function getCategoryMeta(file, num) {
  if (file === 'README.md') return { unit: '课程总览', badge: 'COURSE OVERVIEW' };
  if (num) {
    const n = Number(num);
    if (n <= 4) return { unit: '一 · 基础与核心组件', badge: `LECTURE ${num}` };
    if (n <= 9) return { unit: '二 · 架构、记忆与优化', badge: `LECTURE ${num}` };
    if (n <= 14) return { unit: '三 · 数据飞轮与评测工程', badge: `LECTURE ${num}` };
    return { unit: '四 · 安全防护与前沿应用', badge: `LECTURE ${num}` };
  }
  if (file === 'docs/editorial-notes.md' || file === 'course-guide.md') return { unit: '阅读说明', badge: 'READING GUIDE' };
  if (file.startsWith('exercises/')) return { unit: '工程实践指南', badge: 'ENGINEERING LAB' };
  return { unit: '配套代码架构', badge: 'CODE ARCHITECTURE' };
}

const readingQuestions = JSON.parse(fs.readFileSync(path.join(root, 'tools/reading-questions.json'), 'utf8'));

function loadQuizzes(id, parseInline) {
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'tools/section-quizzes', id + '.json'), 'utf8'));
  for (const section of Object.values(bank)) {
    for (const q of section) {
      // Keep progress on a reordered question, and start fresh when its content changes.
      const content = [q.prompt, q.options, q.correct, q.explanation, q.answer];
      q.id = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 24);

      // Plain fragments use textContent. Store compiled HTML only for authored markup.
      const fragments = [q.prompt, ...(q.options || [])];
      for (const line of (q.explanation || q.answer).split(/\n+/).filter(Boolean)) {
        const lead = line.match(/^([^：。？！，；\n]{1,20}：)/u);
        if (lead) fragments.push(lead[0], line.slice(lead[0].length));
        else fragments.push(line);
      }
      const inlineHtml = Object.create(null);
      for (const fragment of fragments) {
        const html = parseInline(fragment);
        if (html !== esc(fragment)) inlineHtml[fragment] = html;
      }
      if (Object.keys(inlineHtml).length) q.inlineHtml = inlineHtml;
    }
  }
  return bank;
}

const sources = {};
const docs = files.map((file) => {
  const rawMd = fs.readFileSync(path.join(root, file), 'utf8');
  sources[ids[file]] = rawMd;
  const parseInline = createInlineParser(file);
  const { html, headings } = parseMarkdownDocument(rawMd, file, parseInline);

  const title = headings[0]?.label || file;
  const num = /^\d\d/.exec(file)?.[0] || null;
  let label = num
    ? title.replace(/^第\s*\d+\s*讲[｜|:： ]*/, '')
    : file === 'README.md'
    ? '课程总览与学习路径'
    : title.replace(/^[A-Za-z0-9\u4e00-\u9fa5 ]+[｜|:：]\s*/, '');
  if (file.includes('HW1')) label = 'HW1：从零搭建 Agent Harness';
  if (file.includes('HW2')) label = 'HW2：构建 Agent 评测体系';
  if (file.includes('学期项目')) label = '学期项目：设计、构建与评测';
  if (file.includes('Paper-Video')) label = '论文精读与复现扩展';
  if (file === 'code-guide.md') label = '配套代码架构导读';
  if (file === 'course-guide.md') label = '课程目录与学习路径';
  if (file === 'docs/editorial-notes.md') label = '阅读说明与版本来源';

  const { unit, badge } = getCategoryMeta(file, num);
  const plainText = plain(html);
  const charCount = plainText.replace(/\s+/g, '').length;
  const readingMinutes = Math.max(5, Math.round(charCount / 450));

  return {
    id: ids[file],
    file,
    study: studyCases[ids[file]],
    questions: readingQuestions[ids[file]],
    quizzes: num ? loadQuizzes(ids[file], parseInline) : undefined,
    title,
    label,
    num,
    unit,
    badge,
    readingMinutes,
    html,
    headings,
    text: plainText,
  };
});

const css = fs.readFileSync(path.join(root, 'tools/reader.css'), 'utf8');
const js = ['study-reader.js', 'reader.js'].map(file => fs.readFileSync(path.join(root, 'tools', file), 'utf8')).join('\n');
const courseGroups = groups.map(([label, groupFiles]) => ({ label, ids: groupFiles.map(file => ids[file]) }));
const data = JSON.stringify({ docs, groups: courseGroups }).replaceAll('<', '\\u003c');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CS329Z · AI Agent 系统工程（Engineering AI Agents）</title>
  <style>${css}</style>
</head>
<body>
  <a class="skip" href="#main">跳到正文</a>

  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-masthead">
        <a class="brand" href="#/overview">
          <span class="brand-code">CS329Z <span>中文互动学习版</span></span>
          <span class="brand-title" lang="zh-CN">AI Agent 系统工程</span>
        </a>
        <button id="menu-close" class="rail-control" type="button" aria-label="收起课程目录" title="收起课程目录" aria-controls="sidebar" aria-expanded="true" hidden><span class="panel-icon" aria-hidden="true"></span>收起</button>
      </div>
      <button type="button" class="search-trigger" id="open-search">
        <span class="search-trigger-text">搜索课程、概念与算法…</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
    <div class="nav-caption">
      <h2 id="nav-title">课程目录</h2>
      <button id="toggle-groups" type="button" aria-expanded="false" aria-controls="course-nav" hidden>全部展开</button>
    </div>
    <nav id="course-nav" aria-labelledby="nav-title">${renderCourseNavigation(courseGroups, docs, 'overview', esc)}</nav>
  </aside>

  <div class="shade" id="shade"></div>

  <div class="workspace">
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" id="menu" class="rail-control" hidden aria-label="打开课程目录" aria-expanded="false" aria-controls="sidebar"><span class="panel-icon" aria-hidden="true"></span>目录</button>
        <div id="breadcrumb" class="breadcrumb">课程总览</div>
      </div>
      <div class="reading-tools">
        <button type="button" id="mobile-search" class="mobile-only" aria-label="打开搜索">搜索</button>
        <button type="button" id="theme-toggle" aria-label="切换深浅色主题">深色模式</button>
        <button type="button" id="font-size" aria-label="切换阅读字号">字号 A+</button>
        <button type="button" id="print" aria-label="打印或导出 PDF">打印 / PDF</button>
      </div>
    </header>

    <div class="reading-progress" aria-hidden="true">
      <div id="progress-bar"></div>
    </div>

    <div class="reading-layout">
      <main id="main" tabindex="-1">
        <div class="chapter-meta" id="chapter-meta"></div>

        <section class="home-intro" id="home-intro">
          <div class="home-copy">
            <p class="eyebrow">CS329Z <span>／</span> 智能体工程</p>
            <h1>从一个决定，<br>读懂 <em>AI Agent</em>。</h1>
            <p class="hero-lead">先替助手做一个选择，再拆开它的工作过程。19 讲课程与 4 项实践，每次可以只学一小节。</p>
            <div class="hero-actions">
              <a class="start-link" id="start-study" href="#/lecture01">开始第 01 讲 →</a>
              <a class="home-guide" id="book-link" href="#/book">全书连读</a>
              <a class="home-guide" href="#/lab25">查看学习路线</a>
            </div>
            <p id="resume-caption" class="resume-caption" hidden></p>
            <p class="home-credits">感谢 <a href="https://github.com/wanghao-SunSky/cs329z-chinese">wanghao-SunSky</a> 整理中文教程，感谢 <a href="https://www.bilibili.com/video/BV1ARxc61Er2/">不做挖掘姬</a> 整理上传第 1–9 讲视频。</p>
          </div>
          <figure class="home-figure">
            <svg viewBox="0 0 304 196" role="img" aria-labelledby="planner-title" xmlns="http://www.w3.org/2000/svg">
              <title id="planner-title">日程示意图。周四 14:00 有课，助手根据反馈寻找另一个空档。</title>
              <defs><pattern id="planner-grid" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#8fa99d"/></pattern></defs>
              <rect x="0" y="0" width="304" height="196" rx="16" fill="#dae9dd"/>
              <rect x="0" y="0" width="304" height="196" rx="16" fill="url(#planner-grid)" opacity=".5"/>
              <g transform="rotate(-5 140 100)">
                <rect x="38" y="35" width="197" height="130" rx="10" fill="#a3bbad"/>
                <rect x="33" y="30" width="197" height="130" rx="10" fill="#fffcf1" stroke="#245647" stroke-width="2"/>
                <path d="M34 61h195" stroke="#245647" stroke-width="2"/>
                <path d="M55 22v18m19-18v18m115-18v18m19-18v18" stroke="#245647" stroke-width="4" stroke-linecap="round"/>
                <text x="48" y="53" font-size="13" font-weight="700" fill="#245647">周四 · 我的日历</text>
                <text x="47" y="88" fill="#39594d" font-size="13">14:00</text><rect x="96" y="72" width="109" height="24" rx="5" fill="#f3d19f"/><text x="106" y="89" font-size="13" fill="#563b20">课程</text>
                <path d="M47 106h163" stroke="#d8ded1"/>
                <text x="47" y="131" fill="#39594d" font-size="13">15:00</text><rect x="96" y="115" width="109" height="24" rx="5" fill="none" stroke="#467862" stroke-width="1.5" stroke-dasharray="4 3"/>
              </g>
              <path d="M255 109q14 31-38 26m7-7-9 7 8 7" fill="none" stroke="#285a48" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"/>
              <g transform="rotate(6 243 89)"><rect x="204" y="72" width="89" height="34" rx="8" fill="#235a49"/><text x="248" y="94" text-anchor="middle" font-size="13" fill="white">再查一格</text></g>
            </svg>
            <figcaption>第 01 讲 <span>／</span> 让日程助手根据反馈行动</figcaption>
          </figure>
        </section>

        <article id="article">${docs[0].html}</article>
        <nav id="chapter-footer" aria-label="章节翻页"></nav>
      </main>

      <aside class="toc" aria-label="本节大纲">
        <div class="toc-card">
          <div class="toc-label">本讲目录</div>
          <nav id="toc-links"></nav>
          <a class="source-link" id="source-link" href="#/overview">保存本章 Markdown</a>
        </div>
      </aside>
    </div>

    <footer class="page-footer">
      <a href="https://cs329z.stanford.edu/">斯坦福官方课程</a>
      <a href="#/lab26">阅读说明与版本来源</a>
      <a href="https://github.com/xuchen-cloud/cs329z-study">本版 GitHub 仓库</a>
    </footer>
  </div>

  <dialog id="search-dialog" aria-label="搜索课程">
    <form method="dialog" class="search-head">
      <label for="search-input">搜索</label>
      <input id="search-input" type="search" placeholder="输入概念、算法、论文或练习关键词（如 ReAct, BM25, GRPO, MCP）…" autocomplete="off">
      <button type="submit" aria-label="关闭搜索">ESC</button>
    </form>
    <p class="search-hint" id="search-hint">支持跨全部 19 讲课程、4 项实践与代码架构导读实时检索</p>
    <div id="search-results" aria-live="polite"></div>
  </dialog>

  <noscript><p>请启用 JavaScript 以使用交互式章节导航与全文检索。</p></noscript>
  <script id="course-sources" type="application/json">${JSON.stringify(sources).replaceAll('<', '\\u003c')}</script>
  <script id="course-data" type="application/json">${data}</script>
  <script>${js}</script>
</body>
</html>`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(
  JSON.stringify({
    documents: docs.length,
    lectures: lectures.length,
    headings: docs.reduce((n, d) => n + d.headings.length, 0),
    bytes: Buffer.byteLength(html),
  })
);
