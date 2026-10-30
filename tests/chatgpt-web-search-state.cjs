const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'ChatGPTToolkit.user.js'), 'utf8');
function fixture({ auto = true, path = '/c/existing', draft = '', attachment = false, conflict = false, menuMissing = false, search = false } = {}) {
  let now = 1000, seq = 0;
  const timers = new Map();
  const env = { draft, attachment, conflict, menuMissing, search, menu: false, plusClicks: 0, itemClicks: 0, dismissals: 0, generation: false, chat: true, identity: 'first', form: {}, editor: {}, writes: [] };
  const root = { dataset: {}, querySelector: () => ({ setAttribute() {}, dataset: {} }) };
  const document = { getElementById: () => root, querySelector: () => null };
  const window = { location: { pathname: path, search: '' }, setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, due: now + ms }); return id; }, clearTimeout: id => timers.delete(id) };
  class Clock extends Date { static now() { return now; } }
  const context = { window, document, Date: Clock, URLSearchParams, console: { log() {}, warn() {} }, env };
  vm.createContext(context);
  const hooks = `
    settings = { autoWebSearch: ${auto}, autoRead: false };
    getCurrentComposerForm = () => env.form;
    getComposerEditor = form => form ? env.editor : null;
    getComposerIdentity = () => env.identity;
    isComposerWebSearchEnabled = () => env.search;
    hasComposerDraftContent = () => Boolean(env.draft || env.attachment);
    hasSelectedNonSearchTool = () => env.conflict;
    isChatSurfaceSelected = () => env.chat;
    isGenerationActive = () => env.generation;
    isActionable = element => Boolean(element);
    dismissOpenMenuBestEffort = () => { env.menu = false; env.dismissals++; };
    findVisibleWebSearchMenuItem = () => env.menu && !env.menuMissing ? {
      click() { env.itemClicks++; env.search = true; env.menu = false; }
    } : null;
    env.form.querySelector = () => ({click() { env.plusClicks++; env.menu = !env.menu; }});
    gmWrite = (key, value) => env.writes.push({key, value});
    globalThis.api = {
      click: handleWebSearchToggleClick,
      evaluate: evaluateWebSearchState,
      submit: suppressWebSearchForPromptSubmission,
      input: () => suppressPendingWebSearch('composer-input'),
      drag: () => { suppressNextClick = true; },
      state: () => ({status:webSearchActivation.status, reason:webSearchActivation.reason, manual:webSearchActivation.manual, auto:settings.autoWebSearch}),
      replaceForm: () => { env.form = {querySelector: () => ({click() { env.plusClicks++; }})}; },
      replaceEditor: () => { env.editor = {}; }
    };
  `;
  vm.runInContext(source.replace('    init();', '').replace(/\}\)\(\);\s*$/, hooks + '\n})();'), context);
  function advance(ms) {
    const end = now + ms;
    let steps = 0;
    while (true) {
      const entry = [...timers.entries()].filter(([,t]) => t.due <= end).sort((a,b) => a[1].due-b[1].due)[0];
      if (!entry) break;
      assert.ok(++steps < 200, 'must not poll indefinitely');
      now = entry[1].due; timers.delete(entry[0]); entry[1].fn();
    }
    now = end;
  }
  return {env, api: context.api, window, advance, timers};
}
const results = [];
function test(name, fn) { fn(); results.push(name); console.log('PASS ' + name); }
test('Existing chat: one globe click adds Search; repeat click preserves Search and preference', () => {
  const f = fixture(); f.api.evaluate(); assert.equal(f.env.plusClicks,0);
  f.api.click(); f.advance(1000); assert.equal(f.env.search,true); assert.equal(f.env.plusClicks,1); assert.equal(f.env.itemClicks,1);
  f.api.click(); f.advance(1000); assert.equal(f.env.plusClicks,1); assert.equal(f.env.itemClicks,1); assert.equal(f.api.state().auto,true); assert.equal(f.env.writes.length,0);
});
test('Existing draft and attachment preserved; manual works while automation off', () => {
  const f = fixture({auto:false,draft:'unsent draft',attachment:true}); f.api.click(); f.advance(1000);
  assert.equal(f.env.search,true); assert.equal(f.env.draft,'unsent draft'); assert.equal(f.env.attachment,true); assert.equal(f.api.state().auto,false); assert.equal(f.env.writes.length,0);
});
test('Manual removal stays removed until a new globe click', () => {
  const f=fixture(); f.api.click(); f.advance(1000); f.env.search=false; f.api.evaluate(); f.advance(10000);
  assert.equal(f.env.plusClicks,1); assert.equal(f.env.search,false);
  f.api.click(); f.advance(1000); assert.equal(f.env.search,true); assert.equal(f.env.plusClicks,2);
});
test('Rapid repeated globe clicks coalesce into one attempt', () => {
  const f=fixture(); for(let i=0;i<10;i++) f.api.click(); f.advance(1000); assert.equal(f.env.plusClicks,1); assert.equal(f.env.itemClicks,1);
});
for (const stage of [0, 310]) test('Submission cancels manual timers at '+stage+'ms even when auto is off', () => {
  const f=fixture({auto:false}); f.api.click(); f.advance(stage); f.api.submit(); f.advance(10000);
  assert.equal(f.env.itemClicks,0); assert.equal(f.env.search,false); assert.equal(f.timers.size,0);
});
test('Input during a pending manual request cancels it', () => {
  const f=fixture(); f.api.click(); f.api.input(); f.advance(10000); assert.equal(f.env.plusClicks,0);
});
for (const change of ['route','identity','form','editor']) test('Pending manual request cannot cross '+change+' replacement', () => {
  const f=fixture({auto:false}); f.api.click();
  if(change==='route') f.window.location.pathname='/c/another';
  if(change==='identity') f.env.identity='second';
  if(change==='form') f.api.replaceForm();
  if(change==='editor') f.api.replaceEditor();
  f.advance(10000); assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,0);
});
test('An already-open tools menu is reused', () => {
  const f=fixture(); f.env.menu=true; f.api.click(); f.advance(1000); assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,1); assert.equal(f.env.search,true);
});
test('Missing menu item stops within timeout and can be retried explicitly', () => {
  const f=fixture({menuMissing:true}); f.api.click(); f.advance(10000); assert.equal(f.api.state().status,'failed'); assert.equal(f.timers.size,0); assert.equal(f.env.plusClicks,1);
  f.env.menuMissing=false; f.api.click(); f.advance(1000); assert.equal(f.env.search,true); assert.equal(f.env.plusClicks,2);
});
for(const kind of ['work','temporary','custom-gpt','tool','generation']) test('Manual request respects '+kind+' guard', () => {
  const f=fixture();
  if(kind==='work') f.env.chat=false;
  if(kind==='temporary') f.window.location.search='?temporary-chat=true';
  if(kind==='custom-gpt') f.window.location.pathname='/g/g-project/c/existing';
  if(kind==='tool') f.env.conflict=true;
  if(kind==='generation') f.env.generation=true;
  f.api.click(); f.advance(10000); assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,0);
});
test('Dragging does not trigger Search', () => { const f=fixture(); f.api.drag(); f.api.click(); f.advance(1000); assert.equal(f.env.plusClicks,0); });
test('Automatic activation still only runs once for a fresh blank chat', () => {
  const f=fixture({path:'/'}); f.api.evaluate(); f.advance(1000); assert.equal(f.env.search,true); assert.equal(f.env.plusClicks,1);
  f.env.search=false; f.api.evaluate(); f.advance(10000); assert.equal(f.env.plusClicks,1);
});
for(const kind of ['draft','attachment','existing','off']) test('No automatic clicks for '+kind, () => {
  const f=fixture({path:kind==='existing'?'/c/existing':'/',draft:kind==='draft'?'text':'',attachment:kind==='attachment',auto:kind!=='off'});
  f.api.evaluate(); f.advance(10000); assert.equal(f.env.plusClicks,0);
});
test('A subsequent new blank chat retains automatic activation after a manual request', () => {
  const f=fixture({path:'/'}); f.api.click(); f.advance(1000);
  f.env.identity='new-blank-chat'; f.env.search=false; f.api.evaluate(); f.advance(1000);
  assert.equal(f.env.search,true); assert.equal(f.env.plusClicks,2); assert.equal(f.api.state().manual,false);
});

