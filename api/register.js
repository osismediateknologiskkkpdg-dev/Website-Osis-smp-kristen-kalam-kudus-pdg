/**
 * ============================================================================
 * ENDPOINT REGISTRASI USER (REQUEST OTP)
 * File: api/register.js
 * ============================================================================
 */

const { applyCorsHeaders, sendOtpEmail, getUsersFromGitHub } = require('./_helpers');

module.exports = async (req, res) => {
  applyCorsHeaders(res);

  // Penanganan Preflight Request OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Gunakan POST.' });
  }

  try {
    const { email, username, displayName, password, confirmPassword } = req.body || {};

    // Validasi Form Input
    if (!email || !username || !displayName || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Semua kolom formulir pendaftaran wajib diisi!' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal harus terdiri dari 6 karakter!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    // Cek Duplikasi Akun dari Database GitHub
    const { usersList } = await getUsersFromGitHub();
    const isExistingUser = usersList.some(
      (user) => user.email.toLowerCase() === cleanEmail || user.username.toLowerCase() === cleanUsername
    );

    if (isExistingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email atau Username sudah terdaftar di sistem! Silakan gunakan akun lain atau login.',
      });
    }

    // Generate 6 Digit Random OTP Code
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Simpan ke Memory Store (Kadaluwarsa dalam 5 Menit)
    global.otpMemoryStore[cleanEmail] = {
      otp: generatedOtp,
      payload: {
        email: cleanEmail,
        username: cleanUsername,
        displayName: displayName.trim(),
        password: password,
      },
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    // Kirim Email OTP via SMTP
    await sendOtpEmail(cleanEmail, generatedOtp, 'Pendaftaran Akun Baru');

    return res.status(200).json({
      success: true,
      message: 'Kode OTP Verifikasi telah berhasil dikirimkan ke email Anda. Silakan periksa Inbox/Spam.',
      email: cleanEmail,
    });
  } catch (error) {
    console.error('Error pada Handler /api/register:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server: ' + error.message,
    });
  }
};