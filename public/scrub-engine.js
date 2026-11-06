/* ============================================================================
   拾词 · 沉浸式镜头滚动引擎 (Scroll World Scrub Engine)
   基于 huangbai-scrolling (oso95/scroll-world) 改编
   保留核心时间重映射与无缝逐帧滚动机制，深度适配拾词认证弹窗与无障碍体验
   ============================================================================ */

function mountScrollWorld(container, config) {
  if (!container) return null;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const smallMQ = window.matchMedia('(max-width: 860px)');
  const isMobile = () => coarse || smallMQ.matches;
  const SECTIONS = config.sections || [];
  const CONNECTORS = config.connectors || [];
  const CONNECTORS_M = config.connectorsMobile || [];
  const DIVE_W = config.diveScroll || 1.35;
  const CONN_W = config.connScroll || 0.9;
  const CROSSFADE = config.crossfade != null ? config.crossfade : 0.14;
  const N = SECTIONS.length;
  if (!N) return null;

  container.classList.add('sw-root');
  document.body.classList.add('has-scroll-world');

  // 构建交织的镜头片段链：dive0, [conn0], dive1, [conn1]...
  const SEGMENTS = [];
  SECTIONS.forEach((s, i) => {
    const dive = {
      kind: 'dive',
      si: i,
      clip: s.clip,
      clipM: s.clipMobile,
      still: s.still,
      stillM: s.stillMobile,
      accent: s.accent,
      w: s.scroll || DIVE_W,
      linger: s.linger || 0.25,
    };
    SEGMENTS.push(dive);
    s._seg = dive;
    if (i < N - 1 && CONNECTORS[i]) {
      SEGMENTS.push({
        kind: 'conn',
        si: i,
        clip: CONNECTORS[i],
        clipM: CONNECTORS_M[i],
        still: SECTIONS[i + 1].still,
        stillM: SECTIONS[i + 1].stillMobile,
        accent: SECTIONS[i + 1].accent,
        w: CONN_W,
      });
    }
  });
  const NSEG = SEGMENTS.length;

  // DOM 架构
  const sky = el('div', 'sw-sky');
  if (config.atmosphere !== false) {
    sky.appendChild(el('div', 'sw-sky__grad'));
    sky.appendChild(el('div', 'sw-sky__glow'));
  }
  const particles = el('div', 'sw-particles');
  sky.appendChild(particles);

  const scrollbar = el('div', 'sw-scrollbar');
  const scrollbarFill = el('span');
  scrollbar.appendChild(scrollbarFill);

  const topbar = el('div', 'sw-topbar');
  if (config.brand) {
    const brand = el('a', 'sw-brand');
    brand.href = config.brand.href || '/';
    const mark = el('span', 'sw-brand__mark');
    mark.textContent = '拾';
    brand.appendChild(mark);
    const textWrap = el('span');
    const nm = el('strong', 'sw-brand__name');
    nm.textContent = config.brand.name || '拾词';
    const sub = el('span', 'sw-brand__subtitle');
    sub.textContent = 'SHICI';
    textWrap.appendChild(nm);
    textWrap.appendChild(sub);
    brand.appendChild(textWrap);
    topbar.appendChild(brand);
  }

  const controlsWrap = el('div', 'sw-top-controls');
  const nav = el('nav', 'sw-nav');
  if (config.nav !== false) controlsWrap.appendChild(nav);

  if (config.allowToggle) {
    const toggle = el('button', 'sw-mode-toggle');
    toggle.type = 'button';
    toggle.textContent = '图文详情';
    toggle.setAttribute('aria-label', '切换图文与沉浸视图');
    toggle.addEventListener('click', () => {
      const isDetails = document.body.classList.toggle('sw-mode-details');
      toggle.textContent = isDetails ? '沉浸漫游' : '图文详情';
      if (!isDetails) {
        layout();
      }
    });
    controlsWrap.appendChild(toggle);
  }

  if (config.cta && config.cta.label) {
    const c = el('a', 'sw-topcta');
    c.href = config.cta.href || '/login';
    c.textContent = config.cta.label;
    if (config.cta.openAuth) c.setAttribute('data-open-auth', config.cta.openAuth);
    controlsWrap.appendChild(c);
  }
  topbar.appendChild(controlsWrap);

  const stage = el('div', 'sw-stage');
  const copylayer = el('div', 'sw-copylayer');
  const route = el('div', 'sw-route');
  const hint = el('div', 'sw-hint');
  const hintText = el('span');
  hintText.textContent = config.hint || '向下滚动，进入故事';
  hint.appendChild(hintText);
  hint.appendChild(el('i'));
  const track = el('div', 'sw-track');

  [sky, scrollbar, topbar, stage, copylayer, route, hint, track].forEach((n) => container.appendChild(n));

  // 场景视界挂载
  SEGMENTS.forEach((s) => {
    const scene = el('div', 'sw-scene');
    scene.style.setProperty('--sw-accent', s.accent || '');
    const img = el('img', 'sw-scene__still');
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    const poster = isMobile() && s.stillM ? s.stillM : s.still;
    if (poster) img.src = poster;
    scene.appendChild(img);
    stage.appendChild(scene);
    s.el = scene;
    s.img = img;
    s.video = null;
    s.hasClip = false;
    s.loading = false;
    s.ready = false;
    s.cur = 0;
    s.target = 0;
    s.visible = false;
  });

  // 文案与右侧路线指示点
  const copies = [];
  const dots = [];
  SECTIONS.forEach((s, i) => {
    const c = el('article', 'sw-copy');
    c.style.setProperty('--sw-accent', s.accent || '');
    c.innerHTML =
      `<span class="sw-copy__num">${pad(i + 1)} / ${pad(N)}</span>` +
      (s.eyebrow ? `<span class="sw-copy__eyebrow">${esc(s.eyebrow)}</span>` : '') +
      (s.title ? `<h2 class="sw-copy__title">${esc(s.title)}</h2>` : '') +
      (s.body ? `<p class="sw-copy__body">${esc(s.body)}</p>` : '') +
      (s.tags && s.tags.length
        ? `<ul class="sw-copy__tags">${s.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : '') +
      (s.cta ? `<div class="sw-copy__cta">${ctaBtns(s.cta)}</div>` : '');
    copylayer.appendChild(c);
    copies.push(c);

    const dot = el('button', 'sw-route__dot');
    dot.type = 'button';
    dot.style.setProperty('--sw-accent', s.accent || '');
    dot.setAttribute('aria-label', `跳转到场景：${s.label || s.title || ''}`);
    dot.innerHTML = `<span class="sw-route__label">${esc(s.label || '')}</span><i></i>`;
    dot.addEventListener('click', () => jumpTo(i));
    route.appendChild(dot);
    dots.push(dot);

    if (config.nav !== false) {
      const b = el('button', 'sw-nav__item');
      b.type = 'button';
      b.textContent = s.label || '';
      b.addEventListener('click', () => jumpTo(i));
      nav.appendChild(b);
    }
  });

  // 视差数学计算
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (x) => {
    x = clamp(x);
    return x * x * (3 - 2 * x);
  };
  const lingerEase = (x, L) => {
    L = clamp(L);
    const c = x - 0.5;
    return (1 - L) * x + L * (4 * c * c * c + 0.5);
  };

  let vh = window.innerHeight;
  let stageX = 0;
  let totalW = 0;
  let activeIndex = -1;
  let ticking = false;
  let laidOutW = window.innerWidth;
  let destroyed = false;

  function layout() {
    if (destroyed) return;
    vh = window.innerHeight;
    laidOutW = window.innerWidth;
    stageX = window.innerWidth > 860 ? 3 : 0;
    let off = 0;
    SEGMENTS.forEach((s) => {
      s.start = off * vh;
      off += s.w;
      s.end = off * vh;
    });
    totalW = off;
    track.style.height = totalW * vh + vh + 'px';
    read();
  }

  function jumpTo(i) {
    if (i < 0 || i >= N) return;
    const seg = SECTIONS[i]._seg;
    window.scrollTo({
      top: seg.start + (seg.end - seg.start) * 0.48,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }

  function loadClip(s) {
    if (reduce || s.loading || !s.clip) return;
    s.loading = true;
    const url = isMobile() && s.clipM ? s.clipM : s.clip;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('404'))))
      .then((blob) => {
        if (destroyed) return;
        const v = document.createElement('video');
        v.className = 'sw-scene__video';
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.src = URL.createObjectURL(blob);
        v.addEventListener('loadedmetadata', () => {
          s.ready = true;
          read();
        });
        v.addEventListener(
          'seeked',
          () => {
            s.el.classList.add('has-clip');
          },
          { once: true },
        );
        v.addEventListener('loadeddata', () => {
          try {
            v.pause();
          } catch {}
          if (userReady) primeVideo(v);
        });
        s.el.appendChild(v);
        s.video = v;
        s.hasClip = true;
      })
      .catch(() => {
        s.loading = false;
      });
  }

  function read() {
    if (destroyed) return;
    const y = window.scrollY || window.pageYOffset || 0;
    const fade = CROSSFADE * vh;
    let ci = 0;
    for (let i = 0; i < NSEG; i++) {
      if (y >= SEGMENTS[i].start) ci = i;
    }

    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (y > s.start - 1.5 * vh && y < s.end + 1.5 * vh) loadClip(s);
      const local = clamp((y - s.start) / (s.end - s.start), 0, 1);
      s.target = s.linger ? lingerEase(local, s.linger) : local;
      let outside = 0;
      if (y < s.start) outside = s.start - y;
      else if (y > s.end) outside = y - s.end;
      const op = smooth(1 - outside / fade);
      s.el.style.opacity = String(op);
      s.visible = op > 0.001;
      s.el.style.zIndex = i === ci ? '120' : String(100 + Math.round(op * 10));

      if (!s.hasClip || !s.ready) {
        s.img.style.transform = reduce
          ? 'none'
          : `translate3d(0, ${((0.5 - local) * 16).toFixed(1)}px, 0)`;
      }
    }

    for (let i = 0; i < N; i++) {
      const seg = SECTIONS[i]._seg;
      const pr = clamp((y - seg.start) / (seg.end - seg.start), 0, 1);
      const before = y < seg.start;
      const after = y > seg.end;
      let cop;
      if (i === 0) {
        cop = after ? 0 : smooth(1 - pr / 0.7);
      } else if (i === N - 1) {
        cop = before ? 0 : (pr < 0.25 ? smooth(pr / 0.25) : 1);
      } else if (before || after) {
        cop = 0;
      } else if (pr < 0.22) {
        cop = smooth(pr / 0.22);
      } else if (pr > 0.78) {
        cop = smooth((1 - pr) / 0.22);
      } else {
        cop = 1;
      }

      const c = copies[i];
      c.style.opacity = String(cop);
      c.style.transform = reduce ? 'none' : `translateY(${(0.5 - pr) * 3.5}vh)`;
      c.style.pointerEvents = cop > 0.5 ? 'auto' : 'none';
    }

    const cur = SEGMENTS[ci];
    const near = clamp(
      cur.kind === 'dive'
        ? cur.si
        : (y - cur.start) / (cur.end - cur.start) > 0.5
          ? cur.si + 1
          : cur.si,
      0,
      N - 1,
    );
    if (near !== activeIndex) {
      activeIndex = near;
      dots.forEach((d, k) => d.classList.toggle('is-active', k === near));
      nav.querySelectorAll('.sw-nav__item').forEach((n, k) => n.classList.toggle('is-active', k === near));
      container.style.setProperty('--sw-accent', SECTIONS[near].accent || '');
    }

    scrollbarFill.style.transform = `scaleX(${clamp(y / (totalW * vh))})`;
    hint.style.opacity = String(clamp(1 - y / (0.4 * vh)));
    if (particles) particles.style.transform = `translate3d(0, ${-y * 0.04}px, 0)`;
    ticking = false;
  }

  function raf() {
    if (destroyed) return;
    const eps = isMobile() ? 0.02 : 0.008;
    for (let i = 0; i < NSEG; i++) {
      const s = SEGMENTS[i];
      if (!s.hasClip || !s.ready || !s.video) continue;
      if (s.video.seeking) continue;
      if (!s.visible && Math.abs(s.cur - s.target) < 0.002) continue;
      s.cur += (s.target - s.cur) * (reduce ? 1 : 0.18);
      const dur = s.video.duration || 1;
      const t = clamp(s.cur, 0, 0.999) * dur;
      if (Math.abs(s.video.currentTime - t) > eps) {
        try {
          s.video.currentTime = t;
        } catch {}
      }
    }
    requestAnimationFrame(raf);
  }

  let userReady = false;
  function primeVideo(v) {
    if (!isMobile() || !v) return;
    try {
      const p = v.play();
      if (p && p.then) {
        p.then(() => {
          try {
            v.pause();
          } catch {}
        }).catch(() => {});
      }
    } catch {}
  }

  function onFirstGesture() {
    if (userReady) return;
    userReady = true;
    SEGMENTS.forEach((s) => primeVideo(s.video));
  }
  window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  window.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });

  seedParticles(particles, reduce || coarse);

  const scrollHandler = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(read);
    }
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });

  function onResize() {
    if (coarse && window.innerWidth === laidOutW) return;
    layout();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', layout);
  window.addEventListener('load', layout);

  layout();
  requestAnimationFrame(raf);

  // 辅助工具函数
  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function esc(s) {
    return String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  }
  function ctaBtns(cta) {
    let h = '';
    if (cta.primary) {
      const authAttr = cta.primary.openAuth ? ` data-open-auth="${esc(cta.primary.openAuth)}"` : '';
      h += `<a class="sw-btn sw-btn--primary" href="${esc(cta.primary.href || '/login')}"${authAttr}>${esc(cta.primary.label)}</a>`;
    }
    if (cta.secondary) {
      const authAttr = cta.secondary.openAuth ? ` data-open-auth="${esc(cta.secondary.openAuth)}"` : '';
      h += `<a class="sw-btn sw-btn--ghost" href="${esc(cta.secondary.href || '/register')}"${authAttr}>${esc(cta.secondary.label)}</a>`;
    }
    return h;
  }

  function onKeyDown(e) {
    if (document.body.classList.contains('auth-open')) return;
    const target = e.target;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      jumpTo(Math.min(N - 1, activeIndex + 1));
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      jumpTo(Math.max(0, activeIndex - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      jumpTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      jumpTo(N - 1);
    }
  }
  window.addEventListener('keydown', onKeyDown);

  return {
    jumpTo,
    layout,
    destroy() {
      destroyed = true;
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', layout);
      window.removeEventListener('load', layout);
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('has-scroll-world', 'sw-mode-details');
      container.innerHTML = '';
    },
  };
}

function seedParticles(host, reduce) {
  if (!host || reduce) return;
  const kinds = ['dot', 'dot', 'ring'];
  const seeds = [7, 23, 41, 58, 71, 88, 12, 34, 52, 66, 83, 95, 18, 29, 47, 63, 77, 91, 5, 38];
  for (let k = 0; k < 18; k++) {
    const s = document.createElement('span');
    s.className = 'sw-pt sw-pt--' + kinds[k % kinds.length];
    s.style.left = seeds[k % seeds.length] + 'vw';
    s.style.top = ((seeds[(k * 3) % seeds.length] * 1.3) % 100) + 'vh';
    s.style.setProperty(
      '--sw-sc',
      (0.55 + ((seeds[(k * 5) % seeds.length] % 60) / 60) * 1.05).toFixed(2),
    );
    const dur = 14 + (seeds[(k * 7) % seeds.length] % 20);
    s.style.animationDuration = dur + 's';
    s.style.animationDelay = -(seeds[(k * 2) % seeds.length] % dur) + 's';
    host.appendChild(s);
  }
}

// 模块化导出与全局挂载
if (typeof module !== 'undefined' && module.exports) module.exports = { mountScrollWorld };
if (typeof window !== 'undefined') window.mountScrollWorld = mountScrollWorld;

