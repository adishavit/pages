// Every-station replay of the bus484 congestion model, using the app's own code (bus484/index.html) in jsdom.
// For each trip of the line, as the bus passes each station (and the midpoint of long stretches): rebuild the traffic profile from the positions published by then
// (raw feed, 1 min publishing delay), predict the bus's arrival at every later station (+ extra points on long gaps),
// and compare with when it actually got there (interpolated between its own fixes). Writes out/<line>.jsonl
// Usage: NODE_USE_ENV_PROXY=1 node replay.js <line> <ref> <day> [<day> ...]
const {JSDOM}=require("jsdom"), fs=require("fs"), zlib=require("zlib"), path=require("path"), crypto=require("crypto");
const [LINE,REF,...DAYS]=process.argv.slice(2);
const APP=process.env.APP||path.join(__dirname,"../../bus484/index.html");
const LAG=60e3, WIN=25*60e3, MAXGAP=180e3, MIDGAP=3000, HORIZON=90*60e3;
const DATA=process.env.DATA||__dirname, CACHE=path.join(DATA,"cache"); fs.mkdirSync(CACHE,{recursive:true}); fs.mkdirSync(path.join(DATA,"out"),{recursive:true});

// ---------- boot the app with real network for timetable / stops / road shape, cached on disk ----------
let html=fs.readFileSync(APP,"utf8");
const leaflet=fs.readFileSync(require.resolve("leaflet/dist/leaflet.js"),"utf8");
html=html.replace(/<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"[^>]*><\/script>/,()=>"<script>"+leaflet+"</script>");
async function cachedFetch(u,o={}){
  if(/version\.json/.test(u)) return {ok:true,status:200,headers:{get:()=>null},json:async()=>({version:"lab"}),text:async()=>"{}"};
  if(/siri_vehicle_locations\/list\?(?!.*siri_rides__ids)/.test(u)||/workers\.dev\/\d+$/.test(u))   // live polling: nothing
    return {ok:true,status:200,headers:{get:()=>null},json:async()=>[],text:async()=>"[]"};
  const key=crypto.createHash("sha1").update((o.method||"GET")+u+(o.body||"")).digest("hex"), f=path.join(CACHE,key);
  let body;
  if(fs.existsSync(f)) body=fs.readFileSync(f,"utf8");
  else { const r=await fetch(u,{method:o.method||"GET",body:o.body,headers:o.headers});
    body=await r.text(); if(!r.ok) return {ok:false,status:r.status,headers:{get:()=>null},json:async()=>JSON.parse(body),text:async()=>body};
    fs.writeFileSync(f,body); }
  return {ok:true,status:200,type:"cors",headers:{get:()=>null},json:async()=>JSON.parse(body),text:async()=>body};
}
const dom=new JSDOM(html,{url:`https://videocortex.io/pages/bus484/?line=${LINE}&ref=${REF}`,runScripts:"dangerously",pretendToBeVisual:true,
  beforeParse(w){ w.SVGSVGElement.prototype.createSVGRect=()=>({}); w.fetch=cachedFetch; w.console.log=()=>{}; }});
const w=dom.window, E=s=>w.eval(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function loadDay(day,keep){   // only rows that pass keep(), parsed line by line (a day is ~3 M rows)
  const p=path.join(DATA,"raw",day+".jsonl.gz"); if(!fs.existsSync(p)) return null;
  const buf=zlib.gunzipSync(fs.readFileSync(p)), out=[]; let i=0;
  while(i<buf.length){ let j=buf.indexOf(10,i); if(j<0) j=buf.length; if(j>i){ const r=JSON.parse(buf.toString("utf8",i,j)); if(keep(r)) out.push(r); } i=j+1; }
  return out;
}

(async()=>{
  for(let i=0;i<120;i++){ await sleep(1000); const st=E("JSON.stringify([typeof stops!=='undefined'&&stops.length,routePts.length,sections.length,!!road])");
    if(i%10===9) process.stderr.write("boot "+i+" "+st+"\n"); const a=JSON.parse(st); if(a[0]>1&&a[1]>1&&a[2]>0&&a[3]) break; }
  await sleep(4000);                                          // traced road / stop zones
  E("clearTimeout(timer); window.refresh=()=>{}; probeBusy=true; probeAt=Date.now()+1e10; vehicles.clear();");
  // speed: the same positions are re-matched to the route at every moment; memoise the matcher (same inputs, same result)
  E(`(()=>{ const memo=new Map(), orig=snapHint;
    snapHint=function(lat,lon,prev,brg,strict){ const k=lat+","+lon+","+(prev==null?"-":Math.round(prev))+","+(brg==null?"-":Math.round(brg))+","+!!strict;
      let v=memo.get(k); if(!v){ v=orig(lat,lon,prev,brg,strict); if(memo.size>2e6) memo.clear(); memo.set(k,v); } return {...v}; };
    window.__prof=()=>{ const t0=performance.now(); probePairs(probeRows); const t1=performance.now(); buildProfile(); return [t1-t0,performance.now()-t1]; }; })()`);
  const L=E("routeLen()"), boxes=E("JSON.stringify(sections.map(s=>s.box))");
  const B=JSON.parse(boxes);
  const inBox=(la,lo)=>B.some(([a,b,c,d])=>la>=a&&la<=b&&lo>=c&&lo<=d);
  // points: every station, plus the midpoint of any stretch longer than MIDGAP. Predictions are made as the bus passes
  // each point (from what was published by then) for every later point.
  const st=JSON.parse(E("JSON.stringify(stops.map(s=>({code:s.code,along:s.along,off:s.off||0})))"));
  const targets=[{along:st[0].along,stop:true,off:st[0].off,code:st[0].code}]; for(let i=1;i<st.length;i++){ const a=st[i-1].along,b=st[i].along;
    if(b-a>MIDGAP) targets.push({along:(a+b)/2,stop:false});
    targets.push({along:b,stop:true,off:st[i].off,code:st[i].code}); }
  process.stderr.write(`${LINE} ref ${REF}: route ${Math.round(L)} m, ${st.length} stops, ${targets.length} targets, ${B.length} boxes\n`);
  const out=fs.createWriteStream(path.join(DATA,"out",`${LINE}${process.env.TAG||""}.jsonl`),{flags:"a"});
  w.__rows=[]; fs.mkdirSync(path.join(DATA,"snap"),{recursive:true});
  const snap=fs.createWriteStream(path.join(DATA,"snap",`${LINE}${process.env.TAG||""}.jsonl`),{flags:"a"});
  for(const day of DAYS){
    const tl=Date.now(); const raw=loadDay(day,r=>inBox(r[5],r[6])); process.stderr.write(`${day}: loaded ${raw?raw.length:0} corridor rows in ${((Date.now()-tl)/1000).toFixed(0)} s\n`); if(!raw){ process.stderr.write(`${day}: no data\n`); continue; }
    // corridor rows as the app's Stride rows
    const rows=[]; for(const r of raw){
      rows.push({recorded_at_time:new Date(r[0]).toISOString(),_t:r[0],_av:r[1]+LAG,lat:r[5],lon:r[6],bearing:r[7],siri_ride__vehicle_ref:r[2],
        distance_from_siri_ride_stop_meters:r[9],_line:r[3],_trip:r[4]}); }
    rows.sort((a,b)=>a._av-b._av);
    // our line's trips
    const trips=new Map(); for(const r of rows){ if(String(r._line)!==String(REF)) continue; const k=r.siri_ride__vehicle_ref+"|"+r._trip;
      (trips.get(k)||trips.set(k,[]).get(k)).push(r); }
    const ttf=path.join(DATA,"tt",`${REF}-${day}.json`), TT=fs.existsSync(ttf)?JSON.parse(fs.readFileSync(ttf,"utf8")):null; if(!TT) process.stderr.write(`${day}: no timetable file ${ttf}: errSched left empty\n`);
    let nTrips=0, nPred=0;
    const MAXT=+(process.env.MAXTRIPS||1e9), keys=[...trips.keys()].sort((a,b)=>+a.split("|")[1]-+b.split("|")[1]), every=Math.max(1,Math.ceil(keys.length/MAXT));
    const pick=new Set(keys.filter((_,i)=>i%every===0));
    for(const[k,fx0]of trips){ if(!pick.has(k)) continue;
      const fx=fx0.slice().sort((a,b)=>a._t-b._t); if(fx.length<10) continue;
      w.__fx=fx; E("for(const r of __fx) r._a=snap(r.lat,r.lon).along");
      if(Math.max(...fx.map(r=>r._a))<0.5*L) continue;
      // truth: interpolated passing time at each target, only where two fixes close in time bracket it
      const truth=targets.map(tg=>{ for(let i=1;i<fx.length;i++){ const p=fx[i-1],q=fx[i];
        if(p._a<tg.along&&q._a>=tg.along&&q._t-p._t<=MAXGAP&&q._a-p._a<3000) return p._t+(tg.along-p._a)/(q._a-p._a)*(q._t-p._t); } return null; });
      const tEnd=Math.max(...truth.filter(x=>x!=null)); if(!Number.isFinite(tEnd)) continue;
      nTrips++;
      const tripStart=fx[0]._trip, t0=Date.now(); let nm=0, np=0;
      const moments=truth.map((t,i)=>({t,i})).filter(o=>o.t!=null&&o.t<tEnd);
      for(const mo of moments){ const T=mo.t;
        let me=null; for(const r of fx) if(r._av<=T) me=r; if(!me||T-me._t>5*60e3) continue;
        const ahead=targets.map((tg,i)=>({tg,tr:truth[i]})).filter((o,i)=>i>mo.i&&o.tr!=null&&o.tr>T&&o.tg.along>me._a+100&&o.tr-T<=HORIZON);
        if(!ahead.length) continue;
        // probes published by T, recorded in the last WIN (all lines, our corridor)
        let lo=0,hi=rows.length; while(lo<hi){const m=(lo+hi)>>1; if(rows[m]._av<=T) lo=m+1; else hi=m;}
        const probe=[]; for(let i=lo-1;i>=0;i--){ const r=rows[i]; if(r._av<T-WIN-10*60e3) break; if(r._t>=T-WIN) probe.push(r); }
        w.__probe=probe; w.__q=ahead.map(o=>o.tg.along); w.__a0=me._a;
        const res=JSON.parse(E(`(()=>{ probeRows=__probe; vehicles.clear(); buildProfile();
          const m=__q.map(x=>travelTime(__a0,x).t), cov=__q.map(x=>runTime(__a0,x).probe);
          const P=prof; prof=null; const plan=__q.map(x=>travelTime(__a0,x).t); prof=P;
          return JSON.stringify({m,plan,cov,p:prof.pace.map(x=>+x.toFixed(3)),q:prof.conf.map(c=>c>=ASM.minConf?1:0).join("")}); })()`));
        snap.write(JSON.stringify({day,T,p:res.p,q:res.q})+"\n");   // the profile as it was at T (p = pace s/m per 100 m cell, q = 1 where measured): history for the forecast
        const hourIL=(new Date(T).getUTCHours()+2)%24;
        // when the bus sets off: the app's goTime rule (still within 300 m of the start: waits for its departure time,
        // or leaves now if it's late but still reporting there)
        const atStart=me._a<300, s0=tripStart||me._t;
        const go=!atStart?me._t:T<s0?s0:(T-me._t<3*60e3?T:Math.max(me._t,s0));
        ahead.forEach((o,i)=>{
          const sched=o.tg.stop&&TT&&TT[tripStart]&&TT[tripStart][o.tg.code]!=null?TT[tripStart][o.tg.code]:null;   // the trip's own scheduled time (ttfetch.py); none = not scored
          out.write(JSON.stringify({line:LINE,day,trip:k,T,hour:hourIL,at:Math.round(targets[mo.i].along),from:Math.round(me._a),to:Math.round(o.tg.along),stop:o.tg.stop,
            h:+((o.tr-T)/60e3).toFixed(2),age:Math.round((T-me._t)/1e3),
            atStart,err:+((go+res.m[i]*1000-o.tr)/60e3).toFixed(3),errPlan:+((go+res.plan[i]*1000-o.tr)/60e3).toFixed(3),
            errSched:sched!=null?+((sched-o.tr)/60e3).toFixed(3):null,measured:res.cov[i]})+"\n"); nPred++; np++;
        }); nm++;
      }
      process.stderr.write(`  ${day} trip ${nTrips}: ${nm} moments, ${np} predictions, ${((Date.now()-t0)/1000).toFixed(1)} s, probes/moment ~${w.__probe?w.__probe.length:0}\n`);
    }
    process.stderr.write(`${day}: ${trips.size} trips seen, ${nTrips} scored, ${nPred} predictions\n`);
  }
  out.end(); snap.end(); setTimeout(()=>process.exit(0),500);
})().catch(e=>{ console.error(e); process.exit(1); });
