const { enqueue } = require('../lib/jobs/emailQueue');

const flushQueue = () => new Promise((resolve) => setImmediate(resolve));

describe('emailQueue', () => {
  it('runs each job with the handler it was enqueued with', async () => {
    const auctionHandler = jest.fn().mockResolvedValue();
    let releasePostHandler;
    const postHandler = jest.fn(
      () =>
        new Promise((resolve) => {
          releasePostHandler = resolve;
        }),
    );

    // enqueue an auction job while the post job is still in flight, so the
    // auction job is drained by the loop the post job started
    enqueue({ post: { id: 1 } }, postHandler);
    await flushQueue();
    enqueue({ auction: { id: 2 } }, auctionHandler);
    releasePostHandler();
    await flushQueue();

    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith({ post: { id: 1 } });
    expect(auctionHandler).toHaveBeenCalledTimes(1);
    expect(auctionHandler).toHaveBeenCalledWith({ auction: { id: 2 } });
  });

  it('keeps draining after a job throws', async () => {
    const failingHandler = jest.fn().mockRejectedValue(new Error('smtp down'));
    const laterHandler = jest.fn().mockResolvedValue();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    enqueue({ post: { id: 3 } }, failingHandler);
    enqueue({ post: { id: 4 } }, laterHandler);
    await flushQueue();

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(laterHandler).toHaveBeenCalledWith({ post: { id: 4 } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
