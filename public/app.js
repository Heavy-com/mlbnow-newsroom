// ── LEAGUE DATA ───────────────────────────────────────────────────────────────
const LEAGUES = {
  mlb: {
    label: 'MLB', emoji: '⚾', color: '#3b82f6', tickerLabel: 'MLB WIRE',
    hasTransactions: true, hasSocial: true,
    queries: [
      'MLB trade roster move baseball',
      'MLB injury baseball player',
      'Yankees Dodgers Mets Red Sox Astros Cubs Braves baseball news',
      'Phillies Padres Mariners Orioles Cardinals Rangers Blue Jays baseball news'
    ],
    divisions: ['AL East','AL Central','AL West','NL East','NL Central','NL West'],
    teams: [
      {id:'orioles',   label:'Baltimore Orioles',    division:'AL East',   color:'#DF4601', keywords:['baltimore orioles','orioles']},
      {id:'redsox',    label:'Boston Red Sox',        division:'AL East',   color:'#BD3039', keywords:['boston red sox','red sox','fenway']},
      {id:'yankees',   label:'New York Yankees',      division:'AL East',   color:'#003087', keywords:['new york yankees','yankees','bronx']},
      {id:'rays',      label:'Tampa Bay Rays',        division:'AL East',   color:'#8FBCE6', keywords:['tampa bay rays','rays baseball']},
      {id:'bluejays',  label:'Toronto Blue Jays',     division:'AL East',   color:'#134A8E', keywords:['toronto blue jays','blue jays']},
      {id:'whitesox',  label:'Chicago White Sox',     division:'AL Central',color:'#C4CED4', keywords:['chicago white sox','white sox']},
      {id:'guardians', label:'Cleveland Guardians',   division:'AL Central',color:'#E31937', keywords:['cleveland guardians','guardians']},
      {id:'tigers',    label:'Detroit Tigers',        division:'AL Central',color:'#FA4616', keywords:['detroit tigers','tigers baseball']},
      {id:'royals',    label:'Kansas City Royals',    division:'AL Central',color:'#004687', keywords:['kansas city royals','royals baseball']},
      {id:'twins',     label:'Minnesota Twins',       division:'AL Central',color:'#002B5C', keywords:['minnesota twins','twins baseball']},
      {id:'astros',    label:'Houston Astros',        division:'AL West',   color:'#EB6E1F', keywords:['houston astros','astros baseball']},
      {id:'angels',    label:'Los Angeles Angels',    division:'AL West',   color:'#BA0021', keywords:['los angeles angels','la angels']},
      {id:'athletics', label:'Athletics',             division:'AL West',   color:'#003831', keywords:['athletics baseball','oakland athletics','las vegas athletics']},
      {id:'mariners',  label:'Seattle Mariners',      division:'AL West',   color:'#0C2C56', keywords:['seattle mariners','mariners baseball']},
      {id:'rangers',   label:'Texas Rangers',         division:'AL West',   color:'#003278', keywords:['texas rangers','rangers baseball']},
      {id:'braves',    label:'Atlanta Braves',        division:'NL East',   color:'#CE1141', keywords:['atlanta braves','braves baseball']},
      {id:'marlins',   label:'Miami Marlins',         division:'NL East',   color:'#00A3E0', keywords:['miami marlins','marlins baseball']},
      {id:'mets',      label:'New York Mets',         division:'NL East',   color:'#002D72', keywords:['new york mets','mets baseball']},
      {id:'phillies',  label:'Philadelphia Phillies', division:'NL East',   color:'#E81828', keywords:['philadelphia phillies','phillies']},
      {id:'nationals', label:'Washington Nationals',  division:'NL East',   color:'#AB0003', keywords:['washington nationals','nationals baseball']},
      {id:'cubs',      label:'Chicago Cubs',          division:'NL Central',color:'#0E3386', keywords:['chicago cubs','cubs baseball','wrigley']},
      {id:'reds',      label:'Cincinnati Reds',       division:'NL Central',color:'#C6011F', keywords:['cincinnati reds','reds baseball']},
      {id:'rockies',   label:'Colorado Rockies',      division:'NL West',color:'#333366', keywords:['colorado rockies','rockies baseball']},
      {id:'brewers',   label:'Milwaukee Brewers',     division:'NL Central',color:'#FFC52F', keywords:['milwaukee brewers','brewers baseball']},
      {id:'cardinals', label:'St. Louis Cardinals',   division:'NL Central',color:'#C41E3A', keywords:['st. louis cardinals','cardinals baseball']},
      {id:'dbacks',    label:'Arizona Diamondbacks',  division:'NL West',   color:'#A71930', keywords:['arizona diamondbacks','d-backs']},
      {id:'dodgers',   label:'Los Angeles Dodgers',   division:'NL West',   color:'#005A9C', keywords:['los angeles dodgers','dodgers','ohtani']},
      {id:'padres',    label:'San Diego Padres',      division:'NL West',   color:'#2F241D', keywords:['san diego padres','padres baseball']},
      {id:'giants',    label:'San Francisco Giants',  division:'NL West',   color:'#FD5A1E', keywords:['san francisco giants','sf giants']},
      {id:'pirates',   label:'Pittsburgh Pirates',    division:'NL Central',color:'#FDB827', keywords:['pittsburgh pirates','pirates baseball']},
    ]
  },
  nfl: {
    label: 'NFL', emoji: '🏈', color: '#d4a017', tickerLabel: 'NFL WIRE',
    hasTransactions: false, hasSocial: true,
    queries: [
      'NFL trade signing free agent roster move',
      'NFL injury quarterback receiver',
      'Cowboys Patriots Eagles Chiefs Bears Giants NFL news',
      'Rams Steelers Ravens 49ers Packers Seahawks NFL news'
    ],
    divisions: ['AFC East','AFC North','AFC South','AFC West','NFC East','NFC North','NFC South','NFC West'],
    teams: [
      {id:'bills',      label:'Buffalo Bills',           division:'AFC East',  color:'#00338D', keywords:['buffalo bills','bills football']},
      {id:'dolphins',   label:'Miami Dolphins',          division:'AFC East',  color:'#008E97', keywords:['miami dolphins','dolphins football']},
      {id:'patriots',   label:'New England Patriots',    division:'AFC East',  color:'#002244', keywords:['new england patriots','patriots football']},
      {id:'jets',       label:'New York Jets',           division:'AFC East',  color:'#125740', keywords:['new york jets','jets football']},
      {id:'ravens',     label:'Baltimore Ravens',        division:'AFC North', color:'#241773', keywords:['baltimore ravens','ravens football']},
      {id:'bengals',    label:'Cincinnati Bengals',      division:'AFC North', color:'#FB4F14', keywords:['cincinnati bengals','bengals football']},
      {id:'browns',     label:'Cleveland Browns',        division:'AFC North', color:'#311D00', keywords:['cleveland browns','browns football']},
      {id:'steelers',   label:'Pittsburgh Steelers',     division:'AFC North', color:'#FFB612', keywords:['pittsburgh steelers','steelers football']},
      {id:'texans',     label:'Houston Texans',          division:'AFC South', color:'#03202F', keywords:['houston texans','texans football']},
      {id:'colts',      label:'Indianapolis Colts',      division:'AFC South', color:'#002C5F', keywords:['indianapolis colts','colts football']},
      {id:'jaguars',    label:'Jacksonville Jaguars',    division:'AFC South', color:'#006778', keywords:['jacksonville jaguars','jaguars football']},
      {id:'titans',     label:'Tennessee Titans',        division:'AFC South', color:'#0C2340', keywords:['tennessee titans','titans football']},
      {id:'broncos',    label:'Denver Broncos',          division:'AFC West',  color:'#FB4F14', keywords:['denver broncos','broncos football']},
      {id:'chiefs',     label:'Kansas City Chiefs',      division:'AFC West',  color:'#E31837', keywords:['kansas city chiefs','chiefs football','mahomes']},
      {id:'raiders',    label:'Las Vegas Raiders',       division:'AFC West',  color:'#A5ACAF', keywords:['las vegas raiders','raiders football']},
      {id:'chargers',   label:'Los Angeles Chargers',    division:'AFC West',  color:'#0080C6', keywords:['los angeles chargers','chargers football']},
      {id:'cowboys',    label:'Dallas Cowboys',          division:'NFC East',  color:'#003594', keywords:['dallas cowboys','cowboys football']},
      {id:'giants_nfl', label:'New York Giants',         division:'NFC East',  color:'#0B2265', keywords:['new york giants','giants football']},
      {id:'eagles',     label:'Philadelphia Eagles',     division:'NFC East',  color:'#004C54', keywords:['philadelphia eagles','eagles football']},
      {id:'commanders', label:'Washington Commanders',   division:'NFC East',  color:'#5A1414', keywords:['washington commanders','commanders football']},
      {id:'bears',      label:'Chicago Bears',           division:'NFC North', color:'#0B162A', keywords:['chicago bears','bears football']},
      {id:'lions',      label:'Detroit Lions',           division:'NFC North', color:'#0076B6', keywords:['detroit lions','lions football']},
      {id:'packers',    label:'Green Bay Packers',       division:'NFC North', color:'#203731', keywords:['green bay packers','packers football']},
      {id:'vikings',    label:'Minnesota Vikings',       division:'NFC North', color:'#4F2683', keywords:['minnesota vikings','vikings football']},
      {id:'falcons',    label:'Atlanta Falcons',         division:'NFC South', color:'#A71930', keywords:['atlanta falcons','falcons football']},
      {id:'panthers',   label:'Carolina Panthers',       division:'NFC South', color:'#0085CA', keywords:['carolina panthers','panthers football']},
      {id:'saints',     label:'New Orleans Saints',      division:'NFC South', color:'#D3BC8D', keywords:['new orleans saints','saints football']},
      {id:'buccaneers', label:'Tampa Bay Buccaneers',    division:'NFC South', color:'#D50A0A', keywords:['tampa bay buccaneers','buccaneers football']},
      {id:'cardinals_nfl',label:'Arizona Cardinals',     division:'NFC West',  color:'#97233F', keywords:['arizona cardinals','cardinals football']},
      {id:'rams',       label:'Los Angeles Rams',        division:'NFC West',  color:'#003594', keywords:['los angeles rams','rams football']},
      {id:'49ers',      label:'San Francisco 49ers',     division:'NFC West',  color:'#AA0000', keywords:['san francisco 49ers','49ers football','niners']},
      {id:'seahawks',   label:'Seattle Seahawks',        division:'NFC West',  color:'#002244', keywords:['seattle seahawks','seahawks football']},
    ]
  },
  nba: {
    label: 'NBA', emoji: '🏀', color: '#e87722', tickerLabel: 'NBA WIRE',
    hasTransactions: false, hasSocial: true,
    queries: [
      'NBA trade signing free agent roster move',
      'NBA injury player out',
      'Lakers Celtics Warriors Knicks Bulls Heat NBA news',
      'Bucks Suns Nuggets Clippers Nets Mavericks NBA news'
    ],
    divisions: ['Atlantic','Central','Southeast','Northwest','Pacific','Southwest'],
    teams: [
      {id:'celtics',    label:'Boston Celtics',          division:'Atlantic',  color:'#007A33', keywords:['boston celtics','celtics basketball']},
      {id:'nets',       label:'Brooklyn Nets',           division:'Atlantic',  color:'#000000', keywords:['brooklyn nets','nets basketball']},
      {id:'knicks',     label:'New York Knicks',         division:'Atlantic',  color:'#006BB6', keywords:['new york knicks','knicks basketball']},
      {id:'sixers',     label:'Philadelphia 76ers',      division:'Atlantic',  color:'#006BB6', keywords:['philadelphia 76ers','sixers basketball']},
      {id:'raptors',    label:'Toronto Raptors',         division:'Atlantic',  color:'#CE1141', keywords:['toronto raptors','raptors basketball']},
      {id:'bulls',      label:'Chicago Bulls',           division:'Central',   color:'#CE1141', keywords:['chicago bulls','bulls basketball']},
      {id:'cavaliers',  label:'Cleveland Cavaliers',     division:'Central',   color:'#860038', keywords:['cleveland cavaliers','cavaliers basketball','cavs']},
      {id:'pistons',    label:'Detroit Pistons',         division:'Central',   color:'#C8102E', keywords:['detroit pistons','pistons basketball']},
      {id:'pacers',     label:'Indiana Pacers',          division:'Central',   color:'#002D62', keywords:['indiana pacers','pacers basketball']},
      {id:'bucks',      label:'Milwaukee Bucks',         division:'Central',   color:'#00471B', keywords:['milwaukee bucks','bucks basketball','giannis']},
      {id:'hawks',      label:'Atlanta Hawks',           division:'Southeast', color:'#C1D32F', keywords:['atlanta hawks','hawks basketball']},
      {id:'hornets',    label:'Charlotte Hornets',       division:'Southeast', color:'#1D1160', keywords:['charlotte hornets','hornets basketball']},
      {id:'heat',       label:'Miami Heat',              division:'Southeast', color:'#98002E', keywords:['miami heat','heat basketball']},
      {id:'magic',      label:'Orlando Magic',           division:'Southeast', color:'#0077C0', keywords:['orlando magic','magic basketball']},
      {id:'wizards',    label:'Washington Wizards',      division:'Southeast', color:'#002B5C', keywords:['washington wizards','wizards basketball']},
      {id:'nuggets',    label:'Denver Nuggets',          division:'Northwest', color:'#0E2240', keywords:['denver nuggets','nuggets basketball','jokic']},
      {id:'timberwolves',label:'Minnesota Timberwolves', division:'Northwest', color:'#0C2340', keywords:['minnesota timberwolves','timberwolves','wolves basketball']},
      {id:'thunder',    label:'Oklahoma City Thunder',   division:'Northwest', color:'#007AC1', keywords:['oklahoma city thunder','thunder basketball','okc']},
      {id:'blazers',    label:'Portland Trail Blazers',  division:'Northwest', color:'#E03A3E', keywords:['portland trail blazers','trail blazers','blazers basketball']},
      {id:'jazz',       label:'Utah Jazz',               division:'Northwest', color:'#002B5C', keywords:['utah jazz','jazz basketball']},
      {id:'warriors',   label:'Golden State Warriors',   division:'Pacific',   color:'#1D428A', keywords:['golden state warriors','warriors basketball','curry']},
      {id:'clippers',   label:'LA Clippers',             division:'Pacific',   color:'#C8102E', keywords:['la clippers','clippers basketball']},
      {id:'lakers',     label:'Los Angeles Lakers',      division:'Pacific',   color:'#552583', keywords:['los angeles lakers','lakers basketball','lebron','luka','luka doncic','luka dončić']},
      {id:'suns',       label:'Phoenix Suns',            division:'Pacific',   color:'#1D1160', keywords:['phoenix suns','suns basketball']},
      {id:'kings',      label:'Sacramento Kings',        division:'Pacific',   color:'#5A2D81', keywords:['sacramento kings','kings basketball']},
      {id:'mavericks',  label:'Dallas Mavericks',        division:'Southwest', color:'#00538C', keywords:['dallas mavericks','mavericks basketball','mavs']},
      {id:'rockets',    label:'Houston Rockets',         division:'Southwest', color:'#CE1141', keywords:['houston rockets','rockets basketball']},
      {id:'grizzlies',  label:'Memphis Grizzlies',       division:'Southwest', color:'#5D76A9', keywords:['memphis grizzlies','grizzlies basketball']},
      {id:'pelicans',   label:'New Orleans Pelicans',    division:'Southwest', color:'#0C2340', keywords:['new orleans pelicans','pelicans basketball']},
      {id:'spurs',      label:'San Antonio Spurs',       division:'Southwest', color:'#C4CED4', keywords:['san antonio spurs','spurs basketball','wembanyama']},
    ]
  },
  nhl: {
    label: 'NHL', emoji: '🏒', color: '#00b4d8', tickerLabel: 'NHL WIRE',
    hasTransactions: false, hasSocial: true,
    queries: [
      'NHL trade signing free agent roster move',
      'NHL injury player out',
      'Rangers Bruins Maple Leafs Canadiens Penguins Capitals NHL news',
      'Oilers Avalanche Lightning Panthers Kings Sharks NHL news'
    ],
    divisions: ['Atlantic','Metropolitan','Central','Pacific'],
    teams: [
      {id:'bruins',     label:'Boston Bruins',           division:'Atlantic',      color:'#FCB514', keywords:['boston bruins','bruins hockey']},
      {id:'sabres',     label:'Buffalo Sabres',          division:'Atlantic',      color:'#003087', keywords:['buffalo sabres','sabres hockey']},
      {id:'redwings',   label:'Detroit Red Wings',       division:'Atlantic',      color:'#CE1126', keywords:['detroit red wings','red wings hockey']},
      {id:'panthers_nhl',label:'Florida Panthers',       division:'Atlantic',      color:'#C8102E', keywords:['florida panthers','panthers hockey']},
      {id:'canadiens',  label:'Montreal Canadiens',      division:'Atlantic',      color:'#AF1E2D', keywords:['montreal canadiens','canadiens hockey','habs']},
      {id:'senators',   label:'Ottawa Senators',         division:'Atlantic',      color:'#C52032', keywords:['ottawa senators','senators hockey']},
      {id:'lightning',  label:'Tampa Bay Lightning',     division:'Atlantic',      color:'#002868', keywords:['tampa bay lightning','lightning hockey']},
      {id:'mapleleafs', label:'Toronto Maple Leafs',     division:'Atlantic',      color:'#003E7E', keywords:['toronto maple leafs','maple leafs hockey']},
      {id:'hurricanes', label:'Carolina Hurricanes',     division:'Metropolitan',  color:'#CC0000', keywords:['carolina hurricanes','hurricanes hockey']},
      {id:'bluejackets',label:'Columbus Blue Jackets',   division:'Metropolitan',  color:'#002654', keywords:['columbus blue jackets','blue jackets hockey']},
      {id:'devils',     label:'New Jersey Devils',       division:'Metropolitan',  color:'#CE1126', keywords:['new jersey devils','devils hockey']},
      {id:'islanders',  label:'New York Islanders',      division:'Metropolitan',  color:'#00539B', keywords:['new york islanders','islanders hockey']},
      {id:'rangers_nhl',label:'New York Rangers',        division:'Metropolitan',  color:'#0038A8', keywords:['new york rangers','rangers hockey']},
      {id:'flyers',     label:'Philadelphia Flyers',     division:'Metropolitan',  color:'#F74902', keywords:['philadelphia flyers','flyers hockey']},
      {id:'penguins',   label:'Pittsburgh Penguins',     division:'Metropolitan',  color:'#FCB514', keywords:['pittsburgh penguins','penguins hockey','crosby']},
      {id:'capitals',   label:'Washington Capitals',     division:'Metropolitan',  color:'#041E42', keywords:['washington capitals','capitals hockey','ovechkin']},
      {id:'mammoth',    label:'Utah Mammoth',            division:'Central',       color:'#69B3E7', keywords:['utah mammoth','mammoth hockey','utah hockey club','utah hc']},
      {id:'blackhawks', label:'Chicago Blackhawks',      division:'Central',       color:'#CF0A2C', keywords:['chicago blackhawks','blackhawks hockey']},
      {id:'avalanche',  label:'Colorado Avalanche',      division:'Central',       color:'#6F263D', keywords:['colorado avalanche','avalanche hockey']},
      {id:'stars',      label:'Dallas Stars',            division:'Central',       color:'#006847', keywords:['dallas stars','stars hockey']},
      {id:'wild',       label:'Minnesota Wild',          division:'Central',       color:'#154734', keywords:['minnesota wild','wild hockey']},
      {id:'predators',  label:'Nashville Predators',     division:'Central',       color:'#FFB81C', keywords:['nashville predators','predators hockey']},
      {id:'blues',      label:'St. Louis Blues',         division:'Central',       color:'#002F87', keywords:['st. louis blues','blues hockey']},
      {id:'jets',       label:'Winnipeg Jets',           division:'Central',       color:'#041E42', keywords:['winnipeg jets','jets hockey']},
      {id:'ducks',      label:'Anaheim Ducks',           division:'Pacific',       color:'#F47A38', keywords:['anaheim ducks','ducks hockey']},
      {id:'flames',     label:'Calgary Flames',          division:'Pacific',       color:'#C8102E', keywords:['calgary flames','flames hockey']},
      {id:'oilers',     label:'Edmonton Oilers',         division:'Pacific',       color:'#041E42', keywords:['edmonton oilers','oilers hockey','mcdavid']},
      {id:'kings_nhl',  label:'Los Angeles Kings',       division:'Pacific',       color:'#111111', keywords:['los angeles kings','kings hockey']},
      {id:'sharks',     label:'San Jose Sharks',         division:'Pacific',       color:'#006D75', keywords:['san jose sharks','sharks hockey']},
      {id:'kraken',     label:'Seattle Kraken',          division:'Pacific',       color:'#001628', keywords:['seattle kraken','kraken hockey']},
      {id:'canucks',    label:'Vancouver Canucks',       division:'Pacific',       color:'#00205B', keywords:['vancouver canucks','canucks hockey']},
      {id:'goldenknights',label:'Vegas Golden Knights',  division:'Pacific',       color:'#B4975A', keywords:['vegas golden knights','golden knights hockey']},
    ]
  }
};

