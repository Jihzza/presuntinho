<script lang="ts">
  /**
   * MascotRunner — the arcade "attract mode" floor strip, upgraded into an
   * actually-playable endless runner (Chrome-dino style). The active mascot
   * jogs along a pixel floor forever; tap the strip (or press Space/↑) and it
   * turns into a game: obstacles scroll in from the right, tap to JUMP over
   * them, distance is the score. Crash → a short game-over flash, then it drops
   * back into the calm attract jog so the lobby always feels alive.
   *
   * Canvas-driven (chunky nearest-neighbour mascot, hard pixel shadows) to match
   * the CRT lobby. Decorative-but-interactive: keyboard hooks stay local to the
   * strip so they never fight the cabinet menu's ↑/↓/Enter navigation.
   */
  import { onMount, onDestroy } from 'svelte';
  import { mascotArt } from '$lib/gamification/mascots';
  import { prefersReducedMotion } from '$lib/components/events';
  import { playSfx, vibrate } from '$lib/gamification/sound';

  interface Props {
    /** Active mascot id — its `hero`/`jump` poses drive the run cycle. */
    mascot: string;
    /** Sprite draw height in px. */
    size?: number;
  }
  let { mascot, size = 60 }: Props = $props();

  type Phase = 'attract' | 'playing' | 'crashed';

  let canvas = $state<HTMLCanvasElement | null>(null);
  let host = $state<HTMLDivElement | null>(null);
  let phase = $state<Phase>('attract');
  let score = $state(0);
  let best = $state(0);

  const HI_KEY = 'presuntinho-runner-high';

  // ── sprites ────────────────────────────────────────────────────────────────
  // We downscale the smooth webp into a small offscreen buffer once per pose,
  // then blit it upscaled with smoothing OFF → chunky 8-bit pixels on canvas.
  const PX = 4;
  let runImg: HTMLImageElement | null = null;
  let jumpImg: HTMLImageElement | null = null;
  let runBuf: HTMLCanvasElement | null = null;
  let jumpBuf: HTMLCanvasElement | null = null;
  let spriteW = 60; // native aspect-scaled width (set from the baked sprite on load)

  function bakeSprite(img: HTMLImageElement): { buf: HTMLCanvasElement; w: number } | null {
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const h = Math.max(8, Math.round(size / PX));
    const w = Math.max(8, Math.round((h * img.naturalWidth) / img.naturalHeight));
    const buf = document.createElement('canvas');
    buf.width = w;
    buf.height = h;
    const bctx = buf.getContext('2d');
    if (!bctx) return null;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(img, 0, 0, w, h);
    return { buf, w: w * PX };
  }

  function loadSprites(id: string): void {
    const mk = (pose: 'hero' | 'jump', set: (i: HTMLImageElement) => void) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => {
        set(im);
        if (im === runImg) {
          const b = bakeSprite(im);
          if (b) {
            runBuf = b.buf;
            spriteW = b.w;
          }
        } else if (im === jumpImg) {
          const b = bakeSprite(im);
          if (b) jumpBuf = b.buf;
        }
      };
      im.src = mascotArt(id, pose);
      set(im);
    };
    runBuf = jumpBuf = null;
    mk('hero', (i) => (runImg = i));
    mk('jump', (i) => (jumpImg = i));
  }

  // ── world state (logical px; the canvas is sized to its CSS box × dpr) ───────
  let W = 480;
  let H = 88;
  let dpr = 1;
  let ctx: CanvasRenderingContext2D | null = null;

  const GROUND = 12; // px of floor below the sprite's feet
  let runnerX = 44;
  let y = 0; // height above ground (px)
  let vy = 0;
  const GRAVITY = 1600; // px/s²
  const JUMP_V = 560; // px/s
  let grounded = true;

  let speed = 168; // px/s world scroll
  const SPEED_MAX = 340;
  let dist = 0; // for score
  let bob = 0; // run-cycle phase
  let groundScroll = 0;
  let flashT = 0; // crash flash timer

  interface Obstacle {
    x: number;
    w: number;
    h: number;
    hit: boolean;
  }
  let obstacles: Obstacle[] = [];
  let spawnGap = 0; // px until next spawn

  let raf = 0;
  let lastTs = 0;
  let hidden = false;
  let reduced = false;

  function groundY(): number {
    return H - GROUND;
  }

  function resetWorld(): void {
    obstacles = [];
    dist = 0;
    score = 0;
    speed = 168;
    spawnGap = W * 0.7;
    y = 0;
    vy = 0;
    grounded = true;
  }

  function startPlay(): void {
    if (phase === 'playing') {
      jump();
      return;
    }
    resetWorld();
    phase = 'playing';
    jump();
  }

  function jump(): void {
    if (!grounded) return;
    vy = JUMP_V;
    grounded = false;
    playSfx('pop');
    vibrate('tap');
  }

  function crash(): void {
    phase = 'crashed';
    flashT = 0.5;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(HI_KEY, String(best));
      } catch {
        /* storage unavailable — keep the in-memory best */
      }
    }
    playSfx('wrong');
    vibrate('warning');
    // Fall back into the calm attract jog after the game-over beat.
    window.setTimeout(() => {
      if (phase === 'crashed') phase = 'attract';
    }, 1700);
  }

  function spawnObstacle(): void {
    const tall = Math.random() < 0.32;
    const h = tall ? 30 : 20;
    const w = Math.random() < 0.25 ? 26 : 16;
    obstacles.push({ x: W + w, w, h, hit: false });
    // Gap scales with speed so it stays clearable as it speeds up.
    const base = speed * (0.85 + Math.random() * 0.7);
    spawnGap = Math.max(120, base);
  }

  function measure(): void {
    if (!host || !canvas) return;
    const r = host.getBoundingClientRect();
    W = Math.max(160, Math.round(r.width));
    H = Math.max(64, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function update(dt: number): void {
    // Runner jog cycle + ground scroll always animate (unless reduced/attract-still).
    const moving = phase === 'playing' || (phase === 'attract' && !reduced);
    if (moving) {
      bob += dt * 9;
      groundScroll = (groundScroll + speed * 0.6 * dt) % 24;
    }
    if (flashT > 0) flashT = Math.max(0, flashT - dt);

    // Jump physics (available in play; in attract the mascot stays grounded).
    if (!grounded) {
      vy -= GRAVITY * dt;
      y += vy * dt;
      if (y <= 0) {
        y = 0;
        vy = 0;
        grounded = true;
      }
    }

    if (phase !== 'playing') return;

    // Difficulty ramps gently with distance.
    speed = Math.min(SPEED_MAX, 168 + dist * 0.02);
    dist += speed * dt;
    score = Math.floor(dist / 10);

    spawnGap -= speed * dt;
    if (spawnGap <= 0) spawnObstacle();

    const feetX = runnerX;
    const bodyW = spriteW * 0.5;
    const bodyH = size * 0.72;
    for (const o of obstacles) {
      o.x -= speed * dt;
      // AABB against the runner's forgiving hitbox.
      const rx = feetX - bodyW / 2 + 3;
      const ry = groundY() - y - bodyH;
      const ox = o.x;
      const oy = groundY() - o.h;
      if (!o.hit && rx < ox + o.w && rx + bodyW > ox && ry < oy + o.h && ry + bodyH > oy) {
        crash();
        return;
      }
    }
    obstacles = obstacles.filter((o) => o.x + o.w > -8);
  }

  function draw(): void {
    if (!ctx) return;
    const c = ctx;
    c.clearRect(0, 0, W, H);

    const gy = groundY();

    // ground line + scrolling ticks (neon cyan, matches the lobby CRT)
    c.strokeStyle = 'rgba(103, 232, 249, 0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, gy + 1);
    c.lineTo(W, gy + 1);
    c.stroke();
    c.fillStyle = 'rgba(103, 232, 249, 0.28)';
    for (let x = -groundScroll; x < W; x += 24) {
      c.fillRect(Math.round(x), gy + 4, 10, 2);
    }

    // obstacles — chunky pink "hearts/bottles" pillars
    for (const o of obstacles) {
      const ox = Math.round(o.x);
      const oy = Math.round(gy - o.h);
      c.fillStyle = '#f472b6';
      c.fillRect(ox, oy, o.w, o.h);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(ox, oy, o.w, 3);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(ox, oy + o.h - 3, o.w, 3);
    }

    // runner sprite (baked chunky buffer; falls back to a pink block pre-load)
    const drawW = spriteW;
    const drawH = size;
    const sx = Math.round(runnerX - drawW / 2);
    const sy = Math.round(gy - y - drawH);
    const airborne = !grounded;
    const buf = airborne && jumpBuf ? jumpBuf : runBuf;
    // 2-frame jog bob so the run reads as steps.
    const step = phase !== 'crashed' && !airborne && Math.sin(bob) > 0 ? -3 : 0;

    // hard pixel shadow on the floor
    c.fillStyle = 'rgba(0,0,0,0.4)';
    const shW = drawW * 0.5 * (airborne ? 0.7 : 1);
    c.fillRect(Math.round(runnerX - shW / 2), gy + 2, Math.round(shW), 4);

    c.save();
    c.imageSmoothingEnabled = false;
    if (flashT > 0 && Math.floor(flashT * 12) % 2 === 0) c.globalAlpha = 0.35;
    if (buf) {
      c.drawImage(buf, sx, sy + step, drawW, drawH);
    } else {
      c.fillStyle = '#f9a8d4';
      c.fillRect(sx, sy + step, drawW, drawH);
    }
    c.restore();
  }

  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTs) / 1000 || 0.016);
    lastTs = now;
    if (hidden) return;
    update(dt);
    draw();
  }

  // ── input ────────────────────────────────────────────────────────────────
  function onPointerDown(e: PointerEvent): void {
    // Keep the tap local so the lobby's tap-anywhere-to-mute doesn't also fire.
    e.stopPropagation();
    startPlay();
  }
  function onKey(e: KeyboardEvent): void {
    // Only Space / ArrowUp drive the runner; leave ↑/↓/Enter menu nav alone by
    // acting solely when the strip itself is focused.
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'arrowup' || k === 'w') {
      e.preventDefault();
      startPlay();
    }
  }

  onMount(() => {
    reduced = prefersReducedMotion();
    loadSprites(mascot);
    try {
      best = Number(localStorage.getItem(HI_KEY)) || 0;
    } catch {
      best = 0;
    }
    measure();
    const ro = new ResizeObserver(() => measure());
    if (host) ro.observe(host);
    const onVis = () => {
      hidden = document.hidden;
      lastTs = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    lastTs = performance.now();
    raf = requestAnimationFrame(loop);
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  });
  onDestroy(() => cancelAnimationFrame(raf));

  // Reload sprites if the active mascot changes.
  $effect(() => {
    if (mascot) loadSprites(mascot);
  });
</script>

<div
  class="runner"
  bind:this={host}
  role="button"
  tabindex="0"
  aria-label="Jogo do corredor — toca ou espaço para saltar"
  onpointerdown={onPointerDown}
  onkeydown={onKey}
>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  <span class="hud" aria-hidden="true">
    {#if phase === 'playing'}
      <span class="sc">{score}</span>
    {:else if phase === 'crashed'}
      <span class="go">{score} · ◆ {best}</span>
    {:else}
      <span class="hint">▶ TAP / SPACE</span>
    {/if}
  </span>
</div>

<style>
  .runner {
    position: relative;
    width: 100%;
    height: 100%;
    cursor: pointer;
    touch-action: manipulation;
    outline: none;
  }
  .runner:focus-visible {
    box-shadow: 0 0 0 2px #67e8f9;
    border-radius: 0.4rem;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .hud {
    position: absolute;
    top: 4px;
    right: 8px;
    font-family: 'Courier New', ui-monospace, monospace;
    font-weight: 900;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .hud .sc {
    color: #fde047;
    text-shadow: 1px 1px 0 #7c2d12;
  }
  .hud .go {
    color: #f472b6;
  }
  .hud .hint {
    color: rgba(232, 255, 244, 0.5);
    font-size: 0.6rem;
  }
</style>
