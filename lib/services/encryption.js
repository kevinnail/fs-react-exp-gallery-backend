require('dotenv').config();
const crypto = require('crypto');

function encrypt(text) {
  if (text === null || text === '') {
    return null;
  }

  const secret = process.env.ENCRYPTION_KEY || '';
  // Derive a 32-byte key from the secret to support AES-256
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack as: IV (12 bytes) | AuthTag (16 bytes) | Ciphertext
  const packed = Buffer.concat([iv, authTag, ciphertext]);
  return packed.toString('base64');
}

function decrypt(ciphertext) {
  if (!ciphertext) {
    // checks for both null and empty string
    return null;
  }

  try {
    const packed = Buffer.from(String(ciphertext), 'base64');
    // Expect at least 12 (IV) + 16 (auth tag)
    if (packed.length < 28) {
      throw new Error('Ciphertext too short');
    }

    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(12, 28);
    const data = packed.subarray(28);

    const secret = process.env.ENCRYPTION_KEY || '';
    const key = crypto.createHash('sha256').update(secret).digest();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decryptedBuf = Buffer.concat([decipher.update(data), decipher.final()]);
    const decrypted = decryptedBuf.toString('utf8');
    if (decrypted === '') {
      throw new Error('Decryption resulted in an empty string');
    }
    return decrypted;
  } catch (e) {
    console.error('Error during decryption:', e.message);
    return null;
  }
}

function isEncrypted(data) {
  try {
    const result = decrypt(data);
    return typeof result === 'string' && result.length > 0;
  } catch (e) {
    console.error('NOT ENCRYPTED:', e.message);
    return false;
  }
}

module.exports = { encrypt, decrypt, isEncrypted };
