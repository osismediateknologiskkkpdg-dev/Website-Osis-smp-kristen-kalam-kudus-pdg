/**
 * ============================================================================
 * SERVER BACKEND UTAMA SYSTEM AUTHENTICATION & PROFILE MANAGEMENT
 * OSIS SMP KRISTEN KALAM KUDUS PADANG
 * File: api/index.js
 * Engine: Express.js Unified Serverless Handler for Vercel
 * Version: 2.9.0 (Custom Official Avatar Default Sync)
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const https = require('https');
const path = require('path');

const app = express();

app.use(express.json());

// KONSTANTA & ATURAN WAKTU COOLDOWN
const MASTER_ADMIN_EMAIL = "osismediateknologiskkkpdg@gmail.com";
const MASTER_ADMIN_USERNAME = "admin osis";
const MASTER_ADMIN_DISPLAY = "Administrator OSIS";
const MASTER_ADMIN_RAW_PASS = "skkk2019osismedia&teknologi";
const DEFAULT_AVATAR_URL = "https://raw.githubusercontent.com/osismediateknologiskkkpdg-dev/Image-OSIS/refs/heads/main/Untitled%20design%20(1).png";

const DISPLAY_NAME_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 Hari
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;  // 1 Minggu

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL SYSTEM ERROR] Uncaught Exception Detected:', err.stack || err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL SYSTEM ERROR] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

global.otpMemoryStore = global.otpMemoryStore || {};

function sanitizeGitHubToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return rawToken.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

function maskTokenForDiagnostics(token) {
  if (!token) return '[NOT CONFIGURED]';
  if (token.length <= 8) return '****';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

function checkCooldown(lastUpdateIsoString, cooldownMs) {
  if (!lastUpdateIsoString) return { canUpdate: true, remainingText: null };

  const lastUpdate = new Date(lastUpdateIsoString).getTime();
  const now = Date.now();
  const elapsed = now - lastUpdate;

  if (elapsed < cooldownMs) {
    const remainingMs = cooldownMs - elapsed;
    const totalHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    let remainingText = '';
    if (days > 0) {
      remainingText = `${days} hari ${hours} jam lagi`;
    } else if (hours > 0) {
      remainingText = `${hours} jam ${minutes} menit lagi`;
    } else {
      remainingText = `${minutes} menit lagi`;
    }

    return { canUpdate: false, remainingText };
  }

  return { canUpdate: true, remainingText: null };
}

function makeGitHubApiRequest(endpointMethod, apiPath, requestBodyData = null) {
  return new Promise((resolve, reject) => {
    const rawToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const cleanToken = sanitizeGitHubToken(rawToken);
    const rawOwner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : (process.env.REPO_OWNER ? process.env.REPO_OWNER.trim() : 'osismediateknologiskkkpdg-dev');
    const rawRepo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : (process.env.REPO_NAME ? process.env.REPO_NAME.trim() : 'Website-Osis-smp-kristen-kalam-kudus-pdg');

    if (!cleanToken) {
      return reject(new Error("Konfigurasi 'GITHUB_TOKEN' atau 'GH_TOKEN' tidak ditemukan di Environment Variables Vercel."));
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

async function fetchUserDataFromGitHub() {
  const branchName = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';
  try {
    const responseData = await makeGitHubApiRequest('GET', `contents/User_data.json?ref=${branchName}`);
    const decodedContent = Buffer.from(responseData.content, 'base64').toString('utf-8');
    let parsedUsers = JSON.parse(decodedContent);

    if (!Array.isArray(parsedUsers)) {
      parsedUsers = [];
    }

    const adminExists = parsedUsers.some(
      (user) => (user.email && user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) ||
                (user.username && user.username.toLowerCase() === MASTER_ADMIN_USERNAME.toLowerCase())
    );

    if (!adminExists) {
      console.log('[AUTO-SEED] Akun Administrator belum ditemukan. Melakukan Inisialisasi Akun Master...');
      
      const salt = await bcrypt.genSalt(10);
      const adminHashedPass = await bcrypt.hash(MASTER_ADMIN_RAW_PASS, salt);

      const adminUserObj = {
        id: "usr_master_admin_001",
        email: MASTER_ADMIN_EMAIL.toLowerCase(),
        username: MASTER_ADMIN_USERNAME.toLowerCase(),
        displayName: MASTER_ADMIN_DISPLAY,
        bio: "Master Administrator Resmi OSIS SMP Kristen Kalam Kudus Padang.",
        avatar: DEFAULT_AVATAR_URL,
        passwordHash: adminHashedPass,
        role: "SUPER_ADMIN",
        createdAt: new Date().toISOString(),
        lastDisplayNameUpdate: null,
        lastUsernameUpdate: null,
        verified: true
      };

      parsedUsers.unshift(adminUserObj);
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

async function saveUserDataToGitHub(updatedUsersArray, currentSha) {
  const branchName = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';
  const base64EncodedContent = Buffer.from(JSON.stringify(updatedUsersArray, null, 2)).toString('base64');

  const commitPayload = {
    message: 'chore(user): update User_data.json profile state via API',
    content: base64EncodedContent,
    branch: branchName
  };

  if (currentSha) {
    commitPayload.sha = currentSha;
  }

  return await makeGitHubApiRequest('PUT', 'contents/User_data.json', commitPayload);
}

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
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

/**
 * Fungsi pembantu untuk menyimpan atau memperbarui file pada repositori GitHub API
 * dengan menangani SHA secara otomatis.
 * 
 * @param {Object} options
 * @param {string} options.owner - Username/Organisasi pemilik repositori GitHub
 * @param {string} options.repo - Nama repositori GitHub
 * @param {string} options.filePath - Path file di repositori (contoh: 'User_data.json')
 * @param {Object|Array} options.fileData - Object/Array data JSON yang ingin disimpan
 * @param {string} options.commitMessage - Pesan commit penjelasan perubahan
 * @param {string} options.githubToken - Personal Access Token GitHub
 * @returns {Promise<Object>} Respon JSON hasil commit dari GitHub API
 */
