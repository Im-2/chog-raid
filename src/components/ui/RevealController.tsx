"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Scroll reveal for the content pages: cards and section headings fade and slide up once as they
 * enter the viewport. Only opacity and transform animate (no layout shift), each element triggers
 * once, and siblings that appear together are staggered a little.
 *
 * Content is never hidden unless this script has run and IntersectionObserver exists: the hidden
 * state is switched on with html[data-reveal], and anything already on screen is marked visible
 * first. Reduced motion and the game screens skip it entirely.
 *
 * Mark things with data-reveal (one element) or data-reveal-group (each child of it); `main h2`
 * headings are picked up automatically.
 */
const SELECTOR = "[data-reveal], [data-reveal-group] > *, main h2";
const GAME_PATH = /^\/(raid|room\/[^/]+\/?$)/;

export function RevealController() {
  const path = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (GAME_PATH.test(path) || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.removeAttribute("data-reveal");
      return;
    }

    const seen = new WeakSet<Element>();
    let flushTimer = 0;

    const show = (el: Element, delay = 0) => {
      (el as HTMLElement).style.setProperty("--rd", `${delay}ms`);
      el.setAttribute("data-in", "");
      // Once it has arrived, hand the element back to its own styles (hover effects, transitions).
      const done = () => {
        el.removeAttribute("data-r");
        (el as HTMLElement).style.removeProperty("--rd");
      };
      el.addEventListener("transitionend", (e) => (e as TransitionEvent).propertyName === "opacity" && done(), { once: true });
      window.setTimeout(done, 900 + delay);
    };

    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          show(e.target, Math.min(i++, 5) * 70);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const scan = () => {
      const vh = window.innerHeight;
      root.dataset.reveal = "on";
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (seen.has(el) || el.closest("[data-reveal-skip]")) return;
        // A heading inside a revealed card moves with the card.
        if (el.matches("main h2") && el.parentElement?.closest("[data-reveal], [data-reveal-group] > *")) return;
        seen.add(el);
        el.setAttribute("data-r", "");
        if (el.getBoundingClientRect().top < vh * 0.92) show(el); // already on screen: no flash
        else io.observe(el);
      });
    };

    scan();
    // Content that arrives later (client-fetched cards, route changes within a page).
    const mo = new MutationObserver(() => {
      window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(scan, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(flushTimer);
      mo.disconnect();
      io.disconnect();
    };
  }, [path]);

  return null;
}
