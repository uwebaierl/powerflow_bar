import {
  CARD_ELEMENT_TAG,
  CARD_NAME,
  CARD_TYPE,
  DEFAULT_VISIBILITY,
  DEFAULT_ICONS,
  VISIBILITY_SEGMENT_KEYS,
} from "./constants.js";
import { SegmentedBarAnimator } from "./animation.js";
import {
  collectRelevantEntities,
  computeBalanceModel,
  computeEntitySignature,
} from "./balance-model.js";
import { validateConfig } from "./validate.js";

const DEFAULT_STYLE = {
  bar_height: 56,
  corner_radius: 28,
  row_gap: 0,
  track_blend: 0.15,
  spring_stiffness: 230,
  spring_damping: 22,
  value_tween_ms: 180,
  value_decimals: 0,
};

const DEFAULT_PALETTE = {
  background: "#000000",
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
    id: "pv",
    title: "PV",
    visibilityKey: "pv",
    visibilityTitle: "PV segment hysteresis",
    fields: [
      { entityKey: "pv", label: "PV", iconKey: "pv", colorKey: "pv" },
    ],
  },
  {
    id: "battery",
    title: "Battery",
    hint: "Configure Battery Output, or configure both Battery Charge and Battery Discharge.",
    visibilityKey: "battery",
    visibilityTitle: "Battery segment hysteresis",
    fields: [
      { entityKey: "battery_charge", label: "Charge", iconKey: "battery_charge", colorKey: "battery_charge" },
      { entityKey: "battery_discharge", label: "Discharge", iconKey: "battery_discharge", colorKey: "battery_discharge" },
    ],
  },
  {
    id: "battery_output",
    title: "Battery Output",
    hint: "Recommended. Alternative: configure both Battery Charge and Battery Discharge.",
    visibilityKey: "battery_output",
    visibilityTitle: "Battery output segment hysteresis",
    fields: [
      { entityKey: "battery_output", label: "Battery Output", iconKey: "battery_output", colorKey: "battery_output" },
    ],
  },
  {
    id: "home_consumption",
    title: "Home Consumption",
    fields: [
      { entityKey: "home_consumption", label: "Home Consumption", iconKey: "home_consumption", colorKey: "home_consumption" },
    ],
  },
  {
    id: "grid",
    title: "Grid",
    visibilityKey: "grid",
    visibilityTitle: "Grid segment hysteresis",
    fields: [
      { entityKey: "grid_import", label: "Import", iconKey: "grid_import", colorKey: "grid_import" },
      { entityKey: "grid_export", label: "Export", iconKey: "grid_export", colorKey: "grid_export" },
    ],
  },
  {
    id: "home_coverage",
    title: "Home Coverage (optional)",
    fields: [
      { entityKey: "home_coverage", label: "Home Coverage" },
    ],
  },
];
const EDITOR_ENTITY_FIELDS = MAIN_ENTITY_EDITOR_SECTIONS.flatMap((section) => section.fields);

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