async function commitFileToGitHubRepository({
    owner,
    repo,
    filePath,
    fileData,
    commitMessage,
    githubToken
}) {
    const apiEndpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    
    const requestHeaders = {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Website-OSIS-SMP-App'
    };

    let existingFileSha = null;

    // LANGKAH 1: Lakukan permintaan GET untuk memeriksa keberadaan file dan mengambil SHA saat ini
    try {
        const checkFileResponse = await fetch(apiEndpoint, {
            method: 'GET',
            headers: requestHeaders
        });

        if (checkFileResponse.ok) {
            const existingFileData = await checkFileResponse.json();
            existingFileSha = existingFileData.sha;
            console.log(`[GitHub API] File '${filePath}' ditemukan. SHA saat ini: ${existingFileSha}`);
        } else if (checkFileResponse.status === 404) {
            console.log(`[GitHub API] File '${filePath}' belum ada. Membuka mode pembuatan file baru.`);
        } else {
            const errorDetails = await checkFileResponse.text();
            throw new Error(`Gagal memeriksa keberadaan file [HTTP ${checkFileResponse.status}]: ${errorDetails}`);
        }
    } catch (checkError) {
        console.error('[GitHub API Error] Gagal melakukan pengecekan file:', checkError.message);
        throw checkError;
    }

    // LANGKAH 2: Konversi data menjadi format JSON String dan Encode ke Base64
    const jsonStringContent = JSON.stringify(fileData, null, 2);
    const base64EncodedContent = Buffer.from(jsonStringContent, 'utf-8').toString('base64');

    // LANGKAH 3: Susun payload JSON yang akan dikirim pada permintaan PUT
    const payloadBody = {
        message: commitMessage,
        content: base64EncodedContent
    };

    // Jika file sudah pernah ada sebelumnya, sertakan SHA agar GitHub API tidak menolak dengan error 422
    if (existingFileSha) {
        payloadBody.sha = existingFileSha;
    }

    // LANGKAH 4: Kirim permintaan PUT untuk menyimpan/memperbarui file di GitHub
    const updateResponse = await fetch(apiEndpoint, {
        method: 'PUT',
        headers: requestHeaders,
        body: JSON.stringify(payloadBody)
    });

    if (!updateResponse.ok) {
        const errorResponseBody = await updateResponse.json();
        throw new Error(`GitHub API Error [HTTP ${updateResponse.status}]: ${JSON.stringify(errorResponseBody)}`);
    }

    const responseData = await updateResponse.json();
    console.log(`[GitHub API Success] File '${filePath}' berhasil diperbarui/dibuat.`);
    return responseData;
}

