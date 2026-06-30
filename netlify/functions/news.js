const https = require('https');

const FEEDS = {
  world_all: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'
  ],
  world_politics: ['https://feeds.bbci.co.uk/news/politics/rss.xml'],
  world_war: ['https://feeds.bbci.co.uk/news/world/rss.xml'],
  world_economy: ['https://feeds.bbci.co.uk/news/business/rss.xml'],
  world_science: ['https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'],
  world_tech: ['https://feeds.bbci.co.uk/news/technology/rss.xml'],
  world_environment: ['https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'],
  world_health: ['https://feeds.bbci.co.uk/news/health/rss.xml'],
  music_all: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  music_rnb: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  music_rap: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  music_pop: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  music_albums: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  music_singles: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  music_artists: ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  sport_all: ['https://feeds.bbci.co.uk/sport/rss.xml'],
  sport_tennis: ['https://feeds.bbci.co.uk/sport/tennis/rss.xml'],
  sport_calcio: ['https://feeds.bbci.co.uk/sport/football/rss.xml'],
  sport_basket: ['https://feeds.bbci.co.uk/sport/basketball/rss.xml'],
  sport_f1: ['https://feeds.bbci.co.uk/sport/formula1/rss.xml'],
  sport_ciclismo: ['https://feeds.bbci.co.uk/sport/cycling/rss.xml'],
  sport_atletica: ['https://feeds.bbci.co.uk/sport/athletics/rss.xml'],
  sport_atleti: ['https://feeds.bbci.co.uk/sport/rss.xml'],
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HubNotizie/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<\\!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const title = get('title');
    const desc = get('description').replace(/<[^>]+>/g, '').slice(0, 250);
    const link = get('link');
    const pubDate = get('pubDate');
    if (title) items.push({ title, description: desc, url: link, publishedAt: pubDate, source: { name: 'BBC News' } });
  }
  return items;
}

exports.handler = async function(event) {
  const { area, sub } = event.queryStringParameters || {};
  const key = `${area}_${sub}` || 'world_all';
  const urls = FEEDS[key] || FEEDS['world_all'];

  try {
    const xml = await fetchUrl(urls[0]);
    const items = parseRSS(xml).slice(0, 12);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'ok', articles: items })
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'error', message: e.message })
    };
  }
};
