import { f as deLocalizeUrl } from "../chunks/runtime.js";
const reroute = (request) => deLocalizeUrl(request.url).pathname;
export {
  reroute
};
