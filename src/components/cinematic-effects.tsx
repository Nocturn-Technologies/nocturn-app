"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor-following spotlight + magnetic CTA effects.
 * Matches marketing site (trynocturn.com) design language.
 *
 * Apply to a button by adding `data-magnetic` attribute.
 * Spotlight is hidden on touch devices and reduced-motion.
 */
export function CinematicEffects() {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const spotlight = spotlightRef.current;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let tx = mx;
    let ty = my;
    let rafId = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const loop = () => {
      tx += (mx - tx) * 0.08;
      ty += (my - ty) * 0.08;
      if (spotlight) {
        spotlight.style.setProperty("--mx", `${tx}px`);
        spotlight.style.setProperty("--my", `${ty}px`);
      }
      rafId = requestAnimationFrame(loop);
    };
    loop();

    // Magnetic CTAs — any element with data-magnetic attr
    const magnets = document.querySelectorAll<HTMLElement>("[data-magnetic]");
    const cleanups: Array<() => void> = [];
    magnets.forEach((el) => {
      const move = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.18;
        const y = (e.clientY - r.top - r.height / 2) * 0.28;
        el.style.transform = `translate(${x}px, ${y}px)`;
      };
      const leave = () => {
        el.style.transform = "translate(0, 0)";
      };
      el.addEventListener("mousemove", move);
      el.addEventListener("mouseleave", leave);
      cleanups.push(() => {
        el.removeEventListener("mousemove", move);
        el.removeEventListener("mouseleave", leave);
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <div
      ref={spotlightRef}
      className="cursor-spotlight"
      aria-hidden="true"
    />
  );
}
