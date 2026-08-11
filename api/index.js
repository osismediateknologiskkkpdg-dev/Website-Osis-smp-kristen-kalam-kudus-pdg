/**
 * ============================================================================
 * SERVER BACKEND UTAMA SYSTEM AUTHENTICATION OSIS SMP KALAM KUDUS PADANG
 * File: api/index.js
 * Engine: Express.js Unified Serverless Handler for Vercel
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const https = require('https');

const app = express();

// ==================== GLOBAL PROCESS PROTECTION ====================
// Mencegah Serverless Function Crash (500 FUNCTION_INVOCATION_FAILED)
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL ERROR] Uncaught Exception:', err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL ERROR] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// ==================== MIDDLEWARE SETUP ====================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Memory Store Global untuk OTP (Memilih fallback persisten antar-request)
global.otpMemoryStore = global.otpMemoryStore || {};

// ==================== HELPER 1: GITHUB REST API VIA NATIVE HTTPS ====================

/**
 * Melakukan Request ke GitHub REST API tanpa Library Eksternal (Anti-Crash)
 */
function makeGitHubApiRequest(endpointMethod, apiPath, requestBodyData = null) {
  return new Promise((resolve, reject) => {
    const rawToken = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;
    const rawOwner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : null;
    const rawRepo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : null;

    if (!rawToken || !rawOwner || !rawRepo) {
      return reject(new Error("Konfigurasi GITHUB_TOKEN, GITHUB_OWNER, atau GITHUB_REPO belum diisi di Vercel Environment Variables."));
    }

    const requestPayload = requestBodyData ? JSON.stringify(requestBodyData) : null;

    const requestOptions = {
      hostname: 'api.github.com',
      port: 443,
      path: `/repos/${rawOwner}/${rawRepo}/${apiPath}`,
      method: endpointMethod.toUpperCase(),
      headers: {
        'User-Agent': 'OSIS-KalamKudus-Serverless-App',
        'Authorization': `Bearer ${rawToken}`,
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
 * Membaca File User_data.json dari Repositori GitHub
 */
async function fetchUserDataFromGitHub() {
  const branchName = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';
  try {
    const responseData = await makeGitHubApiRequest('GET', `contents/User_data.json?ref=${branchName}`);
    const decodedContent = Buffer.from(responseData.content, 'base64').toString('utf-8');
    const parsedUsers = JSON.parse(decodedContent);

    return {
      usersList: Array.isArray(parsedUsers) ? parsedUsers : [],
      fileSha: responseData.sha
    };
  } catch (err) {
    console.warn('[GITHUB READ WARNING]:', err.message);
    return { usersList: [], fileSha: null };
  }
}

/**
 * Menyimpan / Meng-commit Pembaruan User_data.json ke GitHub
 */
async function saveUserDataToGitHub(updatedUsersArray, currentSha) {
  const branchName = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';
  const base64EncodedContent = Buffer.from(JSON.stringify(updatedUsersArray, null, 2)).toString('base64');

  const commitPayload = {
    message: 'chore(auth): update User_data.json via Express API',
    content: base64EncodedContent,
    branch: branchName
  };

  if (currentSha) {
    commitPayload.sha = currentSha;
  }

  return await makeGitHubApiRequest('PUT', 'contents/User_data.json', commitPayload);
}

// ==================== HELPER 2: NODEMAILER SMTP TRANSPORTER ====================

/**
 * Memverifikasi & Membuat Transporter Nodemailer
 */
function createSmtpTransporter() {
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : null;
  const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!user || !pass) {
    throw new Error("Kredensial SMTP belum diisi lengkap! Pastikan 'SMTP_USER' dan 'SMTP_PASS' tersedia di Vercel Environment Variables.");
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
 * Mengirimkan Email OTP
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
      <p style="font-size: 14px; color: #EDEDEF; line-height: 1.6;">Gunakan kode OTP berikut untuk menyelesaikan proses <strong>${actionTitleHeader}</strong> Anda:</p>
      <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 18px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #6872D9; border-radius: 12px; margin: 24px 0; font-family: monospace;">
        ${otpCodeNumber}
      </div>
      <p style="font-size: 12px; color: #8A8F98; text-align: center; margin: 0;">Kode OTP ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapapun.</p>
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

// ==================== EXPRESS ROUTING HANDLERS ====================

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// ROUTE 1: REGISTER USER (REQUEST OTP)
app.post('/api/register', async (req, res) => {
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

    // Cek Duplikasi di GitHub
    const { usersList } = await fetchUserDataFromGitHub();
    const isDuplicate = usersList.some(
      (u) => u.email.toLowerCase() === normalizedEmail || u.username.toLowerCase() === normalizedUsername
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'Email atau Username sudah terdaftar! Silakan login atau gunakan kredensial lain.'
      });
    }

    // Generate 6 Digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    global.otpMemoryStore[normalizedEmail] = {
      otp: generatedOtp,
      payload: {
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: displayName.trim(),
        password: password
      },
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    // Kirim Email OTP
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
app.post('/api/verify-register', async (req, res) => {
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

    // Encrypt Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(cachedData.payload.password, salt);

    // Ambil & Update Data di GitHub
    const { usersList, fileSha } = await fetchUserDataFromGitHub();

    const newUserObject = {
      id: 'usr_' + Date.now(),
      email: cachedData.payload.email,
      username: cachedData.payload.username,
      displayName: cachedData.payload.displayName,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
      verified: true
    };

    usersList.push(newUserObject);

    await saveUserDataToGitHub(usersList, fileSha);

    delete global.otpMemoryStore[normalizedEmail];

    return res.status(200).json({
      success: true,
      message: 'Registrasi Berhasil! Data Akun Anda telah disimpan ke User_data.json. Silakan Login.'
    });
  } catch (error) {
    console.error('Error /api/verify-register:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyelesaikan verifikasi pendaftaran: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

// ROUTE 3: LOGIN USER (REQUEST OTP)
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
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

    const isMatch = await bcrypt.compare(password, foundUser.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah!',
        suggestRegister: false
      });
    }

    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const cacheKey = 'login_' + foundUser.email.toLowerCase();

    global.otpMemoryStore[cacheKey] = {
      otp: loginOtp,
      userData: foundUser,
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    await dispatchOTPEmail(foundUser.email, loginOtp, 'Verifikasi Login');

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

// ROUTE 4: VERIFY LOGIN OTP & GENERATE JWT
app.post('/api/verify-login', async (req, res) => {
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

    const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
    const jwtToken = jwt.sign(
      {
        id: cachedData.userData.id,
        email: cachedData.userData.email,
        username: cachedData.userData.username,
        displayName: cachedData.userData.displayName
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
        email: cachedData.userData.email
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

// Export untuk Vercel Serverless Function
module.exports = app;