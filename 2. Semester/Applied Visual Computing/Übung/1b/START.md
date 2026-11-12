# Assignment 1b — how to run it, and how it works

The page is `assignment1b.html`. There is no compile step. The browser runs the JavaScript in that file. D3 itself is not in the folder: the page loads it from `https://d3js.org/d3.v7.min.js`, so the first open needs internet.

Upload `assignment1b.html` to Stud.IP. This file is only for you. Deadline on the sheet is 13 Nov 2026, 13:00. The PDF is named Assignment 1b; the heading inside says “Assignment 1a – Datasets”. Same task.

---

## Open the page

From this folder the server is already the reliable way, because some browsers refuse to run scripts on a file you double-clicked.

```bash
cd "/Users/erickzeiler/Desktop/Master/2. Semester/Applied Visual Computing/Übung/1b"
python3 -m http.server 8765 --bind 127.0.0.1
```

Leave that terminal open and go to:

http://127.0.0.1:8765/assignment1b.html

Stop the server with Ctrl+C.

You should see the four formulas, a blue scatter plot, then a red horizontal bar chart. Hover a dot or a bar. The browser shows a small tooltip with the country and the numbers. That tooltip is a `<title>` inside the SVG shape, not a separate widget.

Double-click also works on most machines:

```bash
open assignment1b.html
```

If the headings show up but both charts are blank, the script was blocked. Use the server command above.

---

## What the page is made of

One HTML file, three parts:

1. **Text.** The formulas and the short captions. Normal HTML.
2. **One JavaScript array** called `data`. 50 objects, each `{country, ghg, gdp}`. The charts do not read `gdp.csv` or `ghg.csv` at runtime. Those files were used once to build this array, then the numbers were pasted in. That way the page does not need `d3.csv()`, which fails on `file://` because the browser blocks local fetches.
3. **Two drawings.** D3 selects an empty `<div>`, appends an `<svg>`, and draws axes and shapes into it. `#scatter` gets circles. `#bars` gets rectangles.

D3 does not ship a “scatter chart” function. You get scales, axes, and a way to bind an array to SVG elements. The chart is those three things put together.

---

## Task 1 — the grid

`nx`, `ny`, `nz` are how many **points** lie along each axis. They are not the number of boxes. Two points in a row make one segment. That “minus one” is the whole exercise.

Picture a single cube. It has points on the corners only, so `nx = ny = nz = 2`.

### Points

Every index triple `(i, j, k)` exists.

```
points = nx * ny * nz
```

Cube: `2 * 2 * 2 = 8` corners.

### Lines

A line here means one edge between two neighbouring points.

- Along x, one row of points has `nx - 1` edges. How many such rows are there? One for every y and every z, so `ny * nz`.
- Along y: `nx * nz * (ny - 1)`
- Along z: `nx * ny * (nz - 1)`

```
lines = ny*nz*(nx-1) + nx*nz*(ny-1) + nx*ny*(nz-1)
```

Cube: each direction contributes `2 * 2 * 1 = 4` edges, three directions, `12` edges. A cube has 12 edges. That is the check.

### Faces

A face is the rectangle spanned by one step in two directions. A shared wall between two voxels is still one face, so it is counted once.

Faces whose normal points along x sit on planes of constant x. There are `nx` such planes (a plane through every x-point, including both ends). On each of those planes the squares are a grid of `(ny - 1)` by `(nz - 1)`.

Same for the other two directions:

```
faces = nx*(ny-1)*(nz-1) + ny*(nx-1)*(nz-1) + nz*(nx-1)*(ny-1)
```

Cube: each direction contributes `2 * 1 * 1 = 2` faces, three directions, `6`. A cube has 6 sides.

### Voxels

A voxel is the little box between points. You need a step in x, a step in y, and a step in z, so each axis loses one:

```
voxels = (nx - 1) * (ny - 1) * (nz - 1)
```

Cube: `1 * 1 * 1 = 1`. The cube is the only cell.

### Second check, if he asks for a bigger grid

`nx = ny = nz = 3` means 3 points along each edge, so 2 cells along each edge.

| | calculation | result |
|---|---|---|
| points | 3·3·3 | 27 |
| lines | 3 · (3·3·2) | 54 |
| faces | 3 · (3·2·2) | 36 |
| voxels | 2·2·2 | 8 |

Eight small cubes packed into a 2×2×2 block.

---

## Task 2 — where the 50 rows come from

Two OECD downloads in this folder. The `.xml` and `flows_head.txt` files only describe the dataset. The numbers are in the csv files.

