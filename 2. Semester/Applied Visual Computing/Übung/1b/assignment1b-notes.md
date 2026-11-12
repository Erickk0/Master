# Assignment 1b – notes for the tutorial

File to open: `assignment1b.html` (needs internet once, because D3 is loaded from d3js.org). Deadline on the sheet is 13 Nov 2026, 13:00, upload to Stud.IP.

The PDF is named Assignment1b but the heading inside says “Assignment 1a – Datasets”. Same sheet.

---

## Task 1 – 3D structured grid

`nx`, `ny`, `nz` count **points** along each axis. A line of 2 points is 1 cell. That off-by-one is the whole task.

### (a) Grid points

Every combination of indices exists, so

```
points = nx * ny * nz
```

### (b) Grid lines

A grid line here means one edge between two neighbouring points.

- Along x: each row has `(nx - 1)` edges, and there are `ny * nz` such rows.
- Along y: `nx * nz * (ny - 1)`
- Along z: `nx * ny * (nz - 1)`

```
lines = ny*nz*(nx-1) + nx*nz*(ny-1) + nx*ny*(nz-1)
```

### (c) Grid faces

A face is one rectangle between four points. Internal faces are shared by two voxels and counted **once**.

- Faces whose normal points along x: there are `nx` planes, and each plane holds `(ny-1)*(nz-1)` faces.
- Same idea for y and z.

```
faces = nx*(ny-1)*(nz-1) + ny*(nx-1)*(nz-1) + nz*(nx-1)*(ny-1)
```

### (d) Grid voxels

A voxel needs one step in every direction, so each dimension loses one:

```
voxels = (nx-1) * (ny-1) * (nz-1)
```

### Check you can say out loud

One cube is `nx = ny = nz = 2`.

| | formula | result | cube |
|---|---|---|---|
| points | 2·2·2 | 8 | 8 corners |
| lines | 3 · (2·2·1) | 12 | 12 edges |
| faces | 3 · (2·1·1) | 6 | 6 sides |
| voxels | 1·1·1 | 1 | the cube itself |

If someone draws a 3×3×3 point grid: 27 points, 54 edges, 36 faces, 8 voxels (a 2×2×2 block of cells).

---

## Task 2 – where the numbers come from

Two OECD CSV files already in this folder.

**`ghg.csv`** — Air emissions, greenhouse gas inventories.

- Pollutant: greenhouse gases
- Measure: total emissions excluding LULUCF (so land use is not in the number)
- Unit: kilogrammes of CO2-equivalent **per person**
- Year: 2022 only, 86 areas
- Column `OBS_VALUE` is not yet in kg. `UNIT_MULT` is 3, which in SDMX means “thousands”: multiply the observation by `10^3` to get kg per person. Divide by 1000 again and you are in **tonnes per person**. Croatia `6.256` → about 6.26 t. That matches the usual ballpark, so the scaling is right.
- The human-readable value sits in `OBS_VALUE`, not in the empty “Observation value” label column. The file repeats code and label, and the value landed on the code side.

**`gdp.csv`** — Annual GDP and consumption per capita, USD, current prices, current PPPs, year 2023.

- Used only the transaction `Gross domestic product, per capita` (there are also consumption rows; those were ignored).
- `UNIT_MULT` is 0, so `OBS_VALUE` is already US dollars per person. No scaling.

### What was dropped

Rows that are not a country: OECD, OECD America, OECD Asia Oceania, OECD Europe, European Union (27). A scatter of “countries” should not also contain the average of those countries.

Only countries present in **both** files are drawn. That leaves **50**. Holy See (~31 t) and Brunei (~30 t) are high in the GHG file but have no GDP row here, so they are not on either chart. If someone asks why the bar chart does not start with the Vatican: small population, odd inventory, and no matching GDP.

The years are not the same (emissions 2022, GDP 2023). That is what the downloads contain. One year apart is close enough for this plot, but it is not the same snapshot.

---

## What the charts are supposed to show

### Scatter (2a)

X = GDP per capita 2023, PPP dollars. Y = tonnes CO2e per person 2022.

