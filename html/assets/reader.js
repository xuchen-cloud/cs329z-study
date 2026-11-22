/* Interactive Course Reader Runtime */
const { docs, groups } = window.COURSE_DATA || JSON.parse(document.getElementById('course-data').textContent);
const staticMode = document.body.dataset.static === 'true';
const byId = new Map(docs.map((d) => [d.id, d]));
const $ = (id) => document.getElementById(id);
const escapeHTML = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const route = (id, anchor) => staticMode
  ? './' + (id === 'overview' ? 'index' : id) + '.html' + (anchor ? '#' + encodeURIComponent(anchor) : '')
  : '#/' + id + (anchor ? '/' + encodeURIComponent(anchor) : '');
const pageLinks = (html) => staticMode ? html.replace(/href="#\/([^/"]+)(?:\/([^"]*))?"/g, (_, id, anchor) => `href="${route(id, anchor ? decodeURIComponent(anchor) : '')}"`) : html;

const sources = staticMode ? null : JSON.parse($('course-sources').textContent);
const book = {
  id: 'book', label: '全书连读', unit: 'CS329Z',
  headings: docs.map(d => ({ id: d.id, label: d.title, depth: 2 })),
};
const bookAnchor = (id, anchor) => anchor ? id + '--' + anchor : id;

function mountBook(article) {
  article.dataset.mode = 'full';
  const chapters = document.createDocumentFragment();
  for (const d of docs) {
    const chapter = document.createElement('section');
    chapter.className = 'book-chapter';
    chapter.innerHTML = d.html;
    if (d.id !== 'overview') {
      for (const step of collectStudySteps(d, chapter)) chapter.append(step.el);
      chapter.querySelectorAll('.subtopic').forEach(detail => { detail.open = true; });
    }
    for (const el of chapter.querySelectorAll('[id]')) el.id = bookAnchor(d.id, el.id);
    for (const label of chapter.querySelectorAll('label[for]')) label.htmlFor = bookAnchor(d.id, label.htmlFor);
    for (const link of chapter.querySelectorAll('a[href^="#/"]')) {
      const [id, heading] = link.hash.slice(2).split('/');
      link.href = route('book', bookAnchor(id, heading && decodeURIComponent(heading)));
    }
    chapter.id = d.id;
    const returnLink = document.createElement('a');
    returnLink.className = 'book-study-link';
    returnLink.href = route(d.id);
    returnLink.textContent = d.study ? '单独学习这一篇 →' : '单独阅读这一篇 →';
    chapter.querySelector('h1').after(returnLink);
    chapters.append(chapter);
  }
  article.replaceChildren(chapters);
}

let activeId;
let observer;
let study;

// The same pre-rendered course directory serves static pages and the offline book.
const navGroups = [...$('course-nav').querySelectorAll('.nav-group')];
const groupKey = group => 'nav.group.' + group.dataset.group;
function groupPreference(group) {
  const saved = studyStorage.read(groupKey(group));
  return saved == null ? group.classList.contains('contains-current') : saved === 'open';
}
function updateGroupButton() {
  const allOpen = navGroups.every(group => group.open);
  $('toggle-groups').setAttribute('aria-expanded', String(allOpen));
  $('toggle-groups').textContent = allOpen ? '全部收起' : '全部展开';
}
for (const group of navGroups) {
  // Save the user's choice before the native toggle event, which can run after navigation.
  group.querySelector('summary').addEventListener('click', () => {
    studyStorage.write(groupKey(group), group.open ? 'closed' : 'open');
  });
  group.addEventListener('toggle', updateGroupButton);
}
$('toggle-groups').hidden = false;
$('toggle-groups').onclick = () => {
  const open = !navGroups.every(group => group.open);
  for (const group of navGroups) {
    studyStorage.write(groupKey(group), open ? 'open' : 'closed');
    group.open = open;
  }
  updateGroupButton();
};
function syncCourseNav(id, inBook) {
  for (const group of navGroups) {
    for (const link of group.querySelectorAll('[data-doc]')) {
      const target = link.dataset.doc;
      link.href = inBook ? route('book', target) : route(target);
      if (target === id) link.setAttribute('aria-current', inBook ? 'location' : 'page');
      else link.removeAttribute('aria-current');
    }
    group.classList.toggle('contains-current', Boolean(group.querySelector('[aria-current]')));
    group.open = groupPreference(group);
  }
  updateGroupButton();
}

const narrowMenu = matchMedia('(max-width: 760px)');
let desktopMenuOpen = studyStorage.read('nav.sidebar') !== 'closed';
let mobileMenuOpen = false;
function layoutMenu() {
  const drawer = narrowMenu.matches && mobileMenuOpen;
  const open = narrowMenu.matches ? mobileMenuOpen : desktopMenuOpen;
  document.body.classList.toggle('nav-open', drawer);
  document.body.classList.toggle('nav-collapsed', !narrowMenu.matches && !open);
  document.querySelector('.workspace').inert = drawer;
  $('sidebar').hidden = !open;
  $('menu').hidden = open;
  $('menu').setAttribute('aria-expanded', String(open));
  $('menu-close').hidden = !open;
  $('menu-close').setAttribute('aria-expanded', String(open));
}
function setMenu(open, focusTarget) {
  if (narrowMenu.matches) mobileMenuOpen = open;
  else {
    desktopMenuOpen = open;
    studyStorage.write('nav.sidebar', open ? 'open' : 'closed');
  }
  layoutMenu();
  (focusTarget || $(open ? 'menu-close' : 'menu')).focus({ preventScroll: true });
}
$('menu').onclick = () => setMenu(true);
$('menu-close').onclick = () => setMenu(false);
$('shade').onclick = () => setMenu(false);
narrowMenu.addEventListener('change', () => {
  mobileMenuOpen = false;
  const focusWasInSidebar = $('sidebar').contains(document.activeElement);
  layoutMenu();
  if ($('sidebar').hidden && focusWasInSidebar) $('menu').focus();
});
document.body.classList.add('reader-ready');
layoutMenu();

function bindCopyButtons() {
  $('article')
    .querySelectorAll('.copy-btn')
    .forEach((btn) => {
      btn.onclick = async () => {
        const code = btn.closest('.code-block')?.querySelector('code')?.textContent || '';
        try {
          await navigator.clipboard.writeText(code);
          const prev = btn.textContent;
          btn.textContent = '已复制 ✓';
          setTimeout(() => {
            btn.textContent = prev;
          }, 1600);
        } catch {}
      };
    });
}

function render() {
  if (location.hash === '#main') {
    if (activeId) { $('main').focus(); return; }
  }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (staticMode && location.hash.startsWith('#/') && byId.has(parts[0])) {
    location.replace(route(parts[0], decodeURIComponent(parts.slice(1).join('/'))));
    return;
  }
  const inBook = !staticMode && parts[0] === 'book';
  const d = inBook ? book : byId.get(staticMode ? document.body.dataset.initialDoc : parts[0]) || docs[0];
  let anchor = '';
  try {
    anchor = decodeURIComponent(staticMode ? location.hash.slice(1) : parts.slice(1).join('/'));
  } catch {}

  const changed = activeId !== d.id;
  if (changed) {
    activeId = d.id;
    document.body.dataset.doc = d.id;
    const article = $('article');
    delete document.body.dataset.reading;
    delete article.dataset.mode;
    if (inBook) {
      study = null;
      mountBook(article);
    } else {
      article.innerHTML = pageLinks(d.html);
      study = mountStudyReader(d, article, docs[docs.indexOf(d) + 1], route);
      if (d.id === 'overview') setupStudyHome(byId, route);
    }
    bindCopyButtons();

    $('home-intro').hidden = d.id !== 'overview';
    $('breadcrumb').textContent = d.num ? `${d.unit}  /  第 ${d.num} 讲 · ${d.label}` : `${d.unit}  /  ${d.label}`;
    $('chapter-meta').innerHTML =
      d.id === 'overview' || inBook
        ? ''
        : `<span class="badge">${escapeHTML(d.badge)}</span><span class="unit-name">${escapeHTML(
            d.unit
          )}</span><span class="read-time">预计阅读 ${d.readingMinutes} 分钟</span>`;

    if (!staticMode) document.title = `${d.label} · CS329Z AI Agent 系统工程`;

    document.querySelector('.toc-label').textContent = inBook ? '全书目录' : '本讲目录';
    $('toc-links').innerHTML = d.headings
      .filter((h) => h.depth === 2 || h.depth === 3)
      .map(
        (h) =>
          `<a class="depth-${h.depth}" href="${route(d.id, h.id)}" data-anchor="${escapeHTML(h.id)}">${escapeHTML(
            h.label
          )}</a>`
      )
      .join('');

    const sourceLink = $('source-link');
    sourceLink.hidden = inBook;
    if (!staticMode && !inBook) {
      sourceLink.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(sources[d.id]);
      sourceLink.download = d.file.split('/').pop();
    }
    $('chapter-footer').hidden = inBook;

    const index = docs.indexOf(d);
    const prev = docs[index - 1];
    const next = docs[index + 1];
    $('chapter-footer').innerHTML =
      (prev
        ? `<a href="${route(prev.id)}"><small>← 上一节</small>${
            prev.num ? `第 ${prev.num} 讲 · ` : ''
          }${escapeHTML(prev.label)}</a>`
        : '<span></span>') +
      (next
        ? `<a href="${route(next.id)}"><small>下一节 →</small>${
            next.num ? `第 ${next.num} 讲 · ` : ''
          }${escapeHTML(next.label)}</a>`
        : '<span></span>');

    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            document
              .querySelectorAll('#toc-links a')
              .forEach((a) => a.classList.toggle('current', a.dataset.anchor === e.target.id));
          }
        }
      },
      { rootMargin: '-80px 0px -65% 0px' }
    );
    $('article')
      .querySelectorAll(inBook ? '.book-chapter' : 'h2, h3')
      .forEach((h) => observer.observe(h));
  }

  const chapter = inBook ? anchor.split('--')[0] || 'overview' : d.id;
  syncCourseNav(chapter, inBook);
  if (mobileMenuOpen) setMenu(false, $('main'));
  study?.reveal(anchor);
  requestAnimationFrame(() => {
    if (study && (anchor || study.resumed)) study.reveal(anchor, true);
    else {
      const target = anchor && document.getElementById(anchor);
      if (target) target.scrollIntoView();
      else window.scrollTo({ top: 0, behavior: 'instant' });
    }
    updateProgress();
  });
}

