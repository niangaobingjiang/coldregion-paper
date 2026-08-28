import fs from 'node:fs/promises';

const DEFAULT_SEARCH_TERMS = ['river ice', 'ice jam', 'snow', 'glacier', 'sea ice', 'permafrost', 'freeze thaw', 'cryosphere hydrology', 'Qilian Mountains hydrology', 'Tibetan Plateau hydrology'];
const requestedProfileId = (process.env.DIGEST_PROFILE || '').trim();
const profileId = requestedProfileId === 'default' ? '' : requestedProfileId;
const profiles = JSON.parse(await fs.readFile(new URL('../config/member-digest-profiles.json', import.meta.url), 'utf8'));
const profile = profileId ? profiles[profileId] : null;
if (profileId && !profile) throw new Error(`Unknown DIGEST_PROFILE: ${profileId}`);
const SEARCH_TERMS = profile?.searchTerms || DEFAULT_SEARCH_TERMS;
const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
const requestedDays = Number.parseInt(process.env.DIGEST_DAYS || '1', 10);
const DIGEST_DAYS = Number.isInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 14 ? requestedDays : 1;
const START_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(Date.now() - (DIGEST_DAYS - 1) * 24 * 60 * 60 * 1000));

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const lower = (value = '') => value.toLowerCase();
const journalMatches = (name, journals) => journals.some(journal => lower(journal.name) === lower(name));
const profileJournalMatches = (name) => profile.journals.some(journal => lower(journal) === lower(name));

function topicsFor(work) {
  const text = lower([
    work.title,
    work.abstract,
    ...(work.keywords || []),
    ...(work.topics || []),
    work.primaryTopic
  ].filter(Boolean).join(' '));
  const groups = {
    '河冰': ['river ice', 'river-ice', 'riverine ice', 'ice cover'],
    '冰塞': ['ice jam', 'ice-jam', 'ice-jamming'],
    '降雪与积雪': ['snow', 'snowpack', 'snowfall', 'snowmelt'],
    '冰川与融水': ['glacier', 'glacial', 'meltwater', 'ice sheet'],
    '海冰': ['sea ice', 'marine ice', 'antarctic ice', 'arctic ice'],
    '冻土与冻融': ['permafrost', 'freeze-thaw', 'freeze thaw'],
    '冰冻圈水文': ['cryosphere hydrology', 'glaciohydrology'],
    '遥感与模型': ['remote sensing', 'satellite', 'machine learning', 'modeling', 'modelling'],
    '祁连山水文': ['qilian mountains', 'qilian mountain', 'qilian shan'],
    '青藏高原寒区水文': ['tibetan plateau', 'qinghai-tibet', 'third pole']
  };
  return Object.entries(groups).filter(([, terms]) => terms.some(term => text.includes(term))).map(([topic]) => topic).slice(0, 3);
}

function matchesProfile(work) {
  if (!profile) return true;
  const text = lower([work.title, work.abstract, ...(work.keywords || []), ...(work.topics || []), work.primaryTopic].filter(Boolean).join(' '));
  return profile.matchTerms.some(term => text.includes(lower(term)));
}

