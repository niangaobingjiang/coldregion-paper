const TOPICS = ['河冰', '冰塞', '降雪与积雪', '冰川与融水', '海冰', '冻土与冻融', '冰冻圈水文', '遥感与模型', '冰雪灾害', '祁连山水文', '青藏高原寒区水文'];
const SEARCH_TERMS = ['river ice', 'ice jam', 'snow', 'glacier', 'sea ice', 'permafrost', 'freeze thaw', 'cryosphere hydrology', 'Qilian Mountains hydrology', 'Tibetan Plateau hydrology'];
const state = {
  journals: [], papers: [], activeTopic: '全部', activeView: 'feed', settings: { time: '08:30' }, saved: [], cursors: {}
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const lower = (value = '') => value.toLowerCase();

function getStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function setStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function localDate(date = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date); }
function prettyDate(date) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeZone: 'Asia/Shanghai' }).format(date); }
function sourceMatches(name) { return state.journals.some(j => j.active && lower(j.name) === lower(name)); }

function invertAbstract(index) {
  if (!index) return '';
  return Object.entries(index).flatMap(([word, positions]) => positions.map(position => [position, word])).sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(' ');
}
function getTopics(paper) {
  const haystack = lower([
    paper.title,
    paper.abstract,
    ...(paper.keywords || []),
    ...(paper.topics || []),
    paper.primaryTopic
  ].filter(Boolean).join(' '));
  const map = {
    '河冰': ['river ice', 'river-ice', 'riverine ice', 'ice cover'],
    '冰塞': ['ice jam', 'ice-jam', 'ice-jamming', 'jam flood'],
    '降雪与积雪': ['snow', 'snowpack', 'snowfall', 'snowmelt'],
    '冰川与融水': ['glacier', 'glacial', 'meltwater', 'ice sheet'],
    '海冰': ['sea ice', 'marine ice', 'antarctic ice', 'arctic ice'],
    '冻土与冻融': ['permafrost', 'freeze-thaw', 'freeze thaw', 'seasonal frost'],
    '冰冻圈水文': ['cryosphere', 'cold region', 'cold-region', 'hydrolog', 'runoff'],
    '遥感与模型': ['remote sensing', 'satellite', 'sar', 'model', 'machine learning'],
    '冰雪灾害': ['avalanche', 'icing', 'ice flood', 'frost hazard'],
    '祁连山水文': ['qilian mountains', 'qilian mountain', 'qilian shan'],
    '青藏高原寒区水文': ['tibetan plateau', 'qinghai-tibet', 'qinghai tibet', 'third pole']
  };
  return TOPICS.filter(topic => map[topic].some(term => haystack.includes(term))).slice(0, 3);
}
function articleFromOpenAlex(work) {
  const source = work.primary_location?.source?.display_name || work.locations?.[0]?.source?.display_name || '未标注期刊';
  return {
    id: work.id,
    title: work.title || '未提供标题',
    journal: source,
    date: work.publication_date,
    authors: (work.authorships || []).slice(0, 4).map(a => a.author?.display_name).filter(Boolean).join(' · ') || '作者信息待补充',
    abstract: invertAbstract(work.abstract_inverted_index),
    keywords: (work.keywords || []).map(keyword => keyword.display_name).filter(Boolean),
    topics: (work.topics || []).flatMap(topic => [topic.display_name, topic.subfield?.display_name, topic.field?.display_name]).filter(Boolean),
    primaryTopic: work.primary_topic?.display_name || '',
    url: work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : work.primary_location?.landing_page_url || work.id,
    cited: work.cited_by_count || 0
  };
}
function dateOffset(days) { const d = new Date(); d.setDate(d.getDate() - days); return localDate(d); }

async function fetchSearchPage(term, cursor) {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', term);
  url.searchParams.set('filter', `from_publication_date:${dateOffset(120)},to_publication_date:${localDate()},type:article`);
  url.searchParams.set('sort', 'publication_date:desc');
  url.searchParams.set('per-page', '100');
  url.searchParams.set('cursor', cursor);
  url.searchParams.set('select', 'id,title,doi,publication_date,authorships,primary_location,locations,cited_by_count,abstract_inverted_index,keywords,topics,primary_topic');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`OpenAlex ${response.status}`);
  const data = await response.json();
  return { term, results: data.results || [], nextCursor: data.meta?.next_cursor || null };
}

