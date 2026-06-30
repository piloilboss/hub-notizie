const https = require('https');

// ---- Fonti RSS (con fallback multipli per categoria) ----
// Ogni voce è una lista: si prova la prima, se fallisce o è vuota si passa alla successiva,
// e i risultati di più feed validi vengono uniti per le sezioni "all".
const FEEDS = {
  // MONDO - ANSA include immagini (enclosure); Repubblica come integrazione
  world_all:    ['https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml', 'https://www.repubblica.it/rss/homepage/rss2.0.xml'],
  world_politics:['https://www.ansa.it/sito/notizie/politica/politica_rss.xml', 'https://www.repubblica.it/rss/politica/rss2.0.xml'],
  world_esteri: ['https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml', 'https://www.repubblica.it/rss/esteri/rss2.0.xml'],
  world_economy:['https://www.ansa.it/sito/notizie/economia/economia_rss.xml', 'https://www.repubblica.it/rss/economia/rss2.0.xml'],
  world_scienza:['https://www.ansa.it/canale_scienza_tecnica/notizie/scienza_tecnica_rss.xml', 'https://www.repubblica.it/rss/scienze/rss2.0.xml'],
  world_tech:   ['https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml', 'https://www.repubblica.it/rss/tecnologia/rss2.0.xml'],
  world_ambiente:['https://www.ansa.it/canale_ambiente/notizie/ambiente_rss.xml'],
  world_salute: ['https://www.ansa.it/canale_saluteebenessere/notizie/salute_rss.xml', 'https://www.repubblica.it/rss/salute/rss2.0.xml'],

  // MUSICA - Rolling Stone Italia (WordPress, immagini in media:content)
  music_all:    ['https://www.rollingstone.it/feed/'],
  music_section:['https://www.rollingstone.it/musica/feed/'],

  // SPORT - Sky Sport per disciplina (immagini incluse), ANSA come fallback
  sport_all:    ['https://www.ansa.it/sito/notizie/sport/sport_rss.xml'],
  sport_calcio: ['https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml'],
  sport_tennis: ['https://www.ansa.it/sito/notizie/sport/tennis/tennis_rss.xml', 'https://www.ansa.it/sito/notizie/sport/sport_rss.xml'],
};

// Mappa area+sub -> chiave feed + parole chiave per filtrare quando serve
const CONFIG = {
  world: {
    all:         { feed: 'world_all' },
    politics:    { feed: 'world_politics' },
    war:         { feed: 'world_esteri', kw: ['guerra','conflitto','missile','esercito','attacco','raid','bombe','militar','tregua','cessate il fuoco','ucraina','gaza','israele','iran'] },
    economy:     { feed: 'world_economy' },
    science:     { feed: 'world_scienza' },
    tech:        { feed: 'world_tech' },
    environment: { feed: 'world_ambiente' },
    health:      { feed: 'world_salute' },
  },
  music: {
    all:     { feed: 'music_all' },
    rnb:     { feed: 'music_all', kw: ['r&b','rnb','soul'] },
    rap:     { feed: 'music_all', kw: ['rap','hip hop','hip-hop','trap','freestyle'] },
    pop:     { feed: 'music_all', kw: ['pop'] },
    albums:  { feed: 'music_all', kw: ['album','disco','ep ','uscito','esce'] },
    singles: { feed: 'music_all', kw: ['singolo','singoli','brano','canzone'] },
    artists: { feed: 'music_all', kw: ['intervista','vita privata','compleanno','matrimonio','social','polemica'] },
  },
  sport: {
    all:      { feed: 'sport_all' },
    tennis:   { feed: 'sport_tennis', kw: ['tennis','atp','wta','sinner','alcaraz','djokovic','wimbledon','roland garros','slam','musetti'] },
    calcio:   { feed: 'sport_calcio' },
    basket:   { feed: 'sport_all', kw: ['basket','nba','eurolega','olimpia','virtus'] },
    f1:       { feed: 'sport_all', kw: ['formula 1','f1','gran premio','leclerc','ferrari','verstappen','hamilton','gp '] },
    ciclismo: { feed: 'sport_all', kw: ['ciclismo','giro d','tour de france','tappa','pogacar','bici'] },
    atletica: { feed: 'sport_all', kw: ['atletica','100 metri','maratona','salto','record'] },
    atleti:   { feed: 'sport_all', kw: ['intervista','vita privata','fidanzat','matrimonio','social','figli'] },
  }
};

function fetchUrl(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 4;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'it-IT,it;q=0.9'
      }
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
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
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
  });
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'")
    .replace(/&nbsp;/g,' ').replace(/&#8217;/g,"'").replace(/&#8220;/g,'"')
    .replace(/&#8221;/g,'"').replace(/&#8230;/g,'…').replace(/&#039;/g,"'");
}

function getTag(block, tag) {
  const m = block.match(new RegExp('<'+tag+'[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/'+tag+'>','i'));
  return m ? m[1].trim() : '';
}

function extractImage(block) {
  let m = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  m = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  m = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  // immagine dentro content:encoded o description
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
    const title = decodeEntities(getTag(block,'title')).replace(/<[^>]+>/g,'').trim();
    let desc = getTag(block,'description');
    const image = extractImage(block);
    desc = decodeEntities(desc.replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();
    const link = getTag(block,'link').replace(/<[^>]+>/g,'').trim();
    const pubDate = getTag(block,'pubDate').trim();
    if (title && link) items.push({ title, description: desc, url: link, image, publishedAt: pubDate });
  }
  return items;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });
}

function filterByKeywords(items, keywords) {
  const lower = keywords.map(k => k.toLowerCase());
  return items.filter(it => {
    const hay = (it.title + ' ' + it.description).toLowerCase();
    return lower.some(k => hay.includes(k));
  });
}

// Recupera da una lista di url: unisce i risultati validi, ignora i feed che falliscono
async function fetchFeeds(urls, mergeAll) {
  let collected = [];
  for (const url of urls) {
    try {
      const xml = await fetchUrl(url);
      const parsed = parseRSS(xml);
      if (parsed.length) {
        collected = collected.concat(parsed);
        if (!mergeAll) break; // basta il primo feed valido
      }
    } catch (e) {
      // passa al prossimo feed
    }
  }
  return dedupe(collected);
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const area = params.area || 'world';
  const sub = params.sub || 'all';

  const areaConfig = CONFIG[area] || CONFIG.world;
  const subConfig = areaConfig[sub] || areaConfig.all;
  const urls = FEEDS[subConfig.feed] || FEEDS.world_all;

  // Per le sezioni generali ("all") uniamo più fonti; per le filtrate basta la prima valida
  const mergeAll = (sub === 'all');

  try {
    let items = await fetchFeeds(urls, mergeAll);

    if (subConfig.kw && subConfig.kw.length) {
      const filtered = filterByKeywords(items, subConfig.kw);
      if (filtered.length >= 4) {
        items = filtered;
      } else {
        const urlsSet = new Set(filtered.map(i => i.url));
        items = filtered.concat(items.filter(i => !urlsSet.has(i.url)));
      }
    }

    items = items.slice(0, 16);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify({ status: 'ok', count: items.length, articles: items })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: e.message })
    };
  }
};
