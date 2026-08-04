const queue = [];
let processing = false;

async function runQueue() {
  if (processing) return;
  processing = true;

  while (queue.length) {
    // Each entry carries its own handler — a single shared queue serves both
    // auction and post notifications, so the job must not be run by whichever
    // handler happened to start the current drain.
    const { job, processJob } = queue.shift();
    try {
      await processJob(job);
    } catch (err) {
      console.error('Email job failed:', err);
    }
  }

  processing = false;
}

function enqueue(job, processJob) {
  queue.push({ job, processJob });
  runQueue();
}

module.exports = { enqueue };
