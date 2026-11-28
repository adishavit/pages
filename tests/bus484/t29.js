const {JSDOM}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync(require("path").join(__dirname,"../../bus484/index.html"),"utf8");
const leaflet=fs.readFileSync(require.resolve("leaflet/dist/leaflet.js"),"utf8");
html=html.replace(/<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/,()=>"<script>"+leaflet+"</script>");
const now=Date.now(),H=3600e3,iso=ms=>new Date(ms).toISOString().replace(".000Z","+00:00");
const today=new Date().toLocaleDateString("sv",{timeZone:"Asia/Jerusalem"}), tmr=new Date(now+86400000).toLocaleDateString("sv",{timeZone:"Asia/Jerusalem"});
const S=[[20001,32.083157,34.796089],[21705,32.080071,34.795266],[21472,32.074584,34.790607],[20728,32.070002,34.787954],[20750,32.065556,34.783121],[20353,32.055692,34.783286],[25069,32.046861,34.784605],[5524,31.800293,35.077409],[640,31.80033,35.126238],[5664,31.799962,35.148045],[5827,31.802479,35.149484],[2454,31.804484,35.151863]];
const offs=[0,101,198,346,446,674,831,2519,2721,2939,2999,3053];
const tmrFirst=Date.parse(tmr+"T05:00:00Z");
const dom=new JSDOM(html,{url:"http://videocortex.io/pages/bus484/",runScripts:"dangerously",pretendToBeVisual:true,beforeParse(w){
  w.SVGSVGElement.prototype.createSVGRect=()=>({});
  w.fetch=async(u)=>{const ok=d=>({ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>d});
    if(u.includes("gtfs_routes")) return ok([{id:u.includes(tmr)?2:1,line_ref:19094,route_short_name:"484",route_long_name:"a<->b",agency_name:"t",route_mkt:"1",route_direction:"2",route_alternative:"0"}]);
    if(u.includes("gtfs_rides")){ if(u.includes("gtfs_route_id=2")) return ok([{id:9,start_time:iso(tmrFirst+H),end_time:iso(tmrFirst+2*H)},{id:8,start_time:iso(tmrFirst),end_time:iso(tmrFirst+H)}]);
      return ok([{id:1,start_time:iso(now-4*H),end_time:iso(now-3*H),journey_ref:"1_1"},{id:2,start_time:iso(now-2*H),end_time:iso(now-1.1*H),journey_ref:"2_1"}]); }
    if(u.includes("gtfs_ride_stops")) return ok(S.map((s,i)=>({stop_sequence:i+1,gtfs_stop__name:"stop"+(i+1),gtfs_stop__city:"x",gtfs_stop__lat:s[1],gtfs_stop__lon:s[2],gtfs_stop__code:s[0],arrival_time:iso(now-2*H+offs[i]*1000)})));
    if(u.includes("vehicle_locations")&&!u.includes("lat__")) return ok([{id:1,recorded_at_time:iso(now-20*60000),lat:31.80448,lon:35.15186,siri_ride__vehicle_ref:"111",siri_ride__scheduled_start_time:iso(now-2*H)}]);   // parked at terminus
    if(u.includes("workers.dev")&&/\/\d+$/.test(u)) return ok({errors:null,timestamp:new Date(now).toISOString(),visits:{}});
    if(u.includes("version.json")) return ok({version:"v41"});
    return ok([]);};}});
const w=dom.window,t=id=>(w.document.getElementById(id)||{textContent:"(removed)"}).textContent.replace(/\s+/g," ").trim();
setTimeout(()=>{console.log("STATUS:",t("status")); console.log("HERO:",t("heroStop"),"|",t("heroMin"),"|",t("heroTxt"),"|",t("heroNext"));
 console.log("BUSES:",t("buses")); console.log("expected tomorrow at Karliback:",new Date(tmrFirst+446000).toLocaleTimeString("he-IL",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit"}));
 const want=new Date(tmrFirst+446000).toLocaleTimeString("he-IL",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit"}), FAIL=t("hero").includes(want)?[]:["hero does not show tomorrow's first bus "+want];
 console.log("strip buses:",w.document.querySelectorAll(".sbus").length); console.log("ERRORS:",JSON.stringify(w.eval("LOG").filter(l=>/JS error|Unhandled/.test(l)).concat(FAIL))); process.exit(0);},2000);
