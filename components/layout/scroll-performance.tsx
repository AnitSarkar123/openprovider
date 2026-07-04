'use client';

import { useEffect } from 'react';

export function ScrollPerformance() {
  useEffect(() => {
    const root = document.documentElement;
    let scrollTimeout = 0;
    let frame = 0;
    let scrolling = false;

    function setScrolling() {
      if (scrolling) {
        return;
      }

      scrolling = true;
      root.dataset.scrolling = 'true';
    }

    function clearScrolling() {
      scrolling = false;
      delete root.dataset.scrolling;
    }

    function handleScroll() {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          setScrolling();
        });
      }

      window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(clearScrolling, 240);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.clearTimeout(scrollTimeout);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      clearScrolling();
    };
  }, []);

  return null;
}
