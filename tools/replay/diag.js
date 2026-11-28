// Why is a cell red? Rebuild the app's traffic picture for a time window from Stride probe rows and list, per red/orange run, who contributed.
// Usage: NODE_USE_ENV_PROXY=1 node diag.js <line> <ref> <fromISO> <toISO>
const {JSDOM}=require("jsdom"), fs=require("fs"), path=require("path"), crypto=require("crypto");
const [LINE,REF,FROM,TO]=process.argv.slice(2);
const APP=path.join(__dirname,"../../bus484/index.html"), CACHE="/home/claude/lab/cache";
let html=fs.readFileSync(APP,"utf8");
const leaflet=fs.readFileSync(require.resolve("leaflet/dist/leaflet.js"),"utf8");
html=html.replace(/<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/,()=>"<script>"+leaflet+"</script>");
async function cf(u,o={},raw){
  if(/version\.json/.test(u)) return {ok:true,status:200,headers:{get:()=>null},json:async()=>({version:"lab"}),text:async()=>"{}"};
  if(!raw&&/siri_vehicle_locations\/list\?(?!.*siri_rides__ids)/.test(u)||/workers\.dev\/\d+$/.test(u)) return {ok:true,status:200,headers:{get:()=>null},json:async()=>[],text:async()=>"[]"};
  const key=crypto.createHash("sha1").update((o.method||"GET")+u+(o.body||"")).digest("hex"), f=path.join(CACHE,key); let body;
  if(fs.existsSync(f)) body=fs.readFileSync(f,"utf8"); else { const r=await fetch(u,{method:o.method||"GET",body:o.body,headers:o.headers}); body=await r.text(); if(!r.ok) return {ok:false,status:r.status,headers:{get:()=>null},json:async()=>JSON.parse(body),text:async()=>body}; fs.writeFileSync(f,body); }
  return {ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>JSON.parse(body),text:async()=>body};
}
const dom=new JSDOM(html,{url:`https://videocortex.io/pages/bus484/?line=${LINE}&ref=${REF}`,runScripts:"dangerously",pretendToBeVisual:true,
  beforeParse(w){ w.SVGSVGElement.prototype.createSVGRect=()=>({}); w.fetch=cf; w.console.log=()=>{}; }});
const w=dom.window, E=s=>w.eval(s), sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  for(let i=0;i<120;i++){ await sleep(1000); const a=JSON.parse(E("JSON.stringify([typeof stops!=='undefined'&&stops.length,routePts.length,sections.length,!!road])")); if(a[0]>1&&a[1]>1&&a[2]>0&&a[3]) break; }
  await sleep(4000);
  E("clearTimeout(timer); window.refresh=()=>{}; probeBusy=true; probeAt=Date.now()+1e10; vehicles.clear();");
  const secs=JSON.parse(E("JSON.stringify(sections.map(s=>({i:s.i,box:s.box})))")); let rows=[];
  for(const s of secs){ const b=s.box;
    const u=`https://open-bus-stride-api.hasadna.org.il/siri_vehicle_locations/list?lat__greater_or_equal=${b[0].toFixed(5)}&lat__lower_or_equal=${b[1].toFixed(5)}&lon__greater_or_equal=${b[2].toFixed(5)}&lon__lower_or_equal=${b[3].toFixed(5)}&recorded_at_time_from=${encodeURIComponent(FROM)}&recorded_at_time_to=${encodeURIComponent(TO)}&limit=1000`;
    try{ const r=await cf(u,{},true); rows.push(...await r.json()); }catch(e){ console.error("box",s.i,e.message); } }
  console.error("rows",rows.length);
  w.__rows=rows;
  const res=JSON.parse(E(`(()=>{ probeRows=__rows; vehicles.clear(); buildProfile();
    const C=prof.C, {pairs}=probePairs(probeRows);
    const cells=[]; for(let k=0;k<prof.n;k++){ const lv=cellLevel(k); cells.push({k,lv,v:+(3.6/prof.pace[k]).toFixed(1),pl:+(3.6/prof.plan[k]).toFixed(1),conf:+prof.conf[k].toFixed(2)}); }
    // pairs per cell: distinct moving vehicles (>=3 km/h pair speed)
    const per=new Map(); for(const o of pairs){ const dt=(o.t1-o.t0)/1000, sp=(o.a1-o.a0)/dt*3.6; const k0=Math.floor(o.a0/C),k1=Math.floor(o.a1/C); for(let k=k0;k<=k1;k++){ if(!per.has(k)) per.set(k,[]); per.get(k).push(+sp.toFixed(1)); } }
    return JSON.stringify({L:routeLen(),cells,per:[...per],pairs:pairs.length}); })()`));
  const per=new Map(res.per); let runs=[],cur=null;
  for(const c of res.cells){ if(c.lv===2||c.lv===1){ const lv=c.lv; if(cur&&cur.lv===lv&&c.k===cur.k1+1) cur.k1=c.k; else { cur={lv,k0:c.k,k1:c.k}; runs.push(cur);} } else cur=null; }
  console.log(`route ${Math.round(res.L)} m, pairs ${res.pairs}; runs:`);
  for(const r of runs){ const len=(r.k1-r.k0+1)*100; if((r.lv===2&&len<200)||(r.lv===1&&len<300)) continue;
    const sp=[]; for(let k=r.k0;k<=r.k1;k++) sp.push(...(per.get(k)||[])); sp.sort((a,b)=>a-b);
    const c0=res.cells[r.k0]; console.log(`${r.lv===2?"RED":"ORG"} ${r.k0*100}-${(r.k1+1)*100} m: ${len} m, app ${c0.v} km/h vs plan ${c0.pl}, ${sp.length} pair-samples, pair speeds min/med/max ${sp[0]}/${sp[sp.length>>1]}/${sp[sp.length-1]}, <3km/h: ${sp.filter(x=>x<3).length}`); }
  process.exit(0);
})();
