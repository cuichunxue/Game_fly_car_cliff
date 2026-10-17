/* ============================================================
 * Cliff Roadster — world: chapters, sky, track, cliffs, cloud sea, scenery
 * 道路区間（谷・車列・ジャンプ台）と、絶壁（クォーターパイプ→垂直壁→リップ）を
 * 1本のコースとしてつなぎ、6つのチャプターで標高1000mの頂を目指す。
 * ============================================================ */
window.TR = window.TR || {};
TR.World = (() => {
  'use strict';
  const Md = TR.Models, T = TR.Tex;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const HALF_W = 6, GROUND_D = 46, TILE = 120, CLOUD_Y = 400;
  const LANES = [-3.6, 0, 3.6];
  // altitude of each summit (index k = top of chapter k-1's cliff)
  const ALT = [0, 60, 160, 300, 470, 680, 1000];
  // climb shape: quarter-pipe radius, lip radius, lip launch angle
  const R1 = 16, R2 = 14, LIP = 50 * Math.PI / 180;

  /* ---------- chapters (the journey) ---------- */
  const CHAPTERS = [
    { key: 'coast',  name: 'GOLDEN COAST',    jp: '黄金の海岸線', scen: 'coast',   mat: 'rock', v: 24, road: 520, obst: .38, gap: .24,
      wall: { rocks: 0, blockers: 0, ice: 0, pads: 1, cells: 1 }, goal: '勢いだけで、登れる。' },
    { key: 'canyon', name: 'RED CANYON',      jp: '赤岩キャニオン', scen: 'canyon', mat: 'rock', v: 28, road: 700, obst: .55, gap: .3,
      wall: { rocks: 2, blockers: 0, ice: 0, pads: 2, cells: 1 }, goal: '落石をかわして、駆け上がれ。' },
    { key: 'city',   name: 'NEON SKYWALL',    jp: 'ネオン摩天楼', scen: 'city',     mat: 'tower', v: 31, road: 780, obst: .7, gap: .3,
      wall: { rocks: 1, blockers: 3, ice: 0, pads: 2, cells: 2 }, goal: '摩天楼の壁面を、垂直に走れ。' },
    { key: 'clouds', name: 'SEA OF CLOUDS',   jp: '雲海の断崖', scen: 'peaks',      mat: 'rock', v: 34, road: 780, obst: .7, gap: .34,
      wall: { rocks: 3, blockers: 1, ice: 0, pads: 2, cells: 2 }, goal: '雲を突き抜けろ。' },
    { key: 'aurora', name: 'AURORA ICE WALL', jp: 'オーロラ氷壁', scen: 'sky',     mat: 'ice', v: 37, road: 820, obst: .75, gap: .36,
      wall: { rocks: 3, blockers: 1, ice: 3, pads: 3, cells: 3 }, goal: '氷は滑る。噴射で押し切れ。' },
    { key: 'summit', name: 'STAR SUMMIT',     jp: '星の頂', scen: 'sky',           mat: 'ice', v: 40, road: 720, obst: .8, gap: .38,
      wall: { rocks: 5, blockers: 2, ice: 2, pads: 4, cells: 4 }, goal: '最後の壁。夜明けは、頂の向こう。' },
  ];

  /* ---------- skies (one per chapter + the sunrise finale) ---------- */
  const ZONES = [
    { name: 'GOLDEN COAST', top: 0x2458a8, mid: 0x6aa2d8, hor: 0xffc890, sunCol: 0xffd898, sunDir: [-.55, .22, 1], sunSize: 1.6, stars: 0, aurora: 0, clouds: 1, moon: 0,
      fog: 0x8fb0d4, fogNear: 220, fogFar: 1200, hemiSky: 0xffe6c8, hemiGround: 0x6a4a3a, hemiI: .7, dirCol: 0xffd8a0, dirI: 2.2, exposure: .66 },
    { name: 'RED CANYON', top: 0x10183d, mid: 0x6d3a78, hor: 0xffa565, sunCol: 0xffb36b, sunDir: [-.38, .07, 1], sunSize: 1.4, stars: .2, aurora: 0, clouds: 1, moon: 0,
      fog: 0x9a5a6e, fogNear: 110, fogFar: 760, hemiSky: 0xffc09a, hemiGround: 0x4a2430, hemiI: .55, dirCol: 0xffc48a, dirI: 2.0, exposure: .82 },
    { name: 'NEON SKYWALL', top: 0x030310, mid: 0x170a36, hor: 0xb02a78, sunCol: 0x000000, sunDir: [.3, .2, 1], sunSize: 1, stars: .45, aurora: 0, clouds: .45, moon: 1,
      fog: 0x1c0c2c, fogNear: 80, fogFar: 640, hemiSky: 0x8a6cff, hemiGround: 0x301030, hemiI: .5, dirCol: 0x9fb4ff, dirI: .8, exposure: .95 },
    { name: 'SEA OF CLOUDS', top: 0x1d2b5a, mid: 0x8a6aa8, hor: 0xffb08a, sunCol: 0xffc890, sunDir: [.42, .05, 1], sunSize: 1.8, stars: .15, aurora: 0, clouds: .7, moon: 0,
      fog: 0xb7a0b6, fogNear: 120, fogFar: 900, hemiSky: 0xffd8d0, hemiGround: 0x4a4060, hemiI: .65, dirCol: 0xffd0a8, dirI: 1.8, exposure: .8 },
    { name: 'AURORA ICE WALL', top: 0x01040c, mid: 0x07203a, hor: 0x2d8aa0, sunCol: 0x000000, sunDir: [0, .2, 1], sunSize: 1, stars: 1, aurora: 1, clouds: 0, moon: .8,
      fog: 0x0a2032, fogNear: 140, fogFar: 1100, hemiSky: 0x9fdcff, hemiGround: 0x1a3550, hemiI: .5, dirCol: 0xbfe6ff, dirI: .9, exposure: .8 },
    { name: 'STAR SUMMIT', top: 0x000106, mid: 0x060b26, hor: 0x2a2a66, sunCol: 0x000000, sunDir: [0, .1, 1], sunSize: 1, stars: 1.4, aurora: .45, clouds: 0, moon: 1,
      fog: 0x0a0e26, fogNear: 160, fogFar: 1300, hemiSky: 0x8a9cff, hemiGround: 0x1a1a3a, hemiI: .5, dirCol: 0xb0c0ff, dirI: .8, exposure: .85 },
    { name: 'SUNRISE', top: 0x14245c, mid: 0x8a4a7a, hor: 0xff9a50, sunCol: 0xffc070, sunDir: [.18, .04, 1], sunSize: 1.7, stars: .25, aurora: 0, clouds: .55, moon: 0,
      fog: 0x8a5a6e, fogNear: 220, fogFar: 1600, hemiSky: 0xffd0b8, hemiGround: 0x4a3050, hemiI: .65, dirCol: 0xffc080, dirI: 2.1, exposure: .7 },
  ];

  let scene, renderer, sky, skyMat, hemi, sun, fill, cloud, cloudMat, envMaps = [], segs = [], tiles = [], buildZ = 0, tileZ = -TILE * 2;
  const trackGroup = new THREE.Group(), sceneryGroup = new THREE.Group();
  const dynamic = { beacons: [], flyers: [], falls: [] };
  let diff = null, plan = [], nextChapter = 0, startChapter = 0;
  const chapterStart = [];

  /* ---------- sky ---------- */
  function makeSky(){
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, .1, 1).normalize() }, moonDir: { value: new THREE.Vector3(-.45, .38, 1).normalize() },
        sunSize: { value: 1 }, stars: { value: 0 }, aurora: { value: 0 }, clouds: { value: 0 }, moon: { value: 0 }, time: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `
        uniform vec3 top, mid, hor, sunCol, sunDir, moonDir; uniform float sunSize, stars, aurora, clouds, moon, time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*n2(p); p *= 2.03; a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(hor, mid, smoothstep(-.03, .2, h));
          c = mix(c, top, smoothstep(.2, .8, h));
          c = mix(c, hor*.35, smoothstep(0., -.25, h));
          float sd = max(dot(d, normalize(sunDir)), 0.);
          c += sunCol * (smoothstep(.9994 - .0004*sunSize, .9998, sd)*8. + pow(sd, 22.)*.55 + pow(sd, 5.)*.18*sunSize);
          float md = dot(d, normalize(moonDir));
          float disc = smoothstep(.99955, .9997, md);
          float crater = .82 + .18*n2(d.xy*900.);
          c += moon * (vec3(.85,.9,1.)*disc*2.2*crater + vec3(.4,.5,.8)*pow(max(md,0.),60.)*.35);
          vec3 q = d*420.; vec3 id = floor(q); float s = hash(id);
          float star = step(.9965, s) * smoothstep(.5, .1, length(fract(q)-.5)) * smoothstep(.02, .25, h);
          c += vec3(.9,.95,1.) * star * stars * (.55 + .45*sin(time*2.5 + s*80.)) * 1.6;
          if (clouds > 0. && h > -.02){
            vec2 uv = d.xz/(h+.12);
            float cl = fbm(uv*1.4 + vec2(time*.01, 0.));
            float band = smoothstep(.0, .06, h) * smoothstep(.45, .12, h);
            float a = smoothstep(.48, .78, cl) * band * clouds;
            vec3 lit = mix(mid*.7, sunCol*1.4 + hor*.4, pow(sd, 3.)*.9 + .1);
            c = mix(c, lit, a*.85);
          }
          if (aurora > 0. && h > 0.){
            vec2 uv = d.xz/(h+.25);
            float w = sin(uv.x*1.6 + time*.12 + sin(uv.y*1.3 + time*.07)*2.2);
            float curtain = exp(-abs(uv.y*.7 - w*.6 - .9)*2.8);
            float rays = .6 + .4*sin(uv.x*28. + time*.6 + fbm(uv*3.)*6.);
            float a = curtain * rays * smoothstep(.04, .3, h) * smoothstep(1., .45, h);
            vec3 ac = mix(vec3(.15,1.,.6), vec3(.55,.3,1.), smoothstep(.2, .7, h));
            c += ac * a * aurora * 1.1;
          }
          gl_FragColor = vec4(c, 1.);
        }`
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    return sky;
  }
  function applyZoneSky(u, Z){
    u.top.value.setHex(Z.top); u.mid.value.setHex(Z.mid); u.hor.value.setHex(Z.hor); u.sunCol.value.setHex(Z.sunCol);
    u.sunDir.value.set(...Z.sunDir).normalize(); u.sunSize.value = Z.sunSize; u.stars.value = Z.stars; u.aurora.value = Z.aurora; u.clouds.value = Z.clouds; u.moon.value = Z.moon;
  }

  /* ---------- the sea of clouds (a layer you climb through in chapter 4) ---------- */
  function makeCloud(){
    cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, top: { value: new THREE.Color(0xfff0f4) }, bot: { value: new THREE.Color(0x6a6480) }, sunCol: { value: new THREE.Color(0xffc890) }, cam: { value: new THREE.Vector3() }, opacity: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `
        uniform float time, opacity; uniform vec3 top, bot, sunCol, cam; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<6;i++){ s += a*n2(p); p *= 2.07; a *= .5; } return s; }
        void main(){
          vec2 p = vW.xz*.0045 + vec2(time*.012, time*.004);
          float d = fbm(p) + .35*fbm(p*3.1 - time*.01);
          float a = smoothstep(.45, .95, d);
          float dist = length(vW.xz - cam.xz);
          a *= smoothstep(3000., 1400., dist);
          vec3 c = gl_FrontFacing ? top : bot;
          c *= .7 + .55*smoothstep(.5, 1.2, d);
          c += sunCol * .25 * smoothstep(.9, 1.3, d) * (gl_FrontFacing ? 1. : 0.);
          gl_FragColor = vec4(c, clamp(a*1.15, 0., 1.) * opacity);
        }`
    });
    cloud = new THREE.Mesh(new THREE.PlaneGeometry(6400, 6400, 1, 1).rotateX(-Math.PI / 2), cloudMat);
    cloud.position.y = CLOUD_Y; cloud.frustumCulled = false; cloud.renderOrder = 4;
    return cloud;
  }

  function buildEnvMaps(){
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const s = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat.clone()); envScene.add(s);
    const panel = (c, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
    ZONES.forEach((Z, i) => {
      applyZoneSky(s.material.uniforms, Z);
      while (envScene.children.length > 1) envScene.remove(envScene.children[1]);
      if (i === 2){ panel(new THREE.Color(0xff40c0).multiplyScalar(2.5), -60, 10, 30, 30, 40); panel(new THREE.Color(0x40e8ff).multiplyScalar(2.5), 60, 15, -10, 30, 50); panel(new THREE.Color(0xffffff).multiplyScalar(1.2), 0, 90, 0, 60, 20); }
      else if (i === 4 || i === 5){ panel(new THREE.Color(0x60ffc0).multiplyScalar(1.5), 0, 60, 60, 120, 20); panel(new THREE.Color(0xc0e8ff).multiplyScalar(1.2), 0, 90, -20, 60, 30); }
      else { panel(new THREE.Color(Z.sunCol).multiplyScalar(3), Z.sunDir[0] * 60, 25, 60, 50, 12); panel(new THREE.Color(Z.mid).multiplyScalar(1.4), 0, 80, -20, 90, 30); }
      envMaps[i] = pm.fromScene(envScene, .02).texture;
    });
    pm.dispose();
  }

  function init(sc, r){
    scene = sc; renderer = r;
    scene.add(makeSky()); scene.add(makeCloud());
    scene.fog = new THREE.Fog(0x000000, 60, 600);
    hemi = new THREE.HemisphereLight(0xffffff, 0x000000, .8); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 140; sun.shadow.bias = -.0008; sun.shadow.normalBias = .06;
    scene.add(sun); scene.add(sun.target);
    fill = new THREE.DirectionalLight(0x6fa8ff, .35); fill.position.set(30, 20, -60); scene.add(fill);
    scene.add(trackGroup); scene.add(sceneryGroup);
    buildEnvMaps();
    setEnv(0, 1, 0);
  }
  function setShadowSize(n){ sun.castShadow = n > 0; if (n > 0){ sun.shadow.mapSize.set(n, n); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } } }

  /* blend the whole atmosphere between two skies (a -> b by t) */
  const cB = new THREE.Color();
  const lerpHex = (out, a, b, t) => out.setHex(a).lerp(cB.setHex(b), t);
  let currentEnv = -1;
  const envInfo = { a: 0, b: 1, t: 0 };
  function setEnv(ai, bi, t){
    const A = ZONES[ai], B = ZONES[bi], u = skyMat.uniforms;
    lerpHex(u.top.value, A.top, B.top, t); lerpHex(u.mid.value, A.mid, B.mid, t); lerpHex(u.hor.value, A.hor, B.hor, t); lerpHex(u.sunCol.value, A.sunCol, B.sunCol, t);
    u.sunDir.value.set(A.sunDir[0] + (B.sunDir[0] - A.sunDir[0]) * t, A.sunDir[1] + (B.sunDir[1] - A.sunDir[1]) * t, 1).normalize();
    u.sunSize.value = A.sunSize + (B.sunSize - A.sunSize) * t;
    u.stars.value = A.stars + (B.stars - A.stars) * t; u.aurora.value = A.aurora + (B.aurora - A.aurora) * t;
    u.clouds.value = A.clouds + (B.clouds - A.clouds) * t; u.moon.value = A.moon + (B.moon - A.moon) * t;
    lerpHex(scene.fog.color, A.fog, B.fog, t); scene.fog.near = A.fogNear + (B.fogNear - A.fogNear) * t; scene.fog.far = A.fogFar + (B.fogFar - A.fogFar) * t;
    lerpHex(hemi.color, A.hemiSky, B.hemiSky, t); lerpHex(hemi.groundColor, A.hemiGround, B.hemiGround, t); hemi.intensity = A.hemiI + (B.hemiI - A.hemiI) * t;
    lerpHex(sun.color, A.dirCol, B.dirCol, t); sun.intensity = A.dirI + (B.dirI - A.dirI) * t;
    renderer.toneMappingExposure = A.exposure + (B.exposure - A.exposure) * t;
    const envI = t < .5 ? ai : bi;
    if (envI !== currentEnv){ currentEnv = envI; scene.environment = envMaps[envI]; }
    envInfo.a = ai; envInfo.b = bi; envInfo.t = t;
    return envInfo;
  }
  // cloud layer look follows the sky; fog thickens while inside it
  function updateCloud(cam, chapterIdx){
    const u = cloudMat.uniforms; u.cam.value.copy(cam);
    cloud.position.x = cam.x; cloud.position.z = cam.z;
    const want = chapterIdx >= 3 || cam.y > CLOUD_Y - 160 ? 1 : 0;
    u.opacity.value += (want - u.opacity.value) * .05;
    cloud.visible = u.opacity.value > .01;
    u.sunCol.value.copy(skyMat.uniforms.sunCol.value);
    u.top.value.copy(skyMat.uniforms.hor.value).lerp(cB.setHex(0xffffff), .6);
    u.bot.value.copy(skyMat.uniforms.mid.value).lerp(cB.setHex(0x9a96aa), .5);
    // inside the cloud: white-out
    const inside = 1 - smooth(8, 40, Math.abs(cam.y - CLOUD_Y));
    if (inside > 0 && cloud.visible){
      scene.fog.color.lerp(cB.setHex(0xe8e4ee), inside * .9);
      scene.fog.near = scene.fog.near * (1 - inside) + 2 * inside; scene.fog.far = scene.fog.far * (1 - inside) + 90 * inside;
    }
    return inside;
  }

  /* ---------- geometry batcher (merge static parts per material) ---------- */
  class Batch {
    constructor(){ this.map = new Map(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); }
    add(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1){
      this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.s.set(sx, sy, sz));
      const g = geo.clone(); g.applyMatrix4(this.m);
      if (!this.map.has(mat)) this.map.set(mat, []); this.map.get(mat).push(g);
    }
    raw(g, mat){ const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); if (!this.map.has(mat)) this.map.set(mat, []); this.map.get(mat).push(n); }
    box(w, h, l, mat, x, y, z, rx = 0){ this.add(UNIT_BOX, mat, x, y, z, rx, 0, 0, w, h, l); }
    build(group, cast = false, receive = true){
      for (const [mat, list] of this.map){
        const indexed = list.some(g => g.index), nonIndexed = list.some(g => !g.index);
        const norm = (indexed && nonIndexed) ? list.map(g => g.index ? g.toNonIndexed() : g) : list;
        norm.forEach(g => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); });
        const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(norm); list.forEach(g => g.dispose()); norm.forEach(g => g.dispose());
        if (!merged) continue; merged.userData.disposable = true;
        const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast; mesh.receiveShadow = receive; group.add(mesh);
      }
      this.map.clear();
    }
  }
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
  function roadPlane(len){
    const g = new THREE.PlaneGeometry(HALF_W * 2, len, 1, 1); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 12);
    return g;
  }
  // box with world-scaled UVs (for giant cliff masses)
  function bigBox(w, h, d, scale){
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++){
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      const su = nx > .5 ? d : w, sv = ny > .5 ? d : h;
      uv.setXY(i, uv.getX(i) * su / scale, uv.getY(i) * sv / scale);
    }
    return g;
  }

  // ground level under the track (null = above the sea of clouds: no ground, only cloud)
  function groundLevel(base){ const g = base - GROUND_D; return g < CLOUD_Y - 20 ? g : null; }
  function supportBottom(base){ const g = groundLevel(base); return g === null ? CLOUD_Y - 40 : g; }

  /* ---------- climb geometry: quarter-pipe (0→90°), vertical wall, lip (90°→50°) ---------- */
  function evalPiece(p, s, out){
    const th = p.th0 + p.k * s;
    if (p.k === 0){ out.z = p.z0 + s * Math.cos(th); out.y = p.y0 + s * Math.sin(th); }
    else { out.z = p.z0 + (Math.sin(th) - Math.sin(p.th0)) / p.k; out.y = p.y0 - (Math.cos(th) - Math.cos(p.th0)) / p.k; }
    out.th = th; return out;
  }
  function climbShape(zc, yb, H){
    const lipRise = R2 * Math.cos(LIP), Lw = Math.max(4, H - R1 - lipRise);
    const pieces = []; let z = zc, y = yb, u = 0; const tmp = {};
    const add = (th0, k, len) => { const p = { th0, k, len, u0: u, z0: z, y0: y }; pieces.push(p); evalPiece(p, len, tmp); z = tmp.z; y = tmp.y; u += len; };
    add(0, 1 / R1, R1 * Math.PI / 2); add(Math.PI / 2, 0, Lw); add(Math.PI / 2, -1 / R2, R2 * (Math.PI / 2 - LIP));
    const c = { pieces, len: u, zc, yb, zw: zc + R1, yw: yb + R1 + Lw, zEnd: z, yEnd: y, uW0: R1 * Math.PI / 2, uW1: R1 * Math.PI / 2 + Lw, lip: LIP };
    // samples for contact tests (y is monotonic along the climb)
    const n = Math.ceil(u / .5) + 1; c.sy = new Float32Array(n); c.sz = new Float32Array(n); c.su = new Float32Array(n);
    for (let i = 0; i < n; i++){ const uu = Math.min(u, i * .5); climbAt(c, uu, tmp); c.sy[i] = tmp.y; c.sz[i] = tmp.z; c.su[i] = uu; }
    return c;
  }
  function climbAt(c, u, out = {}){
    u = clamp(u, 0, c.len);
    let p = c.pieces[0];
    for (const q of c.pieces) if (u >= q.u0) p = q;
    return evalPiece(p, Math.min(u - p.u0, p.len), out);
  }
  // world point of something sitting h metres off the climb surface
  function climbPoint(c, u, x, h, out = new THREE.Vector3()){
    const P = climbAt(c, u, tmpA);
    return out.set(x, P.y + Math.cos(P.th) * h, P.z - Math.sin(P.th) * h);
  }
  const tmpA = {};

  /* ---------- track segments ---------- */
  function newSeg(type, len, opts){
    const z0 = buildZ, z1 = buildZ + len, base = opts.base !== undefined ? opts.base : lastBase();
    const g = new THREE.Group(); trackGroup.add(g);
    const seg = { type, z0, z1, base, takeoffBase: base, h: opts.h || 0, group: g, obst: [], rings: [], cells: [], beacons: [], pads: [], safe: !!opts.safe, leadsGap: false, chapter: opts.chapter, runup: !!opts.runup };
    return seg;
  }
  function pushSeg(seg){ segs.push(seg); buildZ = seg.z1; return seg; }
  function makeSeg(type, len, opts = {}){
    const seg = newSeg(type, len, opts);
    const g = seg.group, z0 = seg.z0, z1 = seg.z1, base = seg.base;
    const Mt = Md.mats(), B = new Batch(), zc = (z0 + z1) / 2, bottom = supportBottom(base);
    if (type === 'flat'){
      const rp = roadPlane(len); B.add(rp, Mt.road, 0, base, zc); rp.dispose();
      B.box(HALF_W * 2 + 1, 1.4, len, Mt.concrete, 0, base - .86, zc);
      for (const s of [-1, 1]){
        B.box(.5, .85, len, Mt.concrete, s * (HALF_W + .25), base + .42, zc);
        B.box(.12, .14, len, Mt.rail, s * (HALF_W + .05), base + .78, zc);
        B.box(.04, .06, len, opts.runup ? Mt.cyanGlow : Mt.railGlow, s * (HALF_W - .02), base + .5, zc);
      }
      for (let zz = z0 + 14; zz < z1 - 6; zz += 34){ B.box(2.6, base - bottom, 2.6, Mt.concrete, 0, (bottom + base) / 2 - .7, zz); B.box(5, 1.2, 3.2, Mt.concrete, 0, base - 1.8, zz); }
      for (let zz = z0 + 10 + (segs.length % 2) * 17; zz < z1 - 4; zz += 34){
        const side = (Math.floor(zz / 34) % 2) ? 1 : -1;
        const lp = Md.lampPost(side); lp.position.set(side * (HALF_W + .7), base, zz); g.add(lp);
      }
    } else if (type === 'ramp'){
      const h = seg.h, L = Math.hypot(len, h), ang = Math.atan2(h, len);
      B.add(UNIT_BOX, Mt.chevron, 0, base + h / 2 - .5 * Math.cos(ang), zc, -ang, 0, 0, HALF_W * 2, 1, L);
      B.box(HALF_W * 2 + 1, h + 1.4, .8, Mt.hazard, 0, base + (h - 1.4) / 2, z1 - .4);
      B.box(HALF_W * 2 + 1, 1.4, len, Mt.concrete, 0, base - .86, zc);
      for (const s of [-1, 1]){
        B.add(UNIT_BOX, Mt.cyanGlow, s * (HALF_W - .1), base + h / 2 + .06, zc, -ang, 0, 0, .14, .1, L);
        B.box(.4, base - bottom, .4, Mt.concrete, s * (HALF_W - .5), (bottom + base) / 2, z1 - 1);
      }
      B.box(2.6, base - bottom, 2.6, Mt.concrete, 0, (bottom + base) / 2 - .7, zc);
    } else if (type === 'gap'){
      const from = lastBase();
      for (const s of [-1, 1]){
        const b1 = Md.beacon(); b1.position.set(s * (HALF_W - .3), from, z0 + .3); g.add(b1); seg.beacons.push(b1);
        const b2 = Md.beacon(); b2.position.set(s * (HALF_W - .3), opts.landBase, z1 - .3); g.add(b2); seg.beacons.push(b2);
      }
      B.box(HALF_W * 2 + 1, 1.4, .2, Mt.hazard, 0, from - .72, z0 + .1);
      B.box(HALF_W * 2 + 1, 1.4, .2, Mt.hazard, 0, opts.landBase - .72, z1 - .1);
      seg.base = opts.landBase; seg.takeoffBase = from;
    }
    B.build(g, false, true);
    return pushSeg(seg);
  }
  function lastBase(){ return segs.length ? segs[segs.length - 1].base : 0; }

  function addRing(seg, x, y, z, tilt = 0){
    const r = Md.ring(); r.position.set(x, y, z); r.rotation.x = -tilt; seg.group.add(r);
    const o = { mesh: r, x, y, z, got: false, phase: Math.random() * 6 }; seg.rings.push(o); return o;
  }
  function addCell(seg, x, y, z){
    const c = Md.airCell(); c.position.set(x, y, z); seg.group.add(c);
    seg.cells.push({ mesh: c, x, y, z, got: false, phase: Math.random() * 6 });
  }
  function addVehicle(seg, x, z, isTruck, speed){
    const v = isTruck ? Md.truck() : Md.trafficCar();
    v.group.position.set(x, seg.base, z); seg.group.add(v.group);
    const o = { ...v, x, z, base: seg.base, speed, active: false, seg, truck: isTruck, passed: false };
    seg.obst.push(o); return o;
  }
  function addGantry(seg, z, lines, style){ const g = Md.gantry(lines, style); g.position.set(0, seg.base, z); seg.group.add(g); return g; }
  function addPad(seg, x, z, len = 7){
    const m = Md.boostPad(len); m.position.set(x, seg.base + .03, z + len / 2); seg.group.add(m);
    seg.pads.push({ x, z0: z, z1: z + len, used: false, mesh: m });
  }

  /* ---------- the cliff ---------- */
  function makeClimb(chapterIdx){
    const C = CHAPTERS[chapterIdx], from = lastBase(), top = ALT[chapterIdx + 1];
    const shape = climbShape(buildZ, from, top - from);
    const seg = newSeg('climb', shape.zEnd - buildZ, { base: shape.yEnd, chapter: chapterIdx });
    Object.assign(seg, shape); seg.takeoffBase = from; seg.base = shape.yEnd;
    seg.blockers = []; seg.ice = []; seg.rockTrig = []; seg.rocks = []; seg.markers = [];
    const g = seg.group, Mt = Md.mats(), B = new Batch();
    const W2 = HALF_W + 1, n = Math.ceil(shape.len / 1.5) + 1, P = {};
    // samples along the surface
    const S = []; for (let i = 0; i < n; i++){ const u = Math.min(shape.len, i * 1.5); climbAt(shape, u, P); S.push({ u, z: P.z, y: P.y, th: P.th }); }
    // ribbon helper: strip between two (x, h) offsets along the climb
    const strip = (x0, h0, x1, h1, vScale, flip) => {
      const pos = [], uv = [], idx = [];
      S.forEach((s, i) => {
        const ny = Math.cos(s.th), nz = -Math.sin(s.th);
        pos.push(x0, s.y + ny * h0, s.z + nz * h0, x1, s.y + ny * h1, s.z + nz * h1);
        uv.push(0, s.u / vScale, 1, s.u / vScale);
        if (i){ const a = (i - 1) * 2; if (flip) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    };
    // road surface (+x on the left of the screen; normals face out of the wall)
    B.raw(strip(HALF_W, .01, -HALF_W, .01, 12, false), Mt.road);
    for (const s of [-1, 1]){
      const xo = s * (HALF_W + .05);
      B.raw(strip(xo, 0, xo, .9, 6, s > 0), Mt.concrete);            // inner barrier face
      B.raw(strip(s * (HALF_W + .55), 0, s * (HALF_W + .55), .9, 6, s < 0), Mt.concrete);
      B.raw(strip(xo, .9, s * (HALF_W + .55), .9, 6, s > 0), Mt.concrete);
      B.raw(strip(s * (HALF_W - .02), .46, s * (HALF_W - .02), .56, 6, s > 0), C.key === 'city' ? Mt.pinkGlow : Mt.cyanGlow);
    }
    // quarter-pipe fill
    const fillShape = (pts) => {
      const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: W2 * 2, bevelEnabled: false, curveSegments: 1 });
      geo.rotateY(-Math.PI / 2); geo.translate(W2, 0, 0);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 10, uv.getY(i) / 10);
      return geo;
    };
    const arcPts = S.filter(s => s.u <= shape.uW0 + .01).map(s => [s.z, s.y - .02]);
    arcPts.push([shape.zw + .8, shape.yb + R1], [shape.zw + .8, from - 1.4], [shape.zc, from - 1.4]);
    B.raw(fillShape(arcPts), Mt.concrete);
    const lipPts = S.filter(s => s.u >= shape.uW1 - .01).map(s => [s.z, s.y - .02]);
    lipPts.push([shape.zEnd + .6, shape.yEnd - .05], [shape.zEnd + .6, shape.yw - 2], [shape.zw, shape.yw - 2]);
    B.raw(fillShape(lipPts), Mt.concrete);
    B.build(g, false, true);

    // the mass of the cliff
    const gLow = supportBottom(from), D = 70, zBack = shape.zw + .6;
    const massMat = C.mat === 'ice' ? Md.smat('icewall') : C.mat === 'tower' ? null : Md.smat('cliff');
    const R = new Batch();
    const addMass = (w, h, d, x, y, z, mat, scale) => { const geo = bigBox(w, h, d, scale); R.add(geo, mat, x, y, z); geo.dispose(); };
    if (C.mat === 'tower'){
      // a mega skyscraper: the wall is its facade
      const v = (Math.random() * 4) | 0, w = 150, hLow = shape.yw - gLow;
      const t = Md.building(v, w, hLow, D); t.geometry.userData.disposable = true; t.position.set(0, gLow + hLow / 2, zBack + D / 2); t.receiveShadow = true; g.add(t);
      for (const s of [-1, 1]){
        const side = Md.building(v, (w - W2 * 2) / 2, shape.yEnd - shape.yw, D); side.geometry.userData.disposable = true; side.position.set(s * (W2 + (w - W2 * 2) / 4), shape.yw + (shape.yEnd - shape.yw) / 2, zBack + D / 2); g.add(side);
        // crown + antenna beacons
        R.box(4, 30, 4, Mt.pole, s * 50, shape.yEnd + 15, zBack + 30);
        const tip = Md.sprite(Mt.glowSprite, 0xff2020, 9); tip.position.set(s * 50, shape.yEnd + 31, zBack + 30); tip.userData.blink = Math.random() * 6; g.add(tip); dynamic.beacons.push({ sprite: tip, tile: g });
        // vertical neon signs on the facade
        for (let k = 0; k < 3; k++){
          const bb = new THREE.Mesh(new THREE.PlaneGeometry(9, 26), Md.smat('ad' + ((Math.random() * 6) | 0)));
          bb.geometry.userData.disposable = true; bb.rotation.set(0, Math.PI, Math.PI / 2 * (Math.random() < .5 ? 1 : -1));
          bb.position.set(s * rand(18, 64), from + rand(40, Math.max(60, shape.yw - from - 20)), zBack - .5); g.add(bb);
        }
      }
      const cTop = Md.building(v, W2 * 2, shape.yEnd - shape.yw, D - (shape.zEnd - shape.zw)); cTop.geometry.userData.disposable = true;
      cTop.position.set(0, shape.yw + (shape.yEnd - shape.yw) / 2 - .05, shape.zEnd + (D - (shape.zEnd - shape.zw)) / 2 + .6); g.add(cTop);
      // neighbouring towers make a skyline wall
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++){
        const bw = rand(40, 70), bh = (shape.yEnd - gLow) * rand(.55, 1.15), bx = s * (w / 2 + 10 + k * 80 + bw / 2);
        const b = Md.building((Math.random() * 4) | 0, bw, bh, rand(40, 80)); b.geometry.userData.disposable = true; b.position.set(bx, gLow + bh / 2, zBack + rand(10, 60)); g.add(b);
      }
    } else {
      const WIDE = 1400;
      addMass(WIDE, shape.yw - gLow, D, 0, (shape.yw + gLow) / 2, zBack + D / 2, massMat, 46);
      for (const s of [-1, 1]) addMass((WIDE - W2 * 2) / 2, shape.yEnd - shape.yw + .2, D, s * (W2 + (WIDE - W2 * 2) / 4), (shape.yEnd + shape.yw) / 2 - .1, zBack + D / 2, massMat, 46);
      const dTop = D - (shape.zEnd - shape.zw);
      addMass(W2 * 2, shape.yEnd - shape.yw, dTop, 0, (shape.yEnd + shape.yw) / 2 - .06, shape.zEnd + dTop / 2 + .6, massMat, 46);
      // buttresses and spires: rugged columns standing out of the face give the climb
      // vertical parallax (they stream past like skyscrapers while you drive up the wall)
      for (const s of [-1, 1]){
        let x = rand(13, 18);
        while (x < 520){
          const w = rand(12, 36) * (1 + x / 500), d = rand(5, 26) * (x < 40 ? .5 : 1) + x * .02;
          const spire = Math.random() < .22, top = spire ? shape.yEnd + rand(10, 70) : shape.yw - rand(0, Math.min(60, (shape.yw - from) * .5));
          addMass(w, top - gLow, d, s * (x + w / 2), (top + gLow) / 2, zBack - d / 2 + .3, massMat, 46);
          if (Math.random() < .5){ const cw = w * rand(.4, .8), ch = rand(8, 30); addMass(cw, ch, d * .7, s * (x + w / 2) + rand(-3, 3), top + ch / 2 - .5, zBack - d * .35, massMat, 46); }
          x += w + rand(0, 14);
        }
      }
      for (let k = 0; k < 18; k++){
        const s = Math.random() < .5 ? -1 : 1, x = s * rand(12, 40), y = rand(from + 6, shape.yw - 4);
        const w = rand(3, 8), h = rand(1.5, 4), d = rand(1.5, 4);
        addMass(w, h, d, x, y, zBack - d / 2 + .2, massMat, 46);
      }
      if (C.mat === 'ice'){
        for (let k = 0; k < 14; k++){
          const c = Md.crystal(); const sc = rand(2, 6); c.scale.set(sc * .6, sc * 2.4, sc * .6);
          c.position.set((Math.random() < .5 ? -1 : 1) * rand(12, 200), rand(from + 10, shape.yEnd), zBack - rand(0, 2)); c.rotation.set(rand(-1.2, -.4), rand(0, 6), rand(-.4, .4)); g.add(c);
        }
      }
      // waterfalls pour off the warm cliffs
      if (C.key === 'coast' || C.key === 'canyon'){
        for (let k = 0; k < 2; k++){
          const x = (k ? 1 : -1) * rand(26, 140), h = shape.yw - gLow;
          const wf = Md.waterfall(rand(8, 18), h); wf.position.set(x, gLow + h / 2, zBack - .8); g.add(wf);
          dynamic.falls.push({ x, y: gLow + 2, z: zBack - 3, w: wf.userData.w, tile: g });
        }
      }
    }
    R.build(g, false, true);

    // summit flags + banner
    for (const s of [-1, 1]){
      const f = Md.flag(C.key === 'summit' ? 0xffd27a : 0x7cffe6); f.position.set(s * (HALF_W + 1.4), shape.yEnd, shape.zEnd + 2); f.rotation.y = s * .3; g.add(f);
    }

    /* items on the wall (in surface coordinates: u along the climb, x across) */
    const W = C.wall, u0 = shape.uW0 + 8, u1 = Math.max(u0 + 8, shape.uW1 - 6), span = u1 - u0;
    const v3 = new THREE.Vector3();
    const at = (u, x, h) => climbPoint(shape, u, x, h, v3);
    // ring ladders
    const ladders = Math.max(1, Math.round(span / 70));
    for (let k = 0; k < ladders; k++){
      const uc = u0 + span * (k + .5) / ladders, x0 = pick(LANES), x1 = clamp(x0 + pick([-3.6, 0, 3.6]), -3.6, 3.6);
      for (let i = 0; i < 4; i++){ const u = uc - 9 + i * 6; at(u, x0 + (x1 - x0) * i / 3, 1.5); climbAt(shape, u, P); addRing(seg, v3.x, v3.y, v3.z, P.th); }
    }
    // air cells
    for (let k = 0; k < W.cells; k++){ const u = u0 + span * (k + .3) / W.cells + rand(-5, 5); at(u, pick(LANES), 1.2); addCell(seg, v3.x, v3.y, v3.z); }
    // wall boost pads
    seg.wpads = [];
    for (let k = 0; k < W.pads; k++){
      const u = u0 + span * (k + .65) / Math.max(1, W.pads), x = pick(LANES);
      climbAt(shape, u, P); const m = Md.boostPad(8); at(u, x, .04); m.position.copy(v3); m.rotation.x = -P.th; g.add(m);
      seg.wpads.push({ u, x, len: 8, used: false });
    }
    // overhang blocks (static, dodge by lane)
    for (let k = 0; k < W.blockers; k++){
      const u = u0 + 20 + (span - 30) * (k + .5) / W.blockers, x = pick(LANES);
      const b = Md.blocker(C.key === 'city'); climbAt(shape, u, P); at(u, x, 0); b.position.copy(v3); b.rotation.x = -P.th; g.add(b);
      seg.blockers.push({ u, x, w: 1.7 });
    }
    // ice sheets (slippery)
    for (let k = 0; k < W.ice; k++){
      const u = u0 + span * (k + .2) / W.ice, len = rand(18, 30), x = pick(LANES), w = 4.2;
      const m = Md.iceSheet(w, len); climbAt(shape, u + len / 2, P); at(u + len / 2, x, .03); m.position.copy(v3); m.rotation.x = -P.th; g.add(m);
      seg.ice.push({ u0: u, u1: u + len, x, w: w / 2 + .2 });
    }
    // rockfall triggers
    for (let k = 0; k < W.rocks; k++) seg.rockTrig.push({ u: u0 - 30 + (span + 10) * k / Math.max(1, W.rocks), fired: false });
    // height markers painted beside the road
    for (const left of [50, 100, 200]){
      const u = shape.uW0 + (shape.yEnd - left - shape.yb - R1); if (u < u0 || u > shape.uW1) continue;
      const sg = Md.wallSign('あと' + left + 'm', left <= 50 ? 'red' : 'blue'); at(u, -(HALF_W + 4.5), .3); sg.position.copy(v3); climbAt(shape, u, P); sg.rotation.x = -P.th; g.add(sg);
    }
    return pushSeg(seg);
  }

  /* ---------- generation: a plan of segment builders, executed lazily ---------- */
  function speedAt(z){ const k = chapterAt(z); return CHAPTERS[k].v * diff.vk; }
  function gapSeg(k, v, prog, fromRamp){
    const C = CHAPTERS[k];
    let L = v * rand(.55, .8 + prog * .5) * diff.gapK + (fromRamp ? 10 : 0);
    L = clamp(L, 12, 30 + 50 * prog * diff.gapK);
    const from = lastBase();
    let land = from;
    if (Math.random() < .4) land = from + pick([-3, -2, 1.5, 2.5]);
    const prev = segs[segs.length - 1];
    if (prev.type === 'flat' && prev.z1 - prev.z0 > 70) addGantry(prev, prev.z1 - 62, ['JUMP!', '谷 ' + Math.round(L) + 'm' + (land > from + .5 ? ' · 上り' : land < from - .5 ? ' · 下り' : '')], land > from + .5 ? 'red' : 'amber');
    const s = makeSeg('gap', L, { landBase: land, chapter: k });
    const n = Math.max(2, Math.round(L / 9)), peak = 4.5 + L * .06 + (fromRamp ? 2 : 0);
    const xs = rand(-2.4, 2.4), xe = clamp(xs + rand(-3, 3), -3.6, 3.6);
    for (let i = 1; i <= n; i++){ const t = i / (n + 1); addRing(s, xs + (xe - xs) * t, Math.max(from, land) + 1.5 + peak * Math.sin(Math.PI * t), s.z0 + L * t); }
    if (L > 28 && Math.random() < .6) addCell(s, xs, Math.max(from, land) + peak * .7, s.z0 + L * .5);
    return s;
  }
  function flatSeg(k, len, prog, calm){
    const s = makeSeg('flat', len, { chapter: k });
    let z = s.z0 + (calm ? 28 : 18);
    const ob = CHAPTERS[k].obst * diff.obst;  // chance per slot
    while (z < s.z1 - 14){
      const roll = Math.random();
      if (!calm && roll < ob){
        if (Math.random() < .15 + prog * .3 && z < s.z1 - 30){
          const sp = rand(7, 10);
          LANES.forEach(x => addVehicle(s, x, z, true, sp));
          addRing(s, 0, s.base + 6.2, z - 2); addRing(s, 0, s.base + 6.8, z + 6);
          z += 34;
        } else {
          const lanes = [...LANES].sort(() => Math.random() - .5).slice(0, Math.random() < .4 + prog * .3 ? 2 : 1);
          const sp = rand(8, 13);
          lanes.forEach(x => addVehicle(s, x + rand(-.3, .3), z + rand(-3, 3), false, sp));
          const free = LANES.find(x => !lanes.includes(x));
          if (free !== undefined && Math.random() < .5) addRing(s, free, s.base + 1.6, z);
          z += 26;
        }
      } else if (roll < .74){ addCell(s, pick(LANES), s.base + 1, z); z += 20; }
      else {
        const x0 = pick(LANES);
        for (let q = 0; q < 4; q++) addRing(s, x0 + Math.sin(q * .9) * 2.2, s.base + 2 + Math.sin(q / 3 * Math.PI) * 3.2, z + q * 6);
        z += 30;
      }
    }
    return s;
  }
  function planChapter(k){
    const C = CHAPTERS[k], prog = k / 5;
    const P = [];
    P.push(() => { if (k !== startChapter) chapterStart[k] = buildZ; });
    if (k === startChapter){
      P.push(() => {
        const s = makeSeg('flat', 240, { safe: true, chapter: k });
        addRing(s, 0, s.base + 2.6, s.z0 + 60); addRing(s, 0, s.base + 4.2, s.z0 + 70); addRing(s, 0, s.base + 5.4, s.z0 + 80); addCell(s, 3.6, s.base + 1, s.z0 + 112);
        addGantry(s, s.z0 + 30, ['CHAPTER ' + (k + 1), C.jp], 'green');
        if (k === 0) addGantry(s, s.z0 + 128, ['JUMP!', '谷まで 22m · 噴射長押し'], 'amber');
      });
      if (k === 0){
        P.push(() => { const s = makeSeg('gap', 16, { landBase: 0, chapter: 0 }); addRing(s, 0, 5.2, s.z0 + 8); });
        P.push(() => { const s = makeSeg('flat', 120, { safe: true, chapter: 0 }); addCell(s, 0, 1, s.z0 + 30); addVehicle(s, 3.6, s.z0 + 70, false, 10); addRing(s, -3.6, 2.4, s.z0 + 90); addRing(s, -3.6, 3.4, s.z0 + 98); });
      }
    } else {
      // summit plaza: the reward stretch right after the edge
      P.push(() => {
        const s = makeSeg('flat', 130, { safe: true, chapter: k });
        addGantry(s, s.z0 + 70, ['SUMMIT ' + k + ' 制覇', '標高 ' + ALT[k] + 'm'], 'blue');
        addGantry(s, s.z0 + 118, ['CHAPTER ' + (k + 1), C.jp], 'green');
        for (let i = 0; i < 5; i++) addRing(s, Math.sin(i) * 3, s.base + 1.8 + i * .5, s.z0 + 84 + i * 6);
      });
    }
    // the road
    let roadLeft = C.road;
    const road = () => {
      const last = segs[segs.length - 1], v = CHAPTERS[k].v * diff.vk;
      if (last.type === 'ramp' && last.leadsGap){ gapSeg(k, v, prog, true); return; }
      if (last.type === 'gap' || last.type === 'ramp'){ flatSeg(k, rand(48, 70), prog, true); return; }
      const r = Math.random();
      if (r < C.gap) gapSeg(k, v, prog, false);
      else if (r < C.gap + .14){ const s = makeSeg('ramp', 18, { h: 3.2, chapter: k }); s.leadsGap = Math.random() < .65; }
      else flatSeg(k, rand(70, 120), prog, false);
    };
    P.push(function roadStep(){
      const z0 = buildZ; road(); roadLeft -= buildZ - z0;
      const last = segs[segs.length - 1];
      if (roadLeft > 0 || last.type === 'gap' || last.type === 'ramp') plan.unshift(roadStep);
    });
    // run-up: calm, boost pads, warning gantries
    P.push(() => {
      const s = makeSeg('flat', 190, { safe: true, chapter: k, runup: true });
      addGantry(s, s.z0 + 16, ['絶壁まで 170m', 'パッドで加速 · AIRは壁に温存'], 'red');
      addPad(s, 0, s.z0 + 54); addPad(s, -3.6, s.z0 + 92); addPad(s, 3.6, s.z0 + 92); addPad(s, 0, s.z0 + 132);
      addCell(s, pick([-3.6, 3.6]), s.base + 1, s.z0 + 72);
      for (let i = 0; i < 3; i++) addRing(s, 0, s.base + 1.6, s.z0 + 150 + i * 8);
      addGantry(s, s.z1 - 8, ['▲ CLIMB', C.goal], 'amber');
    });
    P.push(() => { makeClimb(k); });
    if (k === CHAPTERS.length - 1){
      P.push(() => { chapterStart[k + 1] = buildZ; });
      P.push(() => {
        const s = makeSeg('flat', 600, { safe: true, chapter: k + 1 });
        s.goalZ = s.z0 + 150;
        const arch = Md.goalArch(); arch.position.set(0, s.base, s.goalZ); s.group.add(arch);
        for (let i = 0; i < 8; i++) addRing(s, Math.sin(i * .8) * 3, s.base + 2 + Math.sin(i / 7 * Math.PI) * 4, s.z0 + 60 + i * 9);
      });
      P.push(function cruise(){ makeSeg('flat', 300, { safe: true, chapter: k + 1 }); plan.unshift(cruise); });
    }
    return P;
  }
  function step(){
    if (!plan.length){ if (nextChapter < CHAPTERS.length) plan.push(...planChapter(nextChapter++)); else return false; }
    const f = plan.shift(); f(); return true;
  }

  /* ---------- scenery tiles ---------- */
  // ground runs (z ranges with constant base), split exactly at cliff faces
  function groundRuns(z0, z1){
    const runs = [];
    const push = (a, b, base) => { if (b - a < .01) return; const l = runs[runs.length - 1]; if (l && Math.abs(l.base - base) < .01 && Math.abs(l.z1 - a) < .01) l.z1 = b; else runs.push({ z0: a, z1: b, base }); };
    let z = z0;
    for (const s of segs){
      if (s.z1 <= z || s.z0 >= z1) continue;
      if (s.z0 > z) push(z, s.z0, s.takeoffBase);
      const a = Math.max(z, s.z0), b = Math.min(z1, s.z1);
      if (s.type === 'climb'){ push(a, Math.min(b, s.zw), s.takeoffBase); push(Math.max(a, s.zw), b, s.base); }
      else if (s.type === 'gap'){ const m = (s.z0 + s.z1) / 2; push(a, Math.min(b, m), s.takeoffBase); push(Math.max(a, m), b, s.base); }
      else push(a, b, s.base);
      z = b;
    }
    if (z < z1) push(z, z1, segs.length ? segs[segs.length - 1].base : 0);
    return runs;
  }
  function baseAt(z){
    for (const s of segs){ if (z >= s.z0 && z < s.z1){ if (s.type === 'climb') return z < s.zw ? s.takeoffBase : s.base; if (s.type === 'gap') return z < (s.z0 + s.z1) / 2 ? s.takeoffBase : s.base; return s.base; } }
    return segs.length ? (z < segs[0].z0 ? segs[0].takeoffBase : segs[segs.length - 1].base) : 0;
  }
  function chapterAt(z){ let k = 0; for (let i = 0; i < chapterStart.length; i++) if (chapterStart[i] !== undefined && z >= chapterStart[i]) k = i; return Math.min(k, CHAPTERS.length - 1); }
  function skyIndexAt(z){ let k = 0; for (let i = 0; i < chapterStart.length; i++) if (chapterStart[i] !== undefined && z >= chapterStart[i]) k = i; return k; }

  function buildTile(z0){
    const k = chapterAt(z0 + TILE / 2), key = CHAPTERS[k].scen;
    const g = new THREE.Group(); sceneryGroup.add(g);
    const runs = groundRuns(z0, z0 + TILE);
    const groundOf = z => { for (const r of runs) if (z >= r.z0 && z < r.z1) return groundLevel(r.base); return groundLevel(baseAt(z)); };
    for (const r of runs){
      const gl = groundLevel(r.base); if (gl === null) continue;
      const mat = key === 'canyon' ? 'sand' : key === 'city' ? 'cityground' : key === 'coast' ? 'sand' : 'snow';
      if (key === 'coast'){
        const land = new THREE.Mesh(new THREE.PlaneGeometry(950, r.z1 - r.z0).rotateX(-Math.PI / 2), Md.smat('sand'));
        land.position.set(440, gl, (r.z0 + r.z1) / 2); land.geometry.userData.disposable = true; g.add(land);
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, r.z1 - r.z0).rotateX(-Math.PI / 2), Md.smat('sea'));
        sea.position.set(-660, gl - .6, (r.z0 + r.z1) / 2); sea.geometry.userData.disposable = true; g.add(sea);
        const beach = new THREE.Mesh(new THREE.PlaneGeometry(80, r.z1 - r.z0).rotateX(-Math.PI / 2), Md.smat('sand'));
        beach.position.set(-30, gl - .3, (r.z0 + r.z1) / 2); beach.geometry.userData.disposable = true; g.add(beach);
      } else {
        const gr = new THREE.Mesh(new THREE.PlaneGeometry(1800, r.z1 - r.z0).rotateX(-Math.PI / 2), Md.smat(mat));
        gr.position.set(0, gl, (r.z0 + r.z1) / 2); gr.geometry.userData.disposable = true; g.add(gr);
      }
    }
    const zr = () => z0 + Math.random() * TILE;
    const place = (o, x, z, dy = 0) => { const gl = groundOf(z); if (gl === null) return false; o.position.set(x, gl + dy, z); g.add(o); return true; };
    const sky = runs.every(r => groundLevel(r.base) === null);
    if (sky){
      // above the clouds: spires and giant peaks rising out of the cloud sea
      const top = baseAt(z0 + TILE / 2);
      for (const s of [-1, 1]){
        for (let q = 0; q < 2; q++){ const p = Md.icePeak((Math.random() * 99) | 0); const r = rand(80, 200), h = top - CLOUD_Y + rand(60, 320); p.scale.set(r, h / 1.4, r); p.position.set(s * rand(180, 700), CLOUD_Y - 40 + h / 2, zr()); g.add(p); }
        const sp = Md.icePeak((Math.random() * 99) | 0); const r2 = rand(16, 34), h2 = top - CLOUD_Y + rand(-30, 30); sp.scale.set(r2, h2 / 1.4, r2); sp.position.set(s * rand(40, 110), CLOUD_Y - 30 + h2 / 2, zr()); g.add(sp);
        if (Math.random() < .5){ const c = Md.crystal(); const sc = rand(3, 7); c.scale.set(sc * .6, sc * 2.2, sc * .6); c.position.set(s * rand(30, 120), top + rand(-20, 30), zr()); c.rotation.set(rand(-.3, .3), rand(0, 6), rand(-.3, .3)); c.userData.float = Math.random() * 6; c.userData.y0 = c.position.y; g.add(c); dynamic.flyers.push({ sprite: c, tile: g, float: true }); }
      }
    } else if (key === 'coast'){
      for (let q = 0; q < 6; q++){ const p = Md.palm(); const sc = rand(.9, 1.5); p.scale.setScalar(sc); p.rotation.y = rand(0, 6); place(p, rand(14, 90), zr()); }
      for (let q = 0; q < 3; q++){ const b = Md.boulder((Math.random() * 99) | 0); const r = rand(2, 7); b.scale.set(r, r * .7, r); place(b, rand(-40, -14), zr(), r * .1); }
      for (let q = 0; q < 2; q++){ const m = Md.mesa((Math.random() * 99) | 0); const r = rand(40, 90), hh = rand(40, 110); m.scale.set(r, hh, r); place(m, rand(180, 600), zr(), hh / 2 - 5); }
      if (Math.random() < .5){ const lh = Md.lighthouse(); place(lh, -rand(70, 140), zr()); }
      if (Math.random() < .6){ const b = Md.boat(); place(b, -rand(80, 420), zr(), -.4); b.rotation.y = rand(0, 6); }
    } else if (key === 'canyon'){
      for (const s of [-1, 1]){
        const wall = Md.mesa((Math.random() * 99) | 0); const h = rand(70, 120); wall.scale.set(rand(28, 40), h, TILE * .62); place(wall, s * rand(78, 110), z0 + TILE / 2, h / 2 - 4);
        for (let q = 0; q < 2; q++){ const m = Md.mesa((Math.random() * 99) | 0); const r = rand(30, 90), hh = rand(50, 160); m.scale.set(r, hh, r); place(m, s * rand(180, 620), zr(), hh / 2 - 5); }
        for (let q = 0; q < 3; q++){ const b = Md.boulder((Math.random() * 99) | 0); const r = rand(2, 7); b.scale.set(r, r * .7, r); place(b, s * rand(14, 70), zr(), r * .2); }
        for (let q = 0; q < 3; q++){ const c = Md.cactus(); c.scale.setScalar(rand(.8, 1.4)); c.rotation.y = Math.random() * 6; place(c, s * rand(12, 70), zr()); }
      }
      if (Math.random() < .25){ const a = Md.arch(); a.scale.setScalar(rand(1, 1.6)); a.rotation.y = Math.PI / 2 + rand(-.4, .4); place(a, pick([-1, 1]) * rand(140, 260), zr()); }
    } else if (key === 'city'){
      for (const s of [-1, 1]){
        for (let q = 0; q < 3; q++){ const w = rand(18, 30), d = rand(18, 34), h = rand(50, 150); const b = Md.building((Math.random() * 4) | 0, w, h, d); b.geometry.userData.disposable = true; place(b, s * (rand(26, 40) + w / 2), z0 + 20 + q * 40 + rand(-6, 6), h / 2); }
        for (let q = 0; q < 3; q++){ const w = rand(30, 60), d = rand(30, 60), h = rand(120, 320); const b = Md.building((Math.random() * 4) | 0, w, h, d); b.geometry.userData.disposable = true; if (place(b, s * rand(110, 420), zr(), h / 2) && Math.random() < .6){ const tip = Md.sprite(Md.mats().glowSprite, 0xff2020, 8); tip.position.set(b.position.x, b.position.y + h / 2 + 4, b.position.z); tip.userData.blink = Math.random() * 6; g.add(tip); dynamic.beacons.push({ sprite: tip, tile: g }); } }
        if (Math.random() < .55){ const z = zr(), gl = groundOf(z); if (gl !== null){ const bb = Md.billboard((Math.random() * 6) | 0); bb.position.set(s * rand(16, 22), baseAt(z), z); bb.rotation.y = s * -.35 + Math.PI; const pole = Md.box(.5, 60, .5, Md.mats().pole, 0, -26, -.3); bb.add(pole); g.add(bb); } }
      }
      for (let q = 0; q < 2; q++){ const f = Md.sprite(Md.mats().glowSprite, Math.random() < .5 ? 0xffe2b0 : 0xff4060, 4); f.position.set(rand(-300, 300), baseAt(z0) + rand(15, 60), zr()); f.userData.v = new THREE.Vector3(rand(-30, 30), 0, rand(-20, 30)); g.add(f); dynamic.flyers.push({ sprite: f, tile: g }); }
    } else {
      for (const s of [-1, 1]){
        for (let q = 0; q < 2; q++){ const p = Md.icePeak((Math.random() * 99) | 0); const r = rand(60, 160), h = rand(120, 300); p.scale.set(r, h / 1.4, r); place(p, s * rand(160, 600), zr(), h / 2 - 10); }
        const p2 = Md.icePeak((Math.random() * 99) | 0); const r2 = rand(25, 45), h2 = rand(60, 110); p2.scale.set(r2, h2 / 1.4, r2 * 1.5); place(p2, s * rand(70, 100), zr(), h2 / 2 - 6);
        for (let q = 0; q < 6; q++){ const t = Md.pine(); t.scale.setScalar(rand(1, 2.2)); place(t, s * rand(12, 80), zr()); }
      }
    }
    tiles.push({ z0, z1: z0 + TILE, group: g });
  }
  function disposeGroup(g){
    g.traverse(o => {
      if (o.geometry && o.geometry.userData.disposable) o.geometry.dispose();
      if (o.material){ const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.userData.own || (o.isSprite && m !== Md.mats().glowSprite)) m.dispose(); }); }
    });
  }

  /* ---------- API ---------- */
  function reset(difficulty, fromChapter = 0){
    diff = difficulty;
    segs.forEach(s => { trackGroup.remove(s.group); disposeGroup(s.group); });
    tiles.forEach(t => { sceneryGroup.remove(t.group); disposeGroup(t.group); });
    segs = []; tiles = []; plan = []; chapterStart.length = 0;
    startChapter = fromChapter; nextChapter = fromChapter;
    buildZ = -90; tileZ = -TILE * 2;
    dynamic.beacons = []; dynamic.flyers = []; dynamic.falls = [];
    chapterStart[fromChapter] = -1e9;
    // a short lead-in so the camera has road behind the car
    makeSeg('flat', 90, { base: ALT[fromChapter], safe: true, chapter: fromChapter });
  }
  function runwayOnly(difficulty, chapter = 0){
    reset(difficulty, chapter);
    makeSeg('flat', 320, { safe: true, chapter });
    for (let z = -TILE * 2; z < 600; z += TILE) buildTile(z);
    tileZ = 600;
  }
  function ensure(z){
    while (buildZ < z + 900) if (!step()) break;
    while (tileZ < z + 700){ buildTile(tileZ); tileZ += TILE; }
    while (segs.length && segs[0].z1 < z - 70){ const s = segs.shift(); trackGroup.remove(s.group); disposeGroup(s.group); }
    while (tiles.length && tiles[0].z1 < z - 260){ const t = tiles.shift(); sceneryGroup.remove(t.group); disposeGroup(t.group); const keep = b => b.tile !== t.group; dynamic.beacons = dynamic.beacons.filter(keep); dynamic.flyers = dynamic.flyers.filter(keep); }
  }

  function floorAt(z, x){
    if (Math.abs(x) > HALF_W + .5) return null;
    for (let i = 0; i < segs.length; i++){
      const s = segs[i];
      if (z >= s.z0 && z < s.z1){
        if (s.type === 'flat') return { h: s.base, slope: 0, seg: s };
        if (s.type === 'ramp') return { h: s.base + s.h * (z - s.z0) / (s.z1 - s.z0), slope: s.h / (s.z1 - s.z0), seg: s };
        return null;
      }
    }
    return null;
  }
  function climbStartAt(z){ for (const s of segs) if (s.type === 'climb' && z >= s.z0 && z < s.zw) return s; return null; }
  // airborne point inside a cliff?  -> { seg, u, th }
  function climbContact(z, y){
    for (const s of segs){
      if (s.type !== 'climb' || z < s.z0 - .5 || z > s.zEnd + .5 || y < s.yb + .05 || y > s.yEnd - .4) continue;
      let lo = 0, hi = s.sy.length - 1;
      while (hi - lo > 1){ const m = (lo + hi) >> 1; if (s.sy[m] < y) lo = m; else hi = m; }
      const t = (y - s.sy[lo]) / Math.max(1e-4, s.sy[hi] - s.sy[lo]);
      const zs = s.sz[lo] + (s.sz[hi] - s.sz[lo]) * t;
      if (z >= zs - .05){ const u = s.su[lo] + (s.su[hi] - s.su[lo]) * t; return { seg: s, u, th: climbAt(s, u, {}).th }; }
    }
    return null;
  }
  function nextClimb(z){ for (const s of segs) if (s.type === 'climb' && s.zEnd > z) return s; return null; }
  function runupFor(climb){ const i = segs.indexOf(climb); return i > 0 ? segs[i - 1] : null; }

  let t = 0;
  function update(dt, playerZ){
    t += dt;
    Md.flameUniforms.time.value = t;
    skyMat.uniforms.time.value = t; cloudMat.uniforms.time.value = t;
    for (const s of segs){
      if (s.z1 < playerZ - 40 || s.z0 > playerZ + 600) continue;
      for (const r of s.rings){ if (!r.got) r.mesh.rotation.z = t * .6 + r.phase; }
      for (const c of s.cells){ if (!c.got){ c.mesh.rotation.y = t * 1.6 + c.phase; } }
      for (const b of s.beacons){ b.userData.blink.visible = Math.sin(t * 9 + b.position.z) > 0; }
      for (const o of s.obst){
        if (!o.active && o.z - playerZ < 170) o.active = true;
        if (o.active){
          const lim = s.z1 - o.l / 2 - 3;
          let sp = o.speed; if (o.z >= lim - 6){ sp = Math.max(0, (lim - o.z) * 1.5); o.braking = true; }
          o.z = Math.min(lim, o.z + sp * dt); o.group.position.z = o.z - (o.truck ? .5 : 0);
          if (o.group.userData.brake) o.group.userData.brake.material = o.braking ? Md.mats().brakeGlow : Md.mats().redGlow;
        }
      }
    }
    for (const b of dynamic.beacons){ b.sprite.visible = Math.sin(t * 3 + b.sprite.userData.blink) > .2; }
    for (const f of dynamic.flyers){ if (f.float){ f.sprite.position.y = f.sprite.userData.y0 + Math.sin(t * .6 + f.sprite.userData.float) * 3; f.sprite.rotation.y += dt * .3; } else f.sprite.position.addScaledVector(f.sprite.userData.v, dt); }
  }

  return {
    init, reset, runwayOnly, ensure, update, floorAt, climbStartAt, climbContact, climbAt, climbPoint, nextClimb, runupFor, setEnv, updateCloud, setShadowSize,
    chapterAt, skyIndexAt, baseAt, speedAt,
    get segs(){ return segs; }, get sky(){ return sky; }, get sun(){ return sun; }, get fill(){ return fill; }, get chapterStart(){ return chapterStart; }, get dynamic(){ return dynamic; },
    ZONES, CHAPTERS, ALT, HALF_W, LANES, CLOUD_Y,
  };
})();
