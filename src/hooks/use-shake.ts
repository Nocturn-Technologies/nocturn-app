"use client";

import { useEffect } from 'react';

export function useShake(callback: () => void, threshold = 30) {
  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastTime = 0;

    function handleMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity;
      if (!acc?.x || !acc?.y || !acc?.z) return;

      const now = Date.now();
      if (now - lastTime < 100) return;

      const deltaX = Math.abs(acc.x - lastX);
      const deltaY = Math.abs(acc.y - lastY);
      const deltaZ = Math.abs(acc.z - lastZ);

      if (deltaX + deltaY + deltaZ > threshold) {
        callback();
        lastTime = now + 1000; // debounce 1s
      }

      lastX = acc.x; lastY = acc.y; lastZ = acc.z;
      lastTime = now;
    }

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [callback, threshold]);
}
