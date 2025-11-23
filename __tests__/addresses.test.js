const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Address = require('../lib/models/Address');

const mockUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: '12345',
};

const mockAddress = {
  addressLine1: '123 Main St',
  addressLine2: 'Apt 4B',
  city: 'Portland',
  state: 'OR',
  postalCode: '97201',
  countryCode: 'US',
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

describe('Address routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('GET /api/v1/profile/addresses', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/profile/addresses');
      expect(res.status).toBe(401);
    });

    it('should return empty array when user has no addresses', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.get('/api/v1/profile/addresses');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return all user addresses', async () => {
      const [agent, user] = await registerAndLogin();

      await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      await Address.insert({
        userId: user.id,
        addressLine1: '456 Oak Ave',
        addressLine2: null,
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        countryCode: 'US',
      });

      const res = await agent.get('/api/v1/profile/addresses');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('POST /api/v1/profile/addresses', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/profile/addresses').send(mockAddress);
      expect(res.status).toBe(401);
    });

    it('should create new address', async () => {
      const [agent, user] = await registerAndLogin();

      const res = await agent.post('/api/v1/profile/addresses').send(mockAddress);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        userId: user.id,
        addressLine1: '123 Main St',
        addressLine2: 'Apt 4B',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
        countryCode: 'US',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });
  });

  describe('PATCH /api/v1/profile/addresses/:id', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).patch('/api/v1/profile/addresses/1').send(mockAddress);
      expect(res.status).toBe(401);
    });

    it('should return 404 when address does not exist', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.patch('/api/v1/profile/addresses/99999').send(mockAddress);
      expect(res.status).toBe(404);
    });

    it('should return 403 when trying to update another users address', async () => {
      const [agent1] = await registerAndLogin();
      const [, user2] = await registerAndLogin({ email: 'other@example.com' });

      const address = await Address.insert({
        userId: user2.id,
        ...mockAddress,
      });

      const res = await agent1
        .patch(\`/api/v1/profile/addresses/\${address.id}\`)
        .send({ ...mockAddress, city: 'Hacked' });

      expect(res.status).toBe(403);
    });

    it('should update address', async () => {
      const [agent, user] = await registerAndLogin();

      const address = await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const res = await agent.patch(\`/api/v1/profile/addresses/\${address.id}\`).send({
        ...mockAddress,
        city: 'Eugene',
        postalCode: '97401',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: address.id,
        city: 'Eugene',
        postalCode: '97401',
      });
    });
  });

  describe('DELETE /api/v1/profile/addresses/:id', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).delete('/api/v1/profile/addresses/1');
      expect(res.status).toBe(401);
    });

    it('should return 404 when address does not exist', async () => {
      const [agent] = await registerAndLogin();
      const res = await agent.delete('/api/v1/profile/addresses/99999');
      expect(res.status).toBe(404);
    });

    it('should return 403 when trying to delete another users address', async () => {
      const [agent1] = await registerAndLogin();
      const [, user2] = await registerAndLogin({ email: 'other@example.com' });

      const address = await Address.insert({
        userId: user2.id,
        ...mockAddress,
      });

      const res = await agent1.delete(\`/api/v1/profile/addresses/\${address.id}\`);
      expect(res.status).toBe(403);
    });

    it('should delete address', async () => {
      const [agent, user] = await registerAndLogin();

      const address = await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const res = await agent.delete(\`/api/v1/profile/addresses/\${address.id}\`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: address.id,
        city: 'Portland',
      });

      const deletedAddress = await Address.getById(address.id);
      expect(deletedAddress).toBeNull();
    });
  });
});

describe('Address model', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('Address.insert', () => {
    it('should insert a new address', async () => {
      const { user } = await UserService.create(mockUser);

      const address = await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      expect(address).toMatchObject({
        id: expect.any(String),
        userId: user.id,
        addressLine1: '123 Main St',
        addressLine2: 'Apt 4B',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
        countryCode: 'US',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should default countryCode to US when not provided', async () => {
      const { user } = await UserService.create(mockUser);

      const address = await Address.insert({
        userId: user.id,
        addressLine1: '123 Main St',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
      });

      expect(address.countryCode).toBe('US');
    });
  });

  describe('Address.getById', () => {
    it('should return null when address does not exist', async () => {
      const address = await Address.getById('99999');
      expect(address).toBeNull();
    });

    it('should return address when it exists', async () => {
      const { user } = await UserService.create(mockUser);
      const insertedAddress = await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const address = await Address.getById(insertedAddress.id);
      expect(address).toMatchObject({
        id: insertedAddress.id,
        city: 'Portland',
      });
    });
  });

  describe('Address.getByUserId', () => {
    it('should return empty array when user has no addresses', async () => {
      const { user } = await UserService.create(mockUser);
      const addresses = await Address.getByUserId(user.id);
      expect(addresses).toEqual([]);
    });

    it('should return all user addresses', async () => {
      const { user } = await UserService.create(mockUser);

      await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      await Address.insert({
        userId: user.id,
        addressLine1: '456 Oak Ave',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        countryCode: 'US',
      });

      const addresses = await Address.getByUserId(user.id);
      expect(addresses).toHaveLength(2);
    });
  });

  describe('Address.updateById', () => {
    it('should update address', async () => {
      const { user } = await UserService.create(mockUser);
      const address = await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const updated = await Address.updateById(address.id, {
        ...mockAddress,
        city: 'Eugene',
        postalCode: '97401',
      });

      expect(updated).toMatchObject({
        id: address.id,
        city: 'Eugene',
        postalCode: '97401',
      });
    });

    it('should throw error when address does not exist', async () => {
      await expect(Address.updateById('99999', mockAddress)).rejects.toThrow('Address not found');
    });
  });

  describe('Address.upsertByUserId', () => {
    it('should insert new address when none exists', async () => {
      const { user } = await UserService.create(mockUser);

      const address = await Address.upsertByUserId(user.id, mockAddress);

      expect(address).toMatchObject({
        id: expect.any(String),
        userId: user.id,
        city: 'Portland',
      });
    });

    it('should update existing address when one exists', async () => {
      const { user } = await UserService.create(mockUser);
      
      await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const updated = await Address.upsertByUserId(user.id, {
        ...mockAddress,
        city: 'Eugene',
      });

      expect(updated.city).toBe('Eugene');

      const addresses = await Address.getByUserId(user.id);
      expect(addresses).toHaveLength(1);
    });
  });

  describe('Address.deleteById', () => {
    it('should delete address', async () => {
      const { user } = await UserService.create(mockUser);
      const address = await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const deleted = await Address.deleteById(address.id);
      expect(deleted).toMatchObject({
        id: address.id,
        city: 'Portland',
      });

      const check = await Address.getById(address.id);
      expect(check).toBeNull();
    });

    it('should throw error when address does not exist', async () => {
      await expect(Address.deleteById('99999')).rejects.toThrow('Address not found');
    });
  });
});

afterAll(() => {
  pool.end();
});
