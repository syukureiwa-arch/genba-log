/* 開発用の静的サーバ。file:// で開くと IndexedDB や Service Worker が
   本番と違う挙動になるため、確認は必ず http:// 経由で行う。
     node dev-server.js            → http://localhost:8777/
     node dev-server.js . 3000     → ポート変更 */
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(process.argv[2]||'.');
const PORT=+(process.argv[3]||8777);
const TYPES={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json',
  '.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/index.html';
  const fp=path.resolve(ROOT,'.'+p);
  if(fp!==ROOT&&!fp.startsWith(ROOT+path.sep)){ res.writeHead(403); return res.end('403'); }
  fs.readFile(fp,(e,b)=>{
    if(e){ res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); return res.end('404'); }
    /* Service Worker のスクリプトは no-store だと登録に失敗することがある。
       毎回検証させたいだけなので no-cache を使う。 */
    const isSW=path.basename(fp)==='sw.js';
    res.writeHead(200,{'Content-Type':TYPES[path.extname(fp).toLowerCase()]||'application/octet-stream',
      'Cache-Control':isSW?'no-cache':'no-store'});
    res.end(b);
  });
}).listen(PORT,()=>console.log('serving '+ROOT+'\n  http://localhost:'+PORT+'/'));
