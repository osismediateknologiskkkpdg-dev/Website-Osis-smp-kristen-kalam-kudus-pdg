/**
 * OSIS SMP Kalam Kudus Padang — API Serverless
 *
 * MODULE MAP
 *  01. Configuration and application middleware
 *  02. GitHub JSON persistence
 *  03. Validation and user data helpers
 *  04. Authentication and OTP
 *  05. Account profile API
 *  06. OSIS review API
 *  07. Administrator API and error handling
 *  08. Security Module (Admin Login — Hashcode Encryption)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

// =============================================================================
// MODULE 01 — CONFIGURATION AND APPLICATION MIDDLEWARE
// =============================================================================

const DEFAULT_AVATAR_URL = 'https://raw.githubusercontent.com/osismediateknologiskkkpdg-dev/Image-OSIS/refs/heads/main/Untitled%20design%20(1).png';
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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

global.otpMemoryStore = global.otpMemoryStore || {};
global.securityCheckStore = global.securityCheckStore || {};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(status, message) {
  throw new ApiError(status, message);
}

function getJwtSecret() {
  return process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
}

function isAdminRole(role) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

function sanitizeGitHubToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return rawToken.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

// =============================================================================
// MODULE 02 — GITHUB JSON PERSISTENCE
// =============================================================================

function githubRequest(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const token = sanitizeGitHubToken(process.env.GITHUB_TOKEN);
    const owner = process.env.GITHUB_OWNER && process.env.GITHUB_OWNER.trim();
    const repo = process.env.GITHUB_REPO && process.env.GITHUB_REPO.trim();

    if (!token || !owner || !repo) {
      return reject(new ApiError(503, 'Penyimpanan data belum dikonfigurasi di server.'));
    }

    const payload = body ? JSON.stringify(body) : null;
    const request = https.request({
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${owner}/${repo}/${apiPath}`,
      method,
      headers: {
        'User-Agent': 'OSIS-KalamKudus-Serverless-App',
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => { responseBody += chunk; });
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
        let errorMessage = `Penyimpanan GitHub menolak permintaan (HTTP ${code}).`;
        if (code === 401) {
          errorMessage = 'Token GitHub (GITHUB_TOKEN) tidak valid, telah kedaluwarsa, atau dicabut otomatis oleh GitHub (HTTP 401).';
        } else if (code === 403) {
          errorMessage = 'Akses GitHub ditolak (HTTP 403). Pastikan token memiliki izin scope repo / Contents read & write.';
        } else if (code === 404) {
          errorMessage = 'Berkas atau repositori penyimpanan GitHub tidak ditemukan (HTTP 404).';
        }
        reject(new ApiError(code === 404 ? 404 : 502, errorMessage));
      });
    });

    request.on('error', (error) => reject(new ApiError(502, `Koneksi penyimpanan gagal: ${error.message}`)));
    if (payload) request.write(payload);
    request.end();
  });
}

function getBranchName() {
  return (process.env.GITHUB_BRANCH || 'main').trim();
}

async function readJsonFile(fileName, fallbackValue) {
  try {
    const response = await githubRequest('GET', `contents/${fileName}?ref=${encodeURIComponent(getBranchName())}`);
    const decoded = Buffer.from(response.content, 'base64').toString('utf8');
    return { value: JSON.parse(decoded), sha: response.sha };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { value: fallbackValue, sha: null };
    const localPath = path.join(__dirname, '..', fileName);
    if (fs.existsSync(localPath)) {
      try {
        const fileContent = fs.readFileSync(localPath, 'utf8');
        return { value: JSON.parse(fileContent), sha: 'local_sha' };
      } catch (localErr) {
        console.warn(`[LOCAL FALLBACK FAILED] for ${fileName}:`, localErr.message);
      }
    }
    throw error;
  }
}

async function writeJsonFile(fileName, value, sha, commitMessage) {
  const content = Buffer.from(JSON.stringify(value, null, 2)).toString('base64');
  try {
    return await githubRequest('PUT', `contents/${fileName}`, {
      message: commitMessage,
      content,
      branch: getBranchName(),
      ...(sha && sha !== 'local_sha' ? { sha } : {})
    });
  } catch (error) {
    const localPath = path.join(__dirname, '..', fileName);
    if (fs.existsSync(localPath) || !process.env.GITHUB_TOKEN) {
      fs.writeFileSync(localPath, JSON.stringify(value, null, 2), 'utf8');
      return { content: { sha: 'local_sha' } };
    }
    throw error;
  }
}

function isWriteConflict(error) {
  return error instanceof ApiError && error.status === 502 && /HTTP (409|422)/.test(error.message);
}

// =============================================================================
// MODULE 03 — VALIDATION AND USER DATA HELPERS
// =============================================================================

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!USERNAME_PATTERN.test(username)) {
    fail(400, 'Username harus 3–24 karakter dan hanya boleh berisi huruf, angka, atau garis bawah (_), tanpa spasi.');
  }
  return username.toLowerCase();
}

function validateDisplayName(value) {
  const displayName = String(value || '').trim().replace(/\s+/g, ' ');
  if (displayName.length < DISPLAY_NAME_MIN_LENGTH || displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fail(400, `Display name harus terdiri dari ${DISPLAY_NAME_MIN_LENGTH}–${DISPLAY_NAME_MAX_LENGTH} karakter.`);
  }
  return displayName;
}

function validateEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Format email tidak valid.');
  return email;
}

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

function normalizeUser(user) {
  return {
    ...user,
    username: normalizeUsername(user.username),
    displayName: user.displayName || user.username || 'Pengguna OSIS',
    avatarUrl: user.avatarUrl || DEFAULT_AVATAR_URL,
    bio: typeof user.bio === 'string' ? user.bio : '',
    role: user.role || 'USER'
  };
}

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
    lastUsernameChangedAt: current.lastUsernameChangedAt || null
  };
}

function toPublicProfile(user) {
  const current = normalizeUser(user);
  return {
    username: current.username,
    displayName: current.displayName,
    avatarUrl: current.avatarUrl,
    bio: current.bio,
    createdAt: current.createdAt,
    role: isAdminRole(current.role) ? current.role : 'USER'
  };
}

function signUserToken(user) {
  const current = normalizeUser(user);
  return jwt.sign({
    id: current.id,
    email: current.email,
    username: current.username,
    displayName: current.displayName,
    role: current.role
  }, getJwtSecret(), { expiresIn: '24h' });
}

async function fetchUserData() {
  const { value, sha } = await readJsonFile(USER_FILE, []);
  const usersList = Array.isArray(value) ? value.map(normalizeUser) : [];
  const adminExists = usersList.some((user) =>
    String(user.email || '').toLowerCase() === MASTER_ADMIN_EMAIL || normalizeUsername(user.username) === MASTER_ADMIN_USERNAME
  );

  if (!adminExists) {
    const masterPassword = process.env.MASTER_ADMIN_PASSWORD;
    if (!masterPassword) {
      console.warn('[ADMIN SEED] MASTER_ADMIN_PASSWORD tidak tersedia; akun admin awal dilewati.');
      return { usersList, fileSha: sha };
    }

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
      verified: true
    };
    usersList.unshift(masterAdmin);
    const saved = await writeJsonFile(USER_FILE, usersList, sha, 'chore(auth): seed master administrator');
    return { usersList, fileSha: saved.content?.sha || sha };
  }

  return { usersList, fileSha: sha };
}

async function commitUserMutation(mutate, commitMessage) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { usersList, fileSha } = await fetchUserData();
    const result = await mutate(usersList);
    try {
      await writeJsonFile(USER_FILE, usersList, fileSha, commitMessage);
      return { usersList, result };
    } catch (error) {
      lastError = error;
      if (!isWriteConflict(error) || attempt === 1) throw error;
    }
  }
  throw lastError;
}

async function fetchReviewData() {
  const { value, sha } = await readJsonFile(REVIEW_FILE, []);
  return { reviews: Array.isArray(value) ? value : [], fileSha: sha };
}

async function commitReviewMutation(mutate, commitMessage) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { reviews, fileSha } = await fetchReviewData();
    const result = await mutate(reviews);
    try {
      await writeJsonFile(REVIEW_FILE, reviews, fileSha, commitMessage);
      return { reviews, result };
    } catch (error) {
      lastError = error;
      if (!isWriteConflict(error) || attempt === 1) throw error;
    }
  }
  throw lastError;
}

function ensureUsernameAvailable(usersList, username, excludedUserId = null) {
  const used = usersList.some((user) => user.id !== excludedUserId && normalizeUsername(user.username) === username);
  if (used) fail(409, 'Username tersebut sudah dipakai. Silakan pilih username lain.');
}

function getCooldownRemaining(lastChangedAt, cooldownMs) {
  if (!lastChangedAt) return 0;
  const remaining = new Date(lastChangedAt).getTime() + cooldownMs - Date.now();
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}

// =============================================================================
// MODULE 04 — AUTHENTICATION AND OTP
// =============================================================================

function createSmtpTransporter() {
  const user = process.env.SMTP_USER && process.env.SMTP_USER.trim();
  const pass = process.env.SMTP_PASS && process.env.SMTP_PASS.replace(/\s+/g, '');
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number.parseInt(process.env.SMTP_PORT || '465', 10);
  if (!user || !pass) fail(503, 'Layanan OTP belum dikonfigurasi di server.');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, tls: { rejectUnauthorized: false } });
}

async function dispatchOtpEmail(email, otp, title) {
  const transporter = createSmtpTransporter();
  await transporter.sendMail({
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER.trim()}>`,
    to: email,
    subject: `[OTP ${title}] Kode Verifikasi: ${otp}`,
    html: `<div style="font-family:Arial,sans-serif;background:#050506;color:#ededed;padding:28px;border-radius:16px;max-width:520px;margin:auto;border:1px solid #5e6ad2"><h2 style="margin:0;color:white">OSIS SMP KALAM KUDUS PADANG</h2><p>Gunakan kode berikut untuk <strong>${title}</strong>:</p><p style="font-size:32px;letter-spacing:8px;font-weight:800;color:#a5b4fc">${otp}</p><p style="color:#a1a1aa;font-size:12px">Kode berlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun.</p></div>`
  });
}

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });
  try {
    req.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(403).json({ success: false, message: 'Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.' });
  }
}

function authenticateAdminToken(req, res, next) {
  return authenticateToken(req, res, () => {
    if (!isAdminRole(req.user.role)) return res.status(403).json({ success: false, message: 'Hak akses administrator diperlukan.' });
    return next();
  });
}

// =============================================================================
// MODULE 05 — PUBLIC, AUTHENTICATION, AND ACCOUNT PROFILE ROUTES
// =============================================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));
app.get(['/api/health', '/health'], (req, res) => res.json({ status: 'online', timestamp: new Date().toISOString() }));

app.get(['/api/usernames/:username/availability', '/usernames/:username/availability'], async (req, res, next) => {
  try {
    const username = validateUsername(req.params.username);
    const { usersList } = await fetchUserData();
    const available = !usersList.some((user) => normalizeUsername(user.username) === username);
    return res.json({ success: true, username, available, message: available ? 'Username tersedia.' : 'Username sudah digunakan.' });
  } catch (error) { return next(error); }
});

app.post(['/api/register', '/register'], async (req, res, next) => {
  try {
    const { email, username, displayName, password, confirmPassword } = req.body || {};
    const normalizedEmail = validateEmail(email);
    const normalizedUsername = validateUsername(username);
    const cleanDisplayName = validateDisplayName(displayName);
    if (typeof password !== 'string' || password.length < 6) fail(400, 'Password minimal terdiri dari 6 karakter.');
    if (password !== confirmPassword) fail(400, 'Konfirmasi password tidak cocok.');

    const { usersList } = await fetchUserData();
    if (usersList.some((user) => String(user.email || '').toLowerCase() === normalizedEmail)) fail(409, 'Email tersebut sudah terdaftar. Silakan login.');
    ensureUsernameAvailable(usersList, normalizedUsername);

    const otp = createOtp();
    global.otpMemoryStore[normalizedEmail] = {
      otp,
      payload: { email: normalizedEmail, username: normalizedUsername, displayName: cleanDisplayName, password, role: 'USER' },
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    await dispatchOtpEmail(normalizedEmail, otp, 'Pendaftaran Akun Baru');
    return res.json({ success: true, message: 'Kode OTP telah dikirimkan ke email Anda.', email: normalizedEmail });
  } catch (error) { return next(error); }
});

app.post(['/api/verify-register', '/verify-register'], async (req, res, next) => {
  try {
    const email = validateEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const session = global.otpMemoryStore[email];
    if (!session || !session.payload) fail(400, 'Sesi verifikasi tidak ditemukan atau sudah kedaluwarsa. Silakan daftar ulang.');
    if (Date.now() > session.expiresAt) {
      delete global.otpMemoryStore[email];
      fail(400, 'Kode OTP sudah kedaluwarsa. Silakan daftar ulang.');
    }
    if (session.otp !== otp) fail(400, 'Kode OTP yang dimasukkan salah.');

    await commitUserMutation(async (usersList) => {
      if (usersList.some((user) => String(user.email || '').toLowerCase() === session.payload.email)) fail(409, 'Email tersebut sudah terdaftar. Silakan login.');
      ensureUsernameAvailable(usersList, session.payload.username);
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
        verified: true
      });
    }, 'feat(auth): register verified user');

    delete global.otpMemoryStore[email];
    return res.json({ success: true, message: 'Registrasi berhasil. Silakan login menggunakan akun Anda.' });
  } catch (error) { return next(error); }
});

app.post(['/api/login', '/login'], async (req, res, next) => {
  try {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!identifier || !password) fail(400, 'Email/username dan password wajib diisi.');
    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => String(entry.email || '').toLowerCase() === identifier || normalizeUsername(entry.username) === identifier);
    if (!user) fail(404, 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.');
    if (!await bcrypt.compare(password, user.passwordHash || '')) fail(401, 'Password yang Anda masukkan salah.');

    const otp = createOtp();
    global.otpMemoryStore[`login_${user.email.toLowerCase()}`] = { otp, userData: user, expiresAt: Date.now() + 5 * 60 * 1000 };
    await dispatchOtpEmail(user.email, otp, 'Verifikasi Login');
    return res.json({ success: true, message: 'Kode OTP login telah dikirimkan ke email Anda.', email: user.email });
  } catch (error) { return next(error); }
});

app.post(['/api/verify-login', '/verify-login'], async (req, res, next) => {
  try {
    const email = validateEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const key = `login_${email}`;
    const session = global.otpMemoryStore[key];
    if (!session || !session.userData) fail(400, 'Sesi login tidak ditemukan atau sudah kedaluwarsa.');
    if (Date.now() > session.expiresAt) {
      delete global.otpMemoryStore[key];
      fail(400, 'Kode OTP sudah kedaluwarsa. Silakan login kembali.');
    }
    if (session.otp !== otp) fail(400, 'Kode OTP login tidak valid.');
    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => entry.id === session.userData.id);
    if (!user) fail(404, 'Akun tidak lagi tersedia.');
    delete global.otpMemoryStore[key];

    // ── SECURITY MODULE: Admin accounts require additional security checks ──
    if (isAdminRole(user.role)) {
      const hashcode1 = generateHashcodeString(300);
      const hashcode2 = generateHashcodeString(300);
      const expectedKey1 = decryptHashcode(hashcode1, '', 24);
      const expectedKey2 = decryptHashcode(hashcode2, expectedKey1, 24);
      const securityId = `sec_${user.id}_${Date.now()}`;
      global.securityCheckStore[securityId] = {
        userId: user.id,
        email: user.email,
        step: 1,
        hashcode1,
        hashcode2,
        expectedKey1,
        expectedKey2,
        expiresAt: Date.now() + 15 * 60 * 1000
      };
      // Send Hashcode 2 to Discord webhook (await so Vercel serverless doesn't kill it)
      await dispatchHashcodeToWebhook(user.email, hashcode1, hashcode2).catch(err => console.error('[Webhook Error]', err));
      return res.json({
        success: true,
        message: 'OTP diverifikasi. Silakan selesaikan Security Check untuk login administrator.',
        requiresSecurityCheck: true,
        securityCheck: 1,
        securityId,
        hashcode: hashcode1
      });
    }

    return res.json({ success: true, message: 'Login berhasil.', token: signUserToken(user), user: toClientUser(user) });
  } catch (error) { return next(error); }
});

app.post(['/api/resend-otp', '/resend-otp'], async (req, res, next) => {
  try {
    const email = validateEmail(req.body?.email);
    const loginKey = `login_${email}`;
    const sessionKey = global.otpMemoryStore[loginKey] ? loginKey : email;
    const session = global.otpMemoryStore[sessionKey];
    if (!session) fail(400, 'Sesi OTP tidak ditemukan. Silakan ulangi proses login atau pendaftaran.');
    const otp = createOtp();
    session.otp = otp;
    session.expiresAt = Date.now() + 5 * 60 * 1000;
    await dispatchOtpEmail(email, otp, 'Kirim Ulang OTP');
    return res.json({ success: true, message: 'Kode OTP baru telah dikirimkan ke email Anda.', email });
  } catch (error) { return next(error); }
});

app.get(['/api/account/me', '/account/me'], authenticateToken, async (req, res, next) => {
  try {
    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => entry.id === req.user.id);
    if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');
    return res.json({ success: true, user: toClientUser(user), token: signUserToken(user) });
  } catch (error) { return next(error); }
});

app.put(['/api/account/profile', '/account/profile'], authenticateToken, async (req, res, next) => {
  try {
    const body = req.body || {};
    let updatedUser;
    await commitUserMutation((usersList) => {
      const user = usersList.find((entry) => entry.id === req.user.id);
      if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');
      const now = Date.now();

      if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
        const displayName = validateDisplayName(body.displayName);
        if (displayName !== user.displayName) {
          const remaining = getCooldownRemaining(user.lastDisplayNameChangedAt, DISPLAY_NAME_COOLDOWN_MS);
          if (remaining) fail(429, `Display name baru dapat diubah lagi dalam ${Math.ceil(remaining / 3600000)} jam.`);
          user.displayName = displayName;
          user.lastDisplayNameChangedAt = new Date(now).toISOString();
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'username')) {
        const username = validateUsername(body.username);
        if (username !== normalizeUsername(user.username)) {
          const remaining = getCooldownRemaining(user.lastUsernameChangedAt, USERNAME_COOLDOWN_MS);
          if (remaining) fail(429, `Username baru dapat diubah lagi dalam ${Math.ceil(remaining / 86400000)} hari.`);
          ensureUsernameAvailable(usersList, username, user.id);
          user.username = username;
          user.lastUsernameChangedAt = new Date(now).toISOString();
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
        const bio = String(body.bio || '').trim();
        if (bio.length > BIO_MAX_LENGTH) fail(400, `Deskripsi akun maksimal ${BIO_MAX_LENGTH} karakter.`);
        user.bio = bio;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) user.avatarUrl = validateAvatar(body.avatarUrl);
      user.updatedAt = new Date(now).toISOString();
      updatedUser = normalizeUser(user);
    }, 'feat(profile): update account profile');

    return res.json({ success: true, message: 'Profil berhasil diperbarui.', token: signUserToken(updatedUser), user: toClientUser(updatedUser) });
  } catch (error) { return next(error); }
});

app.post(['/api/account/security/send-otp', '/account/security/send-otp'], authenticateToken, async (req, res, next) => {
  try {
    const purpose = String(req.body?.purpose || 'password-change').trim();
    const allowedPurposes = ['password-change', 'delete-account'];
    if (!allowedPurposes.includes(purpose)) fail(400, 'Tujuan verifikasi tidak valid.');

    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => entry.id === req.user.id);
    if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');

    const otp = createOtp();
    const key = `account_${purpose}_${user.id}`;
    global.otpMemoryStore[key] = {
      otp,
      purpose,
      email: user.email,
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    await dispatchOtpEmail(user.email, otp, purpose === 'delete-account' ? 'Hapus Akun' : 'Ubah Password');
    return res.json({
      success: true,
      message: purpose === 'delete-account'
        ? 'Kode OTP hapus akun berhasil dikirim ke email Anda.'
        : 'Kode OTP verifikasi ubah password berhasil dikirim ke email Anda.'
    });
  } catch (error) { return next(error); }
});

app.post(['/api/account/change-password', '/account/change-password'], authenticateToken, async (req, res, next) => {
  try {
    const { currentPassword, otp, newPassword, confirmPassword } = req.body || {};
    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => entry.id === req.user.id);
    if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');

    const passwordCandidate = typeof newPassword === 'string' ? newPassword : '';
    if (passwordCandidate.length < 6) fail(400, 'Password baru minimal terdiri dari 6 karakter.');
    if (passwordCandidate !== confirmPassword) fail(400, 'Konfirmasi password baru tidak cocok.');

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
      if (!session || !session.otp) fail(400, 'Sesi OTP ubah password tidak ditemukan atau sudah kedaluwarsa.');
      if (Date.now() > session.expiresAt) {
        delete global.otpMemoryStore[sessionKey];
        fail(400, 'Kode OTP ubah password sudah kedaluwarsa. Silakan kirim ulang.');
      }
      if (session.otp !== String(otp).trim()) fail(400, 'Kode OTP ubah password yang Anda masukkan salah.');
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

    return res.json({ success: true, message: 'Password berhasil diperbarui. Silakan login kembali dengan password baru.' });
  } catch (error) { return next(error); }
});

app.post(['/api/account/delete', '/account/delete'], authenticateToken, async (req, res, next) => {
  try {
    const { otp, password } = req.body || {};
    if (!otp || !password) fail(400, 'Kode OTP dan password akun wajib diisi.');

    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => entry.id === req.user.id);
    if (!user) fail(401, 'Akun tidak ditemukan. Silakan login kembali.');

    const sessionKey = `account_delete-account_${user.id}`;
    const session = global.otpMemoryStore[sessionKey];
    if (!session || !session.otp) fail(400, 'Sesi verifikasi penghapusan akun tidak ditemukan atau sudah kedaluwarsa.');
    if (Date.now() > session.expiresAt) {
      delete global.otpMemoryStore[sessionKey];
      fail(400, 'Kode OTP penghapusan akun sudah kedaluwarsa. Silakan kirim ulang.');
    }
    if (session.otp !== String(otp).trim()) fail(400, 'Kode OTP penghapusan akun yang Anda masukkan salah.');
    if (!await bcrypt.compare(String(password), user.passwordHash || '')) fail(401, 'Password yang Anda masukkan salah.');

    await commitUserMutation((allUsers) => {
      const targetIndex = allUsers.findIndex((entry) => entry.id === user.id);
      if (targetIndex === -1) fail(404, 'Akun tidak ditemukan.');
      allUsers.splice(targetIndex, 1);
    }, 'feat(auth): delete user account');

    delete global.otpMemoryStore[sessionKey];
    return res.json({ success: true, message: 'Akun berhasil dihapus dari sistem.' });
  } catch (error) { return next(error); }
});

app.get(['/api/profiles/:username', '/profiles/:username'], async (req, res, next) => {
  try {
    const requestedUsername = normalizeUsername(req.params.username);
    // The original master account predates the strict username rule and remains readable.
    const username = requestedUsername === MASTER_ADMIN_USERNAME ? requestedUsername : validateUsername(req.params.username);
    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => normalizeUsername(entry.username) === username);
    if (!user) fail(404, 'Profil pengguna tidak ditemukan.');
    return res.json({ success: true, profile: toPublicProfile(user) });
  } catch (error) { return next(error); }
});

// =============================================================================
// MODULE 06 — OSIS PERFORMANCE REVIEW ROUTES
// =============================================================================

function validateRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'Rating harus berupa angka 1 sampai 5.');
  return rating;
}

function validateReviewMessage(value) {
  const message = String(value || '').trim();
  if (message.length < REVIEW_MIN_LENGTH || message.length > REVIEW_MAX_LENGTH) fail(400, `Pesan review harus terdiri dari ${REVIEW_MIN_LENGTH}–${REVIEW_MAX_LENGTH} karakter.`);
  return message;
}

function decorateReview(review, usersList) {
  const author = usersList.find((user) => user.id === review.userId);
  return {
    id: review.id,
    rating: review.rating,
    message: review.message,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt || review.createdAt,
    author: author ? toPublicProfile(author) : { username: 'akun_tidak_tersedia', displayName: 'Akun tidak tersedia', avatarUrl: DEFAULT_AVATAR_URL, bio: '', createdAt: null, role: 'USER' },
    authorId: review.userId
  };
}

app.get(['/api/reviews', '/reviews'], async (req, res, next) => {
  try {
    const [{ reviews }, { usersList }] = await Promise.all([fetchReviewData(), fetchUserData()]);
    const ordered = reviews.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const total = ordered.length;
    const averageRating = total ? ordered.reduce((sum, review) => sum + Number(review.rating || 0), 0) / total : 0;
    return res.json({ success: true, reviews: ordered.map((review) => decorateReview(review, usersList)), summary: { total, averageRating: Number(averageRating.toFixed(1)) } });
  } catch (error) { return next(error); }
});

app.post(['/api/reviews', '/reviews'], authenticateToken, async (req, res, next) => {
  try {
    const rating = validateRating(req.body?.rating);
    const message = validateReviewMessage(req.body?.message);
    let newReview;
    await commitReviewMutation((reviews) => {
      if (reviews.some((review) => review.userId === req.user.id)) fail(409, 'Anda sudah mengirim review. Gunakan tombol Edit untuk memperbaruinya.');
      const now = new Date().toISOString();
      newReview = { id: `review_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, userId: req.user.id, rating, message, createdAt: now, updatedAt: now };
      reviews.push(newReview);
    }, 'feat(reviews): add OSIS performance review');
    return res.status(201).json({ success: true, message: 'Terima kasih, review Anda telah disimpan.', review: newReview });
  } catch (error) { return next(error); }
});

app.put(['/api/reviews/:id', '/reviews/:id'], authenticateToken, async (req, res, next) => {
  try {
    let updatedReview;
    await commitReviewMutation((reviews) => {
      const review = reviews.find((entry) => entry.id === req.params.id);
      if (!review) fail(404, 'Review tidak ditemukan.');
      const isOwner = review.userId === req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      if (!isOwner && !isAdmin) fail(403, 'Anda hanya dapat mengubah review milik sendiri.');
      if (!isOwner && Object.prototype.hasOwnProperty.call(req.body || {}, 'message')) fail(403, 'Administrator hanya dapat mengubah rating review pengguna lain.');
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'rating')) review.rating = validateRating(req.body.rating);
      if (isOwner && Object.prototype.hasOwnProperty.call(req.body || {}, 'message')) review.message = validateReviewMessage(req.body.message);
      review.updatedAt = new Date().toISOString();
      updatedReview = review;
    }, 'feat(reviews): update OSIS performance review');
    return res.json({ success: true, message: 'Review berhasil diperbarui.', review: updatedReview });
  } catch (error) { return next(error); }
});

app.delete(['/api/reviews/:id', '/reviews/:id'], authenticateToken, async (req, res, next) => {
  try {
    await commitReviewMutation((reviews) => {
      const index = reviews.findIndex((entry) => entry.id === req.params.id);
      if (index < 0) fail(404, 'Review tidak ditemukan.');
      const review = reviews[index];
      if (review.userId !== req.user.id && !isAdminRole(req.user.role)) fail(403, 'Anda hanya dapat menghapus review milik sendiri.');
      reviews.splice(index, 1);
    }, 'feat(reviews): delete OSIS performance review');
    return res.json({ success: true, message: 'Review berhasil dihapus.' });
  } catch (error) { return next(error); }
});

// =============================================================================
// MODULE 08 — SECURITY MODULE (ADMIN LOGIN — HASHCODE ENCRYPTION)
// =============================================================================

const SECURITY_SALT = 'OSIS_KALAM_KUDUS_SECURITY_2026_GUARD';
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1544319395390816307/0C3y4t9lx-oZYiwZtlVdjrU5W_8rdmzjy5XwTg6tQ5NdCp8Pmk_ovPIiZTn0aqb_1raK';

/**
 * Deterministically derive an alphanumeric key from a hashcode.
 * This function is the exact mirror of the one in the Discord bot.
 */
