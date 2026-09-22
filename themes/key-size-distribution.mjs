import { mark } from '../lib/core.mjs';
import { keySizeDistribution } from '../lib/shapes.mjs';
export const themes = [
    { name: 'key-size-distribution', order: 22, seed: 43011, zoom: 1.26, center: [960, 540], title: 'Valkey key size distribution', desc: 'A Valkey Admin panel ranking keys by size with each size printed beside its bar, the top two at tens of megabytes and drawn in red, wired along a trunk into three shard enclosures of three servers each drawn as the white Valkey hexagon mark, representing a few outsized objects spread across a deployment.', art: keySizeDistribution, motif: "Ranked key-size bars with two big outliers, fanning into a grid of servers", use: "Key size skew, heavy hitters, hot keys across a fleet" },
];
