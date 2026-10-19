(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CONFIG = Object.assign(
    {
      name: '谢Bro',
      subtitle: '生日快乐，愿你的每一天都像烟花一样闪闪发光',
      backend: 'node',
      supabase: { url: '', anonKey: '' }
    },
    window.BIRTHDAY_CONFIG || {}
  );

  const params = new URLSearchParams(window.location.search);
  const urlName = params.get('to') || params.get('name') || '';
  const NAME = limitText(urlName.trim() || CONFIG.name || '你', 16) || '你';
  const SUBTITLE =
    limitText(CONFIG.subtitle || '', 80) || '生日快乐，愿你的每一天都像烟花一样闪闪发光';

  const PALETTE = ['#ffd166', '#ff9ccb', '#7de9ff', '#c4a7ff', '#8dffb0', '#ffb08a'];
  const LOCAL_WISHES_KEY = 'bday-local-wishes-v1';
  const GUEST_NAME_KEY = 'bday-guest-name';
  const MAX_MESSAGES = 500;
  const MAX_WALL_ITEMS = 200;

  const USE_SUPABASE = CONFIG.backend === 'supabase';
  const SUPABASE_URL = String(CONFIG.supabase?.url || '').replace(/\/+$/, '');
  const SUPABASE_ANON_KEY = String(CONFIG.supabase?.anonKey || '');
  const MESSAGES_SINCE = String(CONFIG.messagesSince || '').trim();

  const MUSIC_KEY = 'bday-music-on';
  const MUSIC_VOLUME = 0.24;
  let musicWanted = true;
  try {
    musicWanted = localStorage.getItem(MUSIC_KEY) !== 'off';
  } catch {
    /* 忽略 */
  }

  const DEMO_MESSAGES = [
    {
      id: 'demo-1',
      name: '阿橙',
      text: '生日快乐！愿你今年许下的每个愿望，都悄悄实现。',
      ts: Date.now() - 6 * 60 * 1000
    },
    {
      id: 'demo-2',
      name: '小鹿',
      text: '愿你眼里有光，心里有糖，永远被爱包围。',
      ts: Date.now() - 18 * 60 * 1000
    },
    {
      id: 'demo-3',
      name: 'Momo',
      text: '又长大一岁啦，要继续做闪闪发光的自己！',
      ts: Date.now() - 47 * 60 * 1000
    },
    {
      id: 'demo-4',
      name: '一颗星',
      text: '把今天的快乐存起来，够用一整年。',
      ts: Date.now() - 2 * 60 * 60 * 1000
    },
    {
      id: 'demo-5',
      name: '晚风',
      text: '愿新的一岁，山海皆可平，所行皆坦途。',
      ts: Date.now() - 3 * 60 * 60 * 1000
    }
  ];

  const nameInput = $('guestName');
  const wishText = $('wishText');
  const wishForm = $('wishForm');
  const sendBtn = $('sendBtn');
  const sendLabel = sendBtn.querySelector('.send-label');
  const composer = document.querySelector('.composer');
  const livePill = $('livePill');
  const statusLine = $('statusLine');
  const toast = $('toast');
  const wallDialog = $('wallDialog');
  const wallList = $('wallList');
  const wallEmpty = $('wallEmpty');
  const badgeCount = $('badgeCount');
  const wishTotal = $('wishTotal');
  const wallCount = $('wallCount');
  const bgMusic = $('bgMusic');
  const musicBtn = $('musicBtn');
  const musicHint = $('musicHint');
  const quickWishBtn = $('quickWishBtn');
  const quickWishCount = $('quickWishCount');

  let messages = [];
  const messagesById = new Map();
  const knownIds = new Set();
  const demoIds = new Set();

  let offlineMode = false;
  let polling = false;
  let sending = false;
  let quickSending = false;
  let toastTimer = 0;
  let lastBoomAt = 0;

  let audioCtx = null;
  let soundOn = false;
  let noiseBuffer = null;

  let musicPlaying = false;
  let musicFadeFrame = 0;
  let musicFadeToken = 0;

  let fireworks = null;

  /* ------------------------------- 小工具 -------------------------------- */

  function limitText(value, maxLength) {
    const text = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(text).slice(0, maxLength).join('');
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function colorForName(name) {
    let hash = 0;
    for (const char of Array.from(name || '✦')) {
      hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
  }

  function formatRelativeTime(timestamp) {
    const diff = Math.max(0, Date.now() - timestamp);
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
    const date = new Date(timestamp);
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  function showToast(message, type = 'ok') {
    toast.textContent = message;
    toast.classList.toggle('is-error', type === 'error');
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function saveGuestName(name) {
    try {
      if (name) localStorage.setItem(GUEST_NAME_KEY, name);
    } catch {
      /* 浏览器禁用存储时忽略 */
    }
  }

  function loadLocalWishes() {
    try {
      const raw = localStorage.getItem(LOCAL_WISHES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeMessage).filter(Boolean).slice(-50);
    } catch {
      return [];
    }
  }

  function saveLocalWish(wish) {
    try {
      const list = loadLocalWishes();
      if (!list.some((item) => item.id === wish.id)) list.push(wish);
      localStorage.setItem(LOCAL_WISHES_KEY, JSON.stringify(list.slice(-50)));
    } catch {
      /* 忽略存储失败 */
    }
  }

  function normalizeMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = limitText(raw.text, 80);
    if (!text) return null;

    const name = limitText(raw.name, 16) || '匿名旅人';
    const id =
      typeof raw.id === 'string' && raw.id
        ? raw.id.slice(0, 80)
        : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    let ts = Number(raw.ts);
    if (!Number.isFinite(ts) || ts <= 0) ts = Date.now();
    if (ts > Date.now() + 60 * 1000) ts = Date.now();

    return { id, name, text, ts };
  }

  /* -------------------------------- 夜空装饰 ------------------------------- */

  function initStars() {
    const layer = $('stars');
    if (!layer) return;

    const count = Math.min(
      150,
      Math.max(45, Math.round((window.innerWidth * window.innerHeight) / 16000))
    );
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < count; index += 1) {
      const star = document.createElement('i');
      const size = Math.random() < 0.1 ? 3 : 2;
      star.style.left = `${(Math.random() * 100).toFixed(2)}%`;
      star.style.top = `${(Math.random() * 91).toFixed(2)}%`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.setProperty('--dur', `${randomBetween(2.4, 6.4).toFixed(2)}s`);
      star.style.setProperty('--delay', `${(-randomBetween(0, 8)).toFixed(2)}s`);
      star.style.opacity = randomBetween(0.22, 0.75).toFixed(2);
      if (Math.random() < 0.16) star.classList.add('star-warm');
      if (size === 3) star.classList.add('star-big');
      fragment.append(star);
    }

    layer.append(fragment);
  }

  function initMoon() {
    const container = $('moon');
    if (!container) return;

    const map = [
      '...####...',
      '..######..',
      '.########.',
      '.####.....',
      '###.......',
      '##........',
      '##........',
      '###.......',
      '.####.....',
      '.########.',
      '..######..',
      '...####...'
    ];
    const craters = new Set(['3,2', '2,4', '1,7', '5,2']);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 10 12');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');

    map.forEach((row, y) => {
      Array.from(row).forEach((cell, x) => {
        if (cell !== '#') return;
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', '1');
        rect.setAttribute('height', '1');
        rect.setAttribute('fill', craters.has(`${x},${y}`) ? '#e6d29a' : '#fff3ce');
        svg.append(rect);
      });
    });

    [
      [9, 1],
      [9, 5],
      [8, 10]
    ].forEach(([x, y]) => {
      const spark = document.createElementNS(svgNS, 'rect');
      spark.setAttribute('x', String(x));
      spark.setAttribute('y', String(y));
      spark.setAttribute('width', '1');
      spark.setAttribute('height', '1');
      spark.setAttribute('fill', '#ffd166');
      spark.setAttribute('opacity', '0.85');
      svg.append(spark);
    });

    container.append(svg);
  }

  function drawPixelTitle() {
    const canvas = $('pixelTitle');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const font = {
      H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
      A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
      P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
      Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
      B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
      I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
      R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
      T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
      D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110']
    };
    const titlePalette = ['#ffd166', '#ff8fc6', '#7de9ff', '#ffb08a', '#c4a7ff', '#8dffb0'];
    const text = 'HAPPY BIRTHDAY';
    const scale = 4;
    const padding = 2;

    let units = 0;
    for (const char of text) units += char === ' ' ? 3 : 6;
    units -= 1;

    canvas.width = (units + padding * 2) * scale;
    canvas.height = (7 + padding * 2) * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    let cursor = padding;
    let colorIndex = 0;
    const letters = [];

    for (const char of text) {
      if (char === ' ') {
        cursor += 3;
        continue;
      }
      letters.push({
        glyph: font[char],
        x: cursor,
        color: titlePalette[colorIndex % titlePalette.length]
      });
      colorIndex += 1;
      cursor += 6;
    }

    for (const letter of letters) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (letter.glyph[row][col] !== '1') continue;
          ctx.fillStyle = 'rgba(2, 4, 12, 0.58)';
          ctx.fillRect(
            (letter.x + col + 1) * scale,
            (padding + row + 1) * scale,
            scale,
            scale
          );
        }
      }
    }

    for (const letter of letters) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (letter.glyph[row][col] !== '1') continue;
          const x = (letter.x + col) * scale;
          const y = (padding + row) * scale;
          ctx.fillStyle = letter.color;
          ctx.fillRect(x, y, scale, scale);

          if (row === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
            ctx.fillRect(x, y, scale, scale);
          } else if (row === 6) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(x, y, scale, scale);
          }
        }
      }
    }

    const sparkle = (x, y) => {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x * scale, y * scale, scale, scale);
      ctx.globalAlpha = 1;
    };

    sparkle(1, 1);
    sparkle(units + 2, 4);
    sparkle(Math.floor(units / 2), 9);
  }

  /* --------------------------------- 声音 --------------------------------- */

  function ensureAudio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    try {
      if (!audioCtx) {
        audioCtx = new AudioCtor();
        const length = Math.floor(audioCtx.sampleRate * 0.4);
        noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
        const channel = noiseBuffer.getChannelData(0);
        for (let index = 0; index < length; index += 1) {
          channel[index] =
            (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.6);
        }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    } catch {
      return null;
    }
  }

  function playChime() {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;

    [660, 990].forEach((frequency, index) => {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.03, now + index * 0.09 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.45);
      oscillator.connect(gain).connect(audioCtx.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.5);
    });
  }

  function playBurstSound(strength = 1) {
    if (!soundOn || !audioCtx || audioCtx.state !== 'running' || !noiseBuffer) return;

    const now = audioCtx.currentTime;
    const safeStrength = clamp(strength, 0.6, 1.6);

    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = randomBetween(900, 1900);
    filter.Q.value = 0.7;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.032 * safeStrength, now + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    noise.connect(filter).connect(noiseGain).connect(audioCtx.destination);
    noise.start(now);
    noise.stop(now + 0.38);

    const thump = audioCtx.createOscillator();
    const thumpGain = audioCtx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(randomBetween(130, 180), now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.024 * safeStrength, now + 0.012);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    thump.connect(thumpGain).connect(audioCtx.destination);
    thump.start(now);
    thump.stop(now + 0.3);
  }

  function persistMusicPreference(enabled) {
    try {
      localStorage.setItem(MUSIC_KEY, enabled ? 'on' : 'off');
    } catch {
      /* 忽略 */
    }
  }

  function setMusicUI() {
    if (!musicBtn || !musicHint) return;
    musicBtn.classList.toggle('is-on', musicPlaying);
    musicBtn.setAttribute('aria-pressed', String(musicPlaying));
    const label = musicPlaying ? '暂停背景音乐' : '播放背景音乐';
    musicBtn.setAttribute('aria-label', label);
    musicBtn.title = label;
    musicHint.hidden = musicPlaying || !musicWanted;
  }

  function fadeMusic(target, duration = 700) {
    cancelAnimationFrame(musicFadeFrame);
    const startVolume = bgMusic.volume;
    const started = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      bgMusic.volume = clamp(startVolume + (target - startVolume) * progress, 0, 1);
      if (progress < 1) musicFadeFrame = requestAnimationFrame(tick);
    };

    musicFadeFrame = requestAnimationFrame(tick);
  }

  async function startMusic(fromGesture = false) {
    if (!bgMusic) return false;

    musicWanted = true;
    persistMusicPreference(true);
    const token = ++musicFadeToken;

    try {
      bgMusic.volume = 0;
      await bgMusic.play();
      if (token !== musicFadeToken) return false;
      musicPlaying = true;
      fadeMusic(MUSIC_VOLUME, 1300);
      setMusicUI();
      return true;
    } catch {
      musicPlaying = false;
      setMusicUI();
      if (fromGesture) {
        showToast('音乐没有播放成功，请再点一次音乐按钮。', 'error');
      }
      return false;
    }
  }

  function stopMusic() {
    musicWanted = false;
    persistMusicPreference(false);
    musicPlaying = false;
    const token = ++musicFadeToken;
    fadeMusic(0, 380);
    setMusicUI();

    window.setTimeout(() => {
      if (token === musicFadeToken) bgMusic.pause();
    }, 430);
  }

  async function toggleMusic() {
    if (musicPlaying) {
      stopMusic();
      return;
    }
    await startMusic(true);
    setMusicUI();
  }

  function initBackgroundMusic() {
    if (!bgMusic) return;
    bgMusic.volume = 0;
    setMusicUI();

    if (!musicWanted) return;

    const token = ++musicFadeToken;
    bgMusic
      .play()
      .then(() => {
        if (token !== musicFadeToken) return;
        musicPlaying = true;
        fadeMusic(MUSIC_VOLUME, 1800);
        setMusicUI();
      })
      .catch(() => {
        musicPlaying = false;
        setMusicUI();
      });
  }

  /* -------------------------------- 烟花引擎 ------------------------------- */

  function createFireworks() {
    const canvas = $('fireworks');
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return { start() {}, finale() {}, cheer() {}, resize() {} };
    }

    const colors = ['#ff4d9d', '#ffd166', '#6ee7ff', '#a78bfa', '#7dffb3', '#ff8a5c', '#fff1b8'];
    const random = randomBetween;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    let width = 0;
    let height = 0;
    let rockets = [];
    let particles = [];
    let running = false;
    let lastFrame = 0;
    let autoElapsed = 0;
    let autoNext = 500;
    let animationId = 0;

    function resize() {
      const blockSize = window.innerWidth < 700 ? 2.6 : 3.2;
      const nextWidth = Math.max(180, Math.ceil(window.innerWidth / blockSize));
      const nextHeight = Math.max(140, Math.ceil(window.innerHeight / blockSize));

      if (nextWidth === width && nextHeight === height) return;

      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = false;
      rockets = [];
      particles = [];
    }

    function addParticle({
      x,
      y,
      vx,
      vy,
      life,
      color,
      size = 1,
      gravity = 0.02,
      drag = 0.986
    }) {
      if (particles.length >= 2300) return;
      particles.push({
        x,
        y,
        vx,
        vy,
        life,
        maxLife: life,
        color,
        size,
        gravity,
        drag
      });
    }

    function launch(options = {}) {
      if (!width || !height || particles.length > 2100) return;

      const color = options.color || pick(colors);
      const targetY = options.targetY ?? random(height * 0.12, height * 0.48);

      rockets.push({
        x: options.x ?? random(width * 0.12, width * 0.88),
        y: height + 2,
        vx: random(-0.14, 0.14),
        vy: -random(2.2, 3.15),
        targetY,
        color,
        type:
          options.type ||
          pick([
            'ring',
            'bloom',
            'willow',
            'heart',
            'double',
            'star',
            'spiral',
            'palm',
            'crossette',
            'ring',
            'bloom'
          ]),
        power: options.power || random(0.9, 1.25)
      });
    }

    function burst(x, y, color, type, power = 1) {
      const base = clamp(height / 280, 0.72, 1.45) * power;
      const isReduced = prefersReducedMotion;

      const add = (vx, vy, life, particleColor, size = 1, gravity = 0.02, drag = 0.986) => {
        addParticle({
          x,
          y,
          vx,
          vy,
          life,
          color: particleColor,
          size,
          gravity,
          drag
        });
      };

      const ring = (speed, count, ringColor, lifeMin, lifeMax, jitter = 0.02) => {
        const total = isReduced ? Math.round(count * 0.45) : count;
        for (let index = 0; index < total; index += 1) {
          const angle = (index / total) * Math.PI * 2 + random(-jitter, jitter);
          const velocity = speed * random(0.94, 1.06) * base;
          add(
            Math.cos(angle) * velocity,
            Math.sin(angle) * velocity,
            random(lifeMin, lifeMax),
            Math.random() < 0.16 ? '#fff7de' : ringColor,
            Math.random() < 0.12 ? 2 : 1,
            random(0.014, 0.028),
            0.986
          );
        }
      };

      if (type === 'heart') {
        const total = isReduced ? 28 : 68;
        for (let index = 0; index < total; index += 1) {
          const t = (index / total) * Math.PI * 2;
          const hx = 16 * Math.pow(Math.sin(t), 3);
          const hy =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t);
          const factor = 0.06 * base;
          add(
            hx * factor,
            -hy * factor,
            random(66, 94),
            Math.random() < 0.3 ? '#ffffff' : color,
            Math.random() < 0.18 ? 2 : 1,
            0.005,
            0.993
          );
        }
      } else if (type === 'willow') {
        const total = isReduced ? 22 : 48;
        for (let index = 0; index < total; index += 1) {
          const angle = (index / total) * Math.PI * 2 + random(-0.05, 0.05);
          const velocity = random(0.75, 1.65) * base;
          add(
            Math.cos(angle) * velocity,
            Math.sin(angle) * velocity,
            random(95, 140),
            Math.random() < 0.4 ? '#ffd166' : color,
            Math.random() < 0.2 ? 2 : 1,
            0.045,
            0.991
          );
        }
      } else if (type === 'bloom') {
        const total = isReduced ? 28 : 66;
        for (let index = 0; index < total; index += 1) {
          const angle = random(0, Math.PI * 2);
          const velocity = Math.pow(Math.random(), 0.55) * 2.2 * base;
          add(
            Math.cos(angle) * velocity,
            Math.sin(angle) * velocity,
            random(48, 92),
            Math.random() < 0.2 ? '#fff7de' : color,
            Math.random() < 0.16 ? 2 : 1,
            random(0.015, 0.03),
            0.985
          );
        }
      } else if (type === 'star') {
        const points = 5;
        const total = isReduced ? 34 : 76;
        for (let index = 0; index < total; index += 1) {
          const point = index % points;
          const angle =
            -Math.PI / 2 + (point / points) * Math.PI * 2 + random(-0.075, 0.075);
          const reach = index < points * 3 ? random(1.35, 2.15) : random(0.55, 1.3);
          const velocity = reach * base;
          add(
            Math.cos(angle) * velocity,
            Math.sin(angle) * velocity,
            random(58, 104),
            Math.random() < 0.24 ? '#fff7de' : color,
            Math.random() < 0.2 ? 2 : 1,
            random(0.012, 0.026),
            0.986
          );
        }
        ring(1.0, 18, '#ffe6a1', 40, 66, 0.08);
      } else if (type === 'spiral') {
        const total = isReduced ? 32 : 82;
        for (let index = 0; index < total; index += 1) {
          const progress = index / total;
          const angle = progress * Math.PI * 4.6 + random(-0.04, 0.04);
          const velocity = (0.45 + progress * 2.0) * base;
          add(
            Math.cos(angle) * velocity,
            Math.sin(angle) * velocity,
            random(54, 100),
            Math.random() < 0.26 ? '#ffffff' : color,
            Math.random() < 0.16 ? 2 : 1,
            random(0.012, 0.024),
            0.99
          );
        }
      } else if (type === 'palm') {
        const fronds = 9;
        const perFrond = isReduced ? 3 : 6;
        for (let frond = 0; frond < fronds; frond += 1) {
          const spread = fronds === 1 ? 0 : frond / (fronds - 1) - 0.5;
          const angle = -Math.PI / 2 + spread * Math.PI * 1.25;
          for (let index = 0; index < perFrond; index += 1) {
            const velocity = (0.85 + index * 0.3) * base;
            add(
              Math.cos(angle) * velocity + random(-0.1, 0.1),
              Math.sin(angle) * velocity + random(-0.08, 0.08),
              random(90, 138),
              Math.random() < 0.34 ? '#ffd166' : color,
              Math.random() < 0.36 ? 2 : 1,
              0.052,
              0.99
            );
          }
        }
      } else if (type === 'crossette') {
        const arms = 8;
        const perArm = isReduced ? 2 : 4;
        for (let arm = 0; arm < arms; arm += 1) {
          const angle = (arm / arms) * Math.PI * 2 + random(-0.025, 0.025);
          for (let index = 0; index < perArm; index += 1) {
            const velocity = (0.75 + index * 0.47) * base;
            add(
              Math.cos(angle) * velocity,
              Math.sin(angle) * velocity,
              random(58, 96),
              Math.random() < 0.3 ? '#fff7de' : color,
              Math.random() < 0.22 ? 2 : 1,
              random(0.012, 0.026),
              0.992
            );
          }
        }
        ring(0.9, 14, color, 32, 52, 0.1);
      } else if (type === 'double') {
        ring(1.85, 40, color, 55, 82);
        ring(1.05, 30, Math.random() < 0.5 ? '#ffd166' : pick(colors), 48, 76, 0.06);
      } else {
        ring(1.55, isReduced ? 24 : 52, color, 52, 84);
      }

      const flashCount = isReduced ? 3 : 8;
      for (let index = 0; index < flashCount; index += 1) {
        add(
          random(-0.7, 0.7),
          random(-0.7, 0.7),
          random(10, 18),
          '#fff8dd',
          2,
          0,
          0.9
        );
      }

      if (soundOn && Math.random() < 0.72) playBurstSound(power);
    }

    function update(delta) {
      const step = delta / (1000 / 60);
      autoElapsed += delta;

      if (autoElapsed >= autoNext) {
        autoElapsed = 0;
        autoNext = prefersReducedMotion
          ? randomBetween(3600, 5600)
          : randomBetween(820, 1850);
        launch();
      }

      for (let index = rockets.length - 1; index >= 0; index -= 1) {
        const rocket = rockets[index];
        rocket.x += rocket.vx * step;
        rocket.y += rocket.vy * step;
        rocket.vy += 0.026 * step;

        if (Math.random() < 0.85) {
          addParticle({
            x: rocket.x + random(-0.3, 0.3),
            y: rocket.y + random(0, 0.6),
            vx: random(-0.12, 0.12),
            vy: random(0.12, 0.45),
            life: random(7, 12),
            color: rocket.color,
            size: 1,
            gravity: 0,
            drag: 1
          });
        }

        if (rocket.y <= rocket.targetY || rocket.vy >= 0) {
          burst(
            rocket.x,
            Math.max(4, rocket.y),
            rocket.color,
            rocket.type,
            rocket.power
          );
          rockets.splice(index, 1);
        }
      }

      const particleStep = step;
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.x += particle.vx * particleStep;
        particle.y += particle.vy * particleStep;
        particle.vy += particle.gravity * particleStep;

        const drag = Math.pow(particle.drag, particleStep);
        particle.vx *= drag;
        particle.vy *= drag;
        particle.life -= particleStep;

        if (
          particle.life <= 0 ||
          particle.x < -10 ||
          particle.x > width + 10 ||
          particle.y > height + 12
        ) {
          particles[index] = particles[particles.length - 1];
          particles.pop();
        }
      }
    }

    function draw() {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.17)';
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';

      for (const rocket of rockets) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff8dd';
        ctx.fillRect(Math.round(rocket.x), Math.round(rocket.y), 2, 2);
        ctx.fillStyle = rocket.color;
        ctx.fillRect(Math.round(rocket.x), Math.round(rocket.y) + 2, 1, 2);
      }

      for (const particle of particles) {
        let alpha = clamp(particle.life / particle.maxLife, 0, 1);
        if (particle.life < 14 && Math.random() < 0.35) alpha *= 0.35;
        if (alpha <= 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.fillRect(
          Math.round(particle.x),
          Math.round(particle.y),
          particle.size,
          particle.size
        );
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(now) {
      if (!running) return;

      if (!lastFrame) lastFrame = now;
      const delta = Math.min(now - lastFrame, 60);
      lastFrame = now;

      if (!document.hidden) {
        update(delta);
        draw();
      }

      animationId = window.requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      window.addEventListener('resize', resize, { passive: true });
      window.setTimeout(() => launch(), 250);
      window.setTimeout(() => launch({ type: 'heart' }), 900);
      lastFrame = performance.now();
      animationId = window.requestAnimationFrame(frame);
    }

    function cheer() {
      if (!running) return;
      [0, 130, 280].forEach((delay, index) => {
        window.setTimeout(() => launch({ power: 1.05 + index * 0.08 }), delay);
      });
    }

    function finale() {
      if (!running) return;
      resize();
      const total = prefersReducedMotion ? 4 : 10;
      const finaleTypes = [
        'heart',
        'double',
        'bloom',
        'star',
        'spiral',
        'palm',
        'crossette',
        'ring'
      ];
      for (let index = 0; index < total; index += 1) {
        window.setTimeout(() => {
          launch({
            x: width * random(0.15, 0.85),
            targetY: height * random(0.1, 0.43),
            power: random(1.12, 1.48),
            type: finaleTypes[index % finaleTypes.length]
          });
        }, index * 140);
      }
      window.setTimeout(() => {
        burst(width / 2, height * 0.34, '#ff6fae', 'heart', 2);
      }, 700);
    }

    return {
      start,
      finale,
      cheer,
      resize,
      stop() {
        running = false;
        window.cancelAnimationFrame(animationId);
      }
    };
  }

  /* -------------------------------- 弹幕系统 ------------------------------- */

  let lanes = [];
  let danmakuQueue = [];
  let activeDanmaku = new Set();
  let pumping = false;
  let pumpTimer = 0;
  let measureQueued = false;

  function measureLanes() {
    if (!composer) return;

    const mobile = window.innerWidth < 720;
    const top = mobile ? 84 : 96;
    const laneHeight = mobile ? 38 : 44;
    const composerTop = composer.getBoundingClientRect().top;
    const bottom = Math.max(top + laneHeight * 3, composerTop - 18);
    const count = Math.max(3, Math.floor((bottom - top) / laneHeight));
    const previous = lanes;

    lanes = Array.from({ length: count }, (_, index) => ({
      top: top + index * laneHeight,
      freeAt: previous[index] ? previous[index].freeAt : 0
    }));
  }

  function showDanmaku(message, laneIndex) {
    const lane = lanes[laneIndex];
    if (!lane) return;

    const element = document.createElement('span');
    element.className = 'danmaku is-measuring';

    const color = colorForName(message.name);
    const star = document.createElement('span');
    star.className = 'd-star';
    star.textContent = '✦';
    star.style.color = color;

    const name = document.createElement('span');
    name.className = 'd-name';
    name.textContent = message.name;
    name.style.color = color;

    const separator = document.createElement('span');
    separator.className = 'd-sep';
    separator.textContent = '：';

    const text = document.createElement('span');
    text.className = 'd-text';
    text.textContent = message.text;

    element.append(star, name, separator, text);
    element.style.top = `${lane.top + (window.innerWidth < 720 ? 8 : 10)}px`;
    element.style.setProperty('--dur', '18s');
    $('danmakuLayer').append(element);

    const width = element.getBoundingClientRect().width || 320;
    const speed = (window.innerWidth < 720 ? 72 : 98) + Math.random() * 8;
    const duration = clamp((window.innerWidth + width) / speed, 11, 34);
    element.style.setProperty('--dur', `${duration.toFixed(2)}s`);
    element.classList.remove('is-measuring');

    lane.freeAt = performance.now() + (width / speed) * 1000 + 900;

    activeDanmaku.add(element);
    element.addEventListener(
      'animationend',
      () => {
        element.remove();
        activeDanmaku.delete(element);
        pumpDanmaku();
      },
      { once: true }
    );
  }

  function pumpDanmaku() {
    if (pumping || danmakuQueue.length === 0) return;
    if (!lanes.length) measureLanes();

    const now = performance.now();
    const freeLane = lanes.findIndex((lane) => lane.freeAt <= now);

    if (freeLane === -1) {
      const nextFree = Math.min(...lanes.map((lane) => lane.freeAt));
      clearTimeout(pumpTimer);
      pumpTimer = window.setTimeout(pumpDanmaku, Math.max(180, nextFree - now + 60));
      return;
    }

    if (activeDanmaku.size >= 18) {
      clearTimeout(pumpTimer);
      pumpTimer = window.setTimeout(pumpDanmaku, 550);
      return;
    }

    const message = danmakuQueue.shift();
    showDanmaku(message, freeLane);

    pumping = true;
    clearTimeout(pumpTimer);
    pumpTimer = window.setTimeout(() => {
      pumping = false;
      pumpDanmaku();
    }, 620);
  }

  function enqueueDanmaku(message) {
    if (!message || !message.text) return;
    danmakuQueue.push(message);
    if (danmakuQueue.length > 40) {
      danmakuQueue.splice(0, danmakuQueue.length - 40);
    }
    pumpDanmaku();
  }

  /* -------------------------------- 留言数据 ------------------------------- */

  function mergeMessages(list, options = {}) {
    const incoming = [];

    for (const raw of Array.isArray(list) ? list : []) {
      const message = normalizeMessage(raw);
      if (!message) continue;

      if (options.demo) demoIds.add(message.id);
      messagesById.set(message.id, message);

      if (!knownIds.has(message.id)) {
        knownIds.add(message.id);
        incoming.push(message);
      }
    }

    messages = Array.from(messagesById.values())
      .sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
      .slice(-MAX_MESSAGES);

    if (messagesById.size > 900) {
      const keep = new Set(messages.map((message) => message.id));
      for (const id of messagesById.keys()) {
        if (!keep.has(id)) messagesById.delete(id);
      }
    }

    if (options.initial) {
      incoming.slice(-8).forEach(enqueueDanmaku);
    } else {
      incoming.slice(-10).forEach(enqueueDanmaku);
    }

    refreshCounters();
    if (wallDialog && wallDialog.open) renderWall();
  }

  function dropDemoMessages() {
    if (demoIds.size === 0) return;
    for (const id of demoIds) {
      messagesById.delete(id);
      knownIds.delete(id);
    }
    demoIds.clear();
    messages = Array.from(messagesById.values()).sort((a, b) => a.ts - b.ts);
    refreshCounters();
  }

  function refreshQuickCount() {
    if (!quickWishBtn || !quickWishCount) return;
    const count = messages.filter((message) => message.text === '生日快乐！').length;
    quickWishCount.textContent = count > 999 ? '999+ 次' : `${count} 次`;
    quickWishBtn.setAttribute(
      'aria-label',
      `快捷发送一条生日快乐，当前已发送 ${count} 次`
    );
  }

  function refreshCounters() {
    const count = messages.length;
    badgeCount.textContent = count > 99 ? '99+' : String(count);
    wishTotal.textContent = `${count} 条祝福`;
    wallCount.textContent = String(count);
    refreshQuickCount();
  }

  function renderWall() {
    if (!wallList) return;

    const scrollTop = wallList.scrollTop;
    const fragment = document.createDocumentFragment();
    const sorted = [...messages].sort((a, b) => b.ts - a.ts).slice(0, MAX_WALL_ITEMS);

    for (const message of sorted) {
      const item = document.createElement('li');
      item.className = 'wall-item';
      const color = colorForName(message.name);
      item.style.setProperty('--c', color);

      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.textContent = Array.from(message.name)[0] || '✦';

      const body = document.createElement('div');
      body.className = 'wall-body';

      const meta = document.createElement('div');
      meta.className = 'wall-meta';

      const name = document.createElement('b');
      name.textContent = message.name;

      const time = document.createElement('time');
      time.dateTime = new Date(message.ts).toISOString();
      time.textContent = formatRelativeTime(message.ts);

      const content = document.createElement('p');
      content.className = 'wall-text';
      content.textContent = message.text;

      meta.append(name, time);
      body.append(meta, content);
      item.append(avatar, body);
      fragment.append(item);
    }

    wallList.replaceChildren(fragment);
    wallEmpty.hidden = messages.length > 0;
    if (scrollTop > 0) wallList.scrollTop = scrollTop;
  }

  /* -------------------------------- 网络请求 ------------------------------- */

  async function requestJson(url, options = {}, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        ...options,
        headers,
        signal: controller.signal
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const error = new Error(
          (data && data.error) || `请求失败（${response.status}），请稍后再试。`
        );
        error.status = response.status;
        throw error;
      }

      return data || {};
    } finally {
      clearTimeout(timer);
    }
  }

  function setStatus(kind, text) {
    livePill.classList.toggle('is-offline', kind === 'offline');
    composer.classList.toggle('is-offline', kind === 'offline');
    statusLine.textContent = text;
  }

  function supabaseHeaders(extra = {}) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      ...extra
    };
  }

  function normalizeSupabaseRow(row) {
    if (!row || typeof row !== 'object') return null;
    const timestamp = Date.parse(row.created_at);
    return normalizeMessage({
      id: row.id,
      name: row.name,
      text: row.text,
      ts: Number.isFinite(timestamp) ? timestamp : Date.now()
    });
  }

  async function readSupabaseError(response) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      detail = null;
    }
    const error = new Error(
      (detail && (detail.message || detail.hint || detail.error_description)) ||
        `留言服务请求失败（${response.status}）`
    );
    error.status = response.status;
    return error;
  }

  async function fetchWishes() {
    if (!USE_SUPABASE) {
      const data = await requestJson('/api/messages');
      return Array.isArray(data.messages) ? data.messages : [];
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase 留言后端尚未配置。');
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 7000);
    const query = new URLSearchParams({
      select: 'id,name,text,created_at',
      order: 'created_at.asc',
      limit: '500'
    });
    if (MESSAGES_SINCE) query.set('created_at', `gt.${MESSAGES_SINCE}`);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/messages?${query}`, {
        cache: 'no-store',
        headers: supabaseHeaders(),
        signal: controller.signal
      });
      if (!response.ok) throw await readSupabaseError(response);
      const rows = await response.json();
      return Array.isArray(rows) ? rows.map(normalizeSupabaseRow).filter(Boolean) : [];
    } finally {
      clearTimeout(timer);
    }
  }

  async function createWish(name, text) {
    if (!USE_SUPABASE) {
      const data = await requestJson(
        '/api/messages',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, text })
        },
        8000
      );
      if (!data.message) throw new Error('祝福没有送达，请再试一次。');
      return data.message;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase 留言后端尚未配置。');
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify({ name, text })
    });

    if (!response.ok) throw await readSupabaseError(response);

    const rows = await response.json();
    const wish = Array.isArray(rows) ? normalizeSupabaseRow(rows[0]) : null;
    if (!wish) throw new Error('祝福没有送达，请再试一次。');
    return wish;
  }

  function enterOfflineMode(text) {
    offlineMode = true;
    const local = loadLocalWishes();
    mergeMessages(local.length ? local : DEMO_MESSAGES, {
      initial: true,
      demo: local.length === 0
    });
    setStatus('offline', text);
  }

  async function pollMessages() {
    if (polling || document.hidden || window.location.protocol === 'file:') return;
    polling = true;

    try {
      const list = await fetchWishes();

      if (offlineMode) {
        dropDemoMessages();
        offlineMode = false;
        mergeMessages(list, { initial: true });
      } else {
        mergeMessages(list);
      }

      setStatus('online', `星空已连接 · ${messages.length} 条祝福`);
    } catch {
      if (!offlineMode) {
        setStatus('offline', '连接中断 · 正在重试…');
      }
    } finally {
      polling = false;
    }
  }

  async function boot() {
    measureLanes();

    if (window.location.protocol === 'file:') {
      enterOfflineMode('本地预览 · 留言只存本机');
      return;
    }

    try {
      const data = await fetchWishes();
      offlineMode = false;
      mergeMessages(data, { initial: true });
      setStatus('online', `星空已连接 · ${messages.length} 条祝福`);
      window.setInterval(pollMessages, 12000);
    } catch {
      enterOfflineMode('离线预览 · 留言只存本机');
      window.setInterval(pollMessages, 12000);
    }
  }

  /* -------------------------------- 交互逻辑 ------------------------------- */

  function setSending(value) {
    sending = value;
    sendBtn.disabled = value;
    sendBtn.classList.toggle('is-sending', value);
    sendLabel.textContent = value ? '发送中…' : '送出祝福';
  }

  async function submitWish(event) {
    event.preventDefault();
    if (sending) return;

    const name = limitText(nameInput.value, 16) || '匿名旅人';
    const text = limitText(wishText.value, 80);

    if (!text) {
      showToast('先写一句祝福再送出吧。', 'error');
      wishText.focus();
      return;
    }

    if (offlineMode) {
      const wish = {
        id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        text,
        ts: Date.now()
      };
      mergeMessages([wish]);
      saveLocalWish(wish);
      if (name !== '匿名旅人') saveGuestName(name);
      wishText.value = '';
      showToast('已保存在本机 · 当前是预览模式');
      fireworks.cheer();
      return;
    }

    setSending(true);

    try {
      const wish = await createWish(name, text);

      mergeMessages([wish]);
      if (name !== '匿名旅人') saveGuestName(name);
      wishText.value = '';
      showToast('祝福已送达，正在夜空中滚动 ✦');
      fireworks.cheer();
      setStatus('online', `星空已连接 · ${messages.length} 条祝福`);
    } catch (error) {
      const message =
        error && error.name === 'AbortError'
          ? '网络有点慢，祝福没有送出，请再试一次。'
          : error.message || '祝福没有送出，请稍后再试。';
      showToast(message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function sendQuickWish() {
    if (quickSending || !quickWishBtn) return;

    const name = limitText(nameInput.value, 16) || '匿名旅人';
    quickSending = true;
    quickWishBtn.disabled = true;

    try {
      if (offlineMode) {
        const wish = {
          id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          text: '生日快乐！',
          ts: Date.now()
        };
        mergeMessages([wish]);
        saveLocalWish(wish);
        if (name !== '匿名旅人') saveGuestName(name);
        showToast('生日快乐！已保存在本机');
        fireworks.cheer();
        return;
      }

      const wish = await createWish(name, '生日快乐！');
      mergeMessages([wish]);
      if (name !== '匿名旅人') saveGuestName(name);
      showToast('生日快乐！已送达 ✦');
      fireworks.cheer();
      setStatus('online', `星空已连接 · ${messages.length} 条祝福`);
    } catch (error) {
      const message =
        error && error.name === 'AbortError'
          ? '网络有点慢，生日快乐没有送出，请再试一次。'
          : error.message || '生日快乐没有送出，请稍后再试。';
      showToast(message, 'error');
    } finally {
      quickSending = false;
      quickWishBtn.disabled = false;
    }
  }

  function openWall() {
    renderWall();
    document.body.classList.add('modal-open');
    if (typeof wallDialog.showModal === 'function') {
      if (!wallDialog.open) wallDialog.showModal();
    } else {
      wallDialog.setAttribute('open', '');
    }
  }

  function closeWall() {
    if (typeof wallDialog.close === 'function' && wallDialog.open) {
      wallDialog.close();
    } else {
      wallDialog.removeAttribute('open');
    }
    document.body.classList.remove('modal-open');
  }

  function celebrate() {
    fireworks.finale();
    const now = Date.now();
    if (now - lastBoomAt > 5000) {
      lastBoomAt = now;
      showToast('看，今晚的烟花为你点亮 ✦');
    }
  }

  /* --------------------------------- 启动 ---------------------------------- */

  function bindEvents() {
    document.title = `生日贺卡 · ${NAME}`;
    $('birthdayName').textContent = NAME;
    $('birthdayName').classList.toggle('long', Array.from(NAME).length > 6);
    $('subtitleText').textContent = SUBTITLE;

    try {
      const savedName = localStorage.getItem(GUEST_NAME_KEY);
      if (savedName) nameInput.value = limitText(savedName, 16);
    } catch {
      /* 忽略 */
    }

    wishForm.addEventListener('submit', submitWish);
    if (quickWishBtn) quickWishBtn.addEventListener('click', sendQuickWish);

    if (musicBtn) musicBtn.addEventListener('click', toggleMusic);
    if (musicHint) musicHint.addEventListener('click', () => startMusic(true));
    if (bgMusic) {
      bgMusic.addEventListener('play', () => {
        musicPlaying = true;
        setMusicUI();
      });
      bgMusic.addEventListener('pause', () => {
        musicPlaying = false;
        setMusicUI();
      });
    }

    $('writeBtn').addEventListener('click', () => {
      if (!nameInput.value.trim()) {
        nameInput.focus();
      } else {
        wishText.focus();
      }
    });

    $('soundBtn').addEventListener('click', () => {
      if (!soundOn) {
        const context = ensureAudio();
        if (!context) {
          showToast('这个浏览器不支持声音，烟花依然好看。', 'error');
          return;
        }
        soundOn = true;
        playChime();
      } else {
        soundOn = false;
      }

      const button = $('soundBtn');
      button.classList.toggle('is-on', soundOn);
      button.setAttribute('aria-pressed', String(soundOn));
      button.setAttribute('aria-label', soundOn ? '关闭声音' : '开启声音');
      button.title = soundOn ? '关闭声音' : '开启声音';
    });

    ['boomBtn', 'heroBoomBtn'].forEach((id) => {
      $(id).addEventListener('click', celebrate);
    });

    $('wallBtn').addEventListener('click', openWall);
    $('closeWall').addEventListener('click', closeWall);

    wallDialog.addEventListener('click', (event) => {
      if (event.target === wallDialog) closeWall();
    });

    wallDialog.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
    });

    let resizeTimer = 0;
    window.addEventListener(
      'resize',
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(measureLanes, 140);
      },
      { passive: true }
    );

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (measureQueued) return;
        measureQueued = true;
        window.requestAnimationFrame(() => {
          measureQueued = false;
          measureLanes();
        });
      });
      observer.observe(composer);
    }

    window.addEventListener('online', () => {
      if (offlineMode) pollMessages();
    });
  }

  bindEvents();
  initBackgroundMusic();
  initStars();
  initMoon();
  drawPixelTitle();
  fireworks = createFireworks();
  fireworks.start();
  boot();
})();
