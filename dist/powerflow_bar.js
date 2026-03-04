/* PowerFlow Bar - generated file. Do not edit directly. */
/* src/constants.js */
const CARD_ELEMENT_TAG = "powerflow-bar";
const CARD_TYPE = "custom:powerflow-bar";
const CARD_NAME = "PowerFlow Bar";
const VISIBILITY_SEGMENT_KEYS = ["pv", "battery", "battery_output", "grid"];
const DEFAULT_ICONS = {
  pv: "mdi:white-balance-sunny",
  battery_charge: "mdi:battery-plus-variant",
  battery_discharge: "mdi:battery-minus-variant",
  battery_output: "mdi:power-socket-de",
  home_consumption: "mdi:home",
  grid_import: "mdi:transmission-tower-import",
  grid_export: "mdi:transmission-tower-export",
};
const DEFAULT_VISIBILITY = {
  pv: {
    show_threshold: 0,
    hide_threshold: 0,
  },
  battery: {
    show_threshold: 0,
    hide_threshold: 0,
  },
  battery_output: {
    show_threshold: 0,
    hide_threshold: 0,
  },
  grid: {
    show_threshold: 0,
    hide_threshold: 0,
  },
};

/* src/animation.js */
const BLOCK_KEYS = ["pv", "battery", "battery_output", "home", "grid"];
const DEFAULT_STIFFNESS = 230;
const DEFAULT_DAMPING = 22;

class SegmentedBarAnimator {
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

/* src/balance-model.js */
const CORE_REQUIRED_ENTITY_KEYS = [
  "pv",
  "grid_import",
  "grid_export",
  "home_consumption",
];

const ENERGY_UNITS = new Set(["wh", "kwh", "mwh", "gwh"]);
const POWER_UNITS = new Set(["w", "watt", "watts"]);

const DEFAULT_MIN_HOME = 0.12;
const DEFAULT_MIN_OTHER = 0.07;
const HOME_BIAS_FACTOR = 0.8;
const HOME_DOMINANCE_RATIO = 1.55;

function computeBalanceModel(config, hass, visibilityState) {
  const input = resolveInputWatts(config, hass);
  const blocks = buildBlocks(input, config);
  const baseWidths = computeSegmentWidths(input);
  const order = computeSegmentOrder(input);
  const visible_keys = buildVisibleKeys(blocks, config, visibilityState);
  const widths = maskWidthsToVisible(baseWidths, visible_keys);

  return {
    input,
    blocks,
    widths,
    order,
    visible_keys,
  };
}

function buildVisibleKeys(blocks, config, visibilityState) {
  const pvActive = shouldShowBlock("pv", blocks.pv, config, visibilityState);
  const batteryActive = shouldShowBlock("battery", blocks.battery, config, visibilityState);
  const batteryOutputActive = shouldShowBlock("battery_output", blocks.battery_output, config, visibilityState);
  const gridActive = shouldShowBlock("grid", blocks.grid, config, visibilityState);

  const visible = [];
  if (pvActive) {
    visible.push("pv");
  }
  if (batteryActive) {
    visible.push("battery");
  }
  if (batteryOutputActive) {
    visible.push("battery_output");
  }
  visible.push("home");
  if (gridActive) {
    visible.push("grid");
  }
  return visible;
}

function shouldShowBlock(key, block, config, visibilityState) {
  const currentValue = Math.max(0, Number(block?.value_w) || 0);
  const thresholds = resolveVisibilityThresholds(config, key);
  const wasVisible = visibilityState?.[key]?.visible === true;

  if (wasVisible) {
    return currentValue > thresholds.hide_threshold;
  }

  return currentValue > thresholds.show_threshold;
}

function resolveVisibilityThresholds(config, key) {
  const configured = config?.hysteresis?.[key];
  const defaults = DEFAULT_VISIBILITY[key] || DEFAULT_VISIBILITY.pv;
  const showThreshold = Number(configured?.show_threshold);
  const hideThreshold = Number(configured?.hide_threshold);

  return {
    show_threshold: Number.isFinite(showThreshold) ? Math.max(0, showThreshold) : defaults.show_threshold,
    hide_threshold: Number.isFinite(hideThreshold) ? Math.max(0, hideThreshold) : defaults.hide_threshold,
  };
}

function maskWidthsToVisible(widths, visibleKeys) {
  const visibleSet = new Set(visibleKeys || []);
  const masked = {
    pv: visibleSet.has("pv") ? Math.max(0, Number(widths?.pv) || 0) : 0,
    battery: visibleSet.has("battery") ? Math.max(0, Number(widths?.battery) || 0) : 0,
    battery_output: visibleSet.has("battery_output") ? Math.max(0, Number(widths?.battery_output) || 0) : 0,
    home: visibleSet.has("home") ? Math.max(0, Number(widths?.home) || 0) : 0,
    grid: visibleSet.has("grid") ? Math.max(0, Number(widths?.grid) || 0) : 0,
  };

  const sum = masked.pv + masked.battery + masked.battery_output + masked.home + masked.grid;
  if (sum <= 0) {
    return {
      pv: 0,
      battery: 0,
      battery_output: 0,
      home: 1,
      grid: 0,
    };
  }

  return {
    pv: masked.pv / sum,
    battery: masked.battery / sum,
    battery_output: masked.battery_output / sum,
    home: masked.home / sum,
    grid: masked.grid / sum,
  };
}

function collectRelevantEntities(config) {
  const entities = config?.entities || {};
  return Object.values(entities)
    .filter((entityId) => typeof entityId === "string" && entityId.length > 0);
}

function computeEntitySignature(hass, entityIds) {
  return entityIds
    .map((id) => {
      const state = hass?.states?.[id];
      if (!state) {
        return `${id}:missing`;
      }
      const unit = state.attributes?.unit_of_measurement ?? "";
      return `${id}:${state.state}:${unit}`;
    })
    .join("|");
}

function resolveInputWatts(config, hass) {
  const entities = config?.entities || {};
  if (!hasRequiredEntities(entities) || !hass) {
    return zeroInput();
  }

  const pv_w = readEntityPowerWatts(hass, entities.pv);
  const load_w = readEntityPowerWatts(hass, entities.home_consumption);
  const batteryOutputEntityId = resolveBatteryOutputEntityId(entities);
  const hasBatteryOutput = isNonEmptyEntityId(batteryOutputEntityId);
  const battery_output_w = hasBatteryOutput
    ? readEntityPowerWatts(hass, batteryOutputEntityId)
    : 0;
  const batt_chg_w = readEntityPowerWatts(hass, entities.battery_charge);
  const batt_dis_w = readEntityPowerWatts(hass, entities.battery_discharge);

  let grid_imp_w = readEntityPowerWatts(hass, entities.grid_import);
  let grid_exp_w = readEntityPowerWatts(hass, entities.grid_export);

  if (grid_exp_w > 0) {
    grid_imp_w = 0;
  }
  if (grid_imp_w > 0) {
    grid_exp_w = 0;
  }

  return {
    pv_w,
    load_w,
    batt_chg_w,
    batt_dis_w,
    battery_output_w,
    grid_imp_w,
    grid_exp_w,
  };
}

function buildBlocks(input, config) {
  const entities = config?.entities || {};
  const battery = buildBatteryBlock(input, entities, config);
  const batteryOutput = buildBatteryOutputBlock(input, entities, config);
  const grid = buildGridBlock(input, entities, config);

  return {
    pv: {
      key: "pv",
      icon: resolveIcon(config, "pv"),
      state: "ACTIVE",
      value_w: input.pv_w,
      color_key: "pv",
      entity_id: entities.pv || null,
    },
    battery,
    battery_output: batteryOutput,
    home: {
      key: "home",
      icon: resolveIcon(config, "home_consumption"),
      state: "ACTIVE",
      value_w: input.load_w,
      color_key: "home_consumption",
      entity_id: entities.home_consumption || null,
    },
    grid,
  };
}

function buildBatteryBlock(input, entities, config) {
  if (input.batt_chg_w > input.batt_dis_w && input.batt_chg_w > 0) {
    return {
      key: "battery",
      state: "CHARGING",
      icon: resolveIcon(config, "battery_charge"),
      value_w: input.batt_chg_w,
      color_key: "battery_charge",
      entity_id: entities.battery_charge || null,
    };
  }

  if (input.batt_dis_w > 0) {
    return {
      key: "battery",
      state: "DISCHARGING",
      icon: resolveIcon(config, "battery_discharge"),
      value_w: input.batt_dis_w,
      color_key: "battery_discharge",
      entity_id: entities.battery_discharge || null,
    };
  }

  return {
    key: "battery",
    state: "IDLE",
    icon: resolveIcon(config, "battery_discharge"),
    value_w: 0,
    color_key: "battery_charge",
    entity_id: entities.battery_charge || entities.battery_discharge || null,
  };
}

function buildBatteryOutputBlock(input, entities, config) {
  return {
    key: "battery_output",
    state: input.battery_output_w > 0 ? "ACTIVE" : "IDLE",
    icon: resolveIcon(config, "battery_output"),
    value_w: input.battery_output_w,
    color_key: "battery_output",
    entity_id: resolveBatteryOutputEntityId(entities) || null,
  };
}

function buildGridBlock(input, entities, config) {
  if (input.grid_exp_w > 0) {
    return {
      key: "grid",
      state: "EXPORTING",
      icon: resolveIcon(config, "grid_export"),
      value_w: input.grid_exp_w,
      color_key: "grid_export",
      entity_id: entities.grid_export || null,
    };
  }

  if (input.grid_imp_w > 0) {
    return {
      key: "grid",
      state: "IMPORTING",
      icon: resolveIcon(config, "grid_import"),
      value_w: input.grid_imp_w,
      color_key: "grid_import",
      entity_id: entities.grid_import || null,
    };
  }

  return {
    key: "grid",
    state: "IDLE",
    icon: resolveIcon(config, "grid_import"),
    value_w: 0,
    color_key: "grid_import",
    entity_id: entities.grid_import || entities.grid_export || null,
  };
}

function computeSegmentWidths(input) {
  let w_home_base = DEFAULT_MIN_HOME;
  let w_pv_base = DEFAULT_MIN_OTHER;
  let w_batt_base = DEFAULT_MIN_OTHER;
  let w_battery_output_base = DEFAULT_MIN_OTHER;
  let w_grid_base = DEFAULT_MIN_OTHER;

  const base_sum = w_home_base + w_pv_base + w_batt_base + w_battery_output_base + w_grid_base;
  let extra = 1 - base_sum;

  if (extra < 0) {
    const scale = 1 / base_sum;
    w_home_base *= scale;
    w_pv_base *= scale;
    w_batt_base *= scale;
    w_battery_output_base *= scale;
    w_grid_base *= scale;
    extra = 0;
  }

  const batt_act_w = Math.max(input.batt_chg_w, input.batt_dis_w);
  const battery_output_w = input.battery_output_w;
  const grid_act_w = Math.max(input.grid_imp_w, input.grid_exp_w);

  const raw_pv = Math.sqrt(input.pv_w);
  const raw_batt = Math.sqrt(batt_act_w);
  const raw_battery_output = Math.sqrt(battery_output_w);
  let raw_home = Math.sqrt(input.load_w);
  const raw_grid = Math.sqrt(grid_act_w);

  const peer_max = Math.max(raw_pv, raw_batt, raw_battery_output, raw_grid);
  if (peer_max > 0 && raw_home > (peer_max * HOME_DOMINANCE_RATIO)) {
    raw_home *= HOME_BIAS_FACTOR;
  }

  const sum_raw = raw_pv + raw_batt + raw_battery_output + raw_home + raw_grid;

  let w_pv;
  let w_batt;
  let w_battery_output;
  let w_home;
  let w_grid;

  if (sum_raw <= 0) {
    const divisor = 5;
    const equal_extra = extra / divisor;
    w_pv = w_pv_base + equal_extra;
    w_batt = w_batt_base + equal_extra;
    w_battery_output = w_battery_output_base + equal_extra;
    w_home = w_home_base + equal_extra;
    w_grid = w_grid_base + equal_extra;
  } else {
    w_pv = w_pv_base + (extra * (raw_pv / sum_raw));
    w_batt = w_batt_base + (extra * (raw_batt / sum_raw));
    w_battery_output = w_battery_output_base + (extra * (raw_battery_output / sum_raw));
    w_home = w_home_base + (extra * (raw_home / sum_raw));
    w_grid = w_grid_base + (extra * (raw_grid / sum_raw));
  }

  const normalized = normalizeWidths({
    pv: w_pv,
    battery: w_batt,
    battery_output: w_battery_output,
    home: w_home,
    grid: w_grid,
  });
  return normalized;
}

function computeSegmentOrder(input) {
  if (input.grid_imp_w > 0) {
    return ["pv", "battery", "battery_output", "grid", "home"];
  }

  return ["pv", "battery", "battery_output", "home", "grid"];
}

function normalizeWidths(widths) {
  const sum = widths.pv + widths.battery + widths.battery_output + widths.home + widths.grid;
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
    pv: widths.pv / sum,
    battery: widths.battery / sum,
    battery_output: widths.battery_output / sum,
    home: widths.home / sum,
    grid: widths.grid / sum,
  };
}

