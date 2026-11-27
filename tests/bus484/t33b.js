// v42 UI: board, pill, picker, direction label, first-run pulse
const {JSDOM}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync(require("path").join(__dirname,"../../bus484/index.html"),"utf8");
const leaflet=fs.readFileSync(require.resolve("leaflet/dist/leaflet.js"),"utf8");
html=html.replace(/<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/,()=>"<script>"+leaflet+"</script>");
const now=Date.now(), py=ms=>new Date(ms+2*3600e3).toISOString().slice(0,19).replace("T"," ")+"+02:00";
const stopQ=process.argv[2]||"";
const routes=[{id:1,line_ref:19094,route_short_name:"484",route_long_name:"x-תל אביב יפו<->y-מבשרת ציון",route_mkt:"10484",agency_name:"A",route_direction:"1",route_alternative:"0"},
 {id:2,line_ref:19095,route_short_name:"484",route_long_name:"y-מבשרת ציון<->x-תל אביב יפו",route_mkt:"10484",agency_name:"A",route_direction:"2",route_alternative:"0"}];
const dom=new JSDOM(html,{url:"http://videocortex.io/pages/bus484/"+stopQ,runScripts:"dangerously",pretendToBeVisual:true,beforeParse(w){
  w.SVGSVGElement.prototype.createSVGRect=()=>({});
  w.fetch=(u,o={})=>{ const ok=d=>Promise.resolve({ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>d});
    if(/workers\.dev\/\d+$/.test(u)) return ok({errors:null,timestamp:py(now),visits:{"20750":[{line_id:19094,line_name:"484",vehicle_ref:"111",timestamp:py(now-30000),location:{lat:32.07,lon:34.79},eta:py(now+300000)}]}});
    if(u.includes("version.json")) return ok({version:"v42"});
    if(u.includes("gtfs_routes/list")) return ok(routes);
    return new Promise((res,rej)=>{ if(o.signal) o.signal.addEventListener("abort",()=>rej(Object.assign(new Error("aborted"),{name:"AbortError"}))); });
  };}});
const w=dom.window,d=w.document,t=id=>d.getElementById(id).textContent.replace(/\s+/g," ").trim();
setTimeout(()=>{
  const r=w.eval(`(()=>{const s=myStop(); stops.forEach(x=>x.along=snap(x.lat,x.lon).along); const i=stops.indexOf(s); const pt=k=>[stops[k].lat,stops[k].lon]; const now=Date.now(); const rows=[]; let id=9000;
    const add=(veh,a,ago,live)=>{const [la,lo]=pt(a); rows.push({id:id++,siri_ride__vehicle_ref:veh,lat:la,lon:lo,recorded_at_time:new Date(now-ago*60000).toISOString(),live});};
    add("A",i-1,9,true); add("A",i+1,7,true); add("A",i+3,1,true);          // passed ~8 min ago
    add("B",i-1,4,false); add("B",i+1,2.5,false);                                     // passed ~3 min ago
    add("C",i+2,1,true);                                                                    // first seen past: 'before'
    const ad=merge(rows); render(); return {stop:s.name, along:s.along, ad, r0:rows[0], nm:new Date(newestMs).toISOString(), has:vehicles.has("A")};})()`);
  console.log(JSON.stringify(r));
  console.log("dbg:",w.eval("JSON.stringify({rp:routePts.length,sa:Math.round(myStop().along),A:[...vehicles.get(\"A\").values()].map(f=>Math.round(snap(f.lat,f.lon).along)),B:[...vehicles.get(\"B\").values()].map(f=>Math.round(snap(f.lat,f.lon).along))})"));
  console.log("passed:",JSON.stringify(w.eval("passedMyStop().map(g=>({ref:g.ref,ago:Math.round((Date.now()-g.t)/60000),approx:!!g.approx,before:!!g.before,further:g.further}))")));
  console.log("BOARD:",[...d.querySelectorAll("#board .brow, #board .nowln")].map(e=>e.textContent.replace(/\s+/g," ").trim()).join("\n       "));
  console.log("HERO:",t("heroMin"),"|",t("heroTxt"),"|",t("heroNext"));
  console.log("strip gone pills:",d.querySelectorAll(".sbus.gone").length,"| map gone markers:",d.querySelectorAll(".bm.gone").length);
  console.log("errors:",w.eval("LOG").filter(l=>/JS error|Unhandled/.test(l))); process.exit(0);},2500);