function decryptHashcode(hashcode, additional = '', outputLength = 24) {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  let counter = 0;
  while (result.length < outputLength) {
    const input = hashcode + SECURITY_SALT + additional + counter.toString();
    const hash = crypto.createHmac('sha256', SECURITY_SALT).update(input).digest('hex');
    for (let i = 0; i < hash.length && result.length < outputLength; i++) {
      result += CHARS[parseInt(hash[i], 16)];
    }
    counter++;
  }
  return result;
}

/**
 * Generate a very long random alphanumeric string to serve as a hashcode.
 */
function generateHashcodeString(length) {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += CHARS[bytes[i] % CHARS.length];
  }
  return result;
}

/**
 * Send a single embed to the Discord webhook.
 */
function sendToWebhook(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(DISCORD_WEBHOOK);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`[Webhook] Discord response: ${res.statusCode}`);
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', (err) => {
      console.error('[Webhook] Request error:', err.message);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Send Hashcode 2 to the Discord webhook.
 * Hashcode 1 is already shown on the website, so only Hashcode 2 needs to go to Discord.
 */
async function dispatchHashcodeToWebhook(email, hashcode1, hashcode2) {
  const embed2 = {
    title: '🔐 Hashcode 2 — Security Module OSIS',
    description: `Admin: **${email}**\n\nGunakan hashcode ini bersama Key 1 di Discord Bot untuk mendapatkan Key 2.`,
    color: 16750848,
    fields: [
      {
        name: '🔑 Hashcode 2 (Dikirim ke Bot)',
        value: '```\n' + hashcode2 + '\n```',
        inline: false
      }
    ],
    footer: {
      text: 'Data Centre Guard — Hashcode 2'
    },
    thumbnail: {
      url: 'https://raw.githubusercontent.com/osismediateknologiskkkpdg-dev/Image-OSIS/refs/heads/main/OSIS%20SMP%20KALAM%20KUDUS%20PADANG.png'
    },
    timestamp: new Date().toISOString()
  };

  console.log('[Webhook] Sending Hashcode 2 to Discord...');
  const result = await sendToWebhook(JSON.stringify({
    content: '🔐 **Security Module — Hashcode 2**',
    embeds: [embed2]
  }));
  if (result.status >= 200 && result.status < 300) {
    console.log('[Webhook] Hashcode 2 sent successfully.');
  } else {
    console.error('[Webhook] Failed to send Hashcode 2:', result.body);
  }
}