function hasRequiredEntities(entities) {
  if (!entities || typeof entities !== "object") {
    return false;
  }

  const hasCore = CORE_REQUIRED_ENTITY_KEYS.every((key) => isNonEmptyEntityId(entities[key]));
  if (!hasCore) {
    return false;
  }

  const hasBatteryOutput = isNonEmptyEntityId(resolveBatteryOutputEntityId(entities));
  const hasSplitBattery =
    isNonEmptyEntityId(entities.battery_charge)
    && isNonEmptyEntityId(entities.battery_discharge);

  return hasBatteryOutput || hasSplitBattery;
}

function readEntityPowerWatts(hass, entityId) {
  if (!entityId) {
    return 0;
  }

  const state = hass?.states?.[entityId];
  if (!state) {
    return 0;
  }

  const n = toNumber(state.state);
  if (!Number.isFinite(n)) {
    return 0;
  }

  const unitRaw = state.attributes?.unit_of_measurement;
  const unit = typeof unitRaw === "string" ? unitRaw.trim().toLowerCase() : "";

  if (ENERGY_UNITS.has(unit)) {
    throw new Error(`${entityId} has energy unit '${unitRaw}'. Use an instantaneous power sensor in W.`);
  }
  if (unit && !POWER_UNITS.has(unit)) {
    throw new Error(`${entityId} has unit '${unitRaw}'. Expected W.`);
  }

  return Math.max(0, n);
}

function toNumber(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const text = String(raw).trim().toLowerCase();
  if (!text || text === "unknown" || text === "unavailable" || text === "none") {
    return null;
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function zeroInput() {
  return {
    pv_w: 0,
    load_w: 0,
    batt_chg_w: 0,
    batt_dis_w: 0,
    battery_output_w: 0,
    grid_imp_w: 0,
    grid_exp_w: 0,
  };
}

function isNonEmptyEntityId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveBatteryOutputEntityId(entities) {
  return entities?.battery_output || "";
}

function resolveIcon(config, key) {
  const custom = config?.icons?.[key];
  if (typeof custom === "string" && custom.trim().length > 0) {
    return custom.trim();
  }
  return DEFAULT_ICONS[key] || "mdi:help-circle";
}

/* src/validate.js */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid configuration.");
  }

  if (config.type !== CARD_TYPE) {
    throw new Error(`Card type must be '${CARD_TYPE}'.`);
  }

  validateRange(config.bar_height, "bar_height", 24, 72);
  validateRange(config.corner_radius, "corner_radius", 0, 30);
  validateRange(config.row_gap, "row_gap", 0, 4);
  validateRange(config.track_blend, "track_blend", 0.15, 0.3);
  validateRange(config.spring_stiffness, "spring_stiffness", 80, 420);
  validateRange(config.spring_damping, "spring_damping", 10, 60);
  validateRange(config.value_tween_ms, "value_tween_ms", 150, 250);
  validateIntegerRange(config.value_decimals, "value_decimals", 0, 2);
  validateBoolean(config.background_transparent, "background_transparent");
  validateIcons(config.icons);
  validateVisibility(config.hysteresis);

  if (config.palette !== undefined) {
    if (!config.palette || typeof config.palette !== "object") {
      throw new Error("palette must be an object.");
    }
    const allowed = [
      "pv",
      "battery_charge",
      "battery_discharge",
      "battery_output",
      "home_consumption",
      "grid_import",
      "grid_export",
      "background",
      "track",
      "text",
    ];

    for (const [key, value] of Object.entries(config.palette)) {
      if (!allowed.includes(key)) {
        throw new Error(`Unsupported palette key: ${key}`);
      }
      if (typeof value !== "string" || !HEX_COLOR.test(value)) {
        throw new Error(`palette.${key} must be a hex color like #A1B2C3.`);
      }
    }
  }

  if (config.entities !== undefined) {
    if (!config.entities || typeof config.entities !== "object") {
      throw new Error("entities must be an object.");
    }
    const allowed = [
      "pv",
      "battery_charge",
      "battery_discharge",
      "battery_output",
      "home_consumption",
      "grid_import",
      "grid_export",
      "home_coverage",
    ];
    const requiredCore = ["pv", "home_consumption", "grid_import", "grid_export"];

    for (const [key, value] of Object.entries(config.entities)) {
      if (!allowed.includes(key)) {
        throw new Error(`Unsupported entities key: ${key}`);
      }
      if (typeof value !== "string") {
        throw new Error(`entities.${key} must be an entity id string.`);
      }
    }
    for (const key of requiredCore) {
      if (typeof config.entities[key] !== "string" || config.entities[key].trim().length === 0) {
        throw new Error(`Missing required entity: entities.${key}`);
      }
    }

    const hasBatteryOutput =
      (typeof config.entities.battery_output === "string"
        && config.entities.battery_output.trim().length > 0);
    const hasBatterySplit =
      typeof config.entities.battery_charge === "string"
      && config.entities.battery_charge.trim().length > 0
      && typeof config.entities.battery_discharge === "string"
      && config.entities.battery_discharge.trim().length > 0;

    if (!hasBatteryOutput && !hasBatterySplit) {
      throw new Error(
        "Provide either entities.battery_output or both entities.battery_charge and entities.battery_discharge.",
      );
    }
  }

  if (config.entities === undefined) {
    throw new Error("Missing required object: entities");
  }
}

function validateRange(value, key, min, max) {
  if (value === undefined) {
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}.`);
  }
}

function validateIntegerRange(value, key, min, max) {
  if (value === undefined) {
    return;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
}

function validateBoolean(value, key) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be true or false.`);
  }
}

function validateIcons(icons) {
  if (icons === undefined) {
    return;
  }
  if (!icons || typeof icons !== "object") {
    throw new Error("icons must be an object.");
  }

  const allowed = [
    "pv",
    "battery_charge",
    "battery_discharge",
    "battery_output",
    "home_consumption",
    "grid_import",
    "grid_export",
  ];

  for (const [key, value] of Object.entries(icons)) {
    if (!allowed.includes(key)) {
      throw new Error(`Unsupported icons key: ${key}`);
    }
    if (typeof value !== "string") {
      throw new Error(`icons.${key} must be an icon name string.`);
    }
  }
}