async function fetchAll(term) {
  let cursor = '*';
  const collected = [];
  while (cursor) {
    const url = new URL('https://api.openalex.org/works');
    url.searchParams.set('search', term);
    url.searchParams.set('filter', `from_publication_date:${START_DATE},to_publication_date:${TODAY},type:article`);
    url.searchParams.set('sort', 'publication_date:desc');
    url.searchParams.set('per-page', '100');
    url.searchParams.set('cursor', cursor);
    url.searchParams.set('select', 'id,title,doi,publication_date,authorships,primary_location,cited_by_count,abstract_inverted_index,keywords,topics,primary_topic');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenAlex ${response.status} for ${term}`);
    const data = await response.json();
    collected.push(...(data.results || []));
    cursor = data.meta?.next_cursor || null;
  }
  return collected;
}

function normalize(work) {
  const journal = work.primary_location?.source?.display_name || '';
  return {
    id: work.id,
    title: work.title || '未提供标题',
    journal,
    date: work.publication_date || TODAY,
    authors: (work.authorships || []).slice(0, 4).map(item => item.author?.display_name).filter(Boolean).join(', ') || '作者信息待补充',
    abstract: invertAbstract(work.abstract_inverted_index),
    keywords: (work.keywords || []).map(keyword => keyword.display_name).filter(Boolean),
    topics: (work.topics || []).flatMap(topic => [topic.display_name, topic.subfield?.display_name, topic.field?.display_name]).filter(Boolean),
    primaryTopic: work.primary_topic?.display_name || '',
    url: work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : work.primary_location?.landing_page_url || work.id,
    cited: work.cited_by_count || 0
  };
}

function invertAbstract(index) {
  if (!index) return '';
  return Object.entries(index).flatMap(([word, positions]) => positions.map(position => [position, word])).sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(' ');
}

function emailHtml(papers) {
  const rows = papers.map(paper => `<article style="padding:18px 0;border-bottom:1px solid #dbe5e5"><p style="margin:0 0 7px;color:#207078;font-size:12px">${escapeHtml(paper.journal)} · ${escapeHtml(paper.date)} · 引用 ${paper.cited}</p><h2 style="margin:0 0 8px;font-size:18px;line-height:1.45"><a href="${escapeHtml(paper.url)}" style="color:#112b36;text-decoration:none">${escapeHtml(paper.title)}</a></h2><p style="margin:0;color:#61757a;font-size:13px">${escapeHtml(paper.authors)}</p><p style="margin:9px 0 0;color:#38757a;font-size:12px">${topicsFor(paper).join(' · ') || '冰雪与寒区研究'}</p></article>`).join('');
  const profileIntro = profile
    ? `<section style="margin:0 0 22px;padding:14px 16px;background:#edf7f6;border-left:4px solid #207078"><strong>本期偏好：${escapeHtml(profile.name)}</strong><br><span style="color:#61757a;font-size:13px">关注领域：${escapeHtml(profile.fields.join('、'))}；关注期刊：${profile.journals.length} 种${profile.supplement ? `；补充检索：${escapeHtml(profile.supplement)}` : ''}</span></section>`
    : '';
  const body = papers.length ? rows : `<p style="color:#61757a">本检索期内未找到同时匹配${profile ? '该成员关注领域与期刊' : '已关注期刊'}的新文章。</p>`;
  const heading = profile ? `冰川信使 · ${escapeHtml(profile.name)}的文献摘要` : '冰川信使 · 每日文献摘要';
  return `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Arial,'Microsoft YaHei',sans-serif;color:#112b36"><main style="max-width:760px;margin:0 auto;background:#fff;padding:34px 38px"><p style="margin:0;color:#207078;font-size:11px;letter-spacing:1.2px">CRYO · DAILY DIGEST</p><h1 style="margin:10px 0;font-size:28px">${heading}</h1><p style="margin:0 0 24px;color:#61757a">${TODAY} · 检索到 ${papers.length} 篇匹配文章 · 不设篇数上限</p>${profileIntro}${body}<p style="margin:28px 0 0;color:#7a9094;font-size:12px">本邮件由冰川信使自动生成。<a href="https://niangaobingjiang.github.io/coldregion-paper/" style="color:#207078">打开网页</a></p></main></body></html>`;
}

const journals = JSON.parse(await fs.readFile(new URL('../journals.json', import.meta.url), 'utf8'));
const allWorks = (await Promise.all(SEARCH_TERMS.map(fetchAll))).flat();
const unique = new Map();
for (const work of allWorks.map(normalize)) {
  const journalIsWanted = profile ? profileJournalMatches(work.journal) : journalMatches(work.journal, journals);
  if (journalIsWanted && matchesProfile(work)) unique.set(work.id, work);
}
const papers = [...unique.values()].sort((a, b) => b.date.localeCompare(a.date));
const outputPath = process.env.DIGEST_OUTPUT_PATH || 'daily-digest.html';
await fs.writeFile(outputPath, emailHtml(papers), 'utf8');
console.log(JSON.stringify({ fromDate: START_DATE, toDate: TODAY, digestDays: DIGEST_DAYS, profile: profileId || 'default', papers: papers.length, outputPath }));
