# Python -> JavaScript port conventions (engine/)

The JS engine is a line-by-line port of the Python sim in /home/claude/verzik_sim. Results must match Python
statistically, so port LOGIC EXACTLY - same branches, same order of operations, same constants, same RNG call order.

## Files
- One ES module per Python module: sim.py -> engine/sim.js, p2.py -> engine/p2.js, reds.py -> engine/reds.js,
  duo_reds.py -> engine/duo_reds.js, p3.py -> engine/p3.js, supplies.py -> engine/supplies.js,
  horn.py -> engine/horn.js, gear.py -> engine/gear.js.
- Export EVERY top-level function, class and constant with the SAME NAME as in Python (snake_case kept).
- Use static imports at the top (`import { a, b } from './sim.js'`, `import * as supplies from './supplies.js'`).
  Python's in-function imports become normal top-level imports; circular imports are fine because nothing
  is used at module-evaluation time. `import sim as _sim` -> `import * as _sim from './sim.js'`.
- Do not port `if __name__ == '__main__'` blocks, CLI code, csv writing or report printing.
- No dependencies. Node 18+ and browsers. Already written for you: engine/util.js, engine/rng.js, engine/xlsx.js.

## Object model (keep identical names everywhere)
- Python attributes / dict keys keep their exact names: `p.next_attack`, `p.pool.left['scb']`, `st['below20']`.
- Python dicts -> plain objects. Python sets -> `Set`. Tuples/lists -> arrays.
- Int-keyed dicts (e.g. `p.actions` {tick: code}) stay plain objects: `p.actions[t]` works; when iterating keys use
  `intKeys(d)` from util.js (Object.keys gives strings!). `max(p.actions)` -> `Math.max(...intKeys(p.actions))`.
- Dict used as a tuple-keyed cache -> key with `JSON.stringify([...])`. `@lru_cache` -> a Map memo keyed the same way.
- `getattr(obj, 'x', d)` -> `ga(obj, 'x', d)`; `d.get(k, x)` -> `dget(d, k, x)`; `k in d` -> `has(d, k)`.
  Setting a new attribute just assigns it (`p.foo = 1`).
- `None` -> `null`. Test with `x == null` (covers undefined too). Python truthiness of containers -> `truthy(x)`.
- `a | b` (dict merge) -> `{ ...a, ...b }`. `dict(x)` copy -> `{ ...x }`.
- Module-level globals that a function rebinds (`global CRAB_HP`) -> `let` in that module.
- Mutable config read across modules: sim.js exports `FLAGS = { LB_CAMP: false, PURPLE_EARLY_SWAP: false, ... }`
  and `CAMP = {...}`; supplies.js exports `FLAGS = { DEATHS_ONLY_P1: true }`. Code reads `FLAGS.X` where Python
  read the module global.

## Numbers and builtins (use util.js helpers)
- `a // b` -> `floordiv(a, b)`. `a % b` -> `pymod(a, b)` whenever a or b can be negative (else `%` is fine).
- `round(x)` / `round(x, n)` -> `pyround(x, n)`. `int(x)` -> `Math.trunc(x)`. `math.floor/ceil` -> `Math.floor/ceil`.
- `-(-a // b)` (ceil div) -> `-floordiv(-a, b)`.
- `min(...)`/`max(...)` of numbers -> `Math.min/Math.max`; with `key=` -> `minBy/maxBy`. `sorted(..., key=)` -> `sorted()`.
- `sum`, `any`, `all`, `range` helpers exist. `abs` -> `Math.abs`.
- `isinstance(v, str)` -> `isStr(v)`; `isinstance(v, (int, float))` -> `isNum(v)`; `float(v).is_integer()` -> `Number.isInteger(v)`.
- Strings: `.strip()` -> `.trim()`, `.startswith` -> `.startsWith`, `.title()` -> write a small local helper.

## RNG
- The `rng` passed around is `new Rng(seed)` from engine/rng.js with `random()`, `randint(a, b)` (inclusive),
  `choice(arr)`, `shuffle(arr)`. Keep EVERY rng call in the same place and order as Python.

## Logging
- Keep the `L(...)` log calls (they feed the one-raid log), converting f-strings to template literals. Exact number
  formatting in log text may be approximate (`${x.toFixed(0)}`, `String(n).padStart(4)`), but don't drop logs.

