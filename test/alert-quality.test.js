'use strict';

const assert = require('node:assert/strict');
const {
  classifyTypes,
  cleanTransactionType,
  formatTime,
  runAlertCycle,
  shouldAlertMlbSocialPost,
  shouldAlertTransaction,
} = require('../lib/alert-engine');
const { getAlertConfig } = require('../lib/alert-config');

// Production disables news fetching; tests keep it on to cover that path.
const getAlertConfigWithNews = (id) => ({ ...getAlertConfig(id), includeNews: true });

const mlb = getAlertConfigWithNews('mlb');
const NOW = new Date('2026-08-04T20:00:00Z').getTime();

function post(text, overrides = {}) {
  return {
    post_id: overrides.post_id || `post-${Math.random()}`,
    text_preview: text,
    source_url: overrides.source_url || 'https://x.com/example/status/1',
    created_at: overrides.created_at || '2026-08-04T19:55:00Z',
    matched_leagues: ['MLB'],
    matched_streams: overrides.matched_streams || ['Breaking MLB'],
    categories: overrides.categories || [],
    author: {
      display_name: overrides.display_name || 'Example Reporter',
      username: overrides.username || 'example',
      followers_count: overrides.followers_count ?? 10000,
    },
    latest_metrics: overrides.latest_metrics || {
      likes: 10,
      reposts: 2,
      replies: 1,
      views: 1000,
    },
  };
}

function transaction(id, description, overrides = {}) {
  return {
    id,
    transactionType: overrides.transactionType,
    effectiveDate: '2026-08-04',
    description,
    player: overrides.player || { fullName: overrides.playerName || 'Example Player' },
    fromTeam: overrides.fromTeam,
    toTeam: overrides.toTeam,
  };
}

function testMeaningAwareClassification() {
  const falseBreaking = post(
    'Breaking down Red Sox at the trade deadline on NBC Sports Boston',
    { matched_streams: ['Breaking MLB', 'Red Sox'] }
  );
  assert.deepEqual(classifyTypes(falseBreaking, mlb), []);

  const standings = post(
    'Red Sox are now two games back of the Yankees, the closest they have been since April 12th',
    { matched_streams: ['Breaking MLB', 'Yankees', 'Red Sox'] }
  );
  assert.deepEqual(classifyTypes(standings, mlb), []);

  const preview = post(
    'BIG Day in the Bronx on Tuesday. Jack Curry previews the action.',
    { matched_streams: ['Breaking MLB', 'Yankees'] }
  );
  assert.deepEqual(classifyTypes(preview, mlb), []);

  const ticketPrice = post(
    'The get-in price is up 32% from before news of the trade breaking.',
    { matched_streams: ['Breaking MLB', 'Dodgers'] }
  );
  assert.deepEqual(classifyTypes(ticketPrice, mlb), []);

  const actualTrade = post(
    'BREAKING: The Boston Red Sox are acquiring Adley Rutschman in a trade.',
    { matched_streams: ['Breaking MLB', 'Red Sox'] }
  );
  assert.deepEqual(classifyTypes(actualTrade, mlb), ['breaking', 'trade']);
  assert.equal(shouldAlertMlbSocialPost(actualTrade, ['breaking', 'trade']).alert, true);

  const categorizedReaction = post(
    'REACTION: MLB Tonight breaks down the reported Red Sox trade.',
    {
      matched_streams: ['Breaking MLB', 'Red Sox'],
      categories: [{ category: 'trade' }],
    }
  );
  const reactionTypes = classifyTypes(categorizedReaction, mlb);
  assert.deepEqual(reactionTypes, ['trade']);
  assert.equal(shouldAlertMlbSocialPost(categorizedReaction, reactionTypes).alert, false);
}

function testFormattingAndTransactionPriority() {
  assert.equal(formatTime('2026-08-04T20:00:00Z'), '04:00 PM EDT');

  const inferredTrade = transaction(
    1,
    'New York Mets traded C Ben Rortvedt to Los Angeles Dodgers.',
    { transactionType: 'undefined' }
  );
  assert.equal(cleanTransactionType(inferredTrade), 'Trade');
  assert.equal(shouldAlertTransaction(inferredTrade, mlb), true);

  const option = transaction(
    2,
    'New York Yankees optioned SS Anthony Volpe to Scranton/Wilkes-Barre.',
    { transactionType: undefined }
  );
  assert.equal(cleanTransactionType(option), 'Optioned');
  assert.equal(shouldAlertTransaction(option, mlb), false);

  const rehab = transaction(
    3,
    'Los Angeles Dodgers sent RHP Tyler Glasnow on a rehab assignment.',
    { transactionType: undefined }
  );
  assert.equal(cleanTransactionType(rehab), 'Rehab Assignment');
  assert.equal(shouldAlertTransaction(rehab, mlb), false);
}