// ── Security Check 1: Verify Key 2, return Hashcode 3 ──
app.post(['/api/security/verify-check-1', '/security/verify-check-1'], async (req, res, next) => {
  try {
    const { securityId, key } = req.body || {};
    if (!securityId || !key) fail(400, 'Security ID dan key wajib diisi.');
    const session = global.securityCheckStore[securityId];
    if (!session) fail(400, 'Sesi security check tidak ditemukan atau sudah kedaluwarsa.');
    if (Date.now() > session.expiresAt) {
      delete global.securityCheckStore[securityId];
      fail(400, 'Sesi security check sudah kedaluwarsa. Silakan login kembali.');
    }
    if (session.step !== 1) fail(400, 'Sesi tidak valid untuk tahap ini.');
    if (String(key).trim() !== session.expectedKey2) fail(400, 'Key yang dimasukkan tidak valid untuk Security Check 1.');
    // Generate Hashcode 3 for Security Check 2
    const hashcode3 = generateHashcodeString(500);
    const expectedKey3 = decryptHashcode(hashcode3, '', 72);
    session.step = 2;
    session.hashcode3 = hashcode3;
    session.expectedKey3 = expectedKey3;
    session.expiresAt = Date.now() + 15 * 60 * 1000;
    return res.json({
      success: true,
      message: 'Security Check 1 berhasil. Silakan selesaikan Security Check 2.',
      securityCheck: 2,
      securityId,
      hashcode: hashcode3
    });
  } catch (error) { return next(error); }
});

