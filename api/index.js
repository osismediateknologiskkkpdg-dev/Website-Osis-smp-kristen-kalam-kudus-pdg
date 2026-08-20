/**
 * =============================================================================
 * OSIS SMP Kalam Kudus Padang — Universal Serverless API
 * =============================================================================
 *
 * File ini adalah handler serverless universal yang berjalan di dua platform:
 *   1. Cloudflare Workers  (melalui `export default { fetch: handler }`)
 *   2. Vercel Serverless    (melalui `export default handler` dengan Web Standard)
 *
 * MODULE MAP
 *  01. Constants & Configuration
 *  02. Response Helpers (CORS, JSON standar, error tersentralisasi)
 *  03. JSON Data Helpers (baca file lokal + fallback GitHub + fallback kosong)
 *  04. Validation Helpers
 *  05. Authentication & OTP
 *  06. Route Handlers (users, reviews, auth, profil, admin)
 *  07. Router (routing manual berbasis URL & method)
 *  08. Global Error Wrapper & Export
 *
 * @author OSIS Media Teknologi SMP KKK Padang
 * @version 2.0.0
 */

// =============================================================================
// MODULE 01 — CONSTANTS & CONFIGURATION
// =============================================================================

const DEFAULT_AVATAR_URL =
  'https://raw.githubusercontent.com/osismediateknologiskkkpdg-dev/Image-OSIS/refs/heads/main/Untitled%20design%20(1).png';

const USER_FILE = 'User_data.json';
const REVIEW_FILE = 'Review_osis.json';

const MASTER_ADMIN_EMAIL = 'osismediateknologiskkkpdg@gmail.com';
const MASTER_ADMIN_USERNAME = 'admin osis'; // Legacy account; new usernames use the strict rule below.
const MASTER_ADMIN_DISPLAY = 'Administrator OSIS';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 60;
const BIO_MAX_LENGTH = 500;
const REVIEW_MIN_LENGTH = 5;
const REVIEW_MAX_LENGTH = 1000;
const DISPLAY_NAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AVATAR_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;

// In-memory OTP store (works per-instance; on serverless use KV/DB for production scale)
global.otpMemoryStore = global.otpMemoryStore || {};

/**
 * Kelas error khusus API yang membawa status HTTP.
 * @class
 * @extends Error
 */
class ApiError extends Error {
  /**
   * @param {number} status - Kode status HTTP.
   * @param {string} message - Pesan error yang ramah pengguna.
   */
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/**
 * Melempar ApiError dengan status dan pesan tertentu.
 * @param {number} status - Kode status HTTP.
 * @param {string} message - Pesan error.
 * @throws {ApiError}
 */
function fail(status, message) {
  throw new ApiError(status, message);
}

/**
 * Mengambil secret JWT dari environment variable dengan fallback.
 * @returns {string} Secret JWT.
 */
function getJwtSecret() {
  return process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
}

/**
 * Mengecek apakah role termasuk administrator.
 * @param {string} role - Role pengguna.
 * @returns {boolean} True jika SUPER_ADMIN atau ADMIN.
 */
function isAdminRole(role) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

/**
 * Membersihkan token GitHub dari kutipan dan spasi.
 * @param {string|null} rawToken - Token mentah.
 * @returns {string|null} Token bersih atau null.
 */
function sanitizeGitHubToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return rawToken.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

// =============================================================================
// MODULE 02 — RESPONSE HELPERS (CORS, JSON, ERROR)
// =============================================================================

/**
 * Header CORS yang dipakai di setiap respon.
 * @type {Object<string, string>}
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

/**
 * Membuat header standar untuk setiap respon JSON.
 * @param {Object<string, string>} [extraHeaders] - Header tambahan opsional.
 * @returns {Object<string, string>} Header lengkap.
 */
function buildHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...extraHeaders,
  };
}

/**
 * Membuat objek respon JSON standar dengan format:
 * { success, status, message, data, error }
 *
 * @param {number} status - Kode status HTTP.
 * @param {string} message - Pesan utama.
 * @param {*} [data=null] - Payload data (object/array) atau null.
 * @param {string|null} [error=null] - Detail error teknis atau null.
 * @param {Object<string, string>} [extraHeaders] - Header tambahan.
 * @returns {Response} Objek Response Web Standard.
 */
function createResponse(status, message, data = null, error = null, extraHeaders = {}) {
  const body = {
    success: status >= 200 && status < 300,
    status,
    message,
    data,
    error,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: buildHeaders(extraHeaders),
  });
}

/**
 * Menangani request preflight CORS (method OPTIONS).
 * @returns {Response} Respon 204 No Content dengan header CORS.
 */
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: buildHeaders(),
  });
}

/**
 * Membuat respon error tersentralisasi.
 * @param {number} status - Kode status HTTP (400, 404, 500, dst).
 * @param {string} message - Pesan error ramah pengguna.
 * @param {string|null} [detail=null] - Detail teknis error.
 * @returns {Response} Respon JSON error standar.
 */
function sendError(status, message, detail = null) {
  return createResponse(status, message, null, detail);
}

/**
 * Membuat respon sukses.
 * @param {number} status - Kode status HTTP.
 * @param {string} message - Pesan sukses.
 * @param {*} [data=null] - Payload data.
 * @returns {Response} Respon JSON sukses.
 */
function sendSuccess(status, message, data = null) {
  return createResponse(status, message, data, null);
}

// =============================================================================
// MODULE 03 — JSON DATA HELPERS (LOCAL FILE + GITHUB FALLBACK)
// =============================================================================

/**
 * Membaca file JSON lokal menggunakan fs (Node.js).
 * Berfungsi di Vercel dan Cloudflare Workers dengan nodejs_compat.
 *
 * @param {string} fileName - Nama file JSON (mis. 'User_data.json').
 * @returns {Promise<{value: *, sha: string|null}>} Nilai JSON dan sha (null untuk lokal).
 */
async function readLocalJsonFile(fileName) {
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public', fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    return { value: JSON.parse(raw), sha: null };
  } catch (error) {
    // File tidak ada, korup, atau fs tidak tersedia (mis. runtime tanpa Node fs)
    console.warn(`[JSON LOCAL] Gagal membaca ${fileName}: ${error.message}`);
    return { value: null, sha: null };
  }
}

/**
 * Melakukan request ke GitHub API untuk membaca/menulis file JSON.
 * Digunakan sebagai fallback persistensi saat file lokal tidak tersedia.
 *
 * @param {string} method - HTTP method (GET, PUT).
 * @param {string} apiPath - Path API GitHub (mis. 'contents/User_data.json').
 * @param {*} [body=null] - Body request untuk PUT.
 * @returns {Promise<*>} Respon JSON dari GitHub.
 */
