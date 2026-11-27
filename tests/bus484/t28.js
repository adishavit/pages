// Stride hangs (never answers), relay live works: page must draw route + live bus at once
const {JSDOM}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync(require("path").join(__dirname,"../../bus484/index.html"),"utf8");
const leaflet=fs.readFileSync(require.resolve("leaflet/dist/leaflet.js"),"utf8");
html=html.replace(/<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/,()=>"<script>"+leaflet+"</script>");
const now=Date.now(), py=ms=>new Date(ms+2*3600e3).toISOString().slice(0,19).replace("T"," ")+"+02:00";
const dom=new JSDOM(html,{url:"http://videocortex.io/pages/bus484/",runScripts:"dangerously",pretendToBeVisual:true,beforeParse(w){
  w.SVGSVGElement.prototype.createSVGRect=()=>({});
  w.fetch=(u,o={})=>{ const ok=d=>Promise.resolve({ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>d});
    if(u.includes("workers.dev/2")||/workers\.dev\/\d+$/.test(u)) return ok({errors:null,timestamp:py(now),visits:{"20750":[{line_id:19094,line_name:"484",vehicle_ref:"111",timestamp:py(now-30000),location:{lat:32.07,lon:34.79},eta:py(now+300000)}]}});
    if(u.includes("version.json")) return ok({version:"v40"});
    return new Promise((res,rej)=>{ if(o.signal) o.signal.addEventListener("abort",()=>rej(Object.assign(new Error("aborted"),{name:"AbortError"}))); });   // hang
  };}});
const w=dom.window,t=id=>w.document.getElementById(id).textContent.replace(/\s+/g," ").trim();
setTimeout(()=>{console.log("after 1.5 s: status:",t("status"),"| strip stations:",w.document.querySelectorAll("#stripIn .sd").length,"| strip buses:",w.document.querySelectorAll(".sbus").length,"| hero:",t("heroTxt"));
  console.log("errors:",w.eval("LOG").filter(l=>/JS error|Unhandled/.test(l))); process.exit(0);},1500);