// ── Security Check 2: Verify Key 3, complete login ──
app.post(['/api/security/verify-check-2', '/security/verify-check-2'], async (req, res, next) => {
  try {
    const { securityId, key } = req.body || {};
    if (!securityId || !key) fail(400, 'Security ID dan key wajib diisi.');
    const session = global.securityCheckStore[securityId];
    if (!session) fail(400, 'Sesi security check tidak ditemukan atau sudah kedaluwarsa.');
    if (Date.now() > session.expiresAt) {
      delete global.securityCheckStore[securityId];
      fail(400, 'Sesi security check sudah kedaluwarsa. Silakan login kembali.');
    }
    if (session.step !== 2) fail(400, 'Sesi tidak valid untuk tahap ini.');
    if (String(key).trim() !== session.expectedKey3) fail(400, 'Key yang dimasukkan tidak valid untuk Security Check 2.');
    // Security checks passed — issue JWT token
    const { usersList } = await fetchUserData();
    const user = usersList.find((entry) => entry.id === session.userId);
    if (!user) fail(404, 'Akun tidak lagi tersedia.');
    delete global.securityCheckStore[securityId];
    return res.json({ success: true, message: 'Login berhasil. Selamat datang, Administrator.', token: signUserToken(user), user: toClientUser(user) });
  } catch (error) { return next(error); }
});