function githubRequest(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const token = sanitizeGitHubToken(process.env.GITHUB_TOKEN);
    const owner = process.env.GITHUB_OWNER && process.env.GITHUB_OWNER.trim();
    const repo = process.env.GITHUB_REPO && process.env.GITHUB_REPO.trim();

    if (!token || !owner || !repo) {
      return reject(new ApiError(503, 'Penyimpanan data belum dikonfigurasi di server.'));
    }

    const payload = body ? JSON.stringify(body) : null;
    const https = require('https');
    const request = https.request(
      {
        hostname: 'api.github.com',
        port: 443,
        path: `/repos/${owner}/${repo}/${apiPath}`,
        method,
        headers: {
          'User-Agent': 'OSIS-KalamKudus-Serverless-App',
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        let responseBody = '';
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(JSON.parse(responseBody));
            } catch {
              resolve(responseBody);
            }
            return;
          }
          const code = response.statusCode || 500;
          reject(
            new ApiError(
              code === 404 ? 404 : 502,
              code === 404
                ? 'Berkas penyimpanan tidak ditemukan.'
                : `Penyimpanan GitHub menolak permintaan (HTTP ${code}).`
            )
          );
        });
      }
    );

    request.on('error', (error) =>
      reject(new ApiError(502, `Koneksi penyimpanan gagal: ${error.message}`))
    );
    if (payload) request.write(payload);
    request.end();
  });
}

/**
 * Mendapatkan nama branch GitHub dari environment variable.
 * @returns {string} Nama branch (default 'main').
 */
function getBranchName() {
  return (process.env.GITHUB_BRANCH || 'main').trim();
}

/**
 * Membaca file JSON dari GitHub.
 * @param {string} fileName - Nama file.
 * @param {*} fallbackValue - Nilai fallback jika 404.
 * @returns {Promise<{value: *, sha: string|null}>} Nilai dan sha.
 */
async function readGitHubJsonFile(fileName, fallbackValue) {
  try {
    const response = await githubRequest(
      'GET',
      `contents/${fileName}?ref=${encodeURIComponent(getBranchName())}`
    );
    const decoded = Buffer.from(response.content, 'base64').toString('utf8');
    return { value: JSON.parse(decoded), sha: response.sha };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { value: fallbackValue, sha: null };
    }
    throw error;
  }
}

/**
 * Menulis file JSON ke GitHub (persistensi lintas instance).
 * @param {string} fileName - Nama file.
 * @param {*} value - Nilai yang akan ditulis.
 * @param {string|null} sha - SHA file saat ini (untuk update).
 * @param {string} commitMessage - Pesan commit.
 * @returns {Promise<*>} Respon GitHub.
 */
async function writeGitHubJsonFile(fileName, value, sha, commitMessage) {
  const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');
  return githubRequest('PUT', `contents/${fileName}`, {
    message: commitMessage,
    content,
    branch: getBranchName(),
    ...(sha ? { sha } : {}),
  });
}

/**
 * Mengecek apakah error adalah konflik tulis (409/422).
 * @param {Error} error - Error yang dicek.
 * @returns {boolean} True jika konflik tulis.
 */
function isWriteConflict(error) {
  return error instanceof ApiError && error.status === 502 && /HTTP (409|422)/.test(error.message);
}

/**
 * Membaca file JSON dengan strategi berlapis:
 *   1. Coba baca file lokal (public/<fileName>).
 *   2. Jika gagal, coba baca dari GitHub.
 *   3. Jika keduanya gagal, gunakan fallbackValue (tidak pernah crash).
 *
 * @param {string} fileName - Nama file JSON.
 * @param {*} fallbackValue - Nilai fallback (biasanya []).
 * @returns {Promise<{value: *, sha: string|null}>} Nilai JSON dan sha.
 */
async function readJsonFile(fileName, fallbackValue) {
  // 1. Coba file lokal
  const local = await readLocalJsonFile(fileName);
  if (local.value !== null) {
    return { value: local.value, sha: null };
  }

  // 2. Coba GitHub
  try {
    return await readGitHubJsonFile(fileName, fallbackValue);
  } catch (error) {
    console.warn(`[JSON FALLBACK] ${fileName} tidak dapat dibaca dari GitHub: ${error.message}`);
  }

  // 3. Fallback kosong
  return { value: fallbackValue, sha: null };
}

/**
 * Menulis file JSON dengan strategi: GitHub dulu (persisten), lalu lokal.
 * @param {string} fileName - Nama file.
 * @param {*} value - Nilai yang ditulis.
 * @param {string|null} sha - SHA GitHub.
 * @param {string} commitMessage - Pesan commit.
 * @returns {Promise<{ok: boolean, source: string}>} Hasil tulis.
 */
async function writeJsonFile(fileName, value, sha, commitMessage) {
  // Coba GitHub dulu (persisten lintas instance serverless)
  try {
    await writeGitHubJsonFile(fileName, value, sha, commitMessage);
    return { ok: true, source: 'github' };
  } catch (error) {
    console.warn(`[JSON WRITE] GitHub gagal, coba lokal: ${error.message}`);
  }

  // Fallback: tulis ke file lokal (ephemeral di serverless)
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public', fileName);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    return { ok: true, source: 'local' };
  } catch (error) {
    console.error(`[JSON WRITE] Gagal menulis ${fileName}: ${error.message}`);
    return { ok: false, source: 'none' };
  }
}

// =============================================================================
// MODULE 04 — VALIDATION HELPERS
// =============================================================================

/**
 * Normalisasi username (trim + lowercase).
 * @param {string} value - Username mentah.
 * @returns {string} Username ternormalisasi.
 */
function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Validasi username sesuai aturan ketat.
 * @param {string} value - Username mentah.
 * @returns {string} Username valid (lowercase).
 * @throws {ApiError} 400 jika tidak valid.
 */
function validateUsername(value) {
  const username = String(value || '').trim();
  if (!USERNAME_PATTERN.test(username)) {
    fail(
      400,
      'Username harus 3–24 karakter dan hanya boleh berisi huruf, angka, atau garis bawah (_), tanpa spasi.'
    );
  }
  return username.toLowerCase();
}

/**
 * Validasi display name.
 * @param {string} value - Display name mentah.
 * @returns {string} Display name valid.
 * @throws {ApiError} 400 jika tidak valid.
 */