// Endpoint Handler Proses Verifikasi Pendaftaran
app.post('/api/verify-registration', async (req, res) => {
    try {
        const { userData } = req.body;

        const GITHUB_OWNER = process.env.GITHUB_OWNER;
        const GITHUB_REPO = process.env.GITHUB_REPO;
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const FILE_PATH = 'User_data.json';

        if (!userData) {
            return res.status(400).json({ success: false, message: 'Data pendaftaran tidak valid.' });
        }

        // Eksekusi pembaruan data ke GitHub dengan fungsi pembantu yang sudah diperbaiki
        const result = await commitFileToGitHubRepository({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            filePath: FILE_PATH,
            fileData: userData,
            commitMessage: `Update data pendaftaran siswa baru: ${userData.nama || 'User'}`,
            githubToken: GITHUB_TOKEN
        });

        return res.status(200).json({
            success: true,
            message: 'Verifikasi pendaftaran berhasil diselesaikan.',
            commitData: result.commit
        });

    } catch (error) {
        console.error('Error saat verifikasi pendaftaran:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Gagal menyelesaikan verifikasi pendaftaran.',
            error: error.message
        });
    }
});

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

function authenticateUserToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    if (req.body && (req.body.userId || req.body.email || req.body.currentUsername)) {
      req.user = { 
        id: req.body.userId, 
        email: req.body.email, 
        username: req.body.currentUsername 
      };
      return next();
    }
    if (req.query && (req.query.userId || req.query.email || req.query.username)) {
      req.user = { 
        id: req.query.userId, 
        email: req.query.email, 
        username: req.query.username 
      };
      return next();
    }
    return res.status(401).json({ success: false, message: 'Akses Ditolak! Token otentikasi atau User ID tidak ditemukan.' });
  }

  const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
  jwt.verify(token, secretKey, (err, decodedUser) => {
    if (err) {
      if (req.body && (req.body.userId || req.body.email || req.body.currentUsername)) {
        req.user = { 
          id: req.body.userId, 
          email: req.body.email, 
          username: req.body.currentUsername 
        };
        return next();
      }
      return res.status(403).json({ success: false, message: 'Sesi token tidak valid atau telah kedaluwarsa!' });
    }
    req.user = decodedUser;
    next();
  });
}

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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

app.get(['/api/health', '/health'], async (req, res) => {
  const tokenClean = sanitizeGitHubToken(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  return res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    diagnostics: {
      smtpUserConfigured: !!process.env.SMTP_USER,
      githubOwnerConfigured: !!(process.env.GITHUB_OWNER || process.env.REPO_OWNER),
      githubRepoConfigured: !!(process.env.GITHUB_REPO || process.env.REPO_NAME),
      githubTokenMask: maskTokenForDiagnostics(tokenClean)
    }
  });
});

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
      bio: "Siswa SMP Kristen Kalam Kudus Padang.",
      avatar: DEFAULT_AVATAR_URL,
      passwordHash: hashedPassword,
      role: cachedData.payload.role || "USER",
      createdAt: new Date().toISOString(),
      lastDisplayNameUpdate: null,
      lastUsernameUpdate: null,
      verified: true
    };

    usersList.push(newUserObject);

    await saveUserDataToGitHub(usersList, fileSha);

    delete global.otpMemoryStore[normalizedEmail];

    return res.status(200).json({
      success: true,
      message: 'Registrasi Berhasil! Data Akun Anda telah tersimpan. Silakan Login.'
    });
  } catch (error) {
    console.error('Error /api/verify-register:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyelesaikan verifikasi pendaftaran: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

app.post(['/api/login', '/login'], async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
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
        id: cachedData.userData.id,
        displayName: cachedData.userData.displayName,
        username: cachedData.userData.username,
        email: cachedData.userData.email,
        bio: cachedData.userData.bio || "",
        avatar: cachedData.userData.avatar || DEFAULT_AVATAR_URL,
        role: cachedData.userData.role || 'USER',
        lastDisplayNameUpdate: cachedData.userData.lastDisplayNameUpdate || null,
        lastUsernameUpdate: cachedData.userData.lastUsernameUpdate || null
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
    const expiresAt = Date.now() + 5 * 60 * 1000;

    let sessionFound = false;

    if (global.otpMemoryStore[loginCacheKey]) {
      global.otpMemoryStore[loginCacheKey].otp = newOtpCode;
      global.otpMemoryStore[loginCacheKey].expiresAt = expiresAt;
      sessionFound = true;
    }

    if (global.otpMemoryStore[normalizedEmail]) {
      global.otpMemoryStore[normalizedEmail].otp = newOtpCode;
      global.otpMemoryStore[normalizedEmail].expiresAt = expiresAt;
      sessionFound = true;
    }

    if (!sessionFound) {
      global.otpMemoryStore[normalizedEmail] = {
        otp: newOtpCode,
        expiresAt: expiresAt
      };
    }

    await dispatchOTPEmail(normalizedEmail, newOtpCode, 'Kirim Ulang Kode OTP');

    return res.status(200).json({
      success: true,
      message: 'Kode OTP baru berhasil dikirimkan ke email Anda.',
      email: normalizedEmail,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error /api/resend-otp:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengirim ulang OTP: ' + (error.message || 'Terjadi kesalahan internal.')
    });
  }
});

