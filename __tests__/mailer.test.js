// Ensure nodemailer is mocked and the mock implementation is set before importing mailer
jest.mock('nodemailer');
const nodemailer = require('nodemailer');
const sendMailMock = jest.fn().mockResolvedValue();
nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });
const mailer = require('../lib/utils/mailer');
const fs = require('fs');
const jwt = require('jsonwebtoken');

describe('mailer', () => {
  // sendMailMock is now defined above and reused for all tests
  let readFileSyncMock;
  let jwtVerifyMock;
  let envBackup;

  beforeAll(() => {
    envBackup = { ...process.env };
  });
  afterAll(() => {
    process.env = envBackup;
  });
  beforeEach(() => {
    sendMailMock.mockClear();
    readFileSyncMock = jest.spyOn(fs, 'readFileSync');
    jwtVerifyMock = jest.spyOn(jwt, 'verify');
    process.env.MAIL_FROM = 'from@example.com';
    process.env.MAIL_USER = 'user';
    process.env.MAIL_PASS = 'pass';
    process.env.MAIL_HOST = 'smtp.example.com';
    process.env.MAIL_PORT = '587';
    process.env.BACKEND_URL = 'http://localhost:3000';
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.EMAIL_VERIFY_SECRET = 'secret';
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with correct template and subject', async () => {
      jwtVerifyMock.mockReturnValue({ userId: 123 });
      readFileSyncMock.mockReturnValue('<html>{{verifyUrl}}</html>');
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await mailer.sendVerificationEmail('to@example.com', 'token');
      expect(jwtVerifyMock).toHaveBeenCalledWith('token', 'secret');
      expect(readFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('verifyEmail.html'),
        'utf8',
      );
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'to@example.com',
          subject: 'Verify your email address',
          html: expect.stringContaining('verify'),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Verification email sent to: to@example.com'),
      );
      logSpy.mockRestore();
    });
    it('should throw if token is invalid', async () => {
      jwtVerifyMock.mockImplementation(() => {
        throw new Error('bad token');
      });
      await expect(mailer.sendVerificationEmail('to@example.com', 'badtoken')).rejects.toThrow(
        'bad token',
      );
    });
    it('should throw if template file is missing', async () => {
      jwtVerifyMock.mockReturnValue({ userId: 123 });
      readFileSyncMock.mockImplementation(() => {
        throw new Error('file not found');
      });
      await expect(mailer.sendVerificationEmail('to@example.com', 'token')).rejects.toThrow(
        'file not found',
      );
    });
    it('should throw if sendMail fails', async () => {
      jwtVerifyMock.mockReturnValue({ userId: 123 });
      readFileSyncMock.mockReturnValue('<html>{{verifyUrl}}</html>');
      sendMailMock.mockRejectedValueOnce(new Error('smtp fail'));
      await expect(mailer.sendVerificationEmail('to@example.com', 'token')).rejects.toThrow(
        'smtp fail',
      );
    });
    it('should throw if MAIL_FROM is missing', async () => {
      jwtVerifyMock.mockReturnValue({ userId: 123 });
      readFileSyncMock.mockReturnValue('<html>{{verifyUrl}}</html>');
      delete process.env.MAIL_FROM;
      await expect(mailer.sendVerificationEmail('to@example.com', 'token')).rejects.toThrow();
    });
  });

  describe('sendTrackingEmail', () => {
    it('should send tracking email with correct template and subject', async () => {
      readFileSyncMock.mockReturnValue(
        '<html>{{trackingUrl}}{{trackingNumber}}{{homePageUrl}}{{instagramUrl}}</html>',
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await mailer.sendTrackingEmail('post', 'to@example.com', 'TRACK123');
      expect(readFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('trackingEmailForPost.html'),
        'utf8',
      );
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'to@example.com',
          subject: 'Your package has shipped!',
          html: expect.stringContaining('TRACK123'),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tracking info email sent to: to@example.com'),
      );
      logSpy.mockRestore();
    });

    it('should throw when required args are missing', async () => {
      await expect(mailer.sendTrackingEmail('to@example.com', 'TRACK123')).rejects.toThrow(
        'sendTrackingEmail requires (auctionOrPost, to, trackingNumber)',
      );
    });

    it('should throw if template file is missing', async () => {
      readFileSyncMock.mockImplementation(() => {
        throw new Error('file not found');
      });
      await expect(mailer.sendTrackingEmail('post', 'to@example.com', 'TRACK123')).rejects.toThrow(
        'file not found',
      );
    });
    it('should throw if sendMail fails', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      sendMailMock.mockRejectedValueOnce(new Error('smtp fail'));
      await expect(mailer.sendTrackingEmail('post', 'to@example.com', 'TRACK123')).rejects.toThrow(
        'smtp fail',
      );
    });
    it('should throw if MAIL_FROM is missing', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      delete process.env.MAIL_FROM;
      await expect(
        mailer.sendTrackingEmail('post', 'to@example.com', 'TRACK123'),
      ).rejects.toThrow();
    });
  });

  describe('sendNewAuctionEmail', () => {
    it('should send new auction email with correct template and subject', async () => {
      readFileSyncMock.mockReturnValue(
        '<html>{{title}}{{description}}{{imageUrl}}{{auctionUrl}}{{homePageUrl}}{{instagramUrl}}</html>',
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const auction = { id: 1, title: 'Test', description: 'Desc', imageUrls: ['img.jpg'] };
      await mailer.sendNewAuctionEmail({ to: 'to@example.com', auction });
      expect(readFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('newAuctionEmail.html'),
        'utf8',
      );
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'to@example.com',
          subject: expect.stringContaining('New Auction Posted'),
          html: expect.stringContaining('Test'),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auction notification email sent to: to@example.com'),
      );
      logSpy.mockRestore();
    });
    it('should handle missing auction fields', async () => {
      readFileSyncMock.mockReturnValue('<html>{{title}}{{description}}{{imageUrl}}</html>');
      const auction = { id: 1, imageUrls: [] };
      await mailer.sendNewAuctionEmail({ to: 'to@example.com', auction });
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.any(String),
        }),
      );
    });
    it('should throw if template file is missing', async () => {
      readFileSyncMock.mockImplementation(() => {
        throw new Error('file not found');
      });
      const auction = { id: 1, title: 'Test', description: 'Desc', imageUrls: ['img.jpg'] };
      await expect(mailer.sendNewAuctionEmail({ to: 'to@example.com', auction })).rejects.toThrow(
        'file not found',
      );
    });
    it('should throw if sendMail fails', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      const auction = { id: 1, title: 'Test', description: 'Desc', imageUrls: ['img.jpg'] };
      sendMailMock.mockRejectedValueOnce(new Error('smtp fail'));
      await expect(mailer.sendNewAuctionEmail({ to: 'to@example.com', auction })).rejects.toThrow(
        'smtp fail',
      );
    });
    it('should throw if MAIL_FROM is missing', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      const auction = { id: 1, title: 'Test', description: 'Desc', imageUrls: ['img.jpg'] };
      delete process.env.MAIL_FROM;
      await expect(mailer.sendNewAuctionEmail({ to: 'to@example.com', auction })).rejects.toThrow();
    });
  });

  describe('sendNewPostEmail', () => {
    it('should send new gallery post email with correct template, dynamic subject, and resolved post URL', async () => {
      readFileSyncMock.mockReturnValue(
        '<html>{{title}}{{description}}{{imageUrl}}{{postUrl}}{{homePageUrl}}{{instagramUrl}}</html>',
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const post = { id: 7, title: 'Test Piece', description: 'Desc', image_url: 'img.jpg' };
      await mailer.sendNewPostEmail({ to: 'to@example.com', post });
      expect(readFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('newPostEmail.html'),
        'utf8',
      );
      const sentArgs = sendMailMock.mock.calls[0][0];
      // subject derives from post.title, not a constant
      expect(sentArgs.subject).toBe('New Gallery Post: Test Piece');
      expect(sentArgs.to).toBe('to@example.com');
      // post data flows through and URL points at /:id (not /posts/:id)
      expect(sentArgs.html).toContain('Test Piece');
      expect(sentArgs.html).toContain('http://localhost:3001/7');
      // no unrendered placeholders leak into the email
      expect(sentArgs.html).not.toContain('{{');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Gallery post notification email sent to: to@example.com'),
      );
      logSpy.mockRestore();
    });
    it('should throw if sendMail fails', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      const post = { id: 7, title: 'Test Piece', description: 'Desc', image_url: 'img.jpg' };
      sendMailMock.mockRejectedValueOnce(new Error('smtp fail'));
      await expect(mailer.sendNewPostEmail({ to: 'to@example.com', post })).rejects.toThrow(
        'smtp fail',
      );
    });
    it('should throw if MAIL_FROM is missing', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      const post = { id: 7, title: 'Test Piece', description: 'Desc', image_url: 'img.jpg' };
      delete process.env.MAIL_FROM;
      await expect(mailer.sendNewPostEmail({ to: 'to@example.com', post })).rejects.toThrow();
    });
  });

  describe('sendMessageEmail', () => {
    it('should send message email with correct subject and content', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await mailer.sendMessageEmail({ to: 'to@example.com', message: { messageContent: 'Hello' } });
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'to@example.com',
          subject: 'You have a new message',
          html: expect.stringContaining('Hello'),
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message notification email sent to: to@example.com'),
      );
      logSpy.mockRestore();
    });
    it('should handle missing message content', async () => {
      await mailer.sendMessageEmail({ to: 'to@example.com', message: {} });
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('blockquote'),
        }),
      );
    });
    it('should throw if sendMail fails', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('smtp fail'));
      await expect(
        mailer.sendMessageEmail({ to: 'to@example.com', message: { messageContent: 'Hi' } }),
      ).rejects.toThrow('smtp fail');
    });
    it('should throw if MAIL_FROM is missing', async () => {
      delete process.env.MAIL_FROM;
      await expect(
        mailer.sendMessageEmail({ to: 'to@example.com', message: { messageContent: 'Hi' } }),
      ).rejects.toThrow();
    });
  });

  describe('sendMassEmail', () => {
    it('renders the mass-email template with subject and escaped body, newlines as <br>', async () => {
      readFileSyncMock.mockReturnValue(
        '<html>{{subject}}|{{messageBody}}|{{homePageUrl}}|{{instagramUrl}}</html>',
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await mailer.sendMassEmail({
        to: 'to@example.com',
        subject: 'Apology',
        message: 'Line one\nLine <two> & more',
      });

      expect(readFileSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('massEmail.html'),
        'utf8',
      );
      const sentArgs = sendMailMock.mock.calls[0][0];
      expect(sentArgs.to).toBe('to@example.com');
      // subject passes through verbatim as the email subject
      expect(sentArgs.subject).toBe('Apology');
      // body newline becomes <br>, and HTML in the user's text is escaped
      expect(sentArgs.html).toContain('Line one<br />Line &lt;two&gt; &amp; more');
      // raw, unescaped angle brackets from the body must not leak into the markup
      expect(sentArgs.html).not.toContain('<two>');
      // no unrendered placeholders remain
      expect(sentArgs.html).not.toContain('{{');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mass email sent to: to@example.com'),
      );
      logSpy.mockRestore();
    });

    it('should throw if sendMail fails', async () => {
      readFileSyncMock.mockReturnValue('<html>{{messageBody}}</html>');
      sendMailMock.mockRejectedValueOnce(new Error('smtp fail'));
      await expect(
        mailer.sendMassEmail({ to: 'to@example.com', subject: 'S', message: 'M' }),
      ).rejects.toThrow('smtp fail');
    });

    it('should throw if MAIL_FROM is missing', async () => {
      readFileSyncMock.mockReturnValue('<html></html>');
      delete process.env.MAIL_FROM;
      await expect(
        mailer.sendMassEmail({ to: 'to@example.com', subject: 'S', message: 'M' }),
      ).rejects.toThrow();
    });
  });
});
