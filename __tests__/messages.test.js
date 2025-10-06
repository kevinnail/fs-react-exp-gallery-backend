const pool = require('../lib/utils/pool');
const setup = require('../data/setup');
const request = require('supertest');
const app = require('../lib/app');
const UserService = require('../lib/services/UserService');
const Message = require('../lib/models/Message');

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
  const user = await UserService.create(userToUse);
  const { email } = user;
  await agent.post('/api/v1/users/sessions').send({ email, password });
  return [agent, user];
};

describe('Message routes', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('POST /api/v1/messages', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/messages').send({
        messageContent: 'Hello, this is a test message',
      });
      expect(res.status).toBe(401);
    });

    it('should create a new message when authenticated', async () => {
      const [agent, user] = await registerAndLogin();

      const res = await agent.post('/api/v1/messages').send({
        messageContent: 'Hello, this is a test message',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        conversationId: expect.any(String),
        userId: user.id,
        messageContent: 'Hello, this is a test message',
        sentAt: expect.any(String),
        isRead: false,
        isFromAdmin: false,
      });
    });

    it('should return 400 when messageContent is missing', async () => {
      const [agent] = await registerAndLogin();

      const res = await agent.post('/api/v1/messages').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Message content is required',
      });
    });

    it('should return 400 when messageContent is empty', async () => {
      const [agent] = await registerAndLogin();

      const res = await agent.post('/api/v1/messages').send({
        messageContent: '',
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Message content is required',
      });
    });
  });

  describe('GET /api/v1/messages/my-messages', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/messages/my-messages');
      expect(res.status).toBe(401);
    });

    it('should return empty array when user has no messages', async () => {
      const [agent] = await registerAndLogin();

      const res = await agent.get('/api/v1/messages/my-messages');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return user messages when they exist', async () => {
      const [agent, user] = await registerAndLogin();

      // Create a message
      await agent.post('/api/v1/messages').send({
        messageContent: 'First message',
      });

      const res = await agent.get('/api/v1/messages/my-messages');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual({
        id: expect.any(String),
        conversationId: expect.any(String),
        userId: user.id,
        messageContent: 'First message',
        sentAt: expect.any(String),
        isRead: false,
        isFromAdmin: false,
      });
    });
  });

  describe('POST /api/v1/messages/conversations/:conversationId/reply', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).post('/api/v1/messages/conversations/1/reply').send({
        messageContent: 'This is a reply',
      });
      expect(res.status).toBe(401);
    });

    it('should create a reply to an existing conversation', async () => {
      const [agent, user] = await registerAndLogin();

      // Create initial message to get conversation ID
      const initialRes = await agent.post('/api/v1/messages').send({
        messageContent: 'Initial message',
      });

      const conversationId = initialRes.body.conversationId;

      const res = await agent.post(`/api/v1/messages/conversations/${conversationId}/reply`).send({
        messageContent: 'This is a reply',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        conversationId,
        userId: user.id,
        messageContent: 'This is a reply',
        sentAt: expect.any(String),
        isRead: false,
        isFromAdmin: false,
      });
    });

    it('should return 400 when messageContent is missing', async () => {
      const [agent] = await registerAndLogin();

      const res = await agent.post('/api/v1/messages/conversations/1/reply').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Message content is required',
      });
    });
  });

  describe('GET /api/v1/messages/conversations', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/messages/conversations');
      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      const [agent] = await registerAndLogin({ email: 'regular@example.com' });

      const res = await agent.get('/api/v1/messages/conversations');

      expect(res.status).toBe(403);
    });

    it('should return conversations when user is admin', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      const res = await agent.get('/api/v1/messages/conversations');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/messages/conversations/:conversationId', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/messages/conversations/1');
      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      const [agent] = await registerAndLogin({ email: 'regular@example.com' });

      const res = await agent.get('/api/v1/messages/conversations/1');

      expect(res.status).toBe(403);
    });

    it('should return conversation messages when user is admin', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      const res = await agent.get('/api/v1/messages/conversations/1');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/messages', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/messages');
      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      const [agent] = await registerAndLogin({ email: 'regular@example.com' });

      const res = await agent.get('/api/v1/messages');

      expect(res.status).toBe(403);
    });

    it('should return all messages when user is admin', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      const res = await agent.get('/api/v1/messages');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PATCH /api/v1/messages/:id/read', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).patch('/api/v1/messages/1/read');
      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      const [agent] = await registerAndLogin({ email: 'regular@example.com' });

      const res = await agent.patch('/api/v1/messages/1/read');

      expect(res.status).toBe(403);
    });

    it('should mark message as read when user is admin', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      // First create a message to mark as read
      const messageRes = await agent.post('/api/v1/messages').send({
        messageContent: 'Test message to mark as read',
      });

      const messageId = messageRes.body.id;

      const res = await agent.patch(`/api/v1/messages/${messageId}/read`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: messageId,
        conversationId: expect.any(String),
        userId: expect.any(String),
        messageContent: 'Test message to mark as read',
        sentAt: expect.any(String),
        isRead: true,
        isFromAdmin: false,
      });
    });

    it('should return 400 when invalid ID is provided', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      const res = await agent.patch('/api/v1/messages/invalid-id/read');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Invalid id: must be a number',
      });
    });
  });

  describe('DELETE /api/v1/messages/:id', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app).delete('/api/v1/messages/1');
      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not admin', async () => {
      const [agent] = await registerAndLogin({ email: 'regular@example.com' });

      const res = await agent.delete('/api/v1/messages/1');

      expect(res.status).toBe(403);
    });

    it('should delete message when user is admin', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      // First create a message to delete
      const messageRes = await agent.post('/api/v1/messages').send({
        messageContent: 'Test message to delete',
      });

      const messageId = messageRes.body.id;

      const res = await agent.delete(`/api/v1/messages/${messageId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: messageId,
        conversationId: expect.any(String),
        userId: expect.any(String),
        messageContent: 'Test message to delete',
        sentAt: expect.any(String),
        isRead: false,
        isFromAdmin: false,
      });
    });

    it('should return 400 when invalid ID is provided', async () => {
      const [agent] = await registerAndLogin({ email: 'admin' });

      const res = await agent.delete('/api/v1/messages/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Invalid id: must be a number',
      });
    });
  });
});

describe('Message model', () => {
  beforeEach(() => {
    return setup(pool);
  });

  describe('Message.insert', () => {
    it('should insert a new message', async () => {
      const user = await UserService.create(mockUser);

      const message = await Message.insert({
        userId: user.id,
        messageContent: 'Test message content',
      });

      expect(message).toEqual({
        id: expect.any(String),
        conversationId: expect.any(String),
        userId: user.id,
        messageContent: 'Test message content',
        sentAt: expect.any(Date),
        isRead: false,
        isFromAdmin: false,
      });
    });

    it('should insert a message with conversation ID', async () => {
      const user = await UserService.create(mockUser);

      const message = await Message.insert({
        userId: user.id,
        messageContent: 'Test message content',
        conversationId: 123,
        isFromAdmin: true,
      });

      expect(message).toEqual({
        id: expect.any(String),
        conversationId: '123',
        userId: user.id,
        messageContent: 'Test message content',
        sentAt: expect.any(Date),
        isRead: false,
        isFromAdmin: true,
      });
    });
  });

  describe('Message.getAll', () => {
    it('should return all messages with user email', async () => {
      const user = await UserService.create(mockUser);
      await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const messages = await Message.getAll();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        id: expect.any(String),
        conversationId: expect.any(String),
        userId: user.id,
        messageContent: 'Test message',
        sentAt: expect.any(Date),
        isRead: false,
        isFromAdmin: false,
        userEmail: user.email,
      });
    });
  });

  describe('Message.getConversations', () => {
    it('should return conversations with metadata', async () => {
      const user = await UserService.create(mockUser);
      await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const conversations = await Message.getConversations();

      expect(conversations).toHaveLength(1);
      expect(conversations[0]).toEqual({
        conversation_id: expect.any(String),
        user_id: user.id,
        email: user.email,
        last_message_at: expect.any(Date),
        message_count: '1',
        unread_count: '1',
      });
    });
  });

  describe('Message.getConversationById', () => {
    it('should return messages for specific conversation', async () => {
      const user = await UserService.create(mockUser);
      const message = await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const conversationMessages = await Message.getConversationById(message.conversationId);

      expect(conversationMessages).toHaveLength(1);
      expect(conversationMessages[0]).toEqual({
        id: expect.any(String),
        conversationId: message.conversationId,
        userId: user.id,
        messageContent: 'Test message',
        sentAt: expect.any(Date),
        isRead: false,
        isFromAdmin: false,
        userEmail: user.email,
      });
    });
  });

  describe('Message.getByUserId', () => {
    it('should return messages for specific user', async () => {
      const user = await UserService.create(mockUser);
      await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const userMessages = await Message.getByUserId(user.id);

      expect(userMessages).toHaveLength(1);
      expect(userMessages[0]).toEqual({
        id: expect.any(String),
        conversationId: expect.any(String),
        userId: user.id,
        messageContent: 'Test message',
        sentAt: expect.any(Date),
        isRead: false,
        isFromAdmin: false,
      });
    });
  });

  describe('Message.getById', () => {
    it('should return specific message by ID', async () => {
      const user = await UserService.create(mockUser);
      const message = await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const foundMessage = await Message.getById(message.id);

      expect(foundMessage).toEqual(message);
    });

    it('should throw error when message not found', async () => {
      await expect(Message.getById(999999)).rejects.toThrow('Message not found');
    });

    it('should throw error when invalid ID type is provided', async () => {
      await expect(Message.getById('invalid-id')).rejects.toThrow(
        'invalid input syntax for type bigint: "invalid-id"',
      );
    });
  });

  describe('Message.markAsRead', () => {
    it('should mark message as read', async () => {
      const user = await UserService.create(mockUser);
      const message = await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const updatedMessage = await Message.markAsRead(message.id);

      expect(updatedMessage).toEqual({
        id: message.id,
        conversationId: message.conversationId,
        userId: user.id,
        messageContent: 'Test message',
        sentAt: expect.any(Date),
        isRead: true,
        isFromAdmin: false,
      });
    });

    it('should throw error when invalid ID type is provided', async () => {
      await expect(Message.markAsRead('invalid-id')).rejects.toThrow(
        'invalid input syntax for type bigint: "invalid-id"',
      );
    });
  });

  describe('Message.delete', () => {
    it('should delete message', async () => {
      const user = await UserService.create(mockUser);
      const message = await Message.insert({
        userId: user.id,
        messageContent: 'Test message',
      });

      const deletedMessage = await Message.delete(message.id);

      expect(deletedMessage).toEqual({
        id: message.id,
        conversationId: message.conversationId,
        userId: user.id,
        messageContent: 'Test message',
        sentAt: expect.any(Date),
        isRead: false,
        isFromAdmin: false,
      });
    });

    it('should throw error when invalid ID type is provided', async () => {
      await expect(Message.delete('invalid-id')).rejects.toThrow(
        'invalid input syntax for type bigint: "invalid-id"',
      );
    });
  });
});

// Clean up pool after all tests are done
afterAll(() => {
  jest.clearAllMocks();
  pool.end();
});