### `ghg.csv`

Greenhouse gas inventories, one row per area, year **2022**.

- Pollutant: greenhouse gases
- Measure: total emissions **excluding LULUCF** (forests and land use are not in the number)
- Unit printed in the file: kilogrammes of CO2-equivalent per person
- The value column that actually has a number is `OBS_VALUE`. The column called “Observation value” is empty. OECD repeats every field as a code and a label, and the number landed on the code side.

`UNIT_MULT` is `3` on every row. In this file format that means “the stored number is in thousands”. Multiply by `10^3` to get kilogrammes per person, then divide by 1000 to get **tonnes** per person. Those two steps cancel, so the tonnes value is the raw `OBS_VALUE` rounded.

Croatia is stored as `6.256085`. That is about **6.26 t** per person. US-sized numbers in this file land around 15–20 t. That is the usual range, so the unit reading is right.

### `gdp.csv`

GDP and consumption per person, current prices, current PPPs, year **2023**. Several transactions are in the file. Only rows whose transaction is `Gross domestic product, per capita` were kept. Consumption rows were ignored.

`UNIT_MULT` is `0`, so `OBS_VALUE` is already US dollars per person. No scaling. Austria is about `$74,591`.

### What was thrown out

OECD, OECD America, OECD Asia Oceania, OECD Europe, and the EU-27 are in the GHG file. They are averages of other rows. Leaving them in would plot a country and the average of countries on the same axes.

A country is drawn only if it has **both** a GHG row and a GDP row. That join leaves **50** countries.

Holy See (about 31 t) and Brunei (about 30 t) are high in `ghg.csv` and have no GDP row in `gdp.csv`, so they are on neither chart. If someone asks why the bar chart does not start with the Vatican: tiny population, odd inventory, and no matching GDP in this download.

The years differ: emissions 2022, GDP 2023. That is what the two files contain. Close, but not the same year.

---

## What you are supposed to see

Both charts use the same 50 countries. Both use **per person** numbers, so a small rich country and a huge poorer country can sit on one axis without the population size dominating.

### Scatter

X is GDP per capita, 2023, PPP dollars. Y is tonnes of CO2-equivalent per person, 2022. One circle is one country.

The cloud rises a bit: richer countries are often higher. It is not a straight line. Points worth knowing:

- **Australia, United States, Canada** — rich and high, about 18–20 t.
- **Kazakhstan** — about 17.8 t with GDP only around $39k. High emissions without being a top-income country.
- **Switzerland, Sweden** — high income, about 4.3–4.7 t. The other direction.
- **India, Morocco, Indonesia** — bottom-left, low income and low per-person emissions.
- **Luxembourg, Singapore** — far right. GDP per person is large because the population is small and a lot of economic activity is booked there. Emissions are high-middle, not the maximum.
- **New Zealand** — about 15 t, GDP not in the top group. This series is all greenhouse gases, not only energy CO2, so agriculture shows up.

This is not “who emits the most in total”. India would look very different on a total-emissions chart. It is also not consumption-based emissions (goods imported from somewhere else). LULUCF is excluded because that is the OECD measure that was downloaded.

### Bars

Same 50, sorted by tonnes per person, first 12:

Australia, United States, Canada, Kazakhstan, New Zealand, Korea, Luxembourg, Iceland, Ireland, Czechia, Estonia, Singapore.

Bars are horizontal so the names fit. The red is only there so the second chart is not the same blue as the first.

---

## How the D3 code runs

Read the `<script>` in `assignment1b.html` from top to bottom. It runs once, when the browser parses the page.

### The array

`const data = [ ... ]` is the table. `d.country`, `d.ghg`, `d.gdp` later are one row of that table. `d` is just the name of the row inside the function D3 calls for each item.

### Scatter: paper size and margins

```javascript
const sw = 820;
const sh = 460;
const sm = {top: 16, right: 16, bottom: 48, left: 58};
const scatter = d3.select("#scatter").append("svg")
  .attr("width", sw).attr("height", sh);
```

`d3.select("#scatter")` finds the empty div. `.append("svg")` creates the drawing surface. `sm` is the margin. Axes and labels need that padding. The plot itself lives in the rectangle from `x = 58` to `x = 820 - 16`, and from `y = 16` to `y = 460 - 48`.

### Scales

A scale is a function from data units to pixels.

```javascript
const x = d3.scaleLinear()
  .domain([0, d3.max(data, d => d.gdp) * 1.04])
  .range([sm.left, sw - sm.right]);
```

