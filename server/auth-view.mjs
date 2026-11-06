import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import illustrationCatalog from '../shared/illustrations.json' with { type: 'json' };
import {
  ArrowRight,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

const icon = (component) =>
  renderToStaticMarkup(
    React.createElement(component, { size: 20, strokeWidth: 1.65, 'aria-hidden': true }),
  );
const escape = (value) =>
  String(value || '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const field = ({
  name,
  prefix,
  label,
  type = 'text',
  placeholder,
  autocomplete,
  value = '',
  max = 128,
  min,
}) => {
  const id = prefix + '-' + name;
  return (
    '<div class="auth-field"><label for="' +
    id +
    '">' +
    label +
    '</label><div class="auth-input">' +
    icon(type === 'password' ? LockKeyhole : UserRound) +
    '<input id="' +
    id +
    '" name="' +
    name +
    '" type="' +
    type +
    '" placeholder="' +
    placeholder +
    '" autocomplete="' +
    autocomplete +
    '" value="' +
    escape(value) +
    '" required maxlength="' +
    max +
    '" ' +
    (min ? 'minlength="' + min + '" ' : '') +
    (name === 'username'
      ? 'pattern="[A-Za-z0-9](?:[A-Za-z0-9_.]|-){2,31}" autocapitalize="none" spellcheck="false"'
      : '') +
    '>' +
    (type === 'password'
      ? '<button type="button" class="auth-eye" data-toggle-password="' +
        id +
        '" aria-label="显示' +
        label +
        '" title="显示或隐藏密码" aria-pressed="false"><span data-eye-show>' +
        icon(Eye) +
        '</span><span data-eye-hide hidden>' +
        icon(EyeOff) +
        '</span></button>'
      : '') +
    '</div></div>'
  );
};
const openLink = (label, mode = 'login', className = '') =>
  '<a class="' +
  className +
  '" href="/' +
  mode +
  '" data-open-auth="' +
  mode +
  '">' +
  label +
  '</a>';
const action = (label, className = 'glass-button') =>
  openLink(label + icon(ArrowRight), 'login', className);
const illustration = (kind, size = 'heading', loading = 'lazy') => {
  const asset = illustrationCatalog.items[kind];
  return `<img class="buddy-illustration buddy-size-${size}" data-illustration="${kind}" src="${asset.src}" width="${asset.width}" height="${asset.height}" alt="" aria-hidden="true" loading="${loading}" decoding="async">`;
};
const featureScene = (kind) => {
  const asset = illustrationCatalog.scenes[kind];
  return `<figure class="feature-vignette" aria-hidden="true"><img src="${asset.src}" width="${asset.width}" height="${asset.height}" alt="" loading="lazy" decoding="async" data-feature-scene="${kind}"></figure>`;
};
const features = [
  {
    id: 'practice',
    illustration: 'reading',
    title: '把注意力，留给题目。',
    text: '从写作到翻译，按自己的节奏完成一整套练习。',
    image: '/images/feature-practice.png',
    alt: '拾词的 iPad 分屏答题界面',
    rows: [
      ['reading', '分屏阅读，独立作答', '左侧原文，右侧题目，专注不被打扰。'],
      ['timer', '倒计时与答题进度', '合理分配时间，清晰掌握完成情况。'],
      ['review', '交卷解析与错题回顾', '完成后查看解析，回到具体问题。'],
    ],
    cta: '开始练习',
  },
  {
    id: 'notes',
    illustration: 'writing',
    title: '思路，直接写在文章上。',
    text: '圈出关键词，写下理解，让阅读留下自己的痕迹。',
    image: '/images/feature-notes.png',
    alt: '英文文章上的手写下划线和荧光笔批注',
    rows: [
      ['writing', '随手书写，自在标记', '钢笔、荧光笔与文字备注，各有用处。'],
      ['search', '可撤销，也可细看', '双指缩放文章，继续推敲每一句话。'],
      ['organize', '这次的笔迹，下次还在', '自动保存，交卷之后也能回看。'],
    ],
    cta: '开始阅读',
  },
  {
    id: 'review',
    illustration: 'words',
    title: '让生词，慢慢变成熟词。',
    text: '保留遇见它的语境，也记下每一次理解与进步。',
    image: '/images/feature-vocabulary-series.png',
    alt: '拾词单词本，展示示例词汇、释义与复习状态',
    rows: [
      ['words', '从文章到单词本', '收录生词时，一起留下原句和释义。'],
      ['insights', '从错题到学习诊断', '查看题型表现与错因，找到复习重点。'],
      ['organize', '积累，始终属于你', '单词本可以复习，也可以导出保存。'],
    ],
    cta: '开始积累',
  },
];
const featureMarkup = () =>
  features
    .map(
      (item) =>
        '<section class="feature-section" id="' +
        item.id +
        '" aria-labelledby="feature-title-' +
        item.id +
        '"><div class="feature-inner"><div class="feature-copy"><div class="feature-copy-title">' +
        illustration(item.illustration) +
        '<h3 id="feature-title-' +
        item.id +
        '">' +
        item.title +
        '</h3></div><p>' +
        item.text +
        '</p></div>' +
        '<figure class="feature-media"><div class="device-bezel"><img src="' +
        item.image +
        '" alt="' +
        item.alt +
        '" width="1180" height="820" loading="lazy"></div></figure>' +
        '<div class="feature-details"><ul>' +
        item.rows
          .map(
            ([kind, title, text]) =>
              '<li>' +
              illustration(kind, 'feature') +
              '<div><strong>' +
              title +
              '</strong><p>' +
              text +
              '</p></div></li>',
          )
          .join('') +
        '</ul>' +
        featureScene(item.id) +
        action(item.cta) +
        '</div></div></section>',
    )
    .join('');

