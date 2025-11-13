const queue = [];
let processing = false;

async function runQueue(processJob) {
  if (processing) return;
  processing = true;

  while (queue.length) {
    const job = queue.shift();
    try {
      await processJob(job);
    } catch (err) {
      console.error('Email job failed:', err);
    }
  }

  processing = false;
}

function enqueue(job, processJob) {
  queue.push(job);
  runQueue(processJob);
}

module.exports = { enqueue };
