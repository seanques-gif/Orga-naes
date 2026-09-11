  // SUBSECTION: Particle Background (Visibility Pause)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopParticles(); }
    else { if (root.classList.contains('pf-card-mode')) startParticles(); }
  });

