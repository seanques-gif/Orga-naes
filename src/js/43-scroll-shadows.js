    // SUBSECTION: Scroll Shadows
    function checkScroll() {
      const list = root.querySelector('.pf-split-list');
      if (!list) return;
      if (list.scrollTop > 400) {
        btn.classList.add('pf-visible');
        clearTimeout(_scrollTopTimer);
        _scrollTopTimer = setTimeout(function() { btn.classList.remove('pf-visible'); }, 1500);
      } else {
        btn.classList.remove('pf-visible');
      }
    }
    let _hasScrolled = false;
    function checkOverscroll() {}
    const _scrollInterval = setInterval(function() {
      const list = root.querySelector('.pf-split-list');
      if (list && !list._scrollTopBound) {
        list._scrollTopBound = true;
        list.addEventListener('scroll', function() {
          _hasScrolled = true;
          if (_scrollRaf) return;
          _scrollRaf = requestAnimationFrame(function() { _scrollRaf = null; checkScroll(); checkOverscroll(list); });
        }, { passive: true });
        clearInterval(_scrollInterval);
      }
    }, 500);
  })();

})();

// #11 PWA - Register service worker
