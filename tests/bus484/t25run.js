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
for(let v=0;v<45;v++){ let a=(v/45)*LEN*0.97+200; const dir=v%9===0?-1:1; const cross=v%11===0;
  const pts=[]; for(let k=0;k<16;k++){ const t=now-(15-k)*60000-8*60000; const p=at(a); pts.push({veh:"P"+v,t,lat:p[0]+(cross?0.003:0),lon:p[1],bearing:dir>0?90:270}); a+=dir*speedAt(a)*60; }
  probes.push(...pts);}
const st={probeReqs:0,direct:0};
const vc=new VirtualConsole(); vc.on("jsdomError",e=>{ if(!/navigation/i.test(e.message)) console.log("jsdomError:",e.message.slice(0,200)); });
const dom=new JSDOM(html,{url:"http://videocortex.io/pages/bus484/",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.SVGSVGElement.prototype.createSVGRect=function(){return {x:0,y:0,width:0,height:0}};
  w.fetch=async(u)=>{const ok=d=>({ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>d}); const bad=c=>({ok:false,status:c,type:"cors",headers:{get:()=>null},json:async()=>({})});
    if(u.includes("lat__greater_or_equal")){ st.probeReqs++; if(u.includes("workers.dev")&&OLD_RELAY) return bad(400); if(!u.includes("workers.dev")) st.direct++;
      const q=new URL(u).searchParams, b=["lat__greater_or_equal","lat__lower_or_equal","lon__greater_or_equal","lon__lower_or_equal"].map(k=>+q.get(k));
      {const rows=probes.filter(p=>p.lat>=b[0]&&p.lat<=b[1]&&p.lon>=b[2]&&p.lon<=b[3]); return u.includes("workers.dev")?ok({compact:1,rows:rows.map(p=>[p.veh,Math.round(p.t/1000),p.lat,p.lon,p.bearing])}):ok(rows.map((p,i)=>({id:i,recorded_at_time:iso(p.t),lat:p.lat,lon:p.lon,bearing:p.bearing,siri_ride__vehicle_ref:p.veh})));} }
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
(async()=>{await new Promise(r=>setTimeout(r,3000));
 const pos=()=>JSON.parse(w.eval("JSON.stringify(stops.map((s,i)=>+SX(i).toFixed(1)))"));
 const a=pos(); for(const f of [97,3,50]){ w.eval(`lensF=${f};lensK=1;renderStrip(lastModel)`); const x=pos(); console.log(`finger@${f}%:`,x.join(" "),"| first/last moved:",(x[0]-a[0]).toFixed(1),(x[x.length-1]-a[a.length-1]).toFixed(1),"| order kept:",x.every((v,i)=>i===0||v>x[i-1]),"| in 0..100:",x[0]>=0&&x[x.length-1]<=100); } w.eval("lensF=20;lensK=1;renderStrip(lastModel)"); const b=pos();
 const gaps=x=>x.slice(1).map((v,i)=>+(v-x[i]).toFixed(1));
 console.log("no lens  :",a.join(" ")); console.log("lens @20%:",b.join(" "));
 console.log("gaps before:",gaps(a).join(" ")); console.log("gaps after :",gaps(b).join(" "));
 console.log("order kept:",b.every((v,i)=>i===0||v>b[i-1]),"| ends fixed:",b[0]>=0&&b[b.length-1]<=100);
 const ok=[...w.document.querySelectorAll("#stripIn .sd")].map(e=>parseFloat(e.style.left).toFixed(1)).join(" ")===b.map(v=>v.toFixed(1)).join(" ");
 console.log("DOM uses lens positions:",ok,"| title chip:",w.document.getElementById("lineChip").innerHTML.replace(/<span class="num">.*?<\/span>/,""));
 w.eval("lensK=0;renderStrip(lastModel)"); console.log("after release == original:",JSON.stringify(pos())===JSON.stringify(a));
 console.log("ERRORS:",w.eval("LOG").filter(l=>/JS error|Unhandled/.test(l)));process.exit(0);})();