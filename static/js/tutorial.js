
const Tutorial = {
    steps: [
        {
            title: "أهلاً بك في ألعاب العيلة! 👋",
            content: "أول مرة تلعب معانا؟ خليك معايا ثواني نعرفك إزاي تستمتع باللعبة.",
            target: null
        },
        {
            title: "ابدأ لعبة جديدة 🎮",
            content: "ممكن تختار أي لعبة من دول وتضغط 'لعبة جديدة' عشان تفتح أوضة وتكون إنت المضيف.",
            target: ".game-card:first-child .btn-primary"
        },
        {
            title: "انضم لأصحابك 👥",
            content: "لو صحابك بدأوا لعبة فعلاً، اطلب منهم 'رقم الغرفة' واضغط 'انضمام' عشان تدخل معاهم.",
            target: ".game-card:first-child .btn-outline"
        },
        {
            title: "ألعاب متنوعة 💡",
            content: "عندنا 'بدون كلام' للتمثيل، 'ارسم وخمن' للرسم، و'بنك المعلومات' للمسابقات الثقافية.",
            target: ".games-grid"
        },
        {
            title: "جاهز؟ يالا بينا! 🚀",
            content: "دلوقتي إنت جاهز. استمتع بوقتك مع العيلة والأصحاب!",
            target: null
        }
    ],
    currentStep: 0,

    init() {
        if (localStorage.getItem('hasSeenTutorial')) return;
        this.createUI();
        this.showStep(0);
    },

    createUI() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.className = 'tutorial-overlay';
        overlay.innerHTML = `
            <div id="tutorial-spotlight" class="spotlight" style="display:none"></div>
            <div class="tutorial-card">
                <h2 id="tutorial-title"></h2>
                <div id="tutorial-content" class="tutorial-content"></div>
                <div class="tutorial-footer">
                    <button class="btn btn-outline" onclick="Tutorial.skip()" style="padding: 0.5rem 1rem;">تخطي</button>
                    <div class="tutorial-dots" id="tutorial-dots"></div>
                    <button id="tutorial-next" class="btn btn-primary" onclick="Tutorial.next()" style="padding: 0.5rem 1.5rem;">التالي</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const dotsContainer = document.getElementById('tutorial-dots');
        this.steps.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'tutorial-dot';
            dotsContainer.appendChild(dot);
        });
    },

    showStep(index) {
        this.currentStep = index;
        const step = this.steps[index];
        const overlay = document.getElementById('tutorial-overlay');
        overlay.classList.add('active');

        document.getElementById('tutorial-title').textContent = step.title;
        document.getElementById('tutorial-content').textContent = step.content;

        const nextBtn = document.getElementById('tutorial-next');
        nextBtn.textContent = index === this.steps.length - 1 ? 'ابدأ الآن!' : 'التالي';

        // Dots
        const dots = document.querySelectorAll('.tutorial-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });

        // Spotlight
        const spotlight = document.getElementById('tutorial-spotlight');
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const rect = el.getBoundingClientRect();
                spotlight.style.display = 'block';
                spotlight.style.top = (rect.top + window.scrollY - 5) + 'px';
                spotlight.style.left = (rect.left + window.scrollX - 5) + 'px';
                spotlight.style.width = (rect.width + 10) + 'px';
                spotlight.style.height = (rect.height + 10) + 'px';
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                spotlight.style.display = 'none';
            }
        } else {
            spotlight.style.display = 'none';
        }
    },

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.finish();
        }
    },

    skip() {
        this.finish();
    },

    finish() {
        const overlay = document.getElementById('tutorial-overlay');
        if (overlay) overlay.classList.remove('active');
        localStorage.setItem('hasSeenTutorial', 'true');
    },

    reset() {
        localStorage.removeItem('hasSeenTutorial');
        location.reload();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Only run on landing page
    if (window.location.pathname === '/' || window.location.pathname === '/index') {
        setTimeout(() => Tutorial.init(), 1000);
    }
});
