// crypto.js
// Secure crypto helpers using Web Crypto API (SubtleCrypto).
// PBKDF2-SHA256 for password hashing, AES-GCM for value encryption.
// No plaintext passwords are ever stored.

const PBKDF2_ITERATIONS = 310000; // OWASP 2023 recommendation
const KEY_LENGTH = 256;
const SALT_LEN = 16;
const IV_LEN = 12;

function buf2hex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hex2buf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes.buffer;
}

function str2buf(str) {
  return new TextEncoder().encode(str).buffer;
}

function buf2str(buf) {
  return new TextDecoder().decode(buf);
}

/**
 * Derive a CryptoKey from a password and salt using PBKDF2-SHA256.
 * @param {string} password
 * @param {ArrayBuffer} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt) {
  const rawKey = await crypto.subtle.importKey(
    'raw',
    str2buf(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    rawKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Hash a password for storage (PBKDF2 + random salt).
 * Returns { hash: hex, salt: hex }
 * @param {string} password
 * @returns {Promise<{hash: string, salt: string}>}
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN)).buffer;
  const key = await deriveKey(password, salt);
  // We encrypt a known sentinel to produce a verifiable hash
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN)).buffer;
  const sentinel = str2buf('FE_MACRO_AUTH_OK');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, sentinel);
  return {
    hash: buf2hex(iv) + buf2hex(encrypted),
    salt: buf2hex(salt),
  };
}

/**
 * Verify a password against a stored hash+salt.
 * @param {string} password
 * @param {string} storedHash hex
 * @param {string} storedSalt hex
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash, storedSalt) {
  try {
    const salt = hex2buf(storedSalt);
    const key = await deriveKey(password, salt);
    const iv = hex2buf(storedHash.slice(0, IV_LEN * 2));
    const ciphertext = hex2buf(storedHash.slice(IV_LEN * 2));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return buf2str(decrypted) === 'FE_MACRO_AUTH_OK';
  } catch {
    return false;
  }
}

/**
 * Encrypt a plaintext string value using AES-GCM derived from password.
 * Returns hex string.
 * @param {string} value
 * @param {string} password
 * @param {string} saltHex
 * @returns {Promise<string>}
 */
export async function encryptValue(value, password, saltHex) {
  const salt = hex2buf(saltHex);
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN)).buffer;
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, str2buf(value));
  return buf2hex(iv) + buf2hex(encrypted);
}

/**
 * Decrypt a hex-encoded AES-GCM ciphertext.
 * @param {string} cipherHex
 * @param {string} password
 * @param {string} saltHex
 * @returns {Promise<string>}
 */
export async function decryptValue(cipherHex, password, saltHex) {
  const salt = hex2buf(saltHex);
  const key = await deriveKey(password, salt);
  const iv = hex2buf(cipherHex.slice(0, IV_LEN * 2));
  const ciphertext = hex2buf(cipherHex.slice(IV_LEN * 2));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return buf2str(decrypted);
}

/**
 * Encrypt a JSON payload (for export).
 * Returns { iv: hex, data: hex, salt: hex }
 * @param {object} payload
 * @param {string} password
 * @returns {Promise<{iv: string, data: string, salt: string}>}
 */
export async function encryptPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN)).buffer;
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN)).buffer;
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, json);
  return {
    iv: buf2hex(iv),
    data: buf2hex(encrypted),
    salt: buf2hex(salt),
    __encrypted: true,
  };
}

/**
 * Decrypt an encrypted export payload.
 * @param {{iv: string, data: string, salt: string}} envelope
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function decryptPayload(envelope, password) {
  const salt = hex2buf(envelope.salt);
  const key = await deriveKey(password, salt);
  const iv = hex2buf(envelope.iv);
  const ciphertext = hex2buf(envelope.data);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(buf2str(decrypted));
}
