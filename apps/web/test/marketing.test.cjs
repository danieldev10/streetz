require("./register-typescript.cjs");
const test = require("node:test"), assert = require("node:assert/strict");

function fixture(host = "crushclub.ng") {
  delete require.cache[require.resolve("../src/lib/marketing.ts")];
  const listeners = new Map(), local = new Map(), session = new Map(), scripts = [], navigations = [];
  const storage = map => ({ getItem:key=>map.get(key)??null, setItem:(key,value)=>map.set(key,value), removeItem:key=>map.delete(key) });
  global.window = { location: {hostname:host,href:`https://${host}/events/event1`,origin:`https://${host}`,pathname:"/events/event1",
    assign:url=>navigations.push(url),replace:url=>navigations.push(url),reload:()=>navigations.push("reload")},
    localStorage:storage(local),sessionStorage:storage(session),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
    dispatchEvent:event=>listeners.get(event.type)?.(event) };
  global.history = { pushState(){}, replaceState(){} };
  global.document = { cookie:"", createElement:()=>({}), head:{appendChild:script=>scripts.push(script)} };
  return { m:require("../src/lib/marketing.ts"),local,session,scripts,navigations,listeners };
}

test("tracking fails closed before consent and on staging, previews, private routes and sensitive queries", () => {
  const {m,scripts}=fixture();
  for(const path of ["/", "/?mode=register", "/payment/callback?reference=SECRET", "/events/id/tickets", "/events/create", "/events/history", "/tickets/guest?token=SECRET", "/messages", "/profiles/id", "/admin", "/events?email=private", "/events/id#SECRET"])
    assert.equal(m.marketingPage(new URL("https://crushclub.ng"+path)),false,path);
  assert(m.marketingPage(new URL("https://crushclub.ng/events/id?ttclid=ad-123")));
  assert.equal(m.marketingLandingUrl(new URL("https://crushclub.ng/events/id?utm_campaign=private-label&ttclid=ad-123")).href,"https://crushclub.ng/events/id?ttclid=ad-123");
  assert.equal(m.marketingLandingUrl(new URL("https://crushclub.ng/events/id?token=secret")),null);
  m.trackRegistration();m.syncMarketing(false,true);
  assert.equal(scripts.length,0);
  assert.equal(window.sessionStorage.getItem("ccl.marketing-pending.v1"),null);
  m.setMarketingConsent(true); m.syncMarketing(true,true); assert.equal(scripts.length,0);
  const stage=fixture("staging.crushclub.ng");stage.m.setMarketingConsent(true);stage.m.syncMarketing(false,true);
  assert.equal(stage.scripts.length,0);
});

test("verified conversions survive redirect without references, deduplicate reloads, and reject free/invalid payloads", () => {
  const {m,scripts,session}=fixture();m.setMarketingConsent(true);
  m.trackPurchase({eventId:"ccl_"+"a".repeat(64),contentId:"event1",currency:"NGN",value:15000,quantity:2});
  m.trackCheckout("event1",0,1);
  assert.equal(JSON.parse(session.get("ccl.marketing-pending.v1")).length,1);
  m.setMarketingEventView("event1");m.syncMarketing(false,true);
  assert.equal(scripts.length,1);
  const calls=window.ttq.filter(call=>call[0]==="track");
  assert.equal(calls.filter(call=>call[1]==="Purchase").length,1);
  assert.equal(calls.filter(call=>call[1]==="ViewContent").length,1);
  assert.equal(window.ttq._o[m.TIKTOK_PIXEL_ID].historyObserver,false);
  assert.equal(window.ttq._o[m.TIKTOK_PIXEL_ID].autoConfig,false);
  m.trackPurchase({eventId:"ccl_"+"a".repeat(64),contentId:"event1",currency:"NGN",value:15000,quantity:2});m.syncMarketing(false,true);
  assert.equal(window.ttq.filter(call=>call[1]==="Purchase").length,1);
  const stored=JSON.stringify([...session]);assert(!stored.includes("reference")&&!stored.includes("@"));
});

test("private navigation tears down the tracking document; revocation clears pending activity and reloads", () => {
  const {m,navigations,session}=fixture();m.setMarketingConsent(true);m.syncMarketing(false,true);
  const cleanup=m.installMarketingNavigationGuard();
  history.pushState({},"","/messages?secret=value");assert.equal(navigations.length,1);
  assert(window.ttq.some(call=>call[0]==="revokeConsent"));
  m.trackRegistration();assert(session.size>0);
  m.setMarketingConsent(false);m.syncMarketing(false,true);
  assert.equal(session.size,0);assert(navigations.includes("reload"));cleanup();
});

test("rejecting optional tracking still takes effect when localStorage writes fail", () => {
  const {m}=fixture();m.setMarketingConsent(true);
  window.localStorage.setItem=()=>{throw new Error("storage full")};
  m.setMarketingConsent(false);assert.equal(m.readMarketingConsent(),false);
  m.trackRegistration();assert.equal(window.sessionStorage.getItem("ccl.marketing-pending.v1"),null);
});
