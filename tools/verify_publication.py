"""Check published Markdown, prerendered chapters, metadata and offline parity."""
import base64
from pathlib import Path
from html import unescape
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'html'
ORIGIN = 'https://xuchen-cloud.github.io/cs329z-study'


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.ids = set()
        self.links = []
        self.resources = []
        self.meta = {}
        self.canonical = None
        self.article_depth = 0
        self.article_text = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, f'duplicate id: {a["id"]}'
            self.ids.add(a['id'])
        if tag == 'a':
            self.links.append(a.get('href', ''))
        if 'src' in a:
            self.resources.append(a['src'])
        if tag == 'link' and a.get('rel') == 'stylesheet':
            self.resources.append(a['href'])
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a['href']
        if tag == 'meta':
            self.meta[a.get('name', a.get('property'))] = a.get('content')
        if tag == 'article':
            self.article_depth += 1

    def handle_endtag(self, tag):
        if tag == 'article':
            self.article_depth -= 1

    def handle_data(self, data):
        if self.article_depth:
            self.article_text.append(data)


def verify_math(html, expected_count, location):
    formulas = re.findall(r'<math\b[^>]*>.*?</math>', html, re.S)
    assert len(formulas) == expected_count, f'missing typeset formula: {location}'
    for formula in formulas:
        math = ET.fromstring(formula)
        assert math.tag == '{http://www.w3.org/1998/Math/MathML}math'
        assert not re.search(r'\\[A-Za-z]+', ''.join(math.itertext())), location
    return len(formulas)


data = json.loads((OUT / 'assets/course-data.js').read_text().removeprefix('window.COURSE_DATA = ').strip().removesuffix(';'))
docs = data['docs']
assert len(docs) == 27
assert len(list(ROOT.glob('[0-9][0-9]-*.md'))) == 19
assert len(list((ROOT / 'exercises').glob('*.md'))) == 4
cases = [d for d in docs if d.get('study')]
assert {d['id'] for d in cases} == {
    d['id'] for d in docs if d['num'] or d['file'].startswith('exercises/')
}
for d in cases:
    case = d['study']
    assert 0 <= case['correct'] < len(case['choices']), d['id']
    assert all(label and feedback for label, feedback in case['choices']), d['id']
    assert all(label and example and explanation for label, example, explanation in case['steps']), d['id']
    assert case['steps'] and case['recall'] and case['comparison'], d['id']
for d in docs:
    if d['id'] == 'overview':
        continue
    levels = (3,) if d['num'] else (2, 3)
    guided = {h['id'] for h in d['headings'] if h['depth'] in levels}
    assert guided == d['questions'].keys(), f'check section questions against headings: {d["id"]}'
    if d['num']:
        assert all(cue['question'] and cue['bridge'] for cue in d['questions'].values()), d['id']