function validateVisibility(hysteresis) {
  if (hysteresis === undefined) {
    return;
  }
  if (!hysteresis || typeof hysteresis !== "object") {
    throw new Error("hysteresis must be an object.");
  }

  for (const [segmentKey, value] of Object.entries(hysteresis)) {
    if (!VISIBILITY_SEGMENT_KEYS.includes(segmentKey)) {
      throw new Error(`Unsupported hysteresis key: ${segmentKey}`);
    }
    if (!value || typeof value !== "object") {
      throw new Error(`hysteresis.${segmentKey} must be an object.`);
    }

    const allowed = ["show_threshold", "hide_threshold"];
    for (const [subKey, subValue] of Object.entries(value)) {
      if (!allowed.includes(subKey)) {
        throw new Error(`Unsupported hysteresis.${segmentKey} key: ${subKey}`);
      }
      const n = Number(subValue);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`hysteresis.${segmentKey}.${subKey} must be a non-negative number.`);
      }
    }

    const showThreshold = numberOrFallback(value.show_threshold, DEFAULT_VISIBILITY[segmentKey].show_threshold);
    const hideThreshold = numberOrFallback(value.hide_threshold, DEFAULT_VISIBILITY[segmentKey].hide_threshold);
    if (hideThreshold > showThreshold) {
      throw new Error(`hysteresis.${segmentKey}.hide_threshold must be less than or equal to hysteresis.${segmentKey}.show_threshold.`);
    }
  }
}

function numberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* src/powerflow-bar-card.js */
const DEFAULT_STYLE = {
  bar_height: 56,
  corner_radius: 28,
  row_gap: 0,
  track_blend: 0.2,
  spring_stiffness: 230,
  spring_damping: 22,
  value_tween_ms: 180,
  value_decimals: 0,
};

const DEFAULT_PALETTE = {
  background: "#F4F4F4",
  track: "#EAECEF",
  text: "#2E2E2E",
  pv: "#E6C86E",
  battery_charge: "#4CAF8E",
  battery_discharge: "#2E8B75",
  battery_output: "#5B9BCF",
  home_consumption: "#9FA8B2",
  grid_import: "#C99A6A",
  grid_export: "#8C6BB3",
};

const SEGMENT_ORDER = ["pv", "battery", "battery_output", "home", "grid"];
const COLOR_FADE_DURATION_MS = 260;
const COLOR_FADE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const ICON_PULSE_DURATION_MS = 240;
const VISIBILITY_TRANSITION_MS = 220;

const EDITOR_NUMBER_FIELDS = [
  { key: "bar_height", label: "Bar height", min: 24, max: 72, step: 1 },
  { key: "corner_radius", label: "Corner radius", min: 0, max: 30, step: 1 },
  { key: "row_gap", label: "Row gap", min: 0, max: 4, step: 0.1 },
  { key: "track_blend", label: "Track blend", min: 0.15, max: 0.3, step: 0.01 },
  { key: "spring_stiffness", label: "Spring stiffness", min: 80, max: 420, step: 1 },
  { key: "spring_damping", label: "Spring damping", min: 10, max: 60, step: 1 },
  { key: "value_tween_ms", label: "Value tween (ms)", min: 150, max: 250, step: 1 },
  { key: "value_decimals", label: "Value decimals", min: 0, max: 2, step: 1, integer: true },
];
const EDITOR_NUMBER_FIELD_BY_KEY = Object.fromEntries(
  EDITOR_NUMBER_FIELDS.map((field) => [field.key, field]),
);

const ENTITY_FIELD_ORDER = [
  "pv",
  "battery_charge",
  "battery_discharge",
  "battery_output",
  "home_consumption",
  "grid_import",
  "grid_export",
  "home_coverage",
];

const ICON_FIELD_ORDER = [
  "pv",
  "battery_charge",
  "battery_discharge",
  "battery_output",
  "home_consumption",
  "grid_import",
  "grid_export",
];

const PALETTE_FIELD_ORDER = [
  "pv",
  "battery_charge",
  "battery_discharge",
  "battery_output",
  "home_consumption",
  "grid_import",
  "grid_export",
  "background",
  "track",
  "text",
];
const VISIBILITY_THRESHOLD_FIELDS = [
  {
    leaf: "show_threshold",
    label: "Show above (W)",
    min: 0,
    max: 5000,
    step: 1,
    help: "Segment appears when its value rises above this threshold.",
  },
  {
    leaf: "hide_threshold",
    label: "Hide at or below (W)",
    min: 0,
    max: 5000,
    step: 1,
    help: "Segment stays visible until its value drops to this threshold or lower.",
  },
];

const ENTITY_LABELS = {
  pv: "PV",
  battery_charge: "Battery charge",
  battery_discharge: "Battery discharge",
  battery_output: "Battery output",
  home_consumption: "Home consumption",
  grid_import: "Grid import",
  grid_export: "Grid export",
  home_coverage: "Home coverage (optional)",
};

const PALETTE_LABELS = {
  pv: "PV",
  battery_charge: "Battery charge",
  battery_discharge: "Battery discharge",
  battery_output: "Battery output",
  home_consumption: "Home consumption",
  grid_import: "Grid import",
  grid_export: "Grid export",
  background: "Background",
  track: "Track",
  text: "Text",
};

const VISIBILITY_FIELD_BY_PATH = Object.fromEntries(
  VISIBILITY_SEGMENT_KEYS.flatMap((segmentKey) => VISIBILITY_THRESHOLD_FIELDS.map((field) => [
    `hysteresis.${segmentKey}.${field.leaf}`,
    field,
  ])),
);

const MAIN_ENTITY_EDITOR_SECTIONS = [
  {
    entityKey: "pv",
    title: "PV",
    iconKey: "pv",
    colorKey: "pv",
    visibilityKey: "pv",
    visibilityTitle: "PV segment visibility",
  },
  {
    entityKey: "battery_charge",
    title: "Battery Charge",
    iconKey: "battery_charge",
    colorKey: "battery_charge",
    hint: "Use together with Battery Discharge when Battery Output is not configured.",
    visibilityKey: "battery",
    visibilityTitle: "Shared battery segment visibility",
  },
  {
    entityKey: "battery_discharge",
    title: "Battery Discharge",
    iconKey: "battery_discharge",
    colorKey: "battery_discharge",
    hint: "Use together with Battery Charge when Battery Output is not configured.",
  },
  {
    entityKey: "battery_output",
    title: "Battery Output",
    iconKey: "battery_output",
    colorKey: "battery_output",
    hint: "Recommended. Alternative: configure both Battery Charge and Battery Discharge.",
    visibilityKey: "battery_output",
    visibilityTitle: "Battery output segment visibility",
  },
  {
    entityKey: "home_consumption",
    title: "Home Consumption",
    iconKey: "home_consumption",
    colorKey: "home_consumption",
  },
  {
    entityKey: "grid_import",
    title: "Grid Import",
    iconKey: "grid_import",
    colorKey: "grid_import",
    visibilityKey: "grid",
    visibilityTitle: "Shared grid segment visibility",
  },
  {
    entityKey: "grid_export",
    title: "Grid Export",
    iconKey: "grid_export",
    colorKey: "grid_export",
  },
  { entityKey: "home_coverage", title: "Home Coverage (optional)" },
];

const CARD_COLOR_KEYS = ["background", "track", "text"];
const REQUIRED_ENTITY_KEYS = new Set(["pv", "home_consumption", "grid_import", "grid_export"]);
const EDITOR_BOOLEAN_FIELDS = [
  { key: "background_transparent", label: "Transparent background" },
];
const REORDER_MIN_DELTA_PX = 2;
const REORDER_DURATION_MS = 280;
const REORDER_EASING = "cubic-bezier(0.25, 0.8, 0.25, 1)";
const EDITOR_FIELD_HELP = {
  bar_height: "Card row height in px.",
  corner_radius: "Corner radius of the row.",
  row_gap: "Gap between visible main segments.",
  track_blend: "Blend factor between track and segment colors.",
  spring_stiffness: "Segment width animation stiffness.",
  spring_damping: "Segment width animation damping.",
  value_tween_ms: "Numeric value tween duration in milliseconds.",
  value_decimals: "Decimal precision for all displayed numeric values.",
  background_transparent: "Makes the card background transparent and ignores palette.background.",
  background: "Card background color.",
  track: "Track/base color behind segments.",
  text: "Text and icon color.",
};

class PowerFlowBarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._model = null;
    this._refs = null;
    this._rendered = false;
    this._lastSignature = "";
    this._valueTweenRaf = 0;
    this._valueTweenState = createValueTweenState();
    this._segmentVisibility = createSegmentVisibilityState();
    this._segmentHideTimers = {};
    this._onMainClick = (event) => this._handleMainClick(event);

    this._animator = new SegmentedBarAnimator((widths) => {
      this._renderWidths(widths);
    });
  }

  connectedCallback() {
    this._animator.start();
    if (this._refs?.shell) {
      this._refs.shell.addEventListener("click", this._onMainClick);
    }
  }

  disconnectedCallback() {
    this._animator.stop();
    if (this._refs?.shell) {
      this._refs.shell.removeEventListener("click", this._onMainClick);
    }
    if (this._valueTweenRaf) {
      cancelAnimationFrame(this._valueTweenRaf);
      this._valueTweenRaf = 0;
    }
    clearSegmentHideTimers(this._segmentHideTimers);
  }

  static getStubConfig() {
    return {
      type: CARD_TYPE,
      background_transparent: false,
      entities: {
        pv: "sensor.pv_power",
        battery_charge: "sensor.battery_charge_power",
        battery_discharge: "sensor.battery_discharge_power",
        battery_output: "sensor.battery_output_power",
        home_consumption: "sensor.home_consumption_power",
        grid_import: "sensor.grid_import_power",
        grid_export: "sensor.grid_export_power",
        home_coverage: "sensor.home_coverage",
      },
      palette: {
        ...DEFAULT_PALETTE,
      },
      icons: {
        ...DEFAULT_ICONS,
      },
      hysteresis: cloneVisibilityConfig(DEFAULT_VISIBILITY),
    };
  }

  static async getConfigElement() {
    if (!customElements.get("powerflow-bar-editor")) {
      customElements.define("powerflow-bar-editor", PowerFlowBarEditor);
    }
    return document.createElement("powerflow-bar-editor");
  }

  setConfig(config) {
    const incomingSource = config && typeof config === "object" ? config : {};
    const { name: _ignoredName, ...incoming } = incomingSource;
    const configWithType = {
      ...incoming,
      type: incoming.type || CARD_TYPE,
    };

    if (hasEditorRequiredEntities(configWithType.entities)) {
      validateConfig(configWithType);
    } else if (configWithType.type !== CARD_TYPE) {
      throw new Error(`Card type must be '${CARD_TYPE}'.`);
    }

    this._config = {
      ...incoming,
      type: configWithType.type,
      bar_height: numberOr(incoming.bar_height, DEFAULT_STYLE.bar_height),
      corner_radius: numberOr(incoming.corner_radius, DEFAULT_STYLE.corner_radius),
      row_gap: numberOr(incoming.row_gap, DEFAULT_STYLE.row_gap),
      track_blend: numberOr(incoming.track_blend, DEFAULT_STYLE.track_blend),
      spring_stiffness: numberOr(incoming.spring_stiffness, DEFAULT_STYLE.spring_stiffness),
      spring_damping: numberOr(incoming.spring_damping, DEFAULT_STYLE.spring_damping),
      value_tween_ms: numberOr(incoming.value_tween_ms, DEFAULT_STYLE.value_tween_ms),
      value_decimals: numberOr(incoming.value_decimals, DEFAULT_STYLE.value_decimals),
      background_transparent: boolOr(incoming.background_transparent, false),
      icons: normalizeIcons(incoming.icons),
      hysteresis: normalizeVisibilityConfig(incoming.hysteresis),
      palette: {
        ...DEFAULT_PALETTE,
        ...(incoming.palette || {}),
      },
      entities: { ...(incoming.entities || {}) },
    };

    this._lastSignature = "";
    this._valueTweenState = createValueTweenState();
    this._segmentVisibility = createSegmentVisibilityState();
    clearSegmentHideTimers(this._segmentHideTimers);

    if (!this._rendered) {
      this._renderStatic();
      this._rendered = true;
    }

    this._applyTheme();
    this._animator.setOptions(this._config);
    this._computeAndApplyModel();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) {
      return;
    }

    const relevant = collectRelevantEntities(this._config);
    const signature = computeEntitySignature(hass, relevant);
    if (signature === this._lastSignature) {
      return;
    }

    this._lastSignature = signature;
    this._computeAndApplyModel();
  }

  getCardSize() {
    return 1;
  }

  _renderStatic() {
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="shell">
          <div id="hem-row" class="row" role="img" aria-label="PowerFlow Bar segmented power bar">
            <div id="hem-main" class="segments main">
              ${buildSegmentShells()}
            </div>
          </div>
        </div>
      </ha-card>
      ${styles()}
    `;

    this._refs = {
      shell: this.shadowRoot.querySelector(".shell"),
      rowMain: this.shadowRoot.getElementById("hem-main"),
      segments: buildSegmentRefs(this.shadowRoot),
    };
    if (this.isConnected) {
      this._refs.shell.addEventListener("click", this._onMainClick);
    }
  }

  _computeAndApplyModel() {
    try {
      this._model = computeBalanceModel(this._config, this._hass, this._segmentVisibility);
    } catch (error) {
      this._model = computeBalanceModel(this._config, null, this._segmentVisibility);
      console.warn("powerflow-bar: invalid sensor setup", error);
    }

    this._applyBlockVisuals(this._model.blocks, this._model.order, this._model.visible_keys);
    this._applySegmentLayout(this._model.order, this._model.visible_keys);
    this._animator.setTargets(this._model.widths);
    syncSegmentVisibilityState(this._segmentVisibility, this._model.visible_keys);
  }

  _applyTheme() {
    const p = normalizePalette(this._config.palette);

    this.style.setProperty("--hem-bar-height", `${clamp(24, this._config.bar_height, 72)}px`);
    this.style.setProperty("--hem-radius", `${clamp(0, this._config.corner_radius, 30)}px`);
    this.style.setProperty("--hem-gap", `${clamp(0, this._config.row_gap, 4)}px`);
    this.style.setProperty("--hem-card-bg", this._config.background_transparent ? "transparent" : p.background);
    this.style.setProperty("--hem-track", p.track);
    this.style.setProperty("--hem-text", p.text);
  }

  _applyBlockVisuals(blocks, order, visibleKeys) {
    const palette = normalizePalette(this._config.palette);
    const blendAmount = clamp(0.15, this._config.track_blend, 0.3);
    const visibleOrder = order.filter((key) => visibleKeys.includes(key));
    const homeCoverageSuffix = this._buildHomeCoverageSuffix();
    const colorByKey = {};

    for (const key of visibleOrder) {
      const block = blocks[key];
      const color = palette[block.color_key] || palette.track;
      colorByKey[key] = {
        main: blendHex(palette.track, color, blendAmount),
      };
    }

    for (const key of SEGMENT_ORDER) {
      const segment = this._refs.segments[key];
      const block = blocks[key];
      const idx = visibleOrder.indexOf(key);
      const prevKey = idx > 0 ? visibleOrder[idx - 1] : null;
      const nextKey = idx >= 0 && idx < (visibleOrder.length - 1) ? visibleOrder[idx + 1] : null;
      const mainColor = colorByKey[key]?.main || palette.track;
      const mainGradient = buildSmoothSegmentGradient(
        mainColor,
        prevKey ? colorByKey[prevKey].main : null,
        nextKey ? colorByKey[nextKey].main : null,
      );

      setSegmentBackground(segment, mainGradient);
      if (key === "battery" && isBatteryDirectionChange(segment.main?.dataset?.batteryState, block.state)) {
        pulseBatteryIcon(segment.icon);
      }
      if (segment.main) {
        segment.main.dataset.batteryState = key === "battery" ? block.state || "" : "";
      }
      segment.icon.setAttribute("icon", block.icon);
      segment.valueButton.dataset.entityId = block.entity_id || "";
      segment.valueButton.style.cursor = block.entity_id ? "pointer" : "default";
      const valueSuffix = key === "home" ? homeCoverageSuffix : "";
      this._setValueTarget(key, block, valueSuffix);
    }
    this._ensureValueTweenLoop();
  }

  _buildHomeCoverageSuffix() {
    const entityId = this._config?.entities?.home_coverage;
    if (!isEntityId(entityId)) {
      return "";
    }

    const state = this._hass?.states?.[entityId];
    if (!state) {
      return "";
    }

    const n = toNumberLoose(state.state);
    if (!Number.isFinite(n) || n <= 0) {
      return "";
    }

    const valueText = formatEntityStateValue(
      state.state,
      state.attributes?.unit_of_measurement,
      this._config.value_decimals,
    );
    if (!valueText || valueText === "--") {
      return "";
    }

    return `(${valueText})`;
  }

  _applySegmentLayout(order, visibleKeys) {
    const orderIndex = {};
    for (let i = 0; i < order.length; i += 1) {
      orderIndex[order[i]] = i;
    }
    const visibleSet = new Set(visibleKeys);

    this._animateSegmentReorder(() => {
      for (const key of SEGMENT_ORDER) {
        const segment = this._refs.segments[key];
        const visible = visibleSet.has(key);
        const idx = Number.isFinite(orderIndex[key]) ? orderIndex[key] : 99;

        segment.main.style.order = String(idx);
        setSegmentVisibility(segment.main, visible, this._segmentHideTimers);
      }
    });
  }

  _animateSegmentReorder(applyLayout) {
    if (!this.isConnected || !this._refs) {
      applyLayout();
      return;
    }

    const nodes = [];
    for (const key of SEGMENT_ORDER) {
      const segment = this._refs.segments[key];
      nodes.push(segment.main);
    }

    const before = new Map();
    for (const node of nodes) {
      stopNodeReorderAnimation(node);
      before.set(node, node.getBoundingClientRect());
    }

    applyLayout();

    this._refs.rowMain?.getBoundingClientRect();

    const staged = [];

    for (const node of nodes) {
      if (node.style.display === "none") {
        continue;
      }

      const prev = before.get(node);
      const next = node.getBoundingClientRect();
      if (!prev || !next) {
        continue;
      }

      const dx = prev.left - next.left;
      if (Math.abs(dx) < REORDER_MIN_DELTA_PX) {
        continue;
      }

      node.style.transition = "none";
      node.style.transform = `translateX(${dx}px)`;
      node.style.willChange = "transform";
      staged.push(node);
    }

    if (staged.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      for (const node of staged) {
        node.style.transition = `transform ${REORDER_DURATION_MS}ms ${REORDER_EASING}`;
        node.style.transform = "translateX(0)";
      }

      window.setTimeout(() => {
        for (const node of staged) {
          stopNodeReorderAnimation(node);
        }
      }, REORDER_DURATION_MS);
    });
  }

  _renderWidths(widths) {
    if (!this._rendered || !this._refs) {
      return;
    }

    for (const key of SEGMENT_ORDER) {
      const segment = this._refs.segments[key];
      const grow = toFr(widths[key]);
      segment.main.style.flexGrow = grow;
      segment.main.style.flexBasis = "0%";
    }
  }

  _setValueTarget(key, block, suffix) {
    const state = this._valueTweenState[key];
    const target = Math.max(0, Number(block.value_w) || 0);
    const duration = clamp(150, this._config.value_tween_ms, 250);
    const valueSuffix = typeof suffix === "string" ? suffix : "";

    if (!Number.isFinite(state.display)) {
      state.display = target;
    }

    if (state.target === target && state.suffix === valueSuffix) {
      if (this._refs?.segments?.[key]) {
        this._refs.segments[key].value.textContent = formatBlockValue({
          value_w: state.display,
          suffix: state.suffix,
        }, this._config.value_decimals);
      }
      return;
    }

    const now = nowMs();
    state.from = state.display;
    state.target = target;
    state.suffix = valueSuffix;
    state.start = now;
    state.duration = duration;
    state.active = true;
  }

  _ensureValueTweenLoop() {
    if (this._valueTweenRaf) {
      return;
    }
    this._valueTweenRaf = requestAnimationFrame((ts) => this._tickValueTween(ts));
  }

  _tickValueTween(ts) {
    let hasActive = false;

    for (const key of SEGMENT_ORDER) {
      const state = this._valueTweenState[key];
      if (!state) {
        continue;
      }

      if (state.active) {
        const elapsed = Math.max(0, ts - state.start);
        const t = clamp(0, elapsed / state.duration, 1);
        const eased = easeOutCubic(t);
        state.display = lerp(state.from, state.target, eased);

        if (t >= 1) {
          state.display = state.target;
          state.active = false;
        } else {
          hasActive = true;
        }
      }

      const segment = this._refs?.segments?.[key];
      if (segment) {
        segment.value.textContent = formatBlockValue({
          value_w: state.display,
          suffix: state.suffix,
        }, this._config.value_decimals);
      }
    }

    if (hasActive) {
      this._valueTweenRaf = requestAnimationFrame((nextTs) => this._tickValueTween(nextTs));
      return;
    }

    this._valueTweenRaf = 0;
  }

  _handleMainClick(event) {
    if (!this._refs?.shell?.contains(event.target)) {
      return;
    }

    const valueButton = event.target?.closest?.(".value-button");
    if (valueButton && this._refs.rowMain.contains(valueButton)) {
      event.preventDefault();
      event.stopPropagation();
      this._openMoreInfo(valueButton.dataset.entityId);
    }
  }

  _openMoreInfo(entityId) {
    if (!entityId) {
      return;
    }
    const moreInfo = new Event("hass-more-info", {
      bubbles: true,
      composed: true,
    });
    moreInfo.detail = { entityId };
    this.dispatchEvent(moreInfo);
  }
}

class PowerFlowBarEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._rendered = false;
    this._refs = null;
    this._entityPickers = {};
    this._numberSelectors = {};
    this._iconSelectors = {};
    this._booleanSelectors = {};
    this._visibilitySelectors = {};
    this._entityCards = {};
    this._inlineErrors = {};
    this._onFormChange = (event) => this._handleFormChange(event);
    this._onFormInput = (event) => this._handleFormInput(event);
    this._onValueChanged = (event) => this._handleValueChangedEvent(event);
  }

  set hass(hass) {
    this._hass = hass;
    this._syncEntityPickerHass();
  }

  connectedCallback() {
    this._render();
    if (this._config) {
      this._syncFormFromConfig();
      this._emitConfigAsync(this._config);
    }
  }

  disconnectedCallback() {
    const form = this._refs?.form;
    if (form) {
      form.removeEventListener("change", this._onFormChange);
      form.removeEventListener("input", this._onFormInput);
    }
    if (this.shadowRoot) {
      this.shadowRoot.removeEventListener("value-changed", this._onValueChanged);
    }
  }

  setConfig(config) {
    const incoming = config && typeof config === "object" ? config : {};
    const stub = PowerFlowBarCard.getStubConfig();
    if (!hasAnyEntityMapping(incoming.entities)) {
      const seeded = {
        ...stub,
        ...incoming,
        type: CARD_TYPE,
        entities: {
          ...stub.entities,
          ...(incoming.entities || {}),
        },
        icons: {
          ...stub.icons,
          ...(incoming.icons || {}),
        },
        palette: {
          ...stub.palette,
          ...(incoming.palette || {}),
        },
        hysteresis: {
          ...stub.hysteresis,
          ...(incoming.hysteresis || {}),
        },
      };
      this._config = normalizeEditorConfig(seeded);
    } else {
      this._config = normalizeEditorConfig({
        ...incoming,
        type: incoming.type || CARD_TYPE,
      });
    }
    this._render();
    this._syncFormFromConfig();
    this._emitConfigAsync(this._config);
  }

  _emitConfigAsync(config) {
    if (!this.isConnected) {
      return;
    }
    emitConfigChanged(this, config);
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }
    if (!this._rendered) {
      this.shadowRoot.innerHTML = buildEditorMarkup();
      const form = this.shadowRoot.querySelector("form");
      if (form) {
        form.addEventListener("change", this._onFormChange);
        form.addEventListener("input", this._onFormInput);
      }
      this.shadowRoot.addEventListener("value-changed", this._onValueChanged);
      this._refs = { form };
      this._buildEntityPickers();
      this._buildNumberSelectors();
      this._buildIconSelectors();
      this._buildBooleanSelectors();
      this._buildVisibilitySelectors();
      this._collectEditorRefs();
      this._rendered = true;
    }
    this._syncEntityPickerHass();
  }

  _collectEditorRefs() {
    this._entityCards = {};
    this._inlineErrors = {};
    for (const section of MAIN_ENTITY_EDITOR_SECTIONS) {
      const key = section.entityKey;
      this._entityCards[key] = this.shadowRoot.querySelector(`[data-entity-card="${key}"]`);
      this._inlineErrors[key] = this.shadowRoot.querySelector(`[data-inline-error="${key}"]`);
    }
    this._refs.validation = this.shadowRoot.querySelector("#entity-validation");
  }

  _buildEntityPickers() {
    if (!this.shadowRoot) {
      return;
    }
    for (const section of MAIN_ENTITY_EDITOR_SECTIONS) {
      const key = section.entityKey;
      const slot = this.shadowRoot.querySelector(`[data-entity-slot="${key}"]`);
      if (!slot) {
        continue;
      }
      const picker = document.createElement("ha-selector");
      picker.dataset.entityKey = key;
      picker.configPath = `entities.${key}`;
      picker.selector = { entity: { domain: ["sensor", "input_number"] } };
      picker.value = "";
      slot.appendChild(picker);
      this._entityPickers[key] = picker;
    }
  }

  _buildNumberSelectors() {
    if (!this.shadowRoot) {
      return;
    }
    for (const field of EDITOR_NUMBER_FIELDS) {
      const slot = this.shadowRoot.querySelector(`[data-number-slot="${field.key}"]`);
      if (!slot) {
        continue;
      }
      const selector = document.createElement("ha-selector");
      selector.dataset.numberKey = field.key;
      selector.configPath = field.key;
      selector.selector = {
        number: {
          min: field.min,
          max: field.max,
          step: field.step,
          mode: "slider",
        },
      };
      selector.value = DEFAULT_STYLE[field.key];
      slot.appendChild(selector);
      this._numberSelectors[field.key] = selector;
    }
  }

  _buildIconSelectors() {
    if (!this.shadowRoot) {
      return;
    }
    for (const key of ICON_FIELD_ORDER) {
      const slot = this.shadowRoot.querySelector(`[data-icon-slot="${key}"]`);
      if (!slot) {
        continue;
      }
      const selector = document.createElement("ha-selector");
      selector.dataset.iconKey = key;
      selector.configPath = `icons.${key}`;
      selector.selector = { icon: {} };
      selector.value = DEFAULT_ICONS[key] || "";
      slot.appendChild(selector);
      this._iconSelectors[key] = selector;
    }
  }

  _buildBooleanSelectors() {
    if (!this.shadowRoot) {
      return;
    }
    for (const field of EDITOR_BOOLEAN_FIELDS) {
      const slot = this.shadowRoot.querySelector(`[data-boolean-slot="${field.key}"]`);
      if (!slot) {
        continue;
      }
      const selector = document.createElement("ha-selector");
      selector.dataset.booleanKey = field.key;
      selector.configPath = field.key;
      selector.selector = { boolean: {} };
      selector.value = false;
      slot.appendChild(selector);
      this._booleanSelectors[field.key] = selector;
    }
  }

  _buildVisibilitySelectors() {
    if (!this.shadowRoot) {
      return;
    }
    for (const section of MAIN_ENTITY_EDITOR_SECTIONS) {
      if (!section.visibilityKey) {
        continue;
      }
      for (const field of VISIBILITY_THRESHOLD_FIELDS) {
        const path = `hysteresis.${section.visibilityKey}.${field.leaf}`;
        const slot = this.shadowRoot.querySelector(`[data-visibility-slot="${path}"]`);
        if (!slot || this._visibilitySelectors[path]) {
          continue;
        }
        const selector = document.createElement("ha-selector");
        selector.dataset.visibilityPath = path;
        selector.configPath = path;
        selector.selector = {
          number: {
            min: field.min,
            max: field.max,
            step: field.step,
            mode: "box",
          },
        };
        selector.value = DEFAULT_VISIBILITY[section.visibilityKey][field.leaf];
        slot.appendChild(selector);
        this._visibilitySelectors[path] = selector;
      }
    }
  }

  _syncEntityPickerHass() {
    for (const picker of Object.values(this._entityPickers)) {
      picker.hass = this._hass;
    }
    for (const selector of Object.values(this._numberSelectors)) {
      selector.hass = this._hass;
    }
    for (const selector of Object.values(this._iconSelectors)) {
      selector.hass = this._hass;
    }
    for (const selector of Object.values(this._booleanSelectors)) {
      selector.hass = this._hass;
    }
    for (const selector of Object.values(this._visibilitySelectors)) {
      selector.hass = this._hass;
    }
  }

  _syncFormFromConfig() {
    if (!this.shadowRoot || !this._config) {
      return;
    }
    const stub = PowerFlowBarCard.getStubConfig();
    const cfg = this._config;

    for (const field of EDITOR_NUMBER_FIELDS) {
      const raw = cfg[field.key];
      const fallback = DEFAULT_STYLE[field.key];
      const numeric = Number.isFinite(Number(raw)) ? Number(raw) : fallback;
      const selector = this._numberSelectors[field.key];
      if (selector) {
        selector.value = numeric;
      }
    }

    for (const key of ENTITY_FIELD_ORDER) {
      const value = cfg.entities?.[key] ?? stub.entities[key] ?? "";
      const picker = this._entityPickers[key];
      if (picker) {
        picker.value = String(value);
      }
    }

    for (const key of ICON_FIELD_ORDER) {
      const value = cfg.icons?.[key] ?? DEFAULT_ICONS[key] ?? "";
      const selector = this._iconSelectors[key];
      if (selector) {
        selector.value = String(value);
      }
    }

    for (const field of EDITOR_BOOLEAN_FIELDS) {
      const selector = this._booleanSelectors[field.key];
      if (selector) {
        selector.value = Boolean(cfg[field.key]);
      }
    }

    for (const segmentKey of VISIBILITY_SEGMENT_KEYS) {
      for (const field of VISIBILITY_THRESHOLD_FIELDS) {
        const path = `hysteresis.${segmentKey}.${field.leaf}`;
        const selector = this._visibilitySelectors[path];
        if (selector) {
          selector.value = cfg.hysteresis?.[segmentKey]?.[field.leaf] ?? DEFAULT_VISIBILITY[segmentKey][field.leaf];
        }
      }
    }

    for (const key of PALETTE_FIELD_ORDER) {
      const value = cfg.palette?.[key] ?? DEFAULT_PALETTE[key] ?? "#000000";
      setInputValue(this.shadowRoot, `palette.${key}`, normalizeHexColor(value, DEFAULT_PALETTE[key] || "#000000"));
    }
    this._updateValidationUI(cfg);
  }

  _handleFormChange(event) {
    if (!this.shadowRoot) {
      return;
    }
    const target = event?.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name?.startsWith("palette.")) {
      const paletteKey = target.name.replace("palette.", "");
      const normalized = normalizeHexColor(target.value, DEFAULT_PALETTE[paletteKey] || "#000000");
      target.value = normalized;
      this._updateConfigPath(target.name, normalized);
    }
  }

  _handleFormInput(event) {
    if (!this.shadowRoot) {
      return;
    }
    const target = event?.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name?.startsWith("palette.")) {
      const paletteKey = target.name.replace("palette.", "");
      const normalized = normalizeHexColor(target.value, DEFAULT_PALETTE[paletteKey] || "#000000");
      target.value = normalized;
      this._updateConfigPath(target.name, normalized);
    }
  }

  _handleValueChangedEvent(event) {
    const pathNodes = typeof event?.composedPath === "function" ? event.composedPath() : [];
    const source = pathNodes.find((node) => node && typeof node === "object" && node.configPath);
    const path = source?.configPath;
    if (!path) {
      return;
    }

    let value = event?.detail?.value;
    if (value === undefined) {
      value = source?.value;
    }

    if (EDITOR_NUMBER_FIELD_BY_KEY[path]) {
      const field = EDITOR_NUMBER_FIELD_BY_KEY[path];
      const numeric = parseNumberRange(value, DEFAULT_STYLE[path], field.min, field.max, field.integer === true);
      this._updateConfigPath(path, numeric);
      return;
    }

    if (VISIBILITY_FIELD_BY_PATH[path]) {
      const field = VISIBILITY_FIELD_BY_PATH[path];
      const numeric = parseNumberRange(value, 0, field.min, field.max, false);
      this._updateConfigPath(path, numeric);
      return;
    }

    const text = String(value ?? "").trim();
    if (path.startsWith("entities.") || path.startsWith("icons.")) {
      this._updateConfigPath(path, text.length > 0 ? text : undefined);
      return;
    }

    this._updateConfigPath(path, value);
  }

  _updateConfigPath(path, value) {
    const next = normalizeEditorConfig(this._config);
    setPathValue(next, path, value);
    this._config = next;
    this._syncFormFromConfig();
    this._updateValidationUI(next);
    this._emitConfigAsync(next);
  }

  _updateValidationUI(config) {
    const entities = config?.entities || {};
    const fieldErrors = {};
    const messages = [];

    for (const key of REQUIRED_ENTITY_KEYS) {
      if (!isEntityId(entities[key])) {
        fieldErrors[key] = "Missing entity.";
        messages.push(`${ENTITY_LABELS[key] || key}: set an entity.`);
      }
    }

    const hasBatteryOutput = isEntityId(entities.battery_output);
    const hasBatteryCharge = isEntityId(entities.battery_charge);
    const hasBatteryDischarge = isEntityId(entities.battery_discharge);
    const hasBatterySplit = hasBatteryCharge && hasBatteryDischarge;

    if (!hasBatteryOutput && !hasBatterySplit) {
      fieldErrors.battery_output = "Provide Battery Output or both Battery Charge and Battery Discharge.";
      if (!hasBatteryCharge) {
        fieldErrors.battery_charge = "Set together with Battery Discharge when Battery Output is empty.";
      }
      if (!hasBatteryDischarge) {
        fieldErrors.battery_discharge = "Set together with Battery Charge when Battery Output is empty.";
      }
      messages.push("Battery setup: set Battery Output, or set both Battery Charge and Battery Discharge.");
    }

    for (const section of MAIN_ENTITY_EDITOR_SECTIONS) {
      const key = section.entityKey;
      const card = this._entityCards[key];
      const inlineError = this._inlineErrors[key];
      const hasError = Boolean(fieldErrors[key]);

      if (card) {
        card.classList.toggle("invalid", hasError);
        if (hasError && "open" in card) {
          card.open = true;
        }
      }
      if (inlineError) {
        inlineError.textContent = fieldErrors[key] || "";
      }
    }

    const validation = this._refs?.validation;
    if (!validation) {
      return;
    }
    if (messages.length === 0) {
      validation.hidden = true;
      validation.textContent = "";
      return;
    }
    validation.hidden = false;
    validation.textContent = messages.join(" ");
  }
}

function buildEditorMarkup() {
  return `
    <style>
      :host {
        display: block;
      }

      .editor {
        padding: 12px;
        display: grid;
        gap: 12px;
      }

      .section {
        border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
        border-radius: 10px;
        padding: 12px;
        display: grid;
        gap: 10px;
      }

      .section h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .section summary {
        list-style: none;
        cursor: pointer;
      }

      .section summary::-webkit-details-marker {
        display: none;
      }

      .section-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .section-summary::after {
        content: "▾";
        opacity: 0.7;
        font-size: 12px;
      }

      details.section:not([open]) .section-summary::after {
        content: "▸";
      }

      .section-content {
        display: grid;
        gap: 12px;
        margin-top: 12px;
      }

      .section-note {
        margin: 0;
        font-size: 12px;
        color: var(--secondary-text-color, #8f97a3);
      }

      .validation {
        font-size: 12px;
        line-height: 1.35;
        color: var(--error-color, #db4437);
        background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--error-color, #db4437) 35%, transparent);
        border-radius: 8px;
        padding: 8px 10px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px 12px;
      }

      .entity-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 10px 12px;
      }

      .entity-card {
        border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
        border-radius: 10px;
        padding: 0;
        display: grid;
        gap: 0;
        overflow: hidden;
      }

      .entity-card > summary {
        list-style: none;
      }

      .entity-card > summary::-webkit-details-marker {
        display: none;
      }

      .entity-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px;
        cursor: pointer;
        background: color-mix(in srgb, var(--primary-text-color, #fff) 4%, transparent);
      }

      .entity-summary::after {
        content: "▾";
        opacity: 0.7;
        font-size: 12px;
      }

      .entity-card:not([open]) .entity-summary::after {
        content: "▸";
      }

      .entity-content {
        display: grid;
        gap: 8px;
        padding: 10px;
      }

      .entity-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }

      .entity-hint {
        margin: 0;
        font-size: 12px;
        color: var(--secondary-text-color, #8f97a3);
      }

      .entity-picker-slot {
        min-height: 56px;
      }

      .entity-inline-error {
        margin: 0;
        min-height: 16px;
        font-size: 12px;
        color: var(--error-color, #db4437);
      }

      .entity-card.invalid {
        border-color: color-mix(in srgb, var(--error-color, #db4437) 55%, transparent);
      }

      .field {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      .field-meta {
        display: grid;
        gap: 2px;
      }

      .field-label {
        font-size: 12px;
        color: var(--secondary-text-color, #8f97a3);
      }

      .field-label-strong {
        font-size: 12px;
        font-weight: 600;
        color: var(--primary-text-color, inherit);
      }

      .field input[type="color"] {
        padding: 0;
        min-height: 36px;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
        border-radius: 8px;
        background: transparent;
      }

      .selector-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 10px 12px;
      }

      .selector-slot {
        min-height: 56px;
      }

      .field-help {
        margin: 0;
        font-size: 12px;
        color: var(--secondary-text-color, #8f97a3);
      }

    </style>
    <form class="editor">
      <details class="section">
        <summary class="section-summary">
          <h3>Layout & Motion</h3>
        </summary>
        <div class="section-content">
          <div class="selector-grid">
            ${EDITOR_NUMBER_FIELDS.map((field) => buildNumberSelectorSlot(field)).join("")}
            ${EDITOR_BOOLEAN_FIELDS.map((field) => buildBooleanSelectorSlot(field)).join("")}
          </div>
          <div class="grid">
            ${CARD_COLOR_KEYS.map((key) => buildColorField(`palette.${key}`, PALETTE_LABELS[key] || key, EDITOR_FIELD_HELP[key] || "")).join("")}
          </div>
        </div>
      </details>
      <section class="section">
        <h3>Main Entities</h3>
        <p class="section-note">Each block has its own entity picker, icon and color. Hysteresis is configured per rendered segment.</p>
        <div id="entity-validation" class="validation" hidden></div>
        <div class="entity-grid">
          ${MAIN_ENTITY_EDITOR_SECTIONS.map((section) => buildEntitySectionCard(section)).join("")}
        </div>
      </section>
    </form>
  `;
}

function buildNumberSelectorSlot(field) {
  return `
    <div class="field">
      <div class="field-meta">
        <span class="field-label-strong">${field.label}</span>
        <p class="field-help">${EDITOR_FIELD_HELP[field.key] || ""}</p>
      </div>
      <div class="selector-slot" data-number-slot="${field.key}"></div>
    </div>
  `;
}

function buildBooleanSelectorSlot(field) {
  return `
    <div class="field">
      <div class="field-meta">
        <span class="field-label-strong">${field.label}</span>
        <p class="field-help">${EDITOR_FIELD_HELP[field.key] || ""}</p>
      </div>
      <div class="selector-slot" data-boolean-slot="${field.key}"></div>
    </div>
  `;
}

function buildEntitySectionCard(section) {
  const iconField = section.iconKey
    ? `
      <div class="field">
        <div class="field-meta">
          <span class="field-label-strong">Icon</span>
        </div>
        <div class="selector-slot" data-icon-slot="${section.iconKey}"></div>
      </div>
    `
    : "";
  const colorField = section.colorKey
    ? buildColorField(`palette.${section.colorKey}`, "Color")
    : "";
  const visibilityFields = section.visibilityKey
    ? buildVisibilityFieldGroup(section.visibilityKey, section.visibilityTitle || "Segment visibility")
    : "";
  const hint = section.hint ? `<p class="entity-hint">${section.hint}</p>` : "";
  return `
    <details class="entity-card" data-entity-card="${section.entityKey}">
      <summary class="entity-summary">
        <h4 class="entity-title">${section.title}</h4>
      </summary>
      <div class="entity-content">
        ${hint}
        <div class="field">
          <div class="field-meta">
            <span class="field-label-strong">Entity</span>
          </div>
          <div class="entity-picker-slot" data-entity-slot="${section.entityKey}"></div>
        </div>
        ${iconField}
        ${colorField}
        ${visibilityFields}
        <p class="entity-inline-error" data-inline-error="${section.entityKey}"></p>
      </div>
    </details>
  `;
}

function buildVisibilityFieldGroup(segmentKey, title) {
  return `
    <div class="field">
      <div class="field-meta">
        <span class="field-label-strong">${title}</span>
        <p class="field-help">Show uses the upper threshold. Hide uses the lower threshold. Defaults \`0 / 0\` mean visible above \`0 W\`.</p>
      </div>
      <div class="selector-grid">
        ${VISIBILITY_THRESHOLD_FIELDS.map((field) => `
          <div class="field">
            <div class="field-meta">
              <span class="field-label">${field.label}</span>
              <p class="field-help">${field.help}</p>
            </div>
            <div class="selector-slot" data-visibility-slot="hysteresis.${segmentKey}.${field.leaf}"></div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function buildColorField(name, label, helpText = "") {
  return `
    <label class="field">
      <div class="field-meta">
        <span class="field-label-strong">${label}</span>
        ${helpText ? `<p class="field-help">${helpText}</p>` : ""}
      </div>
      <input type="color" name="${name}" />
    </label>
  `;
}

function setInputValue(root, name, value) {
  const input = root.querySelector(`input[name="${name}"]`);
  if (!input) {
    return;
  }
  input.value = String(value ?? "");
}

function parseNumberRange(raw, fallback, min, max, integer) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const bounded = clamp(min, parsed, max);
  if (integer) {
    return Math.round(bounded);
  }
  return bounded;
}

function normalizeHexColor(value, fallback) {
  const raw = String(value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return raw.toUpperCase();
  }
  return String(fallback || "#000000").toUpperCase();
}

function stopNodeReorderAnimation(node) {
  if (!node) {
    return;
  }
  node.style.transition = "";
  node.style.transform = "";
  node.style.willChange = "";
}

function normalizeEditorConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  const { name: _ignoredName, ...rest } = source;
  return {
    ...rest,
    type: CARD_TYPE,
    entities: { ...(source.entities || {}) },
    icons: { ...(source.icons || {}) },
    palette: { ...(source.palette || {}) },
    hysteresis: normalizeVisibilityConfig(source.hysteresis),
  };
}

function setPathValue(config, path, value) {
  if (!path || typeof path !== "string" || !config || typeof config !== "object") {
    return;
  }
  const parts = path.split(".");
  if (parts.length === 1) {
    if (value === undefined) {
      delete config[parts[0]];
    } else {
      config[parts[0]] = value;
    }
    return;
  }

  let target = config;
  for (let i = 0; i < (parts.length - 1); i += 1) {
    const key = parts[i];
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key];
  }

  const leaf = parts[parts.length - 1];
  if (value === undefined) {
    delete target[leaf];
  } else {
    target[leaf] = value;
  }

  pruneEmptyPath(config, parts);
}

function pruneEmptyPath(config, parts) {
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const parentPath = parts.slice(0, i);
    const parent = getPathValue(config, parentPath);
    if (!parent || typeof parent !== "object" || Object.keys(parent).length > 0) {
      continue;
    }

    const container = i === 1 ? config : getPathValue(config, parts.slice(0, i - 1));
    if (container && typeof container === "object") {
      delete container[parts[i - 1]];
    }
  }
}

function getPathValue(config, parts) {
  let value = config;
  for (const part of parts) {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    value = value[part];
  }
  return value;
}

function buildSegmentShells() {
  return SEGMENT_ORDER.map((key) => {
    return `
      <div class="segment" data-segment="${key}">
        <div class="segment-bg segment-bg--current"></div>
        <div class="segment-bg segment-bg--fade"></div>
        <div class="primary">
          <div class="icon-wrap">
            <ha-icon></ha-icon>
          </div>
          <button class="value-button" type="button">
            <span class="value">0 W</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function buildSegmentRefs(root) {
  const refs = {};

  for (const key of SEGMENT_ORDER) {
    const main = root.querySelector(`#hem-main .segment[data-segment="${key}"]`);
    refs[key] = {
      main,
      backgroundCurrent: main.querySelector(".segment-bg--current"),
      backgroundFade: main.querySelector(".segment-bg--fade"),
      valueButton: main.querySelector(".value-button"),
      icon: main.querySelector(".icon-wrap ha-icon"),
      value: main.querySelector(".value"),
    };
  }

  return refs;
}

function normalizePalette(palette) {
  return {
    ...DEFAULT_PALETTE,
    ...palette,
    pv: palette?.pv || DEFAULT_PALETTE.pv,
    battery_charge: palette?.battery_charge || DEFAULT_PALETTE.battery_charge,
    battery_discharge: palette?.battery_discharge || DEFAULT_PALETTE.battery_discharge,
    battery_output: palette?.battery_output || DEFAULT_PALETTE.battery_output,
    home_consumption: palette?.home_consumption || DEFAULT_PALETTE.home_consumption,
  };
}

function normalizeVisibilityConfig(visibility) {
  const source = visibility && typeof visibility === "object" ? visibility : {};
  const normalized = {};

  for (const segmentKey of VISIBILITY_SEGMENT_KEYS) {
    const defaults = DEFAULT_VISIBILITY[segmentKey];
    const raw = source[segmentKey] && typeof source[segmentKey] === "object" ? source[segmentKey] : {};
    const showThreshold = clamp(0, Number(raw.show_threshold) || 0, 5000);
    const hideThreshold = clamp(0, Number(raw.hide_threshold) || 0, 5000);

    normalized[segmentKey] = {
      show_threshold: showThreshold,
      hide_threshold: Math.min(hideThreshold, showThreshold),
    };
  }

  return normalized;
}

function cloneVisibilityConfig(visibility) {
  return JSON.parse(JSON.stringify(visibility));
}

function isBatteryDirectionChange(previousState, nextState) {
  return (
    (previousState === "CHARGING" && nextState === "DISCHARGING")
    || (previousState === "DISCHARGING" && nextState === "CHARGING")
  );
}

function pulseBatteryIcon(icon) {
  if (!icon?.animate) {
    return;
  }
  icon.getAnimations().forEach((animation) => animation.cancel());
  icon.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.08)", opacity: 0.9, offset: 0.45 },
      { transform: "scale(1)", opacity: 1 },
    ],
    {
      duration: ICON_PULSE_DURATION_MS,
      easing: COLOR_FADE_EASING,
      fill: "none",
    },
  );
}

function setSegmentBackground(segment, nextBackground) {
  const currentLayer = segment?.backgroundCurrent;
  const fadeLayer = segment?.backgroundFade;
  if (!currentLayer || !fadeLayer) {
    if (segment?.main) {
      segment.main.style.background = nextBackground;
    }
    return;
  }

  const previousBackground = currentLayer.style.background;
  if (previousBackground === nextBackground) {
    return;
  }

  if (!previousBackground) {
    currentLayer.style.background = nextBackground;
    fadeLayer.style.opacity = "0";
    fadeLayer.style.background = "";
    return;
  }

  fadeLayer.getAnimations().forEach((animation) => animation.cancel());
  fadeLayer.style.background = previousBackground;
  fadeLayer.style.opacity = "1";
  currentLayer.style.background = nextBackground;
  fadeLayer.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    {
      duration: COLOR_FADE_DURATION_MS,
      easing: COLOR_FADE_EASING,
      fill: "forwards",
    },
  );
}

function setSegmentVisibility(node, visible, timers) {
  if (!node) {
    return;
  }

  clearSegmentHideTimer(node.dataset.segment, timers);
  if (visible) {
    const needsEnter = node.style.display === "none";
    node.style.display = "";
    node.classList.remove("segment-hidden");
    node.setAttribute("aria-hidden", "false");

    if (needsEnter) {
      node.classList.add("segment-entering");
      requestAnimationFrame(() => {
        node.classList.remove("segment-entering");
      });
    }
    return;
  }

  node.classList.add("segment-hidden");
  node.setAttribute("aria-hidden", "true");
  const segmentKey = node.dataset.segment;
  timers[segmentKey] = window.setTimeout(() => {
    if (node.classList.contains("segment-hidden")) {
      node.style.display = "none";
    }
    delete timers[segmentKey];
  }, VISIBILITY_TRANSITION_MS);
}

function clearSegmentHideTimer(segmentKey, timers) {
  const timer = timers?.[segmentKey];
  if (!timer) {
    return;
  }
  window.clearTimeout(timer);
  delete timers[segmentKey];
}

function formatEntityStateValue(rawValue, unit, decimals) {
  const text = String(rawValue ?? "").trim();
  const lowered = text.toLowerCase();
  if (!text || lowered === "unknown" || lowered === "unavailable" || lowered === "none") {
    return "--";
  }

  const n = Number(text);
  if (Number.isFinite(n)) {
    const precision = clamp(0, Number(decimals) || 0, 2);
    const valueText = precision === 0 ? `${Math.round(n)}` : n.toFixed(precision);
    return unit ? `${valueText} ${unit}` : valueText;
  }

  return unit ? `${text} ${unit}` : text;
}

function isEntityId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAnyEntityMapping(entities) {
  if (!entities || typeof entities !== "object") {
    return false;
  }
  return Object.values(entities).some((value) => isEntityId(value));
}

function hasEditorRequiredEntities(entities) {
  if (!entities || typeof entities !== "object") {
    return false;
  }
  const hasCore = isEntityId(entities.pv)
    && isEntityId(entities.home_consumption)
    && isEntityId(entities.grid_import)
    && isEntityId(entities.grid_export);
  if (!hasCore) {
    return false;
  }
  const hasBatteryOutput = isEntityId(entities.battery_output);
  const hasBatterySplit = isEntityId(entities.battery_charge) && isEntityId(entities.battery_discharge);
  return hasBatteryOutput || hasBatterySplit;
}

function formatBlockValue(block, decimals) {
  const watts = formatWatts(block.value_w, decimals);
  const suffix = typeof block?.suffix === "string" && block.suffix.length > 0
    ? ` ${block.suffix}`
    : "";
  return `${watts} W${suffix}`;
}

function formatWatts(value, decimals) {
  const n = Math.max(0, Number(value) || 0);
  const precision = clamp(0, Number(decimals) || 0, 2);
  if (precision === 0) {
    return `${Math.round(n)}`;
  }

  return n.toFixed(precision);
}

function buildSmoothSegmentGradient(centerColor, prevColor, nextColor) {
  const leftBoundary = prevColor ? mixHex(prevColor, centerColor, 0.5) : centerColor;
  const rightBoundary = nextColor ? mixHex(centerColor, nextColor, 0.5) : centerColor;
  return `linear-gradient(90deg, ${leftBoundary} 0%, ${centerColor} 30%, ${centerColor} 70%, ${rightBoundary} 100%)`;
}

function blendHex(baseHex, accentHex, blendAmount) {
  const base = parseHex(baseHex);
  const accent = parseHex(accentHex);

  const blend = clamp(0, blendAmount, 1);
  const keep = 1 - blend;

  const r = Math.round((base.r * blend) + (accent.r * keep));
  const g = Math.round((base.g * blend) + (accent.g * keep));
  const b = Math.round((base.b * blend) + (accent.b * keep));

  return toHex({ r, g, b });
}

function parseHex(hex) {
  const cleaned = String(hex || "").trim();
  const value = /^#[0-9A-Fa-f]{6}$/.test(cleaned) ? cleaned.slice(1) : "000000";

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function toHex(rgb) {
  const r = clamp(0, Math.round(rgb.r), 255).toString(16).padStart(2, "0");
  const g = clamp(0, Math.round(rgb.g), 255).toString(16).padStart(2, "0");
  const b = clamp(0, Math.round(rgb.b), 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function mixHex(aHex, bHex, ratio) {
  const a = parseHex(aHex);
  const b = parseHex(bHex);
  const t = clamp(0, Number(ratio) || 0, 1);
  return toHex({
    r: (a.r * (1 - t)) + (b.r * t),
    g: (a.g * (1 - t)) + (b.g * t),
    b: (a.b * (1 - t)) + (b.b * t),
  });
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function clamp(min, value, max) {
  return Math.max(min, Math.min(max, value));
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function toNumberLoose(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const text = String(raw).trim().toLowerCase();
  if (!text || text === "unknown" || text === "unavailable" || text === "none") {
    return null;
  }

  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const commaNormalized = Number(text.replace(",", "."));
  return Number.isFinite(commaNormalized) ? commaNormalized : null;
}

function createValueTweenState() {
  return {
    pv: createValueTweenEntry(),
    battery: createValueTweenEntry(),
    battery_output: createValueTweenEntry(),
    home: createValueTweenEntry(),
    grid: createValueTweenEntry(),
  };
}

function createSegmentVisibilityState() {
  return {
    pv: { visible: false },
    battery: { visible: false },
    battery_output: { visible: false },
    home: { visible: true },
    grid: { visible: false },
  };
}

function createValueTweenEntry() {
  return {
    from: 0,
    display: 0,
    target: 0,
    suffix: "",
    start: 0,
    duration: 180,
    active: false,
  };
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function easeOutCubic(t) {
  const i = 1 - t;
  return 1 - (i * i * i);
}

function toFr(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return "0";
  }
  return n.toFixed(6);
}

function emitConfigChanged(target, config) {
  target.dispatchEvent(new CustomEvent("config-changed", {
    detail: { config },
    bubbles: true,
    composed: true,
  }));
}

function syncSegmentVisibilityState(state, visibleKeys) {
  const visibleSet = new Set(visibleKeys || []);
  for (const key of SEGMENT_ORDER) {
    if (!state[key]) {
      state[key] = { visible: false };
    }
    state[key].visible = visibleSet.has(key);
  }
}

function clearSegmentHideTimers(timers) {
  for (const [key, timer] of Object.entries(timers || {})) {
    window.clearTimeout(timer);
    delete timers[key];
  }
}

function normalizeIcons(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized = {};
  for (const [key, icon] of Object.entries(value)) {
    if (typeof icon === "string" && icon.trim().length > 0) {
      normalized[key] = icon.trim();
    }
  }
  return normalized;
}

function styles() {
  return `
    <style>
      :host {
        --hem-bar-height: 56px;
        --hem-radius: 28px;
        --hem-gap: 0px;
        --hem-card-bg: #f4f4f4;
        --hem-track: #eaecef;
        --hem-text: #2e2e2e;
      }

      ha-card {
        background: var(--hem-card-bg);
        box-shadow: none !important;
        border: 0 !important;
      }

      .shell {
        padding: 0;
      }

      .row {
        position: relative;
        width: 100%;
        height: var(--hem-bar-height);
        border-radius: var(--hem-radius);
        background: var(--hem-track);
        box-shadow: none !important;
        border: 0 !important;
        overflow: hidden;
      }

      .segments {
        position: absolute;
        inset: 0;
        display: flex;
        gap: var(--hem-gap);
        z-index: 1;
      }

      .segments .segment {
        flex: 1 1 0%;
        min-width: 0;
      }

      .main .segment {
        position: relative;
        min-width: 0;
        border-radius: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        color: var(--hem-text);
        font-size: 12px;
        font-weight: 400;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
        opacity: 1;
        transition: opacity ${VISIBILITY_TRANSITION_MS}ms ${COLOR_FADE_EASING};
      }

      .main .segment.segment-entering,
      .main .segment.segment-hidden {
        opacity: 0;
      }

      .main .segment .segment-bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .main .segment .segment-bg--current {
        z-index: 0;
      }

      .main .segment .segment-bg--fade {
        z-index: 1;
        opacity: 0;
      }

      .main .segment .primary {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: var(--hem-bar-height);
        width: 100%;
        flex: 0 0 auto;
        transition: transform ${VISIBILITY_TRANSITION_MS}ms ${COLOR_FADE_EASING}, opacity ${VISIBILITY_TRANSITION_MS}ms ${COLOR_FADE_EASING};
      }

      .main .segment.segment-entering .primary,
      .main .segment.segment-hidden .primary {
        transform: translateY(2px) scale(0.985);
        opacity: 0.94;
      }

      .main .segment .icon-wrap {
        padding: 0;
        margin: 0;
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .main .segment .value-button {
        padding: 0;
        margin: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font-size: 12px;
        font-weight: 400;
        font-family: inherit;
        line-height: 1;
        cursor: default;
      }

      .main .segment .icon-wrap ha-icon {
        --mdc-icon-size: 20px;
        flex: 0 0 auto;
        pointer-events: none;
      }

      .main .segment .value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

    </style>
  `;
}

function registerCustomCardMetadata(type, name, description) {
  window.customCards = window.customCards || [];
  if (window.customCards.some((item) => item.type === type)) {
    return;
  }
  window.customCards.push({
    type,
    name,
    description,
    preview: true,
  });
}

function registerCard() {
  if (!customElements.get(CARD_ELEMENT_TAG)) {
    customElements.define(CARD_ELEMENT_TAG, PowerFlowBarCard);
  }

  registerCustomCardMetadata(
    CARD_ELEMENT_TAG,
    CARD_NAME,
    "PowerFlow Bar: segmented PV/Battery/Battery Output/Home/Grid power bar for Home Assistant.",
  );
}

/* src/index.js */
registerCard();