## Python gotchas to watch
- `for x in list` while the list is reassigned inside the loop: Python iterates the ORIGINAL list.
- List comprehensions that filter then reassign (`vq = [h for h in vq if ...]`) -> `vq = vq.filter(...)`.
- `next((x for x in seq if cond), default)` -> `seq.find(cond) ?? default` (careful if a valid value is falsy).
- Chained comparisons `a <= x <= b` -> `a <= x && x <= b`.
- Python `and`/`or` return operands, not booleans: `x = a or b` -> `x = a || b` only if a can't be 0/''; otherwise be explicit.
- Default mutable args, keyword args -> use an options object or positional args consistently, and keep the call sites matching.
  Keyword-only call sites (e.g. `window(p, 4, L, P, 'tag', sharks=False, brews=...)`) -> pass an options object as the
  last argument: `window(p, 4, L, P, 'tag', { sharks: false, brews: ... })`. The function signature must accept that.

## Cross-module signatures (MUST match exactly - other agents port the callers)
Positional unless noted; trailing params optional.
- sim.js: `run_p1(cfgs, team, rng, log = null)`; `async parse_chart(wb, team, tab = null, block = 'A')` where `wb` is the
  object from `readXlsx()` (engine/xlsx.js) and the sheet is `const ws = await wb.load(tab || \`${team}-man\`)` - `ws.cell(r, c).value`,
  `ws.max_row`, `ws.max_column` work like openpyxl. `auto_surge(p, t, L, tag = '')`, `custom_surge(p, t, L, tag = '')`,
  `hit_chance(a, d)`, `fmt(t)`, `swap_due(p)`, `lb_swap_ok(p)`, `trio_shadow_alert(cfgs)`, class `Player`, constants
  `ARMOUR, FIXED, AMULETS, RINGS, CONFLICTION, WEAPONS, PRAYERS, BREW_BELOW, ...`, `FLAGS`, `CAMP`.
- p2.js: `run_p2(p1, team, rng, log = null)`, `scythe_roll(p)`, `shadow_numbers(p)`, `blowpipe_chance(p)`, constants
  `P2_DEF, P2_HP, P2_REDS, SHADOW_DELAY_NEAR, SHADOW_DELAY_DEEP, BP_DELAY`.
- reds.js: `run_reds(p2, cfgs, team, rng, log = null)`, `melee_max_acc(p, w_atk, w_str, def_roll)`, `claw_spec(p, rng)`, ...
- duo_reds.js: `run_duo_reds(p2r, cfgs, rng, log = null)`, `bp_vs(p, def_roll)`, ...
- p3.js: `run_p3(r_reds, cfgs, team, rng, log = null)`, `melee(p, w, def_roll, acc_mult = 1.0, idx = 1)` (the Python call
  `melee(p, THREE, P3_CRUSH, idx=2)` becomes `melee(p, THREE, P3_CRUSH, 1.0, 2)`), `HALB`, `P3_HP`, ...
- supplies.js: `window(p, slots, L, t, tag, opts = {})` with `opts = { sharks = true, hp_target = MAX_HP, brews = true }`
  (Python `window(p, 4, L, P, 'x', sharks=False, brews=...)` -> `window(p, 4, L, P, 'x', { sharks: false, brews: ... })`);
  `catchup(p, t, L = null, tag = '')`, `drink_scb(p, t = null, where = null)`, `check_death(p, phase, L = null, t = null)`,
  `redemption(p, L = null, t = null, why = '')`, `prayer_restore(p, t, L = null)`, `heal_other(p, team_players, t, L, clear)`,
  `scb_ok(p, team, below)`, `by_hp(players)`, `init_player(p, cfg, pool)`, class `Pool`, `drink_brew`, `drink_restore`,
  `eat_shark`, `maxed`, `try_heart`, `heart_pending`, constants `MAX_HP, BREW_HEAL, SHARK_HEAL, PNECK_AT, PNECK_HEAL, ...`.
- horn.js: `init_player(p, cfg)`, `active(p, t)`, `try_horn(caster, players, rank, phase, team, next_is_claw, L, t, tag = '')`,
  `HORN_COST`, ...
- gear.js: `shadow_attack(gear, magic_level, opts = {})` with `opts = { prayer = 'Augury', in_toa = false, def_roll = null,
  stance = 3 }` (Python `shadow_attack(g, m, def_roll=X)` -> `shadow_attack(g, m, { def_roll: X })`); `totals(names)`, `ITEMS`, `MAGE_SET`.
- Pool.left / Pool.used etc. stay plain objects with the same keys ('brew', 'scb', 'restore', 'shark').
