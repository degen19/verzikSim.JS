# Default charts

Charts listed in `index.json` appear under **Default charts** in the Chart picker of "Build chart on this page".

Each entry is `{ "name": "...", "team": 2|3|4|5, "file": "..." }`, where `file` sits in this folder and is either:
- a `.json` file from the builder's **Save to file** button, or
- a filled chart `.xlsx` (its `N-man` tab is read, Set A and Set B).

Example:

```json
[
  { "name": "Duo - standard", "team": 2, "file": "duo_standard.json" },
  { "name": "4-man Booma P1", "team": 4, "file": "4man_booma.xlsx" }
]
```

Picking a default loads a copy onto the page; the file itself is never changed. Save it under your own name to keep edits.