async function getNextBatch(reset = false) {
  if (reset) state.cursors = Object.fromEntries(SEARCH_TERMS.map(term => [term, '*']));
  const targets = SEARCH_TERMS.filter(term => state.cursors[term]);
  const batches = await Promise.all(targets.map(term => fetchSearchPage(term, state.cursors[term])));
  batches.forEach(batch => { state.cursors[batch.term] = batch.nextCursor; });
  const existing = new Set(state.papers.map(paper => paper.id));
  batches.flatMap(batch => batch.results).map(articleFromOpenAlex).forEach(paper => {
    if (sourceMatches(paper.journal) && !existing.has(paper.id)) { existing.add(paper.id); state.papers.push(paper); }
  });
  state.papers.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

async function loadPapers() {
  $('#loading').classList.remove('hidden');
  $('#paperList').classList.add('hidden');
  $('#loadMoreButton').classList.add('hidden');
  $('#status').textContent = '';
  try {
    state.papers = [];
    await getNextBatch(true);
    $('#status').textContent = state.papers.length
      ? `数据来源：OpenAlex · 已用 10 组冰雪与寒区主题词检索并按期刊过滤 · 当前已显示 ${state.papers.length} 篇，不设每日篇数上限`
      : '本次检索没有在已关注期刊中找到匹配文章。可在“期刊来源”中扩大追踪范围，或稍后重试。';
  } catch (error) {
    state.papers = [];
    $('#status').textContent = '暂时无法连接 OpenAlex。请检查网络后重试；网页会保留你的期刊和推送设置。';
  }
  $('#loading').classList.add('hidden');
  $('#paperList').classList.remove('hidden');
  render();
}

async function loadMorePapers() {
  $('#loadMoreButton').disabled = true;
  $('#loadMoreButton').textContent = '正在继续检索…';
  try {
    await getNextBatch();
    $('#status').textContent = `数据来源：OpenAlex · 已显示 ${state.papers.length} 篇匹配文章，不设上限，可继续加载。`;
  } catch (error) {
    $('#status').textContent = '继续检索时遇到网络问题，请稍后重试。';
  }
  $('#loadMoreButton').disabled = false;
  $('#loadMoreButton').textContent = '加载更多匹配文章';
  render();
}

function paperMatches(paper) {
  const query = lower($('#searchInput').value.trim());
  const topicOk = state.activeTopic === '全部' || getTopics(paper).includes(state.activeTopic);
  return sourceMatches(paper.journal) && topicOk && (!query || lower(`${paper.title} ${paper.journal} ${paper.authors} ${paper.abstract}`).includes(query));
}
function renderPapers(target, list) {
  target.innerHTML = '';
  if (!list.length) {
    target.innerHTML = `<div class="loading">没有找到匹配文献。${state.papers.length ? '试试更换主题或搜索词。' : '点击“获取最新文献”重新检索。'}</div>`;
    return;
  }
  list.forEach(paper => {
    const node = $('#paperTemplate').content.cloneNode(true);
    node.querySelector('.journal').textContent = paper.journal;
    node.querySelector('.date').textContent = paper.date || '日期待补充';
    node.querySelector('.score').textContent = `引用 ${paper.cited}`;
    node.querySelector('.paper-title').textContent = paper.title;
    node.querySelector('.authors').textContent = paper.authors;
    const abstract = paper.abstract || '该条目暂未提供可公开获取的摘要。';
    node.querySelector('.abstract').textContent = abstract.length > 310 ? `${abstract.slice(0, 310)}…` : abstract;
    const tags = node.querySelector('.tags');
    (getTopics(paper).length ? getTopics(paper) : ['寒区研究']).forEach(tag => { const span = document.createElement('span'); span.className = 'tag'; span.textContent = tag; tags.append(span); });
    const bookmark = node.querySelector('.bookmark');
    const saved = state.saved.some(item => item.id === paper.id);
    bookmark.textContent = saved ? '♥' : '♡'; bookmark.classList.toggle('saved', saved);
    bookmark.addEventListener('click', () => toggleSaved(paper));
    const link = node.querySelector('.read'); link.href = paper.url;
    target.append(node);
  });
}
function renderChips() {
  const container = $('#topicChips'); container.innerHTML = '';
  ['全部', ...TOPICS].forEach(topic => { const button = document.createElement('button'); button.className = `chip ${state.activeTopic === topic ? 'active' : ''}`; button.textContent = topic; button.onclick = () => { state.activeTopic = topic; render(); }; container.append(button); });
}
function renderSources() {
  const query = lower($('#journalSearch').value.trim());
  const list = $('#journalList'); list.innerHTML = '';
  state.journals.map((journal, index) => ({ journal, index })).filter(({ journal }) => !query || lower(`${journal.name} ${journal.field}`).includes(query)).forEach(({ journal, index }) => {
    const item = document.createElement('div'); item.className = 'journal-item';
    item.innerHTML = `<div><span class="journal-name">${escapeHtml(journal.name)}</span><span class="journal-field">${escapeHtml(journal.field)}</span></div><label class="switch"><input type="checkbox" ${journal.active ? 'checked' : ''} aria-label="追踪 ${escapeHtml(journal.name)}"><span class="slider"></span></label>`;
    item.querySelector('input').addEventListener('change', event => { state.journals[index].active = event.target.checked; saveJournals(); renderStats(); });
    list.append(item);
  });
}
function renderStats() {
  const active = state.journals.filter(j => j.active).length;
  $('#activeJournalCount').textContent = active;
  $('#sourceCount').textContent = active;
  $('#feedCount').textContent = state.papers.length || '';
  $('#savedCount').textContent = state.saved.length || '';
  $('#pushTime').textContent = state.settings.time;
}
function render() {
  renderStats(); renderChips();
  renderPapers($('#paperList'), state.papers.filter(paperMatches));
  renderPapers($('#savedList'), state.saved);
  renderSources();
  $('#loadMoreButton').classList.toggle('hidden', !Object.values(state.cursors).some(Boolean) || state.activeView !== 'feed');
}
function toggleSaved(paper) {
  const index = state.saved.findIndex(item => item.id === paper.id);
  if (index === -1) state.saved.unshift(paper); else state.saved.splice(index, 1);
  setStore('cryo-saved', state.saved); render();
}
function saveJournals() { setStore('cryo-journals', state.journals); }
function showView(view) {
  state.activeView = view;
  document.querySelectorAll('.nav').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const feed = view === 'feed';
  $('#digestPanel').classList.toggle('hidden', !feed); $('#feedToolbar').classList.toggle('hidden', !feed); $('#paperList').classList.toggle('hidden', !feed); $('#sourceView').classList.toggle('hidden', view !== 'sources'); $('#savedView').classList.toggle('hidden', view !== 'saved'); $('#loading').classList.toggle('hidden', !feed || $('#loading').classList.contains('hidden'));
  $('#viewTitle').textContent = view === 'feed' ? '今日文献速递' : view === 'sources' ? '期刊来源' : '我的收藏';
  $('#viewSubtitle').textContent = view === 'feed' ? '从追踪期刊中甄选与河冰、冰冻圈和寒区水文相关的研究' : view === 'sources' ? '管理每日检索使用的期刊范围' : '你标记保存的文献会保存在当前浏览器中';
}
async function requestNotification() {
  if (!('Notification' in window)) return alert('当前浏览器不支持通知。');
  const permission = await Notification.requestPermission();
  $('#notificationButton').textContent = permission === 'granted' ? '浏览器提醒已开启' : '未授予提醒权限';
  if (permission === 'granted') new Notification('冰川信使已准备就绪', { body: `每天 ${state.settings.time} 为你检查河冰与寒区水文新文献。` });
}
function checkDailyDigest() {
  const now = new Date(); const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(now);
  const key = `cryo-digest-${localDate(now)}`;
  if (clock === state.settings.time && !localStorage.getItem(key)) {
    localStorage.setItem(key, 'sent');
    loadPapers().then(() => { if (Notification.permission === 'granted') new Notification('今日河冰与寒区水文速递', { body: `已发现 ${state.papers.length} 篇匹配文章，点击打开网页查看。` }); });
  }
}
async function init() {
  const imported = await fetch('./journals.json').then(response => response.json());
  const savedJournals = getStore('cryo-journals', null);
  state.journals = savedJournals || imported.map(journal => ({ ...journal, active: true }));
  state.saved = getStore('cryo-saved', []);
  state.settings = { ...state.settings, ...getStore('cryo-settings', {}) };
  $('#dateLabel').textContent = prettyDate(); $('#timeInput').value = state.settings.time;
  $('#notificationButton').textContent = window.Notification?.permission === 'granted' ? '浏览器提醒已开启' : '开启浏览器提醒';
  document.querySelectorAll('.nav').forEach(button => button.onclick = () => showView(button.dataset.view));
  $('#refreshButton').onclick = loadPapers; $('#notificationButton').onclick = requestNotification; $('#settingsButton').onclick = () => $('#settingsDialog').showModal();
  $('#searchInput').addEventListener('input', render); $('#journalSearch').addEventListener('input', renderSources);
  $('#saveSettings').addEventListener('click', () => { state.settings = { time: $('#timeInput').value }; setStore('cryo-settings', state.settings); renderStats(); });
  $('#resetButton').onclick = () => { if (confirm('确定清除本浏览器中的期刊开关、收藏和推送设置吗？')) { ['cryo-journals', 'cryo-saved', 'cryo-settings'].forEach(key => localStorage.removeItem(key)); location.reload(); } };
  $('#loadMoreButton').onclick = loadMorePapers;
  render(); loadPapers(); setInterval(checkDailyDigest, 30 * 1000);
}
init();