app.get(['/api/user/check-username', '/api/check-username'], async (req, res) => {
  try {
    const { username, userId, email } = req.query;

    if (!username) {
      return res.status(400).json({ success: false, message: 'Username tidak boleh kosong.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;

    if (!usernameRegex.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'Username harus berukuran 3-20 karakter dan hanya berisi huruf, angka, atau underscore (_).'
      });
    }

    const { usersList } = await fetchUserDataFromGitHub();

    const isTaken = usersList.some(u => {
      const sameUsername = u.username && u.username.toLowerCase() === cleanUsername;
      const isSameUserById = userId && u.id === userId;
      const isSameUserByEmail = email && u.email && u.email.toLowerCase() === email.toLowerCase();
      return sameUsername && !isSameUserById && !isSameUserByEmail;
    });

    if (isTaken) {
      return res.status(200).json({
        success: true,
        available: false,
        message: 'Username sudah digunakan oleh akun lain.'
      });
    }

    return res.status(200).json({
      success: true,
      available: true,
      message: 'Username tersedia!'
    });
  } catch (error) {
    console.error('Error /api/user/check-username:', error.message || error);
    return res.status(500).json({ success: false, message: 'Gagal mengecek username: ' + error.message });
  }
});

app.post(['/api/user/update-profile', '/api/update-profile'], authenticateUserToken, async (req, res) => {
  try {
    const { userId, email, currentUsername, displayName, username, bio, avatar } = req.body || {};
    const reqUser = req.user || {};

    const { usersList, fileSha } = await fetchUserDataFromGitHub();

    if (!usersList || usersList.length === 0) {
      return res.status(500).json({ success: false, message: 'Gagal membaca repositori database pengguna.' });
    }

    let userIndex = usersList.findIndex(u => {
      if (userId && u.id && u.id === userId) return true;
      if (reqUser.id && u.id && u.id === reqUser.id) return true;
      if (email && u.email && u.email.toLowerCase() === email.trim().toLowerCase()) return true;
      if (reqUser.email && u.email && u.email.toLowerCase() === reqUser.email.trim().toLowerCase()) return true;
      if (currentUsername && u.username && u.username.toLowerCase() === currentUsername.trim().toLowerCase()) return true;
      if (reqUser.username && u.username && u.username.toLowerCase() === reqUser.username.trim().toLowerCase()) return true;
      return false;
    });

    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Data pengguna tidak ditemukan di sistem! Silakan lakukan logout dan login kembali.' 
      });
    }

    const currentUser = usersList[userIndex];
    const nowIso = new Date().toISOString();
    let displayNameChanged = false;
    let usernameChanged = false;

    if (displayName && displayName.trim() !== currentUser.displayName) {
      const newDisplayName = displayName.trim();

      if (newDisplayName.length < 2 || newDisplayName.length > 30) {
        return res.status(400).json({
          success: false,
          message: 'Display Name harus berukuran antara 2 hingga 30 karakter.'
        });
      }

      const cooldownStatus = checkCooldown(currentUser.lastDisplayNameUpdate, DISPLAY_NAME_COOLDOWN_MS);
      if (!cooldownStatus.canUpdate) {
        return res.status(429).json({
          success: false,
          message: `Anda hanya bisa mengganti Display Name 1 kali dalam 24 jam. Silakan coba lagi dalam ${cooldownStatus.remainingText}.`
        });
      }

      currentUser.displayName = newDisplayName;
      currentUser.lastDisplayNameUpdate = nowIso;
      displayNameChanged = true;
    }

    if (username && username.trim().toLowerCase() !== currentUser.username.toLowerCase()) {
      const newUsername = username.trim().toLowerCase();
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;

      if (!usernameRegex.test(newUsername)) {
        return res.status(400).json({
          success: false,
          message: 'Username harus berukuran 3-20 karakter (hanya huruf, angka, dan underscore).'
        });
      }

      const isTaken = usersList.some((u, idx) => idx !== userIndex && u.username && u.username.toLowerCase() === newUsername);
      if (isTaken) {
        return res.status(409).json({
          success: false,
          message: 'Username telah digunakan oleh pengguna lain. Silakan pilih username yang berbeda.'
        });
      }

      const cooldownStatus = checkCooldown(currentUser.lastUsernameUpdate, USERNAME_COOLDOWN_MS);
      if (!cooldownStatus.canUpdate) {
        return res.status(429).json({
          success: false,
          message: `Anda hanya bisa mengganti Username 1 kali dalam 1 minggu. Silakan coba lagi dalam ${cooldownStatus.remainingText}.`
        });
      }

      currentUser.username = newUsername;
      currentUser.lastUsernameUpdate = nowIso;
      usernameChanged = true;
    }

    if (typeof bio === 'string') {
      if (bio.length > 250) {
        return res.status(400).json({
          success: false,
          message: 'Deskripsi akun (bio) tidak boleh melebihi 250 karakter.'
        });
      }
      currentUser.bio = bio.trim();
    }

    if (avatar && avatar.length > 20) {
      currentUser.avatar = avatar;
    }

    usersList[userIndex] = currentUser;
    await saveUserDataToGitHub(usersList, fileSha);

    const secretKey = process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026';
    const newToken = jwt.sign(
      {
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        displayName: currentUser.displayName,
        role: currentUser.role || 'USER'
      },
      secretKey,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Profil berhasil diperbarui dan disimpan!',
      token: newToken,
      user: {
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        displayName: currentUser.displayName,
        bio: currentUser.bio || "",
        avatar: currentUser.avatar || DEFAULT_AVATAR_URL,
        role: currentUser.role || 'USER',
        lastDisplayNameUpdate: currentUser.lastDisplayNameUpdate || null,
        lastUsernameUpdate: currentUser.lastUsernameUpdate || null
      },
      updates: {
        displayNameChanged,
        usernameChanged
      }
    });

  } catch (error) {
    console.error('Error /api/user/update-profile:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui profil: ' + (error.message || 'Terjadi kesalahan sistem internal.')
    });
  }
});