function authPanel(mode, { enabled, values, message, current }) {
  const register = mode === 'register';
  const closed = register && !enabled;
  const active = mode === current;
  const prefix = mode;
  return (
    '<section data-auth-panel="' +
    mode +
    '" aria-labelledby="' +
    mode +
    '-heading" ' +
    (!active ? 'hidden' : '') +
    '>' +
    '<div class="auth-heading"><span class="auth-symbol">' +
    illustration(register ? 'reading' : 'writing', 'heading', 'eager') +
    '</span><h2 id="' +
    mode +
    '-heading">' +
    (closed ? '注册暂未开放' : register ? '创建学习账号' : '登录拾词') +
    '</h2><p>' +
    (closed
      ? '管理员已暂停新账号注册。'
      : register
        ? '为每天的积累，留一个自己的位置。'
        : '继续你的英语学习。') +
    '</p></div>' +
    '<div class="auth-error" role="alert" data-auth-error ' +
    (!active || !message ? 'hidden' : '') +
    '>' +
    (active ? escape(message) : '') +
    '</div>' +
    (closed
      ? '<div class="auth-closed"><p>已有账号可以正常登录。</p>' +
        action('返回登录', 'auth-submit') +
        '</div>'
      : '<form method="post" action="/' +
        mode +
        '" data-auth-form="' +
        mode +
        '"><div class="auth-fields">' +
        (register
          ? field({
              name: 'displayName',
              prefix,
              label: '称呼',
              placeholder: '我们怎么称呼你',
              autocomplete: 'nickname',
              value: active ? values.displayName : '',
              max: 40,
            })
          : '') +
        field({
          name: 'username',
          prefix,
          label: '账号',
          placeholder: register ? '3–32 位字母、数字或 _ . -' : '输入账号',
          autocomplete: 'username',
          value: active ? values.username : '',
          max: 32,
          min: 3,
        }) +
        field({
          name: 'password',
          prefix,
          label: '密码',
          type: 'password',
          placeholder: register ? '至少 10 位' : '输入密码',
          autocomplete: register ? 'new-password' : 'current-password',
          min: register ? 10 : undefined,
        }) +
        (register
          ? field({
              name: 'passwordConfirm',
              prefix,
              label: '确认密码',
              type: 'password',
              placeholder: '再次输入密码',
              autocomplete: 'new-password',
              min: 10,
            })
          : '') +
        '</div><button class="auth-submit" type="submit"><span data-submit-label>' +
        (register ? '创建账号' : '登录') +
        '</span>' +
        icon(ArrowRight) +
        '</button></form>' +
        '<div class="auth-switch">' +
        (register
          ? '<span>已经有账号？</span>' + openLink('去登录')
          : enabled
            ? '<span>还没有账号？</span>' + openLink('创建账号', 'register')
            : '<span>管理员已关闭新账号注册</span>') +
        '</div>') +
    '<div class="auth-footer">' +
    icon(ShieldCheck) +
    '<span>学习记录按账号独立保存。</span></div></section>'
  );
}