export class PowerFlowBarCard extends HTMLElement {
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
      background_transparent: true,
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
      background_transparent: boolOr(incoming.background_transparent, true),
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
      this._collectEditorRefs();
      this._rendered = true;
    }
    this._syncEntityPickerHass();
  }

  _collectEditorRefs() {
    this._entityCards = {};
    this._inlineErrors = {};
    for (const section of MAIN_ENTITY_EDITOR_SECTIONS) {
      this._entityCards[section.id] = this.shadowRoot.querySelector(`[data-entity-card="${section.id}"]`);
      for (const field of section.fields) {
        this._inlineErrors[field.entityKey] = this.shadowRoot.querySelector(`[data-inline-error="${field.entityKey}"]`);
      }
    }
    this._refs.validation = this.shadowRoot.querySelector("#entity-validation");
  }

  _buildEntityPickers() {
    if (!this.shadowRoot) {
      return;
    }
    for (const field of EDITOR_ENTITY_FIELDS) {
      const key = field.entityKey;
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
        setInputValue(
          this.shadowRoot,
          `hysteresis.${segmentKey}.${field.leaf}`,
          cfg.hysteresis?.[segmentKey]?.[field.leaf] ?? DEFAULT_VISIBILITY[segmentKey][field.leaf],
        );
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
      return;
    }
    if (VISIBILITY_FIELD_BY_PATH[target.name]) {
      const field = VISIBILITY_FIELD_BY_PATH[target.name];
      const numeric = parseNumberRange(target.value, 0, field.min, field.max, false);
      target.value = String(numeric);
      this._updateConfigPath(target.name, numeric);
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
      return;
    }
    if (VISIBILITY_FIELD_BY_PATH[target.name]) {
      const field = VISIBILITY_FIELD_BY_PATH[target.name];
      const numeric = parseNumberRange(target.value, 0, field.min, field.max, false);
      this._updateConfigPath(target.name, numeric);
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
      const card = this._entityCards[section.id];
      const hasError = section.fields.some((field) => Boolean(fieldErrors[field.entityKey]));

      if (card) {
        card.classList.toggle("invalid", hasError);
        if (hasError && "open" in card) {
          card.open = true;
        }
      }
      for (const field of section.fields) {
        const inlineError = this._inlineErrors[field.entityKey];
        if (inlineError) {
          inlineError.textContent = fieldErrors[field.entityKey] || "";
        }
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

      .entity-subsection {
        display: grid;
        gap: 8px;
      }

      .entity-subsection + .entity-subsection {
        padding-top: 10px;
        border-top: 1px solid color-mix(in srgb, var(--divider-color, rgba(127, 127, 127, 0.3)) 70%, transparent);
      }

      .entity-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }

      .entity-subtitle {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--primary-text-color, inherit);
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

      .field input[type="number"] {
        min-height: 36px;
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
        border-radius: 8px;
        background: transparent;
        color: var(--primary-text-color, inherit);
        font: inherit;
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
        <p class="section-note">Each rendered segment has its own entity mapping, icon, color, and optional hysteresis settings.</p>
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
  const visibilityFields = section.visibilityKey
    ? buildVisibilityFieldGroup(section.visibilityKey, section.visibilityTitle || "Segment visibility")
    : "";
  const hint = section.hint ? `<p class="entity-hint">${section.hint}</p>` : "";
  return `
    <details class="entity-card" data-entity-card="${section.id}">
      <summary class="entity-summary">
        <h4 class="entity-title">${section.title}</h4>
      </summary>
      <div class="entity-content">
        ${hint}
        ${section.fields.map((field) => buildEntityFieldBlock(field)).join("")}
        ${visibilityFields}
      </div>
    </details>
  `;
}

function buildEntityFieldBlock(field) {
  const iconField = field.iconKey
    ? `
      <div class="field">
        <div class="field-meta">
          <span class="field-label-strong">Icon</span>
        </div>
        <div class="selector-slot" data-icon-slot="${field.iconKey}"></div>
      </div>
    `
    : "";
  const colorField = field.colorKey
    ? buildColorField(`palette.${field.colorKey}`, "Color")
    : "";

  return `
    <div class="entity-subsection">
      <h5 class="entity-subtitle">${field.label}</h5>
      <div class="field">
        <div class="field-meta">
          <span class="field-label-strong">Entity</span>
        </div>
        <div class="entity-picker-slot" data-entity-slot="${field.entityKey}"></div>
      </div>
      ${iconField}
      ${colorField}
      <p class="entity-inline-error" data-inline-error="${field.entityKey}"></p>
    </div>
  `;
}

function buildVisibilityFieldGroup(segmentKey, title) {
  return `
    <div class="field">
      <div class="field-meta">
        <span class="field-label-strong">${title}</span>
      </div>
      <div class="selector-grid">
        ${VISIBILITY_THRESHOLD_FIELDS.map((field) => `
          <div class="field">
            <div class="field-meta">
              <span class="field-label">${field.label}</span>
              <p class="field-help">${field.help}</p>
            </div>
            <input
              type="number"
              name="hysteresis.${segmentKey}.${field.leaf}"
              min="${field.min}"
              max="${field.max}"
              step="${field.step}"
            />
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
        --hem-card-bg: #000000;
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

export function registerCard() {
  if (!customElements.get(CARD_ELEMENT_TAG)) {
    customElements.define(CARD_ELEMENT_TAG, PowerFlowBarCard);
  }

  registerCustomCardMetadata(
    CARD_ELEMENT_TAG,
    CARD_NAME,
    "PowerFlow Bar: segmented PV/Battery/Battery Output/Home/Grid power bar for Home Assistant.",
  );
}
