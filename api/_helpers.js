/**
 * ============================================================================
 * OSIS SMP KALAM KUDUS PADANG — SERVERLESS CORE HELPERS
 * File: api/_helpers.js
 * Deskripsi: Pusat konfigurasi Nodemailer SMTP, Native Fetch GitHub API, & CORS
 * ============================================================================
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// In-Memory Storage Global untuk OTP
global.otpMemoryStore = global.otpMemoryStore || {};

/**
 * Menerapkan Header CORS pada Vercel Serverless Function
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
 * Memvalidasi & Membuat Transporter Nodemailer
 */
function createSmtpTransporter() {
  const rawUser = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;

  if (!rawUser || !rawUser.trim()) {
    throw new Error("Variabel 'SMTP_USER' tidak ditemukan pada Environment Variables Vercel.");
  }
  if (!rawPass || !rawPass.trim()) {
    throw new Error("Variabel 'SMTP_PASS' tidak ditemukan pada Environment Variables Vercel.");
  }

  const smtpUser = rawUser.trim();
  const smtpPass = rawPass.replace(/\s+/g, '');
  const smtpHost = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Mengirimkan Email OTP Verifikasi
 */
async function sendOtpEmail(targetEmail, otpCode, actionTitle) {
  const transporter = createSmtpTransporter();

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; background-color: #050506; color: #EDEDEF; padding: 30px; max-width: 500px; margin: 0 auto; border-radius: 16px; border: 1px solid #5E6AD2;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #ffffff; margin: 0;">OSIS SMP KALAM KUDUS PADANG</h2>
        <p style="color: #8A8F98; font-size: 11px; font-family: monospace; margin-top: 4px;">OFFICIAL PORTAL</p>
      </div>
      <p style="font-size: 14px;">Halo,</p>
      <p style="font-size: 14px; color: #8A8F98;">Gunakan kode OTP berikut untuk melanjutkan proses <strong>${actionTitle}</strong> Anda:</p>
      <div style="background-color: #0a0a0c; border: 2px dashed #5E6AD2; padding: 18px; text-align: center; font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 8px; color: #6872D9; border-radius: 10px; margin: 20px 0;">
        ${otpCode}
      </div>
      <p style="font-size: 12px; color: #8A8F98; text-align: center;">Kode ini berlaku selama <strong>5 menit</strong>.</p>
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
 * Membaca File User_data.json dari GitHub Menggunakan Native Fetch
 */
async function getUsersFromGitHub() {
  const token = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;
  const owner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : null;
  const repo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : null;
  const branch = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';

  if (!token || !owner || !repo) {
    console.warn('Konfigurasi GitHub API belum lengkap di Environment Variables.');
    return { usersList: [], fileSha: null };
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/User_data.json?ref=${branch}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-Serverless-App'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub REST API melempar HTTP status ${response.status}`);
    }

    const data = await response.json();
    const fileContent = Buffer.from(data.content, 'base64').toString('utf-8');
    const parsedData = JSON.parse(fileContent);

    return {
      usersList: Array.isArray(parsedData) ? parsedData : [],
      fileSha: data.sha,
    };
  } catch (error) {
    console.error('Error saat membaca User_data.json dari GitHub:', error.message);
    return { usersList: [], fileSha: null };
  }
}

/**
 * Menyimpan / Meng-commit Pembaruan ke User_data.json Menggunakan Native Fetch
 */
async function saveUsersToGitHub(updatedUsersList, currentSha) {
  const token = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim() : null;
  const owner = process.env.GITHUB_OWNER ? process.env.GITHUB_OWNER.trim() : null;
  const repo = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.trim() : null;
  const branch = process.env.GITHUB_BRANCH ? process.env.GITHUB_BRANCH.trim() : 'main';

  if (!token || !owner || !repo) {
    throw new Error('Gagal menyimpan ke GitHub: Variable GITHUB_TOKEN, GITHUB_OWNER, atau GITHUB_REPO belum diset.');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/User_data.json`;
  const contentBase64 = Buffer.from(JSON.stringify(updatedUsersList, null, 2)).toString('base64');

  const payload = {
    message: 'chore(auth): update User_data.json via Vercel Function',
    content: contentBase64,
    branch: branch,
  };

  if (currentSha) {
    payload.sha = currentSha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Vercel-Serverless-App'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Gagal meng-commit ke GitHub (${response.status}): ${errorDetails}`);
  }
}

module.exports = {
  applyCorsHeaders,
  sendOtpEmail,
  getUsersFromGitHub,
  saveUsersToGitHub,
};