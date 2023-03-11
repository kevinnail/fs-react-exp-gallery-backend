const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

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

  it('GET/api/v1/admin/:id', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.get('/api/v1/admin/1');
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      id: expect.any(String),
      created_at: expect.any(String),
      title: expect.any(String),
      description: expect.any(String),
      image_url: expect.any(String),
      category: expect.any(String),
      price: expect.any(String),
      author_id: expect.any(String),
    });
  });

  it('PUT /api/v1/admin/:id', async () => {
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
    const resp2 = await agent.post('/api/v1/admin').send({
      author_id: 1,
      title: 'Test title is updated',
      description: 'test description is updated',
      image_url: 'test image url is updated',
      category: 'test category is updated',
      price: 'test price is updated',
    });
    expect(resp2.status).toBe(200);
    expect(resp2.body).toEqual({
      id: expect.any(String),
      created_at: expect.any(String),
      title: 'Test title is updated',
      description: 'test description is updated',
      image_url: 'test image url is updated',
      category: 'test category is updated',
      price: 'test price is updated',
      author_id: expect.any(String),
    });
  });

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
      image_url: 'test image url',
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

  it('DELETE /api/v1/admin/:id should delete a post', async () => {
    // First, create a new post using Post.postNewPost() method
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

    // Get the ID of the newly created post
    const postId = resp.body.id;

    // Delete the post
    const deleteResp = await agent.delete(`/api/v1/admin/${postId}`);
    expect(deleteResp.status).toBe(200);

    // Try to get the deleted post
    const getResp = await agent.get(`/api/v1/posts/${postId}`);
    expect(getResp.status).toBe(404);
  });

  //
  //

  //
  //

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
