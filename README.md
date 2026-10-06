# Verzik Room Simulator (JavaScript)

A tick-based Monte Carlo sim of the Verzik room for 2, 3, 4 and 5-man teams. Fill in the chart template (`verzik_chart_template.xlsx`) or build the chart right on the page, and the sim plays the room thousands of times. It gives you success rates, splits, an odds table and room-time charts, and the **Optimizer** searches for the setups that most often beat your target times.

**Video walkthrough:** https://www.youtube.com/watch?v=7B0WqIqGeqs

What's changed between versions is in [CHANGELOG.md](CHANGELOG.md) (and under **What's new** on the page).

This is a straight port of the Python version. It has no dependencies (no `npm install` needed) and gives the same results within noise. There are two ways to use it:

- **In the browser.** `index.html` is the full app. It runs on all your CPU cores using Web Workers.
- **From a terminal.** `cli/run.mjs` runs on Node and writes an HTML report.

---

## 1. Running it locally in VS Code

### One-time setup
1. Install **Node.js 18 or newer** from https://nodejs.org (the LTS version is fine). Check it in a terminal with `node -v`.
2. Install **VS Code** from https://code.visualstudio.com.
3. Unzip this folder somewhere. In VS Code, go to **File → Open Folder…** and pick the `verzik_js` folder.
4. Optional: from the Extensions sidebar, install **Live Server** (by Ritwick Dey).

### Option A: the browser app (recommended)
The app has to be served over `http://`. Double-clicking `index.html` opens it as `file://`, and browsers block the background workers there, so it won't work. Use any one of these:

- **Live Server:** right-click `index.html` and choose **Open with Live Server**. Your browser opens at `http://127.0.0.1:5500`.
- **Terminal** (**Terminal → New Terminal** in VS Code), with either of these commands:
  ```
  npx serve .
  ```
  or, if you have Python:
  ```
  python -m http.server 8000
  ```
  Then open the address it prints, e.g. http://localhost:3000 or http://localhost:8000.

On the page:
1. Either **Import chart (.xlsx)** and pick your filled chart, or switch to **Build chart on this page** and fill in the tables (see below).
2. Pick the **Scale**.
3. Set **Raids per set** (20,000 is a good default).
4. Optionally set a **Seed**. With the same seed you get the same results again.
5. Optionally name **Set A** and **Set B**. If the tab has a filled second block, it runs both and compares them.
6. Press **Run**. When it finishes, **Download report** saves a standalone HTML copy of the results.

### Building a chart on the page
**Build chart on this page** shows the template's inputs for the selected scale: setup, team settings, gear, mage gear and the P1 tick chart, with Set A and Set B.
- The **Spec planner** shows the same End spec / Room Time / LB swings / Time of regen numbers as the spreadsheet (P1 ends on the Death tick if you set one, otherwise on the last charted tick - the spreadsheet's P1 kill-odds estimate isn't included).
- Each P1 chart row gets a ✓ or ✗ check (attack speeds, X only on Verzik auto ticks, H needs a has3Tick weapon). Hover the ✗ to see why.
- Everything is saved in your browser automatically (per computer and browser). **Save to file** / **Open file** move a chart between computers or share it.
- After importing an .xlsx, **Edit this chart on the page** copies it into the builder.

### Optimizer
The **Optimizer** tab tests combinations of chart inputs and ranks them:
1. Pick the **Set**, type your **Breakpoints** (any number of times, e.g. `5:21, 5:12, 5:00`) and what to **Rank by**.
2. Tick each input to vary and list the values to try - ring swap % per player, death charges, deep proc %, melee prayer, gear pieces, mage cape / armour, shadow modes, 3:1 and the other toggles your chart has.
3. Check the estimated run time (shown before you start) and untick options if it's too long. **Search depth** trades time for precision.
4. **Start search.** Every setup plays the same raids; weak setups are dropped after a quick screen, and the finalists are re-run on fresh raids so the winner isn't a lucky one. **Full report vs your chart** runs the normal report for any result.

Rates count all attempts, including failed ones. Only inputs that exist on the chart can be varied - new behaviours need a sim update.

### Multithreading
Report runs are split into chunks of 2,000 raids that run in parallel Web Workers (`pool.js`). Everything still runs in your browser - nothing is sent anywhere.
- **Threads:** logical cores minus one (left for the browser), at most 12; 1-2 core machines use all of them. The Run tab's status line shows the thread count and raids/second when a run finishes.
- **Same seed = same result** on any computer and any thread count: chunk *k* of a run always uses the random stream seeded by (seed, *k*), and chunks are merged in order.
- Runs under 4,000 raids, or browsers without Web Workers, run on the main thread (same chunks, same results).
- **Stop** cancels a running report. Workers are reused between runs.
- Add `?threads=N` to the page address to force a thread count, e.g. `.../verzikSim.JS/?threads=1` (single thread) or `?threads=4`. This also applies to the Optimizer.

**Checking it:** `node tests/parity.mjs my_chart.xlsx --team 2 --runs 20000` shows (1) that 1, 2 and N threads give identical results, (2) that the results match the old single-stream method within noise, and (3) the speed-up on your computer.

