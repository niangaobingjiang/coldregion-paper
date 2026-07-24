const TOPICS = ['娌冲啺', '鍐板', '闄嶉洩涓庣Н闆?, '鍐板窛涓庤瀺姘?, '娴峰啺', '鍐诲湡涓庡喕铻?, '鍐板喕鍦堟按鏂?, '閬ユ劅涓庢ā鍨?, '鍐伴洩鐏惧', '绁佽繛灞辨按鏂?, '闈掕棌楂樺師瀵掑尯姘存枃'];
const SEARCH_TERMS = ['river ice', 'ice jam', 'snow', 'glacier', 'sea ice', 'permafrost', 'freeze thaw', 'cryosphere hydrology', 'Qilian Mountains hydrology', 'Tibetan Plateau hydrology'];
const state = {
  journals: [], papers: [], activeTopic: '鍏ㄩ儴', activeView: 'feed', settings: { time: '08:30' }, saved: [], cursors: {}
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
  const haystack = lower(`${paper.title} ${paper.abstract}`);
  const map = {
    '娌冲啺': ['river ice', 'river-ice', 'riverine ice', 'ice cover'],
    '鍐板': ['ice jam', 'ice-jam', 'ice-jamming', 'jam flood'],
    '闄嶉洩涓庣Н闆?: ['snow', 'snowpack', 'snowfall', 'snowmelt'],
    '鍐板窛涓庤瀺姘?: ['glacier', 'glacial', 'meltwater', 'ice sheet'],
    '娴峰啺': ['sea ice', 'marine ice', 'antarctic ice', 'arctic ice'],
    '鍐诲湡涓庡喕铻?: ['permafrost', 'freeze-thaw', 'freeze thaw', 'seasonal frost'],
    '鍐板喕鍦堟按鏂?: ['cryosphere', 'cold region', 'cold-region', 'hydrolog', 'runoff'],
    '閬ユ劅涓庢ā鍨?: ['remote sensing', 'satellite', 'sar', 'model', 'machine learning'],
    '鍐伴洩鐏惧': ['avalanche', 'icing', 'ice flood', 'frost hazard'],
    '绁佽繛灞辨按鏂?: ['qilian mountains', 'qilian mountain', 'qilian shan'],
    '闈掕棌楂樺師瀵掑尯姘存枃': ['tibetan plateau', 'qinghai-tibet', 'qinghai tibet', 'third pole']
  };
  return TOPICS.filter(topic => map[topic].some(term => haystack.includes(term))).slice(0, 3);
}
function articleFromOpenAlex(work) {
  const source = work.primary_location?.source?.display_name || work.locations?.[0]?.source?.display_name || '鏈爣娉ㄦ湡鍒?;
  return {
    id: work.id,
    title: work.title || '鏈彁渚涙爣棰?,
    journal: source,
    date: work.publication_date,
    authors: (work.authorships || []).slice(0, 4).map(a => a.author?.display_name).filter(Boolean).join(' 路 ') || '浣滆€呬俊鎭緟琛ュ厖',
    abstract: invertAbstract(work.abstract_inverted_index),
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
  url.searchParams.set('per-page', '200');
  url.searchParams.set('cursor', cursor);
  url.searchParams.set('select', 'id,title,doi,publication_date,authorships,primary_location,locations,cited_by_count');
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
      ? `鏁版嵁鏉ユ簮锛歄penAlex 路 宸茬敤 10 缁勫啺闆笌瀵掑尯涓婚璇嶆绱㈠苟鎸夋湡鍒婅繃婊?路 褰撳墠宸叉樉绀?${state.papers.length} 绡囷紝涓嶈姣忔棩绡囨暟涓婇檺`
      : '鏈妫€绱㈡病鏈夊湪宸插叧娉ㄦ湡鍒婁腑鎵惧埌鍖归厤鏂囩珷銆傚彲鍦ㄢ€滄湡鍒婃潵婧愨€濅腑鎵╁ぇ杩借釜鑼冨洿锛屾垨绋嶅悗閲嶈瘯銆?;
  } catch (error) {
    state.papers = [];
    $('#status').textContent = '鏆傛椂鏃犳硶杩炴帴 OpenAlex銆傝妫€鏌ョ綉缁滃悗閲嶈瘯锛涚綉椤典細淇濈暀浣犵殑鏈熷垔鍜屾帹閫佽缃€?;
  }
  $('#loading').classList.add('hidden');
  $('#paperList').classList.remove('hidden');
  render();
}

