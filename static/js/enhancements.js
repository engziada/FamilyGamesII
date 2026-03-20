/**
 * Enhancements Module — UX/UI improvements from ENHANCEMENT_PLAN.md
 *
 * Includes: confetti, score animations, copy button, game rules,
 * keyboard shortcuts, avatar picker, QR code lobby, haptic feedback.
 */

/* global gameUI, gameController, sound, bootstrap */

const enhancements = (() => {
  // ── 1.1  Copy Room Code ──────────────────────────────────────────────
  /**
   * Copy text to clipboard with visual feedback.
   * @param {string} text - Text to copy.
   * @param {HTMLElement} [btn] - Button element for visual feedback.
   */
  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      gameUI.showToast('تم النسخ!', 'success');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      gameUI.showToast('تم النسخ!', 'success');
    });
  }

  /**
   * Wire copy buttons on the page.
   */
  function initCopyButtons() {
    document.querySelectorAll('[data-copy-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.copyTarget;
        const el = document.getElementById(targetId);
        if (el) copyToClipboard(el.textContent.trim(), btn);
      });
    });
  }

  // ── 1.3  Confetti ────────────────────────────────────────────────────
  let _confettiLoaded = false;

  /**
   * Load canvas-confetti from CDN if not already loaded.
   * @returns {Promise<void>}
   */
  function loadConfetti() {
    if (_confettiLoaded || window.confetti) {
      _confettiLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
      s.onload = () => { _confettiLoaded = true; resolve(); };
      s.onerror = () => resolve(); // Fail silently
      document.head.appendChild(s);
    });
  }

  /**
   * Fire a small confetti burst (correct answer).
   */
  async function confettiBurst() {
    await loadConfetti();
    if (!window.confetti) return;
    window.confetti({
      particleCount: 60,
      spread: 55,
      origin: { y: 0.7 },
      colors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#6BCB77'],
    });
  }

  /**
   * Fire a full-screen confetti celebration (game win).
   */
  async function confettiCelebration() {
    await loadConfetti();
    if (!window.confetti) return;
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
      window.confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#FF6B6B', '#4ECDC4', '#FFE66D'],
      });
      window.confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#6BCB77', '#BC7AF9', '#FFE66D'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  // ── 1.4  Animated Score Changes ──────────────────────────────────────
  const _prevScores = {};

  /**
   * Detect score changes and animate "+X" fly-up indicators.
   * Call this after updating the scoreboard.
   * @param {Array} players - Current player list with scores.
   */
  function animateScoreChanges(players) {
    players.forEach(p => {
      const prev = _prevScores[p.name] ?? p.score;
      const diff = p.score - prev;
      _prevScores[p.name] = p.score;

      if (diff > 0) {
        showScoreFlyUp(p.name, diff);
        // Small confetti for big gains
        if (diff >= 5) confettiBurst();
      }
    });
  }

  /**
   * Show a "+X" fly-up animation near a player's score.
   * @param {string} playerName
   * @param {number} amount
   */
  function showScoreFlyUp(playerName, amount) {
    const rows = document.querySelectorAll('#scoreboard tr');
    for (const row of rows) {
      if (row.textContent.includes(playerName)) {
        const cell = row.querySelector('td:last-child');
        if (!cell) continue;

        const fly = document.createElement('span');
        fly.className = 'score-fly-up';
        fly.textContent = `+${amount}`;
        cell.style.position = 'relative';
        cell.appendChild(fly);

        // Pulse highlight on the row
        row.classList.add('score-highlight');
        setTimeout(() => {
          fly.remove();
          row.classList.remove('score-highlight');
        }, 1500);
        break;
      }
    }
  }

  // ── 2.1  Game Rules Modal ────────────────────────────────────────────
  const GAME_RULES = {
    charades: {
      title: 'بدون كلام',
      icon: 'fa-mask',
      objective: 'مثّل الكلمة بدون كلام وخلّي اللاعبين يخمّنوا.',
      rules: [
        'كل لاعب بيمثّل لما يجي دوره',
        'ممنوع الكلام أو الإشارة لحروف',
        'اللاعبين بيحاولوا يخمّنوا قبل الوقت ما يخلص',
        'النقاط للمُمثّل واللي خمّن صح',
      ],
      scoring: 'نقطة للممثل + نقطة للي خمّن = نقطتين في الجولة',
      tips: ['استخدم حركات الجسم كلها', 'قسّم الكلمة لأجزاء', 'ابدأ بالأسهل'],
    },
    pictionary: {
      title: 'ارسم وخمّن',
      icon: 'fa-paint-brush',
      objective: 'ارسم الكلمة وخلّي اللاعبين يعرفوها.',
      rules: ['كل لاعب بيرسم لما يجي دوره', 'ممنوع كتابة حروف أو أرقام', 'اللاعبين بيخمّنوا من الرسم'],
      scoring: 'نقطة للرسّام + نقطة للي خمّن',
      tips: ['ابدأ بالشكل العام', 'استخدم أسهم للحركة', 'لا تمسح كتير'],
    },
    trivia: {
      title: 'بنك المعلومات',
      icon: 'fa-lightbulb',
      objective: 'جاوب على أسئلة ثقافية في وقت محدد.',
      rules: ['سؤال واحد لكل جولة', 'اختار الإجابة الصحيحة من الاختيارات', 'كل ما جاوبت أسرع، كل ما أخذت نقاط أكتر'],
      scoring: 'نقطة للإجابة الصحيحة',
      tips: ['اقرأ السؤال كله قبل ما تجاوب', 'لو مش متأكد، خمّن!'],
    },
    rapid_fire: {
      title: 'الأسئلة السريعة',
      icon: 'fa-bolt',
      objective: 'اضغط الجرس وجاوب قبل أي حد تاني!',
      rules: ['سؤال يظهر لكل اللاعبين', 'أول واحد يضغط الجرس يجاوب', 'لو غلط، اللاعبين التانيين يقدروا يجربوا'],
      scoring: 'نقطة للإجابة الصحيحة الأسرع',
      tips: ['سرعة البديهة مهمة', 'لا تضغط الجرس إلا لو متأكد'],
    },
    twenty_questions: {
      title: 'عشرين سؤال',
      icon: 'fa-question-circle',
      objective: 'خمّن الكلمة السرية في 20 سؤال أو أقل.',
      rules: ['لاعب واحد يعرف الكلمة', 'الباقي يسألوا أسئلة إجابتها أيوه/لأ', 'عندكم 20 سؤال بس'],
      scoring: 'نقطة للي يخمّن + نقاط إضافية لو خمّن بدري',
      tips: ['ابدأ بأسئلة عامة (حي ولا جماد؟)', 'ضيّق الاختيارات بالتدريج'],
    },
    riddles: {
      title: 'الألغاز',
      icon: 'fa-brain',
      objective: 'حل اللغز باستخدام التلميحات.',
      rules: ['عندك 3 محاولات لكل لغز', 'كل تلميح بيقلل النقاط', 'لو مش عارف، اللغز بيتخطى'],
      scoring: '3 نقاط بدون تلميح، 2 مع تلميح واحد، 1 مع تلميحين',
      tips: ['فكّر في المعنى المجازي', 'التلميحات بتساعد كتير'],
    },
    bus_complete: {
      title: 'أتوبيس كومبليت',
      icon: 'fa-bus',
      objective: 'املأ الفئات بكلمات تبدأ بالحرف المطلوب.',
      rules: ['حرف عشوائي في كل جولة', 'املأ كل الفئات بأسرع وقت', 'أول واحد يخلّص يضغط "أتوبيس!"', 'اللاعبين بيصوّتوا على صحة الإجابات'],
      scoring: 'نقطة لكل إجابة صحيحة وفريدة',
      tips: ['ابدأ بالفئات اللي تعرفها', 'الإجابات الفريدة بتاخد نقاط أكتر'],
    },
    who_am_i: {
      title: 'من أنا؟',
      icon: 'fa-user-secret',
      objective: 'اعرف الشخصية المكتوبة فوق راسك!',
      rules: ['كل لاعب عنده شخصية مش شايفها', 'اسأل أسئلة إجابتها أيوه/لأ', 'أول واحد يعرف شخصيته يفوز'],
      scoring: 'نقاط حسب سرعة التخمين',
      tips: ['اسأل عن الفئة الأول', 'حقيقي ولا خيالي؟', 'عربي ولا أجنبي؟'],
    },
  };

  /**
   * Show game rules modal for a specific game type.
   * @param {string} gameType
   */
  function showGameRules(gameType) {
    const rules = GAME_RULES[gameType];
    if (!rules) return;

    let modal = document.getElementById('rulesModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rulesModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="rulesModalLabel"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="rulesModalBody"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">فهمت!</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    document.getElementById('rulesModalLabel').innerHTML =
      `<i class="fas ${rules.icon}"></i> كيف تلعب ${rules.title}؟`;

    document.getElementById('rulesModalBody').innerHTML = `
      <div class="mb-3">
        <h6><i class="fas fa-bullseye text-primary"></i> الهدف</h6>
        <p>${rules.objective}</p>
      </div>
      <div class="mb-3">
        <h6><i class="fas fa-list-ol text-success"></i> القواعد</h6>
        <ul class="list-unstyled">${rules.rules.map(r => `<li class="mb-1">✅ ${r}</li>`).join('')}</ul>
      </div>
      <div class="mb-3">
        <h6><i class="fas fa-trophy text-warning"></i> النقاط</h6>
        <p>${rules.scoring}</p>
      </div>
      <div>
        <h6><i class="fas fa-lightbulb text-info"></i> نصائح</h6>
        <ul class="list-unstyled">${rules.tips.map(t => `<li class="mb-1">💡 ${t}</li>`).join('')}</ul>
      </div>`;

    new bootstrap.Modal(modal).show();
  }

  // ── 2.3  Keyboard Shortcuts ──────────────────────────────────────────
  const SHORTCUTS = {
    'KeyT': { desc: 'تبديل الوضع الداكن', action: () => document.getElementById('dark-mode-toggle')?.click() },
    'KeyM': { desc: 'كتم/تشغيل الصوت', action: () => document.getElementById('btn-sound-toggle')?.click() },
    'KeyH': { desc: 'قواعد اللعبة', action: () => {
      const gt = gameController?.getGameType?.();
      if (gt) showGameRules(gt);
    }},
    'Escape': { desc: 'إغلاق النافذة', action: () => {
      const openModal = document.querySelector('.modal.show');
      if (openModal) bootstrap.Modal.getInstance(openModal)?.hide();
    }},
    'Slash': { desc: 'عرض الاختصارات', action: () => showShortcutsHelp() },
  };

  /**
   * Initialize keyboard shortcuts.
   */
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Skip if user is typing in an input
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const shortcut = SHORTCUTS[e.code];
      if (shortcut) {
        e.preventDefault();
        shortcut.action();
      }
    });
  }

  /**
   * Show keyboard shortcuts help modal.
   */
  function showShortcutsHelp() {
    let modal = document.getElementById('shortcutsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'shortcutsModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      const rows = Object.entries(SHORTCUTS)
        .map(([code, s]) => {
          const key = code.replace('Key', '').replace('Slash', '?');
          return `<tr><td><kbd>${key}</kbd></td><td>${s.desc}</td></tr>`;
        })
        .join('');
      modal.innerHTML = `
        <div class="modal-dialog modal-sm modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">⌨️ اختصارات لوحة المفاتيح</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body"><table class="table table-sm mb-0"><tbody>${rows}</tbody></table></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    new bootstrap.Modal(modal).show();
  }

  // ── 3.2  Avatar Picker ───────────────────────────────────────────────
  const AVATARS = ['🦁','🐱','🐶','🦊','🐸','🐵','🐼','🐧','🦄','🐲',
                   '🐷','🐮','🦉','🐙','🦀','🐢','🦋','🐝','🐛','🦜'];

  /**
   * Create an avatar picker and insert it after a target element.
   * @param {string} afterElementId - ID of the element to insert after.
   * @returns {function} Getter for the selected avatar.
   */
  function createAvatarPicker(afterElementId) {
    const target = document.getElementById(afterElementId);
    if (!target) return () => '';

    let selected = AVATARS[Math.floor(Math.random() * AVATARS.length)];

    const wrapper = document.createElement('div');
    wrapper.className = 'mb-3';
    wrapper.innerHTML = `
      <label class="form-label">اختر أفاتار</label>
      <div class="d-flex flex-wrap gap-1 avatar-picker">
        ${AVATARS.map(a => `<button type="button" class="btn btn-outline-secondary btn-sm avatar-opt ${a === selected ? 'active' : ''}" data-avatar="${a}" style="font-size:1.4rem;width:42px;height:42px;padding:0;">${a}</button>`).join('')}
      </div>`;

    target.parentElement.insertBefore(wrapper, target.nextSibling);

    wrapper.querySelectorAll('.avatar-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        wrapper.querySelector('.avatar-opt.active')?.classList.remove('active');
        btn.classList.add('active');
        selected = btn.dataset.avatar;
      });
    });

    return () => selected;
  }

  // ── 4.1  Circular SVG Timer ──────────────────────────────────────────
  /**
   * Create a circular SVG timer element.
   * @param {string} containerId - ID of the container to put the SVG timer in.
   * @returns {object} API with update(remaining, total) method.
   */
  function createCircularTimer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return { update() {} };

    const size = 80;
    const stroke = 6;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    container.innerHTML = `
      <svg width="${size}" height="${size}" class="circular-timer" style="transform: rotate(-90deg);">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#e0e0e0" stroke-width="${stroke}"/>
        <circle id="timer-circle" cx="${size/2}" cy="${size/2}" r="${radius}" fill="none"
          stroke="var(--success)" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${circumference}" stroke-dashoffset="0"
          style="transition: stroke-dashoffset 1s linear, stroke 0.5s;"/>
      </svg>
      <div class="circular-timer-text" id="timer-text" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-weight:700;font-size:1.1rem;">--</div>`;

    container.style.position = 'relative';
    container.style.display = 'inline-block';

    return {
      update(remaining, total) {
        const circle = document.getElementById('timer-circle');
        const text = document.getElementById('timer-text');
        if (!circle || !text) return;

        const pct = total > 0 ? remaining / total : 1;
        const offset = circumference * (1 - pct);
        circle.setAttribute('stroke-dashoffset', offset);

        // Color coding
        let color = 'var(--success)';
        if (pct <= 0.15) color = 'var(--danger)';
        else if (pct <= 0.30) color = '#ff9800';
        else if (pct <= 0.50) color = 'var(--accent)';
        circle.setAttribute('stroke', color);

        // Pulse last 10 seconds
        if (remaining <= 10 && remaining > 0) {
          circle.classList.add('pulse-animation');
        } else {
          circle.classList.remove('pulse-animation');
        }

        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        text.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      },
    };
  }

  // ── 4.4  QR Code (Lobby) ─────────────────────────────────────────────
  /**
   * Generate a QR code for a join URL.
   * @param {string} containerId - ID of container for the QR code.
   * @param {string} url - URL to encode.
   */
  async function generateQRCode(containerId, url) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Load QRCode library
    if (!window.QRCode) {
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }

    if (window.QRCode) {
      container.innerHTML = '';
      new window.QRCode(container, {
        text: url,
        width: 128,
        height: 128,
        colorDark: '#2F2F2F',
        colorLight: '#FFFFFF',
      });
    }
  }

  // ── 2.3  Haptic Feedback ─────────────────────────────────────────────
  const haptic = {
    /** @param {string} type - 'correct', 'wrong', 'timeout', 'win' */
    vibrate(type) {
      if (!navigator.vibrate) return;
      const patterns = {
        correct: [50],
        wrong: [100, 50, 100],
        timeout: [200],
        win: [50, 50, 50, 50, 50, 50, 200],
        buzz: [30],
      };
      navigator.vibrate(patterns[type] || [50]);
    },
  };

  // ── 4.6  Mobile Touch Helpers ────────────────────────────────────────
  /**
   * Initialize mobile-friendly touch enhancements.
   */
  function initMobileEnhancements() {
    // Prevent double-tap zoom on buttons
    document.querySelectorAll('button, .btn').forEach(btn => {
      btn.style.touchAction = 'manipulation';
    });

    // Add swipe-to-dismiss on modals
    document.querySelectorAll('.modal').forEach(modal => {
      let startY = 0;
      modal.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
      }, { passive: true });
      modal.addEventListener('touchend', (e) => {
        const deltaY = e.changedTouches[0].clientY - startY;
        if (deltaY > 100) {
          bootstrap.Modal.getInstance(modal)?.hide();
        }
      }, { passive: true });
    });
  }

  // ── Init All ─────────────────────────────────────────────────────────
  /**
   * Initialize all enhancements on DOMContentLoaded.
   */
  function init() {
    initCopyButtons();
    initKeyboardShortcuts();
    initMobileEnhancements();
    loadConfetti(); // Pre-load
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    copyToClipboard,
    confettiBurst,
    confettiCelebration,
    animateScoreChanges,
    showGameRules,
    showShortcutsHelp,
    createAvatarPicker,
    createCircularTimer,
    generateQRCode,
    haptic,
    GAME_RULES,
  };
})();
