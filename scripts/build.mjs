import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'dist');await fs.mkdir(out,{recursive:true});
for(const name of ['manifest.json','background.js','export.html','export.css'])await fs.copyFile(path.join(root,'extension',name),path.join(out,name));
for(const name of ['README.md','README.en.md','DESIGN.md','DESIGN.en.md','LICENSE'])await fs.copyFile(path.join(root,name),path.join(out,name));
await fs.mkdir(path.join(out,'docs/images'),{recursive:true});
await fs.copyFile(path.join(root,'docs/images/interactive-demo.png'),path.join(out,'docs/images/interactive-demo.png'));
await build({entryPoints:[path.join(root,'src/collector.js')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'collector.js'),target:['chrome120'],minify:true});
await build({entryPoints:[path.join(root,'src/export-job.js')],bundle:true,format:'esm',platform:'browser',outfile:path.join(out,'export.js'),target:['chrome120'],minify:true});
const runtimeBuild=await build({entryPoints:[path.join(root,'src/runtime.js')],bundle:true,format:'iife',globalName:'ChatGPTOffline',platform:'browser',outfile:path.join(out,'runtime.js'),target:['chrome120'],minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"'}});
const packages=[...new Set(Object.keys(runtimeBuild.metafile.inputs).map(name=>name.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort();
const notices=['Third-party runtime notices\nGenerated from packages included in the offline runtime.\n'];
for(const name of packages){const dir=path.join(root,'node_modules',name),pkg=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));notices.push(`\n=== ${name} ${pkg.version} — ${pkg.license||'see notices'} ===\n`);for(const file of (await fs.readdir(dir)).filter(file=>/^(?:licen[cs]e|copying|copyright)(?:\.|$)/i.test(file)))notices.push(await fs.readFile(path.join(dir,file),'utf8'));}
await fs.writeFile(path.join(root,'THIRD_PARTY_NOTICES.txt'),notices.join('\n'));
await fs.copyFile(path.join(root,'THIRD_PARTY_NOTICES.txt'),path.join(out,'THIRD_PARTY_NOTICES.txt'));
console.log('扩展构建完成：'+out);
