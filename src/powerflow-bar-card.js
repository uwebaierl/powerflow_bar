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
const EDITOR_ELEMENT_TAG = "powerflow-bar-editor";
const REORDER_MIN_DELTA_PX = 2;
const REORDER_DURATION_MS = 280;
const REORDER_EASING = "cubic-bezier(0.25, 0.8, 0.25, 1)";

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
    if (!customElements.get(EDITOR_ELEMENT_TAG)) {
      customElements.define(EDITOR_ELEMENT_TAG, PowerFlowBarEditor);
    }
    return document.createElement(EDITOR_ELEMENT_TAG);
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
    this._form = null;
    this._onValueChanged = (event) => this._handleValueChangedEvent(event);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
    }
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    if (this._form) {
      this._form.removeEventListener("value-changed", this._onValueChanged);
    }
  }

  setConfig(config) {
    const incoming = config && typeof config === "object" ? config : {};
    const seeded = seedEditorConfig(incoming);
    this._config = normalizeEditorConfig({
      ...seeded,
      type: incoming.type || CARD_TYPE,
    });
    this._render();
  }

  _render() {
    if (!this.shadowRoot) {
      return;
    }

    if (!this._form) {
      this.shadowRoot.innerHTML = "<ha-form></ha-form>";
      this._form = this.shadowRoot.querySelector("ha-form");
      this._form?.addEventListener("value-changed", this._onValueChanged);
    }

    if (!this._form) {
      return;
    }
    this._form.hass = this._hass;
    this._form.schema = buildConfigFormSchema();
    this._form.data = this._config || normalizeEditorConfig(seedEditorConfig({ type: CARD_TYPE }));
    this._form.computeLabel = (schema) => schema.label || schema.name || "";
  }

  _handleValueChangedEvent(event) {
    event.stopPropagation();
    const value = event?.detail?.value;
    if (!value || typeof value !== "object") {
      return;
    }

    const next = normalizeEditorConfig({
      ...(this._config || {}),
      ...value,
      type: CARD_TYPE,
    });
    this._config = next;

    if (this._form) {
      this._form.data = next;
    }

    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: next },
      bubbles: true,
      composed: true,
    }));
  }
}

function buildConfigFormSchema() {
  const entitySelector = { entity: { domain: ["sensor", "input_number"] } };
  const iconSelector = { icon: {} };
  const colorSelector = { text: {} };

  return [
    {
      type: "expandable",
      title: "Layout & Motion",
      schema: [
        { name: "bar_height", label: "Bar height (px)", required: true, selector: { number: { min: 24, max: 72, step: 1, mode: "slider" } } },
        { name: "corner_radius", label: "Corner radius (px)", required: true, selector: { number: { min: 0, max: 30, step: 1, mode: "slider" } } },
        { name: "row_gap", label: "Gap between visible segments (px)", required: true, selector: { number: { min: 0, max: 4, step: 0.1, mode: "slider" } } },
        { name: "track_blend", label: "Track/segment color blend (0.15-0.30)", required: true, selector: { number: { min: 0.15, max: 0.3, step: 0.01, mode: "slider" } } },
        { name: "spring_stiffness", label: "Width animation stiffness", required: true, selector: { number: { min: 80, max: 420, step: 1, mode: "slider" } } },
        { name: "spring_damping", label: "Width animation damping", required: true, selector: { number: { min: 10, max: 60, step: 1, mode: "slider" } } },
        { name: "value_tween_ms", label: "Value animation duration (ms)", required: true, selector: { number: { min: 150, max: 250, step: 1, mode: "slider" } } },
        { name: "value_decimals", label: "Displayed value decimals", required: true, selector: { number: { min: 0, max: 2, step: 1, mode: "box" } } },
        { name: "background_transparent", label: "Use transparent card background", selector: { boolean: {} } },
      ],
    },
    {
      type: "expandable",
      title: "Palette",
      name: "palette",
      schema: [
        { name: "pv", label: "PV segment color", required: true, selector: colorSelector },
        { name: "battery_charge", label: "Battery charge segment color", required: true, selector: colorSelector },
        { name: "battery_discharge", label: "Battery discharge segment color", required: true, selector: colorSelector },
        { name: "battery_output", label: "Battery output segment color", required: true, selector: colorSelector },
        { name: "home_consumption", label: "Home consumption segment color", required: true, selector: colorSelector },
        { name: "grid_import", label: "Grid import segment color", required: true, selector: colorSelector },
        { name: "grid_export", label: "Grid export segment color", required: true, selector: colorSelector },
        { name: "background", label: "Card background color", required: true, selector: colorSelector },
        { name: "track", label: "Base track color", required: true, selector: colorSelector },
        { name: "text", label: "Text and icon color", required: true, selector: colorSelector },
      ],
    },
    {
      type: "expandable",
      title: "Entities",
      name: "entities",
      schema: [
        { name: "pv", label: "PV power entity", required: true, selector: entitySelector },
        { name: "battery_charge", label: "Battery charge power entity", selector: entitySelector },
        { name: "battery_discharge", label: "Battery discharge power entity", selector: entitySelector },
        { name: "battery_output", label: "Battery output power entity", selector: entitySelector },
        { name: "home_consumption", label: "Home consumption power entity", required: true, selector: entitySelector },
        { name: "grid_import", label: "Grid import power entity", required: true, selector: entitySelector },
        { name: "grid_export", label: "Grid export power entity", required: true, selector: entitySelector },
        { name: "home_coverage", label: "Home coverage entity (optional)", selector: entitySelector },
      ],
    },
    {
      type: "expandable",
      title: "Icons",
      name: "icons",
      schema: [
        { name: "pv", label: "PV icon", selector: iconSelector },
        { name: "battery_charge", label: "Battery charge icon", selector: iconSelector },
        { name: "battery_discharge", label: "Battery discharge icon", selector: iconSelector },
        { name: "battery_output", label: "Battery output icon", selector: iconSelector },
        { name: "home_consumption", label: "Home consumption icon", selector: iconSelector },
        { name: "grid_import", label: "Grid import icon", selector: iconSelector },
        { name: "grid_export", label: "Grid export icon", selector: iconSelector },
      ],
    },
    {
      type: "expandable",
      title: "Hysteresis",
      name: "hysteresis",
      schema: buildHysteresisSchema(),
    },
  ];
}