function validateDisplayName(value) {
  const displayName = String(value || '').trim().replace(/\s+/g, ' ');
  if (displayName.length < DISPLAY_NAME_MIN_LENGTH || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fail(
      400,
      `Display name harus terdiri dari ${DISPLAY_NAME_MIN_LENGTH}–${DISPLAY_NAME_MAX_LENGTH} karakter.`
    );
  }
  return displayName;
}

/**
 * Validasi email.
 * @param {string} value - Email mentah.
 * @returns {string} Email valid (lowercase).
 * @throws {ApiError} 400 jika tidak valid.
 */
function validateEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Format email tidak valid.');
  return email;
}

/**
 * Validasi avatar URL atau data URI base64.
 * @param {string|null} value - Avatar mentah.
 * @returns {string} Avatar valid.
 * @throws {ApiError} 400 jika tidak valid.
 */
function validateAvatar(value) {
  if (value === null || value === '') return DEFAULT_AVATAR_URL;
  if (typeof value !== 'string') fail(400, 'Format avatar tidak valid.');
  if (value === DEFAULT_AVATAR_URL) return value;

  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) fail(400, 'Avatar harus berupa gambar PNG, JPG, atau WEBP.');
  if (Buffer.byteLength(match[2], 'base64') > MAX_AVATAR_BYTES) {
    fail(400, 'Ukuran avatar setelah dikompres maksimal 1 MB.');
  }
  return value;
}

/**
 * Validasi rating review (1–5).
 * @param {*} value - Rating mentah.
 * @returns {number} Rating valid.
 * @throws {ApiError} 400 jika tidak valid.
 */
function validateRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail(400, 'Rating harus berupa angka 1 sampai 5.');
  }
  return rating;
}

/**
 * Validasi pesan review.
 * @param {string} value - Pesan mentah.
 * @returns {string} Pesan valid.
 * @throws {ApiError} 400 jika tidak valid.
 */
function validateReviewMessage(value) {
  const message = String(value || '').trim();
  if (message.length < REVIEW_MIN_LENGTH || message.length > REVIEW_MAX_LENGTH) {
    fail(
      400,
      `Pesan review harus terdiri dari ${REVIEW_MIN_LENGTH}–${REVIEW_MAX_LENGTH} karakter.`
    );
  }
  return message;
}

/**
 * Normalisasi objek user agar memiliki field default.
 * @param {Object} user - Objek user mentah.
 * @returns {Object} User ternormalisasi.
 */
function normalizeUser(user) {
  return {
    ...user,
    username: normalizeUsername(user.username),
    displayName: user.displayName || user.username || 'Pengguna OSIS',
    avatarUrl: user.avatarUrl || DEFAULT_AVATAR_URL,
    bio: typeof user.bio === 'string' ? user.bio : '',
    role: user.role || 'USER',
  };
}

/**
 * Menyiapkan user untuk dikirim ke klien (tanpa passwordHash).
 * @param {Object} user - User mentah.
 * @returns {Object} User versi klien.
 */
function toClientUser(user) {
  const current = normalizeUser(user);
  return {
    id: current.id,
    email: current.email,
    username: current.username,
    displayName: current.displayName,
    avatarUrl: current.avatarUrl,
    bio: current.bio,
    role: current.role,
    createdAt: current.createdAt,
    lastDisplayNameChangedAt: current.lastDisplayNameChangedAt || null,
    lastUsernameChangedAt: current.lastUsernameChangedAt || null,
  };
}

/**
 * Menyiapkan profil publik (tanpa email & data sensitif).
 * @param {Object} user - User mentah.
 * @returns {Object} Profil publik.
 */
function toPublicProfile(user) {
  const current = normalizeUser(user);
  return {
    username: current.username,
    displayName: current.displayName,
    avatarUrl: current.avatarUrl,
    bio: current.bio,
    createdAt: current.createdAt,
    role: isAdminRole(current.role) ? current.role : 'USER',
  };
}

/**
 * Membuat JWT token untuk user.
 * @param {Object} user - User.
 * @returns {string} JWT token.
 */
function signUserToken(user) {
  const jwt = require('jsonwebtoken');
  const current = normalizeUser(user);
  return jwt.sign(
    {
      id: current.id,
      email: current.email,
      username: current.username,
      displayName: current.displayName,
      role: current.role,
    },
    getJwtSecret(),
    { expiresIn: '24h' }
  );
}

/**
 * Memastikan username belum dipakai user lain.
 * @param {Array<Object>} usersList - Daftar user.
 * @param {string} username - Username yang dicek.
 * @param {string|null} [excludedUserId=null] - ID user yang dikecualikan.
 * @throws {ApiError} 409 jika sudah dipakai.
 */
function ensureUsernameAvailable(usersList, username, excludedUserId = null) {
  const used = usersList.some(
    (user) => user.id !== excludedUserId && normalizeUsername(user.username) === username
  );
  if (used) fail(409, 'Username tersebut sudah dipakai. Silakan pilih username lain.');
}

/**
 * Menghitung sisa waktu cooldown.
 * @param {string|null} lastChangedAt - Timestamp perubahan terakhir.
 * @param {number} cooldownMs - Durasi cooldown dalam ms.
 * @returns {number} Sisa waktu dalam ms (0 jika tidak ada).
 */
function getCooldownRemaining(lastChangedAt, cooldownMs) {
  if (!lastChangedAt) return 0;
  const remaining = new Date(lastChangedAt).getTime() + cooldownMs - Date.now();
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}

// =============================================================================
// MODULE 05 — AUTHENTICATION & OTP
// =============================================================================

/**
 * Membuat transporter SMTP untuk pengiriman email OTP.
 * @returns {Object} Nodemailer transporter.
 * @throws {ApiError} 503 jika SMTP belum dikonfigurasi.
 */
