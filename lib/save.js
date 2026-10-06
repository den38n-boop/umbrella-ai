import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function saveCodec(secret) {
  const key = createHash('sha256').update(secret).digest();
  return {
    encode(sessionId, state) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(JSON.stringify({ version: 1, sessionId, state }), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
    },
    decode(sessionId, token) {
      if (typeof token !== 'string' || token.length > 800000) throw new Error('invalid_save');
      const data = Buffer.from(token, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      const saved = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
      if (saved.version !== 1 || saved.sessionId !== sessionId || !Array.isArray(saved.state?.messages)) throw new Error('invalid_save');
      return saved.state;
    }
  };
}
