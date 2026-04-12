import { e as ensure_array_like, a as attr, b as escape_html } from "../../chunks/root.js";
import { p as page } from "../../chunks/index.js";
import { l as localizeHref, a as locales } from "../../chunks/runtime.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    children($$renderer2);
    $$renderer2.push(`<!----> <div style="display:none"><!--[-->`);
    const each_array = ensure_array_like(locales);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let locale = each_array[$$index];
      $$renderer2.push(`<a${attr("href", localizeHref(page.url.pathname, { locale }))}>${escape_html(locale)}</a>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _layout as default
};