function createSmtpTransporter() {
  const nodemailer = require('nodemailer');
  const user = process.env.SMTP_USER && process.env.SMTP_USER.trim();
  const pass = process.env.SMTP_PASS && process.env.SMTP_PASS.replace(/\s+/g, '');
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number.parseInt(process.env.SMTP_PORT || '465', 10);
  if (!user || !pass) fail(503, 'Layanan OTP belum dikonfigurasi di server.');
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Mengirim email OTP.
 * @param {string} email - Email tujuan.
 * @param {string} otp - Kode OTP.
 * @param {string} title - Judul/tujuan OTP.
 * @returns {Promise<void>}
 */
async function dispatchOtpEmail(email, otp, title) {
  const transporter = createSmtpTransporter();
  await transporter.sendMail({
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER.trim()}>`,
    to: email,
    subject: `[OTP ${title}] Kode Verifikasi: ${otp}`,
    html: `<div style="font-family:Arial,sans-serif;background:#050506;color:#ededed;padding:28px;border-radius:16px;max-width:520px;margin:auto;border:1px solid #5e6ad2"><h2 style="margin:0;color:white">OSIS SMP KALAM KUDUS PADANG</h2><p>Gunakan kode berikut untuk <strong>${title}</strong>:</p><p style="font-size:32px;letter-spacing:8px;font-weight:800;color:#a5b4fc">${otp}</p><p style="color:#a1a1aa;font-size:12px">Kode berlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun.</p></div>`,
  });
}

/**
 * Membuat kode OTP 6 digit.
 * @returns {string} Kode OTP.
 */
function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Memverifikasi JWT token dari header Authorization.
 * @param {Request} request - Request Web Standard.
 * @returns {Object} Payload user dari token.
 * @throws {ApiError} 401/403 jika token tidak valid.
 */
function authenticateRequest(request) {
  const jwt = require('jsonwebtoken');
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.split(' ')[1];
  if (!token) fail(401, 'Silakan login terlebih dahulu.');
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    fail(403, 'Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.');
  }
}

/**
 * Memverifikasi JWT token dan memastikan role admin.
 * @param {Request} request - Request Web Standard.
 * @returns {Object} Payload user admin.
 * @throws {ApiError} 401/403 jika bukan admin.
 */
function authenticateAdminRequest(request) {
  const user = authenticateRequest(request);
  if (!isAdminRole(user.role)) fail(403, 'Hak akses administrator diperlukan.');
  return user;
}

// =============================================================================
// MODULE 06 — DATA ACCESS LAYER
// =============================================================================

/**
 * Mengambil data user dari file JSON (lokal/GitHub/fallback).
 * @returns {Promise<{usersList: Array<Object>, fileSha: string|null}>} Daftar user & sha.
 */
async function fetchUserData() {
  const { value, sha } = await readJsonFile(USER_FILE, []);
  const usersList = Array.isArray(value) ? value.map(normalizeUser) : [];

  // Seed master admin jika belum ada
  const adminExists = usersList.some(
    (user) =>
      String(user.email || '').toLowerCase() === MASTER_ADMIN_EMAIL ||
      normalizeUsername(user.username) === MASTER_ADMIN_USERNAME
  );

  if (!adminExists) {
    const masterPassword = process.env.MASTER_ADMIN_PASSWORD;
    if (!masterPassword) {
      console.warn('[ADMIN SEED] MASTER_ADMIN_PASSWORD tidak tersedia; akun admin awal dilewati.');
      return { usersList, fileSha: sha };
    }
    const bcrypt = require('bcryptjs');
    const masterAdmin = {
      id: 'usr_master_admin_001',
      email: MASTER_ADMIN_EMAIL,
      username: MASTER_ADMIN_USERNAME,
      displayName: MASTER_ADMIN_DISPLAY,
      avatarUrl: DEFAULT_AVATAR_URL,
      bio: 'Administrator resmi OSIS SMP Kalam Kudus Padang.',
      passwordHash: await bcrypt.hash(masterPassword, 10),
      role: 'SUPER_ADMIN',
      createdAt: new Date().toISOString(),
      verified: true,
    };
    usersList.unshift(masterAdmin);
    await writeJsonFile(USER_FILE, usersList, sha, 'chore(auth): seed master administrator');
    return { usersList, fileSha: sha };
  }

  return { usersList, fileSha: sha };
}

/**
 * Melakukan mutasi data user dengan retry pada konflik tulis.
 * @param {Function} mutate - Fungsi mutasi (menerima usersList).
 * @param {string} commitMessage - Pesan commit.
 * @returns {Promise<{usersList: Array<Object>, result: *}>} Hasil mutasi.
 */
async function commitUserMutation(mutate, commitMessage) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { usersList, fileSha } = await fetchUserData();
    const result = await mutate(usersList);
    try {
      const writeResult = await writeJsonFile(USER_FILE, usersList, fileSha, commitMessage);
      if (!writeResult.ok) fail(500, 'Gagal menyimpan data pengguna ke penyimpanan.');
      return { usersList, result };
    } catch (error) {
      lastError = error;
      if (!isWriteConflict(error) || attempt === 1) throw error;
    }
  }
  throw lastError;
}

/**
 * Mengambil data review dari file JSON.
 * @returns {Promise<{reviews: Array<Object>, fileSha: string|null}>} Daftar review & sha.
 */
async function fetchReviewData() {
  const { value, sha } = await readJsonFile(REVIEW_FILE, []);
  return { reviews: Array.isArray(value) ? value : [], fileSha: sha };
}

/**
 * Melakukan mutasi data review dengan retry pada konflik tulis.
 * @param {Function} mutate - Fungsi mutasi (menerima reviews).
 * @param {string} commitMessage - Pesan commit.
 * @returns {Promise<{reviews: Array<Object>, result: *}>} Hasil mutasi.
 */
async function commitReviewMutation(mutate, commitMessage) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { reviews, fileSha } = await fetchReviewData();
    const result = await mutate(reviews);
    try {
      const writeResult = await writeJsonFile(REVIEW_FILE, reviews, fileSha, commitMessage);
      if (!writeResult.ok) fail(500, 'Gagal menyimpan data review ke penyimpanan.');
      return { reviews, result };
    } catch (error) {
      lastError = error;
      if (!isWriteConflict(error) || attempt === 1) throw error;
    }
  }
  throw lastError;
}

/**
 * Menghias review dengan data author publik.
 * @param {Object} review - Review mentah.
 * @param {Array<Object>} usersList - Daftar user.
 * @returns {Object} Review terhias.
 */
function decorateReview(review, usersList) {
  const author = usersList.find((user) => user.id === review.userId);
  return {
    id: review.id,
    rating: review.rating,
    message: review.message,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt || review.createdAt,
    author: author
      ? toPublicProfile(author)
      : {
          username: 'akun_tidak_tersedia',
          displayName: 'Akun tidak tersedia',
          avatarUrl: DEFAULT_AVATAR_URL,
          bio: '',
          createdAt: null,
          role: 'USER',
        },
    authorId: review.userId,
  };
}

// =============================================================================
// MODULE 07 — ROUTE HANDLERS
// =============================================================================

/**
 * Handler GET /api/health — cek status server.
 * @returns {Response} Status online.
 */
function handleHealth() {
  return sendSuccess(200, 'Server online.', {
    status: 'online',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handler GET /api/users — mengambil seluruh data pengguna.
 * @returns {Promise<Response>} Daftar user (tanpa passwordHash).
 */
async function handleGetUsers() {
  const { usersList } = await fetchUserData();
  const users = usersList.map(toClientUser);
  return sendSuccess(200, 'Daftar pengguna berhasil dimuat.', {
    totalUsers: users.length,
    users,
  });
}

/**
 * Handler GET /api/reviews — mengambil seluruh data ulasan OSIS.
 * @returns {Promise<Response>} Daftar review + ringkasan.
 */
async function handleGetReviews() {
  const [{ reviews }, { usersList }] = await Promise.all([fetchReviewData(), fetchUserData()]);
  const ordered = reviews
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  const total = ordered.length;
  const averageRating = total
    ? ordered.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total
    : 0;
  return sendSuccess(200, 'Daftar review berhasil dimuat.', {
    reviews: ordered.map((review) => decorateReview(review, usersList)),
    summary: { total, averageRating: Number(averageRating.toFixed(1)) },
  });
}

/**
 * Handler POST /api/reviews — menerima ulasan baru.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Review yang baru dibuat.
 */
async function handlePostReview(request) {
  const user = authenticateRequest(request);
  const body = await request.json().catch(() => ({}));
  const rating = validateRating(body.rating);
  const message = validateReviewMessage(body.message);

  let newReview;
  await commitReviewMutation(
    (reviews) => {
      if (reviews.some((review) => review.userId === user.id)) {
        fail(409, 'Anda sudah mengirim review. Gunakan tombol Edit untuk memperbaruinya.');
      }
      const crypto = require('crypto');
      const now = new Date().toISOString();
      newReview = {
        id: `review_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        userId: user.id,
        rating,
        message,
        createdAt: now,
        updatedAt: now,
      };
      reviews.push(newReview);
    },
    'feat(reviews): add OSIS performance review'
  );
  return sendSuccess(201, 'Terima kasih, review Anda telah disimpan.', { review: newReview });
}

