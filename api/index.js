/**
 * ============================================================================
 * SERVER BACKEND UTAMA SYSTEM AUTHENTICATION & PROFILE MANAGEMENT OSIS
 * OSIS SMP KRISTEN KALAM KUDUS PADANG
 * File: api/index.js
 * Engine: Express.js Unified Serverless Handler for Vercel & GitHub Storage
 * Version: 3.0.0 (Production-Grade Security, OTP & Profile Customization Engine)
 * ============================================================================
 * 
 * DESKRIPSI PEMBARUAN V3.0.0:
 * 1. Kustomisasi Foto Profil/Avatar (Upload langsung dari komputer via Base64 Data URL).
 * 2. Kustomisasi Deskripsi Akun (Bio Profil Pengguna).
 * 3. Fitur Edit Display Name dengan proteksi pembatasan Cooldown (1x dalam 24 Jam).
 * 4. Fitur Edit Username dengan proteksi Cooldown (1x dalam 7 Hari) & Validasi Keunikan 
 *    (Anti-Collision agar username tidak pernah bertabrakan dengan pengguna lain).
 * 5. Sinkronisasi Asinkronus ke Repositori GitHub User_data.json tanpa merusak/mengganggu
 *    data pengguna yang sudah terdaftar.
 * 6. Otentikasi OTP Wajib & Sistem Keamanan JWT Token dengan Payload Terkini.
 * ============================================================================
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

const app = express();

// ============================================================================
// KONSTANTA MASTER & COOLDOWN MANAGEMENT
// ============================================================================
const MASTER_ADMIN_EMAIL = "osismediateknologiskkkpdg@gmail.com";
const MASTER_ADMIN_USERNAME = "admin osis";
const MASTER_ADMIN_DISPLAY = "Administrator OSIS";
const MASTER_ADMIN_RAW_PASS = "skkk2019osismedia&teknologi";

// Batasan Cooldown Perubahan Profil dalam Milidetik
const DISPLAY_NAME_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 Jam (1 Hari)
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;  // 168 Jam (7 Hari)

// ============================================================================
// GLOBAL PROCESS SAFETY & UNCAUGHT EXCEPTION SHIELD
// ============================================================================
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL SYSTEM ERROR] Uncaught Exception Detected:', err.stack || err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL SYSTEM ERROR] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// ============================================================================
// EXPRESS MIDDLEWARE CONFIGURATION
// ============================================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Mengatur Limit Payload 10MB untuk mendukung Unggahan Gambar Avatar Base64 dari Komputer
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Memory Storage Global untuk Pengelolaan Sesi Kode OTP sementara
global.otpMemoryStore = global.otpMemoryStore || {};

// ============================================================================
// HELPER UTILITIES: SANITIZATION, DIAGNOSTICS & COOLDOWN CALCULATORS
// ============================================================================

/**
 * Membersihkan Token GitHub dari spasi, baris baru, atau karakter tanda petik tak sengaja.
 * @param {string} rawToken 
 * @returns {string|null}
 */
function sanitizeGitHubToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return rawToken.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

/**
 * Menyamarkan string token untuk keamanan pencatatan log diagnostik.
 * @param {string} token 
 * @returns {string}
 */
