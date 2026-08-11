const { getUsersFromGitHub, sendOTPEmail } = require('./_helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { email, username, displayName, password, confirmPassword } = req.body;

    // 1. Validasi Kelengkapan Field
    if (!email || !username || !displayName || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi!' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Konfirmasi password tidak cocok!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter!' });
    }

    // 2. Cek Apakah Email / Username Sudah Terdaftar di User_data.json
    const { users } = await getUsersFromGitHub();
    const existingUser = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase()
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email atau Username sudah terdaftar! Silakan login atau gunakan kredensial lain.',
      });
    }

    // 3. Generate 6 Digit Kode OTP
    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    // Simpan Data Registrasi Sementara di Memory dengan Expired 5 Menit
    global.otpStore[email.toLowerCase()] = {
      otp: generatedOTP,
      userData: {
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        displayName,
        password,
      },
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    // 4. Kirim OTP ke Email Pengguna
    await sendOTPEmail(email, generatedOTP, 'Pendaftaran Akun OSIS');

    return res.status(200).json({
      success: true,
      message: 'Kode OTP berhasil dikirimkan ke email Anda. Silakan periksa Kotak Masuk / Spam.',
      email: email.toLowerCase(),
    });
  } catch (error) {
    console.error('Error Register API:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + error.message });
  }
};