**Benchmarking in the browser:** run the same chart and raid count with `?threads=1` and then with no `?threads` (or `?threads=4`), and compare the raids/second in the status line. Use 20,000+ raids so worker start-up doesn't dominate. With the same Seed, the two reports are identical.

### Option B: the terminal
From the VS Code terminal, in the `verzik_js` folder:
```
node cli/run.mjs my_chart.xlsx --team 2
node cli/run.mjs my_chart.xlsx --team 2 --runs 50000 --seed 1 --labels "Booma P1" "Horn P1"
node cli/run.mjs my_chart.xlsx --team 4 --out four_man.html
node cli/run.mjs my_chart.xlsx --all
```
`--all` runs every filled tab. Each run writes `verzik_<N>man_report.html` (or the name you pass to `--out`) and prints the success rates. Open the HTML file in any browser.

Speed is roughly 20,000 duo raids per set in about 30–60 seconds, depending on how many CPU cores you have.

### If something goes wrong
- **"set East Boak / West Boak"**, or a similar message naming a player: the chart is missing a required input on that tab. Fix the cell named in the message and load the file again.
- **"no filled P1 chart"**: that scale's tab is empty. Pick the scale you actually filled in.
- **The page loads but Run does nothing:** you probably opened it as `file://`. Serve it as described in Option A.
- **The browser shows an old version after you edit the code:** hard-refresh with Ctrl+Shift+R (Cmd+Shift+R on Mac).

---

## 2. Hosting it as a static web page (free)

The app is plain HTML, CSS and JS, with no server, build step or database. Charts are read and simulated entirely in each visitor's own browser. Nothing gets uploaded, and the CPU work happens on the visitor's machine. Any static host works, and the free tiers are plenty because you're only serving roughly 200 KB of files.

Upload the **whole `verzik_js` folder**, including `engine/`, `worker.js`, `app.js`, `index.html` and the template. The `cli/` folder is harmless to include.

### GitHub Pages
1. Create a repository on github.com, e.g. `verzik-sim`.
2. Push the folder contents to the root of the repo. From the VS Code terminal:
   ```
   git init
   git add .
   git commit -m "Verzik sim"
   git branch -M main
   git remote add origin https://github.com/<you>/verzik-sim.git
   git push -u origin main
   ```
   Or use VS Code's **Source Control** panel and choose **Publish to GitHub**.
3. On GitHub, open the repo and go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**, then click **Save**.
4. After a minute or two the site is live at `https://<you>.github.io/verzik-sim/`.
5. To update it, push again. The site redeploys on its own.

The repo has to be **public** for GitHub Pages on a free account.

### Netlify (drag and drop, no git needed)
1. Sign up at https://app.netlify.com.
2. Go to **Add new site → Deploy manually**, and drag the `verzik_js` folder onto the page.
3. You get a URL like `https://something.netlify.app`. You can rename it under **Site configuration → Change site name**.
4. To update, drag the folder in again from the **Deploys** tab.

### Cloudflare Pages
1. Sign up at https://dash.cloudflare.com and go to **Workers & Pages → Create → Pages**.
2. Either **Upload assets** and drag the folder in, or **Connect to Git** and pick your GitHub repo. With Git, leave the build command empty and set the output directory to `/`.
3. The site is live at `https://<project>.pages.dev`.

### Costs
All three are free for a site like this. There's no server-side compute, because the sim runs in the browser. The only optional cost is a custom domain (around $10–15 a year from any registrar) if you want something nicer than the free subdomain.

---

## Files

| Path | What it is |
|---|---|
| `index.html`, `app.js` | The browser app (chart source, tabs, running the workers, drawing the report) |
| `builder-ui.js` | "Build chart on this page" form |
| `optimizer-ui.js` | Optimizer tab |
| `mechanics-ui.js` | "View mechanics & behavior" panel (reads the template's sheet) |
| `pool.js` | Worker pool for report runs: reusable workers, chunk queue, progress, Stop, single-thread fallback |
| `worker.js` | Web Worker: runs chunks of raids (report runs) and optimizer batches |
| `tests/parity.mjs` | Multithreading checks: identical results across thread counts, match vs the old method, speed |
| `cli/run.mjs`, `cli/worker.mjs` | Command-line runner (Node worker threads) |
| `engine/` | The simulator: chart reader (`xlsx.js`, `sim.js`), phases (`p2.js`, `reds.js`, `duo_reds.js`, `p3.js`), supplies, gear, horn, RNG, report, optimizer search (`optimize.js`), parallel chunk plan + merge (`parallel.js`), chart form (`chartform.js`), spec planner (`planner.js`) and version / What's new (`version.js`) |
| `CHANGELOG.md` | What changed in each version |
| `verzik_chart_template.xlsx` | Blank input chart. The **Mechanics & behavior** sheet in it explains what the sim models. |
| `CONVENTIONS.md` | Notes for anyone editing the engine (porting rules, function signatures) |

The engine matches the Python version rule for rule. If you change behaviour in one, change it in the other.
