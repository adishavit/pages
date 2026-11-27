const {JSDOM,VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync(require("path").join(__dirname,"../../bus484/index.html"),"utf8");
const leaflet=fs.readFileSync(require.resolve("leaflet/dist/leaflet.js"),"utf8");
html=html.replace(/<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/,()=>"<script>"+leaflet+"</script>");
const OLD_RELAY=process.argv[2]==="old";
const now=Date.now(),H=3600e3,iso=ms=>new Date(ms).toISOString().replace(".000Z","+00:00"),py=ms=>new Date(ms+2*H).toISOString().slice(0,19).replace("T"," ")+"+02:00";
const hourStart=Math.floor(now/H)*H, offs=[0,101,198,346,446,674,831,2519,2721,2939,2999,3053];
const S=[[20001,32.083157,34.796089],[21705,32.080071,34.795266],[21472,32.074584,34.790607],[20728,32.070002,34.787954],[20750,32.065556,34.783121],[20353,32.055692,34.783286],[25069,32.046861,34.784605],[5524,31.800293,35.077409],[640,31.80033,35.126238],[5664,31.799962,35.148045],[5827,31.802479,35.149484],[2454,31.804484,35.151863]];
// route polyline = straight segments between stops (same as mock OSRM)
const P=S.map(s=>[s[1],s[2]]); const hav=(a,b)=>{const R=6371e3,t=Math.PI/180,dl=(b[0]-a[0])*t,dn=(b[1]-a[1])*t;const h=Math.sin(dl/2)**2+Math.cos(a[0]*t)*Math.cos(b[0]*t)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const cum=[0];for(let i=1;i<P.length;i++)cum.push(cum[i-1]+hav(P[i-1],P[i]));const LEN=cum[cum.length-1];
const at=a=>{a=Math.max(0,Math.min(LEN,a));let i=1;while(i<cum.length-1&&cum[i]<a)i++;const f=(a-cum[i-1])/(cum[i]-cum[i-1]);return[P[i-1][0]+(P[i][0]-P[i-1][0])*f,P[i-1][1]+(P[i][1]-P[i-1][1])*f];};
const KARL=cum[4]; const speedAt=a=>(a>KARL-900&&a<KARL+600)?1.8:(a<cum[6]?7:20);   // jam around Karliback
const probes=[]; // {veh,t,lat,lon,bearing}
for(let v=0;v<60;v++){ let a=200+(v/60)*4800; const pts=[]; for(let k=0;k<16;k++){const t=now-(15-k)*60000-8*60000; const p=at(a); pts.push({veh:'C'+v,t,lat:p[0],lon:p[1],bearing:0}); a+=speedAt(a)*60;} probes.push(...pts);}
for(let v=0;v<45;v++){ let a=(v/45)*LEN*0.97+200; const dir=v%9===0?-1:1; const cross=v%11===0;
  const pts=[]; for(let k=0;k<16;k++){ const t=now-(15-k)*60000-8*60000; const p=at(a); pts.push({veh:"P"+v,t,lat:p[0]+(cross?0.003:0),lon:p[1],bearing:dir>0?90:270}); a+=dir*speedAt(a)*60; }
  probes.push(...pts);}
const DW=[]; for(let v=0;v<12;v++){ const sa=v%2?cum[2]:3800; const t0=now-(14-v)*60000; const p=at(sa), q=at(sa+400);
  DW.push({veh:'D'+v,t:t0,lat:p[0],lon:p[1],bearing:0,ds:4},{veh:'D'+v,t:t0+60000,lat:p[0],lon:p[1],bearing:0,ds:4},{veh:'D'+v,t:t0+120000,lat:q[0],lon:q[1],bearing:90,ds:300}); }
probes.push(...DW);
const st={probeReqs:0,direct:0};
const vc=new VirtualConsole(); vc.on("jsdomError",e=>{ if(!/navigation/i.test(e.message)) console.log("jsdomError:",e.message.slice(0,200)); });
const dom=new JSDOM(html,{url:"http://videocortex.io/pages/bus484/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.SVGSVGElement.prototype.createSVGRect=function(){return {x:0,y:0,width:0,height:0}};
  w.fetch=async(u)=>{const ok=d=>({ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>d}); const bad=c=>({ok:false,status:c,type:"cors",headers:{get:()=>null},json:async()=>({})});
    if(u.includes("lat__greater_or_equal")){ st.probeReqs++; if(u.includes("workers.dev")&&OLD_RELAY) return bad(400); if(!u.includes("workers.dev")) st.direct++;
      const q=new URL(u).searchParams, b=["lat__greater_or_equal","lat__lower_or_equal","lon__greater_or_equal","lon__lower_or_equal"].map(k=>+q.get(k));
      {const rows=probes.filter(p=>p.lat>=b[0]&&p.lat<=b[1]&&p.lon>=b[2]&&p.lon<=b[3]); return u.includes("workers.dev")?ok({compact:1,rows:rows.map(p=>[p.veh,Math.round(p.t/1000),p.lat,p.lon,p.bearing,null])}):ok(rows.map((p,i)=>({id:i,recorded_at_time:iso(p.t),lat:p.lat,lon:p.lon,bearing:p.bearing,siri_ride__vehicle_ref:p.veh})));} }
    if(u.includes("gtfs_routes")) return ok([{id:1,line_ref:19094,route_short_name:"484",route_long_name:"a-תל אביב יפו<->b-מבשרת ציון-20",agency_name:"תנופה",route_mkt:"11484",route_direction:"2",route_alternative:"0"}]);
    if(u.includes("gtfs_rides")){const r=[];for(let k=-6;k<=4;k++){const s=hourStart+k*H;r.push({id:100+k,start_time:iso(s),end_time:iso(s+3053e3),journey_ref:`58${100+k}_231126`});}return ok(r);}
    if(u.includes("gtfs_ride_stops")) return ok(S.map((s,i)=>({stop_sequence:i+1,gtfs_stop__name:"stop"+(i+1)+(i===4?" קרליבך":""),gtfs_stop__city:"x",gtfs_stop__lat:s[1],gtfs_stop__lon:s[2],gtfs_stop__code:s[0],arrival_time:iso(hourStart+offs[i]*1000)})));
    if(u.includes("osrm")){const c=(u.includes("/osrm/")?u.split("/osrm/")[1]:u.split("driving/")[1]).split("?")[0].split(";").map(x=>x.split(",").map(Number));return ok({code:"Ok",routes:[{distance:LEN,geometry:{coordinates:c}}]});}
    if(u.includes("vehicle_locations")){ const r=[]; for(let i=0;i<6;i++){const p=at(800+i*120);r.push({id:i,recorded_at_time:iso(now-(9+6-i)*60000),lat:p[0],lon:p[1],bearing:200,siri_ride__vehicle_ref:"222",siri_ride__scheduled_start_time:iso(hourStart)});} return ok(r);}
    if(u.includes("workers.dev")) return ok({errors:null,timestamp:py(now),visits:{}});
    if(u.includes("version.json")) return ok({version:"v17"});
    return ok([]);};
}});
const w=dom.window,d=w.document,txt=id=>d.getElementById(id).textContent.replace(/\s+/g," ").trim();
(async()=>{ await new Promise(r=>setTimeout(r,3000));
  w.eval("vehicles.clear();buildProfile()");
  console.log("PROBEINFO:",w.eval("probeInfo"));
  const lv=a=>w.eval(`cellLevel(Math.floor(${a}/prof.C))`), sp=a=>w.eval(`Math.round(3.6/prof.pace[Math.floor(${a}/prof.C)])`), pl=a=>w.eval(`Math.round(3.6/prof.plan[Math.floor(${a}/prof.C)])`);
  console.log("at our stop3 (",Math.round(cum[2]),"m): speed",sp(cum[2]),"plan(running)",pl(cum[2]),"level",lv(cum[2]));
  console.log("at other line's stop (3800 m): speed",sp(3800),"plan",pl(3800),"level",lv(3800));
  console.log("jam still found:",w.eval(`JSON.stringify(trafficRuns().filter(r=>r.lv===2).map(r=>[Math.round(r.a0),Math.round(r.a1)]))`),"truth",Math.round(KARL-900),Math.round(KARL+600));
  console.log("travelTime 3.1->4.4 km (no stop between):",w.eval("Math.round(travelTime(3100,4400).t)"),"| 0.5->1.4 km (1 stop between):",w.eval("Math.round(travelTime(500,1400).t)"),"vs run only",w.eval("Math.round(runTime(500,1400).t)"));
  const s2=w.eval("stops[1].along"); console.log("advance from 50 m before stop2 by 5/15/30 s:",[5,15,30].map(t=>Math.round(w.eval(`advance(${s2-50},${t})`)-s2)).join(", "),"m relative to stop (pauses at 0 for 20 s)");
  console.log("TRAFFIC:",txt("traffic"));
  console.log("ERRORS:",w.eval("LOG").filter(l=>/JS error|Unhandled/.test(l)));process.exit(0);})();