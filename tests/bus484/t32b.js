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
const w=dom.window,d=w.document,t=id=>(d.getElementById(id)||{textContent:"(removed)"}).textContent.replace(/\s+/g," ").trim();
setTimeout(()=>{
  console.log("btnMe hidden (http):",d.getElementById("btnMe").style.display==="none");
  console.log("diag closed:",!d.getElementById("diag").open,"| set pane order:",[...d.querySelectorAll("#p-set h3, #p-set summary")].map(e=>e.textContent.replace(/Reset|Copy/,"").trim()).join(" / "));
  d.getElementById("diag").open=true; d.getElementById("diag").dispatchEvent(new w.Event("toggle"));
  console.log("log filled on open:",d.getElementById("dbg").textContent.length>50);
  console.log("traffic:",JSON.stringify(d.getElementById("traffic").textContent.trim()),"| lineHint shown:",d.getElementById("lineHint").style.display!=="none");
  const sd=d.querySelector("#stripIn .sd:not(.mine)"); console.log("sd role:",sd.getAttribute("role"),sd.getAttribute("aria-label"));
  sd.dispatchEvent(new w.MouseEvent("click",{bubbles:true,detail:0})); console.log("AT click set stop:",w.eval("MY_STOP")===sd.dataset.code);
  console.log("errors:",w.eval("LOG").filter(l=>/JS error|Unhandled/.test(l))); process.exit(0);},2500);