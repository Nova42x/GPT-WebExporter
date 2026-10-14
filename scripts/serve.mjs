import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(name==='/__integration/result'&&req.method==='POST'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const data=Buffer.concat(chunks);if(data.length>1024*1024){res.writeHead(413);return res.end();}
      JSON.parse(data.toString());await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await fs.writeFile(path.join(root,'artifacts/integration-result.json'),data);
      res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');
    }
    const mapped=name.startsWith('/c/')?'/artifacts/integration-fixture.html':name;
    const file=path.resolve(root,'.'+mapped);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(47831,'127.0.0.1',()=>console.log('Local test server: http://127.0.0.1:47831'));
