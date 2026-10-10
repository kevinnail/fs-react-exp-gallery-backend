// Same logic as the frontend's src/services/trendVerdict.js, so the chat sees
// the same verdicts as the Charts page cards.
const BASELINE_PERIOD_COUNT = 4;

const NOT_ENOUGH_DATA = 'not-enough-data';

// Compares the last complete period against the mean of the four complete
// periods before it. One period against one period is mostly noise at this
// business's volume.
const classifyTrend = (
  values,
  { higherIsBetter = true, flatBand = 0.1, minimumBaseline = 0, lastPeriodIsPartial = true } = {},
) => {
  const completeValues = lastPeriodIsPartial ? values.slice(0, -1) : values;

  if (completeValues.length < BASELINE_PERIOD_COUNT + 1) {
    return { verdict: NOT_ENOUGH_DATA };
  }

  const latest = completeValues.at(-1);
  const baselineValues = completeValues.slice(-(BASELINE_PERIOD_COUNT + 1), -1);

  if (latest === null || baselineValues.includes(null)) {
    return { verdict: NOT_ENOUGH_DATA };
  }

  const baseline =
    baselineValues.reduce((total, value) => total + value, 0) / BASELINE_PERIOD_COUNT;

  // A zero baseline would divide by zero, and a tiny one turns a single sale
  // after a quiet stretch into +900%.
  if (baseline <= 0 || baseline < minimumBaseline) {
    return { verdict: NOT_ENOUGH_DATA, latest, baseline };
  }

  const change = (latest - baseline) / baseline;

  if (Math.abs(change) <= flatBand) {
    return { verdict: 'flat', tone: 'neutral', latest, baseline, change };
  }

  const verdict = change > 0 ? 'up' : 'down';
  const isGood = (verdict === 'up') === higherIsBetter;

  return { verdict, tone: isGood ? 'good' : 'bad', latest, baseline, change };
};

module.exports = { classifyTrend, NOT_ENOUGH_DATA, BASELINE_PERIOD_COUNT };