function updateProgress() {
  const total = document.documentElement.scrollHeight - innerHeight;
  $('progress-bar').style.width = (total > 0 ? Math.min(100, (scrollY / total) * 100) : 100) + '%';
}

window.addEventListener('hashchange', render);
window.addEventListener('pageshow', () => { if (activeId === 'overview') setupStudyHome(byId, route); });
window.addEventListener('beforeprint', () => study?.beforePrint());
window.addEventListener('afterprint', () => study?.afterPrint());
let scrollFrame;
window.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    updateProgress();
    study?.trackScroll?.();
  });
}, { passive: true });

// Theme toggle (Light / Dark)
let savedTheme;
try { savedTheme = localStorage.getItem('cs329z_theme'); } catch {}
if (savedTheme === 'dark') {
  document.body.dataset.theme = 'dark';
  $('theme-toggle').textContent = '浅色模式';
}
$('theme-toggle').onclick = () => {
  const isDark = document.body.dataset.theme !== 'dark';
  document.body.dataset.theme = isDark ? 'dark' : 'light';
  $('theme-toggle').textContent = isDark ? '浅色模式' : '深色模式';
  try {
    localStorage.setItem('cs329z_theme', isDark ? 'dark' : 'light');
  } catch {}
};

// Font size toggle
function setLargeType(large) {
  document.body.dataset.large = String(large);
  $('font-size').textContent = large ? '字号 A−' : '字号 A+';
  $('font-size').setAttribute('aria-pressed', String(large));
}
setLargeType(studyStorage.read('large-type') === 'true');
$('font-size').onclick = () => {
  const large = document.body.dataset.large !== 'true';
  setLargeType(large);
  studyStorage.write('large-type', String(large));
};