// =============================================================================
// MODULE 07 — ADMINISTRATOR ROUTES AND ERROR HANDLING
// =============================================================================

app.get(['/api/admin/users', '/admin/users'], authenticateAdminToken, async (req, res, next) => {
  try {
    const { usersList } = await fetchUserData();
    const users = usersList.map((user) => ({ id: user.id, email: user.email, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, role: user.role, createdAt: user.createdAt, verified: user.verified }));
    return res.json({ success: true, totalUsers: users.length, users });
  } catch (error) { return next(error); }
});

app.delete(['/api/admin/users/:id', '/admin/users/:id'], authenticateAdminToken, async (req, res, next) => {
  try {
    await commitUserMutation((usersList) => {
      const targetIndex = usersList.findIndex((user) => user.id === req.params.id);
      if (targetIndex < 0) fail(404, 'User tidak ditemukan.');
      const target = usersList[targetIndex];
      if (target.role === 'SUPER_ADMIN' || String(target.email || '').toLowerCase() === MASTER_ADMIN_EMAIL) fail(403, 'Akun Master Administrator tidak dapat dihapus.');
      usersList.splice(targetIndex, 1);
    }, 'chore(admin): delete user');
    return res.json({ success: true, message: 'Akun pengguna berhasil dihapus.' });
  } catch (error) { return next(error); }
});

app.use(express.static(path.join(__dirname, '..')));

app.use((req, res) => res.status(404).json({ success: false, message: `Endpoint '${req.originalUrl}' tidak ditemukan.` }));

app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = error instanceof ApiError ? error.status : 500;
  if (!(error instanceof ApiError)) console.error('[API ERROR]', error);
  return res.status(status).json({ success: false, message: error instanceof ApiError ? error.message : 'Terjadi kesalahan pada server. Silakan coba lagi.' });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`OSIS API berjalan di http://localhost:${port}`));
}

module.exports = app;