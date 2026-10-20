/**
 * FixIt Homepage Hero Scroll-Driven Drone Animation Controller
 * 
 * Drives a translucent 180-frame flyover video sequence of SIMATS Engineering campus
 * as the visitor scrolls down or up through the homepage hero.
 * 
 * Strict boundary rules:
 * - Confined strictly to the homepage hero banner.
 * - Automatically pauses & hides when navigating to other tabs (Report, Admin, My Reports, Analytics)
 *   or opening modals (Sign In, Ticket Detail).
 * - High-DPI / Retina canvas rendering with object-fit cover.
 * - Staggered keyframe preloading with nearest-frame fallback for 60fps stutter-free scrubbing.
 * - Graceful procedural wireframe placeholder if assets are ever unreachable.
 */

(function(window) {
  'use strict';

  const TOTAL_FRAMES = 180;
  const FRAME_DIR = '/static/hero_frames/';
  const FRAME_PREFIX = 'ezgif-frame-';
  const FRAME_EXT = '.jpg';

  function formatFrameNumber(idx) {
    return String(idx).padStart(3, '0');
  }

  function getFrameUrl(idx) {
    return `${FRAME_DIR}${FRAME_PREFIX}${formatFrameNumber(idx)}${FRAME_EXT}`;
  }

  const HeroScrollAnimation = {
    canvas: null,
    ctx: null,
    heroBanner: null,
    dashboardSection: null,
    frameIndicator: null,
    progressBar: null,

    // Image frame cache
    frames: new Array(TOTAL_FRAMES + 1),
    loadedCount: 0,
    hasAssetError: false,
    usePlaceholderFallback: false,

    // Scroll & Lerp state
    targetProgress: 0,
    currentProgress: 0,
    currentFrameIndex: 1,
    isRafRunning: false,
    isTabActive: true,
    isHeroInView: true,

    init() {
      this.canvas = document.getElementById('heroFrameCanvas');
      this.heroBanner = document.getElementById('homepageHeroBanner');
      this.dashboardSection = document.getElementById('section-dashboard');
      this.frameIndicator = document.getElementById('heroFrameIndicator');
      this.progressBar = document.getElementById('heroScrollProgress');

      if (!this.canvas || !this.heroBanner) {
        return;
      }

      this.ctx = this.canvas.getContext('2d', { alpha: true });

      // Configure canvas resolution
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize(), { passive: true });

      // Setup window scroll listener
      window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

      // Setup optional mouse wheel scrubbing on the hero banner
      this.setupHeroWheel();

      // Begin preloading assets
      this.preloadFrames();

      // Initial scroll position evaluate
      this.handleScroll();
    },

    setupHeroWheel() {
      if (!this.heroBanner) return;

      // Allow direct wheel scrubbing when hovering the hero banner
      this.heroBanner.addEventListener('wheel', (e) => {
        // Only run if dashboard tab is active
        if (!this.isDashboardActive()) return;

        // Note: We do NOT prevent default so the page still scrolls naturally,
        // but we trigger an immediate responsiveness calculation
        this.handleScroll();
      }, { passive: true });
    },

    isDashboardActive() {
      if (!this.dashboardSection) {
        this.dashboardSection = document.getElementById('section-dashboard');
      }
      return this.dashboardSection && !this.dashboardSection.classList.contains('hidden');
    },

    handleResize() {
      if (!this.canvas || !this.heroBanner) return;
      const rect = this.heroBanner.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for high performance

      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);

      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }

      // Redraw current frame
      this.renderFrame(Math.round(this.currentFrameIndex));
    },

    preloadFrames() {
      // 1. Immediately load Frame 1 for zero-delay initial display
      const frame1 = new Image();
      frame1.crossOrigin = 'anonymous';
      frame1.onload = () => {
        this.frames[1] = frame1;
        this.loadedCount++;
        this.renderFrame(1);
        // Once frame 1 succeeds, load keyframes across the sequence
        this.startBackgroundPreload();
      };
      frame1.onerror = () => {
        console.warn('[HeroAnimation] Frame 1 not found. Switching to high-tech campus placeholder.');
        this.usePlaceholderFallback = true;
        this.renderPlaceholder(1);
      };
      frame1.src = getFrameUrl(1);
    },

    startBackgroundPreload() {
      // Priority pass 1: Keyframes (every 6th frame) for rapid responsive scrubbing
      const keyframes = [];
      for (let i = 6; i <= TOTAL_FRAMES; i += 6) {
        keyframes.push(i);
      }

      // Priority pass 2: All remaining intermediate frames
      const remaining = [];
      for (let i = 2; i <= TOTAL_FRAMES; i++) {
        if (i % 6 !== 0) {
          remaining.push(i);
        }
      }

      const queue = [...keyframes, ...remaining];
      let activeRequests = 0;
      const MAX_CONCURRENT = 4;

      const pump = () => {
        while (activeRequests < MAX_CONCURRENT && queue.length > 0) {
          const idx = queue.shift();
          activeRequests++;

          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            this.frames[idx] = img;
            this.loadedCount++;
            activeRequests--;
            pump();
          };
          img.onerror = () => {
            activeRequests--;
            pump();
          };
          img.src = getFrameUrl(idx);
        }
      };

      // Start pumping preloads during idle time
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => pump(), { timeout: 1000 });
      } else {
        setTimeout(pump, 50);
      }
    },

    handleScroll() {
      // Confine animation strictly to homepage hero:
      // If user is on another tab or modal is fullscreen, pause execution
      if (!this.isDashboardActive()) {
        this.stopRaf();
        return;
      }

      if (!this.heroBanner) return;

      const rect = this.heroBanner.getBoundingClientRect();
      const heroHeight = this.heroBanner.offsetHeight;

      // Check if hero banner is currently visible in viewport
      // rect.bottom > 0 means the bottom of the hero has not scrolled past top of window
      // rect.top < window.innerHeight means top of hero has entered the window
      const inView = rect.bottom > 0 && rect.top < window.innerHeight;
      this.isHeroInView = inView;

      if (!inView) {
        this.stopRaf();
        return;
      }

      // Calculate scroll progress through the hero banner
      // At window.scrollY = 0, progress = 0
      // As the hero banner scrolls up, progress advances from 0.0 to 1.0
      const scrollY = window.scrollY || window.pageYOffset || 0;
      
      // Calculate effective scroll distance for the 180 frames:
      // Map scroll from 0 down to when hero banner reaches top of viewport
      const scrollRange = Math.max(heroHeight * 1.1, 480);
      const rawProgress = scrollY / scrollRange;
      this.targetProgress = Math.min(1, Math.max(0, rawProgress));

      this.startRaf();
    },

    startRaf() {
      if (this.isRafRunning) return;
      this.isRafRunning = true;
      requestAnimationFrame(() => this.tick());
    },

    stopRaf() {
      this.isRafRunning = false;
    },

    tick() {
      if (!this.isRafRunning) return;

      // Boundary check: pause if tab changed or hero scrolled completely out of view
      if (!this.isDashboardActive() || !this.isHeroInView) {
        this.stopRaf();
        return;
      }

      // Smooth Lerp (Linear Interpolation) for buttery 60fps frame scrubbing
      const delta = this.targetProgress - this.currentProgress;
      this.currentProgress += delta * 0.22;

      // Calculate target frame index (1 to 180)
      const targetFrame = Math.round(this.currentProgress * (TOTAL_FRAMES - 1)) + 1;
      const clampedFrame = Math.min(TOTAL_FRAMES, Math.max(1, targetFrame));

      if (clampedFrame !== this.currentFrameIndex) {
        this.currentFrameIndex = clampedFrame;
        this.renderFrame(clampedFrame);
      }

      // If progress has converged closely, snap and stop RAF to conserve CPU & battery
      if (Math.abs(delta) < 0.0005) {
        this.currentProgress = this.targetProgress;
        const finalFrame = Math.min(TOTAL_FRAMES, Math.max(1, Math.round(this.currentProgress * (TOTAL_FRAMES - 1)) + 1));
        if (finalFrame !== this.currentFrameIndex) {
          this.currentFrameIndex = finalFrame;
          this.renderFrame(finalFrame);
        }
        this.stopRaf();
        return;
      }

      requestAnimationFrame(() => this.tick());
    },

    renderFrame(frameIdx) {
      this.updateUIIndicators(frameIdx);

      if (this.usePlaceholderFallback) {
        this.renderPlaceholder(frameIdx);
        return;
      }

      if (!this.ctx || !this.canvas) return;

      // Find exact frame or nearest loaded frame (zero flickering!)
      let img = this.frames[frameIdx];
      if (!img || !img.complete || img.naturalWidth === 0) {
        // Find nearest loaded frame
        img = this.findNearestLoadedFrame(frameIdx);
      }

      if (!img) {
        // Fallback placeholder until first frame arrives
        this.renderPlaceholder(frameIdx);
        return;
      }

      const canvas = this.canvas;
      const ctx = this.ctx;
      const cw = canvas.width;
      const ch = canvas.height;

      ctx.clearRect(0, 0, cw, ch);

      // Object-fit: cover scaling algorithm
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      const scale = Math.max(cw / imgW, ch / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const offsetX = (cw - drawW) * 0.5;
      const offsetY = (ch - drawH) * 0.5;

      ctx.drawImage(img, 0, 0, imgW, imgH, offsetX, offsetY, drawW, drawH);
    },

    findNearestLoadedFrame(targetIdx) {
      // Search outward from targetIdx
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const left = targetIdx - offset;
        if (left >= 1 && this.frames[left] && this.frames[left].complete && this.frames[left].naturalWidth > 0) {
          return this.frames[left];
        }
        const right = targetIdx + offset;
        if (right <= TOTAL_FRAMES && this.frames[right] && this.frames[right].complete && this.frames[right].naturalWidth > 0) {
          return this.frames[right];
        }
      }
      return null;
    },

    updateUIIndicators(frameIdx) {
      if (this.frameIndicator) {
        this.frameIndicator.textContent = `Frame ${frameIdx} / ${TOTAL_FRAMES}`;
      }
      if (this.progressBar) {
        const pct = Math.round((frameIdx / TOTAL_FRAMES) * 100);
        this.progressBar.style.width = `${pct}%`;
      }
    },

    /**
     * Graceful Procedural Placeholder Generator
     * Renders a translucent geometric architectural wireframe flyover if image assets
     * are ever missing or unreachable.
     */
    renderPlaceholder(frameIdx) {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const progress = (frameIdx - 1) / (TOTAL_FRAMES - 1);

      ctx.clearRect(0, 0, cw, ch);

      // Background gradient
      const bgGrad = ctx.createRadialGradient(cw * 0.5, ch * 0.5, 50, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.6);
      bgGrad.addColorStop(0, 'rgba(30, 27, 75, 0.45)');
      bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cw, ch);

      // Draw isometric architectural grid
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.lineWidth = 1.5;

      const horizon = ch * (0.35 + progress * 0.25);
      const centerX = cw * 0.65;
      const centerY = horizon + 80;

      // Concentric campus architectural rings (SIMATS circular building)
      const maxR = Math.min(cw, ch) * (0.3 + progress * 0.35);
      for (let r = 30; r <= maxR; r += 28) {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Diagrid lattice struts
      const numStruts = 24;
      for (let i = 0; i < numStruts; i++) {
        const angle = (i / numStruts) * Math.PI * 2 + progress * Math.PI * 0.5;
        const x1 = centerX + Math.cos(angle) * 30 * 1.4;
        const y1 = centerY + Math.sin(angle) * 30 * 0.7;
        const x2 = centerX + Math.cos(angle + 0.3) * maxR * 1.4;
        const y2 = centerY + Math.sin(angle + 0.3) * maxR * 0.7;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Radar scan pulse
      const scanAngle = progress * Math.PI * 4;
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.cos(scanAngle) * maxR * 1.4, centerY + Math.sin(scanAngle) * maxR * 0.7);
      ctx.stroke();

      ctx.restore();
    },

    /**
     * Tab lifecycle hooks:
     * Called by App.switchTab() to ensure zero animations run on other tabs
     */
    onTabActivated(tabName) {
      if (tabName === 'dashboard') {
        this.isTabActive = true;
        // Recalculate dimensions & resume
        this.handleResize();
        this.handleScroll();
      } else {
        this.onTabDeactivated();
      }
    },

    onTabDeactivated() {
      this.isTabActive = false;
      this.stopRaf();
    }
  };

  window.HeroScrollAnimation = HeroScrollAnimation;

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HeroScrollAnimation.init());
  } else {
    HeroScrollAnimation.init();
  }

})(window);
