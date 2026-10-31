// Moves the plugin and the registry manifest to a published CLI version.
import { readFileSync, writeFileSync } from "node:fs";

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error("Usage: node scripts/pin-cli.mjs <from> <to>");

const edits = {
  "server.json": [[`"version": "${from}"`, `"version": "${to}"`]],
  "plugins/memcell/.claude-plugin/plugin.json": [
    [`"version": "${from}"`, `"version": "${to}"`],
    [`"memcell@${from}"`, `"memcell@${to}"`],
  ],
  "plugins/memcell/README.md": [[`memcell@${from}`, `memcell@${to}`]],
};

for (const [path, swaps] of Object.entries(edits)) {
  let text = readFileSync(path, "utf8");
  for (const [before, after] of swaps) {
    if (!text.includes(before)) throw new Error(`${path} has no ${before}`);
    text = text.replaceAll(before, after);
  }
  writeFileSync(path, text);
}
