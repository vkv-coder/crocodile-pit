// ============================================================
// CROCODILE PIT — shared config
// Supabase project: Dhobi-digital
// ============================================================
const SUPABASE_URL  = "https://jqqnnkzozjskziaizajg.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcW5ua3pvempza3ppYWl6YWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mjk1ODAsImV4cCI6MjA4ODUwNTU4MH0.sEYeWnm0dvuw8bLSVnQhqmgV8LB-pELjpuVIa3Us1Gg";

const ADMIN_PIN = "croc@admin2026";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { eventsPerSecond: 20 } }
});

// ---------- number layout: 1 and 20 only at row start / row end ----------
function makeLayout(){
  const edges = [0,4,5,9,10,14,15,19];
  const a = edges[Math.floor(Math.random()*edges.length)];
  let b = a;
  while(b === a) b = edges[Math.floor(Math.random()*edges.length)];
  const mid = [];
  for(let n=2;n<=19;n++) mid.push(n);
  for(let i=mid.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [mid[i],mid[j]] = [mid[j],mid[i]];
  }
  const cells = new Array(20).fill(null);
  cells[a]=1; cells[b]=20;
  let k=0;
  for(let i=0;i<20;i++) if(cells[i]===null) cells[i]=mid[k++];
  return cells;
}

function fmtMs(ms){
  if(ms==null) return "--.--";
  const s = Math.floor(ms/1000), cs = Math.floor((ms%1000)/10), m = Math.floor(s/60);
  return (m ? m+":"+String(s%60).padStart(2,"0") : String(s).padStart(2,"0")) + "." + String(cs).padStart(2,"0");
}

// ---------- suggested scoring ----------
function suggestScoring(teamCount){
  const n = Math.max(2, teamCount||4);
  return {
    top:  n * 250,
    last: 250,
    mult: n <= 4 ? 100 : 50
  };
}

// evenly spaced ladder, top -> last
function pointsLadder(n, top, last){
  if(n === 1) return [top];
  const step = (top - last) / (n - 1);
  return Array.from({length:n}, (_,i) => Math.round(top - i*step));
}