$('print').onclick = () => window.print();

// Full-text Search Dialog
const dialog = $('search-dialog');
const input = $('search-input');

function openSearch() {
  if (input.value) input.dispatchEvent(new Event('input'));
  if (!dialog.open) dialog.showModal();
  input.focus();
  input.select();
}

$('open-search').onclick = openSearch;
$('mobile-search').onclick = openSearch;

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
  }
  if (e.key === 'Escape' && mobileMenuOpen && !dialog.open) setMenu(false);
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      dialog.close();
    }
  }
});

const searchIndex = docs.flatMap((d) => {
  const box = document.createElement('div');
  box.innerHTML = d.html;
  const sections = [];
  let section;
  for (const element of box.children) {
    if (/^H[1-6]$/.test(element.tagName)) {
      section = { doc: d, id: element.id, title: element.textContent, text: '' };
      sections.push(section);
    } else if (section) {
      section.text += ' ' + element.textContent;
    }
  }
  for (const entry of sections) {
    const cue = d.questions?.[entry.id];
    if (cue) entry.text += ' ' + (typeof cue === 'string' ? cue : cue.question + ' ' + cue.bridge);
  }
  if (d.study) sections.push({ doc: d, id: 'study-case', title: d.study.question, text: d.study.scene + ' ' + d.study.recall });
  return sections;
});

