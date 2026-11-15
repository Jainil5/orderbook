"use client";

import { useEffect, useRef } from "react";

const PARTICLES = 620;
const FIELD_SCALE = 0.0021;
const TIME_STEP = 0.0022;
const POINTER_RADIUS = 240;
const TRAIL_FADE = 0.055;
const SPEED_LEAF = 1.15;
const SPEED_SAND = 1.5;
const MAX_DPR = 1.5;

interface Particle {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  life: number;
  maxLife: number;
  speed: number;
  sand: boolean;
}

/**
 * The background field: curl-noise streaks that smear rather than dot, drift
 * toward the pointer within 240px, and keep running while the page scrolls.
 * Colours are read from the live theme tokens, so the field retints with the
 * light/dark switch instead of baking in the dark palette.
 */
export function FlowField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;

    let width = 0;
    let height = 0;
    let leaf = "#5fd68a";
    let sand = "#d2c391";
    let background = "#06120d";
    let leafAlpha = 0.2;
    let sandAlpha = 0.16;
    let trailFade = TRAIL_FADE;
    let particles: Particle[] = [];
    let time = 0;
    let frame = 0;
    let pointerX = -POINTER_RADIUS;
    let pointerY = -POINTER_RADIUS;
    let biasX = 0;
    let biasY = 0;
    let targetBiasX = 0;
    let targetBiasY = 0;
    let raf = 0;
    let running = false;

    const number = (styles: CSSStyleDeclaration, name: string, fallback: number) => {
      const value = Number.parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };

    const readTheme = () => {
      const styles = getComputedStyle(root);
      leaf = styles.getPropertyValue("--ob-leaf").trim() || leaf;
      sand = styles.getPropertyValue("--ob-sand").trim() || sand;
      background = styles.getPropertyValue("--ob-bg").trim() || background;
      leafAlpha = number(styles, "--ob-flow-leaf", leafAlpha);
      sandAlpha = number(styles, "--ob-flow-sand", sandAlpha);
      trailFade = number(styles, "--ob-flow-fade", trailFade);
    };

    const spawn = (particle?: Particle): Particle => {
      const next = particle ?? ({} as Particle);
      const x = Math.random() * width;
      const y = Math.random() * height;
      next.x = x;
      next.y = y;
      next.previousX = x;
      next.previousY = y;
      next.maxLife = 60 + Math.random() * 180;
      next.life = Math.random() * next.maxLife;
      return next;
    };

    const angleAt = (x: number, y: number) => {
      const fx = (x + biasX) * FIELD_SCALE;
      const fy = (y + biasY) * FIELD_SCALE;
      return (
        (Math.sin(fx * 1.1 + time) * 0.5 +
          Math.sin(fy * 1.7 - time * 0.8) * 0.3 +
          Math.sin((fx + fy) * 0.7 + time * 1.3) * 0.2) *
        Math.PI *
        1.6
      );
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readTheme();
      ctx.globalAlpha = 1;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineWidth = 1.1;
    };

    const paintStatic = () => {
      resize();
      ctx.strokeStyle = leaf;
      ctx.globalAlpha = leafAlpha * 0.6;
      ctx.beginPath();
      for (let index = 0; index < 900; index += 1) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const angle = angleAt(x, y);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * 26, y + Math.sin(angle) * 26);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const step = () => {
      ctx.globalAlpha = trailFade;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      biasX += (targetBiasX - biasX) * 0.04;
      biasY += (targetBiasY - biasY) * 0.04;
      time += TIME_STEP;
      frame += 1;
      if (frame % 90 === 0) readTheme();

      for (const particle of particles) {
        particle.previousX = particle.x;
        particle.previousY = particle.y;

        let angle = angleAt(particle.x, particle.y);
        const dx = particle.x - pointerX;
        const dy = particle.y - pointerY;
        const distance = Math.hypot(dx, dy);
        let near = 0;

        if (distance < POINTER_RADIUS) {
          const ratio = distance / POINTER_RADIUS;
          angle += ratio * (1 - ratio * ratio) * 2.4;
          near = 1 - ratio;
          particle.x -= dx * 0.004 * near;
          particle.y -= dy * 0.004 * near;
        }

        particle.x += Math.cos(angle) * particle.speed;
        particle.y += Math.sin(angle) * particle.speed;
        particle.life += 1;

        const offscreen =
          particle.x < -20 ||
          particle.x > width + 20 ||
          particle.y < -20 ||
          particle.y > height + 20;

        if (particle.life >= particle.maxLife || offscreen) {
          spawn(particle);
          continue;
        }

        const base = particle.sand ? sandAlpha : leafAlpha;
        ctx.globalAlpha = base + near * base * 1.7;
        ctx.strokeStyle = particle.sand ? sand : leaf;
        ctx.beginPath();
        ctx.moveTo(particle.previousX, particle.previousY);
        ctx.lineTo(particle.x, particle.y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduced.matches) return;
      running = true;
      raf = requestAnimationFrame(step);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      targetBiasX = (pointerX / width - 0.5) * 1.6;
      targetBiasY = (pointerY / height - 0.5) * 1;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    const onThemeChange = () => {
      readTheme();
      if (reduced.matches) paintStatic();
    };

    resize();
    if (reduced.matches) {
      paintStatic();
    } else {
      particles = Array.from({ length: PARTICLES }, (_, index) => {
        const particle = spawn();
        particle.sand = index % 7 === 0;
        particle.speed = particle.sand ? SPEED_SAND : SPEED_LEAF;
        return particle;
      });
      start();
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    const observer = new MutationObserver(onThemeChange);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="ob-flow" aria-hidden />;
}
