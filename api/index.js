/**
 * ============================================================================
 * SERVER BACKEND UTAMA SYSTEM AUTHENTICATION OSIS SMP KALAM KUDUS PADANG
 * File: api/index.js
 * Engine: Express.js Unified Serverless Handler for Vercel
 * Version: 2.5.0 (Production-Grade Security & Mandatory OTP Enforcement)
 * ============================================================================
 * 
 * DESKRIPSI PEMBARUAN KEAMANAN:
 * 1. Otentikasi OTP Wajib untuk Seluruh Akun (Termasuk Master Administrator).
 * 2. Sistem Anti-Duplikasi Otomatis: Pengecekan pra-seeding berbasis keberadaan 
 *    Identifier Email/Username di repositori User_data.json GitHub.
 * 3. Token Sanitizer & Native HTTPS Transceiver tanpa dependensi eksternal.
 * 4. Hashing Password menggunakan BcryptJS dengan Cost Factor Salt 10.
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const https = require('https');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// KONSTANTA MASTER ADMINISTRATOR UTAMA
// ============================================================================
const MASTER_ADMIN_EMAIL = "osismediateknologiskkkpdg@gmail.com";
const MASTER_ADMIN_USERNAME = "admin osis";
const MASTER_ADMIN_DISPLAY = "Administrator OSIS";
const MASTER_ADMIN_RAW_PASS = "skkk2019osismedia&teknologi";

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Memory Storage Global untuk Pengelolaan Sesi Kode OTP sementara
global.otpMemoryStore = global.otpMemoryStore || {};

// ============================================================================
// HELPER UTILITIES: SANITIZATION & DIAGNOSTICS
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
      return reject(new Error("Konfigurasi 'GITHUB_TOKEN' tidak ditemukan di Environment Variables Vercel."));
    }
    if (!rawOwner || !rawRepo) {
      return reject(new Error("Konfigurasi 'GITHUB_OWNER' atau 'GITHUB_REPO' belum diisi di Environment Variables Vercel."));
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
          reject(new Error(`GitHub API Error [401 Bad Credentials]: GITHUB_TOKEN ditolak oleh GitHub. Token Mask: ${maskTokenForDiagnostics(cleanToken)}`));
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

// ==========================================
// 2. HELPER FUNCTIONS (AUDIT LOGGING)
// ==========================================
/**
 * Mengirimkan notifikasi audit log aktivitas pengguna ke Google Chat Webhook.
 * @param {string} eventType - Jenis aktivitas (contoh: 'USER_REGISTERED', 'USER_LOGIN')
 * @param {string} userEmail - Email dari pengguna yang melakukan aksi
 */
async function sendAuditLog(eventType, userEmail) {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Audit Log Warning]: GOOGLE_CHAT_WEBHOOK_URL tidak ditemukan di .env');
    return;
  }

  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const payload = {
    text: `🔒 *[AUDIT LOG OFFICAL]*\n` +
          `• *Event:* \`${eventType}\`\n` +
          `• *User Email:* \`${userEmail}\`\n` +
          `• *Waktu:* ${timestamp}\n` +
          `• *Status:* Success`
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`[Audit Log Error]: HTTP Status ${response.status}`);
    }
  } catch (error) {
    console.error('[Audit Log Error]: Gagal mengirim log ke Webhook', error);
  }
}

// ==========================================
// 3. ROUTE HANDLERS
// ==========================================

// --- ENDPOINT REGISTRASI (BUAT AKUN) ---
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // A. Validasi input dasar
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    // B. Proses pendaftaran (Save database / User_data.json)
    // ... (Proses enkripsi password & penulisan data di sini) ...

    // C. PEMANGGILAN AUDIT LOG
    // Ditambahkan SETELAH pendaftaran sukses, SEBELUM res.json()
    await sendAuditLog('USER_REGISTERED', email);

    // D. Kirim respon sukses ke client
    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat.'
    });

  } catch (error) {
    console.error('Error Register:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
});

// --- ENDPOINT LOGIN ---
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // A. Cari user dan verifikasi password
    // const user = await findUserByEmail(email);
    // const isPasswordMatch = await comparePassword(password, user.passwordHash);

    // B. Jika verifikasi gagal
    /*
    if (!user || !isPasswordMatch) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
    }
    */

    // C. PEMANGGILAN AUDIT LOG
    // Ditambahkan SETELAH verifikasi login berhasil, SEBELUM res.json()
    await sendAuditLog('USER_LOGIN', email);

    // D. Kirim respon sukses ke client
    return res.status(200).json({
      success: true,
      message: 'Login berhasil.'
    });

  } catch (error) {
    console.error('Error Login:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
  }
});

// ==========================================
// 4. SERVER LISTEN / EXPORT
// ==========================================
module.exports = app;

/**
 * Membaca File User_data.json dari GitHub & Menjamin Anti-Duplikasi Administrator
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
      (user) => user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() ||
                user.username.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()
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
        passwordHash: adminHashedPass,
        role: "SUPER_ADMIN",
        createdAt: new Date().toISOString(),
        verified: true
      };

      parsedUsers.unshift(adminUserObj);
      
      // Simpan perubahan initial seeding ke GitHub
      await saveUserDataToGitHub(parsedUsers, responseData.sha);
      console.log('[AUTO-SEED SUCCESS] Akun Administrator berhasil dibuat & tersimpan di User_data.json GitHub.');
    } else {
      console.log('[AUTO-CHECK] Akun Administrator sudah terdaftar di User_data.json. Mencegah pembuatan ulang.');
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
    message: 'chore(auth): update User_data.json via Express Serverless API',
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
    throw new Error("Kredensial SMTP belum lengkap! Pastikan 'SMTP_USER' dan 'SMTP_PASS' tersedia di Vercel Environment Variables.");
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
  res.sendFile(path.join(__dirname, '../index.html'));
});

// HEALTH & DIAGNOSTICS CHECK ROUTE
app.get(['/api/health', '/health'], async (req, res) => {
  const tokenClean = sanitizeGitHubToken(process.env.GITHUB_TOKEN);
  return res.status(200).json({
    status: 'online',
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
      (u) => u.email.toLowerCase() === normalizedEmail || u.username.toLowerCase() === normalizedUsername
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
      passwordHash: hashedPassword,
      role: cachedData.payload.role || "USER",
      createdAt: new Date().toISOString(),
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
      (u) => u.email.toLowerCase() === cleanIdentifier || u.username.toLowerCase() === cleanIdentifier
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

    // ========================================================================
    // MANDATORY OTP ENFORCEMENT (TETAP KIRIM OTP UNTUK EMAIL ADMIN/SEMUA AKUN)
    // ========================================================================
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

// ROUTE 4: VERIFY LOGIN OTP & GENERATE JWT TOKEN
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

    // Penerbitan JWT Token dengan Payload Role Pengguna
    const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
    const jwtToken = jwt.sign(
      {
        id: cachedData.userData.id,
        email: cachedData.userData.email,
        username: cachedData.userData.username,
        displayName: cachedData.userData.displayName,
        role: cachedData.userData.role || 'USER'
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
        displayName: cachedData.userData.displayName,
        username: cachedData.userData.username,
        email: cachedData.userData.email,
        role: cachedData.userData.role || 'USER'
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

    if (targetUser.role === 'SUPER_ADMIN' || targetUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
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