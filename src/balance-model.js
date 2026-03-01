import { DEFAULT_ICONS } from "./constants.js";

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

export function computeBalanceModel(config, hass) {
  const input = resolveInputWatts(config, hass);
  const blocks = buildBlocks(input, config);
  const baseWidths = computeSegmentWidths(input);
  const order = computeSegmentOrder(input);
  const visible_keys = buildVisibleKeys(blocks);
  const widths = maskWidthsToVisible(baseWidths, visible_keys);

  return {
    input,
    blocks,
    widths,
    order,
    visible_keys,
  };
}

function buildVisibleKeys(blocks) {
  const pvActive = isPositiveBlock(blocks.pv);
  const batteryActive = isPositiveBlock(blocks.battery);
  const batteryOutputActive = isPositiveBlock(blocks.battery_output);
  const gridActive = isPositiveBlock(blocks.grid);

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

function isPositiveBlock(block) {
  return (Number(block?.value_w) || 0) > 0;
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

export function collectRelevantEntities(config) {
  const entities = config?.entities || {};
  return Object.values(entities)
    .filter((entityId) => typeof entityId === "string" && entityId.length > 0);
}

export function computeEntitySignature(hass, entityIds) {
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
