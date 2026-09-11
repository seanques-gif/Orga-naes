  // SUBSECTION: Particle Background
  const ACCENT_FALLBACK = '#ffffff'; // matches new white --accent
  let _particleAnim = null;
  function startParticles() {
    let pc = document.getElementById('pf-particles');
    if (!pc) { pc = document.createElement('canvas'); pc.id = 'pf-particles'; pc.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:var(--z-base);opacity:0.35;'; document.getElementById('pf-canvas-wrap').prepend(pc); }
    const ctx = pc.getContext('2d');
    const particles = Array.from({ length: 30 }, () => ({ x: Math.random() * 2200, y: Math.random() * 1600, vy: -0.2 - Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.2, r: 1.5 + Math.random() * 1.5 }));
    function draw() {
      pc.width = pc.parentElement.clientWidth; pc.height = pc.parentElement.clientHeight;
      ctx.clearRect(0, 0, pc.width, pc.height);
      const _pa = (getComputedStyle(root).getPropertyValue('--accent') || ACCENT_FALLBACK).trim();
      const _pm = _pa.match(/^#([0-9a-fA-F]{6})$/);
      const _pr = _pm ? parseInt(_pm[1].slice(0,2),16) : 255, _pg = _pm ? parseInt(_pm[1].slice(2,4),16) : 255, _pb = _pm ? parseInt(_pm[1].slice(4,6),16) : 255; // white fallbacks match ACCENT_FALLBACK = #ffffff
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = pc.height + 10; p.x = Math.random() * pc.width; }
        if (p.x < 0) p.x = pc.width; if (p.x > pc.width) p.x = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + _pr + ',' + _pg + ',' + _pb + ',0.6)'; ctx.fill();
      });
      _particleAnim = requestAnimationFrame(draw);
    }
    draw();
  }
  function stopParticles() { if (_particleAnim) { cancelAnimationFrame(_particleAnim); _particleAnim = null; } }

