/**
 * ============================================================================
 * ENDPOINT VERIFIKASI OTP REGISTRASI & SAVING TO GITHUB
 * File: api/verify-register.js
 * ============================================================================
 */

const bcrypt = require('bcryptjs');
const { applyCorsHeaders, getUsersFromGitHub, saveUsersToGitHub } = require('./_helpers');

module.exports = async (req, res) => {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Gunakan POST.' });
  }

  try {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cachedRecord = global.otpMemoryStore[cleanEmail];

    if (!cachedRecord) {
      return res.status(400).json({
        success: false,
        message: 'Sesi verifikasi OTP tidak ditemukan atau telah kadaluwarsa. Silakan mendaftar ulang.',
      });
    }

    if (Date.now() > cachedRecord.expiresAt) {
      delete global.otpMemoryStore[cleanEmail];
      return res.status(400).json({
        success: false,
        message: 'Kode OTP telah kadaluwarsa! Silakan ajukan pendaftaran kembali.',
      });
    }

    if (cachedRecord.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP yang Anda masukkan tidak valid!' });
    }

    // Encrypt Password menggunakan BcryptJS
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(cachedRecord.payload.password, salt);

    // Ambil Data Pengguna Terkini dari GitHub
    const { usersList, fileSha } = await getUsersFromGitHub();

    const newUserData = {
      id: 'usr_' + Date.now(),
      email: cachedRecord.payload.email,
      username: cachedRecord.payload.username,
      displayName: cachedRecord.payload.displayName,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
      verified: true,
    };

    usersList.push(newUserData);

    // Commit Pembaruan Data ke GitHub Repository
    await saveUsersToGitHub(usersList, fileSha);

    // Bersihkan Memory OTP
    delete global.otpMemoryStore[cleanEmail];

    return res.status(200).json({
      success: true,
      message: 'Registrasi Akun Berhasil! Data Anda telah tersimpan di User_data.json. Silakan melakukan Login.',
    });
  } catch (error) {
    console.error('Error pada Handler /api/verify-register:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memverifikasi pendaftaran: ' + error.message,
    });
  }
};