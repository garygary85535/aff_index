'use strict';
const fields = ['search', 'type', 'author', 'paid', 'invite'];
const controls = Object.fromEntries(fields.map(id => [id, document.getElementById(id)]));
let stories = [];
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function isPaid(story) { return ['是', '部分付費'].includes(story['付費文章']); }
function render() {
  const query = normalize(controls.search.value.trim());
  const filtered = stories.filter(s =>
    (!query || normalize([s['篇名'], s['作者'], s['標籤']].join(' ')).includes(query)) &&
    (!controls.type.value || s['譯作/原創'] === controls.type.value) &&
    (!controls.author.value || s['作者'] === controls.author.value) &&
    (!controls.invite.value || s['邀請制'] === controls.invite.value) &&
    (!controls.paid.value || (controls.paid.value === 'yes' ? isPaid(s) : !isPaid(s)))
  );
  document.getElementById('count').textContent = `${filtered.length} / ${stories.length} 筆文章`;
  document.getElementById('empty').hidden = filtered.length !== 0;
  const fragment = document.createDocumentFragment();
  for (const story of filtered) {
    const card = element('article', 'story');
    if (story['封面'] && /^assets\/covers\/\d+\.webp$/.test(story['封面'])) {
      const cover = element('img', 'cover');
      cover.src = story['封面'];
      cover.alt = `${story['篇名']} 封面`;
      cover.loading = 'lazy';
      cover.decoding = 'async';
      cover.width = 360; cover.height = 480;
      cover.addEventListener('error', () => cover.remove(), { once: true });
      card.append(cover);
    }
    const badges = element('div', 'meta');
    badges.append(element('span', 'badge', story['譯作/原創']));
    if (isPaid(story)) badges.append(element('span', 'badge paid', story['付費文章'] === '部分付費' ? '部分付費' : '付費文章'));
    if (story['邀請制'] === '是') badges.append(element('span', 'badge invite', '邀請制'));
    card.append(badges, element('h2', '', story['篇名']), element('p', 'author', story['作者']), element('p', 'tags', story['標籤']));
    const link = element('a', 'read', story['邀請制'] === '是' ? '前往傳送門' : '前往 AFF 閱讀');
    const url = new URL(story['連結']);
    if (url.protocol === 'https:' && /^(www\.)?asianfanfics\.com$/.test(url.hostname)) link.href = url.href;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    card.append(link); fragment.append(card);
  }
  document.getElementById('stories').replaceChildren(fragment);
}
for (const control of Object.values(controls)) control.addEventListener('input', render);
document.getElementById('reset').addEventListener('click', () => { for (const control of Object.values(controls)) control.value = ''; render(); });
fetch('./data/catalog.json').then(response => {
  if (!response.ok) throw new Error('目錄載入失敗');
  return response.json();
}).then(catalog => {
  stories = catalog.stories.filter(s => s['譯作/原創'] !== '不公開' && !String(s['標籤']).includes('草稿') && !s['連結'].endsWith('/1736800'));
  const authors = [...new Set(stories.map(s => s['作者']))].sort((a,b) => a.localeCompare(b,'zh-Hant'));
  for (const author of authors) { const option = element('option', '', author); option.value = author; controls.author.append(option); }
  document.getElementById('updated').textContent = `目錄更新：${catalog.updatedAt}`;
  render();
}).catch(() => { document.getElementById('count').textContent = '目錄暫時無法載入，請重新整理頁面。'; });
