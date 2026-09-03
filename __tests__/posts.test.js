const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');

const FormData = require('form-data');

jest.mock('../lib/utils/mailer', () => ({
  sendTrackingEmail: jest.fn().mockResolvedValue(true),
  sendNewPostEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('@aws-sdk/client-s3', () => {
  const mockS3Send = jest.fn().mockImplementation((command) => {
    if (command.constructor.name === 'PutObjectCommand') {
      return Promise.resolve({
        $metadata: { httpStatusCode: 200 },
      });
    }
    if (command.constructor.name === 'DeleteObjectCommand') {
      return Promise.resolve({
        $metadata: { httpStatusCode: 204 },
      });
    }
  });

  return {
    S3Client: jest.fn(() => ({
      send: mockS3Send,
    })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    __mockS3Send: mockS3Send,
  };
});

const mockUser = {
  email: 'test@example.com',
  password: 'Test1234!',
};

const registerAndLogin = async () => {
  const agent = request.agent(app);
  const { user } = await UserService.create(mockUser);
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
    jest.clearAllMocks();
    pool.end();
  });

  it('POST /api/v1/admin persists a discounted price and its original price', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.post('/api/v1/admin').send({
      title: 'discounted piece',
      description: 'discounted description',
      image_url: 'discounted img',
      category: 'discounted cat',
      price: '120',
      discountedPrice: '85',
      author_id: 1,
    });

    expect(resp.status).toBe(200);
    expect(resp.body.price).toBe('120');
    expect(resp.body.discountedPrice).toBe('85');
    expect(resp.body.originalPrice).toBe('120');

    const getResp = await agent.get(`/api/v1/main-gallery/${resp.body.id}`);
    expect(getResp.status).toBe(200);
    expect(getResp.body.discountedPrice).toBe('85');
    expect(getResp.body.originalPrice).toBe('120');
  });

  it('POST /api/v1/admin stores a blank discounted price as null', async () => {
    const [agent] = await registerAndLogin();
    const resp = await agent.post('/api/v1/admin').send({
      title: 'full price piece',
      description: 'full price description',
      image_url: 'full price img',
      category: 'full price cat',
      price: '120',
      discountedPrice: '',
      author_id: 1,
    });

    expect(resp.status).toBe(200);
    // An empty string here would make the discount comparison misbehave downstream
    expect(resp.body.discountedPrice).toBeNull();
    expect(resp.body.originalPrice).toBe('120');
  });

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

  it('PATCH /api/v1/admin/delete/:id should soft delete a post', async () => {
    const [agent] = await registerAndLogin();
    // Create a new post
    const resp = await agent.post('/api/v1/admin').send({
      title: 'soft delete test',
      description: 'soft delete desc',
      image_url: 'soft delete img',
      category: 'soft delete cat',
      price: 'soft delete price',
      author_id: 1,
    });
    expect(resp.status).toBe(200);
    const postId = resp.body.id;

    // Soft delete the post
    const patchResp = await agent.patch(`/api/v1/admin/delete/${postId}`);
    expect(patchResp.status).toBe(200);
    expect(patchResp.body.isDeleted).toBe(true);
    expect(patchResp.body.deleted_at).not.toBeNull();

    // Try to get the post via admin (should still exist and be marked deleted)
    const getAdminResp = await agent.get(`/api/v1/admin/${postId}`);
    expect(getAdminResp.status).toBe(200);
    expect(getAdminResp.body.isDeleted).toBe(true);

    // Try to get the post via public endpoint (should be 404)
    const getPublicResp = await agent.get(`/api/v1/posts/${postId}`);
    expect(getPublicResp.status).toBe(404);
  });

  it('Post.getById returns a soft-deleted post', async () => {
    const Post = require('../lib/models/Post');
    // Create a new post
    const newPost = await Post.postNewPost(
      'Soft Delete Test',
      'Test description',
      'test.jpg',
      'Test Category',
      '100',
      1,
      'public_id_test',
      1,
      null,
      '100',
      false,
      null,
      false,
    );
    // Soft-delete the post
    await Post.softDeleteById(newPost.id);
    // Fetch the post by ID
    const deletedPost = await Post.getById(newPost.id);
    expect(deletedPost).toBeDefined();
    expect(deletedPost.id).toBe(newPost.id);
    expect(deletedPost.isDeleted).toBe(true);
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
      num_imgs: expect.any(String),
      public_id: expect.any(String),
      hide: expect.any(Boolean),
      selling_link: null,
      sold: expect.any(Boolean),
      originalPrice: null,
      discountedPrice: null,
      isDeleted: false,
      deletedAt: null,
    });
  });

  it('PUT /api/v1/admin/:id updates a gallery post and persists the change', async () => {
    const [agent] = await registerAndLogin();
    const createResp = await agent.post('/api/v1/admin').send({
      title: 'test title',
      description: 'test description',
      image_url: 'test image url',
      category: 'test category',
      price: '100',
      author_id: 1,
      num_imgs: 1,
      public_id: 'test public id',
      hide: true,
      sold: false,
      link: 'http://www.website.com',
    });
    expect(createResp.status).toBe(200);

    const postId = createResp.body.id;
    const updatedPost = {
      ...createResp.body,
      title: 'test title is updated',
      description: 'test description is updated',
      image_url: 'test image url is updated',
      category: 'test category is updated',
      price: '150',
      num_imgs: 2,
      public_id: 'test public id is updated',
      hide: false,
      sold: true,
      link: 'http://www.updated-website.com',
    };

    const updateResp = await agent
      .put(`/api/v1/admin/${postId}`)
      .send({ id: postId, post: updatedPost });

    expect(updateResp.status).toBe(200);
    expect(updateResp.body).toEqual({
      id: postId,
      created_at: createResp.body.created_at,
      title: 'test title is updated',
      description: 'test description is updated',
      image_url: 'test image url is updated',
      category: 'test category is updated',
      price: '150',
      author_id: createResp.body.author_id,
      num_imgs: '2',
      public_id: 'test public id is updated',
      hide: false,
      sold: true,
      selling_link: 'http://www.updated-website.com',
      originalPrice: '150',
      discountedPrice: null,
      isDeleted: false,
      deletedAt: null,
    });

    // The response is built from RETURNING *, so re-read to prove it was committed
    const readResp = await agent.get(`/api/v1/admin/${postId}`);
    expect(readResp.status).toBe(200);
    expect(readResp.body).toMatchObject({
      title: 'test title is updated',
      price: '150',
      sold: true,
      hide: false,
      selling_link: 'http://www.updated-website.com',
    });
  });

  it('PUT /api/v1/admin/:id returns 403 for a post that does not exist', async () => {
    const [agent] = await registerAndLogin();

    const resp = await agent.put('/api/v1/admin/999999').send({
      id: 999999,
      post: { title: 'nope', description: 'nope', price: '1' },
    });

    expect(resp.status).toBe(403);
    expect(resp.body.message).toBe('You do not have access to this page');
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
      num_imgs: 1,
      public_id: 'test public id',
      sold: false,
      hide: false,
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
      num_imgs: expect.any(String),
      public_id: expect.any(String),
      selling_link: null,
      sold: false,
      hide: false,
      originalPrice: 'test price',
      discountedPrice: null,
      isDeleted: false,
      deletedAt: null,
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

  // Test setup
  const mockMulter = {
    array: jest.fn(),
  };

  jest.mock('multer', () => {
    return jest.fn().mockImplementation(() => mockMulter);
  });

  it('POST /admin/upload should upload a file/ files and return a 200 status code', async () => {
    const fakeImage1 = Buffer.from('fake-image-content-1');
    const fakeImage2 = Buffer.from('fake-image-content-2');
    const [agent] = await registerAndLogin();

    const formData = new FormData();

    formData.append('imageFiles', fakeImage1, 'test-image-1.jpg');
    formData.append('imageFiles', fakeImage2, 'test-image-2.jpg');

    mockMulter.array.mockImplementation((fieldName) => (req, res, next) => {
      req.files = [
        {
          fieldname: fieldName,
          originalname: 'test-image-1.jpg',
          filename: 'public_id_1',
          path: 'secure_url_1',
        },
        {
          fieldname: fieldName,
          originalname: 'test-image-2.jpg',
          filename: 'public_id_2',
          path: 'secure_url_2',
        },
      ];
      next();
    });

    const response = await agent
      .post('/api/v1/admin/upload')
      .set('Content-Type', `multipart/form-data; boundary=${formData.getBoundary()}`)
      .send(formData.getBuffer());
    expect(response.statusCode).toBe(200);
  });

  it('POST /admin/images should store public_id and url in the database', async () => {
    const [agent] = await registerAndLogin();
    const id = '1';
    const image_public_ids = '["test-public-id", "test-public-id-2"]';
    const image_urls = '["test-url", "test-url-2"]';
    const response = await agent
      .post('/api/v1/admin/images')
      .send({ id, image_urls, image_public_ids });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      {
        id: expect.any(Number),
        image_url: expect.any(String),
        public_id: expect.any(String),
      },
      {
        id: expect.any(Number),
        image_url: expect.any(String),
        public_id: expect.any(String),
      },
    ]);
  });

  it('DELETE /api/v1/admin/image/:id should delete an image from database', async () => {
    const [agent] = await registerAndLogin();
    const id = 1;
    const image_public_ids = '["test-public-id", "test-public-id-2"]';
    const image_urls = '["test-url", "test-url-2"]';
    const response = await agent
      .post('/api/v1/admin/images')
      .send({ id, image_urls, image_public_ids });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      {
        id: 4,
        image_url: 'test-url',
        public_id: 'test-public-id',
      },
      {
        id: 5,
        image_url: 'test-url-2',
        public_id: 'test-public-id-2',
      },
    ]);

    const publicimgToDelete = response.body[0].public_id;
    const deleteResp = await agent.delete(`/api/v1/admin/image/${id}`).send({
      public_id: publicimgToDelete,
    });
    expect(deleteResp.body).toMatchInlineSnapshot(`
      {
        "id": 4,
        "image_url": "test-url",
        "public_id": "test-public-id",
      }
    `);

    expect(deleteResp.status).toBe(200);
    const remainingImage = await agent.get(`/api/v1/admin/urls/${id}`);
    expect(remainingImage.body).toMatchInlineSnapshot(`
      [
        {
          "id": 1,
          "image_url": "image_url.com",
          "post_id": 1,
          "public_id": "public_id_1",
        },
        {
          "id": 2,
          "image_url": "image_url.com2",
          "post_id": 1,
          "public_id": "public_id_2",
        },
        {
          "id": 3,
          "image_url": "image_url.com3",
          "post_id": 1,
          "public_id": "public_id_3",
        },
        {
          "id": 5,
          "image_url": "test-url-2",
          "post_id": 1,
          "public_id": "test-public-id-2",
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
        author_id: '1',
        category: 'Test 1',
        created_at: expect.any(String),
        description: 'Test 1',
        fallbackImageUrl: 'image_url.com',
        hide: false,
        id: '1',
        image_url: 'Test 1',
        num_imgs: '1',
        price: 'Test 1',
        public_id: 'Test 1',
        title: 'Test 1',
        sold: false,
        selling_link: null,
        originalPrice: null,
        discountedPrice: null,
      },
      {
        author_id: '1',
        category: 'Test 2',
        created_at: expect.any(String),
        description: 'Test 2',
        fallbackImageUrl: null,
        hide: false,
        id: '2',
        image_url: 'Test 2',
        num_imgs: '1',
        price: 'Test 2',
        public_id: 'Test 2',
        title: 'Test 2',
        sold: false,
        selling_link: null,
        originalPrice: null,
        discountedPrice: null,
      },
      {
        author_id: '1',
        category: 'Test 3',
        created_at: expect.any(String),
        description: 'Test 3',
        fallbackImageUrl: null,
        hide: false,
        id: '3',
        image_url: 'Test 3',
        num_imgs: '1',
        price: 'Test 3',
        public_id: 'Test 3',
        title: 'Test 3',
        sold: false,
        selling_link: null,
        originalPrice: null,
        discountedPrice: null,
      },
    ]);
  });

  it('GET /api/v1/main-gallery/:id should return a single post', async () => {
    const data = await request(app).get('/api/v1/main-gallery/1');
    expect(data.status).toBe(200);
    expect(data.body).toEqual({
      author_id: '1',
      category: 'Test 1',
      created_at: expect.any(String),
      description: 'Test 1',
      id: '1',
      image_url: 'Test 1',
      num_imgs: '1',
      price: 'Test 1',
      public_id: 'Test 1',
      title: 'Test 1',
      hide: false,
      selling_link: null,
      sold: false,
      originalPrice: null,
      discountedPrice: null,
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

  it('GET should return matching gallery posts', async () => {
    const searchTerm = 'Test 1';
    const response = await request(app)
      .get(`/api/v1/main-gallery/search/${searchTerm}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining(searchTerm),
        }),
      ]),
    );
  });

  it('PUT /api/v1/admin/swap/:id swaps auction to gallery post and transfers images', async () => {
    const [agent, user] = await registerAndLogin();

    // Create auction with multiple images and public IDs
    const Auction = require('../lib/models/Auction');
    const auction = await Auction.insert({
      title: 'Swap Auction',
      description: 'Auction to swap',
      imageUrls: [
        'http://www.big-cloud.com/img1.jpg',
        'http://www.big-cloud.com/img2.jpg',
        'http://www.big-cloud.com/img3.jpg',
      ],
      startPrice: 100,
      buyNowPrice: 200,
      currentBid: 100,
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      isActive: true,
      creatorId: user.id,
    });

    // Add auction_results for deletion coverage
    await pool.query(
      `INSERT INTO auction_results (auction_id, winner_id, final_bid, closed_reason)
       VALUES ($1, $2, $3, $4)`,
      [auction.id, user.id, 150, 'expired'],
    );

    // Swap auction to gallery post
    const swapRes = await agent.put(`/api/v1/admin/swap/${auction.id}`).send({ type: 'auction' });

    expect(swapRes.status).toBe(200);
    expect(swapRes.body.message).toBe('Auction swapped to gallery post');
    expect(swapRes.body.post).toBeTruthy();
    expect(swapRes.body.post.title).toBe('Swap Auction');

    // Confirm auction is deleted
    const deletedAuction = await Auction.getById(auction.id);
    expect(deletedAuction).toBeNull();

    // Confirm gallery post exists
    const Post = require('../lib/models/Post');
    const galleryPost = await Post.getById(swapRes.body.post.id);
    expect(galleryPost).toBeTruthy();
    expect(galleryPost.title).toBe('Swap Auction');
    expect(galleryPost.price).toBe('200');
    // Confirm images transferred to gallery_imgs
    const imgs = await Post.getAdditionalImages(galleryPost.id);
    expect(imgs.length).toBe(3);
    expect(imgs.map((i) => i.image_url)).toEqual([
      'http://www.big-cloud.com/img1.jpg',
      'http://www.big-cloud.com/img2.jpg',
      'http://www.big-cloud.com/img3.jpg',
    ]);
    expect(imgs.map((i) => i.public_id)).toEqual(['img1.jpg', 'img2.jpg', 'img3.jpg']);
  });
  it('PUT /api/v1/admin/:id/tracking should update tracking number and send email (success)', async () => {
    const [agent, user] = await registerAndLogin();
    const Post = require('../lib/models/Post');
    const SalesOrder = require('../lib/models/SalesOrder');
    const post = await Post.postNewPost(
      'Tracking Test',
      'desc',
      'img.jpg',
      'cat',
      '100',
      user.id,
      'public_id',
      1,
      null,
      '100',
      false,
      null,
      false,
    );
    const order = await SalesOrder.createOrder({
      buyerId: user.id,
      items: [{ postId: post.id, price: '100' }],
      shippingCost: 0,
      tracking: null,
    });
    const trackingNumber = 'TRACK123';
    const resp = await agent.put(`/api/v1/admin/${order.id}/tracking`).send({ trackingNumber });
    expect(resp.status).toBe(200);
    expect(resp.body.tracking_number).toBe(trackingNumber);
    const { sendTrackingEmail } = require('../lib/utils/mailer');
    expect(sendTrackingEmail).toHaveBeenCalledWith('post', expect.any(String), trackingNumber);
  });

  it('PUT /api/v1/admin/:id/tracking should return 400 if trackingNumber is missing or not a string', async () => {
    const [agent, user] = await registerAndLogin();
    const Post = require('../lib/models/Post');
    const SalesOrder = require('../lib/models/SalesOrder');
    const post = await Post.postNewPost(
      'Tracking Test',
      'desc',
      'img.jpg',
      'cat',
      '100',
      user.id,
      'public_id',
      1,
      null,
      '100',
      false,
      null,
      false,
    );
    const order = await SalesOrder.createOrder({
      buyerId: user.id,
      items: [{ postId: post.id, price: '100' }],
      shippingCost: 0,
      tracking: null,
    });
    const resp1 = await agent.put(`/api/v1/admin/${order.id}/tracking`).send({});
    expect(resp1.status).toBe(400);
    expect(resp1.body).toEqual({ error: 'trackingNumber must be a string' });
    const resp2 = await agent
      .put(`/api/v1/admin/${order.id}/tracking`)
      .send({ trackingNumber: 123 });
    expect(resp2.status).toBe(400);
    expect(resp2.body).toEqual({ error: 'trackingNumber must be a string' });
  });
});
