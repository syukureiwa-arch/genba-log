/* 現場記録アプリの Service Worker

   狙いは「電波が悪くても即座に起動すること」。
   そのため取り出しは stale-while-revalidate にしてある。
     1. キャッシュにあれば、まずそれを返す（オフラインでも起動できる）
     2. 裏で取り直してキャッシュを更新する（次回の起動から新しい版になる）

   アプリを更新した時は VERSION を上げること。
   古いキャッシュは activate で消える。 */
const VERSION='v6';
const CACHE='genba-log-'+VERSION;
const ASSETS=[
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await c.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(
      keys.filter(k=>k.startsWith('genba-log-')&&k!==CACHE).map(k=>caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  let url;
  try{ url=new URL(req.url); }catch(err){ return; }
  if(url.origin!==self.location.origin) return;   /* 他所への通信には手を出さない */

  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    /* 起動（アドレスを開く操作）は、どのURLでもアプリ本体を返す */
    const key=req.mode==='navigate'?'./index.html':req;

    const hit=await cache.match(key);
    const net=fetch(req).then(res=>{
      if(res&&res.ok&&res.type==='basic'){
        cache.put(key,res.clone()).catch(()=>{});
      }
      return res;
    }).catch(()=>null);

    if(hit){ e.waitUntil(net); return hit; }      /* まずキャッシュ、更新は裏で */
    const res=await net;
    if(res) return res;
    return new Response('オフラインです。一度オンラインで開くと、次からは電波がなくても使えます。',
      {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
