const nodemailer = require('nodemailer');
const { Octokit } = require('@octokit/rest');

// In-Memory Temporary Store untuk OTP (Validasi sementara)
global.otpStore = global.otpStore || {};

// Transporter Email SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper Mengirim Email OTP
async function sendOTPEmail(targetEmail, otpCode, purposeTitle) {
  const mailOptions = {
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER}>`,
    to: targetEmail,
    subject: `[OTP ${purposeTitle}] Kode Verifikasi Keamanan Anda: ${otpCode}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #050506; color: #EDEDEF; padding: 30px; border-radius: 16px; max-width: 500px; margin: auto; border: 1px solid #5E6AD2;">
        <h2 style="color: #ffffff; text-align: center; margin-bottom: 20px;">Portal OSIS SMP KKK Padang</h2>
        <p style="font-size: 14px; color: #8A8F98;">Halo,</p>
        <p style="font-size: 14px; color: #EDEDEF;">Gunakan kode OTP di bawah ini untuk menyelesaikan proses <strong>${purposeTitle}</strong> Anda:</p>
        <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #6872D9; border-radius: 12px; margin: 20px 0;">
          ${otpCode}
        </div>
        <p style="font-size: 12px; color: #8A8F98; text-align: center;">Kode OTP ini berlaku selama 5 menit. Jangan berikan kode ini kepada siapapun.</p>
        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 25px;" />
        <p style="font-size: 10px; color: #606060; text-align: center;">© 2026 OSIS SMP Kristen Kalam Kudus Padang</p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
}

// Helper Membaca User_data.json dari GitHub Repository
async function getUsersFromGitHub() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  try {
    const { data } = await octokit.repos.getContent({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      path: 'User_data.json',
      ref: process.env.GITHUB_BRANCH || 'main',
    });

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { users: JSON.parse(content), sha: data.sha };
  } catch (error) {
    console.error('Gagal membaca dari GitHub, fallback ke mode lokal:', error.message);
    return { users: [], sha: null };
  }
}

// Helper Memperbarui & Commit User_data.json ke GitHub Repository
async function saveUsersToGitHub(updatedUsersList, fileSha) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const updatedContentBase64 = Buffer.from(
    JSON.stringify(updatedUsersList, null, 2)
  ).toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    path: 'User_data.json',
    message: 'chore(auth): auto-update User_data.json via Vercel Auth API',
    content: updatedContentBase64,
    sha: fileSha,
    branch: process.env.GITHUB_BRANCH || 'main',
  });
}

module.exports = {
  sendOTPEmail,
  getUsersFromGitHub,
  saveUsersToGitHub,
};