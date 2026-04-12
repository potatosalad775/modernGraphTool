let base = "";
let assets = "https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn/v2.0.0";
const app_dir = "_app";
const relative = true;
const initial = { base, assets };
const initial_base = initial.base;
function override(paths) {
  base = paths.base;
  assets = paths.assets;
}
function reset() {
  base = initial.base;
  assets = initial.assets;
}
function set_assets(path) {
  assets = initial.assets = path;
}
export {
  assets as a,
  base as b,
  app_dir as c,
  reset as d,
  initial_base as i,
  override as o,
  relative as r,
  set_assets as s
};
