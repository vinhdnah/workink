// ==UserScript==
// @name         VinhDnah Bypass Ultra
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Tua nhanh timer 100x (Web Worker, rAF, Tab Active, Native Stealth Bypass), tự động lấy mã Layma/Traffic.
// @author       VinhDnah
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // Chỉ chạy ở trang chính (top window), tuyệt đối không chạy trong iframe (tránh làm hỏng timer của hCaptcha/reCAPTCHA)
    if (win.self !== win.top) return;

    // Đảm bảo script chỉ chạy 1 lần
    if (win.vinhdnahFinalScriptLoaded) return;
    win.vinhdnahFinalScriptLoaded = true;

    // ===== 0. ANTI-TAMPER STEALTH SYSTEM (GIẢ LẬP NATIVE CODE) =====
    const nativeToString = Function.prototype.toString;
    const hookedFunctions = new WeakSet();

    function makeNative(fn, originalName) {
        hookedFunctions.add(fn);
        try {
            fn.toString = function () {
                return `function ${originalName || fn.name || ''}() { [native code] }`;
            };
            hookedFunctions.add(fn.toString);
        } catch (e) { }
        return fn;
    }

    const customFnToString = function () {
        if (hookedFunctions.has(this)) {
            return `function ${this.name || ''}() { [native code] }`;
        }
        return nativeToString.apply(this, arguments);
    };
    makeNative(customFnToString, 'toString');
    try { Function.prototype.toString = customFnToString; } catch (e) { }

    // ===== 0.1. BYPASS TAB VISIBILITY & FOCUS CHECK =====
    try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
    } catch (e) { }

    const originalAddEventListener = win.addEventListener;
    const docAddEventListener = document.addEventListener;

    const customWinAddEventListener = function (type, listener, options) {
        if (typeof type === 'string' && (type === 'visibilitychange' || type === 'webkitvisibilitychange' || type === 'blur')) {
            return;
        }
        return originalAddEventListener.call(win, type, listener, options);
    };
    makeNative(customWinAddEventListener, 'addEventListener');
    win.addEventListener = customWinAddEventListener;

    const customDocAddEventListener = function (type, listener, options) {
        if (typeof type === 'string' && (type === 'visibilitychange' || type === 'webkitvisibilitychange' || type === 'blur')) {
            return;
        }
        return docAddEventListener.call(document, type, listener, options);
    };
    makeNative(customDocAddEventListener, 'addEventListener');
    document.addEventListener = customDocAddEventListener;

    // ===== 0.2. CAPTCHA DETECTOR =====
    const originalSetTimeout = win.setTimeout;
    const originalSetInterval = win.setInterval;
    const originalClearTimeout = win.clearTimeout;
    const originalClearInterval = win.clearInterval;

    const isCaptchaVisible = () => {
        if (!document.body) return false;

        // 1. Kiểm tra Cloudflare Challenge / Turnstile trên DOM
        if (document.querySelector('#challenge-stage, #challenge-form, #challenge-running, .cf-browser-verification, #cf-wrapper, .cf-turnstile, [name="cf-turnstile-response"], div[id^="cf-turnstile"]')) {
            return true;
        }

        // 2. Kiểm tra Title trang Cloudflare Challenge
        try {
            const title = (document.title || '').toLowerCase();
            if (title.includes('just a moment') || title.includes('verify you are human') || title.includes('attention required!')) {
                return true;
            }
        } catch (e) { }

        // 3. Kiểm tra URL trang Cloudflare Challenge
        try {
            const href = (win.location.href || '').toLowerCase();
            if (href.includes('cdn-cgi/challenge-platform') || href.includes('__cf_chl_')) {
                return true;
            }
        } catch (e) { }

        // 4. Kiểm tra iframe Captcha (reCAPTCHA, hCaptcha, Cloudflare Turnstile, Geetest, v.v.)
        const captchaSelectors = [
            'iframe[src*="google.com/recaptcha/api2/bframe"]',
            'iframe[src*="recaptcha.net/recaptcha/api2/bframe"]',
            'iframe[src*="hcaptcha.com/frame/challenge"]',
            'iframe[src*="challenges.cloudflare.com"]',
            'iframe[src*="cloudflare.com"]',
            'iframe[src*="cdn-cgi/challenge-platform"]',
            'iframe[title*="challenge" i]',
            'iframe[title*="cloudflare" i]',
            'iframe[title*="turnstile" i]',
            '#hcaptcha-modal-content',
            '.cf-turnstile',
            '#challenge-stage',
            '.geetest_holder'
        ];
        return captchaSelectors.some(sel => {
            const el = document.querySelector(sel);
            if (!el) return false;
            try {
                const style = win.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);
            } catch (e) {
                return el.offsetParent !== null;
            }
        });
    };

    const isCaptchaCaller = () => {
        try {
            const stack = new Error().stack || '';
            const lowerStack = stack.toLowerCase();
            return lowerStack.includes('recaptcha') ||
                lowerStack.includes('hcaptcha') ||
                lowerStack.includes('captcha') ||
                lowerStack.includes('gstatic.com') ||
                lowerStack.includes('cloudflare') ||
                lowerStack.includes('turnstile') ||
                lowerStack.includes('cdn-cgi') ||
                lowerStack.includes('challenge-platform') ||
                lowerStack.includes('geetest') ||
                lowerStack.includes('arkose');
        } catch (e) {
            return false;
        }
    };

    // ===== 1. TUA TIMER ACCELERATOR 100x (VIRTUAL CLOCK SCHEDULER) =====
    let speedMultiplier = 100; // Mặc định kích hoạt tăng tốc 100x
    win.vinhdnahSpeedupActivated = true;

    try {
        if (sessionStorage.getItem('vinhdnah_speedup_active') === 'false') {
            speedMultiplier = 1;
            win.vinhdnahSpeedupActivated = false;
        } else {
            sessionStorage.setItem('vinhdnah_speedup_active', 'true');
        }
    } catch (e) { }

    // --- QUẢN LÝ THỜI GIAN ẢO (VIRTUAL CLOCK) ---
    const originalDateNow = win.Date.now ? win.Date.now.bind(win.Date) : Date.now;
    const originalDate = win.Date;
    const startRealTime = originalDateNow();

    let virtualTime = startRealTime;
    let lastRealTime = startRealTime;

    function getVirtualTime() {
        const now = originalDateNow();
        const realDelta = now - lastRealTime;
        lastRealTime = now;

        const activeSpeed = (win.vinhdnahTimerRestored || isCaptchaVisible() || !win.vinhdnahSpeedupActivated) ? 1 : speedMultiplier;
        virtualTime += realDelta * activeSpeed;
        return virtualTime;
    }

    // --- SCHEDULER CHO SETTIMEOUT & SETINTERVAL ---
    const activeTimeouts = new Map();
    const activeIntervals = new Map();
    let timerIdCounter = 1;

    originalSetInterval(() => {
        const nowVT = getVirtualTime();

        // Xử lý SetTimeout
        for (const [id, timer] of activeTimeouts.entries()) {
            if (nowVT >= timer.targetVirtualTime) {
                activeTimeouts.delete(id);
                try {
                    if (typeof timer.callback === 'function') {
                        timer.callback(...timer.args);
                    } else if (typeof timer.callback === 'string') {
                        (0, eval)(timer.callback);
                    }
                } catch (e) {
                    console.error("[VinhDnah Bypass] Timeout callback error:", e);
                }
            }
        }

        // Xử lý SetInterval
        for (const [id, timer] of activeIntervals.entries()) {
            if (nowVT >= timer.nextVirtualTime) {
                timer.nextVirtualTime = Math.max(nowVT + timer.delayMs, timer.nextVirtualTime + timer.delayMs);
                try {
                    if (typeof timer.callback === 'function') {
                        timer.callback(...timer.args);
                    } else if (typeof timer.callback === 'string') {
                        (0, eval)(timer.callback);
                    }
                } catch (e) {
                    console.error("[VinhDnah Bypass] Interval callback error:", e);
                }
            }
        }
    }, 10);

    const customSetTimeout = (callback, delay, ...args) => {
        if (isCaptchaCaller() || isCaptchaVisible() || win.vinhdnahTimerRestored) {
            return originalSetTimeout(callback, delay, ...args);
        }
        const id = timerIdCounter++;
        const delayMs = Math.max(0, Number(delay) || 0);
        const targetVirtualTime = getVirtualTime() + delayMs;
        activeTimeouts.set(id, { callback, targetVirtualTime, args });
        return id;
    };
    makeNative(customSetTimeout, 'setTimeout');

    const customSetInterval = (callback, delay, ...args) => {
        if (isCaptchaCaller() || isCaptchaVisible() || win.vinhdnahTimerRestored) {
            return originalSetInterval(callback, delay, ...args);
        }
        const id = timerIdCounter++;
        const delayMs = Math.max(10, Number(delay) || 0);
        const nextVirtualTime = getVirtualTime() + delayMs;
        activeIntervals.set(id, { callback, delayMs, nextVirtualTime, args });
        return id;
    };
    makeNative(customSetInterval, 'setInterval');

    const customClearTimeout = (id) => {
        if (id != null) {
            activeTimeouts.delete(id);
            try { originalClearTimeout(id); } catch (e) { }
        }
    };
    makeNative(customClearTimeout, 'clearTimeout');

    const customClearInterval = (id) => {
        if (id != null) {
            activeIntervals.delete(id);
            try { originalClearInterval(id); } catch (e) { }
        }
    };
    makeNative(customClearInterval, 'clearInterval');

    win.setTimeout = customSetTimeout;
    win.setInterval = customSetInterval;
    win.clearTimeout = customClearTimeout;
    win.clearInterval = customClearInterval;

    if (typeof window !== 'undefined') {
        window.setTimeout = customSetTimeout;
        window.setInterval = customSetInterval;
        window.clearTimeout = customClearTimeout;
        window.clearInterval = customClearInterval;
    }

    // --- ACCELERATED DATE & PERFORMANCE.NOW ---
    function AcceleratedDate(...args) {
        if (!(this instanceof AcceleratedDate)) {
            return (isCaptchaCaller() || isCaptchaVisible())
                ? new originalDate().toString()
                : new originalDate(getVirtualTime()).toString();
        }
        if (args.length === 0) {
            return (isCaptchaCaller() || isCaptchaVisible())
                ? new originalDate()
                : new originalDate(getVirtualTime());
        } else {
            return new originalDate(...args);
        }
    }
    AcceleratedDate.prototype = originalDate.prototype;
    AcceleratedDate.now = function () {
        return (isCaptchaCaller() || isCaptchaVisible()) ? originalDateNow() : Math.floor(getVirtualTime());
    };
    AcceleratedDate.UTC = originalDate.UTC;
    AcceleratedDate.parse = originalDate.parse;
    makeNative(AcceleratedDate, 'Date');

    win.Date = AcceleratedDate;
    if (typeof window !== 'undefined') window.Date = AcceleratedDate;

    if (win.performance && typeof win.performance.now === 'function') {
        const originalPerformanceNow = win.performance.now.bind(win.performance);
        const startPerfTime = originalPerformanceNow();
        const startVT = getVirtualTime();

        const customPerfNow = function () {
            if (isCaptchaCaller() || isCaptchaVisible()) return originalPerformanceNow();
            return startPerfTime + (getVirtualTime() - startVT);
        };
        makeNative(customPerfNow, 'now');
        win.performance.now = customPerfNow;
        if (typeof window !== 'undefined' && window.performance) {
            window.performance.now = customPerfNow;
        }
    }

    // --- ACCELERATED REQUESTANIMATIONFRAME (rAF) ---
    if (win.requestAnimationFrame) {
        const originalRAF = win.requestAnimationFrame;
        const customRAF = function (callback) {
            if (isCaptchaCaller() || isCaptchaVisible()) return originalRAF(callback);
            return originalRAF(function (time) {
                callback((isCaptchaCaller() || isCaptchaVisible()) ? time : getVirtualTime());
            });
        };
        makeNative(customRAF, 'requestAnimationFrame');
        win.requestAnimationFrame = customRAF;
        if (typeof window !== 'undefined') window.requestAnimationFrame = customRAF;
    }

    // --- ACCELERATED WEB WORKER ---
    if (win.Worker) {
        const OriginalWorker = win.Worker;
        const customWorker = function (scriptURL, options) {
            return new OriginalWorker(scriptURL, options);
        };
        customWorker.prototype = OriginalWorker.prototype;
        makeNative(customWorker, 'Worker');
        win.Worker = customWorker;
        if (typeof window !== 'undefined') window.Worker = customWorker;
    }

    // ===== NÚT TIA SÉT FLOATING (TOGGLE BUTTON) =====
    const createLightningButton = () => {
        if (!document.body || document.getElementById('vinhdnah-lightning-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'vinhdnah-lightning-btn';
        btn.title = 'VinhDnah Bypass: Bật/Tắt tăng tốc 100x';
        btn.innerHTML = '&#9889;'; // ⚡

        const updateBtnState = () => {
            const isOn = speedMultiplier === 100;
            btn.style.background = isOn
                ? 'linear-gradient(135deg, #00e676, #00bfa5)'
                : 'linear-gradient(135deg, #ff1744, #d50000)';
            btn.style.boxShadow = isOn
                ? '0 4px 20px rgba(0,230,118,0.6), 0 0 0 3px rgba(0,230,118,0.25)'
                : '0 4px 20px rgba(255,23,68,0.6), 0 0 0 3px rgba(255,23,68,0.25)';
            btn.setAttribute('aria-label', isOn ? 'Tắt tăng tốc' : 'Bật tăng tốc');
        };

        const INIT_RIGHT = 24, INIT_BOTTOM = 24;
        btn.style.cssText = [
            'position: fixed',
            `top: ${window.innerHeight - INIT_BOTTOM - 56}px`,
            `left: ${window.innerWidth - INIT_RIGHT - 56}px`,
            'width: 56px',
            'height: 56px',
            'border-radius: 50%',
            'border: none',
            'cursor: grab',
            'font-size: 26px',
            'color: #fff',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'z-index: 2147483647',
            'transition: box-shadow 0.2s ease, background 0.2s ease',
            'user-select: none',
            '-webkit-user-select: none',
            'touch-action: none',
            'outline: none',
            'line-height: 1',
            'padding: 0',
        ].join(';');

        updateBtnState();

        let dragging = false;
        let dragMoved = false;
        let dragStartX = 0, dragStartY = 0;
        let btnStartLeft = 0, btnStartTop = 0;
        const DRAG_THRESHOLD = 5;

        const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

        const onDragStart = (clientX, clientY) => {
            dragging = true;
            dragMoved = false;
            dragStartX = clientX;
            dragStartY = clientY;
            btnStartLeft = parseInt(btn.style.left) || 0;
            btnStartTop = parseInt(btn.style.top) || 0;
            btn.style.cursor = 'grabbing';
        };

        const onDragMove = (clientX, clientY) => {
            if (!dragging) return;
            const dx = clientX - dragStartX;
            const dy = clientY - dragStartY;
            if (!dragMoved && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
            dragMoved = true;

            const maxLeft = window.innerWidth - 56;
            const maxTop = window.innerHeight - 56;
            btn.style.left = clamp(btnStartLeft + dx, 0, maxLeft) + 'px';
            btn.style.top = clamp(btnStartTop + dy, 0, maxTop) + 'px';
        };

        const onDragEnd = (clientX, clientY, isTap) => {
            if (!dragging) return;
            dragging = false;
            btn.style.cursor = 'grab';
            if (!dragMoved || isTap) {
                toggleActivation();
                updateBtnState();
            }
        };

        btn.addEventListener('mousedown', (e) => { e.preventDefault(); onDragStart(e.clientX, e.clientY); });
        document.addEventListener('mousemove', (e) => { onDragMove(e.clientX, e.clientY); });
        document.addEventListener('mouseup', (e) => { onDragEnd(e.clientX, e.clientY, false); });

        btn.addEventListener('touchstart', (e) => { const t = e.touches[0]; onDragStart(t.clientX, t.clientY); }, { passive: true });
        btn.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0]; onDragMove(t.clientX, t.clientY); }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); const t = e.changedTouches[0]; onDragEnd(t.clientX, t.clientY, !dragMoved); });

        btn.addEventListener('mouseenter', () => { if (!dragging) btn.style.transform = 'scale(1.1)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });

        document.body.appendChild(btn);
        const syncBtnInterval = originalSetInterval(updateBtnState, 500);
        win._vinhdnahBtnSyncInterval = syncBtnInterval;
    };

    const injectBtn = () => {
        if (document.body) {
            createLightningButton();
        } else {
            originalSetTimeout(injectBtn, 100);
        }
    };
    originalSetTimeout(injectBtn, 0);
    document.addEventListener('DOMContentLoaded', createLightningButton);

    const showActivationIndicator = () => {
        if (!document.body) return;
        const el = document.createElement('div');
        el.innerText = "⚡ VinhDnah Bypass Ultra: Đang tua nhanh 100x...";
        el.style.cssText = "position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0, 200, 0, 0.9); color: white; padding: 10px 20px; border-radius: 5px; font-weight: bold; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: opacity 0.5s;";
        document.body.appendChild(el);
        originalSetTimeout(() => {
            el.style.opacity = '0';
            originalSetTimeout(() => el.remove(), 500);
        }, 2000);
    };

    const showDeactivationIndicator = () => {
        if (!document.body) return;
        const el = document.createElement('div');
        el.innerText = "❌ VinhDnah Bypass Ultra: Đã dừng tua nhanh (1x)...";
        el.style.cssText = "position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(220, 0, 0, 0.9); color: white; padding: 10px 20px; border-radius: 5px; font-weight: bold; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: opacity 0.5s;";
        document.body.appendChild(el);
        originalSetTimeout(() => {
            el.style.opacity = '0';
            originalSetTimeout(() => el.remove(), 500);
        }, 2000);
    };

    const activeKeys = new Set();
    let keyHistory = '';
    let lastToggleTime = 0;

    const toggleActivation = () => {
        const now = originalDateNow();
        if (now - lastToggleTime < 500) return;
        lastToggleTime = now;

        keyHistory = '';
        getVirtualTime();

        if (speedMultiplier === 100) {
            speedMultiplier = 1;
            win.vinhdnahSpeedupActivated = false;
            try { sessionStorage.setItem('vinhdnah_speedup_active', 'false'); } catch (err) { }
            console.log("[VinhDnah Bypass] >>> TẮT TĂNG TỐC (Trở về 1x) <<<");
            showDeactivationIndicator();
        } else {
            speedMultiplier = 100;
            win.vinhdnahSpeedupActivated = true;
            try { sessionStorage.setItem('vinhdnah_speedup_active', 'true'); } catch (err) { }
            console.log("[VinhDnah Bypass] >>> KÍCH HOẠT TĂNG TỐC 100x <<<");
            showActivationIndicator();
        }
    };

    const handleKeyDown = (e) => {
        if (e.repeat) return;
        if (!e.key) return;
        const key = e.key.toLowerCase();

        activeKeys.add(key);
        if (activeKeys.has('f') && activeKeys.has('g') && activeKeys.has('h')) {
            toggleActivation();
            return;
        }

        keyHistory += key;
        if (keyHistory.length > 3) keyHistory = keyHistory.slice(-3);
        if (keyHistory === 'fgh') toggleActivation();
    };

    const handleKeyUp = (e) => {
        if (e.key) activeKeys.delete(e.key.toLowerCase());
    };

    win.addEventListener('keydown', handleKeyDown, true);
    win.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);

    // ===== 2. QUÉT MÃ TRÊN TRANG ĐÍCH =====
    function scanForCode() {
        // 1. Quét từ #message (Ví dụ: Mã Code: eidb4f)
        const msgEl = document.getElementById('message');
        if (msgEl) {
            const msgTxt = (msgEl.innerText || msgEl.textContent || '').trim();
            const match = msgTxt.match(/(?:Mã\s*Code|Mã|Code|Mã\s+xác\s+nhận)\s*[:\-]?\s*([a-zA-Z0-9]{4,12})\b/i);
            if (match) {
                const codeFound = match[1];
                if (!['code', 'nhấn', 'bài', 'viết', 'chạm', 'cuộn', 'lấy'].includes(codeFound.toLowerCase())) {
                    return codeFound;
                }
            }
        }

        const docText = document.body ? document.body.innerText : '';
        const regexes = [
            /(?:Mã\s*Code|Mã|Code|Mã\s+xác\s+nhận)\s*[:\-]?\s*([a-zA-Z0-9]{4,12})\b/i,
            /[Mm]ã(?:\s*[:\-]\s*|\s+)([a-zA-Z0-9]{4,12})\b/,
            /[Cc]ode(?:\s*[:\-]\s*|\s+)([a-zA-Z0-9]{4,12})\b/
        ];
        for (const regex of regexes) {
            const match = docText.match(regex);
            if (match && match[1]) {
                const codeFound = match[1];
                if (!['code', 'nhấn', 'bài', 'viết', 'chạm', 'cuộn', 'lấy'].includes(codeFound.toLowerCase())) {
                    return codeFound;
                }
            }
        }

        const tfContent = document.getElementById('traffic-button__content');
        if (tfContent) {
            const txt = (tfContent.textContent || tfContent.innerText || '').trim();
            if (txt && !/^\d{1,3}$/.test(txt)) {
                const match = txt.match(/[a-zA-Z0-9]{4,12}/);
                if (match) return match[0];
            }
        }

        return null;
    }

    // ===== 3. HÀM KHÔI PHỤC TỐC ĐỘ 1x =====
    function restoreNormalSpeed(reason) {
        if (!win.vinhdnahTimerRestored) {
            win.vinhdnahTimerRestored = true;
            win.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay, ...args);
            win.setInterval = (callback, delay, ...args) => originalSetInterval(callback, delay, ...args);
            console.log("[VinhDnah Bypass] Khôi phục tốc độ 1x. Lý do: " + reason);
        }
    }

    // ===== 4. ĐIỀU KHIỂN CHÍNH (MAIN LOOP) =====
    function startMainHandler() {
        let lastScroll = 0;
        let lastClick = 0;

        originalSetInterval(() => {
            const messageEl = document.getElementById('message');
            let counterEl = document.getElementById('counter');
            if (!counterEl) {
                counterEl = document.querySelector('#swal2-html-container b') ||
                    document.querySelector('.swal2-html-container b') ||
                    document.getElementById('traffic-button__content');
            }
            const codeInputEl = document.getElementById('codeInput');

            // Tự động click nút Traffic Button nếu có nút lấy mã dạng SVG (#logo-tf / .traffic-button-container / .alignRan / [data-click])
            const tfArrow = document.getElementById('traffic-button__arrow');
            const tfLogo = document.getElementById('logo-tf') || document.querySelector('.traffic-button-container') || document.querySelector('[data-click="true"], .alignRan');
            if (tfLogo && !win.vinhdnahTfClicked) {
                const isArrowVisible = tfArrow && tfArrow.style.display !== 'none' && tfArrow.getAttribute('display') !== 'none';
                if (!tfArrow || isArrowVisible) {
                    win.vinhdnahTfClicked = true;
                    console.log("[VinhDnah Bypass] Tự động click nút lấy mã...");
                    tfLogo.click();
                    tfLogo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
            }

            // --- B1. KIỂM TRA THỜI GIAN ĐẾM NGƯỢC (>75s -> RELOAD F5, <=75s -> SPEEDUP 100x) ---
            if (!win.vinhdnahTimerReloadEvaluated) {
                const candidateEls = document.querySelectorAll('[data-time], .alignRan, div[class*="alignRan"], [data-click="true"]');
                let foundDuration = null;

                for (const el of candidateEls) {
                    const attrTime = el.getAttribute('data-time');
                    if (attrTime && !isNaN(parseInt(attrTime, 10))) {
                        foundDuration = parseInt(attrTime, 10);
                        break;
                    }

                    const txt = (el.innerText || el.textContent || '').trim();
                    const match = txt.match(/Lấy\s+mã\s+sau\s+(\d+)/i) || txt.match(/(\d+)\s*s\b/i);
                    if (match) {
                        foundDuration = parseInt(match[1], 10);
                        break;
                    }
                }

                if (foundDuration === null && document.body) {
                    const bodyTxt = document.body.innerText || '';
                    const match = bodyTxt.match(/Lấy\s+mã\s+sau\s+(\d+)/i);
                    if (match) {
                        foundDuration = parseInt(match[1], 10);
                    }
                }

                if (foundDuration !== null && foundDuration > 0) {
                    win.vinhdnahTimerReloadEvaluated = true;
                    console.log(`[VinhDnah Bypass] Kiểm tra mốc đếm ngược ban đầu: ${foundDuration}s`);

                    if (foundDuration > 75) {
                        console.log(`[VinhDnah Bypass] ⚠️ Timer ${foundDuration}s > 75s -> Tự động F5 làm lại...`);
                        if (document.body) {
                            const notify = document.createElement('div');
                            notify.innerText = `⚠️ Timer ${foundDuration}s > 75s -> Tự động F5 làm lại...`;
                            notify.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(255, 87, 34, 0.95); color: white; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px; z-index: 2147483647; box-shadow: 0 4px 15px rgba(0,0,0,0.4);";
                            document.body.appendChild(notify);
                        }
                        originalSetTimeout(() => {
                            win.location.reload();
                        }, 300);
                    } else {
                        console.log(`[VinhDnah Bypass] ✅ Timer ${foundDuration}s <= 75s -> Giữ nguyên tua nhanh 100x!`);
                    }
                }
            }

            // --- A. XỬ LÝ TRÊN TRANG NHIỆM VỤ (LAYMA) ---
            if (codeInputEl) {
                const linkWeb = document.getElementById('linkWeb');
                const webUrl = (linkWeb ? (linkWeb.innerText || linkWeb.textContent || linkWeb.value || '') : '').trim().toLowerCase();
                const hasFbLink = webUrl.includes('facebook.com') || webUrl.includes('fb.com');
                const noWebLink = !linkWeb || !webUrl;

                if ((hasFbLink || noWebLink) && !win.vinhdnahTaskChanged) {
                    win.vinhdnahTaskChanged = true;
                    console.log("[VinhDnah Bypass] Phát hiện link lỗi/FB -> Đang đổi nhiệm vụ...");
                    const btn = document.getElementById('btn-baoloi');
                    if (btn) btn.click();
                    else if (win.clickDoiNhiemVu) win.clickDoiNhiemVu();

                    originalSetTimeout(() => {
                        const cf = document.querySelector('button[onclick*="doiNhiemVu"]');
                        if (cf) cf.click();
                        else if (win.doiNhiemVu) win.doiNhiemVu();
                    }, 500);
                }

                if (linkWeb && !win.vinhdnahFetchingStarted) {
                    let url = (linkWeb.innerText || linkWeb.textContent || linkWeb.value || '').trim();
                    if (url && !url.includes('facebook.com') && !url.includes('fb.com')) {
                        win.vinhdnahFetchingStarted = true;
                        if (!url.startsWith('http')) url = 'https://' + url;
                        console.log("[VinhDnah Bypass] Mở tab nhiệm vụ mới: " + url);
                        window.open(url, '_blank');
                    }
                }
            }

            // --- B. XỬ LÝ TRÊN TRANG WEB ĐÍCH (LẤY MÃ) ---
            else {
                const foundCode = scanForCode();
                if (foundCode && !win.vinhdnahCodeSent) {
                    win.vinhdnahCodeSent = true;
                    console.log("[VinhDnah Bypass] Đã tìm thấy mã: " + foundCode);
                    try { GM_setValue('vinhdnah_latest_code', foundCode); } catch (e) { }

                    if (window.opener) {
                        window.opener.postMessage({ type: 'VINHDNAH_CODE', code: foundCode }, '*');
                    }
                }
            }

            // --- C1. HỖ TRỢ TUA NHANH TIMER CỦA SWEETALERT2 ---
            if (win.vinhdnahSpeedupActivated && win.Swal && typeof win.Swal.getTimerLeft === 'function' && typeof win.Swal.increaseTimer === 'function') {
                const left = win.Swal.getTimerLeft();
                if (typeof left === 'number' && left > 0) {
                    const now = Date.now();
                    if (!win.vinhdnahLastSwalTick) {
                        win.vinhdnahLastSwalTick = now;
                    }
                    const elapsed = now - win.vinhdnahLastSwalTick;
                    win.vinhdnahLastSwalTick = now;

                    if (elapsed > 0 && elapsed < 2000) {
                        const speedupTime = elapsed * 99;
                        const maxReduce = left;
                        const actualReduce = Math.min(maxReduce, speedupTime);
                        if (actualReduce > 0) {
                            win.Swal.increaseTimer(-actualReduce);
                        }
                    }
                } else {
                    win.vinhdnahLastSwalTick = null;
                }

                const progressBar = document.querySelector('.swal2-timer-progress-bar');
                if (progressBar && !progressBar.dataset.vinhdnahAdjusted) {
                    progressBar.dataset.vinhdnahAdjusted = 'true';
                    const transition = progressBar.style.transition || '';
                    const match = transition.match(/(\d+(?:\.\d+)?)(s|ms)/);
                    if (match) {
                        const val = parseFloat(match[1]);
                        const unit = match[2];
                        const newVal = val / 100;
                        progressBar.style.transition = transition.replace(match[0], newVal + unit);
                    }
                }
            }

            // --- C. KIỂM TRA HẠ TỐC ĐỘ KHI XUẤT HIỆN CAPTCHA HOẶC CLOUDFLARE ---
            const hasCaptcha = isCaptchaVisible();
            if (hasCaptcha) {
                restoreNormalSpeed("Phát hiện Captcha / Cloudflare Challenge");
            } else if (win.vinhdnahTimerRestored && win.vinhdnahSpeedupActivated) {
                win.vinhdnahTimerRestored = false;
                win.setTimeout = customSetTimeout;
                win.setInterval = customSetInterval;
                console.log("[VinhDnah Bypass] Đã giải xong Captcha/Cloudflare -> Tự động khôi phục tua nhanh 100x");
            }

            // --- D. TỰ ĐỘNG THAO TÁC THEO MESSAGE ---
            if (messageEl) {
                const msg = (messageEl.innerText || messageEl.textContent || '').trim();
                const now = Date.now();

                // 0. Tự động click bài viết bất kỳ
                if ((msg.includes('bài viết') || msg.includes('nhấn bài viết')) && !win.vinhdnahArticleClicked) {
                    win.vinhdnahArticleClicked = true;
                    console.log("[VinhDnah Bypass] Tự động click 1 bài viết bất kỳ theo yêu cầu...");
                    const links = document.querySelectorAll('ul li a[href], .text a[href], article a[href], h2 a[href], h3 a[href], .post-title a[href], div.text a[href]');
                    for (const link of links) {
                        const href = link.getAttribute('href') || '';
                        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                            console.log("[VinhDnah Bypass] Bấm link bài viết: " + href);
                            link.click();
                            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                            originalSetTimeout(() => {
                                window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight);
                            }, 500);
                            break;
                        }
                    }
                }

                if (msg.includes('cuộn lên') || msg.includes('Cuộn lên')) {
                    if (now - lastScroll > 800) {
                        lastScroll = now;
                        console.log("[VinhDnah Bypass] Tự động cuộn lên đầu...");
                        window.scrollTo(0, 0);
                    }
                }

                if (msg.includes('cuộn xuống') || msg.includes('Cuộn xuống') || msg.includes('kéo xuống')) {
                    if (now - lastScroll > 800) {
                        lastScroll = now;
                        console.log("[VinhDnah Bypass] Tự động cuộn xuống cuối...");
                        window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight);
                    }
                }

                if ((msg.includes('Chạm vào màn hình') || msg.includes('Chạm để')) && !isCaptchaVisible()) {
                    if (now - lastClick > 2000) {
                        lastClick = now;
                        console.log("[VinhDnah Bypass] Tự động chạm màn hình...");
                        const parent = messageEl.parentElement;
                        if (parent) {
                            parent.click();
                            parent.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        } else {
                            messageEl.click();
                            messageEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        }
                    }
                }
            }

            // --- E. TỰ ĐỘNG CLICK NÚT XÁC THỰC VÀ LẤY MÃ (#xacthucButton) ---
            const xacthucBtn = document.getElementById('xacthucButton');
            if (xacthucBtn && (xacthucBtn.style.display !== 'none' || xacthucBtn.offsetParent !== null) && !isCaptchaVisible()) {
                if (!xacthucBtn.dataset.vinhdnahClicked) {
                    xacthucBtn.dataset.vinhdnahClicked = 'true';
                    console.log("[VinhDnah Bypass] Tự động click nút Xác thực và lấy mã (#xacthucButton)...");
                    xacthucBtn.click();
                    xacthucBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
            }

            // --- F. TỰ ĐỘNG MỞ KHÓA NÚT CHỜ (COUNTDOWN BUTTONS) ---
            if (win.vinhdnahSpeedupActivated && !isCaptchaVisible() && !win.vinhdnahTimerRestored) {
                const countdownButtons = document.querySelectorAll('button[disabled], input[type="button"][disabled], input[type="submit"][disabled], a.disabled');
                countdownButtons.forEach(btn => {
                    if (btn.closest && btn.closest('#challenge-stage, #challenge-form, #cf-wrapper, .cf-turnstile, #hcaptcha-modal-content')) return;

                    const text = (btn.innerText || btn.value || '').toLowerCase();
                    if (text.includes('chờ') || text.includes('đợi') || text.includes('wait') || text.includes('giây') || text.includes('second') || /\d+\s*s\b/.test(text)) {
                        if (text.includes('verify') || text.includes('human') || text.includes('security') || text.includes('cloudflare')) return;

                        btn.removeAttribute('disabled');
                        btn.disabled = false;
                        btn.classList.remove('disabled');

                        if (!btn.dataset.vinhdnahEnabled) {
                            btn.dataset.vinhdnahEnabled = 'true';
                            console.log("[VinhDnah Bypass] Đã kích hoạt/mở khóa nút chờ: ", text);
                            const matchSec = text.match(/\d+/);
                            if (matchSec) {
                                btn.innerText = btn.innerText.replace(matchSec[0] + 's', '0s').replace('vui lòng chờ', 'Click ngay').replace('Vui lòng chờ', 'Click ngay');
                            }
                        }

                        if (!btn.dataset.vinhdnahClicked) {
                            btn.dataset.vinhdnahClicked = 'true';
                            console.log("[VinhDnah Bypass] Tự động click nút chờ...");
                            btn.click();
                        }
                    }
                });
            }

        }, 250);
    }

    function init() {
        if (document.body) {
            startMainHandler();
        } else {
            originalSetTimeout(init, 100);
        }
    }
    init();

})();
