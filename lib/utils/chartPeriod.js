const chartPeriodError = ({ granularity, range }) => {
  if (!['day', 'week', 'month'].includes(granularity)) {
    return 'granularity must be day, week or month';
  }
  if (!['3m', '6m', '12m', 'all'].includes(range)) {
    return 'range must be 3m, 6m, 12m or all';
  }
  if (granularity === 'day' && range === 'all') {
    return 'day granularity needs a range of 12 months or less';
  }
  return null;
};

module.exports = { chartPeriodError };
