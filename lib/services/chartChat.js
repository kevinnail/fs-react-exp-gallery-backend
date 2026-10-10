const ChartSeries = require('../models/ChartSeries.js');
const { classifyTrend, NOT_ENOUGH_DATA, BASELINE_PERIOD_COUNT } = require('./trendVerdict.js');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
// Cheapest current OpenAI model; the data is small enough that it does not need more.
const DEFAULT_MODEL = 'gpt-6-luna';
// Stops a model that keeps calling tools from looping forever on one message.
const MAX_TOOL_ROUNDS = 5;

const REVENUE_MINIMUM_BASELINE = 100;
const COUNT_MINIMUM_BASELINE = 2;

// Mirrors the metrics and trend options in the frontend's ChartsPage, so the
// verdicts the model sees match the cards. `summable` marks metrics where a
// total across periods means something; rates, medians, per-period distinct
// counts and end-of-period snapshots do not add up.
const METRICS = [
  {
    key: 'totalRevenue',
    meaning: 'gallery plus auction revenue',
    unit: 'money',
    summable: true,
    trendOptions: { minimumBaseline: REVENUE_MINIMUM_BASELINE },
  },
  {
    key: 'galleryRevenue',
    meaning: 'revenue from gallery sales',
    unit: 'money',
    summable: true,
    trendOptions: { minimumBaseline: REVENUE_MINIMUM_BASELINE },
  },
  {
    key: 'auctionRevenue',
    meaning: 'revenue from auctions',
    unit: 'money',
    summable: true,
    trendOptions: { minimumBaseline: REVENUE_MINIMUM_BASELINE },
  },
  {
    key: 'orderCount',
    meaning: 'orders placed',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'itemsSold',
    meaning: 'items sold across all orders',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'averageOrderValue',
    meaning: 'total revenue divided by orders; empty when there were no orders',
    unit: 'money',
    summable: false,
    trendOptions: {},
  },
  {
    key: 'signups',
    meaning: 'new customer accounts',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'firstTimeBuyers',
    meaning: 'customers whose first ever order fell in this period',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'returningBuyerOrders',
    meaning: 'orders from customers who had ordered before',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'conversionRate',
    meaning: 'share of all accounts created so far that have ever bought, as of period end',
    unit: 'percent',
    summable: false,
    trendOptions: {},
  },
  {
    key: 'piecesPosted',
    meaning: 'gallery pieces posted',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'piecesSold',
    meaning: 'gallery pieces sold',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'medianDaysToSell',
    meaning: 'median days from posting a gallery piece to selling it; lower is better',
    unit: 'days',
    summable: false,
    trendOptions: { higherIsBetter: false },
  },
  {
    key: 'auctionsClosed',
    meaning: 'auctions that ended',
    unit: 'count',
    summable: true,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'auctionSellThrough',
    meaning: 'share of closed auctions that got a winner',
    unit: 'percent',
    summable: false,
    trendOptions: {},
  },
  {
    key: 'buyNowShare',
    meaning: 'share of won auctions that ended by buy-now',
    unit: 'percent',
    summable: false,
    trendOptions: {},
  },
  {
    key: 'finalOverStart',
    meaning: 'final auction price divided by start price',
    unit: 'multiple',
    summable: false,
    trendOptions: {},
  },
  {
    key: 'bidsPerAuction',
    meaning: 'average bids per closed auction',
    unit: 'decimal',
    summable: false,
    trendOptions: {},
  },
  {
    key: 'uniqueBidders',
    meaning: 'distinct customers who bid in the period',
    unit: 'count',
    summable: false,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'outstandingBalance',
    meaning: 'unpaid gallery plus auction balance at period end; lower is better',
    unit: 'money',
    summable: false,
    trendOptions: { higherIsBetter: false },
  },
  {
    key: 'outstandingGallery',
    meaning: 'unpaid gallery balance at period end; lower is better',
    unit: 'money',
    summable: false,
    trendOptions: { higherIsBetter: false },
  },
  {
    key: 'outstandingAuction',
    meaning: 'unpaid auction balance at period end; lower is better',
    unit: 'money',
    summable: false,
    trendOptions: { higherIsBetter: false },
  },
  {
    key: 'reachableByEmail',
    meaning: 'customers who accept email, at period end',
    unit: 'count',
    summable: false,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'piecesForSale',
    meaning: 'gallery pieces listed for sale, at period end',
    unit: 'count',
    summable: false,
    trendOptions: { minimumBaseline: COUNT_MINIMUM_BASELINE },
  },
  {
    key: 'valueForSale',
    meaning: 'total asking price of pieces for sale, at period end',
    unit: 'money',
    summable: false,
    trendOptions: { minimumBaseline: REVENUE_MINIMUM_BASELINE },
  },
];

