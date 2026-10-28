const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Profile = require('../lib/models/Profile');

// OpenAI is a paid third party; only the persistence around it is under test.
jest.mock('../lib/services/chartChat.js', () => ({
  ...jest.requireActual('../lib/services/chartChat.js'),
  askAboutCharts: jest.fn(),
}));
const { askAboutCharts } = require('../lib/services/chartChat.js');

const adminCredentials = { email: 'test@example.com', password: 'Test1234!' };
const customerCredentials = { email: 'buyer@example.com', password: 'Test1234!' };

const createUser = async ({ email, password }) => {
  const { user } = await UserService.create({ email, password });
  await Profile.insert({ userId: user.id, firstName: 'Test', lastName: 'User' });
  return user;
};

const loginAs = async (credentials) => {
  await createUser(credentials);
  const agent = request.agent(app);
  await agent.post('/api/v1/users/sessions').send(credentials);
  return agent;
};

const storedMessages = async () => {
  const { rows } = await pool.query(
    'SELECT chat_id, role, content FROM chart_chat_messages ORDER BY id',
  );
  return rows;
};

const storedChats = async () => {
  const { rows } = await pool.query('SELECT id, title, granularity, range FROM chart_chats');
  return rows;
};

const modelFailure = () => Object.assign(new Error('OpenAI 500: upstream error'), { status: 502 });

