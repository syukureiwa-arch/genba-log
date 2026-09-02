/* sw.js のロジックを Node 上で動かして確かめる。
   ブラウザのプレビュー枠では Service Worker の登録自体が塞がれているため。 */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SWPATH=process.argv[2]||require('path').join(__dirname,'sw.js');
const SW=fs.readFileSync(SWPATH,'utf8');
const ORIGIN='https://example.test';

let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ok   '+m);} else {fail++;console.log('  FAIL '+m);} };

function makeEnv(){
  const store=new Map();                       // cacheName -> Map(urlString -> {body,ok})
  const norm=u=>new URL(u,ORIGIN+'/').toString();
  const keyOf=r=>norm(typeof r==='string'?r:r.url);

  class FakeCache{
    constructor(n){ this.n=n; if(!store.has(n)) store.set(n,new Map()); }
    get m(){ return store.get(this.n); }
    async addAll(list){ for(const u of list){ const res=await env.fetch(norm(u)); if(!res||!res.ok) throw new Error('addAll failed '+u); this.m.set(norm(u),{body:res._body,ok:true}); } }
    async put(k,res){ this.m.set(keyOf(k),{body:res._body,ok:true}); }
    async match(k){ const v=this.m.get(keyOf(k)); return v?mkRes(v.body,200):undefined; }
    async keys(){ return [...this.m.keys()].map(u=>({url:u})); }
  }
  const caches={
    async open(n){ return new FakeCache(n); },
    async keys(){ return [...store.keys()]; },
    async delete(n){ return store.delete(n); }
  };
  const mkRes=(body,status)=>({_body:body,ok:status>=200&&status<300,status,type:'basic',
    clone(){return mkRes(body,status);}, text(){return Promise.resolve(body);}});

  const env={
    store, caches, mkRes, offline:false, served:{}, fetchLog:[],
    async fetch(req){
      const u=keyOf(req);
      env.fetchLog.push(u);
      if(env.offline) throw new TypeError('Failed to fetch');
      const p=new URL(u).pathname;
      const key=(p==='/')?'/index.html':p;          /* 実サーバと同じく / は本体を返す */
      if(env.served[key]!==undefined) return mkRes(env.served[key],200);
      return mkRes('404',404);
    }
  };

  const handlers={};
  const self={
    location:{origin:ORIGIN, href:ORIGIN+'/sw.js'},
    addEventListener:(t,fn)=>{handlers[t]=fn;},
    skipWaiting:async()=>{env.skipWaited=true;},
    clients:{claim:async()=>{env.claimed=true;}},
    caches, fetch:(...a)=>env.fetch(...a), Response:function(b,i){return mkRes(b,(i&&i.status)||200);}
  };
  const ctx={self, caches, fetch:(...a)=>env.fetch(...a), URL, Response:self.Response,
    Promise, console, setTimeout, TypeError};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(SW,ctx,{filename:'sw.js'});
  env.handlers=handlers;
  return env;
}

const evt=()=>{ const w=[]; return {waits:w, waitUntil:p=>w.push(p)}; };
const fire=async(env,type,extra)=>{ const e={...evt(),...extra}; await env.handlers[type](e); await Promise.all(e.waits); return e; };

(async()=>{
  const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png'];

  console.log('\n[1] install で必要なファイルを全部キャッシュする');
  let env=makeEnv();
  ASSETS.forEach(p=>env.served[p]='V1:'+p);
  await fire(env,'install');
  const cacheName=[...env.store.keys()][0];
  const cached=[...env.store.get(cacheName).keys()].map(u=>new URL(u).pathname).sort();
  ok(cacheName==='genba-log-v1','キャッシュ名が genba-log-v1 ('+cacheName+')');
  ok(JSON.stringify(cached)===JSON.stringify([...ASSETS].sort()),'5件とも入った: '+cached.join(' '));
  ok(env.skipWaited===true,'skipWaiting が呼ばれる');

  console.log('\n[2] activate で古い版のキャッシュだけ消す');
  env.store.set('genba-log-v0',new Map([['x',{body:'old'}]]));
  env.store.set('other-app-cache',new Map([['y',{body:'keep'}]]));
  await fire(env,'activate');
  const left=[...env.store.keys()].sort();
  ok(!left.includes('genba-log-v0'),'古い genba-log-v0 は消える');
  ok(left.includes('genba-log-v1'),'今の版は残る');
  ok(left.includes('other-app-cache'),'関係ないキャッシュは触らない');
  ok(env.claimed===true,'clients.claim が呼ばれる');

  console.log('\n[3] オンライン：起動はキャッシュから即返し、裏で取り直す');
  env.served['/index.html']='V2:更新後';   /* アプリを新しくして再配置した想定 */
  env.fetchLog=[];
  let res=await (async()=>{ let out; await fire(env,'fetch',{request:{method:'GET',url:ORIGIN+'/',mode:'navigate'},respondWith:p=>{out=p;}}); return out; })();
  ok(await (await res).text()==='V1:/index.html','まず古いキャッシュを即返す（起動が速い）');
  await new Promise(r=>setTimeout(r,20));
  ok(env.fetchLog.length===1,'裏で取り直している');

  console.log('\n[4] 次の起動では新しい版になっている');
  res=await (async()=>{ let out; await fire(env,'fetch',{request:{method:'GET',url:ORIGIN+'/',mode:'navigate'},respondWith:p=>{out=p;}}); return out; })();
  ok(await (await res).text()==='V2:更新後','更新が反映される');

  console.log('\n[5] オフラインでも起動できる');
  env.offline=true;
  res=await (async()=>{ let out; await fire(env,'fetch',{request:{method:'GET',url:ORIGIN+'/',mode:'navigate'},respondWith:p=>{out=p;}}); return out; })();
  ok(await (await res).text()==='V2:更新後','電波がなくてもアプリが返る');

  console.log('\n[6] オフラインで初回（キャッシュ無し）は案内を出す');
  const env2=makeEnv(); env2.offline=true;
  res=await (async()=>{ let out; await fire(env2,'fetch',{request:{method:'GET',url:ORIGIN+'/',mode:'navigate'},respondWith:p=>{out=p;}}); return out; })();
  const r6=await res;
  ok(r6.status===503,'503 を返す');
  ok(/オフラインです/.test(r6._body),'日本語の案内が出る');

  console.log('\n[7] 手を出さないもの');
  let called=false;
  await fire(env,'fetch',{request:{method:'POST',url:ORIGIN+'/x',mode:'cors'},respondWith:()=>{called=true;}});
  ok(!called,'GET 以外は素通し');
  called=false;
  await fire(env,'fetch',{request:{method:'GET',url:'https://other.example/a.js',mode:'cors'},respondWith:()=>{called=true;}});
  ok(!called,'他所のオリジンは素通し');

  console.log('\n'+(fail?'FAILED: '+fail+' 件':'すべて通過')+'（'+pass+' 件成功）');
  process.exit(fail?1:0);
})();