quiz_sections = quiz_questions = choice_questions = quiz_formulas = 0
section_sizes = {}
for d in docs:
    if not d['num']:
        assert 'quizzes' not in d
        continue
    bank = d['quizzes']
    authored_bank = json.loads((ROOT / 'tools/section-quizzes' / (d['id'] + '.json')).read_text())
    expected = set()
    in_explanation = False
    for heading in d['headings']:
        if heading['depth'] == 2:
            in_explanation = heading['id'] == '知识讲解'
        elif in_explanation and heading['depth'] == 3:
            expected.add(heading['id'])
    if d['id'] == 'lecture16':
        # The guest-lecture placeholder describes the source, not a teaching topic.
        expected.discard('1-已知范围与占位')
    assert set(bank) == set(authored_bank) == expected, f'quiz section coverage: {d["id"]}'
    prompts = set()
    for anchor, questions in bank.items():
        assert 2 <= len(questions) <= 5, (d['id'], anchor)
        section_sizes[len(questions)] = section_sizes.get(len(questions), 0) + 1
        assert any('options' in q for q in questions) and any('answer' in q for q in questions)
        assert len({q['id'] for q in questions}) == len(questions), (d['id'], anchor)
        assert len(questions) == len(authored_bank[anchor]), (d['id'], anchor)
        for q, authored_q in zip(questions, authored_bank[anchor]):
            assert {k: v for k, v in q.items() if k not in ('id', 'inlineHtml')} == authored_q, (d['id'], anchor)
            assert q['prompt'].strip() and q['prompt'] not in prompts, (d['id'], anchor)
            prompts.add(q['prompt'])
            assert 'criteria' not in q, q['prompt']
            if 'options' in q:
                assert len(set(q['options'])) == len(q['options']) >= 3
                assert all(option.strip() for option in q['options'])
                assert type(q['correct']) is int and 0 <= q['correct'] < len(q['options'])
                choice_questions += 1
            solution = q['explanation'] if 'options' in q else q['answer']
            paragraphs = [line.strip() for line in solution.splitlines() if line.strip()]
            assert len(paragraphs) >= 2, f"missing structured solution: {q['prompt']}"
            assert all(re.match(r'^[^：。？！，；\n]{1,20}：.+', line) for line in paragraphs), q['prompt']
            fragments = [q['prompt'], *q.get('options', [])]
            for paragraph in paragraphs:
                label, _, body = paragraph.partition('：')
                fragments.extend((label + '：', body))
            inline = q.get('inlineHtml', {})
            assert set(inline) <= set(fragments), q['prompt']
            for source in fragments:
                html = inline.get(source, '')
                code_pattern = r'`([^`\n]+)`'
                code = [unescape(text) for text in re.findall(r'<code>(.*?)</code>', html, re.S)]
                assert code == re.findall(code_pattern, source), source
                prose = re.sub(code_pattern, '', source)
                math_pattern = r'\$[^\n$]+\$'
                quiz_formulas += verify_math(html, len(re.findall(math_pattern, prose)), source)
                prose = re.sub(math_pattern, '', prose)
                assert html.count('<strong>') == len(re.findall(r'\*\*.+?\*\*', prose)), source
        quiz_questions += len(questions)
    quiz_sections += len(bank)
assert len(section_sizes) > 1, 'adjust question counts to the concepts in each section'

pages = {}
titles = set()
canonicals = set()
for d in docs:
    name = 'index.html' if d['id'] == 'overview' else d['id'] + '.html'
    html = (OUT / name).read_text()
    page = Page(html)
    pages[name] = page
    assert 'https://cs329z.stanford.edu/' in page.links, name
    if d['num'] and int(d['num']) <= 9:
        source_links = Page(d['html']).links
        assert any(link.startswith('https://youtu.be/') for link in source_links), name
        assert f'https://www.bilibili.com/video/BV1ARxc61Er2/?p={int(d["num"])}' in source_links, name
    assert page.article_text, f'empty server-rendered content: {name}'
    assert Page(d['html']).ids <= page.ids, f'missing headings: {name}'
    assert d['html'] in (OUT / 'offline.html').read_text() or d['id'] != 'overview'
    title = re.search(r'<title>(.*?)</title>', html)[1]
    assert title not in titles, f'duplicate title: {name}'
    titles.add(title)
    expected = ORIGIN + ('/' if name == 'index.html' else '/' + name)
    assert page.canonical == expected
    canonicals.add(expected)
    assert page.meta.get('description')
    assert page.meta.get('robots') == 'index,follow'
    assert page.meta.get('og:url') == expected
    assert page.meta.get('twitter:card') == 'summary'
    schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)[1])
    assert schema['url'] == expected
    assert not any(x.startswith('#/') for x in page.links), f'hash-only chapter link: {name}'

links = 0
for name, page in pages.items():
    for target in page.links + page.resources:
        url = urlsplit(target)
        if url.scheme or url.netloc:
            continue
        p = (OUT / unquote(url.path)).resolve() if url.path else OUT / name
        assert p.exists(), f'broken local link: {name} -> {target}'
        if url.fragment and p.name in pages:
            assert unquote(url.fragment) in pages[p.name].ids, f'broken anchor: {name} -> {target}'
        links += 1

