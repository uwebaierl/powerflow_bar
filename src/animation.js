const BLOCK_KEYS = ["pv", "battery", "battery_output", "home", "grid"];
const DEFAULT_STIFFNESS = 230;
const DEFAULT_DAMPING = 22;

export class SegmentedBarAnimator {
  constructor(onFrame) {
    this._onFrame = onFrame;
    this._running = false;
    this._raf = 0;
    this._lastTs = 0;
    this._stiffness = DEFAULT_STIFFNESS;
    this._damping = DEFAULT_DAMPING;

    this._target = {
      pv: 0.2,
      battery: 0.2,
      battery_output: 0.2,
      home: 0.2,
      grid: 0.2,
    };

    this._state = {
      pv: { x: 0.2, v: 0 },
      battery: { x: 0.2, v: 0 },
      battery_output: { x: 0.2, v: 0 },
      home: { x: 0.2, v: 0 },
      grid: { x: 0.2, v: 0 },
    };
  }

  setOptions(options = {}) {
    if (options.spring_stiffness !== undefined) {
      const n = Number(options.spring_stiffness);
      this._stiffness = Number.isFinite(n) ? clampAnim(n, 80, 420) : DEFAULT_STIFFNESS;
    }
    if (options.spring_damping !== undefined) {
      const n = Number(options.spring_damping);
      this._damping = Number.isFinite(n) ? clampAnim(n, 10, 60) : DEFAULT_DAMPING;
    }
  }

  setTargets(widths) {
    const next = normalizeAnimationWidths(widths);
    let changed = false;
    for (const key of BLOCK_KEYS) {
      if (Math.abs(this._target[key] - next[key]) > 0.0000001) {
        changed = true;
      }
      this._target[key] = next[key];
    }

    if (this._running && changed && !this._raf) {
      this._lastTs = 0;
      this._raf = requestAnimationFrame((ts) => this._tick(ts));
    }
  }

  start() {
    if (this._running) {
      return;
    }
    this._running = true;
    this._lastTs = 0;
    this._emitFrame();
    this._raf = requestAnimationFrame((ts) => this._tick(ts));
  }

  stop() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  _tick(ts) {
    if (!this._running) {
      return;
    }

    const dt = this._lastTs > 0
      ? clampAnim((ts - this._lastTs) / 1000, 1 / 120, 0.05)
      : 1 / 60;
    this._lastTs = ts;

    let active = false;
    let moved = false;

    for (const key of BLOCK_KEYS) {
      const state = this._state[key];
      const target = this._target[key];
      const prevX = state.x;

      const displacement = state.x - target;
      const accel = (-this._stiffness * displacement) - (this._damping * state.v);
      state.v += accel * dt;
      state.x += state.v * dt;

      const nearStop = Math.abs(state.v) < 0.00008 && Math.abs(displacement) < 0.00008;
      if (nearStop) {
        state.x = target;
        state.v = 0;
      } else {
        active = true;
      }

      if (Math.abs(state.x - prevX) > 0.000001) {
        moved = true;
      }
    }

    if (active || moved) {
      this._emitFrame();
    }

    if (active) {
      this._raf = requestAnimationFrame((nextTs) => this._tick(nextTs));
      return;
    }

    this._raf = 0;
  }

  _emitFrame() {
    this._onFrame(normalizeAnimationWidths({
      pv: this._state.pv.x,
      battery: this._state.battery.x,
      battery_output: this._state.battery_output.x,
      home: this._state.home.x,
      grid: this._state.grid.x,
    }));
  }
}

function normalizeAnimationWidths(widths) {
  const safe = {
    pv: Number.isFinite(widths?.pv) ? Math.max(0, widths.pv) : 0.2,
    battery: Number.isFinite(widths?.battery) ? Math.max(0, widths.battery) : 0.2,
    battery_output: Number.isFinite(widths?.battery_output) ? Math.max(0, widths.battery_output) : 0.2,
    home: Number.isFinite(widths?.home) ? Math.max(0, widths.home) : 0.2,
    grid: Number.isFinite(widths?.grid) ? Math.max(0, widths.grid) : 0.2,
  };

  const sum = safe.pv + safe.battery + safe.battery_output + safe.home + safe.grid;
  if (sum <= 0) {
    return {
      pv: 0.2,
      battery: 0.2,
      battery_output: 0.2,
      home: 0.2,
      grid: 0.2,
    };
  }

  return {
    pv: safe.pv / sum,
    battery: safe.battery / sum,
    battery_output: safe.battery_output / sum,
    home: safe.home / sum,
    grid: safe.grid / sum,
  };
}

function clampAnim(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
