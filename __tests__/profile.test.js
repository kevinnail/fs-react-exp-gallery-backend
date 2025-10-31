const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Profile = require('../lib/models/Profile');

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
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: '12345',
};

const registerAndLogin = async (userProps = {}) => {
  const userToUse = { ...mockUser, ...userProps };
  const password = userToUse.password;

  const agent = request.agent(app);
  const { user } = await UserService.create(userToUse);
  const { email } = user;
  await agent.post('/api/v1/users/sessions').send({ email, password });
  return [agent, user];
};

describe('Profile routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('GET /api/v1/profile', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/profile');
      expect(res.status).toBe(401);
    });

    it('should return null when user has no profile', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.get('/api/v1/profile');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('should return user profile when authenticated and profile exists', async () => {
      const [agent, user] = await registerAndLogin();
      await agent.put('/api/v1/profile').send({
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
      });

      const resGet = await agent.get('/api/v1/profile');
      expect(resGet.status).toBe(200);
      expect(resGet.body).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        showWelcome: expect.any(Boolean),
      });
    });
  });

  describe('PUT /api/v1/profile', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).put('/api/v1/profile').send({
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(res.status).toBe(401);
    });

    it('should create new profile when user has no profile', async () => {
      const [agent, user] = await registerAndLogin();

      const res = await agent.put('/api/v1/profile').send({
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),

        showWelcome: expect.any(Boolean),
      });
    });

    it('should update existing profile', async () => {
      const [agent, user] = await registerAndLogin();

      // Create initial profile
      await Profile.insert({
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/old-image.jpg',
      });

      const res = await agent.put('/api/v1/profile').send({
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),

        showWelcome: expect.any(Boolean),
      });
    });
  });

  describe('POST /api/v1/profile/upload', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/profile/upload');
      expect(res.status).toBe(401);
    });

    it('should upload files and return results', async () => {
      const [agent] = await registerAndLogin();

      const fakeImage = Buffer.from('fake-image-content');
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('imageFiles', fakeImage, 'test-image.jpg');

      const res = await agent
        .post('/api/v1/profile/upload')
        .set('Content-Type', `multipart/form-data; boundary=${formData.getBoundary()}`)
        .send(formData.getBuffer());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          public_id: expect.any(String),
          secure_url: expect.any(String),
          format: 'jpeg',
          original_filename: 'test-image.jpg',
        },
      ]);
    });
  });

  describe('POST /api/v1/profile/images', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/profile/images').send({
        image_url: 'https://example.com/image.jpg',
      });
      expect(res.status).toBe(401);
    });

    it('should update profile with new image URL', async () => {
      const [agent, user] = await registerAndLogin();

      const res = await agent.post('/api/v1/profile/images').send({
        image_url: 'https://example.com/new-image.jpg',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/new-image.jpg',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        showWelcome: expect.any(Boolean),
      });
    });

    it('should update existing profile with new image URL', async () => {
      const [agent, user] = await registerAndLogin();

      // Create initial profile
      await Profile.insert({
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/old-image.jpg',
      });

      const res = await agent.post('/api/v1/profile/images').send({
        image_url: 'https://example.com/new-image.jpg',
        firstName: 'Jane',
        lastName: 'Smith',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        showWelcome: expect.any(Boolean),
      });
    });
  });

  describe('POST /api/v1/profile/delete', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/profile/delete').send({
        public_id: 'test-public-id',
      });
      expect(res.status).toBe(401);
    });

    it('should delete image from S3', async () => {
      const [agent] = await registerAndLogin();

      const res = await agent.post('/api/v1/profile/delete').send({
        public_id: 'test-public-id',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Image deleted successfully',
      });
    });

    it('should return 400 when public_id is missing', async () => {
      const [agent] = await registerAndLogin();

      const res = await agent.post('/api/v1/profile/delete').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Public ID is required',
      });
    });
  });
});

describe('Profile model', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('Profile.insert', () => {
    it('should insert a new profile', async () => {
      const { user } = await UserService.create(mockUser);

      const profile = await Profile.insert({
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
      });

      expect(profile).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),

        showWelcome: expect.any(Boolean),
      });
    });
  });

  describe('Profile.getByUserId', () => {
    it('should return null when profile does not exist', async () => {
      const { user } = await UserService.create(mockUser);
      const profile = await Profile.getByUserId(user.id);
      expect(profile).toBeNull();
    });

    it('should return profile when it exists', async () => {
      const { user } = await UserService.create(mockUser);
      const insertedProfile = await Profile.insert({
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
      });

      const profile = await Profile.getByUserId(user.id);
      expect(profile).toEqual(insertedProfile);
    });
  });

  describe('Profile.updateByUserId', () => {
    it('should update existing profile', async () => {
      const { user } = await UserService.create(mockUser);
      await Profile.insert({
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/old-image.jpg',
      });

      const updatedProfile = await Profile.updateByUserId(user.id, {
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
      });

      expect(updatedProfile).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        showWelcome: expect.any(Boolean),
      });
    });

    it('should throw error when profile does not exist', async () => {
      const { user } = await UserService.create(mockUser);

      await expect(
        Profile.updateByUserId(user.id, {
          firstName: 'Jane',
          lastName: 'Smith',
          imageUrl: 'https://example.com/image.jpg',
        }),
      ).rejects.toThrow('Profile not found');
    });
  });

  describe('Profile.upsertByUserId', () => {
    it('should insert new profile when none exists', async () => {
      const { user } = await UserService.create(mockUser);

      const profile = await Profile.upsertByUserId(user.id, {
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
      });

      expect(profile).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/image.jpg',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        showWelcome: expect.any(Boolean),
      });
    });

    it('should update existing profile when one exists', async () => {
      const { user } = await UserService.create(mockUser);
      await Profile.insert({
        userId: user.id,
        firstName: 'John',
        lastName: 'Doe',
        imageUrl: 'https://example.com/old-image.jpg',
      });

      const updatedProfile = await Profile.upsertByUserId(user.id, {
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
      });

      expect(updatedProfile).toEqual({
        id: expect.any(String),
        userId: user.id,
        firstName: 'Jane',
        lastName: 'Smith',
        imageUrl: 'https://example.com/new-image.jpg',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        showWelcome: expect.any(Boolean),
      });
    });
  });
});

// Clean up pool after all tests are done
afterAll(() => {
  jest.clearAllMocks();
  pool.end();
});
