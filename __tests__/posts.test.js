const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
// const Post = require('../lib/models/Post.js');

const mockUser = {
  email: 'test@example.com',
  password: '12345',
};

const registerAndLogin = async () => {
  const agent = request.agent(app);
  const user = await UserService.create(mockUser);
  await agent
    .post('/api/v1/users/sessions')
    .send({ email: mockUser.email, password: mockUser.password });
  return [agent, user];
};
describe('admin gallery routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  afterAll(() => {
    pool.end();
  });

  it('GET /api/v1/admin', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.get('/api/v1/admin');
    expect(resp.status).toBe(200);
  });

  //   it('GET /api/v1/admin/:id', async () => {
  //     const [agent] = await registerAndLogin();
  //     const resp = await agent.get('/api/v1/admin/1');
  //     expect(resp.status).toBe(200);
  //     expect(resp.body).toEqual({
  //       completed: false,
  //       created_at: expect.any(String),
  //       id: expect.any(String),
  //       task: 'Mow lawn',
  //       user_id: '1',
  //     });
  //   });

  it('POST /api/v1/admin', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.post('/api/v1/admin').send({
      title: 'test title',
      description: 'test description',
      image_url: 'test image url',
      category: 'test category',
      price: 'test price',
      author_id: 1,
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      id: expect.any(String),
      created_at: expect.any(String),
      title: 'test title',
      description: 'test description',
      image_url: expect.any(String),
      category: 'test category',
      price: 'test price',
      author_id: expect.any(String),
    });
  });

  //   it('PUT /api/v1/admin/:id', async () => {
  //     const [agent] = await registerAndLogin();
  //     const resp = await agent
  //       .put('/api/v1/admin/1')
  //       .send({ todo_id: 1, mark: 'true' });
  //     expect(resp.status).toBe(200);
  //     expect(resp.body.completed).toBe(true);
  //     const resp2 = await agent
  //       .put('/api/v1/admin/1')
  //       .send({ todo_id: 1, mark: 'false' });
  //     expect(resp2.status).toBe(200);
  //     expect(resp2.body.completed).toBe(false);
  //   });

  //   it('DELETE /api/v1/admin/:id', async () => {
  //     const [agent, user] = await registerAndLogin();
  //     const task = 'Test task that needs to be deleted';
  //     const todo = await Todo.postNewToDo(task, user.id);
  //     const resp = await agent.delete(`/api/v1/admin/${todo.id}`);
  //     expect(resp.status).toBe(200);
  //     const deleteResp = await agent.get(`/api/v1/admin/${todo.id}`);
  //     expect(deleteResp.status).toBe(403);
  //   });

  //   it('PUT /api/v1/admin/edit/:id', async () => {
  //     const [agent] = await registerAndLogin();
  //     const resp = await agent
  //       .post('/api/v1/admin')
  //       .send({ task: 'Test task', user_id: '1' });
  //     expect(resp.status).toBe(200);
  //     const resp2 = await agent
  //       .post('/api/v1/admin')
  //       .send({ task: 'Test task is updated', user_id: '1' });
  //     expect(resp2.status).toBe(200);
  //     expect(resp2.body.task).toBe('Test task is updated');
  //   });
});