async function testMlbQualityCycle() {
  const sent = [];
  const state = {
    articleIds: new Set(),
    postIds: new Set(),
    transactionIds: new Set(),
  };

  const posts = [
    post('BREAKING: The Boston Red Sox are acquiring Adley Rutschman in a trade.', {
      post_id: 'actual-trade',
      matched_streams: ['Breaking MLB', 'Red Sox'],
    }),
    post('Breaking down Red Sox at the trade deadline on NBC Sports Boston.', {
      post_id: 'breaking-down',
      matched_streams: ['Breaking MLB', 'Red Sox'],
    }),
    post('Red Sox are now two games back of the Yankees, the closest since April 12th.', {
      post_id: 'standings',
      matched_streams: ['Breaking MLB', 'Yankees', 'Red Sox'],
    }),
    post('BIG Day in the Bronx Tuesday. Jack Curry previews the action.', {
      post_id: 'preview',
      matched_streams: ['Breaking MLB', 'Yankees'],
    }),
    post('Ticket prices rose after news of the trade breaking.', {
      post_id: 'ticket-price',
      matched_streams: ['Breaking MLB', 'Dodgers'],
    }),
    post('REACTION: MLB Tonight breaks down the reported Red Sox trade.', {
      post_id: 'reaction',
      matched_streams: ['Breaking MLB', 'Red Sox'],
      categories: [{ category: 'trade' }],
    }),
  ];

  const transactions = [
    transaction(
      100,
      'New York Mets traded C Ben Rortvedt to Los Angeles Dodgers for RHP Chayce McDermott.',
      {
        transactionType: 'undefined',
        playerName: 'Chayce McDermott',
        fromTeam: { name: 'New York Mets' },
        toTeam: { name: 'Los Angeles Dodgers' },
      }
    ),
    transaction(
      101,
      'New York Yankees optioned SS Anthony Volpe to Scranton/Wilkes-Barre RailRiders.',
      { playerName: 'Anthony Volpe', toTeam: { name: 'New York Yankees' } }
    ),
    transaction(
      102,
      'Los Angeles Dodgers sent RHP Tyler Glasnow on a rehab assignment.',
      { playerName: 'Tyler Glasnow', toTeam: { name: 'Los Angeles Dodgers' } }
    ),
    transaction(
      103,
      'New York Mets designated RHP Bryce Conley for assignment.',
      { playerName: 'Bryce Conley', toTeam: { name: 'New York Mets' } }
    ),
  ];

  const deps = {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    baseUrl: () => 'https://heavy-newsroom.vercel.app',
    requestJSON: async (hostname) => {
      if (hostname === 'statsapi.mlb.com') {
        return { status: 200, body: { transactions } };
      }
      return { status: 200, body: { articles: [] } };
    },
    fetchSignalPosts: async () => ({ status: 200, body: { items: posts } }),
    postToGoogleChat: async (_url, text) => {
      sent.push(text);
      return { status: 200, body: '' };
    },
  };

  const first = await runAlertCycle(mlb, deps);
  assert.equal(first.alerts_sent, 3);
  assert.equal(sent.length, 3);
  assert.equal(first.debug.suppressed.social_no_alert_type, 4);
  assert.equal(first.debug.suppressed.social_quality, 1);
  assert.equal(first.debug.suppressed.routine_transactions, 2);

  assert.equal(sent.some((message) => message.includes('Breaking down Red Sox')), false);
  assert.equal(sent.some((message) => message.includes('April 12th')), false);
  assert.equal(sent.some((message) => message.includes('Anthony Volpe')), false);
  assert.equal(sent.some((message) => message.includes('Tyler Glasnow')), false);
  assert.equal(sent.some((message) => message.includes('undefined')), false);
  assert.equal(sent.some((message) => message.includes('04:00 PM EDT')), false);

  const rortvedtMessages = sent.filter((message) => message.includes('Ben Rortvedt'));
  assert.equal(rortvedtMessages.length, 1);
  assert.ok(rortvedtMessages[0].includes('New York Mets'));
  assert.ok(rortvedtMessages[0].includes('Los Angeles Dodgers'));

  const socialMessage = sent.find((message) => message.includes('Adley Rutschman'));
  assert.ok(socialMessage.includes('03:55 PM EDT'));
  assert.equal(socialMessage.includes(' ·    · '), false);

  const second = await runAlertCycle(mlb, deps);
  assert.equal(second.alerts_sent, 0);
}

testMeaningAwareClassification();
testFormattingAndTransactionPriority();
Promise.resolve()
  .then(testMlbQualityCycle)
  .then(() => console.log('alert quality tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
