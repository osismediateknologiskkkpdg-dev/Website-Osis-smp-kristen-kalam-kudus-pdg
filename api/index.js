<!DOCTYPE html>
<html lang="id" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OSIS SMP Kalam Kudus Padang — Official Web Portal</title>
    
    <!-- Google Fonts: Inter (Sans) & JetBrains Mono (Code/Labels) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Lucide Icons CDN -->
    <script src="https://unpkg.com/lucide@latest"></script>
    
    <!-- AOS Animation Library CSS -->
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">

    <!-- Tailwind Config Customization -->
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        bgDeep: '#020203',
                        bgBase: '#050506',
                        bgElevated: '#0a0a0c',
                        surface: 'rgba(255, 255, 255, 0.05)',
                        surfaceHover: 'rgba(255, 255, 255, 0.08)',
                        fg: '#EDEDEF',
                        fgMuted: '#8A8F98',
                        fgSubtle: 'rgba(255, 255, 255, 0.60)',
                        accent: '#5E6AD2',
                        accentBright: '#6872D9',
                        accentGlow: 'rgba(94, 106, 210, 0.3)',
                        borderDefault: 'rgba(255, 255, 255, 0.06)',
                        borderHover: 'rgba(255, 255, 255, 0.12)',
                        borderAccent: 'rgba(94, 106, 210, 0.30)',
                    },
                    fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    borderRadius: {
                        '3xl': '24px',
                        '2xl': '16px',
                        'xl': '12px',
                        'lg': '8px',
                    }
                }
            }
        }
    </script>

    <style>
        /* Custom Smooth Scrollbar & Base Reset */
        body {
            background-color: #050506;
            color: #EDEDEF;
            font-family: 'Inter', system-ui, sans-serif;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
            user-select: none; /* Mencegah seleksi teks ilegal */
            -webkit-user-select: none;
        }

        ::-webkit-scrollbar {
            width: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #020203;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #5E6AD2;
        }

        /* Ambient Keyframe Animations */
        @keyframes float-primary {
            0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); }
            50% { transform: translateY(-30px) rotate(2deg) scale(1.05); }
        }
        @keyframes float-secondary {
            0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); }
            50% { transform: translateY(25px) rotate(-3deg) scale(0.95); }
        }
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }

        .animate-float-1 {
            animation: float-primary 10s ease-in-out infinite;
        }
        .animate-float-2 {
            animation: float-secondary 12s ease-in-out infinite;
        }
        .animate-shimmer {
            background: linear-gradient(90deg, #5E6AD2 0%, #a5b4fc 50%, #5E6AD2 100%);
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            animation: shimmer 6s linear infinite;
        }

        /* Multi-layer Shadow & Linear Cards */
        .card-linear {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
            border: 1px solid rgba(255, 255, 255, 0.06);
            box-shadow: 
                0 0 0 1px rgba(255, 255, 255, 0.04),
                0 4px 20px rgba(0, 0, 0, 0.5),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.1);
            transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .card-linear:hover {
            border-color: rgba(255, 255, 255, 0.14);
            transform: translateY(-4px);
            box-shadow: 
                0 0 0 1px rgba(94, 106, 210, 0.3),
                0 12px 40px rgba(0, 0, 0, 0.6),
                0 0 60px rgba(94, 106, 210, 0.15),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.25);
        }

        .btn-primary-glow {
            background-color: #5E6AD2;
            box-shadow: 
                0 0 0 1px rgba(94, 106, 210, 0.5),
                0 4px 16px rgba(94, 106, 210, 0.4),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.25);
            transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-primary-glow:hover {
            background-color: #6872D9;
            box-shadow: 
                0 0 0 1px rgba(104, 114, 217, 0.8),
                0 6px 24px rgba(94, 106, 210, 0.6),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.4);
            transform: translateY(-2px);
        }

        /* Mouse Tracking Spotlight Card Wrapper */
        .spotlight-card {
            position: relative;
            overflow: hidden;
        }
        .spotlight-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(350px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(94, 106, 210, 0.15), transparent 80%);
            opacity: 0;
            transition: opacity 300ms ease;
            pointer-events: none;
            z-index: 10;
        }
        .spotlight-card:hover::before {
            opacity: 1;
        }

        /* Image Aspect Frames */
        .img-card-frame {
            position: relative;
            overflow: hidden;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background-color: #0a0a0c;
        }
        .img-card-frame img {
            transition: transform 500ms cubic-bezier(0.16, 1, 0.3, 1), filter 300ms ease;
        }
        .img-card-frame:hover img {
            transform: scale(1.05);
        }

        /* Focus Ring */
        a:focus-visible, button:focus-visible {
            outline: none !important;
            box-shadow: 0 0 0 2px #050506, 0 0 0 4px rgba(94, 106, 210, 0.8) !important;
        }
    </style>
