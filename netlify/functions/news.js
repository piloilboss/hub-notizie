const https = require('https');

// Fonti RSS italiane verificate
const SOURCES = {
  rep_homepage:  'https://www.repubblica.it/rss/homepage/rss2.0.xml',
  rep_politica:  'https://www.repubblica.it/rss/politica/rss2.0.xml',
  rep_esteri:    'https://www.repubblica.it/rss/esteri/rss2.0.xml',
  rep_economia:  'https://www.repubblica.it/rss/economia/rss2.0.xml',
  rep_scienze:   'https://www.repubblica.it/rss/scienze/rss2.0.xml',
  rep_tecnologia:'https://www.repubblica.it/rss/tecnologia/rss2.0.xml',
  rep_salute:    'https://www.repubblica.it/rss/salute/rss2.0.xml',
  rockol_news:   'https://www.rockol.it/rss/news',
  rockol_dischi: 'https://www.rockol.it/rss/dischi',
  gazzetta_home: 'https://www.gazzetta.it/rss/home.xml',
};

// Mappa area+sotto-sezione -> fonte + parole chiave opzionali per filtrare
const CONFIG = {
  world: {
    all:         { src: 'rep_homepage' },
    politics:    { src: 'rep_politica' },
    war:         { src: 'rep_esteri', kw: ['guerra','conflitto','missile','esercito','attacco','bombe','militar','tregua','cessate il fuoco'] },
    economy:     { src: 'rep_economia' },
    science:     { src: 'rep_scienze' },
    tech:        { src: 'rep_tecnologia' },
    environment: { src: 'rep_scienze', kw: ['clima','ambiente','riscaldamento','co2','ghiacc','inquinamento','sostenib'] },
    health:      { src: 'rep_salute' },
  },
  music: {
    all:     { src: 'rockol_news' },
    rnb:     { src: 'rockol_news', kw: ['r&b','rnb','soul'] },
    rap:     { src: 'rockol_news', kw: ['rap','hip hop','hip-hop','trap'] },
    pop:     { src: 'rockol_news', kw: ['pop'] },
    albums:  { src: 'rockol_dischi' },
    singles: { src: 'rockol_news', kw: ['singolo','singoli','brano'] },
    artists: { src: 'rockol_news', kw: ['intervista','vita privata','compleanno','matrimonio','figli','salute'] },
  },
  sport: {
    all:      { src: 'gazzetta_home' },
    tennis:   { src: 'gazzetta_home', kw: ['tennis','atp','wta','sinner','slam','wimbledon','roland garros','australian open'] },
    calcio:   { src: 'gazzetta_home', kw: ['calcio','serie a','champions','gol','juve','milan','inter','napoli','roma','scudetto'] },
    basket:   { src: 'gazzetta_home', kw: ['basket','nba','eurolega'] },
    f1:       { src: 'gazzetta_home', kw: ['formula 1','f1','gp ','pole','verstappen','ferrari','leclerc','hamilton'] },
    ciclismo: { src: 'gazzetta_home', kw: ['ciclismo','giro d','tour de france','tappa','pogacar'] },
    atletica: { src: 'gazzetta_home', kw: ['atletica','maratona','record del mondo'] },
    atleti:   { src: 'gazzetta_home', kw: ['intervista','vita privata','fidanzat','matrimonio','infortunio'] },
  }
};

function fetchUrl(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 4;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HubNotizieBot/1.0; +https://netlify.app)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        return fetchUrl(nextUrl, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(new Error('timeout')); });
  });
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function getTag(block, tag) {
  const m = block.match(new RegExp('<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + tag + '>', 'i'));
  return m ? m[1].trim() : '';
}

function extractImage(block) {
  let m = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  m = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  m = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  m = block.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (m) return m[1];
  return null;
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeEntities(getTag(block, 'title')).replace(/<[^>]+>/g, '').trim();
    let desc = getTag(block, 'description');
    const image = extractImage(block);
    desc = decodeEntities(desc.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const link = getTag(block, 'link').replace(/<[^>]+>/g, '').trim();
    const pubDate = getTag(block, 'pubDate').trim();
    if (title) items.push({ title, description: desc, url: link, image, publishedAt: pubDate });
  }
  return items;
}

function filterByKeywords(items, keywords) {
  const lower = keywords.map(k => k.toLowerCase());
  return items.filter(it => {
    const hay = (it.title + ' ' + it.description).toLowerCase();
    return lower.some(k => hay.includes(k));
  });
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const area = params.area || 'world';
  const sub = params.sub || 'all';

  const areaConfig = CONFIG[area];
  const subConfig = areaConfig ? (areaConfig[sub] || areaConfig.all) : CONFIG.world.all;
  const sourceUrl = SOURCES[subConfig.src];

  try {
    const xml = await fetchUrl(sourceUrl);
    const allItems = parseRSS(xml);

    let result = allItems;
    if (subConfig.kw && subConfig.kw.length) {
      const filtered = filterByKeywords(allItems, subConfig.kw);
      if (filtered.length >= 4) {
        result = filtered;
      } else {
        const filteredUrls = new Set(filtered.map(i => i.url));
        const fill = allItems.filter(i => !filteredUrls.has(i.url));
        result = filtered.concat(fill);
      }
    }

    result = result.slice(0, 14);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'ok', articles: result })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: e.message })
    };
  }
};
