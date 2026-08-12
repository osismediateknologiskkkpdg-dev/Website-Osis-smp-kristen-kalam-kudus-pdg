/**
 * ============================================================================
 * SERVER BACKEND UTAMA SYSTEM AUTHENTICATION OSIS SMP KALAM KUDUS PADANG
 * File: api/index.js
 * Engine: Express.js Unified Serverless Handler for Vercel
 * Version: 3.0.0 (Anti-Crash, Rating Engine, RBAC & Mandatory OTP)
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

// ==================== MASTER ADMIN CONSTANTS ====================
const MASTER_ADMIN_EMAIL = "osismediateknologiskkkpdg@gmail.com";
const MASTER_ADMIN_USERNAME = "admin osis";
const MASTER_ADMIN_DISPLAY = "Administrator OSIS";
const MASTER_ADMIN_RAW_PASS = "skkk2019osismedia&teknologi";

// ==================== GLOBAL PROCESS SAFETY ENGINE ====================
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL SYSTEM ERROR] Uncaught Exception Detected:', err.stack || err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL SYSTEM ERROR] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// ==================== MIDDLEWARE CONFIGURATION ====================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

global.otpMemoryStore = global.otpMemoryStore || {};

// ==================== HELPER UTILITIES ====================
function sanitizeGitHubToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return rawToken.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

function maskTokenForDiagnostics(token) {
  if (!token) return '[NOT CONFIGURED]';
  if (token.length <= 8) return '****';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

// ==================== HELPER 1: NATIVE HTTPS GITHUB REST API ENGINE ====================
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
            resolve(JSON.parse(responseBody));
          } catch (pErr) {
            resolve(responseBody);
          }
        } else if (res.statusCode === 401) {
          reject(new Error(`GitHub API Error [401 Bad Credentials]: Token tidak valid. Mask: ${maskTokenForDiagnostics(cleanToken)}`));
        } else if (res.statusCode === 404) {
          reject(new Error(`GitHub API Error [404 Not Found]: File/Repo '${rawOwner}/${rawRepo}/${apiPath}' tidak ditemukan.`));
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
 * Membaca User_data.json dari GitHub & Mencegah Duplikasi Administrator
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

    // Pengecekan Duplikasi Master Admin (TIDAK DIBUAT ULANG JIKA SUDAH ADA)
    const adminExists = parsedUsers.some(
      (user) => user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() ||
                user.username.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase()
    );

    if (!adminExists) {
      console.log('[AUTO-SEED] Inisialisasi Akun Master Administrator...');
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
      await saveUserDataToGitHub(parsedUsers, responseData.sha);
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
function createSmtpTransporter() {
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : null;
  const host = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!user || !pass) {
    throw new Error("Kredensial SMTP belum lengkap! Pastikan 'SMTP_USER' dan 'SMTP_PASS' diatur di Vercel.");
  }

  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

async function dispatchOTPEmail(targetEmailAddress, otpCodeNumber, actionTitleHeader) {
  const transporter = createSmtpTransporter();

  const emailHtmlBody = `
    <div style="font-family: 'Inter', Arial, sans-serif; background-color: #050506; color: #EDEDEF; padding: 32px; border-radius: 16px; max-width: 520px; margin: 0 auto; border: 1px solid #5E6AD2;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">OSIS SMP KALAM KUDUS PADANG</h2>
        <p style="color: #8A8F98; font-size: 11px; font-family: monospace; margin-top: 4px; text-transform: uppercase;">Official Authentication System</p>
      </div>
      <p style="font-size: 14px; color: #EDEDEF;">Halo,</p>
      <p style="font-size: 14px; color: #EDEDEF;">Berikut adalah Kode OTP Verifikasi Anda untuk <strong>${actionTitleHeader}</strong>:</p>
      <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 18px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #6872D9; border-radius: 12px; margin: 24px 0; font-family: monospace;">
        ${otpCodeNumber}
      </div>
      <p style="font-size: 12px; color: #8A8F98; text-align: center;">Kode OTP ini berlaku selama <strong>5 menit</strong>.</p>
    </div>
  `;

  return await transporter.sendMail({
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER.trim()}>`,
    to: targetEmailAddress,
    subject: `[OTP ${actionTitleHeader}] Kode Verifikasi: ${otpCodeNumber}`,
    html: emailHtmlBody
  });
}

// ==================== AUTHENTICATION MIDDLEWARES ====================
function authenticateUserToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Akses Ditolak! Anda harus login terlebih dahulu.' });
  }

  const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
  jwt.verify(token, secretKey, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Sesi login telah kadaluwarsa.' });
    }
    req.user = decodedUser;
    next();
  });
}

function authenticateAdminToken(req, res, next) {
  authenticateUserToken(req, res, () => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Akses Ditolak! Hak akses Administrator diperlukan.' });
    }
    next();
  });
}

// ==================== EXPRESS ROUTING HANDLERS ====================

// HEALTH CHECK ROUTE
app.get(['/api/health', '/health'], async (req, res) => {
  const tokenClean = sanitizeGitHubToken(process.env.GITHUB_TOKEN);
  return res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    diagnostics: {
      smtpUserConfigured: !!process.env.SMTP_USER,
      githubOwnerConfigured: !!process.env.GITHUB_OWNER,
      githubRepoConfigured: !!process.env.GITHUB_REPO,
      githubTokenMask: maskTokenForDiagnostics(tokenClean)
    }
  });
});

// ROUTE 1: REGISTER USER
app.post(['/api/register', '/register'], async (req, res) => {
  try {
    const { email, username, displayName, password, confirmPassword } = req.body || {};

    if (!email || !username || !displayName || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Semua kolom formulir wajib diisi!' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter!' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const { usersList } = await fetchUserDataFromGitHub();
    const isDuplicate = usersList.some(
      (u) => u.email.toLowerCase() === normalizedEmail || u.username.toLowerCase() === normalizedUsername
    );

    if (isDuplicate) {
      return res.status(400).json({ success: false, message: 'Email atau Username sudah terdaftar!' });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    global.otpMemoryStore[normalizedEmail] = {
      otp: generatedOtp,
      payload: {
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: displayName.trim(),
        password,
        role: "USER"
      },
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    await dispatchOTPEmail(normalizedEmail, generatedOtp, 'Pendaftaran Akun Baru');

    return res.status(200).json({
      success: true,
      message: 'Kode OTP Verifikasi telah dikirimkan ke email Anda.',
      email: normalizedEmail
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal registrasi: ' + error.message });
  }
});

// ROUTE 2: VERIFY REGISTER OTP
app.post(['/api/verify-register', '/verify-register'], async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });

    const normalizedEmail = email.trim().toLowerCase();
    const cachedData = global.otpMemoryStore[normalizedEmail];

    if (!cachedData || Date.now() > cachedData.expiresAt) {
      delete global.otpMemoryStore[normalizedEmail];
      return res.status(400).json({ success: false, message: 'Sesi OTP tidak ditemukan/kadaluwarsa.' });
    }

    if (cachedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP tidak valid!' });
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
      message: 'Registrasi Berhasil! Data tersimpan di User_data.json. Silakan Login.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal verifikasi: ' + error.message });
  }
});

// ROUTE 3: LOGIN USER (TETAP WAJIB KIRIM OTP KE EMAIL ADMIN/USER)
app.post(['/api/login', '/login'], async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });

    const cleanIdentifier = identifier.trim().toLowerCase();
    const { usersList } = await fetchUserDataFromGitHub();

    const foundUser = usersList.find(
      (u) => u.email.toLowerCase() === cleanIdentifier || u.username.toLowerCase() === cleanIdentifier
    );

    if (!foundUser) {
      return res.status(404).json({ success: false, message: 'Akun tidak ditemukan!' });
    }

    const isMatch = await bcrypt.compare(password, foundUser.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Password salah!' });
    }

    // MANDATORY OTP FOR ALL USERS (TERMASUK MASTER ADMIN)
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
    return res.status(500).json({ success: false, message: 'Gagal login: ' + error.message });
  }
});

// ROUTE 4: VERIFY LOGIN OTP & GENERATE JWT
app.post(['/api/verify-login', '/verify-login'], async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });

    const cleanEmail = email.trim().toLowerCase();
    const cacheKey = 'login_' + cleanEmail;
    const cachedData = global.otpMemoryStore[cacheKey];

    if (!cachedData || Date.now() > cachedData.expiresAt) {
      delete global.otpMemoryStore[cacheKey];
      return res.status(400).json({ success: false, message: 'Sesi login kadaluwarsa.' });
    }

    if (cachedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP Login salah!' });
    }

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
      message: 'Autentikasi Berhasil!',
      token: jwtToken,
      user: {
        id: cachedData.userData.id,
        displayName: cachedData.userData.displayName,
        username: cachedData.userData.username,
        email: cachedData.userData.email,
        role: cachedData.userData.role || 'USER'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal verifikasi login: ' + error.message });
  }
});

// ==================== SECTOR 7: RATING OSIS ENDPOINTS ====================

// GET ALL RATINGS
app.get(['/api/rating', '/rating'], async (req, res) => {
  try {
    const { usersList } = await fetchUserDataFromGitHub();
    const ratedUsers = usersList.filter(u => u.rating && u.rating.stars > 0);
    
    const totalRatings = ratedUsers.length;
    const avgRating = totalRatings > 0 
      ? (ratedUsers.reduce((sum, u) => sum + u.rating.stars, 0) / totalRatings).toFixed(1)
      : "5.0";

    const reviews = ratedUsers.map(u => ({
      displayName: u.displayName,
      username: u.username,
      stars: u.rating.stars,
      reviewText: u.rating.reviewText || "",
      updatedAt: u.rating.updatedAt
    })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return res.status(200).json({
      success: true,
      avgRating,
      totalRatings,
      reviews
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal memuat rating: ' + error.message });
  }
});

// SUBMIT RATING (KHUSUS USER LOGGED IN)
app.post(['/api/rating', '/rating'], authenticateUserToken, async (req, res) => {
  try {
    const { stars, reviewText } = req.body || {};
    const numericStars = parseInt(stars, 10);

    if (!numericStars || numericStars < 1 || numericStars > 5) {
      return res.status(400).json({ success: false, message: 'Rating harus antara 1-5 bintang!' });
    }

    const { usersList, fileSha } = await fetchUserDataFromGitHub();
    const userIndex = usersList.findIndex(u => u.id === req.user.id || u.email.toLowerCase() === req.user.email.toLowerCase());

    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: 'Data user tidak ditemukan!' });
    }

    usersList[userIndex].rating = {
      stars: numericStars,
      reviewText: (reviewText || "").trim(),
      updatedAt: new Date().toISOString()
    };

    await saveUserDataToGitHub(usersList, fileSha);

    return res.status(200).json({
      success: true,
      message: 'Terima kasih! Rating & Ulasan Anda telah disimpan.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal menyimpan rating: ' + error.message });
  }
});

// ==================== SUPER ADMIN CONTROL ENDPOINTS ====================
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
    return res.status(500).json({ success: false, message: 'Gagal mengambil user: ' + error.message });
  }
});

app.delete(['/api/admin/users/:id', '/admin/users/:id'], authenticateAdminToken, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { usersList, fileSha } = await fetchUserDataFromGitHub();

    const targetUser = usersList.find(u => u.id === targetUserId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });

    if (targetUser.role === 'SUPER_ADMIN' || targetUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Dilarang menghapus Akun Master Administrator!' });
    }

    const filteredUsers = usersList.filter(u => u.id !== targetUserId);
    await saveUserDataToGitHub(filteredUsers, fileSha);

    return res.status(200).json({
      success: true,
      message: `Akun '${targetUser.displayName}' (${targetUser.email}) telah dihapus!`
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

module.exports = app;