const readingRoom = () =>
  '<figure class="reading-room-visual">' +
  '<img class="reading-room-image" src="/images/reading-room-poster.webp" width="1536" height="1024" alt="薄荷色书本小伙伴与卡通阅读小屋" fetchpriority="high" loading="eager" decoding="async" draggable="false">' +
  '</figure>';

export function renderAuthPage(
  res,
  { mode = 'home', enabled = true, message = '', status = 200, values = {} } = {},
) {
  const current = mode === 'register' ? 'register' : 'login';
  const options = { enabled, values, message, current };
  res
    .status(status)
    .set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    })
    .type('html')
    .send(
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
        '<meta name="theme-color" content="#eff7f8"><meta name="description" content="拾词：六级练习、文章批注、单词积累与学习复盘。为专注的英语学习，留一个自己的空间。">' +
        '<title>' +
        (mode === 'home'
          ? '拾词 · 英语学习空间'
          : (mode === 'register' ? '注册' : '登录') + ' · 拾词学习空间') +
        '</title>' +
        '<link rel="icon" type="image/png" href="' +
        illustrationCatalog.icons.favicon +
        '"><link rel="apple-touch-icon" href="' +
        illustrationCatalog.icons.appleTouch +
        '"><link rel="stylesheet" href="/auth.css?v=feature-art-20260913"><link rel="stylesheet" href="/home-static.css?v=static-20260913"><link rel="stylesheet" href="/home-scroll.css?v=scroll-20260915"><link rel="stylesheet" href="/illustrations.css?v=feature-art-20260913"><script src="/scrub-engine.js?v=scroll-20260915" defer></script><script src="/auth.js?v=scroll-20260915" defer></script></head>' +
        '<body class="home-room-theme" data-initial-auth="' +
        mode +
        '" data-registration-enabled="' +
        enabled +
        '"><a class="skip-link" href="#features">跳至功能介绍</a>' +
        '<div id="scroll-world" class="scroll-world" data-scroll-world></div>' +
        '<header class="home-header home-static-header glass-surface"><a class="home-brand" href="/"><strong>拾词</strong><span>SHICI</span></a>' +
        '<nav aria-label="网站导航"><a href="#practice" data-feature-link="practice">练习空间</a><a href="#notes" data-feature-link="notes">随写批注</a><a href="#review" data-feature-link="review">学习诊断</a></nav>' +
        openLink('登录', 'login', 'nav-login') +
        '</header>' +
        '<main class="home-static-main"><section class="home-hero" aria-labelledby="home-title">' +
        '<div class="hero-copy"><h1 id="home-title">拾词</h1><p class="hero-line"><span>把每一篇英语，</span><span>读成自己的。</span></p><p class="hero-subtitle">六级练习、随写批注与学习复盘，在一个空间里。</p>' +
        '<div class="hero-actions">' +
        action('开始学习') +
        '<a class="text-button" href="#features">探索功能' +
        icon(ChevronRight) +
        '</a></div></div>' +
        readingRoom() +
        '</section>' +
        '<section class="home-features" id="features" aria-labelledby="features-title"><div class="features-intro"><h2 id="features-title"><span>为每一次认真学习，</span><span>留下积累。</span></h2>' +
        '</div>' +
        featureMarkup() +
        '</section><section class="home-start"><h2><span>下一次进步，</span><span>从这一篇开始。</span></h2>' +
        action('开始学习') +
        '</section></main>' +
        '<footer class="home-footer"><a class="home-brand" href="/"><strong>拾词</strong><span>SHICI</span></a><span>为专注而留白。</span>' +
        openLink('登录') +
        '</footer>' +
        '<dialog class="auth-dialog glass-surface" aria-label="账号登录与注册" data-auth-dialog ' +
        (mode !== 'home' ? 'open' : '') +
        '><button class="auth-close" type="button" aria-label="关闭登录弹窗" title="关闭">' +
        icon(X) +
        '</button>' +
        authPanel('login', options) +
        authPanel('register', options) +
        '<noscript><a class="no-script-close" href="/">返回首页</a></noscript></dialog></body></html>',
    );
}
