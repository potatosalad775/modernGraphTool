import { o as overwriteServerAsyncLocalStorage, i as isExcludedByRouteStrategy, b as serverAsyncLocalStorage, c as baseLocale, d as getStrategyForUrl, e as shouldRedirect, f as deLocalizeUrl, h as getTextDirection } from "../chunks/runtime.js";
async function paraglideMiddleware(request, resolve, callbacks) {
  if (!serverAsyncLocalStorage) {
    const { AsyncLocalStorage } = await import("async_hooks");
    overwriteServerAsyncLocalStorage(new AsyncLocalStorage());
  } else if (!serverAsyncLocalStorage) {
    overwriteServerAsyncLocalStorage(createMockAsyncLocalStorage());
  }
  if (isExcludedByRouteStrategy(request.url)) {
    const locale2 = baseLocale;
    const origin2 = new URL(request.url).origin;
    const newRequest2 = cloneRequestWithFallback(request);
    const messageCalls2 = /* @__PURE__ */ new Set();
    return (
      /** @type {Response} */
      await serverAsyncLocalStorage?.run({ locale: locale2, origin: origin2, messageCalls: messageCalls2 }, () => resolve({ locale: locale2, request: newRequest2 }))
    );
  }
  const strategy = getStrategyForUrl(request.url);
  const decision = await shouldRedirect({ request });
  const locale = decision.locale;
  const origin = new URL(request.url).origin;
  if (request.headers.get("Sec-Fetch-Dest") === "document" && decision.shouldRedirect && decision.redirectUrl) {
    const headers = {};
    if (strategy.includes("preferredLanguage")) {
      headers["Vary"] = "Accept-Language";
    }
    const response2 = new Response(null, {
      status: 307,
      headers: {
        Location: decision.redirectUrl.href,
        ...headers
      }
    });
    return response2;
  }
  let newRequest;
  if (strategy.includes("url")) {
    newRequest = new Request(deLocalizeUrl(request.url), request);
  } else {
    newRequest = cloneRequestWithFallback(request);
  }
  const messageCalls = /* @__PURE__ */ new Set();
  const response = await serverAsyncLocalStorage?.run({ locale, origin, messageCalls }, () => resolve({ locale, request: newRequest }));
  return response;
}
function cloneRequestWithFallback(request) {
  try {
    return new Request(request.clone());
  } catch {
    try {
      return new Request(request);
    } catch {
      return request;
    }
  }
}
function createMockAsyncLocalStorage() {
  let currentStore = void 0;
  return {
    getStore() {
      return currentStore;
    },
    async run(store, callback) {
      currentStore = store;
      try {
        return await callback();
      } finally {
        currentStore = void 0;
      }
    }
  };
}
const handleParaglide = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
  event.request = request;
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%paraglide.lang%", locale).replace("%paraglide.dir%", getTextDirection(locale))
  });
});
const handle = handleParaglide;
export {
  handle
};