app.get(['/api/user/profile', '/api/profile'], authenticateUserToken, async (req, res) => {
  try {
    const userId = req.query.userId || (req.user && req.user.id);
    const email = req.query.email || (req.user && req.user.email);
    const username = req.query.username || (req.user && req.user.username);

    const { usersList } = await fetchUserDataFromGitHub();

    const foundUser = usersList.find(u => {
      if (userId && u.id === userId) return true;
      if (email && u.email && u.email.toLowerCase() === email.toLowerCase()) return true;
      if (username && u.username && u.username.toLowerCase() === username.toLowerCase()) return true;
      return false;
    });

    if (!foundUser) {
      return res.status(404).json({ success: false, message: 'Profil pengguna tidak ditemukan.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: foundUser.id,
        email: foundUser.email,
        username: foundUser.username,
        displayName: foundUser.displayName,
        bio: foundUser.bio || "",
        avatar: foundUser.avatar || DEFAULT_AVATAR_URL,
        role: foundUser.role || 'USER',
        lastDisplayNameUpdate: foundUser.lastDisplayNameUpdate || null,
        lastUsernameUpdate: foundUser.lastUsernameUpdate || null,
        createdAt: foundUser.createdAt
      }
    });
  } catch (error) {
    console.error('Error /api/user/profile:', error.message || error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil profil: ' + error.message });
  }
});

app.get(['/api/admin/users', '/admin/users'], authenticateAdminToken, async (req, res) => {
  try {
    const { usersList } = await fetchUserDataFromGitHub();
    const sanitizedUsers = usersList.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      bio: u.bio || "",
      avatar: u.avatar || DEFAULT_AVATAR_URL,
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

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Endpoint Rute API '${req.originalUrl}' tidak ditemukan.`
  });
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS GLOBAL ERROR]:', err.stack || err);
  return res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan kritis pada aplikasi Express: ' + (err.message || 'Internal Error')
  });
});

module.exports = app;