# PowerFlow Bar

## Screenshots

Placeholder paths for future screenshots:

![PowerFlow Bar Overview](docs/images/powerflow-bar-overview.png)
![PowerFlow Bar Editor](docs/images/powerflow-bar-editor.png)

PowerFlow Bar is a custom Home Assistant Lovelace card that shows live power flow in a single animated segmented bar.

## Features

- Single-row segmented layout: `PV | Battery | Battery Output | Home | Grid`
- Dynamic visibility: inactive PV/Battery/Battery Output/Grid segments hide at `0 W`
- Grid direction awareness: import/export state with dedicated icons and colors
- Smooth spring animation for width transitions
- Value tweening to reduce flicker
- Click on segment value to open Home Assistant `more-info`
- Optional home suffix via `entities.home_coverage` (for example `230 W (72 %)`)
- Configurable colors (`palette.*`)
- Optional transparent card background (`background_transparent`)
- Configurable icons (`icons.*`)
- Decimal precision control (`value_decimals` from `0` to `2`)

## Installation

### HACS (Recommended)

- Add this repository via the link in Home Assistant.

[![Open your Home Assistant instance and open this repository inside HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=uwebaierl&repository=powerflow_bar&category=plugin)

- **PowerFlow Bar** should now be available in HACS. Click `INSTALL`.
- The Lovelace resource is usually added automatically.
- Reload the Home Assistant frontend if prompted.

### HACS (manual)

1. Ensure HACS is installed.
2. Open HACS and add `https://github.com/uwebaierl/powerflow_bar` as a custom repository.
3. Select category `Dashboard`.
4. Search for **PowerFlow Bar** and install it.
5. Reload resources if prompted.

If HACS does not add the resource automatically, add this Dashboard resource manually:

```yaml
url: /hacsfiles/powerflow_bar/powerflow_bar.js
type: module
```

### Manual Installation

1. Download `powerflow_bar.js` from the [Releases](../../releases) page.
2. Upload it to `www/community/powerflow_bar/` in your Home Assistant config directory.
3. Add this resource in Dashboard configuration:

```yaml
url: /local/community/powerflow_bar/powerflow_bar.js
type: module
```

## Publish Checklist (GitHub + HACS)

- Keep `dist/powerflow_bar.js` committed in the repository.
- Ensure `hacs.json` exists in repository root.
- Bump version in `package.json` for each release.
- Create a GitHub release tag (for example `v0.1.0`).
- Pushing a `v*` tag triggers GitHub Actions to build and attach `dist/powerflow_bar.js` to the release.
- In Home Assistant HACS custom repositories, add this repo as category `Dashboard`.

## Project Files

- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- License: [`LICENSE`](./LICENSE)

## Card YAML

### Minimal example

```yaml
type: custom:powerflow-bar
entities:
  pv: sensor.pv_w
  battery_charge: sensor.battery_charge_w
  battery_discharge: sensor.battery_discharge_w
  battery_output: sensor.battery_output_w
  home_consumption: sensor.home_consumption_w
  grid_import: sensor.grid_import_w
  grid_export: sensor.grid_export_w
```

### Full example

```yaml
type: custom:powerflow-bar
bar_height: 56
corner_radius: 28
row_gap: 0
track_blend: 0.20
spring_stiffness: 100
spring_damping: 22
value_tween_ms: 180
value_decimals: 0
background_transparent: false
palette:
  pv: "#E6C86E"
  battery_charge: "#4CAF8E"
  battery_discharge: "#2E8B75"
  battery_output: "#5B9BCF"
  home_consumption: "#9FA8B2"
  grid_import: "#C99A6A"
  grid_export: "#8C6BB3"
  background: "#F4F4F4"
  track: "#EAECEF"
  text: "#2E2E2E"
icons:
  pv: mdi:white-balance-sunny
  battery_charge: mdi:battery-plus-variant
  battery_discharge: mdi:battery-minus-variant
  battery_output: mdi:power-socket-de
  home_consumption: mdi:home
  grid_import: mdi:transmission-tower-import
  grid_export: mdi:transmission-tower-export
entities:
  pv: sensor.pv_w
  battery_charge: sensor.battery_charge_w
  battery_discharge: sensor.battery_discharge_w
  battery_output: sensor.battery_output_w
  home_consumption: sensor.home_consumption_w
  grid_import: sensor.grid_import_w
  grid_export: sensor.grid_export_w
  home_coverage: sensor.home_coverage_percent
```

## Configuration options

### Top-level options

| Option             | Type    | Default  | Notes                          |
| ------------------ | ------- | -------- | ------------------------------ |
| `type`             | string  | required | Must be `custom:powerflow-bar` |
| `bar_height`       | number  | `56`     | Range: `24..72`                |
| `corner_radius`    | number  | `28`     | Range: `0..30`                 |
| `row_gap`          | number  | `0`      | Range: `0..4`                  |
| `track_blend`      | number  | `0.20`   | Range: `0.15..0.30`            |
| `spring_stiffness` | number  | `230`    | Range: `80..420`               |
| `spring_damping`   | number  | `22`     | Range: `10..60`                |
| `value_tween_ms`   | number  | `180`    | Range: `150..250`              |
| `value_decimals`   | integer | `0`      | Range: `0..2`                  |
| `background_transparent` | boolean | `false` | If `true`, card background is transparent |
| `palette`          | object  | optional | Segment and card colors        |
| `icons`            | object  | optional | Icon overrides                 |
| `entities`         | object  | required | Sensor mapping                 |

### Required entities

| Entity key                  | Required |
| --------------------------- | -------- |
| `entities.pv`               | yes      |
| `entities.home_consumption` | yes      |
| `entities.grid_import`      | yes      |
| `entities.grid_export`      | yes      |

Battery/system requirement:

- Provide `entities.battery_output`
- Or provide both `entities.battery_charge` and `entities.battery_discharge`

### Optional entities

| Entity key                   | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `entities.home_coverage`     | Optional suffix shown after home value if `> 0` |
| `entities.battery_charge`    | Battery charging power                          |
| `entities.battery_discharge` | Battery discharging power                       |

### Palette keys

`pv`, `battery_charge`, `battery_discharge`, `battery_output`, `home_consumption`, `grid_import`, `grid_export`, `background`, `track`, `text`

### Icon keys

`pv`, `battery_charge`, `battery_discharge`, `battery_output`, `home_consumption`, `grid_import`, `grid_export`

## Notes

- Use instantaneous power sensors in `W`.
- Energy units (`Wh`, `kWh`, `MWh`, `GWh`) are rejected.
- Import and export are treated as mutually exclusive.