/**
 * Handler PUT /api/reviews/:id — memperbarui review.
 * @param {Request} request - Request Web Standard.
 * @param {string} reviewId - ID review.
 * @returns {Promise<Response>} Review yang diperbarui.
 */
async function handlePutReview(request, reviewId) {
  const user = authenticateRequest(request);
  const body = await request.json().catch(() => ({}));
  let updatedReview;
  await commitReviewMutation(
    (reviews) => {
      const review = reviews.find((entry) => entry.id === reviewId);
      if (!review) fail(404, 'Review tidak ditemukan.');
      const isOwner = review.userId === user.id;
      const isAdmin = isAdminRole(user.role);
      if (!isOwner && !isAdmin) fail(403, 'Anda hanya dapat mengubah review milik sendiri.');
      if (!isOwner && Object.prototype.hasOwnProperty.call(body, 'message')) {
        fail(403, 'Administrator hanya dapat mengubah rating review pengguna lain.');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'rating')) {
        review.rating = validateRating(body.rating);
      }
      if (isOwner && Object.prototype.hasOwnProperty.call(body, 'message')) {
        review.message = validateReviewMessage(body.message);
      }
      review.updatedAt = new Date().toISOString();
      updatedReview = review;
    },
    'feat(reviews): update OSIS performance review'
  );
  return sendSuccess(200, 'Review berhasil diperbarui.', { review: updatedReview });
}

/**
 * Handler DELETE /api/reviews/:id — menghapus review.
 * @param {Request} request - Request Web Standard.
 * @param {string} reviewId - ID review.
 * @returns {Promise<Response>} Pesan sukses.
 */
async function handleDeleteReview(request, reviewId) {
  const user = authenticateRequest(request);
  await commitReviewMutation(
    (reviews) => {
      const index = reviews.findIndex((entry) => entry.id === reviewId);
      if (index < 0) fail(404, 'Review tidak ditemukan.');
      const review = reviews[index];
      if (review.userId !== user.id && !isAdminRole(user.role)) {
        fail(403, 'Anda hanya dapat menghapus review milik sendiri.');
      }
      reviews.splice(index, 1);
    },
    'feat(reviews): delete OSIS performance review'
  );
  return sendSuccess(200, 'Review berhasil dihapus.');
}

/**
 * Handler GET /api/usernames/:username/availability — cek ketersediaan username.
 * @param {string} username - Username yang dicek.
 * @returns {Promise<Response>} Status ketersediaan.
 */
async function handleUsernameAvailability(username) {
  const normalized = validateUsername(username);
  const { usersList } = await fetchUserData();
  const available = !usersList.some((user) => normalizeUsername(user.username) === normalized);
  return sendSuccess(200, available ? 'Username tersedia.' : 'Username sudah digunakan.', {
    username: normalized,
    available,
  });
}

/**
 * Handler POST /api/register — memulai pendaftaran (kirim OTP).
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan OTP terkirim.
 */
