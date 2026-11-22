/* Study reader */
const studyStorage = (() => {
  const memory = new Map();
  return {
    read(key) {
      try { return localStorage.getItem('cs329z.study.' + key) ?? memory.get(key); }
      catch { return memory.get(key); }
    },
    write(key, value) {
      memory.set(key, value);
      try { localStorage.setItem('cs329z.study.' + key, value); return true; }
      catch { return false; }
    },
  };
})();

function studyElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function setupStudyHome(docsById, makeRoute) {
  const last = docsById.get(studyStorage.read('last'));
  const start = document.getElementById('start-study');
  const caption = document.getElementById('resume-caption');
  if (!last) {
    start.href = makeRoute('lecture01');
    start.textContent = '开始第 01 讲 →';
    caption.hidden = true;
    return;
  }
  start.href = makeRoute(last.id, studyStorage.read(last.id + '.place'));
  start.textContent = last.num ? '继续第 ' + last.num + ' 讲 →' : '继续上次阅读 →';
  caption.hidden = false;
  caption.textContent = '上次停在「' + last.label + '」 · ' + (studyStorage.read(last.id + '.label') || '开篇');
}

function mountStudyHome(article, makeRoute) {
  const material = studyElement('details', 'home-sources');
  material.append(studyElement('summary', '', '展开课程原文、资料来源与构建说明'));
  for (const node of [...article.children]) {
    if (node.tagName !== 'H1') material.append(node);
  }
  const section = studyElement('section', 'home-routes');
  section.append(studyElement('h2', '', '你今天想弄懂哪个问题？'));
  const nav = studyElement('nav');
  nav.setAttribute('aria-label', '按问题选课');
  for (const [id, label, question] of [
    ['lecture01', '第 01 讲 · Agent 循环', '助手怎么知道下一步做什么？'],
    ['lecture03', '第 03 讲 · 检索增强', '两份资料冲突，该相信哪份？'],
    ['lecture13', '第 13 讲 · 评测', '怎样证明助手真的完成了任务？'],
  ]) {
    const link = studyElement('a');
    link.href = makeRoute(id);
    link.append(studyElement('small', '', label), studyElement('strong', '', question));
    nav.append(link);
  }
  section.append(nav);
  article.append(section, material);
  return {
    reveal(anchor, focus) {
      const target = anchor && document.getElementById(anchor);
      if (target && material.contains(target)) material.open = true;
      if (target && focus) target.scrollIntoView();
    },
    beforePrint() { this.wasOpen = material.open; material.open = true; },
    afterPrint() { material.open = this.wasOpen; },
  };
}

function addCaseExperiment(id, parent) {
  if (id !== 'lecture01' && id !== 'lecture03') return;
  const box = studyElement('fieldset', 'case-experiment');
  const result = studyElement('p', 'experiment-result');
  result.setAttribute('role', 'status');
  if (id === 'lecture01') {
    box.append(studyElement('legend', '', '你来操作 · 查一格模拟日历'));
    const times = studyElement('div', 'experiment-controls');
    const confirm = studyElement('button', '', '确认这个时段');
    const restart = studyElement('button', '', '重新试一次');
    const appointments = new Map([['14:00', '有课'], ['14:30', '有会']]);
    let selected;
    for (const time of ['14:00', '14:30', '15:00']) {
      const button = studyElement('button', '', time);
      button.type = 'button';
      button.onclick = () => {
        selected = time;
        const busy = appointments.get(time);
        result.textContent = busy ? time + ' ' + busy + '。查一下别的时段。' : time + ' 到 15:30 有空。要把半小时复习放在这里吗？';
        confirm.hidden = Boolean(busy);
      };
      times.append(button);
    }
    confirm.type = restart.type = 'button';
    confirm.hidden = restart.hidden = true;
    confirm.onclick = () => {
      appointments.set(selected, '已安排复习');
      result.textContent = '复习已排进模拟日历。再查 ' + selected + '，看看环境发生了什么变化。';
      confirm.hidden = true;
      restart.hidden = false;
    };
    restart.onclick = () => {
      appointments.delete('15:00');
      confirm.hidden = restart.hidden = true;
      result.textContent = '日历已恢复。选择一个时段查询。';
      times.firstElementChild.focus();
    };
    result.textContent = '目标是找半小时复习。你想先查哪个时段？';
    box.append(times, result, confirm, restart);
  } else {
    box.append(studyElement('legend', '', '你来操作 · 给答案选证据'));
    box.append(studyElement('p', '', '模拟问题是“本学期周日几点闭馆”。勾选你愿意引用的公告。'));
    const inputs = [];
    for (const label of ['去年公告 · 每日 18:00 闭馆', '本学期公告 · 周末 16:00 闭馆']) {
      const row = studyElement('label', 'evidence-row');
      const input = studyElement('input');
      input.type = 'checkbox';
      inputs.push(input);
      row.append(input, document.createTextNode(label));
      box.append(row);
    }
    function evaluateEvidence() {
      const [old, current] = inputs.map(input => input.checked);
      if (current && old) result.textContent = '两段时间冲突。先用问题中的“本学期”筛掉旧公告，再看结论。';
      else if (current) result.textContent = '有证据支持 16:00。引用的段落同时满足“本学期”和“周末”两个条件。';
      else if (old) result.textContent = '18:00 来自去年的公告，不能据此确认本学期的时间。';
      else result.textContent = '当前没有引用证据，闭馆时间待确认。';
    }
    inputs.forEach(input => { input.onchange = evaluateEvidence; });
    evaluateEvidence();
    box.append(result);
  }
  parent.append(box);
}