const METRIC_KEYS = METRICS.map((metric) => metric.key);

// Every number the model sees is formatted here, so it never has to convert a
// ratio to a percent or round anything itself. No thousands separators, so the
// values are safe inside the CSV table.
const formatValue = (unit, value) => {
  if (value === null) return 'no data';
  if (unit === 'money') return `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`;
  if (unit === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (unit === 'multiple') return `${value.toFixed(2)}x`;
  if (unit === 'days') return `${value.toFixed(1)} days`;
  if (unit === 'decimal') return value.toFixed(1);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const signOf = (value) => {
  if (value > 0) return '+';
  if (value < 0) return '-';
  return '';
};

const formatDifference = (unit, difference) => {
  if (unit === 'percent') {
    return `${signOf(difference)}${(Math.abs(difference) * 100).toFixed(1)} percentage points`;
  }
  return `${signOf(difference)}${formatValue(unit, Math.abs(difference))}`;
};

const formatChange = (from, to) => {
  if (from <= 0) return 'not meaningful, starting value is zero';
  const change = (to - from) / from;
  return `${signOf(change)}${Math.abs(change * 100).toFixed(1)}%`;
};

const loadSeries = async ({ granularity, range }) => {
  const periods = await ChartSeries.getByPeriod(granularity, range);

  // Same derivations as the frontend's buildSections.
  const totalRevenue = periods.map((period) => period.galleryRevenue + period.auctionRevenue);
  const derived = {
    totalRevenue,
    averageOrderValue: periods.map((period, index) =>
      period.orderCount === 0 ? null : totalRevenue[index] / period.orderCount,
    ),
    outstandingBalance: periods.map((period) =>
      period.outstandingGallery === null
        ? null
        : period.outstandingGallery + period.outstandingAuction,
    ),
  };

  const series = Object.fromEntries(
    METRICS.map((metric) => [
      metric.key,
      derived[metric.key] ?? periods.map((period) => period[metric.key]),
    ]),
  );

  return { buckets: periods.map((period) => period.bucket), series };
};

const describeSpan = (metric, buckets, values) => {
  const points = values
    .map((value, index) => ({ period: buckets[index], value }))
    .filter((point) => point.value !== null);

  if (points.length === 0) return { periodCount: values.length, note: 'no data in this span' };

  const sum = points.reduce((total, point) => total + point.value, 0);
  const high = points.reduce((best, point) => (point.value > best.value ? point : best));
  const low = points.reduce((worst, point) => (point.value < worst.value ? point : worst));
  const first = points[0];
  const last = points.at(-1);
  const describePoint = (point) => ({
    period: point.period,
    value: formatValue(metric.unit, point.value),
  });

  return {
    periodCount: values.length,
    ...(metric.summable ? { total: formatValue(metric.unit, sum) } : {}),
    averagePerPeriod: formatValue(metric.unit, sum / points.length),
    high: describePoint(high),
    low: describePoint(low),
    first: describePoint(first),
    last: describePoint(last),
    changeFirstToLast: formatChange(first.value, last.value),
  };
};

const describeTrend = (metric, values, latestCompletePeriod) => {
  const trend = classifyTrend(values, { ...metric.trendOptions, lastPeriodIsPartial: true });
  if (trend.verdict === NOT_ENOUGH_DATA) return 'not enough data for a trend';

  return {
    latestCompletePeriod,
    latest: formatValue(metric.unit, trend.latest),
    [`averageOfPrevious${BASELINE_PERIOD_COUNT}`]: formatValue(metric.unit, trend.baseline),
    change: formatChange(trend.baseline, trend.latest),
    direction: trend.verdict,
    assessment: trend.tone,
  };
};

const buildInstructions = ({ granularity, range, data }) => {
  const { buckets, series } = data;
  const completeBuckets = buckets.slice(0, -1);
  const currentBucket = buckets.at(-1);

  const legend = METRICS.map((metric) => `- ${metric.key}: ${metric.meaning}`);

  const summaries = METRICS.map((metric) => {
    const values = series[metric.key];
    return JSON.stringify({
      metric: metric.key,
      completePeriods: describeSpan(metric, completeBuckets, values.slice(0, -1)),
      trend: describeTrend(metric, values, completeBuckets.at(-1)),
      currentPeriodSoFar: { period: currentBucket, value: formatValue(metric.unit, values.at(-1)) },
    });
  });

  const header = ['period', ...METRIC_KEYS].join(',');
  const rows = buckets.map((bucket, index) =>
    [
      bucket,
      ...METRICS.map((metric) => {
        const value = series[metric.key][index];
        return value === null ? '' : formatValue(metric.unit, value);
      }),
    ].join(','),
  );

  return [
    'You are helping the owner of Stress Less Glass, a one-person glass blowing business that',
    'sells through gallery listings and auctions on its own site, make sense of the numbers on',
    'their Charts page. Talk it through with them like an analyst they trust: explain what is',
    'happening, point out how the metrics connect, walk them through the figures, and when asked,',
    'suggest ideas for sales, specials, or ways to approach different groups of customers.',
    '',
    'Rules for numbers:',
    '- Never do arithmetic yourself. Every number you state must be copied from the summaries,',
    '  the table, or a tool result.',
    '- If you need a figure that is not there, call a tool. If no tool can produce it, say you',
    '  do not have it.',
    '- Ideas and suggestions are welcome, but make clear when something is your idea rather',
    '  than something the data shows.',
    '',
    'About the data:',
    `- One row per ${granularity}, covering range "${range}". The period column is the start`,
    '  date of each period, and is the value the tools expect.',
    `- The last period (${currentBucket}) contains today, so it is incomplete. The summaries`,
    '  leave it out. Never read a low value there as a drop.',
    `- A trend compares the latest complete period with the average of the ${BASELINE_PERIOD_COUNT}`,
    '  complete periods before it, the same verdict the Charts page cards show.',
    '- An empty cell or "no data" means there was nothing to measure in that period.',
    '',
    'Metrics:',
    ...legend,
    '',
    'Summaries, one per metric (complete periods only):',
    ...summaries,
    '',
    'Data (CSV):',
    header,
    ...rows,
  ].join('\n');
};

const TOOLS = [
  {
    type: 'function',
    name: 'summarizeMetric',
    description:
      'Summarize one metric over an inclusive span of periods: total (for metrics that add up), ' +
      'average per period, high, low, first, last, and the change from first to last. ' +
      'Use this for any figure across a span that is not already in the summaries.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: METRIC_KEYS },
        fromPeriod: { type: 'string', description: 'A value from the period column.' },
        toPeriod: {
          type: 'string',
          description: 'A value from the period column, the same as or after fromPeriod.',
        },
      },
      required: ['metric', 'fromPeriod', 'toPeriod'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'comparePeriods',
    description:
      'Compare one metric between two periods: both values, the difference, and the percent ' +
      'change from the first period to the second.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: METRIC_KEYS },
        firstPeriod: { type: 'string', description: 'A value from the period column.' },
        secondPeriod: { type: 'string', description: 'A value from the period column.' },
      },
      required: ['metric', 'firstPeriod', 'secondPeriod'],
      additionalProperties: false,
    },
    strict: true,
  },
];