async function handleRegister(request) {
  const body = await request.json().catch(() => ({}));
  const { email, username, displayName, password, confirmPassword } = body;
  const normalizedEmail = validateEmail(email);
  const normalizedUsername = validateUsername(username);
  const cleanDisplayName = validateDisplayName(displayName);
  if (typeof password !== 'string' || password.length < 6) {
    fail(400, 'Password minimal terdiri dari 6 karakter.');
  }
  if (password !== confirmPassword) fail(400, 'Konfirmasi password tidak cocok.');

  const { usersList } = await fetchUserData();
  if (usersList.some((user) => String(user.email || '').toLowerCase() === normalizedEmail)) {
    fail(409, 'Email tersebut sudah terdaftar. Silakan login.');
  }
  ensureUsernameAvailable(usersList, normalizedUsername);

  const otp = createOtp();
  global.otpMemoryStore[normalizedEmail] = {
    otp,
    payload: {
      email: normalizedEmail,
      username: normalizedUsername,
      displayName: cleanDisplayName,
      password,
      role: 'USER',
    },
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  await dispatchOtpEmail(normalizedEmail, otp, 'Pendaftaran Akun Baru');
  return sendSuccess(200, 'Kode OTP telah dikirimkan ke email Anda.', {
    email: normalizedEmail,
  });
}

/**
 * Handler POST /api/verify-register — verifikasi OTP pendaftaran.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan sukses registrasi.
 */
async function handleVerifyRegister(request) {
  const body = await request.json().catch(() => ({}));
  const email = validateEmail(body.email);
  const otp = String(body.otp || '').trim();
  const session = global.otpMemoryStore[email];
  if (!session || !session.payload) {
    fail(400, 'Sesi verifikasi tidak ditemukan atau sudah kedaluwarsa. Silakan daftar ulang.');
  }
  if (Date.now() > session.expiresAt) {
    delete global.otpMemoryStore[email];
    fail(400, 'Kode OTP sudah kedaluwarsa. Silakan daftar ulang.');
  }
  if (session.otp !== otp) fail(400, 'Kode OTP yang dimasukkan salah.');

  await commitUserMutation(async (usersList) => {
    if (usersList.some((user) => String(user.email || '').toLowerCase() === session.payload.email)) {
      fail(409, 'Email tersebut sudah terdaftar. Silakan login.');
    }
    ensureUsernameAvailable(usersList, session.payload.username);
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    usersList.push({
      id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      email: session.payload.email,
      username: session.payload.username,
      displayName: session.payload.displayName,
      avatarUrl: DEFAULT_AVATAR_URL,
      bio: '',
      passwordHash: await bcrypt.hash(session.payload.password, 10),
      role: session.payload.role,
      createdAt: new Date().toISOString(),
      verified: true,
    });
  }, 'feat(auth): register verified user');

  delete global.otpMemoryStore[email];
  return sendSuccess(200, 'Registrasi berhasil. Silakan login menggunakan akun Anda.');
}

/**
 * Handler POST /api/login — memulai login (kirim OTP).
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan OTP login terkirim.
 */
async function handleLogin(request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body.identifier || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!identifier || !password) fail(400, 'Email/username dan password wajib diisi.');
  const { usersList } = await fetchUserData();
  const user = usersList.find(
    (entry) =>
      String(entry.email || '').toLowerCase() === identifier ||
      normalizeUsername(entry.username) === identifier
  );
  if (!user) fail(404, 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.');
  const bcrypt = require('bcryptjs');
  if (!(await bcrypt.compare(password, user.passwordHash || ''))) {
    fail(401, 'Password yang Anda masukkan salah.');
  }

  const otp = createOtp();
  global.otpMemoryStore[`login_${user.email.toLowerCase()}`] = {
    otp,
    userData: user,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  await dispatchOtpEmail(user.email, otp, 'Verifikasi Login');
  return sendSuccess(200, 'Kode OTP login telah dikirimkan ke email Anda.', {
    email: user.email,
  });
}

/**
 * Handler POST /api/verify-login — verifikasi OTP login.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Token JWT + data user.
 */
async function handleVerifyLogin(request) {
  const body = await request.json().catch(() => ({}));
  const email = validateEmail(body.email);
  const otp = String(body.otp || '').trim();
  const key = `login_${email}`;
  const session = global.otpMemoryStore[key];
  if (!session || !session.userData) {
    fail(400, 'Sesi login tidak ditemukan atau sudah kedaluwarsa.');
  }
  if (Date.now() > session.expiresAt) {
    delete global.otpMemoryStore[key];
    fail(400, 'Kode OTP sudah kedaluwarsa. Silakan login kembali.');
  }
  if (session.otp !== otp) fail(400, 'Kode OTP login tidak valid.');
  const { usersList } = await fetchUserData();
  const user = usersList.find((entry) => entry.id === session.userData.id);
  if (!user) fail(404, 'Akun tidak lagi tersedia.');
  delete global.otpMemoryStore[key];
  return sendSuccess(200, 'Login berhasil.', {
    token: signUserToken(user),
    user: toClientUser(user),
  });
}

/**
 * Handler POST /api/resend-otp — kirim ulang OTP.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan OTP baru terkirim.
 */
async function handleResendOtp(request) {
  const body = await request.json().catch(() => ({}));
  const email = validateEmail(body.email);
  const loginKey = `login_${email}`;
  const sessionKey = global.otpMemoryStore[loginKey] ? loginKey : email;
  const session = global.otpMemoryStore[sessionKey];
  if (!session) {
    fail(400, 'Sesi OTP tidak ditemukan. Silakan ulangi proses login atau pendaftaran.');
  }
  const otp = createOtp();
  session.otp = otp;
  session.expiresAt = Date.now() + 5 * 60 * 1000;
  await dispatchOtpEmail(email, otp, 'Kirim Ulang OTP');
  return sendSuccess(200, 'Kode OTP baru telah dikirimkan ke email Anda.', { email });
}

/**
 * Handler GET /api/account/me — mengambil data akun saat ini.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Data user + token baru.
 */
async function handleAccountMe(request) {
  const authUser = authenticateRequest(request);
  const { usersList } = await fetchUserData();
  const user = usersList.find((entry) => entry.id === authUser.id);
  if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');
  return sendSuccess(200, 'Data akun berhasil dimuat.', {
    user: toClientUser(user),
    token: signUserToken(user),
  });
}

/**
 * Handler PUT /api/account/profile — memperbarui profil akun.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Profil yang diperbarui.
 */
async function handleUpdateProfile(request) {
  const authUser = authenticateRequest(request);
  const body = await request.json().catch(() => ({}));
  let updatedUser;
  await commitUserMutation((usersList) => {
    const user = usersList.find((entry) => entry.id === authUser.id);
    if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');
    const now = Date.now();

    if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
      const displayName = validateDisplayName(body.displayName);
      if (displayName !== user.displayName) {
        const remaining = getCooldownRemaining(user.lastDisplayNameChangedAt, DISPLAY_NAME_COOLDOWN_MS);
        if (remaining) {
          fail(429, `Display name baru dapat diubah lagi dalam ${Math.ceil(remaining / 3600000)} jam.`);
        }
        user.displayName = displayName;
        user.lastDisplayNameChangedAt = new Date(now).toISOString();
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
      const username = validateUsername(body.username);
      if (username !== normalizeUsername(user.username)) {
        const remaining = getCooldownRemaining(user.lastUsernameChangedAt, USERNAME_COOLDOWN_MS);
        if (remaining) {
          fail(429, `Username baru dapat diubah lagi dalam ${Math.ceil(remaining / 86400000)} hari.`);
        }
        ensureUsernameAvailable(usersList, username, user.id);
        user.username = username;
        user.lastUsernameChangedAt = new Date(now).toISOString();
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
      const bio = String(body.bio || '').trim();
      if (bio.length > BIO_MAX_LENGTH) {
        fail(400, `Deskripsi akun maksimal ${BIO_MAX_LENGTH} karakter.`);
      }
      user.bio = bio;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
      user.avatarUrl = validateAvatar(body.avatarUrl);
    }
    user.updatedAt = new Date(now).toISOString();
    updatedUser = normalizeUser(user);
  }, 'feat(profile): update account profile');

  return sendSuccess(200, 'Profil berhasil diperbarui.', {
    token: signUserToken(updatedUser),
    user: toClientUser(updatedUser),
  });
}

/**
 * Handler POST /api/account/security/send-otp — kirim OTP keamanan akun.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan OTP terkirim.
 */
async function handleSendSecurityOtp(request) {
  const authUser = authenticateRequest(request);
  const body = await request.json().catch(() => ({}));
  const purpose = String(body.purpose || 'password-change').trim();
  const allowedPurposes = ['password-change', 'delete-account'];
  if (!allowedPurposes.includes(purpose)) fail(400, 'Tujuan verifikasi tidak valid.');

  const { usersList } = await fetchUserData();
  const user = usersList.find((entry) => entry.id === authUser.id);
  if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');

  const otp = createOtp();
  const key = `account_${purpose}_${user.id}`;
  global.otpMemoryStore[key] = {
    otp,
    purpose,
    email: user.email,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  await dispatchOtpEmail(user.email, otp, purpose === 'delete-account' ? 'Hapus Akun' : 'Ubah Password');
  return sendSuccess(
    200,
    purpose === 'delete-account'
      ? 'Kode OTP hapus akun berhasil dikirim ke email Anda.'
      : 'Kode OTP verifikasi ubah password berhasil dikirim ke email Anda.'
  );
}

/**
 * Handler POST /api/account/change-password — mengubah password.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan sukses.
 */
async function handleChangePassword(request) {
  const authUser = authenticateRequest(request);
  const body = await request.json().catch(() => ({}));
  const { currentPassword, otp, newPassword, confirmPassword } = body;
  const { usersList } = await fetchUserData();
  const user = usersList.find((entry) => entry.id === authUser.id);
  if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');

  const passwordCandidate = typeof newPassword === 'string' ? newPassword : '';
  if (passwordCandidate.length < 6) fail(400, 'Password baru minimal terdiri dari 6 karakter.');
  if (passwordCandidate !== confirmPassword) fail(400, 'Konfirmasi password baru tidak cocok.');

  const bcrypt = require('bcryptjs');
  const currentPasswordProvided = typeof currentPassword === 'string' && currentPassword.trim().length > 0;
  const otpProvided = typeof otp === 'string' && otp.trim().length > 0;
  let verifiedByCurrentPassword = false;
  let verifiedByOtp = false;

  if (currentPasswordProvided) {
    verifiedByCurrentPassword = await bcrypt.compare(currentPassword, user.passwordHash || '');
  }

  if (otpProvided) {
    const sessionKey = `account_password-change_${user.id}`;
    const session = global.otpMemoryStore[sessionKey];
    if (!session || !session.otp) {
      fail(400, 'Sesi OTP ubah password tidak ditemukan atau sudah kedaluwarsa.');
    }
    if (Date.now() > session.expiresAt) {
      delete global.otpMemoryStore[sessionKey];
      fail(400, 'Kode OTP ubah password sudah kedaluwarsa. Silakan kirim ulang.');
    }
    if (session.otp !== String(otp).trim()) {
      fail(400, 'Kode OTP ubah password yang Anda masukkan salah.');
    }
    verifiedByOtp = true;
    delete global.otpMemoryStore[sessionKey];
  }

  if (!verifiedByCurrentPassword && !verifiedByOtp) {
    fail(400, 'Verifikasi gagal. Masukkan password saat ini atau kode OTP yang dikirim ke email Anda.');
  }

  if (await bcrypt.compare(passwordCandidate, user.passwordHash || '')) {
    fail(400, 'Password baru harus berbeda dari password saat ini.');
  }

  const newPasswordHash = await bcrypt.hash(passwordCandidate, 10);
  await commitUserMutation((allUsers) => {
    const targetUser = allUsers.find((entry) => entry.id === user.id);
    if (!targetUser) fail(404, 'Akun tidak ditemukan.');
    targetUser.passwordHash = newPasswordHash;
    targetUser.updatedAt = new Date().toISOString();
  }, 'feat(auth): change user password');

  return sendSuccess(200, 'Password berhasil diperbarui. Silakan login kembali dengan password baru.');
}

/**
 * Handler POST /api/account/delete — menghapus akun.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Pesan sukses.
 */
async function handleDeleteAccount(request) {
  const authUser = authenticateRequest(request);
  const body = await request.json().catch(() => ({}));
  const { otp, password } = body;
  if (!otp || !password) fail(400, 'Kode OTP dan password akun wajib diisi.');

  const { usersList } = await fetchUserData();
  const user = usersList.find((entry) => entry.id === authUser.id);
  if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');

  const sessionKey = `account_delete-account_${user.id}`;
  const session = global.otpMemoryStore[sessionKey];
  if (!session || !session.otp) {
    fail(400, 'Sesi verifikasi penghapusan akun tidak ditemukan atau sudah kedaluwarsa.');
  }
  if (Date.now() > session.expiresAt) {
    delete global.otpMemoryStore[sessionKey];
    fail(400, 'Kode OTP penghapusan akun sudah kedaluwarsa. Silakan kirim ulang.');
  }
  if (session.otp !== String(otp).trim()) {
    fail(400, 'Kode OTP penghapusan akun yang Anda masukkan salah.');
  }
  const bcrypt = require('bcryptjs');
  if (!(await bcrypt.compare(String(password), user.passwordHash || ''))) {
    fail(401, 'Password yang Anda masukkan salah.');
  }

  await commitUserMutation((allUsers) => {
    const targetIndex = allUsers.findIndex((entry) => entry.id === user.id);
    if (targetIndex === -1) fail(404, 'Akun tidak ditemukan.');
    allUsers.splice(targetIndex, 1);
  }, 'feat(auth): delete user account');

  delete global.otpMemoryStore[sessionKey];
  return sendSuccess(200, 'Akun berhasil dihapus dari sistem.');
}

/**
 * Handler GET /api/profiles/:username — mengambil profil publik.
 * @param {string} username - Username.
 * @returns {Promise<Response>} Profil publik.
 */
async function handleGetProfile(username) {
  const requestedUsername = normalizeUsername(username);
  // The original master account predates the strict username rule and remains readable.
  const normalized =
    requestedUsername === MASTER_ADMIN_USERNAME ? requestedUsername : validateUsername(username);
  const { usersList } = await fetchUserData();
  const user = usersList.find((entry) => normalizeUsername(entry.username) === normalized);
  if (!user) fail(404, 'Profil pengguna tidak ditemukan.');
  return sendSuccess(200, 'Profil berhasil dimuat.', { profile: toPublicProfile(user) });
}

/**
 * Handler GET /api/admin/users — daftar user untuk admin.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Daftar user admin.
 */
async function handleAdminGetUsers(request) {
  authenticateAdminRequest(request);
  const { usersList } = await fetchUserData();
  const users = usersList.map((user) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
    verified: user.verified,
  }));
  return sendSuccess(200, 'Daftar user berhasil dimuat.', { totalUsers: users.length, users });
}

/**
 * Handler DELETE /api/admin/users/:id — hapus user oleh admin.
 * @param {Request} request - Request Web Standard.
 * @param {string} userId - ID user.
 * @returns {Promise<Response>} Pesan sukses.
 */
async function handleAdminDeleteUser(request, userId) {
  authenticateAdminRequest(request);
  await commitUserMutation((usersList) => {
    const targetIndex = usersList.findIndex((user) => user.id === userId);
    if (targetIndex < 0) fail(404, 'User tidak ditemukan.');
    const target = usersList[targetIndex];
    if (target.role === 'SUPER_ADMIN' || String(target.email || '').toLowerCase() === MASTER_ADMIN_EMAIL) {
      fail(403, 'Akun Master Administrator tidak dapat dihapus.');
    }
    usersList.splice(targetIndex, 1);
  }, 'chore(admin): delete user');
  return sendSuccess(200, 'Akun pengguna berhasil dihapus.');
}

// =============================================================================
// MODULE 08 — ROUTER
// =============================================================================

/**
 * Memecah URL menjadi path dan query params.
 * @param {string} url - URL lengkap.
 * @returns {{pathname: string, searchParams: URLSearchParams}} Path & query.
 */
function parseUrl(url) {
  const parsed = new URL(url, 'http://localhost');
  return { pathname: parsed.pathname, searchParams: parsed.searchParams };
}

/**
 * Router utama — mencocokkan method + path ke handler.
 * @param {Request} request - Request Web Standard.
 * @returns {Promise<Response>} Respon dari handler.
 */
async function router(request) {
  const method = request.method.toUpperCase();
  const { pathname } = parseUrl(request.url);

  // Normalisasi: hilangkan trailing slash
  const path = pathname.replace(/\/+$/, '') || '/';

  // Preflight CORS
  if (method === 'OPTIONS') return handleOptions();

  // --- Public & Health ---
  if (method === 'GET' && (path === '/api/health' || path === '/health')) {
    return handleHealth();
  }

  // --- Users ---
  if (method === 'GET' && path === '/api/users') {
    return handleGetUsers();
  }

  // --- Reviews ---
  if (method === 'GET' && (path === '/api/reviews' || path === '/reviews')) {
    return handleGetReviews();
  }
  if (method === 'POST' && (path === '/api/reviews' || path === '/reviews')) {
    return handlePostReview(request);
  }

  // --- Reviews by ID ---
  const reviewMatch = path.match(/^\/api\/reviews\/([^/]+)$/);
  if (reviewMatch) {
    const reviewId = decodeURIComponent(reviewMatch[1]);
    if (method === 'PUT') return handlePutReview(request, reviewId);
    if (method === 'DELETE') return handleDeleteReview(request, reviewId);
  }

  // --- Username availability ---
  const usernameMatch = path.match(/^\/api\/usernames\/([^/]+)\/availability$/);
  if (usernameMatch && method === 'GET') {
    return handleUsernameAvailability(decodeURIComponent(usernameMatch[1]));
  }

  // --- Auth ---
  if (method === 'POST' && (path === '/api/register' || path === '/register')) {
    return handleRegister(request);
  }
  if (method === 'POST' && (path === '/api/verify-register' || path === '/verify-register')) {
    return handleVerifyRegister(request);
  }
  if (method === 'POST' && (path === '/api/login' || path === '/login')) {
    return handleLogin(request);
  }
  if (method === 'POST' && (path === '/api/verify-login' || path === '/verify-login')) {
    return handleVerifyLogin(request);
  }
  if (method === 'POST' && (path === '/api/resend-otp' || path === '/resend-otp')) {
    return handleResendOtp(request);
  }

  // --- Account ---
  if (method === 'GET' && (path === '/api/account/me' || path === '/account/me')) {
    return handleAccountMe(request);
  }
  if (method === 'PUT' && (path === '/api/account/profile' || path === '/account/profile')) {
    return handleUpdateProfile(request);
  }
  if (
    method === 'POST' &&
    (path === '/api/account/security/send-otp' || path === '/account/security/send-otp')
  ) {
    return handleSendSecurityOtp(request);
  }
  if (
    method === 'POST' &&
    (path === '/api/account/change-password' || path === '/account/change-password')
  ) {
    return handleChangePassword(request);
  }
  if (method === 'POST' && (path === '/api/account/delete' || path === '/account/delete')) {
    return handleDeleteAccount(request);
  }

  // --- Public profile ---
  const profileMatch = path.match(/^\/api\/profiles\/([^/]+)$/);
  if (profileMatch && method === 'GET') {
    return handleGetProfile(decodeURIComponent(profileMatch[1]));
  }

  // --- Admin ---
  if (method === 'GET' && (path === '/api/admin/users' || path === '/admin/users')) {
    return handleAdminGetUsers(request);
  }
  const adminDeleteMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminDeleteMatch && method === 'DELETE') {
    return handleAdminDeleteUser(request, decodeURIComponent(adminDeleteMatch[1]));
  }

  // --- 404 ---
  return sendError(404, `Endpoint '${pathname}' tidak ditemukan.`);
}

// =============================================================================
// MODULE 09 — GLOBAL ERROR WRAPPER & EXPORT
// =============================================================================

/**
 * Handler utama — membungkus seluruh eksekusi dengan try-catch global.
 * Dijamin tidak pernah mengembalikan respon kosong (empty response body).
 *
 * @param {Request} request - Request Web Standard.
 * @param {Object} [env] - Environment bindings (Cloudflare Workers).
 * @param {Object} [ctx] - Execution context (Cloudflare Workers).
 * @returns {Promise<Response>} Respon JSON standar.
 */
async function handler(request, env = {}, ctx = {}) {
  try {
    // Suntikkan env bindings ke process.env untuk kompatibilitas
    if (env && typeof env === 'object') {
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined && typeof value === 'string') {
          process.env[key] = value;
        }
      }
    }

    // Delegasikan ke router
    return await router(request);
  } catch (error) {
    // --- Error tersentralisasi ---
    if (error instanceof ApiError) {
      return sendError(error.status, error.message);
    }

    // Error tak terduga → 500 Internal Server Error
    console.error('[API ERROR]', error);
    return sendError(500, 'Terjadi kesalahan pada server. Silakan coba lagi.', error.message || null);
  }
}

// =============================================================================
// EXPORT — Dual Platform Compatibility
// =============================================================================

// Cloudflare Workers: export default object dengan method fetch
module.exports = handler;

// Vercel Serverless Functions (Node.js): export handler sebagai default function
// Vercel mendukung Web Standard Request/Response pada runtime Node.js 18+.