Domain is the data. Range is the pixels. `d3.max` finds the largest GDP (Luxembourg). Multiplying by `1.04` leaves a small gap so the rightmost point is not cut off. After this, `x(75253)` returns the pixel for Australia’s GDP. You call the scale like a function.

Y is the same idea, with one trick:

```javascript
const y = d3.scaleLinear()
  .domain([0, d3.max(data, d => d.ghg) * 1.08])
  .range([sh - sm.bottom, sm.top]);
```

The range goes from the **bottom** pixel to the **top** pixel. SVG’s y axis grows downward. If the range were `[top, bottom]`, zero would be at the top and Australia would sit near the bottom. Flipping the range puts large emissions at the top.

### Axes

```javascript
scatter.append("g")
  .attr("transform", "translate(0," + (sh - sm.bottom) + ")")
  .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(",")));
```

`append("g")` is an empty SVG group. `translate` moves that group down to the bottom margin. `d3.axisBottom(x)` draws tick marks using the x scale you already built. `ticks(6)` asks for about six ticks. `d3.format(",")` prints `150,000` instead of `150000`.

The left axis is the same, shifted right by `sm.left`, using `d3.axisLeft(y)`.

The axis titles are ordinary `<text>` elements. The y title has `transform="rotate(-90)"` because SVG does not have vertical text. The `x` of that rotated text is actually how far **down** the page it sits, which is why the code uses a negative value.

### One circle per country

```javascript
scatter.selectAll("circle")
  .data(data)
  .join("circle")
  .attr("cx", d => x(d.gdp))
  .attr("cy", d => y(d.ghg))
  .attr("r", 5)
  .attr("fill", "#2a6f97")
  .append("title")
  .text(d => d.country + ": " + d.ghg + " t, GDP " + d.gdp);
```

Step by step:

1. `selectAll("circle")` looks for circles. There are none yet. That is normal.
2. `.data(data)` binds the 50 rows to that selection.
3. `.join("circle")` creates one `<circle>` for each row that does not already have an element. This is the enter selection. Nothing is updated or removed, because the data never changes after this.
4. `cx` and `cy` place the centre. They call the scales. GDP goes through `x`, emissions go through `y`.
5. `r` is the radius in pixels. `fill` is the blue.
6. `.append("title")` puts a `<title>` inside each circle. The browser turns that into the hover tooltip.

If he asks “what is a scale?”: data value in, pixel out.

If he asks “what is join?”: match an array to SVG elements and create the missing ones. Here the array is static, so join only creates.

### Bars

```javascript
const top = data.slice().sort((a, b) => b.ghg - a.ghg).slice(0, 12);
```

`data.slice()` copies the array first. `sort` would otherwise reorder `data` itself, and the scatter was already drawn from that same array. Sorting a copy is the safe version. `b.ghg - a.ghg` sorts descending. The second `slice(0, 12)` keeps the first 12 of that sorted copy.

```javascript
const yb = d3.scaleBand()
  .domain(top.map(d => d.country))
  .range([bm.top, bh - bm.bottom])
  .padding(0.22);
```

`scaleBand` is the categorical scale. The domain is the 12 names, in the order of `top`, so Australia is the first band. `range` is the vertical pixel span. `padding(0.22)` is the gap between bands, as a fraction of the step. `yb("Australia")` is the top of that bar. `yb.bandwidth()` is how thick the bar is.

The x scale of the bar chart is linear again, from 0 to a bit past the max tonnes. Bar width is:

```javascript
.attr("width", d => xb(d.ghg) - bm.left)
```

`xb(0)` is the pixel of the axis, which is `bm.left`, not pixel 0. Subtracting `bm.left` turns “pixel position of this value” into “how many pixels wide the rectangle is”. `x` of every rect is `bm.left`, so every bar starts on the axis.

The join is the same pattern as the circles, with `rect` instead of `circle`.

---

## What to say if he asks how you got here

1. Downloaded the two OECD tables (`gdp.csv`, `ghg.csv`).
2. Read `OBS_VALUE` and `UNIT_MULT`, not only the header text.
3. Kept GDP per capita, dropped the consumption rows.
4. Dropped OECD and EU aggregates.
5. Kept countries that appear in both files. 50 left.
6. Compared the two per-person series, because they share a unit of “per person”.
7. Drew both charts in D3 with scales and axes.

The page does not claim a causal “GDP causes emissions” result. It shows the joint pattern and the outliers above.
