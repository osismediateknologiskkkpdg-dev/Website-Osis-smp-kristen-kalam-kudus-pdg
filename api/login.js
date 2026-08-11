const bcrypt = require('bcryptjs');
const { getUsersFromGitHub, sendOTPEmail } = require('./_helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { identifier, password } = req.body; // identifier bisa berisi Email atau Username

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username dan Password wajib diisi!' });
    }

    // Read Data dari User_data.json
    const { users } = await getUsersFromGitHub();

    const user = users.find(
      (u) =>
        u.email.toLowerCase() === identifier.toLowerCase() ||
        u.username.toLowerCase() === identifier.toLowerCase()
    );

    // Jika Akun Tidak Ditemukan -> Anjurkan Register
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Akun tidak ditemukan! Silakan periksa kembali Email/Username Anda atau lakukan Register terlebih dahulu.',
        suggestRegister: true,
      });
    }

    // Pencocokan Enkripsi Password (Bcrypt)
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password salah! Periksa kembali password Anda.',
        suggestRegister: false,
      });
    }

    // Jika Kredensial Cocok -> Generate Kode OTP Login
    const loginOTP = Math.floor(100000 + Math.random() * 900000).toString();

    global.otpStore['login_' + user.email.toLowerCase()] = {
      otp: loginOTP,
      userId: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    // Kirim Kode OTP Ke Email Terdaftar
    await sendOTPEmail(user.email, loginOTP, 'Verifikasi Login');

    return res.status(200).json({
      success: true,
      message: 'Kredensial sesuai! Kode OTP Verifikasi Login telah dikirimkan ke email Anda.',
      email: user.email,
    });
  } catch (error) {
    console.error('Error Login API:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server: ' + error.message });
  }
};