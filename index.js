/**
 * ============================================================================
 * SERVER BACKEND UTAMA SYSTEM AUTHENTICATION OSIS SMP KALAM KUDUS PADANG
 * File: api/index.js
 * Framework: Express.js (Serverless Ready for Vercel)
 * ============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Octokit } = require('@octokit/rest');

const app = express();

// ==================== MIDDLEWARE CONFIGURATION ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store OTP Sementara di Memory Server (In-Memory Key-Value)
global.otpMemoryStore = global.otpMemoryStore || {};

// ==================== HELPER 1: DYNAMIC NODEMAILER TRANSPORTER ====================

/**
 * Membuat Transporter Nodemailer dengan Validasi Kredensial yang Ketat
 */
function createMailTransporter() {
  const smtpUser = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : null;
  // Bersihkan spasi dari Gmail App Password jika ada
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : null;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!smtpUser || !smtpPass) {
    throw new Error(
      'Kredensial SMTP belum dikonfigurasi di Environment Variables! Pastikan SMTP_USER dan SMTP_PASS sudah diisi di Vercel Settings.'
    );
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // True untuk port 465, False untuk port 587 / 25
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Mencegah kegagalan koneksi SSL/TLS pada beberapa instance serverless
    },
  });
}

/**
 * Mengirimkan Email OTP ke Alamat Tujuan
 */