async function loadMorePapers() {
  $('#loadMoreButton').disabled = true;
  $('#loadMoreButton').textContent = '姝ｅ湪缁х画妫€绱⑩€?;
  try {
    await getNextBatch();
    $('#status').textContent = `鏁版嵁鏉ユ簮锛歄penAlex 路 宸叉樉绀?${state.papers.length} 绡囧尮閰嶆枃绔狅紝涓嶈涓婇檺锛屽彲缁х画鍔犺浇銆俙;
  } catch (error) {
    $('#status').textContent = '缁х画妫€绱㈡椂閬囧埌缃戠粶闂锛岃绋嶅悗閲嶈瘯銆?;
  }
  $('#loadMoreButton').disabled = false;
  $('#loadMoreButton').textContent = '鍔犺浇鏇村鍖归厤鏂囩珷';
  render();
}

function paperMatches(paper) {
  const query = lower($('#searchInput').value.trim());
  const topicOk = state.activeTopic === '鍏ㄩ儴' || getTopics(paper).includes(state.activeTopic);
  return sourceMatches(paper.journal) && topicOk && (!query || lower(`${paper.title} ${paper.journal} ${paper.authors} ${paper.abstract}`).includes(query));
}
function renderPapers(target, list) {
  target.innerHTML = '';
  if (!list.length) {
    target.innerHTML = `<div class="loading">娌℃湁鎵惧埌鍖归厤鏂囩尞銆?{state.papers.length ? '璇曡瘯鏇存崲涓婚鎴栨悳绱㈣瘝銆? : '鐐瑰嚮鈥滆幏鍙栨渶鏂版枃鐚€濋噸鏂版绱€?}</div>`;
    return;
  }
  list.forEach(paper => {
    const node = $('#paperTemplate').content.cloneNode(true);
    node.querySelector('.journal').textContent = paper.journal;
    node.querySelector('.date').textContent = paper.date || '鏃ユ湡寰呰ˉ鍏?;
    node.querySelector('.score').textContent = `寮曠敤 ${paper.cited}`;
    node.querySelector('.paper-title').textContent = paper.title;
    node.querySelector('.authors').textContent = paper.authors;
    const abstract = paper.abstract || '璇ユ潯鐩殏鏈彁渚涘彲鍏紑鑾峰彇鐨勬憳瑕併€?;
    node.querySelector('.abstract').textContent = abstract.length > 310 ? `${abstract.slice(0, 310)}鈥 : abstract;
    const tags = node.querySelector('.tags');
    (getTopics(paper).length ? getTopics(paper) : ['瀵掑尯鐮旂┒']).forEach(tag => { const span = document.createElement('span'); span.className = 'tag'; span.textContent = tag; tags.append(span); });
    const bookmark = node.querySelector('.bookmark');
    const saved = state.saved.some(item => item.id === paper.id);
    bookmark.textContent = saved ? '鈾? : '鈾?; bookmark.classList.toggle('saved', saved);
    bookmark.addEventListener('click', () => toggleSaved(paper));
    const link = node.querySelector('.read'); link.href = paper.url;
    target.append(node);
  });
}
function renderChips() {
  const container = $('#topicChips'); container.innerHTML = '';
  ['鍏ㄩ儴', ...TOPICS].forEach(topic => { const button = document.createElement('button'); button.className = `chip ${state.activeTopic === topic ? 'active' : ''}`; button.textContent = topic; button.onclick = () => { state.activeTopic = topic; render(); }; container.append(button); });
}
function renderSources() {
  const query = lower($('#journalSearch').value.trim());
  const list = $('#journalList'); list.innerHTML = '';
  state.journals.map((journal, index) => ({ journal, index })).filter(({ journal }) => !query || lower(`${journal.name} ${journal.field}`).includes(query)).forEach(({ journal, index }) => {
    const item = document.createElement('div'); item.className = 'journal-item';
    item.innerHTML = `<div><span class="journal-name">${escapeHtml(journal.name)}</span><span class="journal-field">${escapeHtml(journal.field)}</span></div><label class="switch"><input type="checkbox" ${journal.active ? 'checked' : ''} aria-label="杩借釜 ${escapeHtml(journal.name)}"><span class="slider"></span></label>`;
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
  $('#viewTitle').textContent = view === 'feed' ? '浠婃棩鏂囩尞閫熼€? : view === 'sources' ? '鏈熷垔鏉ユ簮' : '鎴戠殑鏀惰棌';
  $('#viewSubtitle').textContent = view === 'feed' ? '浠庤拷韪湡鍒婁腑鐢勯€変笌娌冲啺銆佸啺鍐诲湀鍜屽瘨鍖烘按鏂囩浉鍏崇殑鐮旂┒' : view === 'sources' ? '绠＄悊姣忔棩妫€绱娇鐢ㄧ殑鏈熷垔鑼冨洿' : '浣犳爣璁颁繚瀛樼殑鏂囩尞浼氫繚瀛樺湪褰撳墠娴忚鍣ㄤ腑';
}
async function requestNotification() {
  if (!('Notification' in window)) return alert('褰撳墠娴忚鍣ㄤ笉鏀寔閫氱煡銆?);
  const permission = await Notification.requestPermission();
  $('#notificationButton').textContent = permission === 'granted' ? '娴忚鍣ㄦ彁閱掑凡寮€鍚? : '鏈巿浜堟彁閱掓潈闄?;
  if (permission === 'granted') new Notification('鍐板窛淇′娇宸插噯澶囧氨缁?, { body: `姣忓ぉ ${state.settings.time} 涓轰綘妫€鏌ユ渤鍐颁笌瀵掑尯姘存枃鏂版枃鐚€俙 });
}
function checkDailyDigest() {
  const now = new Date(); const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(now);
  const key = `cryo-digest-${localDate(now)}`;
  if (clock === state.settings.time && !localStorage.getItem(key)) {
    localStorage.setItem(key, 'sent');
    loadPapers().then(() => { if (Notification.permission === 'granted') new Notification('浠婃棩娌冲啺涓庡瘨鍖烘按鏂囬€熼€?, { body: `宸插彂鐜?${state.papers.length} 绡囧尮閰嶆枃绔狅紝鐐瑰嚮鎵撳紑缃戦〉鏌ョ湅銆俙 }); });
  }
}
async function init() {
  const imported = await fetch('./journals.json').then(response => response.json());
  const savedJournals = getStore('cryo-journals', null);
  state.journals = savedJournals || imported.map(journal => ({ ...journal, active: true }));
  state.saved = getStore('cryo-saved', []);
  state.settings = { ...state.settings, ...getStore('cryo-settings', {}) };
  $('#dateLabel').textContent = prettyDate(); $('#timeInput').value = state.settings.time;
  $('#notificationButton').textContent = window.Notification?.permission === 'granted' ? '娴忚鍣ㄦ彁閱掑凡寮€鍚? : '寮€鍚祻瑙堝櫒鎻愰啋';
  document.querySelectorAll('.nav').forEach(button => button.onclick = () => showView(button.dataset.view));
  $('#refreshButton').onclick = loadPapers; $('#notificationButton').onclick = requestNotification; $('#settingsButton').onclick = () => $('#settingsDialog').showModal();
  $('#searchInput').addEventListener('input', render); $('#journalSearch').addEventListener('input', renderSources);
  $('#saveSettings').addEventListener('click', () => { state.settings = { time: $('#timeInput').value }; setStore('cryo-settings', state.settings); renderStats(); });
  $('#resetButton').onclick = () => { if (confirm('纭畾娓呴櫎鏈祻瑙堝櫒涓殑鏈熷垔寮€鍏炽€佹敹钘忓拰鎺ㄩ€佽缃悧锛?)) { ['cryo-journals', 'cryo-saved', 'cryo-settings'].forEach(key => localStorage.removeItem(key)); location.reload(); } };
  $('#loadMoreButton').onclick = loadMorePapers;
  render(); loadPapers(); setInterval(checkDailyDigest, 30 * 1000);
}
init();

