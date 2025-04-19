// Load Google Tag Manager onto the page
function setupGraphAnalytics() {
    const gtmScriptContent = "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','"+ window.ANALYTICS_GTM_ID +"');",
        gtmIframeSrc = "https://www.googletagmanager.com/ns.html?id="+ window.ANALYTICS_GTM_ID,
        gtmIframeStyle = "display: none; visibility: hidden;",
        graphAnalyticsSrc = "graphAnalytics.js";

    const pageHead = document.querySelector("head"),
          pageBody = document.querySelector("body"),
          gtmScript = document.createElement("script"),
          gtmNoscript = document.createElement("noscript"),
          gtmIframe = document.createElement("iframe"),
          graphAnalytics = document.createElement("script");

    gtmScript.textContent = gtmScriptContent;
    pageHead.prepend(gtmScript);
}
setupGraphAnalytics();

window.dataLayer = window.dataLayer || [];

// *************************************************************
// Functions to fire events
// *************************************************************

// For events related to specific phones, e.g. when a phone is displayed
function pushPhoneTag(eventName, p, trigger) {
    let eventTrigger = trigger ? trigger : "user",
        phoneBrand = p.dispBrand ? p.dispBrand : "Target",
        phoneModel = p.phone,
        phoneVariant = p.dispName,
        value = 1;
    
    window.dataLayer.push({
        "event" : eventName,
        "trigger" : eventTrigger,
        "site": window.ANALYTICS_SITE,
        "phoneBrand": phoneBrand,
        "phoneModel": phoneModel,
        "phoneVariant": phoneVariant,
        "phoneName" : phoneBrand + ' ' + phoneModel,
        "value": value
    });
    
    if (window.LOG_ANALYTICS) { console.log("Event:      "+ eventName +"\nTrigger:    "+ eventTrigger +"\nSite:       "+ window.ANALYTICS_SITE +"\nPhone:      "+ phoneBrand +" "+ phoneModel +"\nVariant:    " + phoneVariant); }
}

// For events not related to a specific phone, e.g. user clicked screenshot button
function pushEventTag(eventName, targetWindow, other, trigger) {
  

    let eventTrigger = trigger ? trigger : "user",
        url = targetWindow.location.href,
        par = "?share=",
        value = 1,
        activePhones = url.includes(par) 
        ? (url.split(par).pop().startsWith('b62_') 
          ? decodeURI(base62Decode(url.split(par).pop().substring(4)).replace(/_/g," ").replace(/,/g, ", ")) 
          : decodeURI(url.replace(/_/g," ").split(par).pop().replace(/,/g, ", "))
        ) : "null",
        otherData = other ? other : "null";
    
    window.dataLayer.push({
        "event" : eventName,
        "trigger" : eventTrigger,
        "site": window.ANALYTICS_SITE,
        "activePhones": activePhones,
        "other": otherData,
        "value": value
    });
    
    if (window.LOG_ANALYTICS) { console.log("Event:      "+ eventName +"\nTrigger:    "+ eventTrigger +"\nSite name:  "+ window.ANALYTICS_SITE +"\nActive:     "+ activePhones +"\nOther:      "+ otherData); }
}

function base62Decode(str) {
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let value = BigInt(0);

  for (let i = 0; i < str.length; i++) {
    value = value * BigInt(62) + BigInt(charset.indexOf(str[i]));
  }

  const bytes = [];
  while (value > 0) {
    bytes.unshift(Number(value % BigInt(256)));
    value = value / BigInt(256);
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}

if (window.LOG_ANALYTICS) { console.log("... Analytics initialized ... "); }