function maskTokenForDiagnostics(token) {
  if (!token) return '[NOT CONFIGURED]';
  if (token.length <= 8) return '****';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

/**
 * Menghitung sisa waktu cooldown dalam format jam/menit/hari yang mudah dibaca manusia.
 * @param {number} remainingMs 
 * @returns {string}
 */
function formatTimeRemaining(remainingMs) {
  const totalMinutes = Math.ceil(remainingMs / (1000 * 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} menit`;
  }
  const totalHours = Math.ceil(remainingMs / (1000 * 60 * 60));
  if (totalHours < 24) {
    return `${totalHours} jam`;
  }
  const totalDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  return `${totalDays} hari`;
}

/**
 * Memeriksa apakah string merupakan format gambar Base64 Data URL yang valid.
 * @param {string} str 
 * @returns {boolean}
 */
function isValidBase64Image(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('data:image/') && str.includes(';base64,');
}

// ============================================================================
// HELPER 1: NATIVE HTTPS GITHUB REST API TRANSCEIVER ENGINE
// ============================================================================

/**
 * Melakukan HTTP REST API Request ke GitHub Repositori secara Asinkron
 * @param {string} endpointMethod 
 * @param {string} apiPath 
 * @param {object|null} requestBodyData 
 * @returns {Promise<object>}
 */
function makeGitHubApiRequest(endpointMethod, apiPath, requestBodyData = null) {
  return new Promise((resolve, reject) => {
    const rawToken = process.env.GITHUB_TOKEN;
    const cleanToken = sanitizeGitHubToken(rawToken);
    const rawOwner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : null;
    const rawRepo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : null;

    if (!cleanToken) {
      return reject(new Error("Konfigurasi 'GITHUB_TOKEN' tidak ditemukan di Environment Variables."));
    }
    if (!rawOwner || !rawRepo) {
      return reject(new Error("Konfigurasi 'GITHUB_OWNER' atau 'GITHUB_REPO' belum diisi di Environment Variables."));
    }

    const requestPayload = requestBodyData ? JSON.stringify(requestBodyData) : null;

    const requestOptions = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${rawOwner}/${rawRepo}/${apiPath}`,
      method: endpointMethod.toUpperCase(),
      headers: {
        'User-Agent': 'OSIS-KalamKudus-Serverless-App',
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(requestPayload && { 'Content-Length': Buffer.byteLength(requestPayload) })
      }
    };

    const req = https.request(requestOptions, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedJson = JSON.parse(responseBody);
            resolve(parsedJson);
          } catch (pErr) {
            resolve(responseBody);
          }
        } else if (res.statusCode === 401) {
          reject(new Error(`GitHub API Error [401 Bad Credentials]: GITHUB_TOKEN ditolak. Mask: ${maskTokenForDiagnostics(cleanToken)}`));
        } else if (res.statusCode === 404) {
          reject(new Error(`GitHub API Error [404 Not Found]: File 'User_data.json' atau Repositori '${rawOwner}/${rawRepo}' tidak ditemukan.`));
        } else {
          reject(new Error(`GitHub API Error [${res.statusCode}]: ${responseBody}`));
        }
      });
    });

    req.on('error', (reqErr) => {
      reject(new Error(`Koneksi HTTPS ke GitHub API Gagal: ${reqErr.message}`));
    });

    if (requestPayload) {
      req.write(requestPayload);
    }

    req.end();
  });
}

/**
 * Membaca File User_data.json dari GitHub & Menjamin Auto-Seeding Administrator Utama.
 * Jika Akun Administrator Sudah Ada di File, Maka TIDAK AKAN DIBUAT ULANG.
 */
async function fetchUserDataFromGitHub() {
  const branchName = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';
  try {
    const responseData = await makeGitHubApiRequest('GET', `contents/User_data.json?ref=${branchName}`);
    const decodedContent = Buffer.from(responseData.content, 'base64').toString('utf-8');
    let parsedUsers = JSON.parse(decodedContent);

    if (!Array.isArray(parsedUsers)) {
      parsedUsers = [];
    }

    // ========================================================================
    // PENGECEKAN DUPLIKASI ADMINISTRATOR UTAMA (STRICT ANTI-DUPLICATE CHECK)
    // ========================================================================
    const adminExists = parsedUsers.some(
      (user) => (user.email && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) ||
                (user.username && user.username.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase())
    );

    // HANYA buat akun jika SAMA SEKALI BELUM ADA di User_data.json
    if (!adminExists) {
      console.log('[AUTO-SEED] Akun Administrator belum ditemukan. Melakukan Inisialisasi Akun Master...');
      
      const salt = await bcrypt.genSalt(10);
      const adminHashedPass = await bcrypt.hash(MASTER_ADMIN_RAW_PASS, salt);

      const adminUserObj = {
        id: "usr_master_admin_001",
        email: MASTER_ADMIN_EMAIL.toLowerCase(),
        username: MASTER_ADMIN_USERNAME.toLowerCase(),
        displayName: MASTER_ADMIN_DISPLAY,
        bio: "Administrator Resmi Platform OSIS SMP Kristen Kalam Kudus Padang.",
        avatarUrl: "/default-avatar.png",
        passwordHash: adminHashedPass,
        role: "SUPER_ADMIN",
        createdAt: new Date().toISOString(),
        lastDisplayNameChange: null,
        lastUsernameChange: null,
        verified: true
      };

      parsedUsers.unshift(adminUserObj);
      
      // Simpan perubahan initial seeding ke GitHub
      await saveUserDataToGitHub(parsedUsers, responseData.sha);
      console.log('[AUTO-SEED SUCCESS] Akun Administrator berhasil dibuat & tersimpan di User_data.json GitHub.');
    }

    return {
      usersList: parsedUsers,
      fileSha: responseData.sha
    };
  } catch (err) {
    console.warn('[GITHUB READ WARNING]:', err.message);
    return { usersList: [], fileSha: null, errorDetail: err.message };
  }
}