describe('/api/v1/admin/chart-chats', () => {
  beforeEach(async () => {
    await setup(pool);
    askAboutCharts.mockReset();
  });

  afterAll(() => {
    pool.end();
  });

  describe('POST /', () => {
    it('creates a chat with the question and the reply, titled from the question', async () => {
      const agent = await loginAs(adminCredentials);
      askAboutCharts.mockResolvedValue('Revenue fell because no auctions closed.');

      const res = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: '  Why did revenue drop?  ' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        title: 'Why did revenue drop?',
        granularity: 'week',
        range: '6m',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        messages: [
          {
            id: expect.any(String),
            role: 'user',
            content: 'Why did revenue drop?',
            createdAt: expect.any(String),
          },
          {
            id: expect.any(String),
            role: 'assistant',
            content: 'Revenue fell because no auctions closed.',
            createdAt: expect.any(String),
          },
        ],
      });
      expect(askAboutCharts).toHaveBeenCalledWith({
        granularity: 'week',
        range: '6m',
        messages: [{ role: 'user', content: 'Why did revenue drop?' }],
      });
      expect(await storedMessages()).toEqual([
        { chat_id: res.body.id, role: 'user', content: 'Why did revenue drop?' },
        {
          chat_id: res.body.id,
          role: 'assistant',
          content: 'Revenue fell because no auctions closed.',
        },
      ]);
    });

    it('shortens a long first question to a single-line title cut at a whole word', async () => {
      const agent = await loginAs(adminCredentials);
      askAboutCharts.mockResolvedValue('Reply');
      const question =
        'Compare gallery and auction revenue\nacross the last six months and tell me which one is carrying the business';

      const res = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'month', range: '6m', content: question });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Compare gallery and auction revenue across the last six...');
      expect(res.body.messages[0].content).toBe(question);
    });

    it('returns 502 and saves nothing when the model call fails', async () => {
      const agent = await loginAs(adminCredentials);
      askAboutCharts.mockRejectedValue(modelFailure());

      const res = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Why did revenue drop?' });

      expect(res.status).toBe(502);
      expect(await storedChats()).toEqual([]);
      expect(await storedMessages()).toEqual([]);
    });

    it('returns 400 for an invalid granularity without calling the model', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'year', range: '6m', content: 'Why?' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('granularity must be day, week or month');
      expect(askAboutCharts).not.toHaveBeenCalled();
      expect(await storedChats()).toEqual([]);
    });

    it('returns 400 for blank content without calling the model', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('content must be a non-empty string');
      expect(askAboutCharts).not.toHaveBeenCalled();
    });

    it('returns 401 when signed out', async () => {
      const res = await request(app)
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Why?' });

      expect(res.status).toBe(401);
      expect(askAboutCharts).not.toHaveBeenCalled();
    });

    it('returns 403 for a signed-in customer', async () => {
      const agent = await loginAs(customerCredentials);

      const res = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Why?' });

      expect(res.status).toBe(403);
      expect(askAboutCharts).not.toHaveBeenCalled();
      expect(await storedChats()).toEqual([]);
    });
  });

  describe('GET /:id', () => {
    it('returns the chat with its turns in order', async () => {
      const agent = await loginAs(adminCredentials);
      askAboutCharts.mockResolvedValue('First reply');
      const created = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'day', range: '3m', content: 'First question' });

      const res = await agent.get(`/api/v1/admin/chart-chats/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.title).toBe('First question');
      expect(res.body.granularity).toBe('day');
      expect(res.body.range).toBe('3m');
      expect(res.body.messages.map(({ role, content }) => ({ role, content }))).toEqual([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First reply' },
      ]);
    });

    it('returns 404 for a chat that does not exist', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent.get('/api/v1/admin/chart-chats/9999');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Chat not found');
    });

    it('returns 403 for a signed-in customer', async () => {
      const adminAgent = await loginAs(adminCredentials);
      askAboutCharts.mockResolvedValue('Reply');
      const created = await adminAgent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Question' });
      const customerAgent = await loginAs(customerCredentials);

      const res = await customerAgent.get(`/api/v1/admin/chart-chats/${created.body.id}`);

      expect(res.status).toBe(403);
      expect(res.body.messages).toBeUndefined();
    });
  });

  describe('POST /:id/messages', () => {
    const createChat = async (agent) => {
      askAboutCharts.mockResolvedValueOnce('First reply');
      const created = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'First question' });
      return created.body;
    };

    it('sends the saved history to the model and appends both new turns', async () => {
      const agent = await loginAs(adminCredentials);
      const chat = await createChat(agent);
      askAboutCharts.mockResolvedValueOnce('Second reply');

      const res = await agent
        .post(`/api/v1/admin/chart-chats/${chat.id}/messages`)
        .send({ granularity: 'month', range: '12m', content: 'Second question' });

      expect(res.status).toBe(201);
      expect(res.body.map(({ role, content }) => ({ role, content }))).toEqual([
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second reply' },
      ]);
      expect(askAboutCharts).toHaveBeenLastCalledWith({
        granularity: 'month',
        range: '12m',
        messages: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First reply' },
          { role: 'user', content: 'Second question' },
        ],
      });
      expect((await storedMessages()).map(({ role, content }) => ({ role, content }))).toEqual([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First reply' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second reply' },
      ]);
      // The chat now opens with the controls the latest turn was asked under.
      expect(await storedChats()).toEqual([
        { id: chat.id, title: 'First question', granularity: 'month', range: '12m' },
      ]);
    });

    it('returns 502 and leaves the chat unchanged when the model call fails', async () => {
      const agent = await loginAs(adminCredentials);
      const chat = await createChat(agent);
      askAboutCharts.mockRejectedValueOnce(modelFailure());

      const res = await agent
        .post(`/api/v1/admin/chart-chats/${chat.id}/messages`)
        .send({ granularity: 'month', range: '12m', content: 'Second question' });

      expect(res.status).toBe(502);
      expect((await storedMessages()).map(({ content }) => content)).toEqual([
        'First question',
        'First reply',
      ]);
      expect(await storedChats()).toEqual([
        { id: chat.id, title: 'First question', granularity: 'week', range: '6m' },
      ]);
    });

    it('returns 404 for a chat that does not exist without calling the model', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent
        .post('/api/v1/admin/chart-chats/9999/messages')
        .send({ granularity: 'week', range: '6m', content: 'Question' });

      expect(res.status).toBe(404);
      expect(askAboutCharts).not.toHaveBeenCalled();
      expect(await storedMessages()).toEqual([]);
    });

    it('returns 400 for a day chart over all time', async () => {
      const agent = await loginAs(adminCredentials);
      const chat = await createChat(agent);

      const res = await agent
        .post(`/api/v1/admin/chart-chats/${chat.id}/messages`)
        .send({ granularity: 'day', range: 'all', content: 'Question' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('day granularity needs a range of 12 months or less');
      expect(await storedMessages()).toHaveLength(2);
    });
  });

  describe('GET /api/v1/admin/chart-chat-summary', () => {
    // Otherwise the chat tab shows numbers that differ from what the model was told.
    it('returns the same per-metric summaries written into the model instructions', async () => {
      const agent = await loginAs(adminCredentials);
      const { askAboutCharts: realAskAboutCharts } = jest.requireActual(
        '../lib/services/chartChat.js',
      );
      const originalApiKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'Reply' }] }],
        }),
      });

      const res = await agent.get('/api/v1/admin/chart-chat-summary?granularity=week&range=6m');
      await realAskAboutCharts({
        granularity: 'week',
        range: '6m',
        messages: [{ role: 'user', content: 'Question' }],
      });

      const { instructions } = JSON.parse(fetchSpy.mock.calls[0][1].body);
      process.env.OPENAI_API_KEY = originalApiKey;
      jest.restoreAllMocks();

      expect(res.status).toBe(200);
      expect(res.body[0]).toEqual({
        meaning: 'gallery plus auction revenue',
        metric: 'totalRevenue',
        completePeriods: expect.any(Object),
        trend: expect.anything(),
        currentPeriodSoFar: { period: expect.any(String), value: expect.any(String) },
      });
      for (const { meaning, ...summary } of res.body) {
        expect(instructions).toContain(`- ${summary.metric}: ${meaning}`);
        expect(instructions).toContain(JSON.stringify(summary));
      }
    });

    // Otherwise a bad period reaches the chart query instead of returning a readable error.
    it('returns 400 for a day chart over all time', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent.get('/api/v1/admin/chart-chat-summary?granularity=day&range=all');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('day granularity needs a range of 12 months or less');
    });

    // Otherwise a customer could read the admin's business numbers.
    it('returns 403 for a signed-in customer', async () => {
      const agent = await loginAs(customerCredentials);

      const res = await agent.get('/api/v1/admin/chart-chat-summary?granularity=week&range=6m');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /', () => {
    const createChat = async (agent, content) => {
      askAboutCharts.mockResolvedValueOnce('Reply');
      const created = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content });
      return created.body;
    };

    // Otherwise the chat Kevin just used sinks below older ones in the saved chats list.
    it('lists chats with the most recently active first, without their messages', async () => {
      const agent = await loginAs(adminCredentials);
      const olderChat = await createChat(agent, 'Older question');
      const newerChat = await createChat(agent, 'Newer question');
      askAboutCharts.mockResolvedValueOnce('Follow-up reply');
      await agent
        .post(`/api/v1/admin/chart-chats/${olderChat.id}/messages`)
        .send({ granularity: 'month', range: '12m', content: 'Follow-up' });

      const res = await agent.get('/api/v1/admin/chart-chats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: olderChat.id,
          title: 'Older question',
          granularity: 'month',
          range: '12m',
          updatedAt: expect.any(String),
        },
        {
          id: newerChat.id,
          title: 'Newer question',
          granularity: 'week',
          range: '6m',
          updatedAt: expect.any(String),
        },
      ]);
    });

    // Otherwise the list route falls through to the gallery post route and breaks the page with no chats.
    it('returns an empty list when there are no chats', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent.get('/api/v1/admin/chart-chats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    // Otherwise a customer could read the admin's business questions.
    it('returns 403 for a signed-in customer', async () => {
      const agent = await loginAs(customerCredentials);

      const res = await agent.get('/api/v1/admin/chart-chats');

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /:id', () => {
    const createChat = async (agent) => {
      askAboutCharts.mockResolvedValueOnce('Reply');
      const created = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Original question' });
      return created.body;
    };

    // Otherwise a rename shows in the list but is gone after a refresh.
    it('saves the trimmed title and returns the chat summary', async () => {
      const agent = await loginAs(adminCredentials);
      const chat = await createChat(agent);

      const res = await agent
        .patch(`/api/v1/admin/chart-chats/${chat.id}`)
        .send({ title: '  Spring revenue  ' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: chat.id,
        title: 'Spring revenue',
        granularity: 'week',
        range: '6m',
        updatedAt: expect.any(String),
      });
      expect(await storedChats()).toEqual([
        { id: chat.id, title: 'Spring revenue', granularity: 'week', range: '6m' },
      ]);
    });

    // Otherwise a cleared rename box leaves a chat with no visible title to click.
    it('returns 400 for a blank title and keeps the old one', async () => {
      const agent = await loginAs(adminCredentials);
      const chat = await createChat(agent);

      const res = await agent.patch(`/api/v1/admin/chart-chats/${chat.id}`).send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('title must be a non-empty string');
      expect((await storedChats())[0].title).toBe('Original question');
    });

    // Otherwise a long title reaches Postgres and comes back as a 500 instead of a readable error.
    it('returns 400 for a title over 120 characters', async () => {
      const agent = await loginAs(adminCredentials);
      const chat = await createChat(agent);

      const res = await agent
        .patch(`/api/v1/admin/chart-chats/${chat.id}`)
        .send({ title: 'a'.repeat(121) });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('title must be 120 characters or less');
      expect((await storedChats())[0].title).toBe('Original question');
    });

    // Otherwise renaming a chat deleted in another tab reports success.
    it('returns 404 for a chat that does not exist', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent.patch('/api/v1/admin/chart-chats/9999').send({ title: 'New title' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Chat not found');
    });
  });

  describe('DELETE /:id', () => {
    // Otherwise deleted chats leave their messages behind in the database.
    it('deletes the chat and its messages', async () => {
      const agent = await loginAs(adminCredentials);
      askAboutCharts.mockResolvedValueOnce('Reply');
      const created = await agent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Question' });

      const res = await agent.delete(`/api/v1/admin/chart-chats/${created.body.id}`);

      expect(res.status).toBe(204);
      expect(await storedChats()).toEqual([]);
      expect(await storedMessages()).toEqual([]);
    });

    // Otherwise deleting a chat that is already gone reports success.
    it('returns 404 for a chat that does not exist', async () => {
      const agent = await loginAs(adminCredentials);

      const res = await agent.delete('/api/v1/admin/chart-chats/9999');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Chat not found');
    });

    // Otherwise a customer could wipe the admin's saved chats.
    it('returns 403 for a signed-in customer and keeps the chat', async () => {
      const adminAgent = await loginAs(adminCredentials);
      askAboutCharts.mockResolvedValueOnce('Reply');
      const created = await adminAgent
        .post('/api/v1/admin/chart-chats')
        .send({ granularity: 'week', range: '6m', content: 'Question' });
      const customerAgent = await loginAs(customerCredentials);

      const res = await customerAgent.delete(`/api/v1/admin/chart-chats/${created.body.id}`);

      expect(res.status).toBe(403);
      expect(await storedChats()).toHaveLength(1);
    });
  });
});
