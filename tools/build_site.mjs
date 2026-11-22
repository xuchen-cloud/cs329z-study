/** Build the offline reader plus crawlable, pre-rendered chapter pages. */
import fs from 'node:fs';
import { renderCourseNavigation } from './course-navigation.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'html');
const origin = 'https://xuchen-cloud.github.io/cs329z-study';
const github = 'https://github.com/xuchen-cloud/cs329z-study';
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const descriptions = JSON.parse(fs.readFileSync(path.join(root, 'tools/page-descriptions.json'), 'utf8'));
const filename = (id) => (id === 'overview' ? 'index' : id) + '.html';
const route = (id, anchor = '') => './' + filename(id) + (anchor ? '#' + anchor : '');
const links = (s) => s.replace(/href="#\/([^/"\s]+)(?:\/([^"\s]*))?"/g, (_, id, anchor) => `href="${route(id, anchor)}"`);

execFileSync(process.execPath, [path.join(root, 'tools/build_html.mjs')], { stdio: 'inherit' });
const template = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const match = template.match(/<script id="course-data" type="application\/json">(.*?)<\/script>/s);
const data = JSON.parse(match[1]);
const { docs, groups } = data;
const publicUrl = id => origin + (id === 'overview' ? '/' : '/' + filename(id));
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, 'assets/course-data.js'), 'window.COURSE_DATA = ' + match[1] + ';\n');
for (const f of ['reader.css', 'study-reader.js', 'reader.js']) fs.copyFileSync(path.join(root, 'tools', f), path.join(out, 'assets', f));
fs.writeFileSync(path.join(out, 'offline.html'), template.replace('</head>', `<meta name="robots" content="noindex,follow"><link rel="canonical" href="${origin}/"></head>`));

for (const [i, d] of docs.entries()) {
  const url = publicUrl(d.id);
  const title = d.id === 'overview' ? '斯坦福 Stanford CS329Z 中文教程 | AI 智能体工程' : `${d.label} | CS329Z 中文教程`;
  const description = d.id === 'overview'
    ? '斯坦福 Stanford CS329Z（Engineering AI Agents）中文学习教程，面向 Python 开发者讲解 AI 智能体：19 讲、4 项实践与代码导读，涵盖大语言模型、RAG、工具调用、记忆、多 Agent 协作、评测和安全。支持在线阅读与离线下载。'
    : descriptions[d.id];
  if (!description) throw new Error(`Missing page description: ${d.id}`);
  const schema = {
    '@context': 'https://schema.org', '@type': 'TechArticle',
    headline: title, description, inLanguage: 'zh-CN', url,
    mainEntityOfPage: url, isAccessibleForFree: true,
    isBasedOn: 'https://cs329z.stanford.edu/',
    about: ['AI Agent', '人工智能体', 'Stanford CS329Z', '大语言模型', d.label],
  };
  const metadata = `<meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="CS329Z 中文教程">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
  const nav = renderCourseNavigation(groups, docs, d.id, esc);
  const toc = d.headings.filter(h => h.depth === 2 || h.depth === 3).map(h => `<a class="depth-${h.depth}" href="${route(d.id, encodeURIComponent(h.id))}" data-anchor="${esc(h.id)}">${esc(h.label)}</a>`).join('');
  const prevNext = [docs[i - 1], docs[i + 1]].map((item, j) => item ? `<a href="${route(item.id)}"><small>${j ? '下一节 →' : '← 上一节'}</small>${esc(item.label)}</a>` : '<span></span>').join('');
  let page = template
    .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>\n${metadata}`)
    .replace(/<style>.*?<\/style>/s, '<link rel="stylesheet" href="./assets/reader.css">')
    .replace('<body>', `<body data-static="true" data-initial-doc="${d.id}" data-doc="${d.id}">`)
    .replace(/(<nav id="course-nav"[^>]*>).*?<\/nav>/s, (_, start) => start + nav + '</nav>')
    .replace('<nav id="toc-links"></nav>', `<nav id="toc-links">${toc}</nav>`)
    .replace(/<article id="article">.*?<\/article>/s, () => `<article id="article">${d.html}</article>`)
    .replace('<nav id="chapter-footer" aria-label="章节翻页"></nav>', `<nav id="chapter-footer" aria-label="章节翻页">${prevNext}</nav>`)
    .replace('id="source-link" href="#/overview">保存本章 Markdown', `id="source-link" href="${github}/blob/main/${encodeURI(d.file)}">查看 Markdown 源文件 ↗`)
    .replace('id="book-link" href="#/book">全书连读', 'id="book-link" href="./offline.html">打开单文件版')
    .replace(/  <script id="course-sources" type="application\/json">.*?<\/script>\n/s, '')
    .replace('<div id="breadcrumb" class="breadcrumb">课程总览</div>', `<div id="breadcrumb" class="breadcrumb">${esc(d.label)}</div>`)
    .replace(/<script id="course-data" type="application\/json">.*?<\/script>/s, '<script src="./assets/course-data.js"></script>')
    .replace(/<script>\/\* Study reader \*\/.*?<\/script>/s, '<script src="./assets/study-reader.js"></script><script src="./assets/reader.js"></script>')
    .replace('<noscript><p>请启用 JavaScript 以使用交互式章节导航与全文检索。</p></noscript>', '<noscript><p>正文和目录可直接阅读。启用 JavaScript 后可使用全文搜索和阅读设置。</p></noscript>');
  if (d.id !== 'overview') page = page.replace('class="home-intro" id="home-intro"', 'class="home-intro" id="home-intro" hidden');
  page = links(page);
  fs.writeFileSync(path.join(out, filename(d.id)), page);
}

const urls = docs.map(d => publicUrl(d.id));
fs.writeFileSync(path.join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
console.log(JSON.stringify({ staticPages: docs.length, offline: 'html/offline.html', sitemap: urls.length }));
