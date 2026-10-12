const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Profile = require('../lib/models/Profile');

// OpenAI is a paid third party; only the persistence around it is under test.
jest.mock('../lib/services/chartChat.js', () => ({
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
});
