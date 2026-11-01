'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'data/catalog.json');
const revision = text => crypto.createHash('sha256').update(text).digest('hex');
let busy = false;
const coverPattern = /^assets\/covers\/\d+(?:-[a-f0-9]{12})?\.webp$/;
function purchaseLinks(value) {
  if (!Array.isArray(value) || value.length > 30) throw Error('購買連結最多 30 個');
  return value.map(link => {
    if (!link || typeof link.name !== 'string' || !link.name.trim() || link.name.length > 100 || typeof link.url !== 'string' || link.url.length > 2000) throw Error('每個購買連結都需填寫名稱與網址');
    let url; try { url = new URL(link.url); } catch { throw Error('購買網址格式不正確'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('購買連結請使用 HTTPS 網址');
    return { name: link.name.trim(), url: url.href };
  });
}
async function thumbnail(data) {
  if (typeof data !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 7 * 1024 * 1024) throw Error('請選擇 5 MB 以內的 JPG、PNG 或 WebP 圖片');
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  if (bytes.length > 5 * 1024 * 1024) throw Error('圖片不可超過 5 MB');
  const python = path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
  return await new Promise((resolve,reject) => {
    const child = execFile(python,[path.join(__dirname,'thumbnail.py')],{encoding:'buffer',maxBuffer:4*1024*1024,timeout:30000},(error,stdout) => error ? reject(Error('圖片無法讀取，請使用 5 MB 以內的 JPG、PNG 或 WebP 圖片。')) : resolve(stdout));
    child.stdin.on('error',()=>{}); child.stdin.end(bytes);
  });
}
function read() {
  const text = fs.readFileSync(file, 'utf8');
  return { catalog: JSON.parse(text), revision: revision(text) };
}
function storyId(story) {
  const url = new URL(story['連結']);
  if (url.protocol !== 'https:' || !/^(www\.)?asianfanfics\.com$/.test(url.hostname)) throw Error('請填入 AFF 的 HTTPS 文章連結');
  const id = url.pathname.match(/^\/story\/view\/(\d+)(?:\/|$)/)?.[1];
  if (!id) throw Error('文章連結格式不正確');
  return id;
}
function validate(story) {
  const id = storyId(story);
  if (!String(story['篇名'] || '').trim()) throw Error('請填寫篇名');
  if (!['原創','譯作','不公開'].includes(story['譯作/原創'])) throw Error('作品性質不正確');
  if (!['是','部分付費','未見付費標示'].includes(story['付費文章'])) throw Error('付費選項不正確');
  if (!['是','否'].includes(story['邀請制'])) throw Error('邀請制選項不正確');
  if (!['V',''].includes(story['顯示/不顯示'])) throw Error('顯示選項不正確');
  story['購買連結'] = purchaseLinks(story['購買連結'] || []);
  for (const [key,value] of Object.entries(story)) if (!['編號','購買連結'].includes(key) && (typeof value !== 'string' || value.length > 4000)) throw Error('欄位內容過長或格式不正確');
  if (story['封面'] && !coverPattern.test(story['封面'])) throw Error('封面路徑不正確');
  if (['是','部分付費'].includes(story['付費文章'])) story['邀請制']='是';
  return id;
}
function csv(catalog) {
  const cell = value => '"'+String(value ?? '').replace(/"/g,'""')+'"';
  const columns=[...new Set([...catalog.columns,'購買連結'])];
  return '\ufeff'+[columns,...catalog.stories.map(s=>columns.map(k=>k==='購買連結'?JSON.stringify(s[k]||[]):s[k]))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
async function save(input, backupDir) {
  const state=read();
  if (state.revision !== input.revision) throw Error('目錄已被其他操作更新，請重新載入後再編輯');
  const catalog=state.catalog;
  const index=catalog.stories.findIndex(s=>storyId(s)===input.id);
  let image;
  if (input.action==='delete') {
    if (index<0 || input.confirm!==true) throw Error('找不到文章或尚未確認移除');
    catalog.stories.splice(index,1);
  } else {
    const story=Object.fromEntries([...catalog.columns,'封面'].map(k=>[k,input.story?.[k] ?? '']));
    story['購買連結'] = input.story?.['購買連結'] ?? (index>=0 ? catalog.stories[index]['購買連結'] : []) ?? [];
    const id=validate(story);
    if (catalog.stories.some((s,i)=>i!==index&&storyId(s)===id)) throw Error('這個 AFF 連結已在目錄中');
    if (input.coverData) {
      image = await thumbnail(input.coverData);
      if (read().revision !== input.revision) throw Error('目錄已更新，請重新載入');
      story['封面'] = `assets/covers/${id}-${revision(image).slice(0,12)}.webp`;
    }
    story['編號']=index>=0?catalog.stories[index]['編號']:Math.max(0,...catalog.stories.map(s=>Number(s['編號'])||0))+1;
    if(index>=0) catalog.stories[index]=story; else catalog.stories.unshift(story);
  }
  catalog.updatedAt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const backup=path.join(backupDir,'aff-'+Date.now()); fs.mkdirSync(backup,{recursive:true});
  fs.copyFileSync(file,path.join(backup,'catalog.json'));
  fs.copyFileSync(path.join(root,'data/catalog.csv'),path.join(backup,'catalog.csv'));
  if (image) {
    const story = catalog.stories.find(s=>storyId(s)===storyId(input.story));
    fs.writeFileSync(path.join(root,story['封面']),image);
  }
  const text=JSON.stringify(catalog,null,2)+'\n';
  fs.writeFileSync(file+'.tmp',text); fs.renameSync(file+'.tmp',file);
  fs.writeFileSync(path.join(root,'data/catalog.csv'),csv(catalog));
  return {...read(),saved:true};
}
async function git(...args) { return (await exec('git',args,{cwd:root,maxBuffer:2*1024*1024})).stdout.trim(); }
async function publish(input) {
  if (input.confirm!=='publish') throw Error('請先確認發布 AFF 書櫃');
  if (input.revision!==read().revision) throw Error('目錄已更新，請重新載入後發布');
  const branch=await git('branch','--show-current'); if(branch!=='main') throw Error('AFF 專案必須在 main 分支');
  const remote=await git('remote','get-url','origin'); if(!/^https:\/\/github\.com\/garygary85535\/aff_index(?:\.git)?$/.test(remote)) throw Error('AFF 發布目的地不符合設定');
  await git('fetch','origin','main');
  const head=await git('rev-parse','HEAD'), upstream=await git('rev-parse','origin/main');
  if(head!==upstream) throw Error('本地與遠端版本不同，請先同步 Git 版本');
  if(await git('diff','--cached','--name-only')) throw Error('專案已有暫存變更，請先處理後發布');
  const changed=await git('status','--porcelain','--untracked-files=all');
  const allowed=new Set(['data/catalog.json','data/catalog.csv']);
  const files=changed.split('\n').filter(Boolean).map(line=>line.trimStart().slice(2).trim());
  if(files.some(name=>!allowed.has(name)&&!coverPattern.test(name))) throw Error('專案有其他檔案變更，請先處理後發布');
  if(!changed) return {unchanged:true,url:'https://garygary85535.github.io/aff_index/'};
  await git('add','--',...files);
  await git('commit','-m','Update AFF catalog from local manager');
  await git('push','origin','main');
  return {commit:await git('rev-parse','HEAD'),url:'https://garygary85535.github.io/aff_index/'};
}
async function handle(method,route,input,backupDir) {
  if(method==='GET'&&route==='/api/aff/catalog') return read();
  if(busy) throw Error('AFF 正在儲存或發布，請稍候');
  busy=true;
  try {
    if(method==='POST'&&route==='/api/aff/save') return await save(input,backupDir);
    if(method==='POST'&&route==='/api/aff/publish') return await publish(input);
    throw Error('無效 AFF 操作');
  } finally { busy=false; }
}
function serve(route,res,token) {
  let target;
  if(route==='/aff'||route==='/aff/') target=path.join(__dirname,'index.html');
  else if(route.startsWith('/aff-preview/')) {
    const name=route.slice('/aff-preview/'.length)||'index.html';
    if(!/^(?:index\.html|app\.js|styles\.css|data\/catalog\.json|assets\/covers\/\d+(?:-[a-f0-9]{12})?\.webp)$/.test(name)) return false;
    target=path.join(root,name);
  } else return false;
  if(!fs.existsSync(target)) return false;
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp'};
  res.setHeader('Content-Type',mime[path.extname(target)]);
  res.end(target.endsWith('local-manager/index.html')?fs.readFileSync(target,'utf8').replace('__MANAGER_TOKEN__',token):fs.readFileSync(target));
  return true;
}
module.exports={handle,serve,read,validate,storyId,csv,purchaseLinks,thumbnail};
