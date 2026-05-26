const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const d = new Date();
  const today = d.toISOString().split('T')[0];
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];

  const data = await new Promise((resolve) => {
    const req2 = https.request({
      hostname: 'statsapi.mlb.com',
      path: `/api/v1/transactions?startDate=${yesterday}&endDate=${today}&sportId=1`,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'HeavyOnMLB/1.0' }
    }, (r) => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
    });
    req2.on('error', () => resolve({}));
    req2.end();
  });

  const posRegex = /\b(?:LHP|RHP|SP|RP|1B|2B|3B|SS|OF|CF|RF|LF|DH|C)\s+([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+)+)/;

  const transactions = (data.transactions || []).map(t => {
    const desc = t.description || '';
    const match = desc.match(posRegex);
    const player = (t.player && t.player.fullName) ? t.player.fullName : (match ? match[1] : (t.fromTeam ? t.fromTeam.name : (t.toTeam ? t.toTeam.name : 'MLB')));
    const type = (t.transactionType || '').toLowerCase();
    const cat = ['il','injur','disability'].some(k=>type.includes(k)) ? 'injury' : 'trade';
    return {
      _type: 'transaction',
      _category: cat,
      id: `txn-${t.id}`,
      player,
      fromTeam: t.fromTeam ? t.fromTeam.name : null,
      toTeam: t.toTeam ? t.toTeam.name : null,
      transactionType: t.transactionType || 'Transaction',
      description: desc,
      date: t.effectiveDate || t.date || today,
    };
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  res.status(200).json({ transactions, count: transactions.length, fetchedAt: new Date().toISOString() });
};
