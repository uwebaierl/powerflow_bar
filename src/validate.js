import { CARD_TYPE } from "./constants.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function validateConfig(config) {
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
