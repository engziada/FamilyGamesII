/**
 * Family Games - Onboarding Tutorial
 */

const Tutorial = {
    steps: [
        {
            title: "أهلاً بيك في ألعاب العيلة!",
            content: "أفضل مكان تقضي فيه وقت ممتع مع أهلك وأصحابك. خلينا نعرفك على اللعبة في دقيقة.",
            icon: "fas fa-smile-beam",
            target: null
        },
        {
            title: "ابدأ لعبة جديدة",
            content: "تقدر تنشئ غرفة جديدة وتختار اللعبة اللي تحبها (بدون كلام، ارسم وخمن، أو بنك المعلومات).",
            icon: "fas fa-plus-circle",
            target: ".game-card:first-child .btn-primary"
        },
        {
            title: "انضم لأصحابك",
            content: "لو أصحابك بدأوا لعبة، تقدر تنضم ليهم باستخدام رقم الغرفة اللي هيبعتوه ليك.",
            icon: "fas fa-sign-in-alt",
            target: ".game-card:first-child .btn-outline"
        },
        {
            title: "أنواع الألعاب",
            content: "عندنا ألعاب متنوعة بتناسب كل الأذواق. جربهم كلهم واعرف إيه أكتر واحدة بتعجبكم!",
            icon: "fas fa-gamepad",
            target: ".games-grid"
        },
        {
            title: "جاهز للبداية؟",
            content: "يلا بينا نبدأ! لو احتاجت مساعدة في أي وقت، هتلاقي زرار 'إزاي تلعب' جوه كل لعبة.",
            icon: "fas fa-rocket",
            target: null
        }
    ],
    currentStep: 0,

    init() {
        if (!localStorage.getItem('hasSeenTutorial')) {
            setTimeout(() => this.show(), 1500);
        }

        const showBtn = document.getElementById('show-tutorial-btn');
        if (showBtn) {
            showBtn.onclick = (e) => {
                e.preventDefault();
                this.show();
            };
        }
    },

    show() {
        this.currentStep = 0;
        this.render();
        document.getElementById('tutorial-overlay').classList.add('active');
    },

    hide() {
        document.getElementById('tutorial-overlay').classList.remove('active');
        document.getElementById('tutorial-spotlight').classList.remove('active');
        localStorage.setItem('hasSeenTutorial', 'true');
    },

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.render();
        } else {
            this.hide();
        }
    },

    render() {
        const step = this.steps[this.currentStep];
        const overlay = document.getElementById('tutorial-overlay');
        const spotlight = document.getElementById('tutorial-spotlight');

        if (!overlay) {
            this.createElements();
            return this.render();
        }

        const content = overlay.querySelector('.tutorial-step-content');
        content.innerHTML = `
            <i class="${step.icon}"></i>
            <h3>${step.title}</h3>
            <p>${step.content}</p>
        `;

        const dots = overlay.querySelectorAll('.progress-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentStep);
        });

        const nextBtn = overlay.querySelector('.tutorial-btn-next');
        nextBtn.textContent = this.currentStep === this.steps.length - 1 ? "يلا بينا!" : "التالي";

        // Handle Spotlight
        if (step.target) {
            const targetEl = document.querySelector(step.target);
            if (targetEl) {
                const rect = targetEl.getBoundingClientRect();
                spotlight.style.top = (rect.top - 10) + 'px';
                spotlight.style.left = (rect.left - 10) + 'px';
                spotlight.style.width = (rect.width + 20) + 'px';
                spotlight.style.height = (rect.height + 20) + 'px';
                spotlight.classList.add('active');

                // Scroll into view if needed
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                spotlight.classList.remove('active');
            }
        } else {
            spotlight.classList.remove('active');
        }
    },

    createElements() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.className = 'tutorial-overlay';

        const spotlight = document.createElement('div');
        spotlight.id = 'tutorial-spotlight';
        spotlight.className = 'tutorial-spotlight';

        const card = document.createElement('div');
        card.className = 'tutorial-card';

        const progressDots = this.steps.map((_, i) => `<div class="progress-dot ${i === 0 ? 'active' : ''}"></div>`).join('');

        card.innerHTML = `
            <div class="tutorial-step-content"></div>
            <div class="tutorial-footer">
                <div class="tutorial-progress">
                    ${progressDots}
                </div>
                <div class="tutorial-btns">
                    <button class="tutorial-btn tutorial-btn-skip" onclick="Tutorial.hide()">تخطي</button>
                    <button class="tutorial-btn tutorial-btn-next" onclick="Tutorial.next()">التالي</button>
                </div>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(spotlight);
        document.body.appendChild(overlay);
    }
};

document.addEventListener('DOMContentLoaded', () => Tutorial.init());