/**
 * Menyimpan / Meng-commit Pembaruan Array User_data.json ke GitHub Repositori
 */
async function saveUserDataToGitHub(updatedUsersArray, currentSha) {
  const branchName = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';
  const base64EncodedContent = Buffer.from(JSON.stringify(updatedUsersArray, null, 2)).toString('base64');

  const commitPayload = {
    message: 'chore(profile): update User_data.json via Express Serverless API',
    content: base64EncodedContent,
    branch: branchName
  };

  if (currentSha) {
    commitPayload.sha = currentSha;
  }

  return await makeGitHubApiRequest('PUT', 'contents/User_data.json', commitPayload);
}

// ============================================================================
// HELPER 2: NODEMAILER SMTP TRANSPORTER ENGINE
// ============================================================================

function createSmtpTransporter() {
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : null;
  const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!user || !pass) {
    throw new Error("Kredensial SMTP belum lengkap! Pastikan 'SMTP_USER' dan 'SMTP_PASS' tersedia di Environment Variables.");
  }

  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: {
      user: user,
      pass: pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Mengirimkan Email Kode OTP Verifikasi Keamanan ke Email Tujuan
 */
async function dispatchOTPEmail(targetEmailAddress, otpCodeNumber, actionTitleHeader) {
  const transporter = createSmtpTransporter();

  const emailHtmlBody = `
    <div style="font-family: 'Inter', Arial, sans-serif; background-color: #050506; color: #EDEDEF; padding: 32px; border-radius: 16px; max-width: 520px; margin: 0 auto; border: 1px solid #5E6AD2;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">OSIS SMP KALAM KUDUS PADANG</h2>
        <p style="color: #8A8F98; font-size: 11px; font-family: monospace; margin-top: 4px; text-transform: uppercase;">Official Authentication System</p>
      </div>
      <p style="font-size: 14px; color: #EDEDEF; line-height: 1.6;">Halo,</p>
      <p style="font-size: 14px; color: #EDEDEF; line-height: 1.6;">Berikut adalah Kode Otentikasi Sekali Pakai (OTP) Anda untuk melakukan <strong>${actionTitleHeader}</strong>:</p>
      <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 18px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #6872D9; border-radius: 12px; margin: 24px 0; font-family: monospace;">
        ${otpCodeNumber}
      </div>
      <p style="font-size: 12px; color: #8A8F98; text-align: center; margin: 0;">Kode OTP ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapapun demi keamanan akun Anda.</p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 28px 0 16px 0;" />
      <p style="font-size: 10px; color: #606060; text-align: center; margin: 0;">&copy; 2026 OSIS SMP Kristen Kalam Kudus Padang. All Rights Reserved.</p>
    </div>
  `;

  return await transporter.sendMail({
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER.trim()}>`,
    to: targetEmailAddress,
    subject: `[OTP ${actionTitleHeader}] Kode Verifikasi Keamanan: ${otpCodeNumber}`,
    html: emailHtmlBody
  });
}

// ============================================================================
// AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) MIDDLEWARE
// ============================================================================

/**
 * Middleware untuk otentikasi JWT Token umum pengguna.
 */
function authenticateUserToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Akses Ditolak! Token otentikasi tidak ditemukan. Silakan login kembali.' });
  }

  const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
  jwt.verify(token, secretKey, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Sesi token tidak valid atau telah kedaluwarsa!' });
    }

    req.user = decodedUser;
    next();
  });
}

/**
 * Middleware untuk otentikasi Administrator (SUPER_ADMIN / ADMIN).
 */
function authenticateAdminToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Akses Ditolak! Token otentikasi tidak ditemukan.' });
  }

  const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
  jwt.verify(token, secretKey, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Sesi token tidak valid atau telah kedaluwarsa!' });
    }

    if (decodedUser.role !== 'SUPER_ADMIN' && decodedUser.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Akses Ditolak! Hak akses khusus Administrator diperlukan.' });
    }

    req.user = decodedUser;
    next();
  });
}

// ============================================================================
// EXPRESS ROUTING HANDLERS
// ============================================================================

// FRONTEND ROUTE: Menyajikan index.html saat GET / dipanggil
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '../index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(200).send('<h1>Server OSIS SMP Kristen Kalam Kudus Padang Online</h1>');
});

// HEALTH & DIAGNOSTICS CHECK ROUTE
app.get(['/api/health', '/health'], async (req, res) => {
  const tokenClean = sanitizeGitHubToken(process.env.GITHUB_TOKEN);
  return res.status(200).json({
    status: 'online',
    system: 'OSIS SMP Kalam Kudus Padang Authentication & Profile API',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    diagnostics: {
      smtpUserConfigured: !!process.env.SMTP_USER,
      githubOwnerConfigured: !!process.env.GITHUB_OWNER,
      githubRepoConfigured: !!process.env.GITHUB_REPO,
      githubTokenMask: maskTokenForDiagnostics(tokenClean)
    }
  });
});

// ROUTE 1: REGISTER USER (REQUEST OTP)
app.post(['/api/register', '/register'], async (req, res) => {
  try {
    const { email, username, displayName, password, confirmPassword } = req.body || {};

    if (!email || !username || !displayName || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Semua kolom formulir pendaftaran wajib diisi!' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal terdiri dari 6 karakter!' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const { usersList } = await fetchUserDataFromGitHub();
    const isDuplicate = usersList.some(
      (u) => (u.email && u.email.toLowerCase() === normalizedEmail) ||
             (u.username && u.username.toLowerCase() === normalizedUsername)
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'Email atau Username sudah terdaftar! Silakan login atau gunakan akun lain.'
      });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    global.otpMemoryStore[normalizedEmail] = {
      otp: generatedOtp,
      payload: {
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: displayName.trim(),
        password: password,
        role: "USER"
      },
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    await dispatchOTPEmail(normalizedEmail, generatedOtp, 'Pendaftaran Akun Baru');

    return res.status(200).json({
      success: true,
      message: 'Kode OTP Verifikasi telah dikirimkan ke email Anda. Silakan cek Inbox/Spam.',
      email: normalizedEmail
    });
  } catch (error) {
    console.error('Error /api/register:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses pendaftaran: ' + (error.message || 'Terjadi kesalahan sistem internal.')
    });
  }
});

// ROUTE 2: VERIFY REGISTER OTP & SAVE TO GITHUB
app.post(['/api/verify-register', '/verify-register'], async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cachedData = global.otpMemoryStore[normalizedEmail];

    if (!cachedData) {
      return res.status(400).json({ success: false, message: 'Sesi verifikasi OTP tidak ditemukan atau telah kadaluwarsa. Silakan daftar ulang.' });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete global.otpMemoryStore[normalizedEmail];
      return res.status(400).json({ success: false, message: 'Kode OTP telah kadaluwarsa! Silakan ajukan registrasi ulang.' });
    }

    if (cachedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP yang Anda masukkan salah!' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(cachedData.payload.password, salt);

    const { usersList, fileSha } = await fetchUserDataFromGitHub();

    const newUserObject = {
      id: 'usr_' + Date.now(),
      email: cachedData.payload.email,
      username: cachedData.payload.username,
      displayName: cachedData.payload.displayName,
      bio: "Halo! Saya adalah siswa SMP Kristen Kalam Kudus Padang.",
      avatarUrl: "/default-avatar.png",
      passwordHash: hashedPassword,
      role: cachedData.payload.role || "USER",
      createdAt: new Date().toISOString(),
      lastDisplayNameChange: null,
      lastUsernameChange: null,
      verified: true
    };

    usersList.push(newUserObject);

    await saveUserDataToGitHub(usersList, fileSha);

    delete global.otpMemoryStore[normalizedEmail];

    return res.status(200).json({
      success: true,
      message: 'Registrasi Berhasil! Data Akun Anda telah tersimpan di User_data.json. Silakan Login.'
    });
  } catch (error) {
    console.error('Error /api/verify-register:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyelesaikan verifikasi pendaftaran: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

// ROUTE 3: LOGIN USER (REQUEST OTP - BERLAKU UNTUK SEMUA AKUN TERMASUK ADMIN)
app.post(['/api/login', '/login'], async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    
    // Ambil data user dari GitHub (sekaligus melakukan auto-seed jika belum pernah ada)
    const { usersList } = await fetchUserDataFromGitHub();

    const foundUser = usersList.find(
      (u) => (u.email && u.email.toLowerCase() === cleanIdentifier) ||
             (u.username && u.username.toLowerCase() === cleanIdentifier)
    );

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Akun tidak ditemukan! Silakan periksa kembali kredensial Anda atau mendaftar terlebih dahulu.',
        suggestRegister: true
      });
    }

    // Verifikasi Password Hash dengan BcryptJS
    const isMatch = await bcrypt.compare(password, foundUser.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah!',
        suggestRegister: false
      });
    }

    // MANDATORY OTP ENFORCEMENT
    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = 'login_' + foundUser.email.toLowerCase();

    global.otpMemoryStore[cacheKey] = {
      otp: loginOtp,
      userData: foundUser,
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    // Dispatch Kode OTP via Gmail Nodemailer
    await dispatchOTPEmail(foundUser.email, loginOtp, 'Verifikasi Otentikasi Masuk');

    return res.status(200).json({
      success: true,
      message: 'Kredensial cocok! Kode OTP Verifikasi Login telah dikirimkan ke email Anda.',
      email: foundUser.email
    });
  } catch (error) {
    console.error('Error /api/login:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses login: ' + (error.message || 'Terjadi kesalahan sistem internal.')
    });
  }
});

// ROUTE 4: VERIFY LOGIN OTP & GENERATE JWT TOKEN WITH FULL PROFILE PAYLOAD
app.post(['/api/verify-login', '/verify-login'], async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cacheKey = 'login_' + cleanEmail;
    const cachedData = global.otpMemoryStore[cacheKey];

    if (!cachedData) {
      return res.status(400).json({ success: false, message: 'Sesi login tidak ditemukan atau sudah kadaluwarsa.' });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete global.otpMemoryStore[cacheKey];
      return res.status(400).json({ success: false, message: 'Kode OTP telah kadaluwarsa. Silakan ulangi proses login.' });
    }

    if (cachedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP Verifikasi Login tidak valid!' });
    }

    const userData = cachedData.userData;

    // Penerbitan JWT Token dengan Payload Pengguna Lengkap
    const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
    const jwtToken = jwt.sign(
      {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        displayName: userData.displayName,
        role: userData.role || 'USER'
      },
      secretKey,
      { expiresIn: '24h' }
    );

    delete global.otpMemoryStore[cacheKey];

    return res.status(200).json({
      success: true,
      message: 'Autentikasi Berhasil! Selamat datang di Portal OSIS SMP Kalam Kudus Padang.',
      token: jwtToken,
      user: {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        displayName: userData.displayName,
        bio: userData.bio || "",
        avatarUrl: userData.avatarUrl || "/default-avatar.png",
        role: userData.role || 'USER',
        lastDisplayNameChange: userData.lastDisplayNameChange || null,
        lastUsernameChange: userData.lastUsernameChange || null
      }
    });
  } catch (error) {
    console.error('Error /api/verify-login:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan verifikasi login: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

// ROUTE 5: KIRIM ULANG KODE OTP (RESEND OTP HANDLER)
app.post(['/api/resend-otp', '/resend-otp'], async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Alamat Email wajib disertakan untuk mengirim ulang kode OTP.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const loginCacheKey = 'login_' + normalizedEmail;
    
    const newOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // Masa berlaku 5 menit

    let sessionFound = false;

    // 1. Perbarui Sesi Login jika user sedang dalam alur Login
    if (global.otpMemoryStore[loginCacheKey]) {
      global.otpMemoryStore[loginCacheKey].otp = newOtpCode;
      global.otpMemoryStore[loginCacheKey].expiresAt = expiresAt;
      sessionFound = true;
    }

    // 2. Perbarui Sesi Registrasi jika user sedang dalam alur Register
    if (global.otpMemoryStore[normalizedEmail]) {
      global.otpMemoryStore[normalizedEmail].otp = newOtpCode;
      global.otpMemoryStore[normalizedEmail].expiresAt = expiresAt;
      sessionFound = true;
    }

    // 3. Jika tidak ada sesi di memori, buatkan entri cadangan baru
    if (!sessionFound) {
      global.otpMemoryStore[normalizedEmail] = {
        otp: newOtpCode,
        expiresAt: expiresAt
      };
    }

    // Kirim ulang email berisi Kode OTP baru via Nodemailer
    await dispatchOTPEmail(normalizedEmail, newOtpCode, 'Kirim Ulang Kode OTP');

    console.log(`[RESEND OTP SUCCESS] Kode OTP baru (${newOtpCode}) dikirim ke: ${normalizedEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Kode OTP baru berhasil dikirimkan ke email Anda.',
      email: normalizedEmail,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error pada endpoint /api/resend-otp:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengirim ulang OTP akibat kendala server: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

// ============================================================================
// PROFILE CUSTOMIZATION & USERNAME CHECK ENDPOINTS
// ============================================================================

// ROUTE 6: CHECK USERNAME AVAILABILITY (ANTI-COLLISION CHECK)
app.get(['/api/check-username', '/check-username'], async (req, res) => {
  try {
    const { username, userId } = req.query || {};

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Parameter username wajib diisi.'
      });
    }

    const targetUsername = username.trim().toLowerCase();
    const { usersList } = await fetchUserDataFromGitHub();

    // Periksa apakah username sudah digunakan oleh akun lain (abaikan ID akun sendiri)
    const isTaken = usersList.some((u) => {
      if (userId && u.id === userId) {
        return false;
      }
      return u.username && u.username.trim().toLowerCase() === targetUsername;
    });

    return res.status(200).json({
      success: true,
      available: !isTaken,
      message: isTaken ? `Username "${username}" sudah digunakan oleh akun lain.` : `Username "${username}" tersedia.`
    });
  } catch (error) {
    console.error('Error /api/check-username:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengecek ketersediaan username: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

// ROUTE 7: GET CURRENT USER PROFILE (AUTENTIKASI TOKEN REQUIRED)
app.get(['/api/profile', '/profile', '/api/user/profile'], authenticateUserToken, async (req, res) => {
  try {
    const { usersList } = await fetchUserDataFromGitHub();
    const currentUser = usersList.find((u) => u.id === req.user.id || u.email.toLowerCase() === req.user.email.toLowerCase());

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'Data profil akun tidak ditemukan di server.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        displayName: currentUser.displayName,
        bio: currentUser.bio || "",
        avatarUrl: currentUser.avatarUrl || "/default-avatar.png",
        role: currentUser.role || 'USER',
        createdAt: currentUser.createdAt,
        lastDisplayNameChange: currentUser.lastDisplayNameChange || null,
        lastUsernameChange: currentUser.lastUsernameChange || null
      }
    });
  } catch (error) {
    console.error('Error GET /api/profile:', error.message || error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data profil: ' + error.message });
  }
});

// ROUTE 8: UPDATE PROFILE (AVATAR, BIO, DISPLAY NAME 1x/HARII, USERNAME 1x/MINGGU)
app.put(['/api/profile/update', '/profile/update', '/api/user/profile/update'], async (req, res) => {
  try {
    const { userId, email, newDisplayName, newUsername, newBio, newAvatarBase64 } = req.body || {};

    // Penentuan ID atau Email Pengguna
    let targetIdentifier = userId || email;

    // Jika menggunakan Authorization Header Token
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.split(' ')[1]) {
      try {
        const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
        const decoded = jwt.verify(authHeader.split(' ')[1], secretKey);
        if (decoded && decoded.id) {
          targetIdentifier = decoded.id;
        }
      } catch (tokenErr) {
        // Fallback ke userId dari req.body jika token kadaluwarsa namun ID disertakan
      }
    }

    if (!targetIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Pengenal Akun (userId atau email) wajib disertakan untuk memperbarui profil.'
      });
    }

    // Ambil daftar seluruh pengguna dari GitHub
    const { usersList, fileSha } = await fetchUserDataFromGitHub();

    const userIndex = usersList.findIndex((u) => 
      u.id === targetIdentifier || 
      (u.email && u.email.toLowerCase() === targetIdentifier.toString().toLowerCase())
    );

    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Akun pengguna tidak ditemukan di basis data.'
      });
    }

    const targetUser = usersList[userIndex];
    const now = new Date();
    const nowMs = now.getTime();
    let isDataChanged = false;

    // ------------------------------------------------------------------------
    // 1. EDIT DESKRIPSI AKUN (BIO)
    // ------------------------------------------------------------------------
    if (typeof newBio === 'string' && newBio.trim() !== (targetUser.bio || '')) {
      targetUser.bio = newBio.trim();
      isDataChanged = true;
    }

    // ------------------------------------------------------------------------
    // 2. UNGGAH & KUSTOMISASI FOTO AVATAR (DARI KOMPUTER BASE64)
    // ------------------------------------------------------------------------
    if (newAvatarBase64 && typeof newAvatarBase64 === 'string' && newAvatarBase64.trim() !== '') {
      if (isValidBase64Image(newAvatarBase64) || newAvatarBase64.startsWith('/') || newAvatarBase64.startsWith('http')) {
        targetUser.avatarUrl = newAvatarBase64.trim();
        isDataChanged = true;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Format gambar avatar tidak valid! Pastikan Anda mengunggah file gambar (JPG, PNG, WEBP).'
        });
      }
    }

    // ------------------------------------------------------------------------
    // 3. EDIT DISPLAY NAME (DENGAN COOLDOWN 1 KALI SEHARI / 24 JAM)
    // ------------------------------------------------------------------------
    if (newDisplayName && typeof newDisplayName === 'string' && newDisplayName.trim() !== targetUser.displayName) {
      const formattedDisplayName = newDisplayName.trim();

      if (formattedDisplayName.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Display Name minimal terdiri dari 2 karakter!'
        });
      }

      const lastDisplayNameChange = targetUser.lastDisplayNameChange ? new Date(targetUser.lastDisplayNameChange).getTime() : 0;
      const timeSinceLastDisplayChange = nowMs - lastDisplayNameChange;

      if (lastDisplayNameChange > 0 && timeSinceLastDisplayChange < DISPLAY_NAME_COOLDOWN_MS) {
        const remainingMs = DISPLAY_NAME_COOLDOWN_MS - timeSinceLastDisplayChange;
        const formattedRemaining = formatTimeRemaining(remainingMs);
        return res.status(429).json({
          success: false,
          message: `Display Name hanya dapat diubah 1 kali dalam 24 jam. Silakan tunggu ${formattedRemaining} lagi.`
        });
      }

      targetUser.displayName = formattedDisplayName;
      targetUser.lastDisplayNameChange = now.toISOString();
      isDataChanged = true;
    }

    // ------------------------------------------------------------------------
    // 4. EDIT USERNAME (DENGAN COOLDOWN 1 KALI SEMINGGU / 7 HARI & KETERSEDIAAN UNIK)
    // ------------------------------------------------------------------------
    if (newUsername && typeof newUsername === 'string' && newUsername.trim().toLowerCase() !== targetUser.username.toLowerCase()) {
      const formattedUsername = newUsername.trim().toLowerCase();

      if (formattedUsername.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Username minimal terdiri dari 3 karakter!'
        });
      }

      // Validasi Anti-Bertabrakan (Pengecekan Keunikan Username)
      const usernameExists = usersList.some((u) => u.id !== targetUser.id && u.username && u.username.toLowerCase() === formattedUsername);

      if (usernameExists) {
        return res.status(400).json({
          success: false,
          message: `Username "${formattedUsername}" sudah digunakan oleh akun lain. Silakan pilih username yang berbeda.`
        });
      }

      // Validasi Cooldown 7 Hari (168 Jam)
      const lastUsernameChange = targetUser.lastUsernameChange ? new Date(targetUser.lastUsernameChange).getTime() : 0;
      const timeSinceLastUsernameChange = nowMs - lastUsernameChange;

      if (lastUsernameChange > 0 && timeSinceLastUsernameChange < USERNAME_COOLDOWN_MS) {
        const remainingMs = USERNAME_COOLDOWN_MS - timeSinceLastUsernameChange;
        const formattedRemaining = formatTimeRemaining(remainingMs);
        return res.status(429).json({
          success: false,
          message: `Username hanya dapat diubah 1 kali dalam 7 hari. Silakan tunggu ${formattedRemaining} lagi.`
        });
      }

      targetUser.username = formattedUsername;
      targetUser.lastUsernameChange = now.toISOString();
      isDataChanged = true;
    }

    // Jika tidak ada data yang berubah
    if (!isDataChanged) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada perubahan data profil yang terdeteksi.',
        user: {
          id: targetUser.id,
          email: targetUser.email,
          username: targetUser.username,
          displayName: targetUser.displayName,
          bio: targetUser.bio || "",
          avatarUrl: targetUser.avatarUrl || "/default-avatar.png",
          role: targetUser.role || 'USER'
        }
      });
    }

    // Simpan kembali array data yang telah diperbarui ke GitHub User_data.json
    usersList[userIndex] = targetUser;
    await saveUserDataToGitHub(usersList, fileSha);

    // Buat ulang JWT Token baru dengan nama/username yang telah diperbarui
    const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
    const updatedJwtToken = jwt.sign(
      {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        displayName: targetUser.displayName,
        role: targetUser.role || 'USER'
      },
      secretKey,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Profil akun berhasil diperbarui dan tersimpan di sistem!',
      token: updatedJwtToken,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        displayName: targetUser.displayName,
        bio: targetUser.bio || "",
        avatarUrl: targetUser.avatarUrl || "/default-avatar.png",
        role: targetUser.role || 'USER',
        lastDisplayNameChange: targetUser.lastDisplayNameChange,
        lastUsernameChange: targetUser.lastUsernameChange
      }
    });

  } catch (error) {
    console.error('Error PUT /api/profile/update:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui profil akun: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

// ============================================================================
// SUPER ADMIN CONTROL ENDPOINTS
// ============================================================================

// ADMIN ROUTE 1: GET ALL USERS (Khusus Administrator)
app.get(['/api/admin/users', '/admin/users'], authenticateAdminToken, async (req, res) => {
  try {
    const { usersList } = await fetchUserDataFromGitHub();
    const sanitizedUsers = usersList.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      bio: u.bio || "",
      avatarUrl: u.avatarUrl || "/default-avatar.png",
      role: u.role || 'USER',
      createdAt: u.createdAt,
      verified: u.verified
    }));

    return res.status(200).json({
      success: true,
      totalUsers: sanitizedUsers.length,
      users: sanitizedUsers
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal mengambil data user: ' + error.message });
  }
});

// ADMIN ROUTE 2: DELETE USER BY ID (Khusus Administrator)
app.delete(['/api/admin/users/:id', '/admin/users/:id'], authenticateAdminToken, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { usersList, fileSha } = await fetchUserDataFromGitHub();

    const targetUser = usersList.find(u => u.id === targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });
    }

    if (targetUser.role === 'SUPER_ADMIN' || (targetUser.email && targetUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Dilarang menghapus Akun Master Administrator Utama!' });
    }

    const filteredUsers = usersList.filter(u => u.id !== targetUserId);
    await saveUserDataToGitHub(filteredUsers, fileSha);

    return res.status(200).json({
      success: true,
      message: `Akun user '${targetUser.displayName}' (${targetUser.email}) berhasil dihapus dari sistem!`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal menghapus user: ' + error.message });
  }
});

// Fallback Unmatched Route
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Endpoint Rute API '${req.originalUrl}' tidak ditemukan.`
  });
});

// Global Express Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[EXPRESS GLOBAL ERROR]:', err.stack || err);
  return res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan kritis pada aplikasi Express: ' + (err.message || 'Internal Error')
  });
});

module.exports = app;