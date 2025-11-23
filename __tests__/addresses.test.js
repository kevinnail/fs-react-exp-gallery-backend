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

  describe('Address.getByUserId', () => {
    it('should return empty array when user has no addresses', async () => {
      const { user } = await UserService.create(mockUser);
      const addresses = await Address.getByUserId(user.id);
      expect(addresses).toEqual([]);
    });

    it('should return user address', async () => {
      const { user } = await UserService.create(mockUser);

      await Address.insert({
        userId: user.id,
        ...mockAddress,
      });

      const addresses = await Address.getByUserId(user.id);
      expect(addresses).toHaveLength(1);
      expect(addresses[0].city).toBe('Portland');
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
});

describe('Profile with Address Integration', () => {
  beforeEach(() => {
    return setup(pool);
  });

  it('should update profile without address when no address fields provided', async () => {
    const [agent, user] = await registerAndLogin();

    const res = await agent.put('/api/v1/profile').send({
      firstName: 'Jane',
      lastName: 'Doe',
      sendEmailNotifications: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.profile.firstName).toBe('Jane');
    expect(res.body.address).toBeNull();
  });

  it('should return 400 when partial address provided', async () => {
    const [agent] = await registerAndLogin();

    const res = await agent.put('/api/v1/profile').send({
      firstName: 'Jane',
      addressLine1: '123 Main St',
      city: 'Portland',
      // Missing state and postalCode
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('complete all required address fields');
  });

  it('should create profile and address when all required address fields provided', async () => {
    const [agent, user] = await registerAndLogin();

    const res = await agent.put('/api/v1/profile').send({
      firstName: 'Jane',
      lastName: 'Doe',
      sendEmailNotifications: true,
      ...mockAddress,
    });

    expect(res.status).toBe(200);
    expect(res.body.profile.firstName).toBe('Jane');
    expect(res.body.address).toMatchObject({
      addressLine1: '123 Main St',
      city: 'Portland',
    });

    const addresses = await Address.getByUserId(user.id);
    expect(addresses).toHaveLength(1);
  });

  it('should update existing address when updating profile with new address data', async () => {
    const [agent, user] = await registerAndLogin();

    // Create initial profile with address
    await agent.put('/api/v1/profile').send({
      firstName: 'Jane',
      sendEmailNotifications: true,
      ...mockAddress,
    });

    // Update with new address
    const res = await agent.put('/api/v1/profile').send({
      firstName: 'Jane',
      addressLine1: '456 Oak Ave',
      city: 'Eugene',
      state: 'OR',
      postalCode: '97401',
      countryCode: 'US',
      sendEmailNotifications: true,
    });
    console.log('res.body', res.body);

    expect(res.status).toBe(200);
    expect(res.body.address.city).toBe('Eugene');

    const addresses = await Address.getByUserId(user.id);
    expect(addresses).toHaveLength(1);
    expect(addresses[0].city).toBe('Eugene');
  });
});

afterAll(() => {
  pool.end();
});
