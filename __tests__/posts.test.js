const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const cloudinary = require('cloudinary').v2;
const FormData = require('form-data');

// Replace the upload middleware with the mockMulter
jest.mock('multer', () => {
  const mockMulter = {
    array: jest.fn((fieldName) => (req, res, next) => {
      // Add req.files with fake data when mocking the multer middleware
      req.files = [
        {
          fieldname: fieldName,
          originalname: 'test-image-1.jpg',
          filename: 'test-image-1.jpg',
          path: 'https://res.cloudinary.com/path/to/test-image-1.jpg',
          mimetype: 'image/jpeg',
        },
        {
          fieldname: fieldName,
          originalname: 'test-image-2.jpg',
          filename: 'test-image-2.jpg',
          path: 'https://res.cloudinary.com/path/to/test-image-2.jpg',
          mimetype: 'image/jpeg',
        },
      ];
      next();
    }),
    none: jest.fn(() => (req, res, next) => next()),
  };

  return jest.fn().mockImplementation(() => mockMulter);
});

// working code for using local storage method vvvvvvvv
// Mock the cloudinary.uploader.upload function
// jest.mock('cloudinary', () => ({
//   v2: {
//     uploader: {
//       upload: jest.fn(),
//       upload_stream: jest.fn(),
//     },
//   },
// }));
// working code for using local storage method ^^^^^^^^

// jest.mock('multer', () => {
//   return function () {
//     return mockMulter;
//   };
// });

// Mock the CloudinaryStorage class
jest.mock('multer-storage-cloudinary', () => {
  return {
    CloudinaryStorage: jest.fn().mockImplementation(() => {
      return {
        _handle: (req, file, cb) => {
          cb(null, {
            public_id: 'test-public-id',
            secure_url: 'https://test-cloudinary-url.com',
          });
        },
      };
    }),
  };
});

// new ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

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