The loose pattern: richer countries tend to sit higher, but it is not a line.

Things worth pointing at:

- **Australia, United States, Canada** are rich and high (about 18–20 t).
- **Kazakhstan** is the counterexample on the high side: ~17.8 t with GDP only ~39k. Coal and industry, not “rich country” emissions.
- **Switzerland and Sweden** are the other way round: high income, about 4.3–4.7 t.
- **India, Morocco, Indonesia** sit in the bottom-left.
- **Luxembourg and Singapore** are far to the right because GDP per capita is inflated by a small population and cross-border activity. Their emissions are high-middle, not record highs.
- **New Zealand** is high per person (~15 t) without being in the top GDP group. Agriculture matters there; this series is total GHG, not only CO2 from energy.

So the chart is “per person emissions vs income”, not “who pollutes the most in total”. China and India look small per person and would look huge in a total-emissions bar.

### Bar chart (2b)

Same 50 countries, sorted by emissions per person, first 12:

Australia, United States, Canada, Kazakhstan, New Zealand, Korea, Luxembourg, Iceland, Ireland, Czechia, Estonia, Singapore.

Horizontal bars so the names stay readable. Red is just so it does not look like the scatter. Hover shows the exact tonnes.

---

## How the D3 code works

D3 is loaded from `https://d3js.org/d3.v7.min.js`. The 50 rows are pasted into the page as a JS array (`country`, `ghg`, `gdp`) so the file opens by double-click. `d3.csv` would need a local server because the browser blocks `file://` fetches.

### Scatter

1. `d3.select("#scatter").append("svg")` creates the drawing area, 820×460.
2. Margins (`sm`) keep the axes from sitting on the border. The plot region is inside them.
3. `d3.scaleLinear` maps data to pixels.
   - x domain starts at 0 and goes a bit past the max GDP (`* 1.04`), so Luxembourg is not glued to the right edge.
   - y domain is 0 to a bit past the max tonnes.
   - y range is `[bottom, top]`, **flipped**, because SVG y grows downward and we want large values at the top.
4. `d3.axisBottom(x)` and `d3.axisLeft(y)` draw ticks. `d3.format(",")` puts thousands separators on the GDP axis.
5. Two `text` elements are the axis titles. The y title is rotated −90°.
6. The actual plot is the join:

```javascript
scatter.selectAll("circle")
  .data(data)
  .join("circle")
  .attr("cx", d => x(d.gdp))
  .attr("cy", d => y(d.ghg))
  .attr("r", 5)
```

`selectAll` + `data` + `join` is the D3 pattern: one circle per row. `cx`/`cy` run the scales. A `<title>` inside the circle is the browser tooltip (country, tonnes, GDP). No extra tooltip div.

### Bars

1. `data.slice().sort(...).slice(0, 12)` copies the array, sorts by `ghg` descending, keeps 12. `slice()` first so the scatter data is not reordered.
2. `scaleBand` on country names gives each bar a y slot and a height (`bandwidth()`), with `padding(0.22)` as the gap.
3. `scaleLinear` on tonnes gives the bar width. Width is `xb(value) - leftMargin`, because the scale’s zero is at the axis, not at pixel 0.
4. Same join, but with `rect` instead of `circle`.

If asked “what is a scale?”: a function from data units to pixels. Linear for numbers, band for categories.

If asked “what is join?”: bind an array to SVG elements and create one element per item. With a static array, enter is the whole set; there is no update or exit because the data never changes.

---

## If he asks about the process

1. Downloaded two OECD tables (the csv files in this folder). The xml/txt files next to them are the dataflow structure, not the numbers.
2. Read the SDMX columns, not the pretty header only. Found unit multiplier on the GHG file.
3. Kept GDP per capita, dropped consumption.
4. Dropped aggregates, inner-joined on country name.
5. Picked the comparison (income vs emissions per person) because both series are already per person, so the scatter is fair.
6. Drew it in D3 with scales and axes, not a chart library that hides that.

What this chart does **not** say: it is not consumption-based emissions (imported goods), not total national emissions, and LULUCF is excluded by the OECD measure.