input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    $('search-results').innerHTML = '';
    $('search-hint').textContent = '支持跨全部 19 讲课程、4 项实践与代码架构导读实时检索';
    return;
  }
  const matches = searchIndex.filter((s) => (s.title + ' ' + s.text).toLowerCase().includes(q));
  matches.sort((a, b) => Number(b.title.toLowerCase().includes(q)) - Number(a.title.toLowerCase().includes(q)));
  $('search-hint').textContent = `找到 ${matches.length} 处匹配${matches.length > 50 ? '（展示前 50 处）' : ''}`;
  $('search-results').innerHTML =
    matches
      .slice(0, 50)
      .map((s) => {
        const pos = s.text.toLowerCase().indexOf(q);
        const start = Math.max(0, pos - 40);
        const text = s.text.slice(start, start + 150).replace(/\s+/g, ' ');
        const safe = escapeHTML(text);
        const escapedQ = escapeHTML(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const snippet = safe.replace(new RegExp(escapedQ, 'gi'), (m) => '<mark>' + m + '</mark>');
        return `<a class="search-result" href="${activeId === book.id ? route(book.id, bookAnchor(s.doc.id, s.id)) : route(s.doc.id, s.id)}"><strong>${escapeHTML(
          s.title
        )}</strong><span>${escapeHTML(s.doc.label)} · ${start ? '…' : ''}${snippet}</span></a>`;
      })
      .join('') || '<p class="search-hint">未找到相关结果，请尝试英文缩写或核心术语（如 RAG、BM25、MCP、GRPO）。</p>';
});

$('search-results').addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    dialog.close();
    if (e.target.closest('a').hash === location.hash) render();
  }
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
  if (a.getAttribute('href') === '#main') {
    e.preventDefault();
    $('main').focus();
    $('main').scrollIntoView();
    return;
  }
  if (a.hash && a.href === location.href) {
    e.preventDefault();
    render();
  }
});

render();
