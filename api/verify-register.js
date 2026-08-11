const bcrypt = require('bcryptjs');
const { getUsersFromGitHub, saveUsersToGitHub } = require('./_helpers');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email dan Kode OTP wajib diisi!' });
    }

    const storedData = global.otpStore[email.toLowerCase()];

    if (!storedData) {
      return res.status(400).json({ success: false, message: 'Sesi OTP tidak ditemukan atau sudah kedaluwarsa!' });
    }

    if (Date.now() > storedData.expiresAt) {
      delete global.otpStore[email.toLowerCase()];
      return res.status(400).json({ success: false, message: 'Kode OTP sudah kadaluwarsa. Silakan mendaftar ulang.' });
    }

    if (storedData.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Kode OTP tidak cocok! Periksa kembali email Anda.' });
    }

    // Hash Password sebelum disimpan ke User_data.json
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(storedData.userData.password, salt);

    // Ambil Data Pengguna Terbaru dari GitHub Repository
    const { users, sha } = await getUsersFromGitHub();

    const newUserRecord = {
      id: 'usr_' + Date.now(),
      email: storedData.userData.email,
      username: storedData.userData.username,
      displayName: storedData.userData.displayName,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
      verified: true,
    };

    users.push(newUserRecord);

    // Commit Pembaruan User_data.json Langsung ke Repositori GitHub
    await saveUsersToGitHub(users, sha);

    // Hapus Sesi OTP Temp
    delete global.otpStore[email.toLowerCase()];

    return res.status(200).json({
      success: true,
      message: 'Pendaftaran berhasil! Akun Anda telah disimpan di User_data.json. Mengarahkan ke halaman login...',
    });
  } catch (error) {
    console.error('Error Verify Register API:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyelesaikan pendaftaran: ' + error.message });
  }
};