</head>

<body class="bg-bgBase text-fg relative min-h-screen">

    <!-- ==================== BACKGROUND LIGHTING SYSTEM ==================== -->
    <div class="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#0a0a0f_0%,#050506_60%,#020203_100%)]"></div>
        <div class="absolute -top-[200px] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-accent/20 rounded-full blur-[160px] animate-float-1"></div>
        <div class="absolute top-[40%] -left-[200px] w-[700px] h-[500px] bg-indigo-900/15 rounded-full blur-[140px] animate-float-2"></div>
        <div class="absolute top-[70%] -right-[200px] w-[650px] h-[550px] bg-purple-900/10 rounded-full blur-[150px] animate-float-1"></div>
        <div class="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg%20viewBox=%220%200%20256%20256%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter%20id=%22noise%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.8%22%20numOctaves=%224%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20filter=%22url(%23noise)%22/%3E%3C/svg%3E')]"></div>
        <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]"></div>
    </div>

    <!-- ==================== HEADER NAVIGATION ==================== -->
    <header class="sticky top-0 z-50 w-full bg-bgBase/80 backdrop-blur-xl border-b border-borderDefault">
        <div class="max-w-7xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between relative z-10">
            
            <a href="#" class="flex items-center space-x-3 group">
                <div class="w-10 h-10 rounded-xl bg-surface border border-white/10 flex items-center justify-center group-hover:border-accent/50 transition-colors">
                    <img src="https://i.ibb.co.com/whKDsQ5L/image.png" alt="Logo OSIS" class="w-6 h-6 object-contain filter drop-shadow">
                </div>
                <div>
                    <span class="font-bold text-base tracking-tight block text-fg group-hover:text-white transition-colors">OSIS SMP KKK</span>
                    <span class="font-mono text-[10px] text-fgMuted tracking-wider uppercase">PADANG // 2026-2027</span>
                </div>
            </a>

            <nav class="hidden md:flex items-center space-x-1 bg-surface p-1.5 rounded-full border border-borderDefault">
                <a href="#about-us" class="px-4 py-1.5 rounded-full text-xs font-medium text-fgMuted hover:text-fg hover:bg-white/5 transition-all">Tentang</a>
                <a href="#vision-mission" class="px-4 py-1.5 rounded-full text-xs font-medium text-fgMuted hover:text-fg hover:bg-white/5 transition-all">Visi & Misi</a>
                <a href="#structure" class="px-4 py-1.5 rounded-full text-xs font-medium text-fgMuted hover:text-fg hover:bg-white/5 transition-all">Pengurus</a>
                <a href="#gallery" class="px-4 py-1.5 rounded-full text-xs font-medium text-fgMuted hover:text-fg hover:bg-white/5 transition-all">Galeri</a>
                <a href="#events" class="px-4 py-1.5 rounded-full text-xs font-medium text-fgMuted hover:text-fg hover:bg-white/5 transition-all">Agenda</a>
                <a href="#quiz" class="px-4 py-1.5 rounded-full text-xs font-medium text-fgMuted hover:text-fg hover:bg-white/5 transition-all">Brainstorming</a>
            </nav>

            <div class="flex items-center space-x-3">
                <a href="#contact-us" class="hidden sm:inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-surface hover:bg-white/10 border border-borderDefault hover:border-borderHover transition-all">
                    <i data-lucide="mail" class="w-3.5 h-3.5 mr-2 text-accent"></i> Kontak
                </a>

                <div id="auth-header-container" class="inline-flex items-center">
                    <button id="btn-open-auth" onclick="openAuthModal()" class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white btn-primary-glow transition-all">
                        <i data-lucide="user" class="w-3.5 h-3.5 mr-2"></i> Login / Register
                    </button>

                    <div id="user-logged-badge" class="hidden flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-surface border border-accent/40 shadow-lg">
                        <div id="user-role-icon" class="w-6 h-6 rounded-lg bg-accent/20 border border-accent flex items-center justify-center text-accent">
                            <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
                        </div>
                        <span id="user-display-username" class="text-xs font-mono font-bold text-white"></span>
                        <button onclick="handleLogout()" title="Keluar / Logout" class="ml-1 text-fgMuted hover:text-rose-400 transition-colors p-1">
                            <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>

                <button id="mobile-toggle" aria-label="Toggle Menu" class="md:hidden p-2.5 rounded-lg bg-surface border border-borderDefault text-fg hover:text-white">
                    <i data-lucide="menu" class="w-5 h-5"></i>
                </button>
            </div>

        </div>

        <div id="mobile-menu" class="hidden md:hidden bg-bgElevated/95 backdrop-blur-2xl border-b border-borderDefault px-6 py-6 space-y-4">
            <a href="#about-us" class="block text-sm font-medium text-fgMuted hover:text-white py-2 border-b border-white/5">Tentang OSIS</a>
            <a href="#vision-mission" class="block text-sm font-medium text-fgMuted hover:text-white py-2 border-b border-white/5">Visi & Misi</a>
            <a href="#structure" class="block text-sm font-medium text-fgMuted hover:text-white py-2 border-b border-white/5">Struktur Pengurus</a>
            <a href="#gallery" class="block text-sm font-medium text-fgMuted hover:text-white py-2 border-b border-white/5">Galeri Foto</a>
            <a href="#events" class="block text-sm font-medium text-fgMuted hover:text-white py-2 border-b border-white/5">Agenda & Berita</a>
            <a href="#quiz" class="block text-sm font-medium text-fgMuted hover:text-white py-2 border-b border-white/5">Brainstorming Trivia</a>
            <a href="#contact-us" class="inline-flex w-full items-center justify-center px-4 py-3 rounded-lg text-xs font-bold text-white btn-primary-glow mt-2">
                HUBUNGI KAMI
            </a>
        </div>
    </header>

    <!-- ==================== MAIN CONTENT ==================== -->
    <main class="relative z-10">

        <!-- HERO SECTION -->
        <section class="pt-20 pb-32 px-4 sm:px-8 max-w-7xl mx-auto text-center relative">
            <div class="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-surface border border-accent/30 mb-8 backdrop-blur-md" data-aos="fade-down">
                <span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                <span class="font-mono text-xs text-indigo-200 tracking-wider font-medium">OFFICIAL STUDENT COUNCIL // 2026-2027</span>
            </div>

            <h1 class="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white/95 to-white/60 max-w-5xl mx-auto leading-[1.08] mb-8" data-aos="fade-up" data-aos-delay="100">
                Where Big Ideas Meet <span class="animate-shimmer">Bold Action.</span>
            </h1>

            <p class="text-lg sm:text-xl text-fgMuted max-w-2xl mx-auto font-normal leading-relaxed mb-10" data-aos="fade-up" data-aos-delay="200">
                Pusat kepemimpinan, aksi, dan inovasi siswa SMP Kristen Kalam Kudus Padang. Membangun masa depan sekolah yang berintegritas, aktif, dan berdampak.
            </p>

            <div class="flex flex-wrap items-center justify-center gap-4" data-aos="fade-up" data-aos-delay="300">
                <a href="#structure" class="px-8 py-4 rounded-xl font-semibold text-sm text-white btn-primary-glow inline-flex items-center">
                    Lihat Pengurus <i data-lucide="users" class="w-4 h-4 ml-2"></i>
                </a>
                <a href="#gallery" class="px-8 py-4 rounded-xl font-semibold text-sm text-fg bg-surface hover:bg-white/10 border border-borderDefault hover:border-borderHover transition-all inline-flex items-center">
                    Dokumentasi Galeri <i data-lucide="image" class="w-4 h-4 ml-2"></i>
                </a>
            </div>
        </section>

        <!-- ADMIN EXCLUSIVE DASHBOARD SECTION (TAMPIL HANYA JIKA LOGIN SEBAGAI SUPER_ADMIN) -->
        <section id="admin-dashboard-section" class="hidden py-12 px-4 sm:px-8 max-w-7xl mx-auto">
            <div class="card-linear p-8 sm:p-10 rounded-3xl border-2 border-accent/60 bg-accent/10 shadow-2xl relative overflow-hidden">
                <div class="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-white/10 mb-8 gap-4">
                    <div>
                        <span class="px-3 py-1 rounded-full bg-accent text-white font-mono text-[10px] font-extrabold uppercase tracking-widest">MASTER CONTROL PANEL</span>
                        <h2 class="text-2xl sm:text-4xl font-extrabold text-white mt-2">Administrator System Portal</h2>
                        <p class="text-xs text-fgMuted mt-1">Sistem manajemen penuh akun terdaftar di repositori `User_data.json` GitHub.</p>
                    </div>
                    <button onclick="fetchAdminUsersList()" class="px-5 py-2.5 rounded-xl font-mono text-xs font-bold text-white bg-accent hover:bg-accentBright transition-all inline-flex items-center">
                        <i data-lucide="refresh-cw" class="w-4 h-4 mr-2"></i> RELOAD USER DATA
                    </button>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-left font-sans text-xs">
                        <thead>
                            <tr class="border-b border-white/10 font-mono text-fgMuted uppercase text-[10px]">
                                <th class="p-3">DISPLAY NAME</th>
                                <th class="p-3">USERNAME</th>
                                <th class="p-3">EMAIL</th>
                                <th class="p-3">ROLE</th>
                                <th class="p-3 text-right">ACTION</th>
                            </tr>
                        </thead>
                        <tbody id="admin-users-table-body" class="divide-y divide-white/5">
                            <!-- JS Dynamic Content -->
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

    </main>

    <!-- ==================== AUTHENTICATION MODAL ==================== -->
    <div id="auth-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bgDeep/80 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-300">
        <div class="relative w-full max-w-md card-linear border-accent/40 bg-bgElevated p-6 sm:p-8 rounded-3xl shadow-2xl overflow-hidden">
            
            <button onclick="closeAuthModal()" aria-label="Close" class="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-fgMuted hover:text-white transition-all z-20">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>

            <div class="flex border-b border-white/10 mb-6 font-mono text-xs">
                <button id="tab-login-btn" onclick="switchAuthTab('login')" class="flex-1 py-3 text-center border-b-2 border-accent text-white font-bold transition-all">
                    LOGIN
                </button>
                <button id="tab-register-btn" onclick="switchAuthTab('register')" class="flex-1 py-3 text-center border-b-2 border-transparent text-fgMuted hover:text-white transition-all">
                    REGISTER
                </button>
            </div>

            <div id="auth-alert" class="hidden mb-4 p-3 rounded-xl text-xs font-mono border"></div>

            <!-- FORM 1: LOGIN -->
            <form id="form-login" onsubmit="handleLoginSubmit(event)" class="space-y-4">
                <div>
                    <label class="block text-xs font-mono text-fgMuted mb-1">EMAIL / USERNAME</label>
                    <input type="text" id="login-identifier" required placeholder="Masukkan Email atau Username" class="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white text-sm focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="block text-xs font-mono text-fgMuted mb-1">PASSWORD</label>
                    <input type="password" id="login-password" required placeholder="••••••••" class="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white text-sm focus:border-accent focus:outline-none">
                </div>
                <button type="submit" id="btn-login-submit" class="w-full py-3.5 rounded-xl font-bold text-xs text-white btn-primary-glow font-mono uppercase">
                    MASUK // PROSES AKUN
                </button>
            </form>

            <!-- FORM 2: REGISTER -->
            <form id="form-register" onsubmit="handleRegisterSubmit(event)" class="space-y-3 hidden">
                <div>
                    <label class="block text-[11px] font-mono text-fgMuted mb-1">EMAIL</label>
                    <input type="email" id="reg-email" required placeholder="nama@email.com" class="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-xs focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="block text-[11px] font-mono text-fgMuted mb-1">USERNAME</label>
                    <input type="text" id="reg-username" required placeholder="username_siswa" class="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-xs focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="block text-[11px] font-mono text-fgMuted mb-1">DISPLAY NAME</label>
                    <input type="text" id="reg-displayname" required placeholder="Nama Lengkap Anda" class="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-xs focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="block text-[11px] font-mono text-fgMuted mb-1">CREATE PASSWORD</label>
                    <input type="password" id="reg-password" required placeholder="••••••••" class="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-xs focus:border-accent focus:outline-none">
                </div>
                <div>
                    <label class="block text-[11px] font-mono text-fgMuted mb-1">CONFIRM YOUR PASSWORD</label>
                    <input type="password" id="reg-confirmpassword" required placeholder="••••••••" class="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-xs focus:border-accent focus:outline-none">
                </div>
                <button type="submit" id="btn-reg-submit" class="w-full py-3.5 rounded-xl font-bold text-xs text-white btn-primary-glow font-mono uppercase mt-2">
                    SUBMIT // DAFTAR AKUN
                </button>
            </form>

            <!-- FORM 3: OTP VERIFICATION -->
            <form id="form-otp" onsubmit="handleOTPSubmit(event)" class="space-y-4 hidden">
                <div class="text-center">
                    <span class="font-mono text-xs text-accent font-bold block mb-1">VERIFIKASI KEAMANAN OTP</span>
                    <p class="text-xs text-fgMuted">Masukkan 6 digit kode OTP yang dikirim ke email: <br><strong id="otp-target-email" class="text-white"></strong></p>
                </div>
                <div>
                    <input type="text" id="otp-code" maxlength="6" required placeholder="123456" class="w-full text-center tracking-[10px] text-2xl font-mono py-3 rounded-xl bg-surface border border-accent text-white focus:outline-none">
                </div>
                <button type="submit" id="btn-otp-submit" class="w-full py-3.5 rounded-xl font-bold text-xs text-white btn-primary-glow font-mono uppercase">
                    VERIFIKASI & PROSES
                </button>
            </form>

        </div>
    </div>

    <!-- ==================== JAVASCRIPT ENGINE & SECURITY SHIELD ==================== -->
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
    <script>
        // AOS Animation Init
        AOS.init({ once: true, duration: 400, easing: 'ease-out-quad' });

        // Mobile Menu Toggle
        const mobileToggle = document.getElementById('mobile-toggle');
        const mobileMenu = document.getElementById('mobile-menu');
        if(mobileToggle) {
            mobileToggle.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
        }

        // =========================================================================
        // CLIENT-SIDE ANTI-INSPECT & ANTI-DEVTOOLS HIGH-SECURITY PROTECTION SHIELD
        // =========================================================================
        (function enforceMaximumSecurity() {
            'use strict';

            // 1. Lock Context Menu (Right Click)
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                return false;
            }, false);

            // 2. Lock Keyboard Shortcuts
            document.addEventListener('keydown', function(e) {
                if (
                    e.key === 'F12' ||
                    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
                    (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's'))
                ) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }, false);

            // 3. Debugger Anti-Tamper Trap Loop
            setInterval(function() {
                const startTime = performance.now();
                (function() { return false; })["constructor"]("debugger")();
                const endTime = performance.now();
                if (endTime - startTime > 100) {
                    document.body.innerHTML = `
                        <div style="background:#050506; color:#f43f5e; height:100vh; display:flex; flex-direction:column; align-items:center; justify-center:center; font-family:monospace; text-align:center; padding:20px;">
                            <h1 style="font-size:24px; font-weight:bold; margin-bottom:10px;">[SECURITY BREACH SHIELD TRIGGERED]</h1>
                            <p style="color:#8A8F98; font-size:14px; max-width:400px;">Akses Developer Tools / Inspeksi Kode Dilarang Demi Keamanan Portal OSIS.</p>
                            <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:#5E6AD2; color:#white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">MUAT ULANG HALAMAN</button>
                        </div>
                    `;
                }
            }, 500);

            // 4. Console Silent Override
            if (typeof window.console === 'object') {
                const noop = function() {};
                window.console.log = noop;
                window.console.warn = noop;
                window.console.error = noop;
                window.console.info = noop;
            }
        })();

        // ==================== AUTHENTICATION & ADMIN ENGINE ====================
        let currentAuthFlow = 'login'; 
        let currentPendingEmail = '';

        function checkLoginStatus() {
            const userJson = localStorage.getItem('osis_user');
            const token = localStorage.getItem('osis_token');
            const btnOpenAuth = document.getElementById('btn-open-auth');
            const userLoggedBadge = document.getElementById('user-logged-badge');
            const userDisplayUsername = document.getElementById('user-display-username');
            const userRoleIcon = document.getElementById('user-role-icon');
            const adminDashboardSection = document.getElementById('admin-dashboard-section');

            if (token && userJson) {
                try {
                    const user = JSON.parse(userJson);
                    if (btnOpenAuth) btnOpenAuth.classList.add('hidden');
                    if (userLoggedBadge) {
                        userLoggedBadge.classList.remove('hidden');
                        userLoggedBadge.classList.add('flex');
                    }
                    if (userDisplayUsername) {
                        userDisplayUsername.textContent = '@' + (user.username || user.displayName);
                    }

                    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
                        if (userRoleIcon) {
                            userRoleIcon.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 text-amber-400"></i>`;
                        }
                        if (adminDashboardSection) {
                            adminDashboardSection.classList.remove('hidden');
                            fetchAdminUsersList();
                        }
                    } else {
                        if (adminDashboardSection) adminDashboardSection.classList.add('hidden');
                    }
                } catch (e) {
                    handleLogout();
                }
            } else {
                if (btnOpenAuth) btnOpenAuth.classList.remove('hidden');
                if (userLoggedBadge) {
                    userLoggedBadge.classList.add('hidden');
                    userLoggedBadge.classList.remove('flex');
                }
                if (adminDashboardSection) adminDashboardSection.classList.add('hidden');
            }
            if (window.lucide) lucide.createIcons();
        }

        function handleLogout() {
            localStorage.removeItem('osis_token');
            localStorage.removeItem('osis_user');
            checkLoginStatus();
        }

        function openAuthModal() {
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
            }
        }

        function closeAuthModal() {
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.classList.add('opacity-0', 'pointer-events-none');
                modal.classList.remove('opacity-100', 'pointer-events-auto');
            }
        }

        function showAlert(msg, isSuccess = false) {
            const alertEl = document.getElementById('auth-alert');
            if (!alertEl) return;
            alertEl.classList.remove('hidden', 'bg-emerald-500/10', 'border-emerald-500', 'text-emerald-300', 'bg-rose-500/10', 'border-rose-500', 'text-rose-300');
            if (isSuccess) {
                alertEl.classList.add('bg-emerald-500/10', 'border-emerald-500', 'text-emerald-300');
            } else {
                alertEl.classList.add('bg-rose-500/10', 'border-rose-500', 'text-rose-300');
            }
            alertEl.textContent = msg;
        }

        function switchAuthTab(tab) {
            currentAuthFlow = tab;
            document.getElementById('auth-alert')?.classList.add('hidden');
            document.getElementById('form-otp')?.classList.add('hidden');

            if (tab === 'login') {
                document.getElementById('form-login')?.classList.remove('hidden');
                document.getElementById('form-register')?.classList.add('hidden');
                document.getElementById('tab-login-btn').className = "flex-1 py-3 text-center border-b-2 border-accent text-white font-bold transition-all";
                document.getElementById('tab-register-btn').className = "flex-1 py-3 text-center border-b-2 border-transparent text-fgMuted hover:text-white transition-all";
            } else {
                document.getElementById('form-register')?.classList.remove('hidden');
                document.getElementById('form-login')?.classList.add('hidden');
                document.getElementById('tab-register-btn').className = "flex-1 py-3 text-center border-b-2 border-accent text-white font-bold transition-all";
                document.getElementById('tab-login-btn').className = "flex-1 py-3 text-center border-b-2 border-transparent text-fgMuted hover:text-white transition-all";
            }
        }

        async function handleLoginSubmit(e) {
            e.preventDefault();
            const identifier = document.getElementById('login-identifier').value;
            const password = document.getElementById('login-password').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier, password })
                });
                const data = await res.json();

                if (data.success) {
                    if (data.directAdminLogin) {
                        showAlert(data.message, true);
                        localStorage.setItem('osis_token', data.token);
                        localStorage.setItem('osis_user', JSON.stringify(data.user));
                        setTimeout(() => {
                            closeAuthModal();
                            checkLoginStatus();
                        }, 1200);
                    } else {
                        currentPendingEmail = data.email;
                        showAlert(data.message, true);
                        document.getElementById('form-login').classList.add('hidden');
                        document.getElementById('form-otp').classList.remove('hidden');
                        document.getElementById('otp-target-email').textContent = data.email;
                    }
                } else {
                    showAlert(data.message, false);
                }
            } catch (err) {
                showAlert("Gagal menghubungi server backend.", false);
            }
        }

        async function handleRegisterSubmit(e) {
            e.preventDefault();
            const email = document.getElementById('reg-email').value;
            const username = document.getElementById('reg-username').value;
            const displayName = document.getElementById('reg-displayname').value;
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('reg-confirmpassword').value;

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, username, displayName, password, confirmPassword })
                });
                const data = await res.json();

                if (data.success) {
                    currentPendingEmail = email;
                    showAlert(data.message, true);
                    document.getElementById('form-register').classList.add('hidden');
                    document.getElementById('form-otp').classList.remove('hidden');
                    document.getElementById('otp-target-email').textContent = email;
                } else {
                    showAlert(data.message, false);
                }
            } catch (err) {
                showAlert("Gagal menghubungi server backend.", false);
            }
        }

        async function handleOTPSubmit(e) {
            e.preventDefault();
            const otp = document.getElementById('otp-code').value;
            const endpoint = currentAuthFlow === 'register' ? '/api/verify-register' : '/api/verify-login';

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentPendingEmail, otp })
                });
                const data = await res.json();

                if (data.success) {
                    showAlert(data.message, true);
                    if (currentAuthFlow === 'register') {
                        setTimeout(() => switchAuthTab('login'), 2000);
                    } else {
                        localStorage.setItem('osis_token', data.token);
                        localStorage.setItem('osis_user', JSON.stringify(data.user));
                        setTimeout(() => {
                            closeAuthModal();
                            checkLoginStatus();
                        }, 1200);
                    }
                } else {
                    showAlert(data.message, false);
                }
            } catch (err) {
                showAlert("Terjadi kesalahan verifikasi.", false);
            }
        }

        async function fetchAdminUsersList() {
            const token = localStorage.getItem('osis_token');
            const tbody = document.getElementById('admin-users-table-body');
            if (!tbody || !token) return;

            try {
                const res = await fetch('/api/admin/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();

                if (data.success && data.users) {
                    tbody.innerHTML = '';
                    data.users.forEach(u => {
                        const tr = document.createElement('tr');
                        tr.className = "hover:bg-white/5 transition-colors";
                        tr.innerHTML = `
                            <td class="p-3 font-bold text-white">${u.displayName}</td>
                            <td class="p-3 font-mono text-fgMuted">@${u.username}</td>
                            <td class="p-3 font-mono text-fgMuted">${u.email}</td>
                            <td class="p-3 font-mono"><span class="px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent font-bold">${u.role}</span></td>
                            <td class="p-3 text-right">
                                ${u.role === 'SUPER_ADMIN' ? '<span class="text-xs text-fgMuted italic">Protected</span>' : `
                                    <button onclick="deleteUserByAdmin('${u.id}')" class="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold transition-all">
                                        DELETE
                                    </button>
                                `}
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
            } catch (err) {
                // Silent catch for security
            }
        }

        async function deleteUserByAdmin(userId) {
            if (!confirm("Apakah Anda yakin ingin menghapus akun ini secara permanen dari sistem?")) return;
            const token = localStorage.getItem('osis_token');
            try {
                const res = await fetch(`/api/admin/users/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                alert(data.message);
                fetchAdminUsersList();
            } catch (err) {
                alert("Gagal menghapus user.");
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            checkLoginStatus();
            if (window.lucide) lucide.createIcons();
        });
    </script>
</body>
</html>