async function dispatchOTPEmail(targetEmail, otpCode, flowTitle) {
  const transporter = createMailTransporter();

  const emailContent = `
    <div style="font-family: 'Inter', Arial, sans-serif; background-color: #050506; color: #EDEDEF; padding: 32px; border-radius: 16px; max-width: 520px; margin: 0 auto; border: 1px solid #5E6AD2;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">OSIS SMP KALAM KUDUS PADANG</h2>
        <p style="color: #8A8F98; font-size: 12px; font-family: monospace; margin-top: 4px;">OFFICIAL AUTHENTICATION SYSTEM</p>
      </div>
      <p style="font-size: 14px; color: #EDEDEF; line-height: 1.6;">Halo,</p>
      <p style="font-size: 14px; color: #EDEDEF; line-height: 1.6;">Gunakan kode OTP berikut untuk menyelesaikan proses <strong>${flowTitle}</strong> Anda:</p>
      <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 18px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #6872D9; border-radius: 12px; margin: 24px 0;">
        ${otpCode}
      </div>
      <p style="font-size: 12px; color: #8A8F98; text-align: center; margin: 0;">Kode OTP ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapapun.</p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 28px 0 16px 0;" />
      <p style="font-size: 10px; color: #606060; text-align: center; margin: 0;">&copy; 2026 OSIS SMP Kristen Kalam Kudus Padang. All Rights Reserved.</p>
    </div>
  `;

  return await transporter.sendMail({
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER}>`,
    to: targetEmail,
    subject: `[OTP ${flowTitle}] Kode Verifikasi Keamanan: ${otpCode}`,
    html: emailContent,
  });
}

// ==================== HELPER 2: GITHUB API USER_DATA READ/WRITE ====================

/**
 * Membaca File User_data.json dari Repositori GitHub
 */
async function fetchUsersFromGitHub() {
  const githubToken = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;

  if (!githubToken) {
    console.warn('GITHUB_TOKEN belum dikonfigurasi. Menggunakan mode fallback memory.');
    return { usersList: [], fileSha: null };
  }

  const octokit = new Octokit({ auth: githubToken });
  try {
    const response = await octokit.repos.getContent({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      path: 'User_data.json',
      ref: process.env.GITHUB_BRANCH || 'main',
    });

    const fileContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return { usersList: JSON.parse(fileContent), fileSha: response.data.sha };
  } catch (error) {
    console.error('Error Reading User_data.json from GitHub:', error.message);
    return { usersList: [], fileSha: null };
  }
}

/**
 * Memperbarui & Meng-commit File User_data.json ke GitHub
 */
async function commitUsersToGitHub(updatedUsersList, currentSha) {
  const githubToken = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;

  if (!githubToken) {
    throw new Error('GITHUB_TOKEN tidak ditemukan di Environment Variables. Gagal menyimpan ke GitHub.');
  }

  const octokit = new Octokit({ auth: githubToken });
  const contentBase64 = Buffer.from(JSON.stringify(updatedUsersList, null, 2)).toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    path: 'User_data.json',
    message: 'chore(auth): auto-update User_data.json via Vercel Express API',
    content: contentBase64,
    sha: currentSha,
    branch: process.env.GITHUB_BRANCH || 'main',
  });
}

// ==================== ROUTE 1: REGISTER USER (REQUEST OTP) ====================
app.post('/api/register', async (req, res) => {
  try {
    const { email, username, displayName, password, confirmPassword } = req.body;

    if (!email || !username || !displayName || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Semua kolom input wajib diisi!' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal terdiri dari 6 karakter!' });
    }

    const { usersList } = await fetchUsersFromGitHub();
    const isDuplicate = usersList.some(
      (user) => user.email.toLowerCase() === email.toLowerCase() || user.username.toLowerCase() === username.toLowerCase()
    );

    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'Email atau Username sudah terdaftar! Silakan login atau gunakan kredensial lain.',
      });
    }

    // Generate 6 Digit Random OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Simpan Ke Memory Server dengan Expiration 5 Menit
    global.otpMemoryStore[email.toLowerCase()] = {
      otp: otpCode,
      payload: { email: email.toLowerCase(), username: username.toLowerCase(), displayName, password },
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    // Kirim Email OTP
    await dispatchOTPEmail(email, otpCode, 'Pendaftaran Akun Baru');

    return res.status(200).json({
      success: true,
      message: 'Kode OTP telah dikirimkan ke email Anda. Silakan cek Inbox/Spam.',
      email: email.toLowerCase(),
    });
  } catch (err) {
    console.error('Register Route Error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + err.message });
  }
});

// ==================== ROUTE 2: VERIFY REGISTER OTP & SAVE ====================
app.post('/api/verify-register', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const cachedData = global.otpMemoryStore[email.toLowerCase()];

    if (!cachedData) {
      return res.status(400).json({ success: false, message: 'Sesi verifikasi OTP tidak ditemukan atau sudah kedaluwarsa.' });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete global.otpMemoryStore[email.toLowerCase()];
      return res.status(400).json({ success: false, message: 'Kode OTP sudah kadaluwarsa. Silakan lakukan pendaftaran ulang.' });
    }

    if (cachedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP yang Anda masukkan salah!' });
    }

    // Hash Password Menggunakan Bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(cachedData.payload.password, salt);

    // Ambil Data Pengguna Terbaru dari GitHub & Tambahkan User Baru
    const { usersList, fileSha } = await fetchUsersFromGitHub();

    const newUserObject = {
      id: 'usr_' + Date.now(),
      email: cachedData.payload.email,
      username: cachedData.payload.username,
      displayName: cachedData.payload.displayName,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
      verified: true,
    };

    usersList.push(newUserObject);

    // Auto Commit Pembaruan ke File User_data.json di GitHub
    await commitUsersToGitHub(usersList, fileSha);

    delete global.otpMemoryStore[email.toLowerCase()];

    return res.status(200).json({
      success: true,
      message: 'Registrasi Berhasil! Data Akun Anda telah disimpan ke User_data.json. Silakan Login.',
    });
  } catch (err) {
    console.error('Verify Register Route Error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menyelesaikan pendaftaran: ' + err.message });
  }
});

// ==================== ROUTE 3: LOGIN USER (REQUEST OTP) ====================
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });
    }

    const { usersList } = await fetchUsersFromGitHub();

    const foundUser = usersList.find(
      (u) =>
        u.email.toLowerCase() === identifier.toLowerCase() ||
        u.username.toLowerCase() === identifier.toLowerCase()
    );

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Akun tidak ditemukan! Silakan periksa kembali kredensial Anda atau mendaftar terlebih dahulu.',
        suggestRegister: true,
      });
    }

    const isMatch = await bcrypt.compare(password, foundUser.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah!',
        suggestRegister: false,
      });
    }

    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();

    global.otpMemoryStore['login_' + foundUser.email.toLowerCase()] = {
      otp: loginOtp,
      userData: foundUser,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    await dispatchOTPEmail(foundUser.email, loginOtp, 'Verifikasi Login');

    return res.status(200).json({
      success: true,
      message: 'Kredensial cocok! Kode OTP Verifikasi Login telah dikirimkan ke email Anda.',
      email: foundUser.email,
    });
  } catch (err) {
    console.error('Login Route Error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + err.message });
  }
});

// ==================== ROUTE 4: VERIFY LOGIN OTP & GENERATE JWT ====================
app.post('/api/verify-login', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const cacheKey = 'login_' + email.toLowerCase();
    const cachedData = global.otpMemoryStore[cacheKey];

    if (!cachedData) {
      return res.status(400).json({ success: false, message: 'Sesi login tidak ditemukan atau sudah kadaluwarsa.' });
    }

    if (Date.now() > cachedData.expiresAt) {
      delete global.otpMemoryStore[cacheKey];
      return res.status(400).json({ success: false, message: 'Kode OTP telah kadaluwarsa. Silakan ulangi login.' });
    }

    if (cachedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP Verifikasi Login tidak valid!' });
    }

    // Penerbitan JWT Token
    const jwtToken = jwt.sign(
      {
        id: cachedData.userData.id,
        email: cachedData.userData.email,
        username: cachedData.userData.username,
        displayName: cachedData.userData.displayName,
      },
      process.env.JWT_SECRET || 'secret_fallback_key',
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
      },
    });
  } catch (err) {
    console.error('Verify Login Route Error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem: ' + err.message });
  }
});

// Export App sebagai Vercel Serverless Function
module.exports = app;