const UNKNOWN_PERIOD = { error: 'Unknown period. Use a value from the period column.' };

// Bad periods go back to the model as the tool result so it can correct itself.
const runTool = (toolCall, data) => {
  const toolArguments = JSON.parse(toolCall.arguments);
  const metric = METRICS.find((candidate) => candidate.key === toolArguments.metric);
  const values = data.series[metric.key];
  const currentIndex = data.buckets.length - 1;

  if (toolCall.name === 'summarizeMetric') {
    const fromIndex = data.buckets.indexOf(toolArguments.fromPeriod);
    const toIndex = data.buckets.indexOf(toolArguments.toPeriod);
    if (fromIndex === -1 || toIndex === -1) return UNKNOWN_PERIOD;
    if (fromIndex > toIndex) return { error: 'fromPeriod must not be after toPeriod.' };

    return {
      metric: metric.key,
      fromPeriod: toolArguments.fromPeriod,
      toPeriod: toolArguments.toPeriod,
      includesIncompleteCurrentPeriod: toIndex === currentIndex,
      ...describeSpan(
        metric,
        data.buckets.slice(fromIndex, toIndex + 1),
        values.slice(fromIndex, toIndex + 1),
      ),
    };
  }

  if (toolCall.name === 'comparePeriods') {
    const firstIndex = data.buckets.indexOf(toolArguments.firstPeriod);
    const secondIndex = data.buckets.indexOf(toolArguments.secondPeriod);
    if (firstIndex === -1 || secondIndex === -1) return UNKNOWN_PERIOD;

    const firstValue = values[firstIndex];
    const secondValue = values[secondIndex];
    const comparison = {
      metric: metric.key,
      firstPeriod: {
        period: toolArguments.firstPeriod,
        value: formatValue(metric.unit, firstValue),
      },
      secondPeriod: {
        period: toolArguments.secondPeriod,
        value: formatValue(metric.unit, secondValue),
      },
      includesIncompleteCurrentPeriod: [firstIndex, secondIndex].includes(currentIndex),
    };
    if (firstValue === null || secondValue === null) {
      return { ...comparison, note: 'at least one period has no data, so no difference' };
    }

    return {
      ...comparison,
      difference: formatDifference(metric.unit, secondValue - firstValue),
      percentChange: formatChange(firstValue, secondValue),
    };
  }

  throw new Error(`Unknown tool ${toolCall.name}`);
};

