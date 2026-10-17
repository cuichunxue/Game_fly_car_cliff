/* ============================================================
 * Cliff Roadster — game core
 * 道路を走り、絶壁を垂直に駆け上がり、頂から空へ跳ぶ。
 * physics (road / climb / air), input, camera, journey HUD, flow
 * ============================================================ */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const W = TR.World, Md = TR.Models, FX = TR.FX, AU = TR.Audio;
const CH = W.CHAPTERS, ALT = W.ALT, TOP = ALT[ALT.length - 1];

/* ---------- tuning ---------- */
const DIFF = {
  easy:   { key: 'easy',   label: 'かんたん',   vk: .9,   drain: 20, recharge: 28, lives: 5, gapK: .85, obst: .7,  wallDrain: 8,  grip: .7 },
  normal: { key: 'normal', label: 'ふつう',     vk: 1,    drain: 25, recharge: 22, lives: 4, gapK: 1,   obst: 1,   wallDrain: 10, grip: .62 },
  hard:   { key: 'hard',   label: 'むずかしい', vk: 1.08, drain: 30, recharge: 17, lives: 3, gapK: 1.15, obst: 1.25, wallDrain: 14, grip: .56 },
};
// arcade physics (not a real-world simulation)
const PH = { G: 22, JUMP: 9.6, THRUST: 36, CUSHION: 18, VYMAX: 10.5, CEIL0: 8, CEIL1: 13, JUMP_COST: 4, BOOST: 1.38, BOOST_DRAIN: 24,
  LAT: 12.5, CAR_HW: .95, CAR_HL: 2.25, CRASH_V: 21.5, PERFECT_V: 7.5, HARD_V: 13.5, COYOTE: .16,
  WALL_THR: .8, WALL_BOOST: .4, VMAX_W: 41, STALL_V: 2.5, WARN_V: 11, PAD_KICK: 11, ICE: .3 };
const QUAL = {
  high: { dpr: 2,   shadow: 2048, bloom: true,  bloomScale: 1,  msaa: true },
  mid:  { dpr: 1.5, shadow: 1024, bloom: true,  bloomScale: .6, msaa: false },
  low:  { dpr: 1,   shadow: 0,    bloom: false, bloomScale: .5, msaa: false },
};
const WEATHER = [1, 0, 1, 0, 2, 2, 1];
const isTouch = () => matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

/* ---------- settings & progress ---------- */
function load(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v ? Object.assign({}, d, v) : d; } catch(e){ return d; } }
function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
const settings = load('cr_settings', { music: .6, sfx: .8, quality: 'auto', guide: true, motion: matchMedia('(prefers-reduced-motion: reduce)').matches, paint: 'sunset' });
if (!TR.Tex.PAINTS[settings.paint]) settings.paint = 'sunset';
const progress = load('cr_progress', { unlocked: 0, stars: CH.map(() => [false, false, false]), cleared: 0, bestTime: 0 });
if (!Array.isArray(progress.stars) || progress.stars.length !== CH.length) progress.stars = CH.map(() => [false, false, false]);
const bestOf = d => { try { return +(localStorage.getItem('cr_best_' + d) || 0); } catch(e){ return 0; } };
const setBest = (d, v) => { try { localStorage.setItem('cr_best_' + d, String(v)); } catch(e){} };

/* ---------- renderer ---------- */
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }); }
catch(e){ $('loading').innerHTML = '<div class="card" style="margin:auto"><h2>3D画面を開けませんでした</h2><p class="lead">WebGL対応の最新のChrome / Safari / Edgeで開いてください。</p><button class="go" onclick="location.reload()"><span>再読み込み</span></button></div>'; return; }
TR.renderer = renderer;
renderer.outputEncoding = THREE.LinearEncoding; renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, 1, .25, 3200);
scene.add(camera);

let qualityKey = settings.quality === 'auto' ? (isTouch() ? 'mid' : 'high') : settings.quality;
let Q = QUAL[qualityKey];

