export const CARD_ELEMENT_TAG = "powerflow-bar";
export const CARD_TYPE = "custom:powerflow-bar";
export const CARD_NAME = "PowerFlow Bar";
export const VISIBILITY_SEGMENT_KEYS = ["pv", "battery", "battery_output", "grid"];
export const DEFAULT_ICONS = {
  pv: "mdi:white-balance-sunny",
  battery_charge: "mdi:battery-plus-variant",
  battery_discharge: "mdi:battery-minus-variant",
  battery_output: "mdi:power-socket-de",
  home_consumption: "mdi:home",
  grid_import: "mdi:transmission-tower-import",
  grid_export: "mdi:transmission-tower-export",
};
export const DEFAULT_VISIBILITY = {
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
