'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),vm=require('node:vm');
const sourceRoot=process.cwd(), service=require(path.join(sourceRoot,'local-manager/service'));
(async()=>{
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aff-feature-'));
fs.mkdirSync(path.join(temp,'data'));fs.mkdirSync(path.join(temp,'assets/covers'),{recursive:true});fs.mkdirSync(path.join(temp,'local-manager'));
fs.copyFileSync(path.join(sourceRoot,'local-manager/thumbnail.py'),path.join(temp,'local-manager/thumbnail.py'));
const original=service.read();fs.writeFileSync(path.join(temp,'data/catalog.json'),JSON.stringify(original.catalog));fs.writeFileSync(path.join(temp,'data/catalog.csv'),service.csv(original.catalog));
const mod=new Module(path.join(temp,'local-manager/service.js'),module);mod.filename=path.join(temp,'local-manager/service.js');mod.paths=module.paths;mod._compile(fs.readFileSync(path.join(sourceRoot,'local-manager/service.js'),'utf8'),mod.filename);const test=mod.exports;
const fixture=fs.readFileSync(path.join(sourceRoot,'assets/covers/1735273.webp'));const coverData='data:image/webp;base64,'+fixture.toString('base64');
const before=test.read();const story={...before.catalog.stories[0],'購買連結':[{name:'上篇',url:'https://example.com/upper'},{name:'下篇',url:'https://example.com/lower'}]};
const result=await test.handle('POST','/api/aff/save',{id:test.storyId(story),revision:before.revision,story,coverData},path.join(temp,'backups'));
const updated=result.catalog.stories[0];assert.equal(updated['購買連結'].length,2);assert.match(updated['封面'],/\d+-[a-f0-9]{12}\.webp$/);assert(fs.existsSync(path.join(temp,updated['封面'])));assert(fs.readFileSync(path.join(temp,updated['封面'])).subarray(8,12).equals(Buffer.from('WEBP')));
assert(fs.readdirSync(path.join(temp,'backups')).length===1);assert(fs.readFileSync(path.join(temp,'data/catalog.csv'),'utf8').includes('上篇'));
const reopened={...updated};delete reopened['購買連結'];const retained=await test.handle('POST','/api/aff/save',{id:test.storyId(updated),revision:result.revision,story:reopened},path.join(temp,'backups'));assert.equal(retained.catalog.stories[0]['購買連結'].length,2);
await assert.rejects(test.handle('POST','/api/aff/save',{id:test.storyId(story),revision:before.revision,story,coverData},temp),/重新載入/);
await assert.rejects(test.thumbnail('data:image/png;base64,'+Buffer.from('not-an-image').toString('base64')),/圖片無法讀取/);
const html=fs.readFileSync(path.join(sourceRoot,'local-manager/index.html'),'utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert(html.includes('＋新增購買連結'));assert(html.includes('coverData:pendingCover'));assert(html.includes('purchaseRows()'));
// Execute the real public card renderer against a small DOM substitute.
class Node{constructor(tag){this.tag=tag;this.children=[];this.value='';this.className='';}get childNodes(){return this.children}append(...nodes){this.children.push(...nodes)}prepend(n){this.children.unshift(n)}replaceChildren(...nodes){this.children=nodes}addEventListener(){}remove(){}}
const ids=Object.fromEntries(['search','type','author','paid','invite','count','empty','stories','reset','updated'].map(id=>[id,new Node(id)]));
const context={document:{getElementById:id=>ids[id],createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment')},URL,fetch:async()=>({ok:true,json:async()=>({stories:[{...updated,'購買連結':[...updated['購買連結'],{name:'unsafe',url:'javascript:alert(1)'}]}],updatedAt:'2026-11-02'})})};
vm.runInNewContext(fs.readFileSync(path.join(sourceRoot,'app.js'),'utf8'),context);await new Promise(r=>setImmediate(r));
const card=ids.stories.children[0].children[0];const purchases=card.children[1].children.find(n=>n.className==='purchases');assert.equal(purchases.children.length,3);assert.equal(purchases.children[1].textContent,'上篇 ↗');assert.equal(card.children[0].children[0].src,updated['封面']);
console.log('Passed: multi-link save/reopen/order, CSV, compressed hashed cover, backup, stale save, invalid image/link, real card rendering and unsafe link filtering.');
fs.rmSync(temp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1});