const TRADE_KW    = ['trade','traded','roster move','dfa','waiver','signed','free agent','contract','extension','released','claimed','optioned','recalled','acquired','deal'];
const INJURY_KW   = ['injury','injured',' il ','injured list','disabled list','surgery','torn','strain','sprain','concussion','day-to-day','out indefinitely','placed on il'];
const BREAKING_KW = ['breaking','exclusive','just in','confirmed','fired','resigns','retires','suspended','announces'];

let activeLeague = 'mlb';
let newsArticles = [];
let socialPosts = [];
let transactions = [];
let activeCategory = 'all';
let activeSourceTab = 'all';
let fetchRequestId = 0;

// Cache per league
const leagueCache = { mlb:{}, nfl:{}, nba:{}, nhl:{} };

const categoryText = a => (a.categories||[]).map(c=>typeof c==='string'?c:(c.category||'')).join(' ');
const txt = a => ((a.title||a.text||a.text_preview||'')+' '+(a.description||a.author?.display_name||'')+' '+categoryText(a)).toLowerCase();
const isTrade = a => TRADE_KW.some(k=>txt(a).includes(k));
const isInjury = a => INJURY_KW.some(k=>txt(a).includes(k));
const isBreaking = a => BREAKING_KW.some(k=>txt(a).includes(k)) || (a.matched_streams||[]).some(s=>String(s).toLowerCase().includes('breaking')) || categoryText(a).toLowerCase().includes('breaking');
const timeAgo = d => { const s=(Date.now()-new Date(d))/1000; if(s<60)return`${~~s}s ago`; if(s<3600)return`${~~(s/60)}m ago`; if(s<86400)return`${~~(s/3600)}h ago`; return`${~~(s/86400)}d ago`; };
const fmtDateTime = d => {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const date = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const time = dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  return `${date} · ${time}`;
};
const srcColor = n => { const c=['#3b7dd8','#2d9c5f','#d4860f','#9b59b6','#e8412a','#16a085']; let h=0; for(const x of(n||''))h=(h*31+x.charCodeAt(0))%c.length; return c[h]; };
const initials = s => (s||'?').split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeExternalUrl = value => /^https?:\/\//i.test(String(value||'')) ? String(value) : '';
function openExternal(button) {
  const url = safeExternalUrl(button?.dataset?.url);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function getLeague() { return LEAGUES[activeLeague]; }
function getTeams() { return getLeague().teams; }

function matchTeams(a) {
  const t = txt(a);
  const streams = [...(a.matched_streams||[]), ...(a.matched_leagues||[])].map(s=>s.toLowerCase());
  // For league-level streams (NFL/NBA/NHL/MLB), match all posts to teams via keywords
  return getTeams().filter(tm =>
    tm.keywords.some(k=>t.includes(k)) ||
    (tm.streams||[]).some(s=>streams.includes(s.toLowerCase()))
  ).map(tm=>tm.id);
}

function matchTeamsTransaction(t) {
  const from = (t.fromTeam||'').toLowerCase();
  const to = (t.toTeam||'').toLowerCase();
  const desc = (t.description||'').toLowerCase();
  return getTeams().filter(tm=>
    tm.keywords.some(k=>from.includes(k)||to.includes(k)||desc.includes(k))
  ).map(tm=>tm.id);
}

async function setLeague(league, el) {
  activeLeague = league;
  activeCategory = 'all';
  activeSourceTab = 'all';
  document.querySelectorAll('.league-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('tickerLabel').textContent = getLeague().tickerLabel;

  // Update source tabs visibility
  const txTab = document.getElementById('tab-transactions');
  const socialTab = document.getElementById('tab-social');
  txTab.style.display = getLeague().hasTransactions ? '' : 'none';
  socialTab.style.display = getLeague().hasSocial ? '' : 'none';

  // Reset active source tab if hidden
  if (!getLeague().hasTransactions && activeSourceTab === 'transactions') activeSourceTab = 'all';
  if (!getLeague().hasSocial && activeSourceTab === 'social') activeSourceTab = 'all';
  document.querySelectorAll('.source-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-all').classList.add('active');

  await fetchAll();
}

async function fetchAll() {
  const requestId = ++fetchRequestId;
  const requestedLeague = activeLeague;
  const league = LEAGUES[requestedLeague];
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  document.getElementById('cardsGrid').innerHTML = '<div class="state-box"><div class="spinner"></div><span>Connecting to sources…</span></div>';

  const cached = leagueCache[requestedLeague];
  const CACHE_MS = 4 * 60 * 1000; // use cache if fresher than 4 min
  let newsResults, txResult, nocapResult;

  if (cached && cached.ts && (Date.now() - cached.ts) < CACHE_MS) {
    newsResults = cached.newsResults;
    txResult = cached.txResult;
    nocapResult = cached.nocapResult;
  } else {
    const fetches = [
      Promise.allSettled(
        league.queries.map(q =>
          fetch(`/api/news?q=${encodeURIComponent(q)}&pageSize=20`).then(r => r.json())
        )
      )
    ];

    if (league.hasTransactions) {
      fetches.push(
        fetch(TX_ENDPOINTS[requestedLeague]).then(r => r.json()).catch(() => null)
      );
    }
    if (league.hasSocial) {
      fetches.push(fetch('/api/nocap').then(r => r.json()).catch(() => null));
    }

    const results = await Promise.allSettled(fetches);

    if (requestId !== fetchRequestId || requestedLeague !== activeLeague) return;

    newsResults = results[0];
    txResult = league.hasTransactions ? results[1] : null;
    nocapResult = league.hasSocial
      ? results[league.hasTransactions ? 2 : 1]
      : null;

    leagueCache[requestedLeague] = {
      newsResults,
      txResult,
      nocapResult,
      ts: Date.now()
    };
  }

  if (requestId !== fetchRequestId || requestedLeague !== activeLeague) return;

  const seen = new Set();
  newsArticles = [];

  if (newsResults.status === 'fulfilled') {
    for (const result of newsResults.value) {
      if (result.status !== 'fulfilled' || !result.value.articles) continue;

      for (const article of result.value.articles) {
        if (seen.has(article.url) || !article.title || article.title === '[Removed]') continue;

        seen.add(article.url);
        article._type = 'news';
        article._teams = matchTeams(article);
        article._trade = isTrade(article);
        article._injury = isInjury(article);
        article._breaking = isBreaking(article);
        article._sortDate = new Date(article.publishedAt);
        newsArticles.push(article);
      }
    }
  }

  socialPosts = [];
  if (nocapResult?.status === 'fulfilled' && nocapResult.value?.items) {
    for (const post of nocapResult.value.items) {
      const leagues = [
        ...(post.matched_leagues || []),
        ...(post.matched_streams || [])
      ].map(value => String(value).toUpperCase());

      const teamMatches = matchTeams(post);
      if (!leagues.includes(requestedLeague.toUpperCase()) && !teamMatches.length) continue;

      post._type = 'social';
      post._teams = teamMatches;
      post._trade = isTrade(post);
      post._injury = isInjury(post);
      post._breaking = isBreaking(post);
      post._sortDate = new Date(post.created_at);
      socialPosts.push(post);
    }
  }

  transactions = [];
  if (txResult?.status === 'fulfilled' && txResult.value?.transactions) {
    for (const transaction of txResult.value.transactions) {
      transaction._type = 'transaction';
      transaction._teams = matchTeamsTransaction(transaction);
      transaction._sortDate = new Date(transaction.date);
      transaction._trade = transaction._category === 'trade';
      transaction._injury = transaction._category === 'injury';
      transaction._breaking = false;
      transactions.push(transaction);
    }
  }

  updateStats();
  updateTicker();
  updateTabCounts();
  renderSidebar();
  renderCards();

  btn.classList.remove('spinning');
  document.getElementById('stat-updated').textContent =
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function allItems() {
  if (activeSourceTab==='news') return newsArticles;
  if (activeSourceTab==='social') return socialPosts;
  if (activeSourceTab==='transactions') return transactions;
  return [...newsArticles,...socialPosts,...transactions].sort((a,b)=>b._sortDate-a._sortDate);
}

function updateStats() {
  const all = [...newsArticles,...socialPosts,...transactions];
  document.getElementById('stat-total').textContent = all.length;
  document.getElementById('stat-breaking').textContent = all.filter(a=>a._breaking).length;
  document.getElementById('stat-trades').textContent = all.filter(a=>a._trade).length;
  document.getElementById('stat-injuries').textContent = all.filter(a=>a._injury).length;
  document.getElementById('count-all').textContent = all.length;
  document.getElementById('count-breaking').textContent = all.filter(a=>a._breaking).length;
  document.getElementById('count-trades').textContent = all.filter(a=>a._trade).length;
  document.getElementById('count-injuries').textContent = all.filter(a=>a._injury).length;
}

function updateTabCounts() {
  document.getElementById('tab-count-all').textContent = newsArticles.length+socialPosts.length+transactions.length;
  document.getElementById('tab-count-news').textContent = newsArticles.length;
  document.getElementById('tab-count-transactions').textContent = transactions.length;
  document.getElementById('tab-count-social').textContent = socialPosts.length;
}

function updateTicker() {
  const all = [...newsArticles,...socialPosts].sort((a,b)=>b._sortDate-a._sortDate);
  const priority = all.filter(a=>a._breaking||a._trade).slice(0,10);
  const src = priority.length ? priority : all.slice(0,8);
  const html = src.map(a=>`<span class="ticker-item">${escapeHTML(a.title||a.text_preview)}<span class="ticker-sep"> · </span></span>`).join('');
  document.getElementById('tickerTrack').innerHTML = html+html;
}

function renderSidebar() {
  const search = (document.getElementById('catSearch')?.value||'').toLowerCase();
  const all = allItems();
  const counts = {};
  for (const a of all) for (const tid of (a._teams||[])) counts[tid]=(counts[tid]||0)+1;
  const league = getLeague();
  let html = '';
  for (const div of league.divisions) {
    const teams = league.teams.filter(t=>t.division===div&&(!search||t.label.toLowerCase().includes(search)));
    if (!teams.length) continue;
    html += `<div class="cat-group-label">${div}</div>`;
    for (const t of teams) {
      const ac = activeCategory===t.id?'active':'';
      html += `<button class="filter-btn ${ac}" onclick="setCategory('${t.id}',this)"><span><span class="team-dot" style="background:${t.color}"></span>${t.label}</span><span class="filter-count">${counts[t.id]||'—'}</span></button>`;
    }
  }
  document.getElementById('sidebarCats').innerHTML = html;
}

function setCategory(cat, el) {
  activeCategory = cat;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderCards();
}

function setSourceTab(tab, el) {
  activeSourceTab = tab;
  document.querySelectorAll('.source-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderSidebar(); renderCards();
}

function renderCards() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const sort = document.getElementById('sortSelect').value;
  let items = allItems();
  if (activeCategory==='breaking') items=items.filter(a=>a._breaking);
  else if (activeCategory==='trades') items=items.filter(a=>a._trade);
  else if (activeCategory==='injuries') items=items.filter(a=>a._injury);
  else if (activeCategory!=='all') items=items.filter(a=>(a._teams||[]).includes(activeCategory));
  if (search) items=items.filter(a=>((a.title||a.text_preview||'')+' '+(a.description||'')).toLowerCase().includes(search));
  if (sort==='oldest') items=[...items].reverse();
  document.getElementById('resultCount').textContent=`${items.length} stories`;
  if (!items.length) {
    document.getElementById('cardsGrid').innerHTML='<div class="state-box"><span>No stories match this filter yet.</span></div>';
    return;
  }
  document.getElementById('cardsGrid').innerHTML = items.map((a,i)=>{
    const delay = Math.min(i*20,400);
    if (a._type==='transaction') return renderTransactionCard(a,delay);
    if (a._type==='social') return renderSocialCard(a,delay);
    return renderNewsCard(a,delay);
  }).join('');
}

function renderNewsCard(a, delay) {
  const sourceName = a.source?.name || 'Unknown';
  const sc = srcColor(sourceName);
  const sn = escapeHTML(sourceName.toUpperCase().slice(0,14));
  const type = a._breaking?'breaking':a._trade?'trade':a._injury?'injury':'';
  const teams = getTeams();
  const teamTags = teams.filter(t=>(a._teams||[]).includes(t.id)).slice(0,2).map(t=>`<span class="team-tag" style="border-left:2px solid ${t.color}">${escapeHTML(t.label.split(' ').slice(-1)[0])}</span>`).join('');
  const imageUrl = safeExternalUrl(a.urlToImage);
  const articleUrl = safeExternalUrl(a.url);
  const title = escapeHTML(a.title || 'Untitled');
  const description = escapeHTML((a.description || '').slice(0,130));
  const author = escapeHTML(a.author ? a.author.split(',')[0].slice(0,28) : 'Staff');
  return `<div class="card ${type}" style="animation-delay:${delay}ms">
    ${imageUrl?`<img class="card-img" src="${escapeHTML(imageUrl)}" alt="" onerror="this.parentNode.removeChild(this)">` :''}
    <div class="card-body">
      <div class="card-meta">
        <span class="source-tag" style="background:${sc}22;color:${sc};border:1px solid ${sc}44">${sn}</span>
        ${type==='breaking'?'<span class="type-tag type-breaking">BREAKING</span>':''}
        ${type==='trade'?'<span class="type-tag type-trade">TRADE</span>':''}
        ${type==='injury'?'<span class="type-tag type-injury">INJURY</span>':''}
        ${teamTags}
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);margin-bottom:4px">${timeAgo(a.publishedAt)} &nbsp;·&nbsp; ${fmtDateTime(a.publishedAt)}</div>
      <div class="card-title">${title}</div>
      ${description?`<div class="card-excerpt">${description}${(a.description||'').length>130?'…':''}</div>`:''}
    </div>
    <div class="card-footer">
      <span class="card-author">${author}</span>
      <div style="display:flex;gap:6px">
        <button class="btn-read" data-url="${escapeHTML(articleUrl)}" onclick="openExternal(this)" ${articleUrl?'':'disabled'}>Read →</button>
      </div>
    </div>
  </div>`;
}

function renderSocialCard(p, delay) {
  const type = p._breaking?'breaking':p._trade?'trade':p._injury?'injury':'';
  const sourceName = (p.source||'social').toUpperCase();
  const sourceLabel = p.source==='x' ? '𝕏 POST' : `${sourceName} POST`;
  const teams = getTeams();
  const teamTags = teams.filter(t=>(p._teams||[]).includes(t.id)).slice(0,2).map(t=>`<span class="team-tag" style="border-left:2px solid ${t.color}">${escapeHTML(t.label.split(' ').slice(-1)[0])}</span>`).join('');
  const streams = (p.matched_streams||[]).filter(s=>!['MLB','Breaking MLB'].includes(s)).slice(0,3);
  const followers = p.author?.followers_count ? `${(p.author.followers_count/1000).toFixed(0)}K followers` : '';
  const m = p.latest_metrics||{};
  const displayName = escapeHTML(p.author?.display_name||p.author?.username||'Unknown');
  const username = escapeHTML(p.author?.username||'unknown');
  const postText = escapeHTML((p.text_preview||'').replace(/https?:\/\/\S+/g,'').trim());
  const postUrl = safeExternalUrl(p.source_url);
  return `<div class="card social ${type}" style="animation-delay:${delay}ms">
    <div class="social-header">
      <div class="social-avatar">${escapeHTML(initials(p.author?.display_name||p.author?.username||'?'))}</div>
      <div><div class="social-name">${displayName}</div><div class="social-handle">@${username} · ${escapeHTML(followers)}</div></div>
      <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="type-tag type-social">${escapeHTML(sourceLabel)}</span>
        <span class="card-time" title="${fmtDateTime(p.created_at)}">${timeAgo(p.created_at)} · ${fmtDateTime(p.created_at)}</span>
      </div>
    </div>
    <div class="social-body">
      <div class="card-meta" style="margin-bottom:8px">
        ${type==='breaking'?'<span class="type-tag type-breaking">BREAKING</span>':''}
        ${type==='trade'?'<span class="type-tag type-trade">TRADE</span>':''}
        ${teamTags}
      </div>
      <div class="social-text">${postText}</div>
    </div>
    <div class="social-metrics">
      <div class="metric">❤️ <span>${Number(m.likes)||0}</span></div>
      <div class="metric">🔁 <span>${Number(m.reposts)||0}</span></div>
      <div class="metric">💬 <span>${Number(m.replies)||0}</span></div>
      <div class="metric">👁 <span>${Number(m.views)||0}</span></div>
    </div>
    <div class="social-footer">
      <div class="stream-tags">${streams.map(s=>`<span class="stream-tag">${escapeHTML(s)}</span>`).join('')}</div>
      <div style="display:flex;gap:6px">
        <button class="btn-read" data-url="${escapeHTML(postUrl)}" onclick="openExternal(this)" ${postUrl?'':'disabled'}>View post →</button>
      </div>
    </div>
  </div>`;
}

function renderTransactionCard(t, delay) {
  const typeEmoji = t._category==='trade'?'🔄':t._category==='injury'?'🏥':'📋';
  const teams = getTeams();
  const teamTags = teams.filter(tm=>(t._teams||[]).includes(tm.id)).slice(0,2).map(tm=>`<span class="team-tag" style="border-left:2px solid ${tm.color}">${escapeHTML(tm.label.split(' ').slice(-1)[0])}</span>`).join('');
  const fromTeam = escapeHTML(t.fromTeam||'');
  const toTeam = escapeHTML(t.toTeam||'');
  const fromTo = t.fromTeam&&t.toTeam?`<span>${fromTeam}</span><span class="tx-arrow">→</span><span>${toTeam}</span>`:t.fromTeam?`<span>${fromTeam}</span>`:t.toTeam?`<span>${toTeam}</span>`:'';
  const dateObj = new Date(t.date);
  const date = dateObj.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + (String(t.date).includes('T') ? ' · ' + dateObj.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '');
  const leagueLabel = activeLeague.toUpperCase();
  return `<div class="card transaction" style="animation-delay:${delay}ms">
    <div class="tx-body">
      <div class="card-meta">
        <span class="type-tag type-trade">${typeEmoji} ${escapeHTML(t.transactionType||'Transaction')}</span>
        ${teamTags}
        <span class="card-time">${escapeHTML(date)}</span>
      </div>
      <div class="tx-player">${escapeHTML(t.player||'Unknown')}</div>
      <div class="tx-desc">${escapeHTML(t.description||'')}</div>
      ${fromTo?`<div class="tx-teams">${fromTo}</div>`:''}
    </div>
    <div class="card-footer">
      <span style="color:#a78bfa;font-size:10px;font-family:'DM Mono',monospace">${leagueLabel} OFFICIAL</span>
    </div>
  </div>`;
}

function updateClock(){document.getElementById('clock').textContent=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
setInterval(updateClock,1000); updateClock();
// Refresh only the league currently being viewed.
const TX_ENDPOINTS = { mlb:'/api/transactions', nhl:'/api/nhl-transactions', nba:'/api/nba-transactions', nfl:'/api/nfl-transactions' };
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function refreshActiveLeague() {
  // Do not make feed requests while the browser tab is hidden.
  if (document.hidden) return;
  fetchAll();
}

setInterval(refreshActiveLeague, AUTO_REFRESH_MS);

// When returning to the tab, refresh only if the active league data is stale.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;

  const cached = leagueCache[activeLeague];
  const isStale = !cached?.ts || (Date.now() - cached.ts) >= AUTO_REFRESH_MS;

  if (isStale) fetchAll();
});

window.addEventListener('load', fetchAll);
