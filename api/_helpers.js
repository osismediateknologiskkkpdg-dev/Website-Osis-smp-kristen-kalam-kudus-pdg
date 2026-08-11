/**
 * ============================================================================
 * OSIS SMP KALAM KUDUS PADANG — SERVERLESS CORE HELPERS
 * File: api/_helpers.js
 * Deskripsi: Pusat konfigurasi Nodemailer SMTP, GitHub Octokit DB, CORS, & OTP
 * ============================================================================
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const { Octokit } = require('@octokit/rest');

// In-Memory Storage Global untuk OTP (Persistensi selama instance lambda aktif)
global.otpMemoryStore = global.otpMemoryStore || {};

/**
 * Menerapkan Header Cross-Origin Resource Sharing (CORS) pada Vercel Serverless Functions
 * @param {import('http').ServerResponse} res 
 */
function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

/**
 * Membuat dan Memvalidasi Transporter Nodemailer SMTP secara Ketat
 * Mencegah Error "Missing credentials for PLAIN" dengan pengecekan pra-eksekusi.
 */
function createSmtpTransporter() {
  const rawUser = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;

  // Validasi Keberadaan Environment Variables
  if (!rawUser || rawUser.trim() === '') {
    throw new Error(
      "Konfigurasi SMTP Gagal: Variable 'SMTP_USER' tidak ditemukan atau kosong pada Vercel Environment Variables."
    );
  }

  if (!rawPass || rawPass.trim() === '') {
    throw new Error(
      "Konfigurasi SMTP Gagal: Variable 'SMTP_PASS' tidak ditemukan atau kosong pada Vercel Environment Variables."
    );
  }

  const smtpUser = rawUser.trim();
  // Membersihkan spasi pada App Password Gmail (contoh: 'abcd efgh ijkl' -> 'abcdefghijkl')
  const smtpPass = rawPass.replace(/\s+/g, '');
  const smtpHost = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true untuk SSL (465), false untuk TLS/STARTTLS (587)
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Mencegah kegagalan otentikasi SSL pada lingkungan serverless
    },
  });
}

/**
 * Mengirimkan Email Berisi Kode OTP Verifikasi Keamanan
 * @param {string} targetEmail 
 * @param {string} otpCode 
 * @param {string} actionTitle 
 */
async function sendOtpEmail(targetEmail, otpCode, actionTitle) {
  const transporter = createSmtpTransporter();

  const htmlTemplate = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #050506; color: #EDEDEF; padding: 40px 20px; max-width: 540px; margin: 0 auto; border-radius: 20px; border: 1px solid #5E6AD2;">
      <div style="text-align: center; margin-bottom: 28px;">
        <h2 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">OSIS SMP KALAM KUDUS PADANG</h2>
        <p style="color: #8A8F98; font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px;">Official Student Council Portal</p>
      </div>

      <div style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); padding: 24px; border-radius: 16px; margin-bottom: 24px;">
        <p style="font-size: 14px; color: #EDEDEF; margin-top: 0;">Halo,</p>
        <p style="font-size: 14px; color: #8A8F98; line-height: 1.6;">Berikut adalah kode Otentikasi Sekali Pakai (OTP) Anda untuk melakukan <strong>${actionTitle}</strong>:</p>
        
        <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 20px; text-align: center; font-size: 36px; font-weight: 800; font-family: monospace; letter-spacing: 10px; color: #6872D9; border-radius: 12px; margin: 20px 0;">
          ${otpCode}
        </div>

        <p style="font-size: 12px; color: #8A8F98; text-align: center; margin-bottom: 0;">Kode ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapa pun demi keamanan akun Anda.</p>
      </div>

      <div style="text-align: center; font-size: 11px; color: #606060; font-family: monospace;">
        <p style="margin: 0;">&copy; 2026 OSIS SMP Kristen Kalam Kudus Padang. All Rights Reserved.</p>
      </div>
    </div>
  `;

  return await transporter.sendMail({
    from: `"OSIS SMP Kalam Kudus Padang" <${process.env.SMTP_USER.trim()}>`,
    to: targetEmail,
    subject: `[OTP ${actionTitle}] Kode Verifikasi: ${otpCode}`,
    html: htmlTemplate,
  });
}

/**
 * Membaca Data Pengguna dari File User_data.json di Repositori GitHub
 */
async function getUsersFromGitHub() {
  const token = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;
  const owner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : null;
  const repo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : null;
  const branch = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';

  if (!token || !owner || !repo) {
    console.warn('Peringatan: Konfigurasi GitHub API belum lengkap di Environment Variables.');
    return { usersList: [], fileSha: null };
  }

  const octokit = new Octokit({ auth: token });

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: 'User_data.json',
      ref: branch,
    });

    const fileContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
    const parsedData = JSON.parse(fileContent);

    return {
      usersList: Array.isArray(parsedData) ? parsedData : [],
      fileSha: response.data.sha,
    };
  } catch (error) {
    console.error('Error saat membaca User_data.json dari GitHub API:', error.message);
    return { usersList: [], fileSha: null };
  }
}

/**
 * Menyimpan / Meng-commit Pembaruan Data Pengguna ke GitHub Repositori
 */
async function saveUsersToGitHub(updatedUsersList, currentSha) {
  const token = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;
  const owner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : null;
  const repo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : null;
  const branch = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';

  if (!token || !owner || !repo) {
    throw new Error('Gagal menyimpan ke GitHub: Variable GITHUB_TOKEN, GITHUB_OWNER, atau GITHUB_REPO belum diatur.');
  }

  const octokit = new Octokit({ auth: token });
  const updatedContentBase64 = Buffer.from(JSON.stringify(updatedUsersList, null, 2)).toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'User_data.json',
    message: 'chore(auth): update User_data.json via Vercel Serverless Function',
    content: updatedContentBase64,
    sha: currentSha,
    branch,
  });
}

module.exports = {
  applyCorsHeaders,
  sendOtpEmail,
  getUsersFromGitHub,
  saveUsersToGitHub,
};