const callOpenAI = async (body) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw Object.assign(new Error(`OpenAI ${response.status}: ${await response.text()}`), {
      status: 502,
    });
  }

  return response.json();
};

// A reasoning item can come before the message, so the text is not always output[0].
const extractText = (response) =>
  response.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content)
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('');

const askAboutCharts = async ({ granularity, range, messages }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw Object.assign(new Error('OPENAI_API_KEY is not set'), { status: 500 });
  }

  const data = await loadSeries({ granularity, range });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = buildInstructions({ granularity, range, data });
  const input = messages.map(({ role, content }) => ({ role, content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await callOpenAI({ model, instructions, tools: TOOLS, input });
    const toolCalls = response.output.filter((item) => item.type === 'function_call');
    if (toolCalls.length === 0) return extractText(response);

    // The whole output goes back, because reasoning items must accompany the calls they led to.
    input.push(...response.output);
    for (const toolCall of toolCalls) {
      input.push({
        type: 'function_call_output',
        call_id: toolCall.call_id,
        output: JSON.stringify(runTool(toolCall, data)),
      });
    }
  }

  throw Object.assign(new Error(`Model was still calling tools after ${MAX_TOOL_ROUNDS} rounds`), {
    status: 502,
  });
};

module.exports = { askAboutCharts };
