/*!
 * hazorasp-bg.js — WebGL displacement-crossfade fon moduli
 * Palitra-neytral: faqat rasm qatlamini qo'shadi. Ranglarni, shriftlarni,
 * mavjud kontent stilini O'ZGARTIRMAYDI. Matn o'qilishi uchun ixtiyoriy
 * "scrim" (qorong'ilashtiruvchi qatlam) config orqali beriladi.
 *
 * Bog'liqlik: three.js (r128+). Agar window.THREE mavjud bo'lmasa,
 * config.threeUrl dan yuklab oladi.
 *
 * Foydalanish:
 *   HazoraspBG.init({
 *     images: ['images/sex-01-koridor.jpg', ...],  // MAJBURIY
 *     hold: 5.2, trans: 1.7, intensity: 1,
 *     zIndex: 0,                 // fon canvas z-index (kontentdan past bo'lsin)
 *     scrim: null,               // ixtiyoriy CSS background (o'qilish uchun)
 *     mount: document.body,
 *     threeUrl: 'vendor/three.min.js'
 *   });
 */
(function (global) {
  'use strict';

  function ensureThree(url) {
    return new Promise(function (res, rej) {
      if (global.THREE) return res(global.THREE);
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function () { global.THREE ? res(global.THREE) : rej(new Error('THREE topilmadi')); };
      s.onerror = function () { rej(new Error('three.js yuklanmadi: ' + url)); };
      document.head.appendChild(s);
    });
  }

  var VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }';
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTexA, uTexB;',
    'uniform float uAspectA, uAspectB, uProgress, uTime, uIntensity;',
    'uniform vec2 uMouse, uRes;',
    'varying vec2 vUv;',
    'vec2 coverUv(vec2 uv,float sa,float ia){vec2 s=vec2(1.0); if(sa>ia){s.y=ia/sa;}else{s.x=sa/ia;} return (uv-0.5)*s+0.5;}',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.0-2.0*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'void main(){',
    '  float sa=uRes.x/uRes.y;',
    '  vec2 uvA=coverUv(vUv,sa,uAspectA);',
    '  vec2 uvB=coverUv(vUv,sa,uAspectB);',
    '  vec2 par=(uMouse-0.5)*0.03*uIntensity;',
    '  vec2 drift=vec2(sin(uTime*0.12+vUv.y*3.0),cos(uTime*0.10+vUv.x*3.0))*0.0035*uIntensity;',
    '  uvA+=par+drift; uvB+=par+drift;',
    '  float n=noise(vUv*3.2+uTime*0.04);',
    '  float p=uProgress;',
    '  float disp=0.32*sin(p*3.14159)*uIntensity;',
    '  vec3 ca=texture2D(uTexA,uvA+vec2((n-0.5)*disp,(n-0.5)*disp*0.4)).rgb;',
    '  vec3 cb=texture2D(uTexB,uvB-vec2((n-0.5)*disp,(n-0.5)*disp*0.4)).rgb;',
    '  float m=smoothstep(0.0,1.0,(p*1.35-0.18)+(n-0.5)*0.35);',
    '  vec3 col=mix(ca,cb,clamp(m,0.0,1.0));',
    '  float vig=smoothstep(1.2,0.35,distance(vUv,vec2(0.5)));',
    '  col*=mix(0.72,1.0,vig);',
    '  gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  function init(cfg) {
    cfg = cfg || {};
    if (!cfg.images || !cfg.images.length) { console.warn('[HazoraspBG] images bo\'sh'); return; }
    var opt = {
      images: cfg.images,
      hold: cfg.hold != null ? cfg.hold : 5.2,
      trans: cfg.trans != null ? cfg.trans : 1.7,
      intensity: cfg.intensity != null ? cfg.intensity : 1,
      zIndex: cfg.zIndex != null ? cfg.zIndex : 0,
      scrim: cfg.scrim || null,
      parallax: cfg.parallax !== false,
      mount: cfg.mount || document.body,
      threeUrl: cfg.threeUrl || 'vendor/three.min.js'
    };
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Canvas
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    var cs = canvas.style;
    cs.position = 'fixed'; cs.inset = '0'; cs.width = '100%'; cs.height = '100%';
    cs.zIndex = String(opt.zIndex); cs.display = 'block'; cs.pointerEvents = 'none';
    opt.mount.insertBefore(canvas, opt.mount.firstChild);

    // Ixtiyoriy scrim (palitrani o'zgartirmaydi — shaffof gradient)
    var scrimEl = null;
    if (opt.scrim) {
      scrimEl = document.createElement('div');
      scrimEl.setAttribute('aria-hidden', 'true');
      var ss = scrimEl.style;
      ss.position = 'fixed'; ss.inset = '0'; ss.zIndex = String(opt.zIndex + 1);
      ss.pointerEvents = 'none'; ss.background = opt.scrim;
      opt.mount.insertBefore(scrimEl, canvas.nextSibling);
    }

    ensureThree(opt.threeUrl).then(function (THREE) {
      run(THREE, canvas, opt, reduce);
    }).catch(function (e) {
      console.warn('[HazoraspBG] ' + e.message + ' — fon o\'chirildi, sayt normal ishlaydi.');
      canvas.remove(); if (scrimEl) scrimEl.remove();
    });

    return { canvas: canvas, setScrim: function (css) {
      if (!css) { if (scrimEl) { scrimEl.remove(); scrimEl = null; } return; }
      if (!scrimEl) {
        scrimEl = document.createElement('div');
        scrimEl.setAttribute('aria-hidden', 'true');
        var ss = scrimEl.style;
        ss.position = 'fixed'; ss.inset = '0'; ss.zIndex = String(opt.zIndex + 1);
        ss.pointerEvents = 'none';
        opt.mount.insertBefore(scrimEl, canvas.nextSibling);
      }
      scrimEl.style.background = css;
    } };
  }

  function run(THREE, canvas, opt, reduce) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    var U = {
      uTexA: { value: null }, uTexB: { value: null },
      uAspectA: { value: 1 }, uAspectB: { value: 1 },
      uProgress: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 }, uIntensity: { value: opt.intensity }, uRes: { value: new THREE.Vector2(1, 1) }
    };
    var mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    var loader = new THREE.TextureLoader();
    var tex = [], asp = [], loaded = 0;
    opt.images.forEach(function (src, i) {
      loader.load(src, function (t) {
        t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
        tex[i] = t; asp[i] = t.image.width / t.image.height; loaded++;
        if (loaded === 1) start();
      }, undefined, function () { console.warn('[HazoraspBG] rasm yuklanmadi:', src); });
    });

    var idxA = 0, idxB = 1;
    function setPair(a, b) {
      U.uTexA.value = tex[a]; U.uAspectA.value = asp[a] || 1;
      U.uTexB.value = tex[b] || tex[a]; U.uAspectB.value = asp[b] || asp[a] || 1;
    }
    function resize() {
      var w = global.innerWidth, h = global.innerHeight;
      renderer.setSize(w, h, false); U.uRes.value.set(w, h);
    }
    global.addEventListener('resize', resize);

    var target = { x: 0.5, y: 0.5 };
    if (opt.parallax && !reduce) {
      global.addEventListener('pointermove', function (e) {
        target.x = e.clientX / global.innerWidth;
        target.y = 1.0 - e.clientY / global.innerHeight;
      }, { passive: true });
    }

    var HOLD = opt.hold, TRANS = opt.trans, phase = 'hold', tPhase = 0;
    var raf = null, last = performance.now(), t0 = performance.now(), playing = true;

    function loop() {
      if (!playing || document.hidden) { raf = null; return; }
      var now = performance.now(), dt = (now - last) / 1000; last = now;
      U.uTime.value = (now - t0) / 1000;
      U.uMouse.value.x += (target.x - U.uMouse.value.x) * 0.06;
      U.uMouse.value.y += (target.y - U.uMouse.value.y) * 0.06;
      if (tex.length > 1 && !reduce) {
        tPhase += dt;
        if (phase === 'hold') {
          if (tPhase >= HOLD) { phase = 'transition'; tPhase = 0; idxB = (idxA + 1) % opt.images.length; setPair(idxA, idxB); }
        } else {
          U.uProgress.value = Math.min(tPhase / TRANS, 1);
          if (tPhase >= TRANS) { idxA = idxB; U.uProgress.value = 0; setPair(idxA, (idxA + 1) % opt.images.length); phase = 'hold'; tPhase = 0; }
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && playing && !raf) { last = performance.now(); loop(); }
    });

    function start() { setPair(0, opt.images.length > 1 ? 1 : 0); resize(); renderer.render(scene, camera); loop(); }
  }

  global.HazoraspBG = { init: init };
})(window);
