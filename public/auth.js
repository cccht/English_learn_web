const dialog = document.querySelector('[data-auth-dialog]');
const sharedLinkToken = window.location.hash.match(/^#share\/([A-Za-z0-9_-]{32})$/)?.[1];
if (sharedLinkToken) {
  try { sessionStorage.setItem('shici-pending-share', sharedLinkToken); } catch { /* The visible share code can still be pasted after login. */ }
}
let busy = false;
let registrationEnabled = document.body.dataset.registrationEnabled === 'true';
const panels = [...document.querySelectorAll('[data-auth-panel]')];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const motionAnimations = new Set();
let revealObserver;

function revealHomeElement(element, delay = 0, duration = 480) {
  element.classList.remove('home-reveal-pending');
  revealObserver?.unobserve(element);
  if (motionPreference.matches || !element.animate) return;
  const animation = element.animate(
    [
      { opacity: 0, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
  );
  motionAnimations.add(animation);
  animation.finished.catch(() => {}).finally(() => motionAnimations.delete(animation));
}

function stopHomeMotion() {
  revealObserver?.disconnect();
  document
    .querySelectorAll('.home-reveal-pending')
    .forEach((element) => element.classList.remove('home-reveal-pending'));
  for (const animation of motionAnimations) animation.cancel();
  motionAnimations.clear();
}
motionPreference.addEventListener('change', (event) => {
  if (event.matches) stopHomeMotion();
});

function updateViewport() {
  const viewport = window.visualViewport;
  const height = viewport?.scale === 1 ? viewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--auth-viewport-height', height + 'px');
  document.documentElement.style.setProperty(
    '--auth-viewport-offset',
    (viewport?.offsetTop || 0) + 'px',
  );
}
updateViewport();
window.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('resize', updateViewport);

function showAuth(mode, focus = true) {
  if (!dialog || busy) return;
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== mode;
  });
  const active = panels.find((panel) => !panel.hidden);
  dialog.setAttribute('aria-labelledby', mode + '-heading');
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('auth-open');
  dialog.scrollTop = 0;
  if (focus) active?.querySelector('input')?.focus({ preventScroll: true });
  history.replaceState(null, '', '/' + mode);
}
function closeAuth() {
  if (busy) return;
  dialog?.close();
}
dialog?.addEventListener('close', () => {
  document.body.classList.remove('auth-open');
  dialog.querySelectorAll('input[type=password],input[data-password-visible]').forEach((input) => {
    input.value = '';
    input.type = 'password';
    input.removeAttribute('data-password-visible');
    const button = dialog.querySelector('[data-toggle-password="' + input.id + '"]');
    button?.setAttribute('aria-pressed', 'false');
    button?.setAttribute(
      'aria-label',
      input.name === 'passwordConfirm' ? '显示确认密码' : '显示密码',
    );
    if (button) {
      button.querySelector('[data-eye-show]').hidden = false;
      button.querySelector('[data-eye-hide]').hidden = true;
    }
  });
  history.replaceState(null, '', '/');
});
dialog?.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
dialog?.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (
    event.target === dialog &&
    (event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom)
  )
    closeAuth();
});
document.querySelector('.auth-close')?.addEventListener('click', closeAuth);
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('[data-open-auth]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showAuth(link.dataset.openAuth);
});

document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    input.toggleAttribute('data-password-visible', visible);
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute(
      'aria-label',
      (visible ? '隐藏' : '显示') + (input.name === 'passwordConfirm' ? '确认密码' : '密码'),
    );
    button.querySelector('[data-eye-show]').hidden = visible;
    button.querySelector('[data-eye-hide]').hidden = !visible;
  });
});

document.querySelectorAll('[data-auth-form]').forEach((form) => {
  const confirmation = form.querySelector('[name=passwordConfirm]');
  const password = form.querySelector('[name=password]');
  if (confirmation) {
    const validate = () =>
      confirmation.setCustomValidity(
        confirmation.value && confirmation.value !== password.value ? '两次密码不一致' : '',
      );
    confirmation.addEventListener('input', validate);
    password.addEventListener('input', validate);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const panel = form.closest('[data-auth-panel]');
    const error = panel.querySelector('[data-auth-error]');
    const submit = form.querySelector('[type=submit]');
    const label = submit.querySelector('[data-submit-label]');
    const previousLabel = label.textContent;
    const mode = form.dataset.authForm;
    busy = true;
    submit.disabled = true;
    document.querySelector('.auth-close').disabled = true;
    form.setAttribute('aria-busy', 'true');
    label.textContent = mode === 'register' ? '创建中' : '登录中';
    error.hidden = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        signal: controller.signal,
      });
      const body = await response.json();
      if (response.ok && body.ok) {
        let token = sharedLinkToken;
        try { token = token || sessionStorage.getItem('shici-pending-share'); } catch { /* Optional storage. */ }
        window.location.assign(token && /^[A-Za-z0-9_-]{32}$/.test(token) ? '/#share/' + token : '/');
        return;
      }
      if (body.registrationEnabled === false) {
        registrationEnabled = false;
        document.querySelectorAll('[data-open-auth=register]').forEach((link) => {
          link.hidden = true;
        });
        if (mode === 'register') {
          form.hidden = true;
          panel.querySelector('h2').textContent = '注册暂未开放';
        }
      }
      error.textContent = body.error || '暂时无法完成操作，请稍后重试。';
      error.hidden = false;
    } catch {
      error.textContent = '网络暂时不可用，请检查连接后重试。';
      error.hidden = false;
    } finally {
      clearTimeout(timeout);
      busy = false;
      submit.disabled = mode === 'register' && !registrationEnabled;
      document.querySelector('.auth-close').disabled = false;
      label.textContent = previousLabel;
      form.removeAttribute('aria-busy');
    }
  });
});

