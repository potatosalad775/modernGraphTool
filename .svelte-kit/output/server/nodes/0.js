

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.Cz1Wahml.js","_app/immutable/chunks/Ctq5spUS.js","_app/immutable/chunks/DuKiNuQX.js","_app/immutable/chunks/BUpYc4-6.js","_app/immutable/chunks/0fCUB_f9.js","_app/immutable/chunks/BuiSbxAC.js","_app/immutable/chunks/BBWxwdcc.js"];
export const stylesheets = ["_app/immutable/assets/0.PFVEyaG9.css"];
export const fonts = [];