// jest.mock('cloudinary', () => ({
//   v2: {
//     uploader: {
//       upload: jest.fn(),
//     },
//     config: jest.fn(() => {}),
//   },
// }));
describe('admin gallery routes', () => {
  beforeEach(() => {
    cloudinary.config({
      cloud_name: 'my_cloud_name',
      api_key: 'my_api_key',
      api_secret: 'my_api_secret',
    });
    return setup(pool);
  });

  afterAll(() => {
    jest.clearAllMocks();
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
      creator_id: expect.any(String),
      num_imgs: expect.any(String),
      public_id: expect.any(String),
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
      creator_id: 1,
      num_imgs: 1,
      public_id: 'test public id',
    });
    expect(resp.status).toBe(200);
    const resp2 = await agent.post('/api/v1/admin').send({
      creator_id: 1,
      title: 'Test title is updated',
      description: 'test description is updated',
      image_url: 'test image url is updated',
      category: 'test category is updated',
      price: 'test price is updated',
      num_imgs: 1,
      public_id: 'test public id',
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
      creator_id: expect.any(String),
      num_imgs: expect.any(String),
      public_id: expect.any(String),
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
      num_imgs: 1,
      public_id: 'test public id',
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
      creator_id: expect.any(String),
      num_imgs: expect.any(String),
      public_id: expect.any(String),
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
      creator_id: 1,
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

  //  upload image test //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // it('POST /admin/upload should upload a file/ files and return a 200 status code', async () => {
  //   const fakeImage1 = Buffer.from('fake-image-content-1');
  //   const fakeImage2 = Buffer.from('fake-image-content-2');
  //   const [agent] = await registerAndLogin();

  //   const formData = new FormData();

  //   formData.append('imageFiles', fakeImage1, 'test-image-1.jpg');
  //   formData.append('imageFiles', fakeImage2, 'test-image-2.jpg');

  //   const response = await agent
  //     .post('/api/v1/admin/upload')
  //     .set(
  //       'Content-Type',
  //       `multipart/form-data; boundary=${formData.getBoundary()}`
  //     )
  //     .send(formData.getBuffer());
  //   console.log('response', response.body);
  //   expect(response.statusCode).toBe(200);
  // });

  // old test works with local storage ^^^^^^^^^^^^^^^^^^^
  // Test setup
  const mockMulter = {
    array: jest.fn(),
  };

  jest.mock('multer', () => {
    return jest.fn().mockImplementation(() => mockMulter);
  });

  // ... your other mocks, imports, and test cases ...

  // Test case
  it('POST /admin/upload should upload a file/ files and return a 200 status code', async () => {
    const fakeImage1 = Buffer.from('fake-image-content-1');
    const fakeImage2 = Buffer.from('fake-image-content-2');
    const [agent] = await registerAndLogin();

    const formData = new FormData();

    formData.append('imageFiles', fakeImage1, 'test-image-1.jpg', {
      type: 'image/jpeg',
    });
    formData.append('imageFiles', fakeImage2, 'test-image-2.jpg', {
      type: 'image/jpeg',
    });

    const response = await agent
      .post('/api/v1/admin/upload')
      .set(
        'Content-Type',
        `multipart/form-data; boundary=${formData.getBoundary()}`
      )
      .send(formData.getBuffer());
    expect(response.statusCode).toBe(200);
  });

  it('POST /admin/images should store public_id and url in the database', async () => {
    const [agent] = await registerAndLogin();
    const id = '1';
    const image_public_ids = '["test-public-id", "test-public-id-2"]';
    const image_urls = '["test-url", "test-url-2"]';
    const resource_types = '["image", "image"]';

    const response = await agent
      .post('/api/v1/admin/images')
      .send({ id, image_urls, image_public_ids, resource_types });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      {
        id: expect.any(Number),
        image_url: expect.any(String),
        public_id: expect.any(String),
        resource_type: expect.any(String),
      },
      {
        id: expect.any(Number),
        image_url: expect.any(String),
        public_id: expect.any(String),
        resource_type: expect.any(String),
      },
    ]);
  });

  it('DELETE /api/v1/admin/image/:id should delete an image from database', async () => {
    const [agent] = await registerAndLogin();
    const id = 1;
    const image_public_ids = '["test-public-id", "test-public-id-2"]';
    const image_urls = '["test-url", "test-url-2"]';
    const resource_types = '["image", "image"]';
    const response = await agent
      .post('/api/v1/admin/images')
      .send({ id, image_urls, image_public_ids, resource_types });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchInlineSnapshot(`
      Array [
        Object {
          "id": 4,
          "image_url": "test-url",
          "public_id": "test-public-id",
          "resource_type": "image",
        },
        Object {
          "id": 5,
          "image_url": "test-url-2",
          "public_id": "test-public-id-2",
          "resource_type": "image",
        },
      ]
    `);

    const publicimgToDelete = response.body[0].public_id;
    const deleteResp = await agent.delete(`/api/v1/admin/image/${id}`).send({
      public_id: publicimgToDelete,
    });
    expect(deleteResp.body).toMatchInlineSnapshot(`
      Object {
        "message": "column reference \\"id\\" is ambiguous",
        "status": 403,
      }
    `);

    expect(deleteResp.status).toBe(200);
    const remainingImage = await agent.get(`/api/v1/admin/urls/${id}`);
    expect(remainingImage.body).toMatchInlineSnapshot(`
      Array [
        Object {
          "id": 1,
          "image_url": "image_url.com",
          "post_id": 1,
          "public_id": "public_id_1",
          "resource_type": "image",
        },
        Object {
          "id": 2,
          "image_url": "image_url.com2",
          "post_id": 1,
          "public_id": "public_id_2",
          "resource_type": "image",
        },
        Object {
          "id": 3,
          "image_url": "image_url.com3",
          "post_id": 1,
          "public_id": "public_id_3",
          "resource_type": "image",
        },
        Object {
          "id": 5,
          "image_url": "test-url-2",
          "post_id": 1,
          "public_id": "test-public-id-2",
          "resource_type": "image",
        },
      ]
    `);
    expect(remainingImage.status).toBe(200);
  });

  it('GET /api/v1/main-gallery should return all posts', async () => {
    const data = await request(app).get('/api/v1/main-gallery');
    expect(data.status).toBe(200);
    expect(data.body).toEqual([
      {
        creator_id: '1',
        category: 'Test 1',
        created_at: expect.any(String),
        description: 'Test 1',
        id: '1',
        image_url: 'Test 1',
        num_imgs: '1',
        price: 'Test 1',
        public_id: 'Test 1',
        title: 'Test 1',
      },
      {
        creator_id: '1',
        category: 'Test 2',
        created_at: expect.any(String),
        description: 'Test 2',
        id: '2',
        image_url: 'Test 2',
        num_imgs: '1',
        price: 'Test 2',
        public_id: 'Test 2',
        title: 'Test 2',
      },
      {
        creator_id: '1',
        category: 'Test 3',
        created_at: expect.any(String),
        description: 'Test 3',
        id: '3',
        image_url: 'Test 3',
        num_imgs: '1',
        price: 'Test 3',
        public_id: 'Test 3',
        title: 'Test 3',
      },
    ]);
  });

  it('GET /api/v1/main-gallery/:id should return a single post', async () => {
    const data = await request(app).get('/api/v1/main-gallery/1');
    expect(data.status).toBe(200);
    expect(data.body).toEqual({
      creator_id: '1',
      category: 'Test 1',
      created_at: expect.any(String),
      description: 'Test 1',
      id: '1',
      image_url: 'Test 1',
      num_imgs: '1',
      price: 'Test 1',
      public_id: 'Test 1',
      title: 'Test 1',
    });
  });

  it('GET /api/v1/main-gallery/urls/:id should return all urls for a post', async () => {
    const data = await request(app).get('/api/v1/main-gallery/urls/1');
    expect(data.status).toBe(200);
    expect(data.body).toEqual([
      { id: 1, image_url: 'image_url.com', public_id: 'public_id_1' },
      { id: 2, image_url: 'image_url.com2', public_id: 'public_id_2' },
      { id: 3, image_url: 'image_url.com3', public_id: 'public_id_3' },
    ]);
  });

  it('should return matching gallery posts', async () => {
    const searchTerm = 'Test 1'; // Replace with a term you expect to find in your test data
    // api/v1/main-gallery/search/${searchTerm}`
    const response = await request(app)
      .get(`/api/v1/main-gallery/search/${searchTerm}`)
      .expect(200);

    // Check if the response contains the expected posts
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining(searchTerm),
        }),
      ])
    );
  });

  it('GET /api/v1/main-gallery/creator/:id returns all posts from a creator', async () => {
    const resp = await request(app).get('/api/v1/main-gallery/creator/1');
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchInlineSnapshot();
  });

  // don't remove this one: '});'   VVVVV ---- TEST ABOVE///////////////////////////////////////////////////////
});