/* ---------- post-processing ---------- */
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, vignette: { value: .55 }, grain: { value: .035 }, time: { value: 0 }, aberr: { value: 0 }, blur: { value: 0 }, sat: { value: 1.08 }, res: { value: new THREE.Vector2(1, 1) }, tint: { value: new THREE.Color(0, 0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, vignette, grain, time, aberr, blur, sat; uniform vec2 res; uniform vec3 tint;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
    void main(){
      vec2 dc = vUv - .5; vec3 col;
      if (blur > .002){ vec3 acc = vec3(0.); for (int i = 0; i < 7; i++){ float s = 1. - blur*float(i)*.012; acc += texture2D(tDiffuse, .5 + dc*s).rgb; } col = acc/7.; }
      else col = texture2D(tDiffuse, vUv).rgb;
      if (aberr > .001){ float a = aberr*.006*length(dc)*2.; col.r = texture2D(tDiffuse, vUv + dc*a).r; col.b = texture2D(tDiffuse, vUv - dc*a).b; }
      col = col*exposure + tint;
      col = aces(col);
      float l = dot(col, vec3(.2126,.7152,.0722)); col = mix(vec3(l), col, sat);
      float v = smoothstep(.95, .25, length(dc*vec2(1., .82))); col *= mix(1., v, vignette);
      col = srgb(col);
      col += (fract(sin(dot(vUv*res + time*61.7, vec2(12.9898,78.233)))*43758.5453) - .5)*grain;
      gl_FragColor = vec4(col, 1.);
    }`
};
let composer, bloom, finalPass;
function buildComposer(){
  if (composer){ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const pr = renderer.getPixelRatio(), w = innerWidth, h = innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, stencilBuffer: true, samples: (renderer.capabilities.isWebGL2 && Q.msaa) ? 4 : 0 });
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), .65, .5, 1.0);
  bloom.enabled = Q.bloom; composer.addPass(bloom);
  finalPass = new THREE.ShaderPass(FinalShader); composer.addPass(finalPass);
}
function applyQuality(){
  Q = QUAL[qualityKey];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  W.setShadowSize(Q.shadow);
  buildComposer(); resize();
}
let baseFov = 64;
function resize(){
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  renderer.setSize(w, h, false);
  if (composer){ composer.setPixelRatio(pr); composer.setSize(w, h); bloom.setSize(w * pr * Q.bloomScale, h * pr * Q.bloomScale); finalPass.uniforms.res.value.set(w * pr, h * pr); }
  camera.aspect = w / h; baseFov = camera.aspect < 1 ? 80 : camera.aspect < 1.4 ? 70 : 63; camera.updateProjectionMatrix();
  FX.setPointScale(h * pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
addEventListener('resize', resize);

/* ---------- state ---------- */
const S = {
  mode: 'loading', diffKey: 'normal', diff: DIFF.normal, players: 1, cur: 0, results: [], startCh: 0,
  on: 'road', x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: 0, air: 100, grounded: true, lives: 3, refBase: 0, coyote: 0,
  climb: null, u: 0, v: 0, th: 0, pitch: 0, detached: false, fallT: 0,
  score: 0, dist: 0, rings: 0, perfects: 0, rolls: 0, nearMiss: 0, maxAir: 0, airTime: 0, combo: 0, comboT: 0, maxMult: 1,
  crashT: 0, invuln: 0, countdown: 0, lastG: 1, roll: 0, rollDir: 0, rolling: false, steerHold: 0, flightRings: 0,
  fold: 0, thrustNow: 0, boostNow: false, chapter: 0, hints: {}, lastReason: '', shake: 0, slowmo: 0, timeScale: 1, scrapeT: 0,
};
const input = { kL: false, kR: false, kT: false, kB: false, tSteer: 0, tT: false, tB: false, pSteer: 0, pT: false, pB: false, steer: 0, thrust: false, boost: false, prevThrust: false };

let car;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), tmpC = {};
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);
const motionDir = new THREE.Vector3(0, 0, 1), prevC = new THREE.Vector3(), curC = new THREE.Vector3();

/* ---------- boot sequence ---------- */
function setLoad(p, txt){ $('loadFill').style.width = (p * 100) + '%'; if (txt) $('loadTxt').textContent = txt; }
const bootSteps = [
  ['道路と空を描いています…', () => { TR.Tex.road(); TR.Tex.concrete(); TR.Tex.hazard(); TR.Tex.chevron(); TR.Tex.boostPad(); }],
  ['ボディを塗装しています…', () => { TR.Tex.livery(settings.paint); TR.Tex.tire(); TR.Tex.carbon(); }],
  ['摩天楼を建てています…', () => { for (let i = 0; i < 4; i++) TR.Tex.facade(i); for (let i = 0; i < 6; i++) TR.Tex.billboard(i); TR.Tex.cityGround(); }],
  ['絶壁を削り出しています…', () => { TR.Tex.sand(); TR.Tex.rockStrata(); TR.Tex.snow(); TR.Tex.ice(); for (let i = 0; i < 4; i++) TR.Tex.container(i); }],
  ['雲海と光を灯しています…', () => { W.init(scene, renderer); FX.init(scene); applyQuality(); }],
  ['ロードスターを組み立てています…', () => { car = Md.playerCar(settings.paint); scene.add(car); }],
  ['旅の地図を広げています…', () => { W.runwayOnly(S.diff, S.startCh); }],
  ['シェーダーを準備しています…', () => { camera.position.set(6, 2.4, 6); camera.lookAt(0, 1, 0); renderer.compile(scene, camera); }],
];
let bootI = 0;
function boot(){
  if (bootI < bootSteps.length){
    const [txt, fn] = bootSteps[bootI]; setLoad(bootI / bootSteps.length, txt);
    setTimeout(() => { try { fn(); } catch(e){ console.error(e); } bootI++; boot(); }, 16);
    return;
  }
  setLoad(1, 'READY');
  buildTitleUI(); goTitle();
  setTimeout(() => $('loading').classList.add('done'), 120);
  setTimeout(() => $('loading').remove(), 900);
  requestAnimationFrame(frame);
}

/* ---------- journey map (SVG) ---------- */
const NODES = [[46, 196], [112, 166], [176, 136], [236, 104], [290, 72], [334, 44], [372, 16]];
function journeySVG(opts = {}){
  const reached = opts.reached === undefined ? -1 : opts.reached;     // highest chapter index reached in this run
  const sel = opts.selected, unlocked = opts.unlocked === undefined ? progress.unlocked : opts.unlocked;
  const stars = progress.stars;
  let h = '<svg viewBox="0 0 400 228" class="jsvg" role="img" aria-label="ジャーニーマップ">';
  h += '<defs><linearGradient id="jm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f6a"/><stop offset="1" stop-color="#120a26"/></linearGradient>' +
       '<linearGradient id="jr" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffb23f"/><stop offset=".5" stop-color="#ff4f8b"/><stop offset="1" stop-color="#7cffe6"/></linearGradient>' +
       '<filter id="jg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  // mountain silhouette + cloud band
  h += '<path d="M0 228 L0 206 L40 196 L70 184 L100 170 L130 160 L160 140 L190 132 L222 106 L250 98 L280 74 L310 62 L338 40 L360 26 L372 10 L384 24 L400 30 L400 228 Z" fill="url(#jm)" opacity=".95"/>';
  h += '<path d="M0 214 L24 210 L60 202 L92 186 L118 182" fill="none" stroke="rgba(255,255,255,.12)"/>';
  h += '<rect x="0" y="92" width="400" height="16" fill="rgba(255,255,255,.08)"/><text x="6" y="103" class="jcloud">雲海 400m</text>';
  // route
  const pts = NODES.map(p => p.join(',')).join(' ');
  h += '<polyline points="' + pts + '" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2" stroke-dasharray="4 5"/>';
  const upto = Math.max(reached, -1);
  if (upto >= 0){ const p2 = NODES.slice(0, Math.min(NODES.length, upto + 1)).map(p => p.join(',')).join(' '); h += '<polyline points="' + p2 + '" fill="none" stroke="url(#jr)" stroke-width="3.2" stroke-linecap="round" filter="url(#jg)"/>'; }
  NODES.forEach((p, i) => {
    const goal = i === CH.length, open = goal ? progress.cleared > 0 : i <= unlocked, here = i === sel, done = i <= reached - 1 || (goal && reached >= CH.length);
    const cls = 'jnode' + (open ? ' open' : '') + (here ? ' sel' : '') + (done ? ' done' : '') + (goal ? ' goal' : '');
    h += '<g class="' + cls + '"' + (goal ? '' : ' data-ch="' + i + '"') + ' transform="translate(' + p[0] + ' ' + p[1] + ')">';
    if (goal){ h += '<path d="M0 -2 L0 -18 L12 -14 L0 -10" fill="' + (open ? '#ffd27a' : 'rgba(255,255,255,.35)') + '" stroke="#ffd27a" stroke-width="1.4"/><circle r="5"/><text class="jalt" x="-10" y="16">1000m</text>'; }
    else {
      h += '<circle r="13" class="hit"/><circle r="8.5"/><text class="jnum" y="3.5">' + (i + 1) + '</text>';
      const lx = i < 4 ? 13 : -13, anchor = i < 4 ? 'start' : 'end';
      h += '<text class="jname" x="' + lx + '" y="-5" text-anchor="' + anchor + '">' + CH[i].jp + '</text>';
      const st = stars[i] || [];
      h += '<text class="jstar" x="' + lx + '" y="8" text-anchor="' + anchor + '">' + [0, 1, 2].map(k => st[k] ? '★' : '☆').join('') + ' <tspan class="jalt">' + ALT[i] + 'm</tspan></text>';
    }
    h += '</g>';
  });
  if (opts.marker !== undefined){
    const i = clamp(opts.marker, 0, NODES.length - 1); const p = NODES[Math.floor(i)], q = NODES[Math.min(NODES.length - 1, Math.floor(i) + 1)], f = i - Math.floor(i);
    h += '<g class="jcar" transform="translate(' + lerp(p[0], q[0], f) + ' ' + lerp(p[1], q[1], f) + ')"><circle r="5.5"/></g>';
  }
  return h + '</svg>';
}
function renderTitleMap(){
  const box = $('jmap'); box.innerHTML = journeySVG({ selected: S.startCh, reached: progress.unlocked });
  $('startBtn').querySelector('span').textContent = S.startCh === 0 ? '麓から、発進' : 'CHAPTER ' + (S.startCh + 1) + ' から発進';
  $('chapInfo').innerHTML = '<b>CHAPTER ' + (S.startCh + 1) + '</b> ' + CH[S.startCh].jp + ' — ' + CH[S.startCh].goal +
    (progress.unlocked < CH.length - 1 ? '<br><small>頂を越えるたびに、次のチャプターから挑めるようになります。</small>' : '');
}

/* ---------- title UI ---------- */
function buildTitleUI(){
  const ps = $('paintSeg'); ps.innerHTML = '';
  const nameEl = document.createElement('span'); nameEl.className = 'pname';
  Object.entries(TR.Tex.PAINTS).forEach(([k, p]) => {
    const b = document.createElement('button'); b.dataset.v = k; b.setAttribute('aria-label', p.name);
    b.style.background = `linear-gradient(135deg, ${p.base} 55%, ${p.accent} 55%)`;
    b.setAttribute('aria-pressed', k === settings.paint ? 'true' : 'false');
    ps.appendChild(b);
  });
  ps.appendChild(nameEl); nameEl.textContent = TR.Tex.PAINTS[settings.paint].name;
  ps.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ps.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    settings.paint = b.dataset.v; nameEl.textContent = TR.Tex.PAINTS[b.dataset.v].name; save('cr_settings', settings);
    Md.setPaint(car, settings.paint); AU.init(); AU.sfx('select'); titleSpin = 1.2;
  });
  $('jmap').addEventListener('click', e => {
    const n = e.target.closest('[data-ch]'); if (!n) return;
    const k = +n.dataset.ch;
    AU.init();
    if (k > progress.unlocked){ AU.sfx('empty'); $('chapInfo').innerHTML = '<b>LOCKED</b> CHAPTER ' + k + ' の頂を越えると挑戦できます。'; return; }
    S.startCh = k; AU.sfx('select'); W.runwayOnly(S.diff, k); AU.setZone(k); renderTitleMap(); titleSpin = 1;
  });
  segGroup('modeSeg', v => { S.players = +v; });
  segGroup('diffSeg', v => { S.diffKey = v; S.diff = DIFF[v]; showBest(); });
  segGroup('qualSeg', v => { settings.quality = v; save('cr_settings', settings); qualityKey = v === 'auto' ? (isTouch() ? 'mid' : 'high') : v; applyQuality(); }, settings.quality);
  $('musicVol').value = Math.round(settings.music * 100); $('sfxVol').value = Math.round(settings.sfx * 100);
  $('guideChk').checked = settings.guide; $('motionChk').checked = settings.motion;
  $('musicVol').oninput = e => { settings.music = e.target.value / 100; AU.setMusicVol(settings.music); save('cr_settings', settings); };
  $('sfxVol').oninput = e => { settings.sfx = e.target.value / 100; AU.setSfxVol(settings.sfx); save('cr_settings', settings); };
  $('guideChk').onchange = e => { settings.guide = e.target.checked; save('cr_settings', settings); };
  $('motionChk').onchange = e => { settings.motion = e.target.checked; save('cr_settings', settings); };
  AU.setMusicVol(settings.music); AU.setSfxVol(settings.sfx);
  if (isTouch()) $('howto').open = false;
  // altitude track ticks
  $('altTicks').innerHTML = ALT.map((a, i) => '<i style="bottom:' + (a / TOP * 100) + '%"><span>' + (i < CH.length ? (i + 1) : '頂') + '</span></i>').join('');
}
function segGroup(id, cb, initial){
  const box = $(id);
  if (initial) box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === initial ? 'true' : 'false'));
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    cb(b.dataset.v); AU.init(); AU.sfx('click');
  });
}
function fmtTime(t){ const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
function showBest(){
  const b = bestOf(S.diffKey);
  $('bestLine').textContent = (b ? 'BEST（' + DIFF[S.diffKey].label + '）  ' + b.toLocaleString() : '') + (progress.bestTime ? '   登頂タイム ' + fmtTime(progress.bestTime) : '');
}

/* ---------- screens ---------- */
function showScreen(id){ ['title', 'pause', 'result'].forEach(s => $(s).hidden = s !== id); }
let titleT = 0, titleSpin = 0;
function goTitle(){
  S.mode = 'title'; W.runwayOnly(S.diff, S.startCh); FX.clear(); FX.setWeather(WEATHER[S.startCh]);
  $('hud').hidden = true; $('touch').hidden = true; document.body.classList.remove('touch-on'); $('jbanner').classList.remove('on');
  showScreen('title'); showBest(); renderTitleMap();
  Object.assign(S, { on: 'road', x: 0, y: W.ALT[S.startCh], z: 0, vx: 0, vy: 0, speed: 0, grounded: true, fold: 0, roll: 0, rolling: false, pitch: 0, detached: false });
  car.visible = true; car.position.set(0, S.y, 0); car.rotation.set(0, 0, 0); car.userData.inner.rotation.set(0, 0, 0);
  AU.setMode('title'); AU.setZone(S.startCh); AU.setClimb(-1);
  setTimeout(() => $('startBtn').focus({ preventScroll: true }), 60);
}

function startRun(fromCh = S.startCh){
  S.startCh = fromCh;
  W.reset(S.diff, fromCh); FX.clear();
  const base = ALT[fromCh];
  Object.assign(S, {
    on: 'road', x: 0, y: base, z: 0, vx: 0, vy: 0, speed: 0, air: 100, grounded: true, lives: S.diff.lives, refBase: base, coyote: 0,
    climb: null, u: 0, v: 0, th: 0, pitch: 0, detached: false, fallT: 0,
    score: 0, dist: 0, rings: 0, perfects: 0, rolls: 0, nearMiss: 0, maxAir: 0, airTime: 0, combo: 0, comboT: 0, maxMult: 1,
    crashT: 0, invuln: 0, lastG: 1, roll: 0, rollDir: 0, rolling: false, steerHold: 0, flightRings: 0, fold: 0, thrustNow: 0, boostNow: false,
    chapter: fromCh, hints: S.hints || {}, lastReason: '', shake: 0, slowmo: 0, timeScale: 1, scrapeT: 0, bigAirs: 0, lastSlope: 0, emptyWarned: false, predKind: -1,
    time: 0, maxAlt: base, summits: 0, catches: 0, dodges: 0, climbed: 0, chCrash: CH.map(() => 0), pendingStar: -1, summitT: 0, stall: 0, heartT: 0,
    cloudDone: base > W.CLOUD_Y, goal: false, goalT: 0, fwT: 0, onIce: false, iceWarned: false, rockWarnT: 0, rockWarnLane: 0, crashOnClimb: false, reachedCh: fromCh,
  });
  S.hints = runs ? S.hints : {};
  S.countdown = runs++ ? 2.0 : 3.2; S.lightStep = -1;
  W.ensure(0); FX.setWeather(WEATHER[fromCh]);
  car.visible = true; car.position.set(0, base, 0); car.rotation.set(0, 0, 0); car.userData.inner.rotation.set(0, 0, 0);
  camOff.set(0, 3.2, -10); camTh = 0;
  prevC.set(0, base + .55, 0);
  input.kL = input.kR = input.kT = input.kB = input.tT = input.tB = false; input.tSteer = 0;
  lifeIcons();
  const tag = $('ptag'); if (S.players > 1){ tag.hidden = false; tag.textContent = 'PLAYER ' + (S.cur + 1); } else tag.hidden = true;
  showScreen(null); $('hud').hidden = false; $('jbanner').classList.remove('on');
  const touch = isTouch(); $('touch').hidden = !touch; document.body.classList.toggle('touch-on', touch);
  $('hint').classList.remove('on'); $('toast').classList.remove('on'); $('radar').className = 'radar';
  $('lights').hidden = false; $('lights').querySelectorAll('i').forEach(i => i.classList.remove('on'));
  S.mode = 'play';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  AU.setMode('play'); AU.zoneNow(fromCh); AU.setTempoBoost(0); AU.setClimb(-1);
  setTimeout(() => showJourney(fromCh, fromCh, 2.6), 200);
}
let runs = 0;

function lifeIcons(){ const el = $('lives'); el.innerHTML = ''; for (let i = 0; i < S.diff.lives; i++){ const b = document.createElement('i'); if (i >= S.lives) b.className = 'off'; el.appendChild(b); } }

/* ---------- messaging ---------- */
let toastT = 0, toastPri = 0, hintT = 0, bannerT = 0;
function toast(big, small = '', dur = 1.2, cls = '', pri = 1){
  if (toastT > .3 && pri < toastPri) return;
  toastPri = pri; toastT = dur;
  const t = $('toast'); $('toastBig').textContent = big; $('toastSmall').textContent = small;
  t.className = 'toast ' + cls; t.style.setProperty('--d', dur + 's'); void t.offsetWidth; t.classList.add('on');
}
function hint(html, dur = 3.5){ const h = $('hint'); h.innerHTML = html; h.classList.add('on'); hintT = dur; }
function once(k, fn){ if (!S.hints[k]){ S.hints[k] = 1; fn(); } }
function flash(strength = .7, white = false){ if (settings.motion) return; const f = $('flash'); f.classList.toggle('white', white); f.style.transition = 'none'; f.style.opacity = strength; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .8s'; f.style.opacity = 0; })); }
function pulse(){ if (settings.motion) return; const p = $('pulse'); p.style.transition = 'none'; p.style.opacity = .5; requestAnimationFrame(() => { p.style.transition = 'opacity .5s'; p.style.opacity = 0; }); }
function vibrate(p){ try { if (navigator.vibrate) navigator.vibrate(p); } catch(e){} }
function popup(text, cls = ''){
  tmpV.set(S.x, S.y + 2.2, S.z).project(camera);
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = ((tmpV.x * .5 + .5) * innerWidth + rand(-30, 30)) + 'px'; el.style.top = clamp((-tmpV.y * .5 + .5) * innerHeight, 60, innerHeight - 160) + 'px';
  $('popups').appendChild(el); setTimeout(() => el.remove(), 1000);
}
function mult(){ return Math.min(4, 1 + S.combo * .15); }
function addScore(base, label, cls){
  const m = mult(); const pts = Math.round(base * m); S.score += pts;
  if (label) popup('+' + pts + (m > 1 ? '  ×' + m.toFixed(1) : ''), cls);
  const sc = $('score'); sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
  return pts;
}
function comboUp(){ S.combo++; S.comboT = 6; S.maxMult = Math.max(S.maxMult, mult()); if (S.combo > 1) AU.sfx('combo', S.combo); }
function comboBreak(){ if (S.combo >= 3) toast('COMBO END', '×' + mult().toFixed(1) + ' で終了', .9, '', 0); S.combo = 0; S.comboT = 0; }
// journey banner: the map slides in and the car marker travels to the next node
function showJourney(fromCh, toCh, dur = 3.2){
  const b = $('jbanner');
  $('jbTitle').innerHTML = toCh >= CH.length ? '<b>SUMMIT</b> 星の頂 · 標高1000m' : '<b>CHAPTER ' + (toCh + 1) + '</b> ' + CH[toCh].jp + '<small>' + CH[toCh].name + ' · 標高 ' + ALT[toCh] + 'm → ' + ALT[toCh + 1] + 'm</small>';
  $('jbMap').innerHTML = journeySVG({ reached: toCh, marker: fromCh, unlocked: Math.max(progress.unlocked, toCh) });
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); bannerT = dur;
  const m = b.querySelector('.jcar');
  if (m && fromCh !== toCh){
    const p = NODES[fromCh], q = NODES[Math.min(NODES.length - 1, toCh)]; const t0 = performance.now();
    const anim = now => { const k = smooth(0, 1, (now - t0) / 1400 - .25); m.setAttribute('transform', 'translate(' + lerp(p[0], q[0], k) + ' ' + lerp(p[1], q[1], k) + ')'); if (k < 1) requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
  }
}

/* ---------- crash / respawn / end ---------- */
function crash(reason, force = false){
  if (S.crashT > 0 || (S.invuln > 0 && !S.detached && !force)) return;
  S.crashOnClimb = S.on === 'climb' || S.detached;
  S.lastReason = reason; S.lives--; lifeIcons(); S.chCrash[Math.min(S.chapter, CH.length - 1)]++;
  S.crashT = 1.9; S.shake = 1.4; S.slowmo = .7; comboBreak();
  AU.sfx('crash'); AU.setClimb(-1); flash(.85); vibrate([80, 50, 160]);
  FX.explosion(S.x, S.y, S.z, S.on === 'climb' ? 0 : S.speed, TR.Tex.PAINTS[settings.paint].base);
  car.visible = false; S.stall = 0;
  toast(reason, S.lives > 0 ? 'のこり ' + S.lives + ' 台' : 'ラストマシン大破…', 1.6, 'warn', 3);
}
function resetClimbHazards(c){
  if (!c || c.type !== 'climb') return;
  for (const r of c.rocks){ c.group.remove(r.mesh); }
  c.rocks.length = 0; c.rockTrig.forEach(t => t.fired = false); c.wpads.forEach(p => p.used = false);
  c.blockers.forEach(b => b.passed = false);
}
function respawn(){
  const nc = S.crashOnClimb && S.climb ? S.climb : W.nextClimb(S.z);
  const ru = nc ? W.runupFor(nc) : null;
  let z = S.z + 8, found = false;
  if (S.crashOnClimb && ru){ z = ru.z0 + 12; found = true; }
  else {
    for (const s of W.segs){
      if (s.type !== 'flat' || s.z1 < z + 20) continue;
      for (let zz = Math.max(s.z0 + 4, z); zz < s.z1 - 16; zz += 4){
        if (s.obst.every(o => Math.abs(o.z - zz) > 22)){ z = zz; found = true; break; }
      }
      if (found) break;
    }
    if (ru && (!found || z > ru.z0 + 12) && S.z < nc.z0) z = ru.z0 + 12;
  }
  resetClimbHazards(nc);
  const f = W.floorAt(z, 0);
  Object.assign(S, { on: 'road', climb: null, detached: false, z, x: 0, y: f ? f.h : W.baseAt(z), vy: 0, vx: 0, grounded: true, fold: 0, roll: 0, rolling: false, pitch: 0, th: 0, stall: 0 });
  S.refBase = S.y; S.air = Math.max(S.air, 75); S.invuln = 2.4; S.speed = W.speedAt(z) * .8;
  camOff.set(0, 3.2, -10); camTh = 0; prevC.set(S.x, S.y + .55, S.z);
  car.visible = true; hint(S.crashOnClimb ? '<b>リトライ</b> — 助走路から、もう一度。ブーストパッドで加速しよう' : '<b>リスタート</b> — 少しの間は無敵です', 2.4);
}
function endRun(victory = false){
  S.mode = 'result'; AU.setMode('off'); AU.setClimb(-1); setAudio(0, 0, false, true, false);
  $('hud').hidden = true; $('touch').hidden = true; FX.setGuide(false); $('jbanner').classList.remove('on');
  const total = Math.round(S.score), best = bestOf(S.diffKey), isBest = total > best;
  if (isBest){ setBest(S.diffKey, total); setTimeout(() => AU.sfx('fanfare'), 300); }
  if (victory){ progress.cleared++; if (S.startCh === 0 && (!progress.bestTime || S.time < progress.bestTime)) progress.bestTime = S.time; save('cr_progress', progress); }
  S.results[S.cur] = total;
  const r = S.lastReason;
  let tip = victory ? '標高1000m、登頂。次は全チャプター★3と、ノーミス登頂を狙おう。'
    : r.includes('グリップ') || r.includes('転落') ? '壁では速度が命。助走路のブーストパッドで加速し、壁では噴射を長押し。AIRセルとパッドで燃料をつなごう。'
    : r.includes('落石') ? '「▼落石」の警告が出たら、すぐに隣の車線へ。落石は上から一直線に落ちてくる。'
    : r.includes('岩棚') ? '壁の赤いランプは岩棚の目印。早めに車線を変えよう。'
    : r.includes('落下') ? '谷の手前で噴射を長押し。空中では着地点ガイドが緑になるまで噴射で調整しよう。'
    : r.includes('トラック') ? 'トラックの壁は、少し手前から長押しで高く跳ぶ。'
    : r.includes('車') ? '前方の車は早めに車線変更。すぐ横をすり抜けるとニアミスボーナス。'
    : '着地の直前に短く噴射すると衝撃が和らいでパーフェクト着地に。';
  if (best > 0 && !isBest) tip += ' 自己ベストまであと ' + (best - total + 1).toLocaleString() + ' 点。';
  $('debrief').textContent = tip;
  $('rmap').innerHTML = journeySVG({ reached: S.reachedCh, marker: clamp((S.maxAlt >= TOP ? CH.length : S.reachedCh), 0, CH.length) });
  const starsGot = progress.stars.reduce((a, s) => a + s.filter(Boolean).length, 0);
  const rows = [
    ['到達標高', Math.round(S.maxAlt).toLocaleString() + ' m'], ['制覇した絶壁', S.summits + ' / ' + (CH.length - S.startCh)],
    ['登った高さ', Math.round(S.climbed).toLocaleString() + ' m'], ['タイム', fmtTime(S.time)],
    ['リング', S.rings + ' 個'], ['パーフェクト着地', S.perfects + ' 回'], ['ウォールキャッチ', S.catches + ' 回'], ['落石・岩棚回避', S.dodges + ' 回'],
    ['ニアミス', S.nearMiss + ' 回'], ['最大コンボ倍率', '×' + S.maxMult.toFixed(1)], ['スター（累計）', '★ ' + starsGot + ' / ' + CH.length * 3],
  ];
  $('resStats').innerHTML = rows.map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('') +
    '<dt class="total">スコア</dt><dd class="total">' + total.toLocaleString() + '</dd>' +
    (isBest ? '<dt class="newbest">自己ベスト更新!</dt><dd class="newbest">' + S.diff.label + '</dd>' : '<dt>ベスト（' + S.diff.label + '）</dt><dd>' + best.toLocaleString() + '</dd>');
  const crashes = S.chCrash.reduce((a, b) => a + b, 0);
  const g = victory && crashes === 0 ? 'S' : victory ? 'A' : S.maxAlt >= 300 ? 'B' : 'C';
  const ge = $('grade'); ge.textContent = g; ge.className = 'grade ' + g; void ge.offsetWidth;
  const rank = $('rank'); rank.hidden = true;
  const retry = $('retryBtn');
  retry.hidden = S.reachedCh <= 0 || victory || S.players > 1;
  if (!retry.hidden){ retry.querySelector('span').textContent = 'CHAPTER ' + (S.reachedCh + 1) + ' から再挑戦'; retry.dataset.ch = S.reachedCh; }
  if (S.players > 1){
    const last = S.cur === S.players - 1;
    $('resEyebrow').textContent = 'PLAYER ' + (S.cur + 1) + ' RESULT';
    if (last){
      $('resTitle').textContent = '最終順位';
      const order = S.results.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
      rank.innerHTML = order.map((o, j) => '<li><span class="pos">' + (j + 1) + '</span><span>プレイヤー ' + (o.i + 1) + (j === 0 ? ' の勝ち!' : '') + '</span><span class="pts">' + o.s.toLocaleString() + '</span></li>').join('');
      rank.hidden = false; $('nextBtn').querySelector('span').textContent = 'もう一度みんなで'; AU.sfx('fanfare');
    } else {
      $('resTitle').textContent = '次はプレイヤー ' + (S.cur + 2) + ' の番!';
      $('nextBtn').querySelector('span').textContent = 'プレイヤー ' + (S.cur + 2) + ' 発進';
    }
  } else {
    $('resEyebrow').textContent = victory ? 'SUMMIT REACHED' : 'JOURNEY LOG';
    $('resTitle').textContent = victory ? (g === 'S' ? '伝説のクリフ・ドライバー' : '標高1000m、登頂!') : S.maxAlt >= 400 ? '雲の上まで、たどり着いた' : S.maxAlt >= 150 ? 'いい登りっぷり!' : 'まずは最初の絶壁へ';
    $('nextBtn').querySelector('span').textContent = S.startCh ? '同じチャプターから、もう一度' : 'もう一度、麓から';
  }
  $('result').classList.toggle('victory', victory);
  showScreen('result'); setTimeout(() => $('nextBtn').focus({ preventScroll: true }), 80);
}

/* ---------- chapter objectives (stars) ---------- */
function objectiveLine(){
  const k = Math.min(S.chapter, CH.length - 1), st = progress.stars[k];
  if (S.chapter >= CH.length) return '<b>FINALE</b>ゴールゲートをくぐれ';
  const nm = S.chCrash[k] === 0;
  return '<b>CH' + (k + 1) + ' ★</b>' + (st[0] ? '★' : '☆') + '頂上へ ' + ((st[1] || nm) ? '★' : '☆') + 'ノーミス ' + (st[2] ? '★' : '☆') + '頂上ジャンプをパーフェクト着地';
}
function awardStars(k, perfect){
  const st = progress.stars[k], got = [true, S.chCrash[k] === 0, perfect];
  let newly = 0; got.forEach((g, i) => { if (g && !st[i]){ st[i] = true; newly++; } });
  progress.unlocked = Math.max(progress.unlocked, Math.min(CH.length - 1, k + 1));
  save('cr_progress', progress);
  return { got, newly };
}

/* ---------- landing prediction ---------- */
const predPts = Array.from({ length: 40 }, () => new THREE.Vector3()), predList = [];
const predLand = new THREE.Vector3();
function predict(){
  let x = S.x, y = S.y, z = S.z, vy = S.vy, vx = S.vx;
  const dt = 1 / 30, sp = S.speed; predList.length = 0;
  let kind = 2, land = null;
  for (let i = 0; i < 120; i++){
    const py = y;
    vy -= PH.G * dt; y += vy * dt; z += sp * dt; vx *= .9; x = clamp(x + vx * dt, -W.HALF_W + PH.CAR_HW, W.HALF_W - PH.CAR_HW);
    if (i % 2 === 0 && predList.length < 40) predList.push(predPts[predList.length].set(x, y + .4, z));
    const cc = W.climbContact(z, y);
    if (cc){ land = predLand.set(x, y, z); kind = sp * Math.cos(cc.th) + vy * Math.sin(cc.th) > 6 ? 0 : 2; break; }
    const f = W.floorAt(z, x);
    if (f && y <= f.h){
      land = predLand.set(x, f.h, z);
      if (py < f.h - .6) kind = 2; else { const imp = -vy; kind = imp > PH.CRASH_V ? 2 : imp > PH.HARD_V ? 1 : 0; }
      break;
    }
    if (y < S.refBase - 26) break;
  }
  if (!predList.length) predList.push(predPts[0].set(x, y, z));
  return { kind, land };
}

/* ---------- update ---------- */
const camOff = new THREE.Vector3(0, 3, -10);
let camTh = 0, radarState = '';
function setRadar(text, cls){
  const key = text + cls; if (key === radarState) return; radarState = key;
  const r = $('radar'); r.textContent = text; r.className = 'radar' + (text ? ' on ' + cls : '');
}
function surfaceN(th, out){ return out.set(0, Math.cos(th), -Math.sin(th)); }
function surfaceT(th, out){ return out.set(0, Math.sin(th), Math.cos(th)); }
// distance from point p to segment ab
function segDist(a, b, p){
  tmpV3.subVectors(b, a); const l2 = tmpV3.lengthSq();
  const t = l2 > 1e-6 ? clamp(tmpV2.subVectors(p, a).dot(tmpV3) / l2, 0, 1) : 0;
  return tmpV2.copy(a).addScaledVector(tmpV3, t).distanceTo(p);
}

function step(dt){
  const D = S.diff;
  W.update(dt, S.z);
  if (S.mode !== 'play') return;

  /* countdown with race lights */
  if (S.countdown > 0){
    S.countdown -= dt;
    const total = runs <= 1 ? 3.2 : 2.0;
    const stepIdx = Math.min(3, Math.floor((total - S.countdown) / ((total - .4) / 3)));
    if (stepIdx !== S.lightStep && S.countdown > 0){
      S.lightStep = stepIdx; const L = $('lights').querySelectorAll('i');
      if (stepIdx < 3){ L[stepIdx].classList.add('on'); AU.sfx('beep', 0); }
    }
    if (S.countdown <= 0){
      const L = $('lights').querySelectorAll('i'); L.forEach(i => i.classList.remove('on')); L[3].classList.add('on');
      AU.sfx('beep', 1); toast('GO!', CH[S.startCh].goal, 1, 'gold', 3);
      setTimeout(() => { $('lights').hidden = true; }, 600);
      once('start', () => hint(isTouch() ? '右下の<b>噴射</b>でジャンプ。左側を<b>左右にスライド</b>でハンドル。<b>目指すは標高1000mの頂</b>' : '<kbd>Space</kbd> でジャンプ・上昇、<kbd>←</kbd><kbd>→</kbd> でハンドル。<b>目指すは標高1000mの頂</b>', 4.5));
    }
    placeCar(dt); camFollow(dt); hud();
    setAudio(0, 0, false, true, true);
    return;
  }

  /* crashed: wait, then respawn */
  if (S.crashT > 0){
    S.crashT -= dt; if (S.on !== 'climb') S.speed *= Math.pow(.4, dt);
    if (S.crashT <= 0){ if (S.lives <= 0){ endRun(false); return; } respawn(); }
    camFollow(dt); hud(); FX.setGuide(false);
    setAudio(0, 0, false, true, false);
    return;
  }
  S.time += dt;
  if (S.invuln > 0) S.invuln -= dt;
  if (S.comboT > 0){ S.comboT -= dt; if (S.comboT <= 0) comboBreak(); }

  /* speed & boost */
  const boosting = input.boost && S.air > 0.5 && !S.detached;
  if (boosting) S.air = Math.max(0, S.air - PH.BOOST_DRAIN * dt);
  if (S.on !== 'climb'){
    const target = W.speedAt(S.z) * (boosting ? PH.BOOST : 1);
    if (S.on === 'road') S.speed = damp(S.speed, target, S.speed < target ? (boosting ? 2.6 : 1.2) : 1.0, dt);
    else if (S.speed > 0) S.speed = damp(S.speed, target, boosting ? 1.4 : .25, dt);  // airborne: momentum mostly carries
  }
  S.boostNow = boosting;

  /* steering (screen-right = -x) */
  const lat = PH.LAT + Math.abs(S.on === 'climb' ? S.v : S.speed) * .04;
  const tvx = -input.steer * lat;
  S.vx = damp(S.vx, tvx, S.on === 'climb' ? (S.onIce ? 3 : 11) : S.grounded ? 13 : 8, dt);
  S.x += S.vx * dt;
  const lim = W.HALF_W - PH.CAR_HW - .12;
  if (Math.abs(S.x) > lim){
    const side = Math.sign(S.x); S.x = side * lim;
    if (Math.abs(S.vx) > 3 && S.grounded){ S.scrapeT -= dt; if (S.scrapeT <= 0){ S.scrapeT = .07; AU.sfx('scrape', 0, { pan: -side * .8 }); FX.sparks(S.x + side * PH.CAR_HW, S.y + .4, S.z, S.speed * .6, 4, -side); } S.speed *= Math.pow(.92, dt); }
    S.vx = 0;
  }

  /* thrust */
  const pressed = input.thrust && !input.prevThrust;
  let thrust = 0;
  if (input.thrust && S.air > 0 && !S.detached){
    thrust = 1;
    if (S.on === 'climb') S.air = Math.max(0, S.air - D.wallDrain * dt);
    else if (!S.grounded) S.air = Math.max(0, S.air - D.drain * dt);
  }
  if (input.thrust && S.air <= 0 && !S.emptyWarned){ S.emptyWarned = true; AU.sfx('empty'); toast('AIR 切れ!', S.on === 'climb' ? 'AIRセルとブーストパッドを狙え!' : '地上を走るとコンプレッサーで回復', 1.2, 'warn', 2); }
  if (S.air > 25) S.emptyWarned = false;

  const prevY = S.y;
  if (S.on === 'climb') climbStep(dt, thrust, boosting);
  else roadAirStep(dt, thrust, pressed, boosting, prevY);
  if (S.mode !== 'play' || S.crashT > 0){ placeCar(dt); camFollow(dt); hud(); return; }
  S.maxAlt = Math.max(S.maxAlt, S.y);

  /* barrel roll: hold steer in the air */
  if (S.on === 'air' && !S.detached){
    if (!S.rolling && S.y - S.refBase > 3.2 && S.airTime > .3){
      if (Math.abs(input.steer) > .85){ S.steerHold += dt; if (S.steerHold > .2){ S.rolling = true; S.roll = 0; S.rollDir = Math.sign(input.steer); AU.sfx('roll'); } }
      else S.steerHold = 0;
    }
  }
  if (S.rolling){
    S.roll += dt * Math.PI * 2 / .62;
    if (S.roll >= Math.PI * 2){ S.rolling = false; S.roll = 0; S.rolls++; S.steerHold = -.4; comboUp(); addScore(300, true, 'cyan'); toast('バレルロール!', 'AERIAL TRICK', .9, 'gold', 1); }
  }

  /* pickups: swept sphere test along the car's path (works on roads and walls) */
  surfaceN(S.on === 'climb' ? S.th : 0, tmpV); curC.set(S.x, S.y + tmpV.y * .55, S.z + tmpV.z * .55);
  for (const s of W.segs){
    if (s.z1 < S.z - 24 || s.z0 > S.z + 24) continue;
    for (const r of s.rings){
      if (r.got) continue;
      tmpV.set(r.x, r.y, r.z);
      if (segDist(prevC, curC, tmpV) < 2.1){
        r.got = true; r.mesh.visible = false; S.rings++; S.flightRings = S.grounded && S.on !== 'climb' ? 1 : S.flightRings + 1;
        const chain = Math.min(S.flightRings, 11);
        addScore(100 + (chain - 1) * 50, true, chain > 2 ? 'cyan' : '');
        if (chain >= 3) comboUp();
        AU.sfx('ring', chain - 1, { pan: clamp(-(r.x - S.x) / 6, -.7, .7) });
        FX.ringBurst(r.x, r.y, r.z, S.on === 'climb' ? 0 : S.speed * .6, chain > 2); pulse();
        if (chain >= 3) toast('リング ×' + chain, '続けて取るほど高得点', .8, 'gold', 0);
      }
    }
    for (const c of s.cells){
      if (c.got) continue;
      tmpV.copy(c.mesh.position);
      if (segDist(prevC, curC, tmpV) < 2.0){
        c.got = true; c.mesh.visible = false; S.air = Math.min(100, S.air + 35); AU.sfx('cell'); FX.cellBurst(c.x, c.mesh.position.y, c.z, S.on === 'climb' ? 0 : S.speed * .6);
        addScore(50, true, 'cyan'); popup('AIR +35%', 'cyan');
      }
    }
    if (S.on === 'road' && S.grounded){
      for (const p of s.pads){
        if (!p.used && S.z >= p.z0 && S.z <= p.z1 && Math.abs(S.x - p.x) < 2){
          p.used = true; S.speed = Math.min(S.speed + PH.PAD_KICK, 58); AU.sfx('pad'); pulse(); popup('BOOST!', 'cyan'); S.shake = Math.max(S.shake, .25);
          for (let k = 0; k < 14; k++) FX.boostFlame(S.x + rand(-1, 1), S.y + .3, S.z - 2, -10);
          once('pad', () => hint('<b>ブーストパッド</b>で加速! 速いほど絶壁は楽に登れる', 2.8));
        }
      }
    }
    if (S.on !== 'climb'){
      for (const o of s.obst){
        const dz = Math.abs(S.z - o.z), reach = PH.CAR_HL + o.l / 2;
        if (dz < reach){
          const dx = Math.abs(S.x - o.x) - (PH.CAR_HW + o.w / 2);
          const above = S.y - (o.base + o.h);
          if (dx < 0 && above < -.1 && S.invuln <= 0){ crash(o.truck ? 'トラックに激突!' : '車に衝突!'); break; }
          const clear = dx >= 0 ? dx : (above >= -.1 ? above : 99);
          o.minClear = Math.min(o.minClear === undefined ? 99 : o.minClear, clear);
        } else if (!o.passed && S.z - o.z > reach){
          o.passed = true;
          if (o.minClear !== undefined && o.minClear < .85 && S.crashT <= 0){
            S.nearMiss++; comboUp(); addScore(120, true); AU.sfx('nearmiss', 0, { pan: clamp((o.x - S.x) * -.3, -.8, .8) });
            toast(o.truck && o.minClear >= 0 && S.y > o.base + o.h - .2 ? 'ギリギリ通過!' : 'ニアミス!', 'NEAR MISS', .7, '', 0); vibrate(20);
          }
        }
      }
    }
  }
  prevC.copy(curC);
  if (S.crashT > 0){ placeCar(dt); camFollow(dt); hud(); return; }

  /* tutorial / contextual hints */
  if (S.on === 'air' && S.y - S.refBase > 2) once('air1', () => hint('空中では<b>着地点ガイド</b>が出ます。<b>緑</b>なら安全、<b>赤</b>なら噴射で調整!', 3.5));
  if (S.dist > 260) once('boost', () => hint(isTouch() ? '<b>BOOST</b>ボタンでAIRを使って加速。絶壁の前で使うと効果大' : '<kbd>Shift</kbd> でブースト。絶壁の前で使うと、壁を一気に駆け上がれる', 3.5));

  /* chapter bookkeeping */
  if (S.on !== 'climb'){ const k = W.chapterAt(S.z); if (k > S.chapter && S.z > 0) S.chapter = k; }
  const seg = S.on === 'road' ? W.segs.find(s => S.z >= s.z0 && S.z < s.z1) : null;
  if (seg && seg.goalZ && !S.goal && S.z >= seg.goalZ) reachGoal();
  if (S.goal){
    S.goalT -= dt; S.fwT -= dt; S.invuln = 9;
    if (S.fwT <= 0){ S.fwT = rand(.18, .4); FX.firework(rand(-40, 40), S.y + rand(25, 60), S.z + rand(40, 120)); AU.sfx('firework'); }
    if (S.goalT <= 0){ endRun(true); return; }
  }
  if (S.summitT > 0) S.summitT -= dt;
  if (bannerT > 0){ bannerT -= dt; if (bannerT <= 0) $('jbanner').classList.remove('on'); }

  AU.setTempoBoost(S.on === 'climb' ? 8 : 0);
  if (S.on !== 'climb') S.score += Math.abs(S.speed) * dt * .6;

  /* world streaming */
  W.ensure(S.z);

  /* emitters */
  S.thrustNow = thrust;
  placeCar(dt);
  emitters(thrust, boosting);

  /* guide */
  if (S.on === 'air' && settings.guide && !S.detached){
    const p = predict(); FX.setGuide(true, predList, p.land, p.kind); S.predKind = p.kind;
  } else { FX.setGuide(false); S.predKind = -1; }

  radar();
  camFollow(dt);
  setAudio(S.on === 'climb' ? S.v : S.speed, thrust, boosting, S.on !== 'air', true);
  hud();
}

/* ---------- road + air movement ---------- */
function roadAirStep(dt, thrust, pressed, boosting, prevY){
  const D = S.diff;
  S.z += S.speed * dt; S.dist = Math.max(S.dist, S.z);
  if (S.on === 'road'){
    const cs = W.climbStartAt(S.z);
    if (cs){ enterClimb(cs, Math.max(0, S.z - cs.z0), S.speed, false); return; }
    const fl = W.floorAt(S.z, S.x);
    if (!fl || fl.h < S.y - .35){
      S.on = 'air'; S.grounded = false; S.airTime = 0; S.flightRings = 0; S.coyote = fl ? 0 : PH.COYOTE;
      if (S.lastSlope > 0){ AU.sfx('jump'); once('rampTip', () => hint('ジャンプ台！ 空中で<b>長押し</b>するとさらに伸びる', 2.5)); }
    } else {
      S.y = fl.h; S.vy = S.speed * fl.slope; S.refBase = fl.seg.base; S.lastSlope = fl.slope;
      if (!boosting) S.air = Math.min(100, S.air + D.recharge * dt);
      if (pressed && S.air > 0){
        S.on = 'air'; S.grounded = false; S.vy = Math.max(S.vy, PH.JUMP); S.air = Math.max(0, S.air - PH.JUMP_COST);
        S.airTime = 0; S.flightRings = 0; S.coyote = 0;
        AU.sfx('jump'); FX.groundDust(S.x, S.y, S.z, S.speed * .4);
        for (const w of car.userData.wheels){ car.localToWorld(tmpV.copy(w.pivot.position)); for (let k = 0; k < 6; k++) FX.jet(tmpV.x, tmpV.y, tmpV.z, 0, -rand(8, 14), S.speed * .5); }
      }
    }
  }
  if (S.on !== 'air') return;
  if (S.coyote > 0){ S.coyote -= dt; if (pressed && S.air > 0){ S.vy = Math.max(S.vy, PH.JUMP * .9); S.coyote = 0; AU.sfx('jump'); } }
  let acc = -PH.G;
  if (thrust){
    const h = S.y - S.refBase;
    const ceil = 1 - clamp((h - PH.CEIL0) / (PH.CEIL1 - PH.CEIL0), 0, 1);
    acc += PH.THRUST * ceil;
    if (S.vy < -2.5) acc += PH.CUSHION;   // strong retro-burn when falling: easy soft landings
  }
  const vy0 = S.vy;
  S.vy += acc * dt;
  if (thrust && S.vy > PH.VYMAX) S.vy = Math.max(PH.VYMAX, Math.min(S.vy, vy0)); // thrust never adds beyond the cap (launches keep their speed)
  S.y += S.vy * dt; S.airTime += dt; S.maxAir = Math.max(S.maxAir, S.airTime);
  if (S.detached){ S.fallT -= dt; if (S.fallT <= 0){ crash('絶壁から転落!'); return; } }
  // touching a cliff face while airborne: grab it (wall catch) or hit it
  const cc = W.climbContact(S.z, S.y);
  if (cc){
    const vt = S.speed * Math.cos(cc.th) + S.vy * Math.sin(cc.th);
    if (!S.detached && vt > 6) enterClimb(cc.seg, cc.u, vt * .95, cc.th > .5);
    else crash(S.detached ? '絶壁から転落!' : '絶壁に激突!', true);
    return;
  }
  const f2 = W.floorAt(S.z, S.x);
  if (f2 && S.y <= f2.h){
    if (S.detached) crash('絶壁から転落!', true);
    else if (prevY < f2.h - .6) crash('壁に激突!', true);
    else land(f2);
  } else if (S.y < S.refBase - 24){ crash(S.detached ? '絶壁から転落!' : '谷へ落下!', true); }
}

/* ---------- climbing ---------- */
function enterClimb(c, u, v, caught){
  const D = S.diff;
  Object.assign(S, { on: 'climb', climb: c, u, v: Math.max(v, 5), grounded: true, refBase: c.takeoffBase, airTime: 0, rolling: false, roll: 0, stall: 0, onIce: false });
  const P = W.climbAt(c, u, tmpC); S.th = P.th; S.y = P.y; S.z = P.z;
  AU.sfx('clamp'); S.shake = Math.max(S.shake, .5); vibrate(30); AU.setClimb(0);
  const H = Math.round(c.yEnd - c.yb);
  if (caught){ S.catches++; comboUp(); addScore(300, true, 'cyan'); AU.sfx('catch'); toast('ウォールキャッチ!', '空中から壁に吸い付いた', 1.1, 'gold', 2); }
  else toast('CLIMB!', '高さ ' + H + 'm · ' + (D.key === 'easy' ? '噴射長押しで加速' : '速度を落とすな'), 1.3, 'gold', 2);
  once('climb1', () => hint('壁では<b>噴射を長押し</b>で加速。速度が落ちると<b>失速</b>して落ちる! <b>←→</b>で落石をかわせ', 4.5));
  S.climbBase = S.y;
}
function climbStep(dt, thrust, boosting){
  const c = S.climb, D = S.diff;
  const P = W.climbAt(c, S.u, tmpC), sin = Math.sin(P.th), cos = Math.cos(P.th);
  const target = W.speedAt(c.z0 - 1) * (boosting ? PH.BOOST : 1);
  S.onIce = c.ice.some(i => S.u >= i.u0 && S.u <= i.u1 && Math.abs(S.x - i.x) < i.w);
  let acc = Math.max(0, target - S.v) * 1.2 * cos + PH.G * (D.grip - 1) * sin;
  if (thrust) acc += PH.G * PH.WALL_THR * sin;
  if (boosting) acc += PH.G * PH.WALL_BOOST * sin;
  if (S.onIce){ acc -= PH.G * PH.ICE * sin; if (!S.iceWarned){ S.iceWarned = true; AU.sfx('ice'); toast('氷で滑る!', '噴射で押し切れ', .9, 'warn', 1); } } else S.iceWarned = false;
  for (const p of c.wpads){
    if (!p.used && Math.abs(S.u - p.u) < p.len / 2 + 1 && Math.abs(S.x - p.x) < 2){
      p.used = true; S.v = Math.min(PH.VMAX_W, S.v + PH.PAD_KICK); S.air = Math.min(100, S.air + 12); AU.sfx('pad'); pulse(); popup('BOOST +AIR', 'cyan'); S.shake = Math.max(S.shake, .25);
      once('wpad', () => hint('壁の<b>ブーストパッド</b>は加速＋AIR回復。車線を合わせて踏め!', 2.6));
    }
  }
  S.v = Math.min(PH.VMAX_W, S.v + acc * dt);
  if (P.th < .8) S.v = Math.max(S.v, 4);
  const y0 = S.y;
  S.u = Math.max(0, S.u + S.v * dt);
  if (S.u >= c.len){ launch(c); return; }
  W.climbAt(c, S.u, tmpC); S.th = tmpC.th; S.y = tmpC.y; S.z = tmpC.z;
  S.speed = S.v; S.climbed += Math.max(0, S.y - y0); S.score += Math.max(0, S.y - y0) * 3;
  const p = clamp((S.y - c.yb) / (c.yEnd - c.yb), 0, 1);
  AU.setClimb(p);
  // through the sea of clouds
  if (!S.cloudDone && y0 <= W.CLOUD_Y && S.y > W.CLOUD_Y){
    S.cloudDone = true; flash(.6, true); AU.sfx('cloud'); addScore(800, true, 'cyan'); comboUp();
    toast('雲を突き抜けた!', '標高 ' + W.CLOUD_Y + 'm · 雲海の上へ', 2, 'gold', 4);
    for (let k = 0; k < 8; k++) FX.cloudPuff(S.x, S.y - 6, S.z - 10, S.v);
  }
  // stall
  if (S.th > .8 && S.v < PH.WARN_V){
    S.stall = clamp(1 - S.v / PH.WARN_V, 0, 1);
    S.heartT -= dt; if (S.heartT <= 0){ S.heartT = .38 + S.v / PH.WARN_V * .4; AU.sfx('heart'); vibrate(15); }
    once('stall', () => hint('<b>失速寸前!</b> 噴射を長押し。AIRが無いなら祈れ!', 2.5));
  } else S.stall = 0;
  if (S.th > 1 && S.v < PH.STALL_V){ detach(); return; }
  // rockfall
  for (const t of c.rockTrig){ if (!t.fired && S.u >= t.u){ t.fired = true; spawnRock(c); } }
  if (S.rockWarnT > 0) S.rockWarnT -= dt;
  for (let i = c.rocks.length - 1; i >= 0; i--){
    const r = c.rocks[i];
    r.vs = Math.max(-30, r.vs - 9 * dt); r.s += r.vs * dt; r.bob += dt * 9;
    W.climbPoint(c, Math.max(0, r.s), r.x, 1.5 + Math.abs(Math.sin(r.bob)) * .8, r.mesh.position);
    r.mesh.rotation.x -= dt * 7; r.mesh.rotation.z += dt * 3;
    if (Math.random() < .3) FX.rockDust(r.mesh.position.x, r.mesh.position.y, r.mesh.position.z, r.vs * .3);
    if (r.s < -10){ c.group.remove(r.mesh); c.rocks.splice(i, 1); continue; }
    if (Math.abs(S.u - r.s) < 2.3 && Math.abs(S.x - r.x) < 1.8 && S.invuln <= 0){ crash('落石に直撃!'); return; }
    if (!r.passed && r.s < S.u - 2.4){
      r.passed = true;
      if (Math.abs(S.x - r.x) < 3.4){ S.dodges++; S.nearMiss++; comboUp(); addScore(180, true); AU.sfx('rockpass', 0, { pan: clamp((r.x - S.x) * -.25, -.8, .8) }); toast('ギリギリ回避!', 'ROCK DODGE', .8, '', 1); vibrate(20); }
    }
  }
  // overhang blocks
  for (const b of c.blockers){
    if (Math.abs(S.u - b.u) < 1.8 && Math.abs(S.x - b.x) < b.w + .4 && S.invuln <= 0){ crash('岩棚に激突!'); return; }
    if (!b.passed && S.u > b.u + 1.8){ b.passed = true; if (Math.abs(S.x - b.x) < b.w + 2){ S.dodges++; comboUp(); addScore(150, true); AU.sfx('nearmiss', 0, { pan: clamp((b.x - S.x) * -.3, -.8, .8) }); } }
  }
}
function spawnRock(c){
  const ahead = 62 + S.v * .9, s0 = Math.min(c.uW1 - 2, S.u + ahead);
  if (s0 - S.u < 28) return;
  const near = W.LANES.reduce((a, b) => Math.abs(b - S.x) < Math.abs(a - S.x) ? b : a);
  const x = Math.random() < .7 ? near : W.LANES[(Math.random() * 3) | 0];
  const m = Md.fallingRock(CH[c.chapter].mat === 'ice'); m.scale.set(1.2, 1.05, 1.2); m.castShadow = true;
  const glow = Md.sprite(Md.mats().glowSprite, 0xff4020, 5); glow.material.opacity = .7; m.add(glow);
  c.group.add(m);
  c.rocks.push({ s: s0, x, vs: -12, mesh: m, passed: false, bob: Math.random() * 3 });
  S.rockWarnT = 1.6; S.rockWarnLane = x;
  AU.sfx('rockwarn', 0, { pan: clamp(-x / 5, -.8, .8) }); S.shake = Math.max(S.shake, .35);
}
function detach(){
  const c = S.climb;
  S.on = 'air'; S.grounded = false; S.detached = true; S.fallT = 1.6;
  S.vy = S.v * Math.sin(S.th); S.speed = -3; S.z -= .5; S.refBase = c.takeoffBase; S.airTime = 0; S.stall = 0;
  AU.setClimb(-1); AU.sfx('empty'); AU.sfx('hard');
  toast('グリップ喪失!', '速度が足りない… 落ちる!', 1.4, 'warn', 3); vibrate([40, 40, 40]);
}
function launch(c){
  const v = Math.max(S.v, 7);
  W.climbAt(c, c.len, tmpC); S.y = tmpC.y; S.z = tmpC.z;
  Object.assign(S, { on: 'air', grounded: false, speed: v * Math.cos(c.lip), vy: v * Math.sin(c.lip), refBase: c.base, airTime: 0, flightRings: 0, th: 0, stall: 0, onIce: false });
  S.summits++; S.summitT = 2.6; S.slowmo2 = .95; S.reachedCh = Math.max(S.reachedCh, c.chapter + 1); S.chapter = c.chapter + 1;
  const k = c.chapter, final = k === CH.length - 1;
  AU.setClimb(-1); AU.setZone(Math.min(k + 1, 6)); AU.drop(.8); AU.sfx('summit');
  flash(.55, true); pulse(); vibrate([30, 30, 90]); S.shake = .6;
  FX.confetti(S.x, S.y + 2, S.z + 4, S.speed * .6);
  for (let i = 0; i < 3; i++) setTimeout(() => { if (S.mode === 'play'){ FX.firework(rand(-30, 30), S.y + rand(18, 36), S.z + rand(30, 70)); AU.sfx('firework'); } }, 250 + i * 320);
  addScore(1000 * (k + 1), true, 'cyan');
  if (v > 34){ addScore(500, true); }
  if (S.lives < S.diff.lives){ S.lives++; lifeIcons(); setTimeout(() => popup('LIFE +1', 'cyan'), 500); }
  S.air = Math.max(S.air, 60);
  S.pendingStar = k;
  toast(final ? '星の頂、到達!' : 'SUMMIT ' + (k + 1) + ' 制覇!', '標高 ' + ALT[k + 1] + 'm · ' + CH[k].jp + ' クリア' + (v > 34 ? ' · ハイスピード登頂!' : ''), 2.6, 'gold', 5);
  once('summitTip', () => hint('頂上ジャンプは<b>パーフェクト着地</b>で★獲得! 着地の直前に短く噴射', 3.2));
}
function reachGoal(){
  S.goal = true; S.goalT = 6; S.fwT = 0;
  AU.sfx('goal'); flash(.35, true); pulse(); FX.confetti(S.x, S.y + 2, S.z + 6, S.speed * .6);
  addScore(5000, true, 'cyan');
  toast('GOAL!!', '標高1000m · 星の頂 登頂!  タイム ' + fmtTime(S.time), 4, 'gold', 6);
  setTimeout(() => showJourney(CH.length - 1, CH.length, 3.6), 900);
}

function land(f){
  const impact = -S.vy, g = 1 + impact / 6;
  S.lastG = g; S.y = f.h; S.grounded = true; S.on = 'road'; S.refBase = f.seg.base;
  const at = S.airTime; S.vy = 0;
  const summitLanding = S.pendingStar >= 0; const k = S.pendingStar; S.pendingStar = -1;
  if (impact > PH.CRASH_V){ crash('激突! ' + g.toFixed(1) + 'G'); if (summitLanding){ awardStars(k, false); showJourney(k, k + 1); } return; }
  const rollInc = S.rolling; if (S.rolling){ S.rolling = false; S.roll = 0; }
  const kk = clamp(impact / PH.CRASH_V, 0, 1);
  AU.sfx('land', kk); S.shake = Math.max(S.shake, kk * .9); landKick = settings.motion ? 0 : Math.min(.35, impact * .02);
  FX.groundDust(S.x, f.h, S.z, S.speed * .5); FX.groundDust(S.x, f.h, S.z, S.speed * .5);
  let perfect = false;
  if (at > .55){
    if (rollInc){ toast('着地失敗', 'ロールが間に合わなかった', 1, 'warn', 1); comboBreak(); S.speed *= .8; FX.touchdown(S.x, f.h, S.z, false); vibrate(40); }
    else if (impact < PH.PERFECT_V){
      perfect = true; S.perfects++; comboUp(); addScore(summitLanding ? 800 : 250, true, 'cyan'); AU.sfx('perfect'); pulse(); FX.touchdown(S.x, f.h, S.z, true); vibrate(15);
      toast(summitLanding ? 'パーフェクト・サミット!' : 'パーフェクト着地!', g.toFixed(1) + 'G · SOFT TOUCHDOWN', 1.2, '', summitLanding ? 4 : 2);
    } else if (impact > PH.HARD_V){
      AU.sfx('hard'); comboBreak(); S.speed *= .82; FX.touchdown(S.x, f.h, S.z, false); vibrate(50);
      toast('ハード着地 ' + g.toFixed(1) + 'G', '着地の直前に噴射で衝撃をやわらげよう', 1.3, 'warn', 2);
    } else FX.touchdown(S.x, f.h, S.z, false);
    if (at > 2.4){ S.bigAirs = (S.bigAirs || 0) + 1; addScore(200, true); if (!summitLanding) toast('ビッグエア!', at.toFixed(1) + '秒 滞空', 1, 'gold', 1); }
  }
  if (summitLanding){
    const res = awardStars(k, perfect);
    if (res.newly) setTimeout(() => { AU.sfx('chapter'); popup('★'.repeat(res.got.filter(Boolean).length) + ' GET', 'cyan'); }, 400);
    setTimeout(() => { if (S.mode === 'play' && k < CH.length - 1) showJourney(k, k + 1, 3.6); }, 1300);
  }
  S.airTime = 0;
}

function radar(){
  let txt = '', cls = '';
  if (S.on === 'climb'){
    const c = S.climb, left = Math.max(0, Math.ceil(c.yEnd - S.y));
    const laneName = x => x > 1 ? '左' : x < -1 ? '右' : '中央';
    const bl = c.blockers.find(b => b.u > S.u && b.u - S.u < 45 && Math.abs(b.x - S.x) < 2.6);
    const ice = c.ice.find(i => i.u0 > S.u && i.u0 - S.u < 40 && Math.abs(i.x - S.x) < 3);
    if (S.stall > 0){ txt = '⚠ 失速! 噴射を長押し!'; cls = 'danger'; }
    else if (S.rockWarnT > 0){ txt = '▼ 落石! ' + laneName(S.rockWarnLane) + 'の車線'; cls = 'danger'; }
    else if (bl){ txt = '◆ 岩棚 — 車線変更!'; cls = 'danger'; }
    else if (ice){ txt = '❄ 氷 — 滑るぞ、噴射で押し切れ'; cls = ''; }
    else { txt = '▲ 頂上まで ' + left + 'm'; cls = left < 30 ? 'good' : ''; }
    setRadar(txt, cls); return;
  }
  const lookT = S.speed * 2.4;
  const gap = W.segs.find(s => s.type === 'gap' && s.z0 > S.z && s.z0 - S.z < lookT);
  const nc = W.nextClimb(S.z), toCliff = nc ? nc.z0 - S.z : 1e9;
  if (S.detached){ txt = '…'; cls = 'danger'; }
  else if (S.on === 'air' && S.predKind === 2 && S.vy < 0) { txt = '↓ このままだと危険 — 噴射で調整!'; cls = 'danger'; }
  else if (S.on === 'air' && S.predKind === 1 && S.vy < -3) { txt = '↓ 着地前に短く噴射'; cls = ''; }
  else if (S.on === 'air' && S.predKind === 0 && S.vy < -2) { txt = '✓ 着地OK'; cls = 'good'; }
  else if (S.on === 'road' && toCliff < 260 && toCliff > 0){ txt = '▲ 絶壁まで ' + Math.ceil(toCliff) + 'm — 加速!'; cls = toCliff < 60 ? 'good' : ''; }
  else if (gap && S.on === 'road'){
    const d = Math.ceil(gap.z0 - S.z), up = gap.base > gap.takeoffBase + .5;
    txt = '▲ 谷まで ' + d + 'm' + (up ? ' · 上り!' : '') + (d < S.speed * .7 ? ' — 今だ、噴射!' : ''); cls = d < S.speed * .7 ? 'danger' : '';
  } else if (S.on === 'road'){
    let ob = null;
    for (const s of W.segs){ if (s.z0 > S.z + S.speed * 2) break; for (const o of s.obst){ if (o.z > S.z && o.z - S.z < S.speed * 1.6 && (o.truck || Math.abs(o.x - S.x) < 2.2)){ ob = o; break; } } if (ob) break; }
    if (ob){ txt = ob.truck ? '■ トラックの壁 — 跳び越えろ!' : '◆ 前方に車 — 車線変更!'; cls = ob.truck ? 'danger' : ''; }
    else if (S.air < 22){ txt = 'AIR LOW — 地上で回復中'; cls = ''; }
  }
  setRadar(txt, cls);
}

/* ---------- emitters ---------- */
function emitters(thrust, boosting){
  const k = W.chapterAt(S.z);
  if (S.on === 'climb'){
    surfaceT(S.th, tmpV2);
    if (thrust || boosting){
      for (const b of car.userData.boosts){ b.flame.getWorldPosition(tmpV); for (let i = 0; i < 2; i++) FX.jet(tmpV.x, tmpV.y, tmpV.z, rand(-1, 1), -tmpV2.y * rand(14, 22) + tmpV2.y * S.v * .5, -tmpV2.z * rand(14, 22)); }
      FX.rockDust(S.x + rand(-1, 1), S.y - 1, S.z - .3, -S.v * .2);
    }
    if (S.onIce && Math.random() < .5) FX.sparks(S.x, S.y, S.z - .3, 0, 2, 0);
    return;
  }
  if (thrust && S.on === 'air'){
    for (const w of car.userData.wheels){ w.pivot.getWorldPosition(tmpV); FX.jet(tmpV.x, tmpV.y - .2, tmpV.z, S.vx * .5, -rand(14, 22), S.speed * rand(.5, .75)); }
    const f = W.floorAt(S.z, S.x);
    if (f && S.y - f.h < 4.5) FX.groundDust(S.x, f.h, S.z, S.speed * .7, k >= 4 ? [.85, .9, 1] : k === 2 ? [.4, .4, .5] : [.8, .6, .5]);
  }
  if (boosting){ for (const b of car.userData.boosts){ b.flame.getWorldPosition(tmpV); FX.boostFlame(tmpV.x, tmpV.y, tmpV.z, S.speed * .4 - 12); } }
}

/* ---------- car pose ---------- */
let landKick = 0;
function placeCar(dt){
  const U = car.userData, inner = U.inner;
  car.position.set(S.x, S.y, S.z);
  let target;
  if (S.on === 'climb') target = -S.th;
  else if (S.on === 'road'){ const fl = W.floorAt(S.z, S.x); target = -Math.atan((fl || { slope: 0 }).slope); }
  else if (S.detached) target = S.pitch - dt * 2.2;
  else target = clamp(-Math.atan2(S.vy, Math.max(6, Math.abs(S.speed))) * .55, -.6, .45);
  S.pitch = S.on === 'climb' || S.detached ? target : damp(S.pitch, target, S.on === 'road' ? 14 : 3.2, dt);
  car.rotation.x = S.pitch;
  inner.rotation.x = 0;
  const bank = S.on === 'air' ? -S.vx * .045 : S.vx * .012;
  inner.rotation.z = damp(inner.rotation.z, bank, 8, dt);
  car.rotation.z = S.rolling ? S.roll * S.rollDir : 0;
  inner.rotation.y = S.vx * .022;
  inner.position.y = S.on !== 'air' ? Math.sin(performance.now() * .05) * .006 * (Math.abs(S.speed) / 40) : 0;
  // hover-fold wheels in the air; on the wall the rear nozzles drive the climb
  const wantFold = S.on === 'air' && S.airTime > .1 ? 1 : 0;
  S.fold = damp(S.fold, wantFold, wantFold ? 7 : 16, dt);
  const wheelThrust = S.thrustNow && S.on === 'air' ? 1 : 0;
  const climbing = S.on === 'climb';
  for (const w of U.wheels){
    w.pivot.rotation.z = -w.side * S.fold * Math.PI / 2;
    w.spin.rotation.x += (S.on !== 'air' ? Math.abs(S.speed) : Math.abs(S.speed) * .3 + 10 * S.fold) * dt / .36;
    w.jet.rotation.z = -w.pivot.rotation.z; w.jet.rotation.x = 0;
    const pw = Math.max(wheelThrust, S.fold * .18);
    w.jet.material.uniforms.power.value = pw;
    w.jet.scale.set(1, .35 + pw * (wheelThrust ? .9 + Math.random() * .25 : .5), 1);
    w.jet.visible = pw > .02;
    if (w.glowRing) w.glowRing.material.opacity = Math.max(S.fold, climbing ? .9 : 0);
  }
  const nozzle = S.boostNow || (climbing && S.thrustNow) ? 1 : 0;
  for (const b of U.boosts){ b.flame.material.uniforms.power.value = nozzle; b.flame.scale.set(1, .6 + nozzle * (.8 + Math.random() * .3) * (climbing ? 1.3 : 1), 1); b.flame.visible = nozzle > 0; }
  U.under.intensity = wheelThrust ? 7 : climbing ? 3 : S.fold * 1.8;
  car.visible = S.crashT > 0 ? false : (S.invuln > 0 && !S.goal ? Math.floor(performance.now() / 80) % 2 === 0 : true);
}

/* ---------- camera: a frame that tilts with the road surface ---------- */
let camRoll = 0;
const camT = new THREE.Vector3(), camN = new THREE.Vector3(), camDesired = new THREE.Vector3(), camUp = new THREE.Vector3(), camLook = new THREE.Vector3();
function camFollow(dt){
  const thT = S.on === 'climb' ? S.th : S.on === 'air' && S.summitT <= 0 ? 0 : S.on === 'air' ? camTh : 0;
  camTh = damp(camTh, thT, S.on === 'climb' ? 7 : 2.4, dt);
  surfaceT(camTh, camT); surfaceN(camTh, camN);
  const air = S.on === 'air' ? clamp(S.y - S.refBase, 0, 14) : 0;
  const sp = Math.abs(S.on === 'climb' ? S.v : S.speed);
  let back = 7.4 + sp * .05 + air * .18 - (S.boostNow ? .8 : 0);
  let height = 2.7 + air * .34 + (S.on === 'air' ? .6 : 0);
  if (S.on === 'climb'){ back += 1.6 * Math.sin(camTh); height += 2.8 * Math.sin(camTh); }
  camDesired.copy(camT).multiplyScalar(-back).addScaledVector(camN, height); camDesired.x = -S.x * .22;
  // summit cinematic: swing out to the side and watch the car fly over the edge
  if (S.summitT > 0 && !settings.motion){
    const k = smooth(2.6, 2.2, S.summitT) * smooth(0, .9, S.summitT);
    tmpV.set(-11, 2.5, -1.5);
    camDesired.lerp(tmpV, k * .85);
  }
  if (S.detached){ camDesired.set(-S.x * .2, 6, -14); }
  camOff.x = damp(camOff.x, camDesired.x, 6, dt); camOff.y = damp(camOff.y, camDesired.y, S.on === 'climb' ? 8 : 5, dt); camOff.z = damp(camOff.z, camDesired.z, S.on === 'climb' ? 8 : 9, dt);
  camera.position.set(S.x, S.y, S.z).add(camOff);
  landKick = damp(landKick, 0, 9, dt); camera.position.addScaledVector(camN, -landKick);
  if (settings.motion) S.shake = 0;
  if (S.shake > 0){ S.shake = Math.max(0, S.shake - dt * 2.4); const k = S.shake * S.shake * .5; camera.position.x += rand(-1, 1) * k; camera.position.y += rand(-1, 1) * k; }
  if (!settings.motion && S.on === 'road' && S.speed > 35) camera.position.y += Math.sin(performance.now() * .07) * .012 * (S.speed - 35) / 15;
  const lookAhead = 10 + sp * .18 + (S.on === 'air' ? 4 : 0) - (S.on === 'climb' ? 2 : 0);
  camLook.set(S.x * .9, S.y, S.z).addScaledVector(camT, lookAhead).addScaledVector(camN, 1.1 - air * .25 + (S.on === 'climb' ? 1.4 * Math.sin(camTh) : 0));
  if (S.summitT > 0 || S.detached) camLook.lerp(tmpV.set(S.x, S.y + .6, S.z + 2), S.detached ? 1 : clamp(S.summitT / 1.2, 0, 1) * .8);
  camUp.copy(camN).multiplyScalar(.72).addScaledVector(UP, .28).normalize();
  camera.up.copy(camUp);
  camera.lookAt(camLook);
  camRoll = damp(camRoll, settings.motion ? 0 : S.vx * .009, 5, dt); camera.rotateZ(camRoll);
  const fov = baseFov + clamp(sp - 22, 0, 30) * .42 + (S.boostNow ? 9 : 0) + (S.thrustNow && S.on !== 'road' ? 3 : 0) + (S.summitT > 0 ? 6 : 0);
  camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix();
  motionDir.copy(S.on === 'climb' ? camT : FWD);
  followEnv();
}
function followEnv(){
  W.sky.position.copy(camera.position);
  let a, b, t;
  if (S.on === 'climb' && S.climb){ a = S.climb.chapter; b = a + 1; t = smooth(.05, .95, (S.y - S.climb.yb) / (S.climb.yEnd - S.climb.yb)); }
  else { a = b = W.skyIndexAt(S.mode === 'title' ? 0 : S.z); t = 0; if (S.mode === 'title') a = b = S.startCh; }
  W.setEnv(a, b, t);
  const inside = W.updateCloud(camera.position, S.mode === 'title' ? S.startCh : (S.on === 'climb' && S.climb ? S.climb.chapter : W.chapterAt(S.z)));
  const sun = W.sun, Z = W.ZONES[t < .5 ? a : b];
  const sd = tmpV.set(Z.sunDir[0], Math.max(Z.sunDir[1], .5), Z.sunDir[2]).normalize();
  // on a wall, light the face from behind the camera so the climb reads clearly
  if (S.on === 'climb'){ sd.lerp(tmpV2.set(.25, .45, -1).normalize(), Math.sin(S.th) * .85).normalize(); }
  sun.position.set(S.x + sd.x * 60, S.y + sd.y * 60, S.z + 8 + sd.z * 60); sun.target.position.set(S.x, S.y, S.z + 8); sun.target.updateMatrixWorld();
  return inside;
}

/* ---------- title showroom ---------- */
function titleUpdate(dt){
  titleT += dt; titleSpin = Math.max(0, titleSpin - dt);
  W.update(dt, 0);
  const base = ALT[S.startCh];
  const cycle = titleT % 9, hover = cycle > 5 && cycle < 8.2;
  S.on = hover ? 'air' : 'road'; S.grounded = !hover; S.thrustNow = hover ? 1 : 0; S.airTime = hover ? 1 : 0;
  const targetY = base + (hover ? 1.5 + Math.sin(titleT * 2) * .15 : 0);
  S.y = damp(S.y, targetY, hover ? 2.5 : 5, dt); S.vy = 0; S.vx = Math.sin(titleT * .7) * .4; S.speed = 0; S.z = 0; S.x = 0;
  placeCar(dt);
  car.rotation.x = 0; S.pitch = 0;
  car.userData.inner.rotation.y = Math.sin(titleT * .5) * .12 + titleSpin * 2;
  if (hover) for (const w of car.userData.wheels){ w.pivot.getWorldPosition(tmpV); FX.jet(tmpV.x, tmpV.y - .2, tmpV.z, 0, -rand(9, 13), rand(-.5, .5)); if (Math.random() < .5) FX.groundDust(tmpV.x, base, tmpV.z, 0); }
  const a = titleT * .16 + 2.2, narrow = innerWidth < 760, r = narrow ? 10.5 : 7.6;
  camera.up.set(0, 1, 0);
  camera.position.set(Math.cos(a) * r, base + 2.1 + Math.sin(titleT * .3) * .4, Math.sin(a) * r);
  const fwd = tmpV2.set(-camera.position.x, 0, -camera.position.z).normalize();
  const right = tmpV.crossVectors(fwd, camera.up).normalize().multiplyScalar(narrow ? 0 : -2.6);
  camera.lookAt(right.x, base + (narrow ? -3.6 : .9), right.z);
  camera.fov = damp(camera.fov, baseFov - 6, 2, dt); camera.updateProjectionMatrix();
  motionDir.copy(FWD);
  followEnv();
  setAudio(0, S.thrustNow, false, true, true, true);
}
// audio parameters are pushed at most ~30 times per second
const audioState = { speed: 0, thrust: 0, boost: false, grounded: true, playing: false, title: false, combo: 0, alt: 0 };
let audioClock = 0;
function setAudio(speed, thrust, boost, grounded, playing, title = false){
  audioState.speed = speed; audioState.thrust = thrust; audioState.boost = boost; audioState.grounded = grounded; audioState.playing = playing; audioState.title = title; audioState.combo = S.combo; audioState.alt = clamp(S.y / TOP, 0, 1);
}

/* ---------- HUD ---------- */
let hudClock = 0;
function hud(){
  if (++hudClock % 3) return;
  $('score').textContent = Math.round(S.score).toLocaleString();
  $('dist').textContent = '標高 ' + Math.round(Math.max(0, S.y)).toLocaleString() + ' m  ·  ' + fmtTime(S.time || 0);
  const sp = S.on === 'climb' ? S.v : S.speed, kmh = Math.round(Math.abs(sp) * 3.6);
  $('spd').textContent = kmh; $('spdArc').style.strokeDasharray = (clamp(kmh / 220, 0, 1) * 75) + ' 100';
  let g = 1; for (const t of [9, 17, 25, 33, 42]) if (Math.abs(sp) > t) g++;
  $('gear').textContent = S.on === 'climb' ? 'CLIMB' : S.on === 'road' ? 'G' + g : 'HOVER';
  $('cluster').classList.toggle('climbing', S.on === 'climb');
  const a = clamp(S.air, 0, 100);
  $('airPct').textContent = Math.round(a); $('airArc').style.strokeDasharray = (a / 100 * 75) + ' 100';
  $('airGauge').classList.toggle('low', a < 22); $('airGauge').classList.toggle('boosting', S.boostNow);
  $('alt').textContent = S.on === 'climb' ? '↑ ' + Math.max(0, S.climb.yEnd - S.y).toFixed(0) + 'm' : 'ALT ' + Math.max(0, S.y - S.refBase).toFixed(1) + 'm';
  $('thrRing').style.strokeDasharray = a + ' 100';
  const m = mult(); $('comboX').textContent = '×' + m.toFixed(1); $('combo').classList.toggle('on', S.combo > 0); $('comboBar').style.width = (S.comboT / 6 * 100) + '%';
  // chapter progress
  const k = Math.min(S.chapter, CH.length - 1);
  if (S.chapter >= CH.length || S.goal){ $('zoneName').textContent = 'FINALE · 星の頂'; $('zoneFill').style.width = '100%'; $('zoneNext').textContent = 'GOAL'; }
  else if (S.on === 'climb' && S.climb){
    const c = S.climb, p = clamp((S.y - c.yb) / (c.yEnd - c.yb), 0, 1);
    $('zoneName').textContent = 'CH' + (c.chapter + 1) + ' · CLIMB'; $('zoneFill').style.width = (p * 100) + '%'; $('zoneNext').textContent = '頂上まで ' + Math.ceil(c.yEnd - S.y) + 'm';
  } else {
    const st = W.chapterStart[k], nc = W.nextClimb(S.z);
    const z0 = st === undefined || st < -1e8 ? 0 : st, z1 = nc ? nc.z0 : z0 + 1;
    $('zoneName').textContent = 'CH' + (k + 1) + ' · ' + CH[k].jp; $('zoneFill').style.width = clamp((S.z - z0) / Math.max(1, z1 - z0), 0, 1) * 100 + '%';
    $('zoneNext').textContent = nc ? '絶壁まで ' + Math.max(0, Math.ceil(nc.z0 - S.z)) + 'm' : '';
  }
  $('mission').innerHTML = objectiveLine();
  // altitude journey track
  $('altMarker').style.bottom = clamp(S.y / TOP, 0, 1) * 100 + '%';
  $('altNum').textContent = Math.round(Math.max(0, S.y)) + 'm';
  $('altTrack').classList.toggle('climbing', S.on === 'climb');
  $('lowAir').classList.toggle('on', a < 20 && S.on !== 'road' && !settings.motion);
  $('stallOv').classList.toggle('on', S.stall > 0 && !settings.motion);
  $('boostVeil').style.opacity = S.boostNow ? 1 : 0;
}

/* ---------- frame loop ---------- */
let lastT = performance.now(), acc = 0, perfAcc = 0, perfN = 0, perfWarm = 0;
function frame(now){
  requestAnimationFrame(frame);
  let rdt = Math.min(.1, (now - lastT) / 1000); lastT = now;
  // slow motion on crash and at the summit
  if (S.slowmo > 0){ S.slowmo -= rdt; S.timeScale = .28; }
  else if (S.slowmo2 > 0 && !settings.motion){ S.slowmo2 -= rdt; S.timeScale = .38; }
  else S.timeScale = damp(S.timeScale, 1, 4, rdt);
  const dt = rdt * S.timeScale;
  pollGamepad(); combineInput();
  if (S.mode === 'play' && !TR.game.manual){
    acc += dt; let n = 0;
    while (acc >= 1 / 120 && n < 16){ step(1 / 120); acc -= 1 / 120; n++; input.prevThrust = input.thrust; }
  } else if (S.mode === 'title'){ titleUpdate(rdt); acc = 0; }
  audioClock -= rdt; if (audioClock <= 0){ audioClock = 1 / 30; AU.update(audioState); }
  if (toastT > 0) toastT -= rdt;
  if (hintT > 0){ hintT -= rdt; if (hintT <= 0) $('hint').classList.remove('on'); }
  if (S.mode !== 'paused'){
    const spd = S.mode === 'play' ? Math.abs(S.on === 'climb' ? S.v : S.speed) : 0;
    FX.update(dt, camera.position, spd, S.boostNow && S.mode === 'play', motionDir);
    // waterfall mist
    for (const f of W.dynamic.falls){ if (Math.abs(f.z - camera.position.z) < 260 && Math.random() < .5) FX.mist(f.x, f.y, f.z, f.w); }
  }
  const U = finalPass.uniforms;
  U.time.value = now * .001; U.exposure.value = renderer.toneMappingExposure;
  const spd = S.mode === 'play' ? Math.abs(S.on === 'climb' ? S.v : S.speed) : 0;
  U.blur.value = settings.motion ? 0 : damp(U.blur.value, (S.boostNow ? 1 : 0) + clamp((spd - 34) / 30, 0, .5), 5, rdt);
  U.aberr.value = damp(U.aberr.value, settings.motion ? 0 : (S.boostNow ? 1 : 0) + (S.crashT > 0 ? 2 : 0) + S.stall * 1.5, 6, rdt);
  U.sat.value = damp(U.sat.value, S.crashT > 0 ? .25 : S.summitT > 0 ? 1.3 : 1.1, 4, rdt);
  bloom.strength = (S.mode === 'play' && W.chapterAt(S.z) === 2 ? .85 : .62) + (S.summitT > 0 ? .3 : 0);
  composer.render(rdt);
  if (S.mode === 'play' && settings.quality === 'auto' && S.countdown <= 0){
    perfWarm += rdt; if (perfWarm > 3){ perfAcc += rdt; perfN++; if (perfN >= 120){ const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
      if (avg > 1 / 38 && qualityKey !== 'low'){ qualityKey = qualityKey === 'high' ? 'mid' : 'low'; applyQuality(); hint('なめらかさ優先で<b>画質を自動調整</b>しました', 2.2); perfWarm = 0; } } }
  }
}

/* ---------- input ---------- */
const KEY = { ArrowLeft: 'kL', KeyA: 'kL', ArrowRight: 'kR', KeyD: 'kR', Space: 'kT', ArrowUp: 'kT', KeyW: 'kT', ShiftLeft: 'kB', ShiftRight: 'kB', KeyX: 'kB', ArrowDown: 'kB', KeyS: 'kB' };
addEventListener('keydown', e => {
  if (KEY[e.code] && S.mode === 'play'){ input[KEY[e.code]] = true; e.preventDefault(); }
  if (!e.repeat && (e.code === 'KeyP' || e.code === 'Escape') && (S.mode === 'play' || S.mode === 'paused')) togglePause();
  if ((e.code === 'Enter' || e.code === 'Space') && S.mode === 'title' && document.activeElement === document.body){ e.preventDefault(); $('startBtn').click(); }
  if (e.code === 'KeyM' && !e.repeat){ $('muteBtn').click(); }
});
addEventListener('keyup', e => { if (KEY[e.code]) input[KEY[e.code]] = false; });
addEventListener('blur', () => { releaseAll(); if (S.mode === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') togglePause(); });
function releaseAll(){ input.kL = input.kR = input.kT = input.kB = input.tT = input.tB = false; input.tSteer = 0; touches.clear(); $('stick').hidden = true; document.querySelectorAll('.tbtn.down').forEach(b => b.classList.remove('down')); }

let padPrevStart = false, padPrevA = false;
function pollGamepad(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  input.pSteer = 0; input.pT = false; input.pB = false;
  for (const p of pads){
    if (!p) continue;
    let ax = p.axes[0] || 0; if (Math.abs(ax) < .15) ax = 0;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    if (b(14)) ax = -1; if (b(15)) ax = 1;
    input.pSteer = ax; input.pT = b(0) || b(1) || b(12); input.pB = b(7) || b(5) || b(2);
    const start = b(9);
    if (start && !padPrevStart){ if (S.mode === 'play' || S.mode === 'paused') togglePause(); else if (S.mode === 'title') $('startBtn').click(); else if (S.mode === 'result') $('nextBtn').click(); }
    padPrevStart = start;
    if (S.mode === 'title' && b(0) && !padPrevA){ $('startBtn').click(); }
    padPrevA = b(0);
    break;
  }
}
function combineInput(){
  const k = (input.kR ? 1 : 0) - (input.kL ? 1 : 0);
  input.steer = clamp(k + input.tSteer + input.pSteer, -1, 1);
  input.thrust = input.kT || input.tT || input.pT;
  input.boost = input.kB || input.tB || input.pB;
}

/* touch: left side = horizontal slide stick, right side = thrust, boost button */
const touches = new Map();
const touchEl = $('touch'), stick = $('stick'), knob = $('knob');
touchEl.addEventListener('pointerdown', e => {
  if (S.mode !== 'play') return;
  e.preventDefault(); AU.init();
  const tgt = e.target.closest('#boostBtn') ? 'boost' : (e.clientX < innerWidth * .48 && !e.target.closest('#thrustBtn')) ? 'steer' : 'thrust';
  touches.set(e.pointerId, { kind: tgt, x0: e.clientX, y0: e.clientY });
  try { touchEl.setPointerCapture(e.pointerId); } catch(_){}
  if (tgt === 'steer'){ stick.hidden = false; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = 'translateX(0)'; touchEl.classList.add('used'); }
  else if (tgt === 'boost'){ input.tB = true; $('boostBtn').classList.add('down'); }
  else { input.tT = true; $('thrustBtn').classList.add('down'); }
}, { passive: false });
touchEl.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t || t.kind !== 'steer') return;
  let dx = e.clientX - t.x0; const R = 58;
  if (Math.abs(dx) > R){ t.x0 += dx - Math.sign(dx) * R; stick.style.left = t.x0 + 'px'; dx = Math.sign(dx) * R; }
  input.tSteer = clamp(dx / (R * .8), -1, 1);
  knob.style.transform = 'translateX(' + dx * .8 + 'px)';
});
function touchEnd(e){
  const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId);
  if (t.kind === 'steer'){ input.tSteer = 0; stick.hidden = true; }
  else if (t.kind === 'boost'){ input.tB = [...touches.values()].some(v => v.kind === 'boost'); if (!input.tB) $('boostBtn').classList.remove('down'); }
  else { input.tT = [...touches.values()].some(v => v.kind === 'thrust'); if (!input.tT) $('thrustBtn').classList.remove('down'); }
}
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => touchEl.addEventListener(ev, touchEnd));
touchEl.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- buttons ---------- */
$('startBtn').addEventListener('click', () => { AU.init(); AU.sfx('select'); S.cur = 0; S.results = []; startRun(S.startCh); });
$('nextBtn').addEventListener('click', () => { AU.init(); AU.sfx('select'); if (S.players > 1){ if (S.cur < S.players - 1) S.cur++; else { S.cur = 0; S.results = []; } } startRun(S.startCh); });
$('retryBtn').addEventListener('click', e => { AU.init(); AU.sfx('select'); startRun(+$('retryBtn').dataset.ch || 0); });
$('homeBtn').addEventListener('click', () => { AU.sfx('click'); goTitle(); });
$('quitBtn').addEventListener('click', () => { AU.sfx('click'); goTitle(); });
$('restartBtn').addEventListener('click', () => { AU.sfx('click'); startRun(S.startCh); });
$('resumeBtn').addEventListener('click', togglePause);
$('pauseBtn').addEventListener('click', togglePause);
$('muteBtn').addEventListener('click', () => { AU.init(); AU.setMute(!AU.muted); $('muteBtn').classList.toggle('off', AU.muted); });
function togglePause(){
  if (S.mode === 'play'){ releaseAll(); S.mode = 'paused'; showScreen('pause'); AU.setMode('off'); setAudio(0, 0, false, true, false); setTimeout(() => $('resumeBtn').focus({ preventScroll: true }), 50); }
  else if (S.mode === 'paused'){ S.mode = 'play'; showScreen(null); AU.setMode('play'); lastT = performance.now(); }
}
addEventListener('pointerdown', () => { AU.init(); if (S.mode === 'title') AU.setMode('title'); }, { once: true });
addEventListener('keydown', () => { AU.init(); if (S.mode === 'title') AU.setMode('title'); }, { once: true });

/* debug / test hooks */
TR.game = { S, input, startRun, goTitle, step, predict, combineInput, progress, manual: false, get car(){ return car; }, get camera(){ return camera; } };

resize();
boot();
})();