const projectBase = '/g/g-p-6ac1fd3ff07481919ef5b1834d26318c';
for (const suffix of ['', '-kao-yan-zuo-wen', '-项目名称']) {
  const projectPath = projectBase + suffix + '/c/6aca0f9c-ec04-83ea-ab14-383cff309d25';
  test('Project route '+suffix+': explicit click works and preserves draft', () => {
    const f=fixture({path:projectPath,auto:false,draft:'unsent project draft',attachment:true});
    f.api.click(); f.api.click(); f.advance(1000);
    assert.equal(f.env.search,true); assert.equal(f.env.plusClicks,1); assert.equal(f.env.itemClicks,1);
    assert.equal(f.env.draft,'unsent project draft'); assert.equal(f.env.attachment,true); assert.equal(f.env.writes.length,0);
  });
  test('Project route '+suffix+': no automatic activation', () => {
    const f=fixture({path:projectPath}); f.api.evaluate(); f.advance(10000);
    assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,0);
  });
}
for (const destination of [projectBase+'-other/c/another', '/c/ordinary', '/g/g-custom/c/another']) {
  test('Pending Project request is cancelled on navigation to '+destination, () => {
    const f=fixture({path:projectBase+'/c/existing',auto:false}); f.api.click();
    f.window.location.pathname=destination; f.advance(10000);
    assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,0);
  });
}
for (const action of ['submit','input']) test('Project request is cancelled by '+action, () => {
  const f=fixture({path:projectBase+'/c/existing',auto:false}); f.api.click(); f.advance(310);
  f.api[action](); f.advance(10000); assert.equal(f.env.itemClicks,0); assert.equal(f.env.search,false); assert.equal(f.timers.size,0);
});
for (const route of [projectBase+'/project', '/g/g-p-short/c/existing', projectBase+'/c/existing/extra', '/g/g-custom/c/existing']) {
  test('Unsupported route remains protected: '+route, () => {
    const f=fixture({path:route}); f.api.click(); f.advance(10000);
    assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,0);
  });
}
test('Project Work and Temporary Chat remain protected', () => {
  for (const guard of ['work','temporary']) {
    const f=fixture({path:projectBase+'/c/existing'});
    if (guard==='work') f.env.chat=false; else f.window.location.search='?temporary-chat=true';
    f.api.click(); f.advance(10000); assert.equal(f.env.plusClicks,0); assert.equal(f.env.itemClicks,0);
  }
});

assert.equal((source.match(/new MutationObserver\(/g)||[]).length,1);
assert.equal(source.includes('setInterval('),false);
assert.ok(source.includes('// @name         ChatGPT Toolkit'), 'Metadata @name must be ChatGPT Toolkit');
assert.ok(source.includes('// @version      1.3.0'), 'Metadata @version must be 1.3.0');
assert.ok(source.includes('ChatGPTToolkit.user.js'), 'Download & update URLs must point to ChatGPTToolkit.user.js');
assert.ok(source.includes("const PREFIX = '[ChatGPTToolkit]';"), 'PREFIX constant must be [ChatGPTToolkit]');
assert.ok(source.includes("'chatgpt-toolkit:auto-web-search-enabled'"), 'STORAGE keys must use chatgpt-toolkit namespace');
console.log(JSON.stringify({passed:results.length,checks:results,singleObserver:true,noPermanentPolling:true},null,2));