formula_count = figure_count = comparison_count = note_count = 0
for doc in docs:
    text = (ROOT / doc['file']).read_text()
    html = doc['html']
    comparisons = len(re.findall(r'^> \[!NOTE\]\s*$', text, re.M))
    notes = len(re.findall(r'^> \[!(?:TIP|IMPORTANT)\]\s*$', text, re.M))
    assert html.count('<figure class="concept-comparison">') == comparisons, doc['file']
    assert html.count('<div class="reading-note ') == notes, doc['file']
    comparison_count += comparisons
    note_count += notes
    # Verify each delivered crop, its alt text and its linked source caption as a unit.
    images = re.findall(r'^!\[([^\]]+)\]\((docs/figures/[\w-]+\.png)\)$', text, re.M)
    figures = re.findall(r'<figure class="lecture-figure">(.*?)</figure>', html, re.S)
    assert len(figures) == len(images), doc['file']
    for (alt, filename), figure in zip(images, figures):
        png = (ROOT / filename).read_bytes()
        assert png.startswith(b'\x89PNG\r\n\x1a\n'), filename
        uri = 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')
        rendered = Page(figure)
        assert rendered.resources == [uri], f'missing embedded figure: {filename}'
        rendered_alt = re.search(r' alt="([^"]+)"', figure)
        assert rendered_alt and unescape(rendered_alt[1]) == alt, filename
        assert '<figcaption>' in figure and any(link.startswith('https://') for link in rendered.links), filename
        figure_count += 1
    # Count the authored math independently of the Markdown-to-HTML converter.
    prose = re.sub(r'^[ \t]*\x60{3}[^\x60\n]*\n.*?^[ \t]*\x60{3}[ \t]*$', '', text, flags=re.M | re.S)
    prose = re.sub(r'\x60[^\x60\n]*\x60', '', prose)
    authored = re.findall(r'\$\$.+?\$\$|\$[^\n$]+\$', prose, re.S)
    formula_count += verify_math(html, len(authored), doc['file'])
    assert '/Users/' not in text
    for href in re.findall(r'\]\(([^\s)]+)\)', text):
        u = urlsplit(href)
        if not u.scheme and not u.netloc:
            assert (ROOT / doc['file']).parent.joinpath(unquote(u.path)).exists(), (doc['file'], href)

offline = (OUT / 'offline.html').read_text()
offline_data = json.loads(re.search(r'<script id="course-data" type="application/json">(.*?)</script>', offline, re.S)[1])
assert offline_data == data, 'offline and online content differ'
offline_page = Page(offline)
assert offline_page.meta.get('robots') == 'noindex,follow'
assert not offline_page.resources, 'standalone reader requires a separate resource'
sources = json.loads(re.search(r'<script id="course-sources" type="application/json">(.*?)</script>', offline, re.S)[1])
for d in docs:
    assert sources[d['id']] == (ROOT / d['file']).read_text()
    for href in Page(d['html']).links:
        assert href.startswith(('#/', 'https://', 'http://')), f'file dependency in standalone reader: {href}'
rag = next(d for d in docs if d['id'] == 'lecture03')
retriever = re.search(r'<strong>检索器（Retriever）.*?(<math\b.*?</math>)', rag['html'], re.S)
math = ET.fromstring(retriever[1])
ns = {'m': 'http://www.w3.org/1998/Math/MathML'}
assert [n.text for n in math.find('.//m:msub', ns)] == ['p', 'η']
assert '∣' in [n.text for n in math.findall('.//m:mo', ns)]
sitemap = ET.parse(OUT / 'sitemap.xml')
locations = {e.text for e in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
assert locations == canonicals
assert f'Sitemap: {ORIGIN}/sitemap.xml' in (OUT / 'robots.txt').read_text()
print(json.dumps({'status': 'PASS', 'chapters': 19, 'exercises': 4, 'static_pages': len(pages), 'study_cases': len(cases), 'quiz_sections': quiz_sections, 'quiz_questions': quiz_questions, 'choice_questions': choice_questions, 'open_questions': quiz_questions - choice_questions, 'section_size_distribution': section_sizes, 'guided_sections': sum(len(d.get('questions', {})) for d in docs), 'local_links_and_assets': links, 'sitemap_urls': len(locations), 'typeset_formulas': formula_count, 'quiz_formulas': quiz_formulas, 'figures': figure_count, 'comparisons': comparison_count, 'notes': note_count, 'offline_content_matches': True}, ensure_ascii=False))