function buildHysteresisSchema() {
  return [
    {
      type: "expandable",
      title: "PV",
      name: "pv",
      schema: [
        { name: "show_threshold", label: "Show segment above (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
        { name: "hide_threshold", label: "Hide segment at or below (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
      ],
    },
    {
      type: "expandable",
      title: "Battery",
      name: "battery",
      schema: [
        { name: "show_threshold", label: "Show segment above (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
        { name: "hide_threshold", label: "Hide segment at or below (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
      ],
    },
    {
      type: "expandable",
      title: "Battery output",
      name: "battery_output",
      schema: [
        { name: "show_threshold", label: "Show segment above (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
        { name: "hide_threshold", label: "Hide segment at or below (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
      ],
    },
    {
      type: "expandable",
      title: "Grid",
      name: "grid",
      schema: [
        { name: "show_threshold", label: "Show segment above (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
        { name: "hide_threshold", label: "Hide segment at or below (W)", required: true, selector: { number: { min: 0, max: 5000, step: 1, mode: "box" } } },
      ],
    },
  ];
}

function seedEditorConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  if (hasAnyEntityMapping(source.entities)) {
    return source;
  }

  const stub = PowerFlowBarCard.getStubConfig();
  return {
    ...stub,
    ...source,
    entities: {
      ...stub.entities,
      ...(source.entities || {}),
    },
    icons: {
      ...stub.icons,
      ...(source.icons || {}),
    },
    palette: {
      ...stub.palette,
      ...(source.palette || {}),
    },
    hysteresis: {
      ...stub.hysteresis,
      ...(source.hysteresis || {}),
    },
  };
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
    bar_height: numberOr(source.bar_height, DEFAULT_STYLE.bar_height),
    corner_radius: numberOr(source.corner_radius, DEFAULT_STYLE.corner_radius),
    row_gap: numberOr(source.row_gap, DEFAULT_STYLE.row_gap),
    track_blend: numberOr(source.track_blend, DEFAULT_STYLE.track_blend),
    spring_stiffness: numberOr(source.spring_stiffness, DEFAULT_STYLE.spring_stiffness),
    spring_damping: numberOr(source.spring_damping, DEFAULT_STYLE.spring_damping),
    value_tween_ms: numberOr(source.value_tween_ms, DEFAULT_STYLE.value_tween_ms),
    value_decimals: numberOr(source.value_decimals, DEFAULT_STYLE.value_decimals),
    background_transparent: boolOr(source.background_transparent, true),
    entities: { ...(source.entities || {}) },
    icons: {
      ...DEFAULT_ICONS,
      ...normalizeIcons(source.icons),
    },
    palette: {
      ...DEFAULT_PALETTE,
      ...(source.palette || {}),
    },
    hysteresis: normalizeVisibilityConfig(source.hysteresis),
  };
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
