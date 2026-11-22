export function renderCourseNavigation(groups, docs, currentId, escape) {
  const byId = new Map(docs.map(doc => [doc.id, doc]));
  return groups.map(group => {
    const first = byId.get(group.ids[0]);
    const last = byId.get(group.ids.at(-1));
    const label = group.label.replace(/^[一二三四] · /, '');
    const range = first.num ? `<small class="nav-range">${first.num}–${last.num}</small>` : '';
    const items = group.ids.map(id => {
      const doc = byId.get(id);
      const current = id === currentId ? ' aria-current="page"' : '';
      const number = doc.num ? `<span class="num">${doc.num}</span>` : '';
      return `<li><a class="nav-item" data-doc="${id}" href="#/${id}"${current}>${number}<span>${escape(doc.label)}</span></a></li>`;
    }).join('');
    return `<details class="nav-group" data-group="${first.id}"${group.ids.includes(currentId) ? ' open' : ''}>
      <summary class="nav-label"><span>${escape(label)}</span>${range}</summary>
      <ul class="nav-chapters">${items}</ul>
    </details>`;
  }).join('');
}
