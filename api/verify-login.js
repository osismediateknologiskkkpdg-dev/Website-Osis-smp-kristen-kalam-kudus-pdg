const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const key = 'login_' + email.toLowerCase();
    const storedData = global.otpStore[key];

    if (!storedData) {
      return res.status(400).json({ success: false, message: 'Sesi verifikasi login tidak ditemukan atau kadaluwarsa.' });
    }

    if (Date.now() > storedData.expiresAt) {
      delete global.otpStore[key];
      return res.status(400).json({ success: false, message: 'Kode OTP telah kadaluwarsa. Silakan login kembali.' });
    }

    if (storedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP Verifikasi Login tidak valid!' });
    }

    // Generate JWT Token Akses Sesi
    const token = jwt.sign(
      {
        id: storedData.userId,
        email: storedData.email,
        username: storedData.username,
        displayName: storedData.displayName,
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    // Hapus Temp OTP
    delete global.otpStore[key];

    return res.status(200).json({
      success: true,
      message: 'Login Berhasil! Selamat datang di Portal OSIS SMP Kalam Kudus Padang.',
      token,
      user: {
        displayName: storedData.displayName,
        username: storedData.username,
        email: storedData.email,
      },
    });
  } catch (error) {
    console.error('Error Verify Login API:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem: ' + error.message });
  }
};