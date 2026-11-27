// v157: a refresh still running when the direction switches must not add old-direction buses (DIR_GEN guard)
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
const w=dom.window;
setTimeout(async()=>{
  const row=(v,id)=>({id,siri_ride__vehicle_ref:v,recorded_at_time:new Date(Date.now()-20000).toISOString(),lat:32.07,lon:34.79});
  w.eval(`fetchLive=()=>Promise.resolve([]); fetchStride=()=>new Promise(r=>{window.__res=r;}); strideGet=()=>new Promise(()=>{}); refresh.backfill=true;`);
  w.eval("DIR_GEN++; inFlight=false");               // retire the start-up refresh (its mocked Stride never answers)
  w.eval("vehicles.clear(); refresh()");              // old-direction refresh, waiting on Stride
  w.eval("DIR_GEN++; vehicles.clear();");            // what switchDirInPlace does before its own refresh
  w.eval(`fetchStride=()=>Promise.resolve([${JSON.stringify(row("NEW_DIR_BUS",2))}])`);
  w.__res([row("OLD_DIR_BUS",1)]);                    // the old answer arrives after the switch
  await new Promise(r=>setTimeout(r,500));
  const got=w.eval("[...vehicles.keys()].sort().join(',')");
  console.log("vehicles after switch:",got);
  const errs=got==="NEW_DIR_BUS"?[]:["old direction bus kept: "+got];
  console.log("ERRORS:",JSON.stringify(errs)); process.exit(0);
},2500);
