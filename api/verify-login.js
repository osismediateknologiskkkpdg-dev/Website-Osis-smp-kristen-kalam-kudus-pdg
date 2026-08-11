/**
 * ============================================================================
 * ENDPOINT VERIFIKASI OTP LOGIN & JWT ISSUANCE
 * File: api/verify-login.js
 * ============================================================================
 */

const jwt = require('jsonwebtoken');
const { applyCorsHeaders } = require('./_helpers');

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
    const sessionKey = 'login_' + cleanEmail;
    const cachedRecord = global.otpMemoryStore[sessionKey];

    if (!cachedRecord) {
      return res.status(400).json({
        success: false,
        message: 'Sesi verifikasi login tidak ditemukan atau telah kadaluwarsa.',
      });
    }

    if (Date.now() > cachedRecord.expiresAt) {
      delete global.otpMemoryStore[sessionKey];
      return res.status(400).json({
        success: false,
        message: 'Kode OTP telah kadaluwarsa! Silakan ulangi proses login.',
      });
    }

    if (cachedRecord.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP Login yang Anda masukkan salah!' });
    }

    // Penerbitan JWT Token (Masa berlaku 24 Jam)
    const token = jwt.sign(
      {
        id: cachedRecord.userData.id,
        email: cachedRecord.userData.email,
        username: cachedRecord.userData.username,
        displayName: cachedRecord.userData.displayName,
      },
      process.env.JWT_SECRET || 'osis_kalam_kudus_padang_secret_key_2026',
      { expiresIn: '24h' }
    );

    // Hapus Sesi OTP dari Memory
    delete global.otpMemoryStore[sessionKey];

    return res.status(200).json({
      success: true,
      message: 'Autentikasi Berhasil! Selamat datang di Portal OSIS SMP Kalam Kudus Padang.',
      token,
      user: {
        displayName: cachedRecord.userData.displayName,
        username: cachedRecord.userData.username,
        email: cachedRecord.userData.email,
      },
    });
  } catch (error) {
    console.error('Error pada Handler /api/verify-login:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan sistem: ' + error.message,
    });
  }
};