const initial = document.body.dataset.initialAuth;
if (dialog?.open) dialog.removeAttribute('open');
if (initial && initial !== 'home') showAuth(initial, false);
else if (sharedLinkToken) showAuth('login', false);

if (!motionPreference.matches && 'IntersectionObserver' in window) {
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) revealHomeElement(entry.target);
      }
    },
    { threshold: 0.06, rootMargin: '0px 0px -24px 0px' },
  );
  document
    .querySelectorAll(
      '.feature-section .feature-media, .feature-section .feature-copy, .feature-section .feature-details, .home-start h2, .home-start > .glass-button',
    )
    .forEach((element) => {
      // Already-visible content never disappears while the deferred script loads.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      element.classList.add('home-reveal-pending');
      revealObserver.observe(element);
    });
  document.addEventListener('focusin', (event) => {
    const pending = event.target.closest?.('.home-reveal-pending');
    if (pending) {
      pending.classList.remove('home-reveal-pending');
      revealObserver.unobserve(pending);
    }
  });
}
window.addEventListener('pageshow', () => {
  if (!busy)
    document.querySelectorAll('[data-auth-form] [type=submit]').forEach((button) => {
      button.disabled = false;
    });
});

const scrollWorldHost = document.querySelector('[data-scroll-world]');
if (scrollWorldHost && typeof mountScrollWorld === 'function') {
  mountScrollWorld(scrollWorldHost, {
    brand: { name: '拾词', href: '/' },
    cta: { label: '开始学习', href: '/login', openAuth: 'login' },
    hint: '向下滚动，进入研习空间',
    allowToggle: true,
    diveScroll: 1.35,
    connScroll: 0.9,
    sections: [
      {
        id: 'room',
        label: '专注空间',
        still: '/images/reading-room-poster.webp',
        accent: '#246b56',
        scroll: 1.45,
        linger: 0.35,
        eyebrow: '故事起点 · 拾词研习室',
        title: '把每一篇英语，读成自己的',
        body: '六级真题、分屏答题、随写批注与学习复盘，在安静舒展的研习室里展开。向下滚动，开启沉浸式学习旅程。',
        tags: ['全景研习室', '安静专注', '为认真留白'],
      },
      {
        id: 'practice',
        label: '分屏真题',
        still: '/images/feature-practice.png',
        accent: '#1f5948',
        scroll: 1.35,
        linger: 0.25,
        eyebrow: '第一幕 · 真实考场感',
        title: '把注意力，留给题目',
        body: '左侧真题原文，右侧题目与选项，自律倒计时与答题进度实时相伴。从写作到翻译，按自己的节奏完成整套真题。',
        tags: ['iPad 双栏分屏', '实时倒计时', '客观题即时评分'],
      },
      {
        id: 'notes',
        label: '随写批注',
        still: '/images/feature-notes.png',
        accent: '#d96b43',
        scroll: 1.35,
        linger: 0.25,
        eyebrow: '第二幕 · 思考痕迹',
        title: '思路，直接写在文章上',
        body: '钢笔划线、荧光笔高亮、随时记录理解。双指缩放推敲长句，笔迹随试卷自动持久保存，交卷后随时回看复盘。',
        tags: ['真实压感笔触', '荧光笔高亮', '双指平滑缩放', '离线自动保存'],
      },
      {
        id: 'words',
        label: '生词语境',
        still: '/images/feature-vocabulary-series.png',
        accent: '#2b6cb0',
        scroll: 1.35,
        linger: 0.25,
        eyebrow: '第三幕 · 词不离句',
        title: '让生词，慢慢变成熟词',
        body: '阅读中遇见生词，一键收录原句与释义。告别脱离语境的死记硬背，支持美音朗读、翻卡记忆与一键导出。',
        tags: ['保留原句语境', '双语释义', '翻卡复盘', '多格式无损导出'],
      },
      {
        id: 'review',
        label: '学习诊断',
        still: '/images/feature-illustrations/review.webp',
        accent: '#6b5b95',
        scroll: 1.5,
        linger: 0.4,
        eyebrow: '终章 · 笃定前行',
        title: '下一次进步，从这一篇开始',
        body: '错因归类、改答案心路分析与题型薄弱项深度诊断。让每一次练习都有据可循，为每天的认真积累留一个专属空间。',
        tags: ['薄弱题型溯源', '改答案轨迹复盘', '独立账号隔离'],
        cta: {
          primary: { label: '开始学习', href: '/login', openAuth: 'login' },
          secondary: { label: '创建账号', href: '/register', openAuth: 'register' },
        },
      },
    ],
    connectors: [null, null, null, null],
  });
}

