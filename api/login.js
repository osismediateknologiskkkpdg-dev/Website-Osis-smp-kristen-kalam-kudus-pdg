/**
 * ============================================================================
 * ENDPOINT LOGIN USER (REQUEST OTP LOGIN)
 * File: api/login.js
 * ============================================================================
 */

const bcrypt = require('bcryptjs');
const { applyCorsHeaders, sendOtpEmail, getUsersFromGitHub } = require('./_helpers');

module.exports = async (req, res) => {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Gunakan POST.' });
  }

  try {
    const { identifier, password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    // Cari Akun pada Data GitHub
    const { usersList } = await getUsersFromGitHub();
    const foundUser = usersList.find(
      (u) => u.email.toLowerCase() === cleanIdentifier || u.username.toLowerCase() === cleanIdentifier
    );

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: 'Akun tidak ditemukan! Silakan periksa kembali data Anda atau mendaftar akun baru.',
        suggestRegister: true,
      });
    }

    // Verifikasi Password Hash
    const isPasswordMatch = await bcrypt.compare(password, foundUser.passwordHash);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah!',
        suggestRegister: false,
      });
    }

    // Generate Kode OTP Verifikasi Login
    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionKey = 'login_' + foundUser.email.toLowerCase();

    global.otpMemoryStore[sessionKey] = {
      otp: loginOtp,
      userData: foundUser,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    // Kirim Kode OTP Ke Email
    await sendOtpEmail(foundUser.email, loginOtp, 'Otentikasi Masuk (Login)');

    return res.status(200).json({
      success: true,
      message: 'Kredensial valid! Kode OTP Verifikasi Login telah dikirimkan ke email Anda.',
      email: foundUser.email,
    });
  } catch (error) {
    console.error('Error pada Handler /api/login:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server: ' + error.message,
    });
  }
};