function makeCase(doc) {
  const c = doc.study;
  const panel = studyElement('section', 'study-case');
  panel.id = 'study-case';
  panel.innerHTML = `
    <p class="study-kicker">情境练习</p>
    <h2 class="case-title"></h2><p class="case-scene"></p>
    <div class="case-options" role="group" aria-label="选择你的判断"></div>
    <div class="case-feedback" role="status"></div>
    <details class="case-disclosure"><summary>拆开看 · 三步图解</summary>
      <div class="case-map" role="group" aria-label="选择一步查看例子"></div>
      <p class="map-explanation" aria-live="polite"></p>
    </details>
    <details class="case-disclosure"><summary>换个条件，我来解释</summary>
      <label class="recall-question" for="case-note"></label>
      <textarea id="case-note" rows="3" placeholder="写下一句自己的想法…"></textarea>
      <small class="note-status"></small>
      <details class="compare-note"><summary>对照一种参考思路</summary><p></p></details>
    </details>`;
  const find = selector => panel.querySelector(selector);
  find('.case-title').textContent = c.question;
  find('.case-scene').textContent = c.scene;
  const feedback = find('.case-feedback');
  const optionGroup = find('.case-options');
  function choose(index, save) {
    const right = index === c.correct;
    [...optionGroup.children].forEach((btn, i) => {
      btn.setAttribute('aria-pressed', String(i === index));
    });
    feedback.dataset.correct = String(right);
    feedback.replaceChildren(
      studyElement('strong', '', right ? '判断正确' : '再想一想'),
      studyElement('span', '', c.choices[index][1].replace(/^对。/, '')),
    );
    if (save) studyStorage.write(doc.id + '.choice', String(index));
  }
  c.choices.forEach(([label], i) => {
    const button = studyElement('button', 'case-option');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    const letter = studyElement('span', 'option-letter', String.fromCharCode(65 + i));
    letter.setAttribute('aria-hidden', 'true');
    button.append(letter, document.createTextNode(label));
    button.onclick = () => choose(i, true);
    optionGroup.append(button);
  });
  const previous = studyStorage.read(doc.id + '.choice');
  if (previous != null && c.choices[previous]) choose(Number(previous), false);
  const map = find('.case-map');
  function showStage(index) {
    [...map.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    find('.map-explanation').textContent = c.steps[index][2];
  }
  c.steps.forEach(([label, detail], i) => {
    const button = studyElement('button', 'map-stage');
    button.type = 'button';
    button.append(studyElement('small', '', '0' + (i + 1)), studyElement('strong', '', label), studyElement('span', '', detail));
    button.onclick = () => showStage(i);
    map.append(button);
  });
  showStage(0);
  addCaseExperiment(doc.id, map.closest('details'));
  find('.recall-question').textContent = c.recall;
  find('.compare-note p').textContent = c.comparison;
  const note = find('textarea');
  note.value = studyStorage.read(doc.id + '.note') || '';
  find('.note-status').textContent = note.value ? '上次写下的想法' : '随时可以回来修改';
  note.oninput = () => {
    const saved = studyStorage.write(doc.id + '.note', note.value);
    find('.note-status').textContent = saved ? '已保存到此浏览器' : '本次打开期间保留';
  };
  return panel;
}

const commonReadingQuestions = {
  '学习目标': '读完这一讲，我应该能独立做哪几件事？',
  '原课程阅读清单与导读': '想核对前面的解释，可以追到哪篇原文？',
  '动手练习': '离开讲解，我能把哪个概念用在一道题上？',
};

function collectStudySteps(doc, article) {
  const steps = [];
  if (doc.study) {
    steps.push({ anchor: 'study-case', label: '情境练习', question: doc.study.question, el: makeCase(doc) });
  }
  const nodes = Array.from(article.children).filter(node => node.tagName !== 'H1');
  let part;
  let hasBody = false;
  for (const node of nodes) {
    const heading = node.matches('h2,h3');
    if (!part || (heading && hasBody)) {
      part = { el: studyElement('section', 'reading-step'), anchor: 'study-intro', label: '开篇', question: '' };
      steps.push(part);
      hasBody = false;
    }
    if (heading) {
      const cue = doc.questions?.[node.id];
      part.anchor = node.id;
      part.label = node.textContent;
      part.question = (typeof cue === 'string' ? cue : cue?.question) || commonReadingQuestions[node.textContent] || '';
      part.bridge = cue?.bridge;
      part.heading = node;
    } else if (!node.matches('hr')) {
      hasBody = true;
    }
    part.el.append(node);
  }
  for (const step of steps) {
    if (step.el.classList.contains('study-case')) continue;
    if (step.anchor === 'study-intro') {
      step.el.id = step.anchor;
      const title = studyElement('h2', '', '开篇');
      step.el.prepend(title);
      step.heading = title;
      step.question = doc.study ? '带着刚才的情境，这一讲要解决什么问题？' : '这份指南能帮我完成什么？';
    }
    if (step.question) {
      const guide = studyElement('div', 'reading-guide');
      guide.append(studyElement('p', 'guide-question', step.question));
      if (step.bridge) guide.append(studyElement('p', 'guide-bridge', step.bridge));
      step.heading.after(guide);
    }
    // Keep the original heading and its ID inside each disclosure for links, search and print.
    let subtopic;
    for (const node of [...step.el.children]) {
      if (node.matches('h4')) {
        subtopic = studyElement('details', 'subtopic');
        subtopic.open = !step.el.querySelector('.subtopic');
        const summary = studyElement('summary', '', node.textContent);
        node.before(subtopic);
        subtopic.append(summary, node);
      } else if (subtopic) {
        subtopic.append(node);
      }
    }
  }
  return steps;
}

function mountStudyReader(doc, article, nextDoc, makeRoute) {
  if (doc.id === 'overview') return mountStudyHome(article, makeRoute);
  const steps = collectStudySteps(doc, article);
  if (!steps.length) return null;
  const tools = studyElement('div', 'study-tools');
  tools.innerHTML = `
    <div class="study-modes" role="group" aria-label="阅读方式">
      <button type="button" data-mode="focus">分段学习</button><button type="button" data-mode="full">阅读全文</button>
    </div>
    <label class="step-picker"><span>小节</span><select aria-label="跳到小节"></select></label>`;
  const picker = tools.querySelector('select');
  steps.forEach((step, i) => picker.add(new Option((i + 1) + ' / ' + steps.length + ' · ' + step.label, String(i))));
  const current = studyElement('div', 'study-current');
  const pager = studyElement('nav', 'study-pager');
  pager.setAttribute('aria-label', '小节翻页');
  const back = studyElement('button', 'previous-step', '← 上一小节');
  const forward = studyElement('button', 'next-step');
  const preview = studyElement('p', 'next-preview');
  pager.append(preview, back, forward);
  const others = studyElement('details', 'other-sections');
  const summary = studyElement('summary', '', '查阅本页其他小节');
  const rest = studyElement('div');
  others.append(summary, rest);
  article.append(tools, current, pager, others);
  let mode = studyStorage.read('mode') === 'full' ? 'full' : 'focus';
  let index = Math.max(0, steps.findIndex(s => s.anchor === studyStorage.read(doc.id + '.place')));
  let displayed = false;

  function locate(anchor) {
    if (!anchor) return index;
    const target = document.getElementById(anchor);
    const i = steps.findIndex(s => s.anchor === anchor || (target && s.el.contains(target)));
    return i < 0 ? index : i;
  }
  function remember() {
    studyStorage.write(doc.id + '.place', steps[index].anchor);
    studyStorage.write(doc.id + '.label', steps[index].label);
    studyStorage.write('last', doc.id);
  }
  function display() {
    article.dataset.mode = mode;
    document.body.dataset.reading = mode;
    for (const button of tools.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    picker.value = String(index);
    others.open = false;
    others.hidden = mode === 'full' || steps.length < 2;
    pager.hidden = mode === 'full';
    if (mode === 'focus') {
      current.replaceChildren(steps[index].el);
      rest.replaceChildren(...steps.filter((_, i) => i !== index).map(s => s.el));
    } else {
      current.replaceChildren(...steps.map(s => s.el));
    }
    for (const detail of article.querySelectorAll('.subtopic')) {
      if (mode === 'full' && !detail.open) { detail.dataset.openForFull = 'true'; detail.open = true; }
      else if (mode === 'focus' && detail.dataset.openForFull) { detail.open = false; delete detail.dataset.openForFull; }
    }
    const next = steps[index + 1];
    back.disabled = index === 0;
    forward.hidden = !next && !nextDoc;
    forward.textContent = next ? '下一小节 →' : '进入下一篇 →';
    preview.textContent = next ? '接下来 · ' + (next.question || next.label) : nextDoc ? '下一篇 · ' + nextDoc.label : '已到本页末尾';
    displayed = true;
  }
  function jump(i) {
    // Anchored routes make the browser's Back button work on both editions.
    const anchor = steps[i].anchor;
    if (location.hash === new URL(makeRoute(doc.id, anchor), location.href).hash) reveal(anchor, true);
    else location.href = makeRoute(doc.id, anchor);
  }
  function reveal(anchor, focus = false) {
    const i = locate(anchor);
    if (i !== index || !displayed) { index = i; display(); }
    remember();
    const target = (anchor && document.getElementById(anchor)) || steps[index].el;
    const detail = target.closest('.subtopic');
    if (detail) detail.open = true;
    if (focus) {
      const destination = detail?.querySelector('summary') || target;
      if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1;
      destination.focus({ preventScroll: true });
      destination.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  picker.onchange = () => jump(Number(picker.value));
  back.onclick = () => jump(index - 1);
  forward.onclick = () => { if (index + 1 < steps.length) jump(index + 1); else if (nextDoc) location.href = makeRoute(nextDoc.id); };
  for (const button of tools.querySelectorAll('[data-mode]')) {
    button.onclick = () => {
      if (button.dataset.mode === mode) return;
      mode = button.dataset.mode;
      studyStorage.write('mode', mode);
      display();
      if (mode === 'full' && index > 0) steps[index].el.scrollIntoView({ behavior: 'instant' });
    };
  }
  // Attach all chunks before resolving a deep link into a previously unmounted chunk.
  rest.append(...steps.map(s => s.el));
  return {
    reveal,
    get resumed() { return index > 0; },
    trackScroll() {
      if (mode !== 'full' || this.previousMode || !displayed) return;
      const line = Math.min(innerHeight / 3, 200);
      let visible = 0;
      for (const [i, step] of steps.entries()) {
        if (step.el.getBoundingClientRect().top > line) break;
        visible = i;
      }
      if (visible === index) return;
      index = visible;
      picker.value = String(index);
      remember();
    },
    beforePrint() {
      this.previousMode = mode;
      mode = 'full'; display();
    },
    afterPrint() {
      if (!this.previousMode) return;
      mode = this.previousMode; this.previousMode = null; display();
    },
  };
}
