// ==UserScript==
// @name         HadesBypass
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Tua nhanh timer 100x + tự động mở tab, đổi nhiệm vụ Layma, và cuộn trang lên/xuống theo thông báo message liên tục.
// @author       vinhdnah
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
    if (win.hadesFinalScriptLoaded) return;
    win.hadesFinalScriptLoaded = true;

    const originalSetTimeout = win.setTimeout;
    const originalSetInterval = win.setInterval;

    // Kiểm tra xem captcha CHALLENGE có đang hiển thị thực tế hay không (tránh tự động hạ tốc chỉ vì badge reCAPTCHA v3 hoặc checkbox tĩnh)
    const isCaptchaVisible = () => {
        if (!document.body) return false;
        const captchaSelectors = [
            'iframe[src*="google.com/recaptcha/api2/bframe"]',
            'iframe[src*="recaptcha.net/recaptcha/api2/bframe"]',
            'iframe[src*="hcaptcha.com/frame/challenge"]',
            'iframe[title*="challenge" i]',
            '#hcaptcha-modal-content'
        ];
        return captchaSelectors.some(sel => {
            const el = document.querySelector(sel);
            return el && el.offsetParent !== null;
        });
    };

    // ===== 1. TUA TIMER ACCELERATOR 100x (VIRTUAL CLOCK SCHEDULER) =====
    (function initTimerAccelerator() {
        let speedMultiplier = 1;

        // Kiểm tra xem đã kích hoạt tăng tốc trước đó trên trang này/tab này chưa
        try {
            if (sessionStorage.getItem('hades_speedup_active') === 'true') {
                speedMultiplier = 100;
                win.hadesSpeedupActivated = true;
                console.log("[HadesBypass] Tự động kích hoạt tăng tốc 100x (đã nhấn F+G+H trước đó)");
            }
        } catch (e) {}

        // Kiểm tra xem hàm gọi có phải từ script Captcha hay không dựa trên stack trace
        const isCaptchaCaller = () => {
            try {
                const stack = new Error().stack || '';
                return stack.includes('recaptcha') ||
                       stack.includes('hcaptcha') ||
                       stack.includes('captcha') ||
                       stack.includes('gstatic.com');
            } catch (e) {
                return false;
            }
        };

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

            const activeSpeed = (win.hadesTimerRestored || isCaptchaVisible() || !win.hadesSpeedupActivated) ? 1 : speedMultiplier;
            virtualTime += realDelta * activeSpeed;
            return virtualTime;
        }

        // --- SCHEDULER CHO SETTIMEOUT & SETINTERVAL ---
        const activeTimeouts = new Map();
        const activeIntervals = new Map();
        let timerIdCounter = 1;

        // Loop ticker chạy mỗi 10ms thời gian thực để cập nhật thời gian ảo và thực thi callback
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
                        console.error("[HadesBypass] Timeout callback error:", e);
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
                        console.error("[HadesBypass] Interval callback error:", e);
                    }
                }
            }
        }, 10);

        // Ghi đè setTimeout, setInterval, clearTimeout, clearInterval
        const customSetTimeout = (callback, delay, ...args) => {
            if (isCaptchaCaller()) {
                return originalSetTimeout(callback, delay, ...args);
            }
            const id = timerIdCounter++;
            const delayMs = Math.max(0, Number(delay) || 0);
            const targetVirtualTime = getVirtualTime() + delayMs;
            activeTimeouts.set(id, { callback, targetVirtualTime, args });
            return id;
        };

        const customSetInterval = (callback, delay, ...args) => {
            if (isCaptchaCaller()) {
                return originalSetInterval(callback, delay, ...args);
            }
            const id = timerIdCounter++;
            const delayMs = Math.max(10, Number(delay) || 0);
            const nextVirtualTime = getVirtualTime() + delayMs;
            activeIntervals.set(id, { callback, delayMs, nextVirtualTime, args });
            return id;
        };

        const customClearTimeout = (id) => {
            if (id != null) {
                activeTimeouts.delete(id);
                try { originalClearTimeout(id); } catch (e) {}
            }
        };

        const customClearInterval = (id) => {
            if (id != null) {
                activeIntervals.delete(id);
                try { originalClearInterval(id); } catch (e) {}
            }
        };

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

        // Ghi đè Date & performance.now
        function AcceleratedDate(...args) {
            if (!(this instanceof AcceleratedDate)) {
                return new originalDate(getVirtualTime()).toString();
            }
            if (args.length === 0) {
                return isCaptchaCaller() ? new originalDate() : new originalDate(getVirtualTime());
            } else {
                return new originalDate(...args);
            }
        }
        AcceleratedDate.prototype = originalDate.prototype;
        AcceleratedDate.now = function() {
            return isCaptchaCaller() ? originalDateNow() : Math.floor(getVirtualTime());
        };
        AcceleratedDate.UTC = originalDate.UTC;
        AcceleratedDate.parse = originalDate.parse;
        win.Date = AcceleratedDate;
        if (typeof window !== 'undefined') window.Date = AcceleratedDate;

        if (win.performance && typeof win.performance.now === 'function') {
            const originalPerformanceNow = win.performance.now.bind(win.performance);
            const startPerfTime = originalPerformanceNow();
            const startVT = getVirtualTime();

            const customPerfNow = function() {
                if (isCaptchaCaller()) return originalPerformanceNow();
                return startPerfTime + (getVirtualTime() - startVT);
            };
            win.performance.now = customPerfNow;
            if (typeof window !== 'undefined' && window.performance) {
                window.performance.now = customPerfNow;
            }
        }

        // Hiển thị thông báo khi kích hoạt (sử dụng originalSetTimeout thực tế để tránh bị tua mất thông báo)
        const showActivationIndicator = () => {
            if (!document.body) return;
            const el = document.createElement('div');
            el.innerText = "⚡ HadesBypass: Đang tua nhanh 100x...";
            el.style.cssText = "position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0, 200, 0, 0.9); color: white; padding: 10px 20px; border-radius: 5px; font-weight: bold; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: opacity 0.5s;";
            document.body.appendChild(el);
            originalSetTimeout(() => {
                el.style.opacity = '0';
                originalSetTimeout(() => el.remove(), 500);
            }, 2000);
        };

        // Hiển thị thông báo khi tắt
        const showDeactivationIndicator = () => {
            if (!document.body) return;
            const el = document.createElement('div');
            el.innerText = "❌ HadesBypass: Đã dừng tua nhanh (1x)...";
            el.style.cssText = "position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(220, 0, 0, 0.9); color: white; padding: 10px 20px; border-radius: 5px; font-weight: bold; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: opacity 0.5s;";
            document.body.appendChild(el);
            originalSetTimeout(() => {
                el.style.opacity = '0';
                originalSetTimeout(() => el.remove(), 500);
            }, 2000);
        };

        // Lắng nghe tổ hợp phím F + G + H (hoặc gõ liên tiếp f, g, h) để kích hoạt/tắt tăng tốc
        const activeKeys = new Set();
        let keyHistory = '';
        let lastToggleTime = 0;

        const toggleActivation = () => {
            const now = originalDateNow();
            if (now - lastToggleTime < 500) return; // Khống chế cooldown 500ms để tránh kích hoạt trùng lặp
            lastToggleTime = now;

            keyHistory = ''; // Reset lịch sử gõ phím
            getVirtualTime(); // Cập nhật mốc thời gian ảo hiện tại trước khi thay đổi tốc độ

            if (speedMultiplier === 100) {
                speedMultiplier = 1;
                win.hadesSpeedupActivated = false;
                try {
                    sessionStorage.setItem('hades_speedup_active', 'false');
                } catch (err) {}
                console.log("[HadesBypass] >>> TẮT TĂNG TỐC (Trở về 1x) <<<");
                showDeactivationIndicator();
            } else {
                speedMultiplier = 100;
                win.hadesSpeedupActivated = true;
                try {
                    sessionStorage.setItem('hades_speedup_active', 'true');
                } catch (err) {}
                console.log("[HadesBypass] >>> KÍCH HOẠT TĂNG TỐC 100x <<<");
                showActivationIndicator();
            }
        };

        const handleKeyDown = (e) => {
            if (e.repeat) return; // Bỏ qua tự động lặp phím khi đè giữ
            if (!e.key) return;
            const key = e.key.toLowerCase();

            // 1. Nhấn giữ đồng thời F + G + H
            activeKeys.add(key);
            if (activeKeys.has('f') && activeKeys.has('g') && activeKeys.has('h')) {
                toggleActivation();
                return;
            }

            // 2. Hoặc gõ tuần tự ký tự f -> g -> h
            keyHistory += key;
            if (keyHistory.length > 3) {
                keyHistory = keyHistory.slice(-3);
            }
            if (keyHistory === 'fgh') {
                toggleActivation();
            }
        };

        const handleKeyUp = (e) => {
            if (e.key) {
                activeKeys.delete(e.key.toLowerCase());
            }
        };

        // Đăng ký sự kiện sử dụng Capture phase (true) để tránh trang web chặn sự kiện bàn phím (stopPropagation)
        win.addEventListener('keydown', handleKeyDown, true);
        win.addEventListener('keyup', handleKeyUp, true);
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);
    }());

    // ===== 2. QUÉT MÃ TRÊN TRANG ĐÍCH =====
    function scanForCode() {
        const docText = document.body ? document.body.innerText : '';
        const regexes = [
            /[Mm]ã(?:\s*[:\-]\s*|\s+)([a-zA-Z0-9]{4,10})\b/,
            /[Cc]ode(?:\s*[:\-]\s*|\s+)([a-zA-Z0-9]{4,10})\b/
        ];
        for (const regex of regexes) {
            const match = docText.match(regex);
            if (match && match[1]) {
                return match[1];
            }
        }

        // Quét thêm phần tử #traffic-button__content nếu có chứa mã sau khi đếm ngược
        const tfContent = document.getElementById('traffic-button__content');
        if (tfContent) {
            const txt = (tfContent.textContent || tfContent.innerText || '').trim();
            if (txt && !/^\d{1,3}$/.test(txt)) {
                const match = txt.match(/[a-zA-Z0-9]{4,10}/);
                if (match) return match[0];
            }
        }

        return null;
    }

    // ===== 3. HÀM KHÔI PHỤC TỐC ĐỘ 1x =====
    function restoreNormalSpeed(reason) {
        if (!win.hadesTimerRestored) {
            win.hadesTimerRestored = true;
            win.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay, ...args);
            win.setInterval = (callback, delay, ...args) => originalSetInterval(callback, delay, ...args);
            console.log("[HadesBypass] Khôi phục tốc độ 1x. Lý do: " + reason);
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

            // Tự động click nút Traffic Button nếu có nút lấy mã dạng SVG (#logo-tf / .traffic-button-container)
            const tfArrow = document.getElementById('traffic-button__arrow');
            const tfLogo = document.getElementById('logo-tf') || document.querySelector('.traffic-button-container');
            if (tfLogo && !win.hadesTfClicked) {
                const isArrowVisible = tfArrow && tfArrow.style.display !== 'none' && tfArrow.getAttribute('display') !== 'none';
                if (!tfArrow || isArrowVisible) {
                    win.hadesTfClicked = true;
                    console.log("[HadesBypass] Tự động click Traffic Button lấy mã...");
                    tfLogo.click();
                    tfLogo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
            }

            // --- A. XỬ LÝ TRÊN TRANG NHIỆM VỤ (LAYMA) ---
            if (codeInputEl) {


                // 2. Tự động đổi nhiệm vụ nếu không có link hoặc là link Facebook
                const linkFb = document.getElementById('linkFB');
                const linkWeb = document.getElementById('linkWeb');
                const hasFbLink = linkFb && (linkFb.innerText || linkFb.textContent || '').toLowerCase().includes('facebook.com');
                const noWebLink = !linkWeb || !(linkWeb.innerText || linkWeb.textContent || linkWeb.value || '').trim();

                if ((hasFbLink || noWebLink) && !win.hadesTaskChanged) {
                    win.hadesTaskChanged = true;
                    console.log("[HadesBypass] Phát hiện link lỗi/FB -> Đang đổi nhiệm vụ...");
                    const btn = document.getElementById('btn-baoloi');
                    if (btn) btn.click();
                    else if (win.clickDoiNhiemVu) win.clickDoiNhiemVu();

                    originalSetTimeout(() => {
                        const cf = document.querySelector('button[onclick*="doiNhiemVu"]');
                        if (cf) cf.click();
                        else if (win.doiNhiemVu) win.doiNhiemVu();
                    }, 500);
                }

                // 3. Tự động mở link đích sang tab mới (nếu là link web hợp lệ)
                if (linkWeb && !win.hadesFetchingStarted) {
                    let url = (linkWeb.innerText || linkWeb.textContent || linkWeb.value || '').trim();
                    if (url && !url.includes('facebook.com') && !url.includes('fb.com')) {
                        win.hadesFetchingStarted = true;
                        if (!url.startsWith('http')) url = 'https://' + url;
                        console.log("[HadesBypass] Mở tab nhiệm vụ mới: " + url);
                        window.open(url, '_blank');
                    }
                }
            }

            // --- B. XỬ LÝ TRÊN TRANG WEB ĐÍCH (LẤY MÃ) ---
            else {
                // 1. Quét tìm mã, nếu thấy thì gửi về trang chính, lưu GM_setValue
                const foundCode = scanForCode();
                if (foundCode && !win.hadesCodeSent) {
                    win.hadesCodeSent = true;
                    console.log("[HadesBypass] Đã tìm thấy mã: " + foundCode);
                    GM_setValue('hades_latest_code', foundCode);

                    // Post message phòng hờ
                    if (window.opener) {
                        window.opener.postMessage({ type: 'HADES_CODE', code: foundCode }, '*');
                    }
                }

            }

            // --- C1. HỖ TRỢ TUA NHANH TIMER CỦA SWEETALERT2 ---
            if (win.hadesSpeedupActivated && win.Swal && typeof win.Swal.getTimerLeft === 'function' && typeof win.Swal.increaseTimer === 'function') {
                const left = win.Swal.getTimerLeft();
                if (typeof left === 'number' && left > 0) {
                    const now = Date.now();
                    if (!win.hadesLastSwalTick) {
                        win.hadesLastSwalTick = now;
                    }
                    const elapsed = now - win.hadesLastSwalTick;
                    win.hadesLastSwalTick = now;

                    if (elapsed > 0 && elapsed < 2000) {
                        const speedupTime = elapsed * 99; // Tăng tốc 100x (giảm bớt 99 lần thời gian thực trôi qua)
                        const maxReduce = left;
                        const actualReduce = Math.min(maxReduce, speedupTime);
                        if (actualReduce > 0) {
                            win.Swal.increaseTimer(-actualReduce);
                        }
                    }
                } else {
                    win.hadesLastSwalTick = null;
                }

                // Tăng tốc hiệu ứng thanh tiến trình (progress bar) của SweetAlert2 tương ứng
                const progressBar = document.querySelector('.swal2-timer-progress-bar');
                if (progressBar && !progressBar.dataset.hadesAdjusted) {
                    progressBar.dataset.hadesAdjusted = 'true';
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

            // --- C. KIỂM TRA HẠ TỐC ĐỘ (GIỮ NGUYÊN LOOP CHẠY) ---
            const hasCaptcha = isCaptchaVisible();

            if (hasCaptcha) {
                restoreNormalSpeed("Phát hiện Captcha");
            }

            // --- D. TỰ ĐỘNG THAO TÁC THEO MESSAGE (LIÊN TỤC KHÔNG DỪNG) ---
            if (messageEl) {
                const msg = (messageEl.innerText || messageEl.textContent || '').trim();
                const now = Date.now();

                // 1. Cuộn lên đầu trang
                if (msg.includes('cuộn lên') || msg.includes('Cuộn lên')) {
                    if (now - lastScroll > 800) {
                        lastScroll = now;
                        console.log("[HadesBypass] Tự động cuộn lên đầu...");
                        window.scrollTo(0, 0);
                    }
                }

                // 2. Cuộn xuống cuối trang
                if (msg.includes('cuộn xuống') || msg.includes('Cuộn xuống') || msg.includes('kéo xuống')) {
                    if (now - lastScroll > 800) {
                        lastScroll = now;
                        console.log("[HadesBypass] Tự động cuộn xuống cuối...");
                        window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight);
                    }
                }

                // 3. Chạm vào màn hình để tiếp tục (chỉ chạm vào vùng tin nhắn, không click lên body tránh kích hoạt nhầm nút khác)
                if ((msg.includes('Chạm vào màn hình') || msg.includes('Chạm để')) && !isCaptchaVisible()) {
                    if (now - lastClick > 2000) {
                        lastClick = now;
                        console.log("[HadesBypass] Tự động chạm màn hình (chỉ click vùng tin nhắn)...");
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

            // --- E. TỰ ĐỘNG MỞ KHÓA NÚT CHỜ (COUNTDOWN BUTTONS) ---
            if (win.hadesSpeedupActivated) {
                const countdownButtons = document.querySelectorAll('button[disabled], input[type="button"][disabled], input[type="submit"][disabled], a.disabled');
                countdownButtons.forEach(btn => {
                    const text = (btn.innerText || btn.value || '').toLowerCase();
                    if (text.includes('chờ') || text.includes('đợi') || text.includes('wait') || text.includes('giây') || text.includes('second') || /\d+\s*s\b/.test(text)) {
                        btn.removeAttribute('disabled');
                        btn.disabled = false;
                        btn.classList.remove('disabled');

                        if (!btn.dataset.hadesEnabled) {
                            btn.dataset.hadesEnabled = 'true';
                            console.log("[HadesBypass] Đã kích hoạt/mở khóa nút chờ: ", text);
                            const matchSec = text.match(/\d+/);
                            if (matchSec) {
                                btn.innerText = btn.innerText.replace(matchSec[0] + 's', '0s').replace('vui lòng chờ', 'Click ngay').replace('Vui lòng chờ', 'Click ngay');
                            }
                        }

                        if (!btn.dataset.hadesClicked) {
                            btn.dataset.hadesClicked = 'true';
                            console.log("[HadesBypass] Tự động click nút chờ...");
                            btn.click();
                        }
                    }
                });
            }

        }, 250);
    }

    // ===== KHỞI ĐỘNG =====
    function init() {
        if (document.body) {
            startMainHandler();
        } else {
            originalSetTimeout(init, 100);
        }
    }
    init();

})();
