/* Catálogo cargado desde Firestore por runtime.js (antes estaba embebido acá). */
const DATA = window.CATALOG.courses;
const OFERTA = window.CATALOG.oferta;
/* Reglamento (departamentos, períodos, orientaciones, obligatorias): sale de las colecciones
   de Firestore, compilado en la misma foto que el catálogo (ver scripts/publicar.mjs). */
const REF = window.CATALOG.ref;
const DEPN = REF.DEPN;
const PERLBL = REF.PERLBL;
const PSEM = REF.PSEM;
const TEMA = REF.TEMA;
const RESERVED = new Set(REF.RESERVED);
const OBLIG = REF.OBLIG;
const ORI = REF.ORI;

const byKey = new Map(DATA.map(c => [c.dep+'-'+c.code, c]));
DATA.forEach(c => { c.key = c.dep+'-'+c.code; c.nn = c.name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); });
const twins = new Map();
DATA.forEach(c => { if(!twins.has(c.nn)) twins.set(c.nn, []); twins.get(c.nn).push(c.key); });
const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const cap1 = s => s.charAt(0)+s.slice(1).toLowerCase();
const niceName = n => { const s = n.toLowerCase().replace(/(^|[\s(.:\-—\/])([a-záéíóúñü])/g,(m,a,b)=>a+b.toUpperCase()); return s.replace(/\b(De|Del|La|Las|Los|Y|E|El|En|Por|Para|Con|A|Al|O)\b/g,w=>w.toLowerCase()).replace(/^./,x=>x.toUpperCase()); };

/* estado */
const SK = 'cpo-fixture-uba-v2';
const blank = () => ({ori:null, hist:{}, sel:{}, prac:0, pra:[], obl:[], idi:false, t:0, rev:0, prev:[], asked:false, fav:[], goal:0, toured:false, desde:''});
let S = blank();
let UI = {active:'sum', q:'', per:'', mod:'', dep:'', day:'', turno:'', doc:'', calp:'', cals:'2', of:'2', sec:{}, page:1, changing:false, carry:null, profiles:{}};
let ENV = {mode:'load', uid:null, name:'', admin:false, status:'', ready:false};
let DBX = null, DOC = null, USERX = null, LAST = {tier:null};
UI.cm = {q:'', k:'', pc:'', r:0, t:''};
UI.prF = {name:'', pts:4, st:'apr'};
let CM = {status:'idle', items:[], busy:false};
function adopt(r){
  const b = blank();
  if(r && typeof r==='object'){ ['ori','hist','sel','prac','pra','obl','idi','t','rev','prev','asked','fav','goal','toured','desde'].forEach(k=>{ if(r[k]!==undefined && r[k]!==null) b[k]=r[k]; }); b.ori = r.ori || null; }
  if(typeof b.sel!=='object') b.sel = {}; if(typeof b.hist!=='object') b.hist = {};
  if(!Array.isArray(b.obl)) b.obl = [];
  b.asked = !!b.asked; b.toured = !!b.toured; if(!Array.isArray(b.prev)) b.prev = [];
  b.fav = (Array.isArray(b.fav) ? b.fav : []).filter(k => byKey.has(k)).slice(0,60); b.goal = Math.max(0, Math.min(8, Math.round(+b.goal||0)));
  b.pra = (Array.isArray(b.pra) ? b.pra : []).filter(x => x && x.pts>=1 && x.pts<=19).map(x => ({id:String(x.id||newId()), pts:Math.round(+x.pts), st:ST[x.st]?x.st:'apr', name:String(x.name||'').slice(0,60)}));
  if(!b.pra.length && b.prac>0) b.pra = [{id:newId(), pts:Math.min(19,Math.round(+b.prac)), st:'apr', name:''}];
  b.prac = 0;
  b.prev = b.prev.filter(x => x && typeof x.name==='string' && x.pts>0 && x.b).map(x => ({id:String(x.id||newId()), b:x.b, name:x.name.slice(0,120), pts:Math.round(x.pts), year:x.year||0, dep:x.dep||'', ori:x.ori||null, src:x.src||null, k:x.k||null, of:x.of||null, p:x.p||null, tm:Array.isArray(x.tm)?x.tm:[]}));
  b.desde = /^\d{4}-[12]$/.test(b.desde) ? b.desde : '';
  // Un curso elegido que ya no está en la oferta vigente (cambió el cuatrimestre): si estaba
  // aprobado no se pierde, pasa a "materias anteriores" con la copia de datos guardada en el plan.
  const gone = (k, e) => !byKey.has(k) || !e || !byKey.get(k).periods.some(p=>p.id===e.p);
  const keep = (k, e, ori) => {
    if(!e || e.st!=='apr' || !e.b) return;
    const src = 'sel:'+k;
    if(b.prev.some(x => x.src===src && (x.ori||null)===(ori||null))) return;
    const pts = Math.round(+e.pts || PER_PTS[e.p] || 0); if(!(pts>0)) return;
    b.prev.push({id:newId(), b:e.b, name:String(e.n || k).slice(0,120), pts, year:e.y || new Date().getFullYear(), dep:e.d || k.split('-')[0], ori:ori||null, src});
  };
  Object.keys(b.sel).forEach(k => { const e = b.sel[k]; if(gone(k, e)){ keep(k, e, SPEC.has(e && e.b) ? b.ori : null); delete b.sel[k]; } else if(!ST[e.st]) e.st='plan'; });
  Object.keys(b.hist).forEach(o => { if(!ORI[o] || typeof b.hist[o]!=='object') delete b.hist[o]; else Object.keys(b.hist[o]).forEach(k=>{ const e = b.hist[o][k]; if(gone(k, e)){ if(e && SPEC.has(e.b)) keep(k, e, o); delete b.hist[o][k]; } }); });
  if(b.ori && !ORI[b.ori]) b.ori = null;
  S = b;
}
// Puntos por tipo de período, para materias guardadas antes de que el plan tuviera copia de datos.
const PER_PTS = {PCUA:4, SCUA:4, PBIM:2, SBIM:2, TBIM:2, CBIM:2, PTRI:3, STRI:3, PMEN:1, SMEN:1};
// Copia de los datos del curso dentro del plan (nombre, depto, puntos, año), para no depender
// de que siga estando en la oferta vigente.
const YEAR = window.CATALOG.anio || new Date().getFullYear();
function copyOf(k, e){ const c = byKey.get(k); if(!c || !e) return e; return Object.assign({}, e, {n:c.name, d:c.dep, pts:ptsOf(k, e.p), y:e.y || YEAR}); }
function withCopy(o, nested){ const r = {}; Object.keys(o||{}).forEach(k => { r[k] = nested ? withCopy(o[k]) : copyOf(k, o[k]); }); return r; }
const lsKey = () => SK + (ENV.uid ? ':'+ENV.uid : '');
function loadLocal(){ let r=null; try{ r = JSON.parse(localStorage.getItem(lsKey()) || (ENV.uid?null:localStorage.getItem('cpo-fixture-uba-v1')) || 'null'); }catch(e){} adopt(r); }
let dirty=false, writing=false, timer=null;
function statusText(){ return ({ok:'✓ Guardado en tu cuenta', pend:'Guardando…', err:'No se pudo guardar, reintentando…'})[ENV.status] || (ENV.mode==='db' ? '✓ Cuenta conectada' : 'Se guarda solo en este navegador'); }
function setStatus(s){ ENV.status = s; const e = document.getElementById('sv'); if(e) e.textContent = statusText(); }
function save(){
  S.rev = (S.rev||0)+1; dirty = true;
  try{ localStorage.setItem(lsKey(), JSON.stringify(Object.assign({}, S, {sel:withCopy(S.sel), hist:withCopy(S.hist, true)}))); }catch(e){}
  if(!DOC){ dirty = false; return; }
  setStatus('pend'); clearTimeout(timer); timer = setTimeout(flush, 800);
}
async function flush(){
  if(!DOC) return;
  if(writing){ clearTimeout(timer); timer = setTimeout(flush, 400); return; }
  writing = true; const mine = S.rev;
  try{
    const n = totals();
    const payload = JSON.parse(JSON.stringify({v:2, ori:S.ori, hist:withCopy(S.hist, true), sel:withCopy(S.sel), prev:S.prev, desde:S.desde, asked:S.asked, fav:S.fav, goal:S.goal, toured:S.toured, prac:0, pra:S.pra, obl:S.obl, idi:S.idi, t:S.t, rev:S.rev, got:n.got, apr:n.apr, updatedAt:Date.now()}));
    await DOC.set(payload);
    if(S.rev===mine){ dirty = false; setStatus('ok'); }
  }catch(e){ setStatus('err'); clearTimeout(timer); timer = setTimeout(flush, 5000); }
  writing = false;
}
function setupSub(){
  try{
    DOC.onSnapshot(s => {
      if(!s.exists || s.metadata.hasPendingWrites || dirty || writing) return;
      const d = s.data(); if(!d || !(d.rev > S.rev)) return;
      adopt(d); normalize(); render();
    }, () => {});
  }catch(e){}
}
async function boot(){
  render();
  const cl = window.RT || null;
  const wait = (pr) => Promise.race([pr, new Promise(r=>setTimeout(()=>r(null), 7000))]);
  try{ USERX = cl ? await wait(cl.use('user')) : null; }catch(e){ USERX = null; }
  try{ DBX = cl ? await wait(cl.use('db')) : null; }catch(e){ DBX = null; }
  let me = null;
  if(USERX){ try{ me = await USERX.me(); }catch(e){} try{ ENV.admin = !!(await USERX.canEdit()); }catch(e){} }
  ENV.name = (me && me.name) || ''; ENV.uid = (me && me.id) || null;
  if(DBX && ENV.uid){
    try{
      DOC = DBX.doc('plans/'+ENV.uid);
      const snap = await DOC.get();
      // Primer ingreso con cuenta: si el alumno ya venía usando la app sin cuenta,
      // se migra el avance guardado en este navegador a su plan en Firestore.
      let anon = null;
      if(!snap.exists){ try{ anon = JSON.parse(localStorage.getItem(SK) || localStorage.getItem('cpo-fixture-uba-v1') || 'null'); }catch(e){} }
      adopt(snap.exists ? snap.data() : anon);
      ENV.mode = 'db'; setupSub();
      if(anon){ save(); setTimeout(()=>toast('Pasamos a tu cuenta el avance que tenías guardado en este navegador.'), 600); }
    }catch(e){ DOC = null; ENV.mode = 'local'; loadLocal(); }
  } else { ENV.mode = 'local'; loadLocal(); }
  ENV.ready = true;
  normalize(); render();
  if(DBX) loadConfig(); // avisos y fechas de la Secretaría: visibles también sin cuenta
}

/* bloques */
function curKeys(list){ return list.filter(k => byKey.has(k)); }
function coursesOfDeps(deps, excl){ return DATA.filter(c => deps.includes(c.dep) && !excl.has(c.key)); }
function getBlocks(){
  const B = [];
  const o = S.ori ? ORI[S.ori] : null;
  if(o){
    const choiceKeys = o.ch.flat();
    const princ = curKeys(o.fx.concat(choiceKeys));
    B.push({id:'op', name:'Cursos principales', short:'Principales', cap:12, grp:'Orientación', eligible:princ.map(k=>byKey.get(k)), slots:[{id:'a', label:'Principales', cap:12, accept:()=>true}],
      rule:'<b>12 puntos</b> en los cursos principales de la orientación '+esc(o.n)+'. '+(o.ch.length?'En el grupo marcado como "elegí uno" alcanza con uno solo.':'Son todos obligatorios.'),
      dept:'Departamento de '+DEPN[o.dd[0]].replace(/^Derecho /,'Derecho ')});
    const excl = new Set([...princ, ...RESERVED]);
    let dslots = [{id:'a', label:'Derivados', cap:8, accept:()=>true}], dnote='';
    if(S.ori==='pen'){
      const p7 = S.sel['PEN-5X7'] || prevHas('PEN-5X7'), p6 = S.sel['PEN-5X6'] || prevHas('PEN-5X6');
      const need = p7 ? 'PEN-5X8' : (p6 ? 'PEN-5X9' : null);
      if(need){ dslots = [{id:'r', label:'Obligatorio: '+niceName(byKey.get(need).name), cap:2, req:true, accept:c=>c.key===need},{id:'a', label:'Libre en Penal', cap:6, accept:()=>true}]; }
      else { dslots = [{id:'r', label:'Obligatorio de 2 pts (depende de qué principal optativo elijas)', cap:2, req:true, accept:()=>false},{id:'a', label:'Libre en Penal', cap:6, accept:()=>true}]; dnote='Elegí primero el principal optativo (Criminología o Parte especial) para que se habilite el derivado obligatorio.'; }
    } else if(S.ori==='tbj'){
      dslots = [{id:'r', label:'Obligatorio: Derecho de la Seguridad Social', cap:4, req:true, accept:c=>c.key==='TBJ-512'},{id:'a', label:'Libre en Trabajo', cap:4, accept:()=>true}];
    } else if(S.ori==='emp'){
      const chosen = ORI.emp.ch[0].find(k => S.sel[k] || prevHas(k));
      if(chosen){
        const others = ORI.emp.ch[0].filter(k => k!==chosen);
        dslots = others.map((k,i)=>({id:'t'+i, label:'Tema relacionado con '+niceName(TEMA[k]).replace(/,.*$/,''), cap:2, req:true, accept:c=>(c.tema||[]).includes(TEMA[k])})).concat([{id:'a', label:'Libre en Empresarial', cap:4, accept:()=>true}]);
      } else dnote='Elegí primero el principal optativo: 4 de los 8 puntos derivados deben ser de temas de los dos principales que no cursaste (2 puntos en cada uno). En la lista aparecen con la etiqueta de tema.';
    }
    if(S.ori==='adm'||S.ori==='dip') dnote='El reglamento pide derivados "dentro de la orientación" y la oferta no los separa por orientación, por eso se listan todos los cursos del departamento. Confirmalo con la Secretaría.';
    B.push({id:'od', name:'Cursos derivados', short:'Derivados', cap:8, grp:'Orientación', eligible:coursesOfDeps(o.dd, excl), slots:dslots, note:dnote,
      rule:'<b>8 puntos</b> en cursos derivados, a elegir entre los que ofrece '+o.dd.map(d=>esc(DEPN[d])).join(' y ')+'.', dept:o.dd.map(d=>DEPN[d]).join(' / ')});
    B.push({id:'lb', name:'Cursos de libre elección', short:'Libres', cap:8, grp:'Fuera de la orientación', eligible:coursesOfDeps(o.ld, RESERVED), slots:[{id:'a', label:'Libres', cap:8, accept:()=>true}], libre:true,
      rule:'<b>8 puntos</b> repartidos en <b>al menos 2 departamentos</b>, a elegir entre: '+o.ld.map(d=>esc(DEPN[d])).join(', ')+'.', dept:o.ld.map(d=>DEPN[d]).join(', ')});
    B.push({id:'co', name:'Constitucional profundizado', short:'Constitucional', cap:4, grp:'Fuera de la orientación', eligible:curKeys(o.co).map(k=>byKey.get(k)), slots:[{id:'a', label:'Constitucional', cap:4, accept:()=>true}],
      rule:'<b>4 puntos</b> en Derecho Público. Para tu orientación corresponde: '+o.co.map(k=>'<b>'+esc(niceName(byKey.get(k).name))+'</b>').join(' o ')+'.', dept:'Departamento de Derecho Público'});
  }
  B.push({id:'in', name:'Derecho de la Integración', short:'Integración', cap:4, grp:'Fuera de la orientación', eligible:curKeys(['PUB-66U']).map(k=>byKey.get(k)), slots:[{id:'a', label:'Integración', cap:4, accept:()=>true}],
    rule:'<b>4 puntos</b> en la asignatura Derecho de la Integración, del Departamento de Derecho Público.', dept:'Departamento de Derecho Público'});
  B.push({id:'so', name:'Ciencias Sociales', short:'Cs. Sociales', cap:4, grp:'Fuera de la orientación', eligible:DATA.filter(c=>c.dep==='SOC'), slots:[{id:'a', label:'Ciencias Sociales', cap:4, accept:()=>true}],
    rule:'<b>4 puntos</b> a elección libre entre los cursos del Departamento. No se pueden cursar más puntos que esos 4.', dept:'Departamento de Ciencias Sociales'});
  B.push({id:'fi', name:'Filosofía del Derecho', short:'Filosofía', cap:4, grp:'Fuera de la orientación', eligible:DATA.filter(c=>c.dep==='FIL'), slots:[{id:'a', label:'Filosofía', cap:4, accept:()=>true}],
    rule:'<b>4 puntos</b> a elección libre entre los cursos del Departamento. No se pueden cursar más puntos que esos 4.', dept:'Departamento de Filosofía del Derecho'});
  B.push({id:'pr', name:'Derecho Procesal', short:'Procesal', cap:6, grp:'Fuera de la orientación', eligible:DATA.filter(c=>['PRC','MAR','INS'].includes(c.dep)), slots:[
      {id:'m', label:'Métodos alternativos de resolución de conflictos', cap:2, req:true, accept:c=>c.dep==='MAR'},
      {id:'i', label:'Prevención y resolución de la insolvencia', cap:2, req:true, accept:c=>c.dep==='INS'},
      {id:'a', label:'Otro curso de Procesal', cap:2, accept:c=>c.dep==='PRC'}],
    rule:'<b>6 puntos</b> en Derecho Procesal: <b>2 en Métodos alternativos</b>, <b>2 en Procedimientos de prevención y resolución de la insolvencia</b> y 2 en otro curso del Departamento. No se pueden cursar más.', dept:'Departamento de Derecho Procesal'});
  B.push({id:'pp', name:'Práctica Profesional', short:'Práctica', cap:19, grp:'Carga manual', manual:'prac', rule:'<b>19 puntos</b> en el Departamento de Práctica Profesional. Esa oferta no está en el archivo que cargaste, así que sumá acá los puntos que ya tenés o vas a cursar.', dept:'Departamento de Práctica Profesional'});
  B.push({id:'ob', name:'Obligatorias del CPO', short:'Obligatorias', cap:22, grp:'Carga manual', manual:'obl', outside:true, rule:'Cinco asignaturas cuatrimestrales obligatorias para todas las orientaciones. No suman a los 69 puntos: se cuentan aparte (22 puntos).', dept:'Obligatorias de todas las orientaciones'});
  B.push({id:'id', name:'Lecto-comprensión', short:'Idioma', cap:1, grp:'Carga manual', manual:'idi', outside:true, rule:'Un curso cuatrimestral de lecto-comprensión de textos jurídicos en lengua extranjera. Para inscribirte tenés que tener aprobado el CPC y al menos tres obligatorias del CPO.', dept:'Lengua extranjera'});
  B.forEach(b => { if(!b.eligible) return; prevOf(b.id).forEach(x => {
    const pc = prevCourse(x), sl = (x.k && b.slots.find(z => z.id!=='a' && z.cap>=x.pts && z.accept(pc))) || b.slots.find(z => z.id==='a');
    if(sl) sl.cap = Math.max(0, sl.cap - x.pts);
  }); });
  B.forEach(b => { if(b.eligible) b.eligible = b.eligible.slice().sort((x,y)=>x.name.localeCompare(y.name,'es')); });
  return B;
}
let BL = [];
const bl = id => BL.find(b => b.id===id);
const ptsOf = (k, p) => { const c = byKey.get(k); const pp = c.periods.find(x=>x.id===p); return pp ? pp.pts : 0; };
function entriesOf(id){ return Object.keys(S.sel).filter(k=>S.sel[k].b===id).sort((a,b)=>S.sel[a].t-S.sel[b].t); }
const newId = () => 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const prevVisible = x => !SPEC.has(x.b) || x.ori===S.ori;
const prevOf = bid => S.prev.filter(x => x.b===bid && prevVisible(x));
const prevPts = bid => prevOf(bid).reduce((s,x)=>s+x.pts, 0);
const prevHas = k => S.prev.some(x => x.k===k && prevVisible(x));
const prevCourse = x => ({key:x.k||'', dep:x.dep||'', tema:x.tm||[]});
const nnOf = n => String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Materia anterior que es el mismo curso (mismo código o mismo nombre).
const prevSame = c => S.prev.find(x => prevVisible(x) && (x.k===c.key || nnOf(x.name)===c.nn));
function libDeps(){ return new Set(entriesOf('lb').map(k=>byKey.get(k).dep).concat(prevOf('lb').map(x=>x.dep).filter(Boolean))); }
function usedOf(id){ return entriesOf(id).reduce((s,k)=>s+ptsOf(k,S.sel[k].p),0) + prevPts(id); }
const praSum = () => Math.min(19, S.pra.reduce((s,x)=>s+x.pts,0));
function manualUsed(id){ const b=bl(id); if(b.manual==='prac') return praSum(); if(b.manual==='obl') return S.obl.reduce((s,i)=>s+OBLIG.find(o=>o[0]===i)[3],0); if(b.manual==='idi') return S.idi?1:0; return 0; }
const used = id => { const b=bl(id); return b && b.manual ? manualUsed(id) : usedOf(id); };

/* asignación a ranuras */
function place(b, keys){
  const u = {}; b.slots.forEach(s=>u[s.id]=0);
  const asg = {}, drop = [];
  keys.forEach(k => {
    const c = byKey.get(k), pts = ptsOf(k, S.sel[k] ? S.sel[k].p : arguments[2]);
    const s = b.slots.find(s => s.accept(c) && u[s.id]+pts<=s.cap);
    if(s){ u[s.id]+=pts; asg[k]=s.id; } else drop.push(k);
  });
  return {u, asg, drop};
}
function normalize(){
  BL = getBlocks();
  const msgs = [];
  Object.keys(S.sel).forEach(k => { const b = bl(S.sel[k].b); if(!b || !b.eligible || !b.eligible.some(c=>c.key===k)){ delete S.sel[k]; } });
  BL.filter(b=>b.eligible).forEach(b => {
    const keys = entriesOf(b.id);
    const r = place(b, keys);
    r.drop.forEach(k => { msgs.push(niceName(byKey.get(k).name)); delete S.sel[k]; });
  });
  return msgs;
}
function slotState(b){
  const keys = entriesOf(b.id);
  const r = place(b, keys);
  return b.slots.map(s => ({s, u:r.u[s.id]}));
}

/* ¿se puede elegir? */
function otherUse(k, bid){
  const c = byKey.get(k);
  for(const tk of twins.get(c.nn)||[]){ if(S.sel[tk] && !(tk===k && S.sel[tk].b===bid)){ const bb=bl(S.sel[tk].b); return {k:tk, b:bb ? bb.name : ''}; } }
  return null;
}
function canPick(b, c, pid){
  const pts = ptsOf(c.key, pid);
  const pv = prevSame(c); if(pv) return 'Ya la tenés aprobada (año '+pv.year+'), en "Materias de años anteriores".';
  const ex0 = S.sel[c.key];
  if(ex0 && ex0.b===b.id && PSEM[ex0.p]!==PSEM[pid] && ex0.st && ex0.st!=='plan') return 'Ya la tenés cargada como "'+ST[ex0.st]+'" en el '+(PSEM[ex0.p]===1?'primer':'segundo')+' período.';
  const ou = otherUse(c.key, b.id);
  if(ou) return ou.k===c.key ? 'Ya la elegiste en "'+ou.b+'".' : 'Es el mismo curso que ya elegiste en "'+ou.b+'".';
  const grpMates = (S.ori && ORI[S.ori].ch.find(g=>g.includes(c.key))) || [];
  const keys = entriesOf(b.id).filter(k => k!==c.key && !(b.id==='op' && grpMates.includes(k)));
  const tmp = Object.assign({}, S.sel[c.key]); const prev = S.sel[c.key];
  S.sel[c.key] = {b:b.id, p:pid, t:1e12};
  const r = place(b, keys.concat([c.key]));
  if(prev) S.sel[c.key]=prev; else delete S.sel[c.key];
  if(r.drop.includes(c.key)){
    const usedNow = keys.reduce((s,k)=>s+ptsOf(k,S.sel[k].p),0);
    const left = b.cap - usedNow - prevPts(b.id);
    if(left<=0) return 'El bloque ya está completo ('+b.cap+' pts).';
    if(left<pts && b.slots.length===1) return 'Te pasarías del tope: quedan '+left+' pts y este período vale '+pts+'.';
    const st = place(b, keys).u;
    const open = b.slots.filter(s=>st[s.id]<s.cap && s.accept(c)).length;
    if(open===0){
      const faltan = b.slots.filter(s=>st[s.id]<s.cap).map(s=>s.label+' ('+(s.cap-st[s.id])+' pts)');
      return 'Los puntos que quedan están reservados para: '+faltan.join('; ')+'.';
    }
    return 'Te pasarías del tope en esa parte del bloque.';
  }
  if(b.libre){
    const depsSet = new Set(keys.map(k=>byKey.get(k).dep).concat(prevOf('lb').map(x=>x.dep).filter(Boolean))); depsSet.add(c.dep);
    const total = keys.reduce((s,k)=>s+ptsOf(k,S.sel[k].p),0)+pts+prevPts('lb');
    if(total>=b.cap && depsSet.size<2) return 'Los 8 puntos libres tienen que repartirse en al menos 2 departamentos.';
  }
  return null;
}

/* acciones */
let t0 = 0;
function toggle(bid, key, pid){
  const b = bl(bid), c = byKey.get(key);
  const cur = S.sel[key]; const keepSt = cur && cur.st ? cur.st : 'plan';
  if(cur && cur.b===bid && cur.p!==pid && keepSt==='anot'){ const lm = limitMsg(key, pid); if(lm){ showLimit(lm); return; } }
  if(cur && cur.b===bid && cur.p===pid){ delete S.sel[key]; }
  else {
    if(cur && cur.b===bid) delete S.sel[key];
    const why = canPick(b, c, pid); if(why){ toast(why); return; }
    if(bid==='op'){ const g = ORI[S.ori].ch.find(g=>g.includes(key)); if(g) g.forEach(k=>{ if(k!==key) delete S.sel[k]; }); }
    S.sel[key] = {b:bid, p:pid, t:++S.t, st:keepSt};
  }
  const dropped = normalize(); save();
  if(dropped.length) toast('Se sacó "'+dropped[0]+'"'+(dropped.length>1?' y '+(dropped.length-1)+' más':'')+' porque ya no entra en el bloque.');
  render();
}
let tt;
function toast(m){ const e=document.getElementById('toast'); e.textContent=m; e.hidden=false; clearTimeout(tt); tt=setTimeout(()=>e.hidden=true,4200); }

/* horarios y choques */
const DIAS = {Lun:1,Mar:2,Mie:3,'Mié':3,Jue:4,Vie:5,Sab:6,'Sáb':6,Dom:7};
const PSPAN = REF.PSPAN;
const ST = {plan:'Lo pienso cursar', anot:'Lo estoy cursando', apr:'Aprobada'};
const hh = s => String(s||'').replace(/\bMie\b/g,'Mié').replace(/\bSab\b/g,'Sáb');
const fm = x => String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');
function segs(h){ const o=[]; String(h||'').split(' · ').forEach(s=>{ const m=s.match(/^(\S+) (\d\d):(\d\d)–(\d\d):(\d\d)$/); if(m && DIAS[m[1]]) o.push({d:DIAS[m[1]], n:hh(m[1]), a:(+m[2])*60+(+m[3]), z:(+m[4])*60+(+m[5])}); }); return o; }
function comOf(key, pid, code){ const c = byKey.get(key); const p = c && c.periods.find(x=>x.id===pid); return (p && p.coms.find(m=>m[0]===code)) || null; }
function clashBetween(p1,h1,p2,h2){
  if(PSEM[p1]!==PSEM[p2]) return null;
  const A=PSPAN[p1], B=PSPAN[p2]; if(!A||!B||A[1]<=B[0]||B[1]<=A[0]) return null;
  const s2 = segs(h2);
  for(const x of segs(h1)) for(const y of s2) if(x.d===y.d && x.a<y.z && y.a<x.z) return x.n+' '+fm(Math.max(x.a,y.a))+'–'+fm(Math.min(x.z,y.z));
  return null;
}
function clashOf(key,pid,h){
  for(const k2 of Object.keys(S.sel)){
    if(k2===key) continue; const s2=S.sel[k2]; if(!s2.c) continue;
    const m2 = comOf(k2, s2.p, s2.c); if(!m2) continue;
    const w = clashBetween(pid,h,s2.p,m2[3]); if(w) return {k:k2, when:w};
  }
  return null;
}
function allClashes(){
  const ks = Object.keys(S.sel).filter(k=>S.sel[k].c && comOf(k,S.sel[k].p,S.sel[k].c)), out=[];
  for(let i=0;i<ks.length;i++) for(let j=i+1;j<ks.length;j++){
    const a=S.sel[ks[i]], b=S.sel[ks[j]];
    const w = clashBetween(a.p, comOf(ks[i],a.p,a.c)[3], b.p, comOf(ks[j],b.p,b.c)[3]);
    if(w) out.push({a:ks[i], b:ks[j], when:w});
  }
  return out;
}

/* totales y mensajes */
function totals(){
  let apr=0, anot=0, plan=0;
  BL.filter(b=>!b.outside).forEach(b=>{ const x = blockStates(b); apr += x.a; anot += x.n; plan += x.p; });
  return {got:apr, all:apr+anot+plan, apr, anot, plan};
}
function apOf(b){ return blockStates(b).a; }
const MOT = [
  [0, ['Arrancá cuando quieras: cargá tu primer curso y el tablero empieza a moverse.']],
  [1, ['¡Primeros puntos en el tablero! Lo más difícil ya está hecho: empezar.','Ya arrancaste. Cada curso que sumás es uno menos para recibirte.']],
  [10, ['Buen ritmo: ya tenés tus primeros puntos asegurados.','Se está armando. Seguí así, de a un curso por vez.']],
  [25, ['Ya recorriste un buen tramo del CPO. ¡Seguí!','Un cuarto del camino, y viene muy bien.']],
  [40, ['Casi a la mitad. Dale que esto va tomando forma.','Cada punto cuenta, y los tuyos se juntan rápido.']],
  [50, ['¡Pasaste la mitad! Dale que falta cada vez menos para recibirte.','Mitad del camino atrás: lo que queda es cada vez menos.']],
  [65, ['Entraste en el último tramo: falta cada vez menos para el título.','Ya se ve la meta. ¡No aflojes ahora!']],
  [80, ['¡Ya se huele el título! Solo faltan {falta} puntos.','Estás a {falta} puntos de cerrar el CPO. ¡Vamos!']],
  [92, ['Última curva: {falta} puntos y terminás el CPO.','¡Casi, casi! {falta} puntos y listo.']],
  [100, ['¡Completaste los 69 puntos! Ahora queda confirmarlo con la Secretaría. ¡Felicitaciones!']]
];
function motOf(got){
  const pct = 100*got/69; let ti = 0; MOT.forEach((x,i)=>{ if(pct>=x[0]) ti=i; });
  const v = MOT[ti][1]; return {ti, msg: v[got % v.length].replace('{falta}', 69-got)};
}

/* cambio de orientación: guarda lo anterior y trae lo que sirve */
const SPEC = new Set(['op','od','lb','co']);
function fitPrev(b, pts, pc){
  const left = b.cap - used(b.id);
  if(left<=0) return 'Ese segmento ya está completo ('+b.cap+' pts).';
  if(pts>left) return 'Te pasarías del tope: en "'+b.name+'" quedan '+left+' pts.';
  const st = slotState(b), u = (pc && pc.key && st.find(x => x.s.id!=='a' && x.s.cap-x.u>=pts && x.s.accept(pc))) || st.find(x=>x.s.id==='a');
  if(u && u.s.cap-u.u<pts) return 'En ese segmento los puntos que quedan están reservados para cursos obligatorios.';
  return null;
}
function switchCore(nk){
  const old = S.ori;
  const cand = Object.keys(S.sel).filter(k=>SPEC.has(S.sel[k].b)).sort((a,b)=>S.sel[a].t-S.sel[b].t).map(k=>[k, Object.assign({}, S.sel[k])]);
  S.hist[old] = {}; cand.forEach(([k,e])=>{ S.hist[old][k] = e; });
  cand.forEach(([k])=>{ delete S.sel[k]; });
  S.ori = nk; BL = getBlocks();
  const h = S.hist[nk] || {};
  Object.keys(h).sort((a,b)=>(h[a].t||0)-(h[b].t||0)).forEach(k=>{ if(byKey.has(k) && !S.sel[k]) S.sel[k] = Object.assign({}, h[k]); });
  normalize();
  const restored = Object.keys(S.sel).filter(k=>SPEC.has(S.sel[k].b)).length;
  const order = ['op','od','co','lb'], carried = [];
  cand.slice().sort((x,y)=>order.indexOf(x[1].b)-order.indexOf(y[1].b) || x[1].t-y[1].t).forEach(([k,e])=>{
    if(S.sel[k]) return;
    const c = byKey.get(k);
    for(const id of order){
      BL = getBlocks(); const b = bl(id);
      if(!b || !b.eligible || !b.eligible.some(x=>x.key===k)) continue;
      if(id==='op'){ const g = ORI[nk].ch.find(g=>g.includes(k)); if(g && g.some(x=>x!==k && S.sel[x])) continue; }
      if(canPick(b, c, e.p)) continue;
      S.sel[k] = {b:id, p:e.p, t:++S.t, c:e.c, st:e.st||'plan'}; carried.push(k); break;
    }
  });
  normalize();
  const carriedPrev = [];
  S.prev.filter(x => x.ori===old && SPEC.has(x.b)).forEach(e => {
    const src = e.src || e.id;
    if(S.prev.some(x => x.ori===nk && (x.src||x.id)===src)) return;
    const ids = e.k ? segsOf(prevCourse(e)).filter(i => SPEC.has(i)) : ['od','lb'];
    for(const id of ids){
      BL = getBlocks(); const b = bl(id); if(!b) continue;
      const okDep = e.k || (id==='od' ? ORI[nk].dd.includes(e.dep) : ORI[nk].ld.includes(e.dep));
      if(!okDep || fitPrev(b, e.pts, e.k ? prevCourse(e) : null)) continue;
      const ne = Object.assign({}, e, {id:newId(), b:id, ori:nk, src}); S.prev.push(ne); carriedPrev.push(ne); break;
    }
  });
  BL = getBlocks();
  return {from:old, restored, carried:carried.filter(k=>S.sel[k]), carriedPrev};
}
function simulateSwitch(nk){
  const S0 = S; S = JSON.parse(JSON.stringify(S0)); let res;
  try{ res = switchCore(nk); res.pts = res.carried.reduce((s,k)=>s+ptsOf(k,S.sel[k].p),0) + res.carriedPrev.reduce((s,x)=>s+x.pts,0); res.n = res.carried.length + res.carriedPrev.length; } finally { S = S0; BL = getBlocks(); }
  return res;
}
function applySwitch(nk){
  const r = switchCore(nk); save();
  UI.changing = false; UI.modal = null; UI.active = 'sum'; UI.q=UI.per=UI.mod=UI.dep=UI.day=UI.turno=UI.doc=''; UI.page=1;
  const pts = r.carried.reduce((s,k)=>s+ptsOf(k,S.sel[k].p),0) + r.carriedPrev.reduce((s,x)=>s+x.pts,0);
  const n = r.carried.length + r.carriedPrev.length;
  UI.carry = {from:r.from, to:nk, items:r.carried.map(k=>niceName(byKey.get(k).name)).concat(r.carriedPrev.map(x=>x.name+' (año '+x.year+')')), pts};
  render();
  toast(n ? 'Listo. Te traje '+n+' materia'+(n>1?'s':'')+' ('+pts+' pts) de tu orientación anterior.' : 'Listo, cambiaste de orientación. Lo anterior quedó guardado.');
}
function setOri(k){ S.ori = k; normalize(); save(); UI.active='op'; UI.q=UI.per=UI.mod=UI.dep=UI.day=UI.turno=UI.doc=''; UI.page=1; if(!S.asked) UI.modal='welcome'; render(); }

/* lista de materias y materias de años anteriores */
const PREV_BLOCKS = ['op','od','lb','co','in','so','fi','pr'];
const PREV_DEPS = ['PRI','PUB','PEN','ECN','TBJ','SOC','FIL','PRC','NOT','TRI'];
const DEF_DEP = {so:'SOC', fi:'FIL', pr:'PRC', in:'PUB', co:'PUB'};
function listData(){
  const g = {apr:[], anot:[], plan:[]};
  Object.keys(S.sel).forEach(k => {
    const e = S.sel[k], c = byKey.get(k), b = bl(e.b), p = c && c.periods.find(x=>x.id===e.p); if(!c || !p) return;
    const m = e.c ? comOf(k, e.p, e.c) : null;
    g[e.st||'plan'].push({name:niceName(c.name), pts:p.pts, sub:(b?b.name:'')+' · '+PERLBL[e.p]+' · '+p.pts+' pts'+(m?' · com. '+m[0]+' ('+hh(m[3])+')':'')});
  });
  S.prev.filter(prevVisible).forEach(x => { const b = bl(x.b); g.apr.push({name:x.name, pts:x.pts, sub:(b?b.name:'')+' · '+x.pts+' pts · año '+x.year+' (anterior)'}); });
  S.pra.forEach(x => { g[x.st].push({name:'Práctica Profesional'+(x.name?' · '+x.name:''), pts:x.pts, sub:'Práctica · '+x.pts+' pts'}); });
  S.obl.forEach(i => { const o = OBLIG.find(x=>x[0]===i); if(o) g.apr.push({name:o[1], pts:0, sub:'Obligatoria · '+o[3]+' pts (no suma a los 69)'}); });
  if(S.idi) g.apr.push({name:'Lecto-comprensión', pts:0, sub:'Idioma (no suma a los 69)'});
  return g;
}
function addPrev(fd){
  const err = m => { const e = document.getElementById('preverr'); if(e) e.textContent = m; };
  const name = String(fd.get('name')||'').trim(), bid = String(fd.get('b')||''), pts = parseInt(fd.get('pts'),10), year = parseInt(fd.get('year'),10);
  let dep = String(fd.get('dep')||'');
  const b = bl(bid), o = ORI[S.ori];
  if(!name) return err('Escribí el nombre de la materia.');
  if(!b || !b.eligible) return err('Elegí a qué segmento pertenece.');
  if(!(pts>=1)) return err('Poné cuántos puntos vale (un número de 1 en adelante).');
  if(!(year>=2000 && year<=2100)) return err('Elegí el año en que la cursaste.');
  if(DEF_DEP[bid]) dep = DEF_DEP[bid]; else if(bid==='op') dep = dep || o.dd[0];
  if((bid==='lb' || bid==='od') && !dep) return err('Elegí el departamento de la materia.');
  if(bid==='od' && !o.dd.includes(dep)) return err('Los derivados de '+o.n+' son de: '+o.dd.map(d=>DEPN[d]).join(' o ')+'. Si es de otro departamento, cargala como libre.');
  if(bid==='lb' && !o.ld.includes(dep)) return err('Los libres de '+o.n+' se eligen entre: '+o.ld.map(d=>DEPN[d]).join(', ')+'.');
  const why = fitPrev(b, pts); if(why) return err(why);
  if(bid==='lb'){ const ds = libDeps(); ds.add(dep); if(used('lb')+pts>=b.cap && ds.size<2) return err('Los 8 puntos libres tienen que repartirse en al menos 2 departamentos.'); }
  S.prev.push({id:newId(), b:bid, name:name.slice(0,120), pts, year, dep, ori: SPEC.has(bid) ? S.ori : null, src:null});
  save(); render(); toast('Agregada: '+name);
}
/* materias de ofertas anteriores (las publicadas antes de la vigente) */
UI.pv = {status:'idle', ofertas:[], mat:'idle', list:[], by:new Map(), q:'', open:null, err:''};
// A qué segmentos puede ir un curso, en orden de preferencia (mismas reglas que getBlocks).
function segsOf(c){
  const o = S.ori ? ORI[S.ori] : null, r = [];
  const princ = o ? o.fx.concat(o.ch.flat()) : [];
  if(o && princ.includes(c.key)) r.push('op');
  if(o && o.co.includes(c.key)) r.push('co');
  if(c.key==='PUB-66U') r.push('in');
  if(c.dep==='SOC') r.push('so');
  if(c.dep==='FIL') r.push('fi');
  if(['PRC','MAR','INS'].includes(c.dep)) r.push('pr');
  if(o && !RESERVED.has(c.key) && o.dd.includes(c.dep) && !princ.includes(c.key)) r.push('od');
  if(o && !RESERVED.has(c.key) && o.ld.includes(c.dep)) r.push('lb');
  return r;
}
const pvDesdeIds = () => UI.pv.ofertas.filter(o => S.desde && o.id >= S.desde);
async function pvInit(){
  if(!window.RT || !RT.ofertasAnteriores){ UI.pv.status = 'none'; return; }
  UI.pv.status = 'loading';
  try{ UI.pv.ofertas = await RT.ofertasAnteriores(); UI.pv.status = 'ok'; }catch(e){ UI.pv.status = 'err'; }
  if(UI.modal==='prev') render();
  if(S.desde) pvLoad();
}
async function pvLoad(){
  const ofs = pvDesdeIds();
  if(!ofs.length){ UI.pv.mat = 'ok'; UI.pv.list = []; UI.pv.by = new Map(); if(UI.modal==='prev') render(); return; }
  UI.pv.mat = 'loading'; if(UI.modal==='prev') render();
  try{
    const fotos = await RT.materiasAnteriores(ofs), by = new Map();
    fotos.sort((a,b)=>a.id.localeCompare(b.id)).forEach(f => f.courses.forEach(c => {
      const key = c.dep+'-'+c.code; let m = by.get(key);
      if(!m){ m = {key, dep:c.dep, code:c.code, name:c.name, tema:[], opts:[]}; by.set(key, m); }
      m.name = c.name; c.tema.forEach(t => { if(!m.tema.includes(t)) m.tema.push(t); });
      c.periods.forEach(p => m.opts.push({of:f.id, anio:f.anio, pid:p.id, pts:p.pts, label:(PERLBL[p.id]||p.label||p.id)+' '+f.anio}));
    }));
    by.forEach(m => { m.nn = nnOf(m.name); m.q = nnOf(m.name+' '+m.key); m.opts.sort((a,b)=>b.of.localeCompare(a.of)); });
    UI.pv.by = by; UI.pv.list = [...by.values()].sort((a,b)=>a.name.localeCompare(b.name,'es')); UI.pv.mat = 'ok';
  }catch(e){ UI.pv.mat = 'err'; }
  if(UI.modal==='prev') render();
}
function pvResHtml(){
  if(UI.pv.mat==='loading') return '<p class="emp">Cargando las materias de esas ofertas…</p>';
  if(UI.pv.mat==='err') return '<p class="emp">No se pudieron cargar las materias. Revisá tu conexión y volvé a abrir esta ventana.</p>';
  const q = nnOf(UI.pv.q), all = UI.pv.list.filter(m => !q || q.split(' ').every(w => m.q.includes(w)));
  if(!all.length) return '<p class="emp">'+(UI.pv.list.length ? 'No encontré ninguna materia con ese nombre. Si la cursaste, cargala a mano más abajo.' : 'No hay materias cargadas para ese período.')+'</p>';
  const shown = all.slice(0, 30);
  return '<ul class="pvl">'+shown.map(m => {
    const done = prevSame(m), segs = segsOf(m), open = UI.pv.open===m.key;
    let h = '<li'+(open?' class="on"':'')+'><div class="pvh"><div><b>'+esc(niceName(m.name))+'</b><span>'+esc(m.key+' · '+(DEPN[m.dep]||m.dep))+'</span></div>';
    if(done) h += '<span class="chip ok">Ya cargada</span>';
    else if(!segs.length) h += '<span class="chip" title="No suma en ningún segmento de tu orientación">No suma en tu orientación</span>';
    else h += '<button class="btn mini'+(open?'':' primary')+'" data-pvopen="'+esc(m.key)+'">'+(open?'Cerrar':'Elegir')+'</button>';
    h += '</div>';
    if(open && !done && segs.length){
      const okB = segs.find(id => { const b = bl(id); return b && !fitPrev(b, m.opts[0].pts, m); }) || segs[0];
      h += '<div class="pvf"><label>¿Cuándo la cursaste?<select id="pv-per">'+m.opts.map(o=>'<option value="'+esc(o.of+'|'+o.pid)+'">'+esc(o.label+' · '+o.pts+' pts')+'</option>').join('')+'</select></label>'+
        '<label>Cuenta para<select id="pv-b">'+segs.map(id=>{ const b = bl(id); return b ? '<option value="'+id+'"'+(id===okB?' selected':'')+'>'+esc(b.name)+'</option>' : ''; }).join('')+'</select></label>'+
        '<div class="why" id="pv-err" role="alert">'+esc(UI.pv.err||'')+'</div><button class="btn primary" data-pvadd="'+esc(m.key)+'">Agregar como aprobada</button></div>';
    }
    return h+'</li>';
  }).join('')+'</ul>'+(all.length>shown.length ? '<p class="emp">Hay '+(all.length-shown.length)+' más: escribí parte del nombre para encontrarla.</p>' : '');
}
function addPrevCourse(key){
  const m = UI.pv.by.get(key), err = t => { UI.pv.err = t; const e = document.getElementById('pv-err'); if(e) e.textContent = t; };
  if(!m) return;
  const [of, pid] = String((document.getElementById('pv-per')||{}).value||'').split('|'), bid = String((document.getElementById('pv-b')||{}).value||'');
  const opt = m.opts.find(o => o.of===of && o.pid===pid), b = bl(bid);
  if(!opt) return err('Elegí cuándo la cursaste.');
  if(!b || !segsOf(m).includes(bid)) return err('Elegí para qué segmento cuenta.');
  if(prevSame(m)) return err('Ya la cargaste.');
  const cur = S.sel[m.key];
  if(cur && cur.st==='apr') return err('Ya la tenés como aprobada en la oferta actual.');
  const why = fitPrev(b, opt.pts, m); if(why) return err(why);
  if(bid==='lb'){ const ds = libDeps(); ds.add(m.dep); if(used('lb')+opt.pts>=b.cap && ds.size<2) return err('Los 8 puntos libres tienen que repartirse en al menos 2 departamentos.'); }
  if(cur) delete S.sel[m.key]; // la tenía elegida en la oferta actual: ya la aprobó antes
  S.prev.push({id:newId(), b:bid, name:niceName(m.name).slice(0,120), pts:opt.pts, year:opt.anio, dep:m.dep, ori:SPEC.has(bid) ? S.ori : null, src:null, k:m.key, of:opt.of, p:opt.pid, tm:m.tema});
  UI.pv.open = null; UI.pv.err = '';
  normalize(); save(); render(); toast('Agregada: '+niceName(m.name)+' ('+opt.pts+' pts)');
}
function pvHtml(){
  const P = UI.pv;
  if(P.status==='idle' || P.status==='loading') return '<p class="emp">Buscando ofertas anteriores…</p>';
  if(P.status!=='ok' || !P.ofertas.length) return '';
  const first = P.ofertas[0];
  let h = '<label class="pvd">¿Desde cuándo cursás el CPO?<select id="pv-desde"><option value="">— Elegí el período —</option>'+
    P.ofertas.map(o=>'<option value="'+o.id+'"'+(S.desde===o.id?' selected':'')+'>'+esc(o.nombre||o.id)+'</option>').join('')+
    (S.desde && !P.ofertas.some(o=>o.id===S.desde) ? '<option value="'+esc(S.desde)+'" selected>'+esc(S.desde)+'</option>' : '')+'</select>'+
    '<span class="hint">Te mostramos las materias de las ofertas desde ese período hasta la anterior a la actual. Lo que cursaste antes '+esc(first.nombre ? 'del '+first.nombre.charAt(0).toLowerCase()+first.nombre.slice(1) : 'de '+first.id)+', cargalo a mano.</span></label>';
  if(!S.desde) return h;
  h += '<label class="pvs">Buscá la materia<input id="pv-q" type="search" autocomplete="off" placeholder="Nombre o código, p. ej. Derecho Romano o PRI-205" value="'+esc(P.q)+'"></label><div id="pv-res">'+pvResHtml()+'</div>';
  return h;
}
function closeModal(){ if(UI.modal==='welcome' && !S.asked){ S.asked = true; save(); }
  if((UI.modal==='welcome' || UI.modal==='prev') && !S.toured){ UI.changing = false; UI.modal = 'tour'; render(); return; } UI.changing = false; UI.modal = null; render(); }

/* comentarios de comisiones */
const stars = n => '★'.repeat(n)+'☆'.repeat(5-n);
const normTxt = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const nameOf = uid => uid===ENV.uid ? 'Vos' : (((UI.profiles||{})[uid]||{}).name || 'Alumno/a');
const cmStrip = i => ({id:i.id, k:i.k, p:i.p, c:i.c, t:i.t, r:i.r, at:i.at});
async function loadComments(){
  if(!DBX){ CM.status = 'off'; render(); return; }
  CM.status = 'load'; render();
  try{
    const q = await DBX.collection('comments').get(), items = [];
    q.docs.forEach(d => { const dd = d.data() || {}; (Array.isArray(dd.items) ? dd.items : []).forEach(x => { if(x && typeof x.t==='string' && byKey.has(x.k)) items.push({uid:d.id, id:String(x.id||''), k:x.k, p:String(x.p||''), c:String(x.c||''), t:x.t.slice(0,600), r:Math.max(0,Math.min(5,+x.r||0)), at:+x.at||0}); }); });
    CM.items = items; CM.status = 'ok';
    if(USERX){ try{ const ps = await USERX.profiles([...new Set(items.map(i=>i.uid))]); UI.profiles = Object.assign({}, UI.profiles, ps); }catch(e){} }
  }catch(e){ CM.status = 'err'; }
  render();
}
async function postComment(){
  if(CM.busy || !DBX || !ENV.uid) return;
  const c = byKey.get(UI.cm.k), parts = String(UI.cm.pc||'').split('|'), t = String(UI.cm.t||'').trim();
  if(!c){ toast('Elegí una materia.'); return; }
  if(!parts[0] || !comOf(c.key, parts[0], parts[1])){ toast('Elegí la comisión que cursaste.'); return; }
  if(t.length<5){ toast('Escribí un comentario un poco más largo.'); return; }
  const mine = CM.items.filter(i=>i.uid===ENV.uid).map(cmStrip);
  if(mine.length>=40){ toast('Llegaste al máximo de 40 comentarios.'); return; }
  const it = {id:newId(), k:c.key, p:parts[0], c:parts[1], t:t.slice(0,600), r:UI.cm.r||0, at:Date.now()};
  CM.busy = true; render();
  try{ await DBX.doc('comments/'+ENV.uid).set({items:mine.concat([it])}); CM.items.push(Object.assign({uid:ENV.uid}, it)); UI.cm.t = ''; UI.cm.r = 0; toast('Comentario publicado.'); }
  catch(e){ toast('No se pudo publicar. Probá de nuevo.'); }
  CM.busy = false; render();
}
async function delComment(uid, id){
  if(CM.busy || !DBX || (uid!==ENV.uid && !ENV.admin)) return;
  const rest = CM.items.filter(i=>i.uid===uid && i.id!==id).map(cmStrip);
  CM.busy = true;
  try{ await DBX.doc('comments/'+uid).set({items:rest}); CM.items = CM.items.filter(i=>!(i.uid===uid && i.id===id)); toast('Comentario borrado.'); }
  catch(e){ toast('No se pudo borrar.'); }
  CM.busy = false; render();
}
function cmOpts(c){
  let o = '';
  c.periods.forEach(p => p.coms.forEach(m => { const v = p.id+'|'+m[0]; o += '<option value="'+esc(v)+'"'+(UI.cm.pc===v?' selected':'')+'>'+esc(PERLBL[p.id]+' · Com. '+m[0]+' · '+m[2]+' · '+hh(m[3]))+'</option>'; }));
  return o;
}
function cmHtml(){
  let h = '<div class="ph"><h2>Comentarios sobre comisiones</h2><div class="rule">Contá cómo te fue en la comisión que cursaste y leé lo que cuentan los demás. Tu comentario lo ven los otros alumnos con tu nombre y quien administra puede borrarlo.</div></div>';
  if(ENV.mode!=='db') return h+'<div class="empty-msg">Los comentarios necesitan tu cuenta conectada. <button class="btn mini primary" data-login="1">Entrar con Google</button></div>';
  const my = Object.keys(S.sel).filter(k=>S.sel[k].c);
  h += '<div class="cmbox">';
  if(my.length) h += '<div class="stl">Tus comisiones</div><div class="pers">'+my.map(k=>{ const e=S.sel[k]; return '<button class="per" data-cmk="'+k+'" data-cmc="'+esc(e.p+'|'+e.c)+'">'+esc(niceName(byKey.get(k).name))+' · com. '+esc(e.c)+'</button>'; }).join('')+'</div>';
  h += '<label class="cmq">'+(my.length?'O buscá otra materia':'Buscá la materia')+'<input id="cm-q" type="search" placeholder="Nombre o código" value="'+esc(UI.cm.q)+'" autocomplete="off"></label>';
  const nq = normTxt(UI.cm.q);
  if(nq.length>=2){ const res = DATA.filter(c=>c.nn.includes(nq) || c.code.toLowerCase()===nq).slice(0,8); h += '<div class="pers">'+(res.length?res.map(c=>'<button class="per" data-cmk="'+c.key+'">'+esc(niceName(c.name))+' <span class="mono">'+c.code+'</span></button>').join(''):'<span class="rule">Ninguna materia coincide.</span>')+'</div>'; }
  const c = UI.cm.k ? byKey.get(UI.cm.k) : null;
  if(c){
    h += '<div class="cmsel"><b>'+esc(niceName(c.name))+'</b> <span class="mono">'+c.code+' · '+esc(DEPN[c.dep])+'</span></div>'+
      '<div class="pform2"><label>Comisión que cursaste<select id="cm-com"><option value="">— Elegí —</option>'+cmOpts(c)+'</select></label>'+
      '<label>Tu puntaje<select id="cm-r">'+[0,5,4,3,2,1].map(v=>'<option value="'+v+'"'+(UI.cm.r===v?' selected':'')+'>'+(v?stars(v):'Sin puntaje')+'</option>').join('')+'</select></label>'+
      '<label class="wide">Tu comentario<textarea id="cm-t" maxlength="600" rows="4" placeholder="Cómo fue la cursada, el docente, la carga de trabajo, los horarios…">'+esc(UI.cm.t)+'</textarea></label>'+
      '<button class="btn primary wide" data-cmpost="1"'+(CM.busy?' disabled':'')+'>Publicar comentario</button></div>';
    h += '<div class="c2h" style="margin-top:18px"><h3>Lo que dicen los alumnos</h3><button class="btn" data-cmrefresh="1">Actualizar</button></div>';
    if(CM.status==='load' || CM.status==='idle') h += '<div class="empty-msg">Cargando comentarios…</div>';
    else if(CM.status==='err') h += '<div class="empty-msg">No se pudieron leer los comentarios. Probá con Actualizar.</div>';
    else {
      const L = CM.items.filter(i=>i.k===c.key && (ENV.admin || !isHid(i))).sort((a,b)=>((b.p+'|'+b.c===UI.cm.pc)-(a.p+'|'+a.c===UI.cm.pc)) || b.at-a.at);
      h += L.length ? L.map(i=>{ const m = comOf(i.k,i.p,i.c); return '<article class="cmi"><div class="cmh"><b>'+esc(nameOf(i.uid))+'</b>'+(i.r?'<span class="stars" aria-label="'+i.r+' de 5">'+stars(i.r)+'</span>':'')+'<span class="mono">'+(i.at?esc(new Date(i.at).toLocaleDateString('es-AR')):'')+'</span></div><div class="cmt">'+esc(m?(PERLBL[i.p]+' · Com. '+m[0]+' · '+m[2]):'Comisión '+i.c)+'</div><p>'+esc(i.t)+'</p>'+((i.uid===ENV.uid||ENV.admin)?'<button class="go" data-cmdel="'+esc(i.uid+'|'+i.id)+'">Borrar</button>':'')+(ENV.admin?'<button class="go" data-cmhide="'+esc(i.uid+'|'+i.id)+'">'+(isHid(i)?'Mostrar de nuevo':'Ocultar')+'</button>'+(isHid(i)?'<span class="tag bad">Oculto para los alumnos</span>':''):'')+'</article>'; }).join('') : '<div class="empty-msg">Todavía nadie comentó esta materia. ¡Sé el primero!</div>';
    }
  }
  return h+'</div>';
}


/* render */
const R = { total(){
  const n = totals(), got = n.got, r=26, C=2*Math.PI*r;
  let cum = 0, arcs = '';
  [[n.apr,'var(--c-apr)'],[n.anot,'var(--c-cur)'],[n.plan,'var(--c-pla)']].forEach(([v,col]) => {
    if(v<=0) return; const len = C*v/69;
    arcs += '<circle cx="32" cy="32" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="7" stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" stroke-dashoffset="'+(-cum).toFixed(2)+'" transform="rotate(-90 32 32)"/>';
    cum += len;
  });
  document.getElementById('total').innerHTML =
   '<svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="'+n.apr+' aprobados, '+n.anot+' cursando, '+n.plan+' por cursar, de 69 puntos"><circle cx="32" cy="32" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="7"/>'+arcs+'</svg>'+
   '<div><div class="big">'+got+'<small>/69 pts</small></div><div class="lbl">'+(got>=69?'Los 69 puntos están completos':'Faltan '+(69-got)+' puntos')+'</div></div>';
  return n;
},
mot(n){
  const m = motOf(n.got);
  document.getElementById('mot').innerHTML = '<div class="mq">'+esc(m.msg)+'</div><div class="mn"><span><i class="dot d1"></i>'+n.apr+' pts aprobados</span><span><i class="dot d2"></i>'+n.anot+' cursando</span><span><i class="dot d3"></i>'+n.plan+' por cursar</span></div><div class="stack" role="img" aria-label="Progreso: '+n.apr+' aprobados, '+n.anot+' cursando, '+n.plan+' por cursar, de 69 puntos"><i class="s1" style="width:'+(100*n.apr/69)+'%"></i><i class="s2" style="width:'+(100*n.anot/69)+'%"></i><i class="s3" style="width:'+(100*n.plan/69)+'%"></i></div>';
  return m;
},
ori(){
  const hs = Object.keys(S.hist).filter(o=>o!==S.ori && Object.keys(S.hist[o]).length).length;
  document.getElementById('ori').innerHTML = '<div><span class="eyebrow" style="display:block;margin:0 0 4px">Tu orientación</span><span class="oname">'+esc(ORI[S.ori].n)+'</span>'+(hs?'<span class="hs"> · tenés avance guardado de '+hs+' orientación'+(hs>1?'es':'')+' anterior'+(hs>1?'es':'')+'</span>':'')+'</div><div class="obtns"><button class="btn" data-lista="1">Mis materias</button><button class="btn" data-prevopen="1">+ Materia anterior</button><button class="btn" data-change="1">Cambiar orientación</button></div>';
},
user(){
  const e = document.getElementById('me'), first = ENV.name ? ENV.name.split(' ')[0] : '';
  document.getElementById('hello').textContent = first ? 'Hola, '+first : 'Fixture del CPO';
  if(ENV.mode==='db') e.innerHTML = '<b>'+esc(first||'Tu cuenta')+'</b><span id="sv" class="sv">'+statusText()+'</span><button class="btn mini" data-logout="1">Salir</button>';
  else if(ENV.mode==='local') e.innerHTML = '<b>Sin cuenta conectada</b><span id="sv" class="sv warn">Se guarda solo en este navegador</span><button class="btn mini primary" data-login="1">Entrar con Google</button>';
  else e.innerHTML = '';
},
gate(){
  document.getElementById('gate').innerHTML = '<h2>¡Bienvenido/a'+(ENV.name?', '+esc(ENV.name.split(' ')[0]):'')+'!</h2><p class="rule">Para empezar, elegí la orientación que estás cursando. Es tu orientación base: más adelante podés cambiarla con un botón y lo que cargaste en la anterior queda guardado.</p><div class="ogrid">'+
    Object.keys(ORI).map(k=>{ const o=ORI[k]; return '<button class="ocard" data-setori="'+k+'"><span class="on">'+esc(o.n)+'</span><span class="od">Derivados en '+esc(o.dd.map(d=>DEPN[d]).join(' y '))+'</span></button>'; }).join('')+'</div>';
},
modal(){
  const el = document.getElementById('modal');
  const mode = !S.ori ? null : (UI.modal || (UI.changing ? 'change' : null));
  if(!mode){ el.hidden = true; el.innerHTML = ''; return; }
  const dlg0 = el.querySelector('.dlg'), sc0 = dlg0 && el.dataset.mode===mode ? dlg0.scrollTop : 0; el.dataset.mode = mode;
  const pvAct = document.activeElement && document.activeElement.id==='pv-q' ? document.activeElement.selectionStart : null;
  queueMicrotask(() => { const d = el.querySelector('.dlg'); if(d && sc0) d.scrollTop = sc0; if(pvAct!==null){ const q = document.getElementById('pv-q'); if(q){ q.focus(); q.setSelectionRange(pvAct, pvAct); } } });
  el.hidden = false;
  if(mode==='welcome'){
    el.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">¿Ya cursaste materias del CPO?</h2><p class="rule">Si ya tenés materias aprobadas de años anteriores, buscalas ahora en las ofertas anteriores (o cargalas a mano) y el tablero las suma. Si preferís, podés hacerlo después con el botón <b>+ Materia anterior</b>.</p><div class="actions" style="margin-top:14px"><button class="btn primary" data-welcome="yes">Sí, quiero cargarlas</button><button class="btn" data-welcome="no">No, empiezo de cero</button></div></div>';
  } else if(mode==='list'){
    const L = listData();
    el.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Mis materias</h2><p class="rule">Todo lo que cargaste, separado por estado.</p>'+
      [['apr','Aprobadas',1],['anot','Cursando',2],['plan','Por cursar',3]].map(([k,tt,d])=>{ const g = L[k], pts = g.reduce((s,x)=>s+(x.pts||0),0);
        return '<section class="lg"><h3><i class="dot d'+d+'"></i>'+tt+' <span class="mono">'+g.length+' materia'+(g.length===1?'':'s')+' · '+pts+' pts</span></h3>'+(g.length?'<ul>'+g.map(x=>'<li><b>'+esc(x.name)+'</b><span>'+esc(x.sub)+'</span></li>').join('')+'</ul>':'<p class="emp">Todavía no hay ninguna.</p>')+'</section>'; }).join('')+
      '<div class="actions" style="margin-top:14px"><button class="btn" data-prevopen="1">+ Materia anterior</button><button class="btn primary" data-close="1">Cerrar</button></div></div>';
  } else if(mode==='prev'){
    if(UI.pv.status==='idle') pvInit();
    const hasPv = UI.pv.status==='ok' && UI.pv.ofertas.length, waitPv = UI.pv.status==='idle' || UI.pv.status==='loading';
    const yr = new Date().getFullYear(); let ys = ''; for(let y=yr; y>=2005; y--) ys += '<option value="'+y+'">'+y+'</option>';
    const opts = PREV_BLOCKS.map(id=>bl(id)).filter(Boolean).map(b=>'<option value="'+b.id+'">'+esc(b.name)+'</option>').join('');
    const deps = '<option value="">— Elegí —</option>'+PREV_DEPS.map(d=>'<option value="'+d+'">'+esc(DEPN[d])+'</option>').join('');
    const mine = S.prev.filter(prevVisible);
    el.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Materias de años anteriores</h2><p class="rule">'+(hasPv ? 'Buscá las materias que ya aprobaste en ofertas anteriores: los puntos y el segmento se completan solos.' : 'Cargá una materia que ya aprobaste. Se cuenta como aprobada en el segmento que elijas.')+' Práctica Profesional, obligatorias e idioma se cargan en sus propias secciones.</p>'+
      pvHtml()+
      (waitPv ? '' : hasPv ? '<details class="pvman"'+(UI.pv.man?' open':'')+'><summary>¿No la encontrás? Cargala a mano</summary>' : '')+
      (waitPv ? '' : '<form id="prevf" class="pf"><label>Nombre de la materia<input name="name" required maxlength="120" autocomplete="off"></label>'+
      '<label>Segmento al que pertenece<select name="b">'+opts+'</select></label>'+
      '<label>Departamento <span class="hint">(importante en derivados y libres)</span><select name="dep">'+deps+'</select></label>'+
      '<div class="two"><label>Puntos que vale<input name="pts" type="number" min="1" max="20" step="1" inputmode="numeric" required></label><label>Año en que la cursaste<select name="year">'+ys+'</select></label></div>'+
      '<div class="why" id="preverr" role="alert"></div><button class="btn primary" type="submit">Agregar materia</button></form>')+(!waitPv && hasPv ? '</details>' : '')+
      '<h3 class="pl">Ya cargadas ('+mine.length+')</h3>'+(mine.length?'<ul class="pls">'+mine.map(x=>{ const b = bl(x.b); return '<li><div><b>'+esc(x.name)+'</b><span>'+esc((x.k?x.k+' · ':'')+(b?b.name:'')+' · '+x.pts+' pts · '+(x.p&&PERLBL[x.p]?PERLBL[x.p].toLowerCase()+' ':'año ')+x.year)+'</span></div><button class="btn" data-delprev="'+esc(x.id)+'" aria-label="Quitar '+esc(x.name)+'">Quitar</button></li>'; }).join('')+'</ul>':'<p class="emp">Todavía no cargaste ninguna.</p>')+
      '<div class="actions" style="margin-top:14px"><button class="btn primary" data-close="1">Listo</button></div></div>';
  } else if(mode==='tour'){
    el.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Cómo se usa, en 3 pasos</h2><ol class="tour"><li><b>Cargá lo que ya cursaste.</b><span>Con "Materia anterior" sumás lo que ya hiciste, incluidas derivadas y libres.</span></li><li><b>Elegí tus cursos y comisión.</b><span>En cada bloque tocá el período del curso y elegí la comisión. Te avisa si chocan los horarios o si te pasás de puntos.</span></li><li><b>Marcá el estado.</b><span>"Lo pienso cursar", "Lo estoy cursando" o "Aprobada". Tu avance aparece en Mi progreso.</span></li></ol><div class="actions" style="margin-top:14px"><button class="btn primary" data-tourdone="1">Empezar</button></div></div>';
  } else if(mode==='limit'){
    const m = UI.limMsg || {t:'', d:''};
    el.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Llegaste al límite de puntos</h2><p class="limt">'+esc(m.t)+'</p>'+(m.d?'<p class="rule">'+esc(m.d)+'</p>':'')+'<p class="rule">El curso quedó en su estado anterior. El nivel de idioma y los 19 puntos de la Práctica Profesional no se tienen en cuenta para este límite.</p><div class="actions" style="margin-top:14px"><button class="btn primary" data-close="1">Entendido</button></div></div>';
  } else {
    el.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Cambiar de orientación</h2><p class="rule">No perdés nada: tu avance en <b>'+esc(ORI[S.ori].n)+'</b> queda guardado. En la nueva orientación se cargan solos los cursos que ya tenías y que le sirven.</p><div class="olist">'+
      Object.keys(ORI).filter(k=>k!==S.ori).map(k=>{
        const sim = simulateSwitch(k), had = Object.keys(S.hist[k]||{}).length;
        const bits = [];
        if(had) bits.push('Tenés '+had+' curso'+(had>1?'s':'')+' guardado'+(had>1?'s':'')+' de antes en esta orientación.');
        bits.push(sim.n ? 'Se aprovecharían '+sim.n+' materia'+(sim.n>1?'s':'')+' ('+sim.pts+' pts) de lo que ya cargaste.' : 'Ninguna de las materias actuales se podría aprovechar.');
        return '<button class="ocard" data-switch="'+k+'"><span class="on">'+esc(ORI[k].n)+'</span><span class="od">'+esc(bits.join(' '))+'</span></button>';
      }).join('')+'</div><div class="actions" style="margin-top:14px"><button class="btn" data-close="1">Cancelar</button></div></div>';
  }
},
blocks(){
  let h = '<button class="bk'+(UI.active==='sum'?'':'')+'" data-b="sum" aria-current="'+(UI.active==='sum')+'"><span class="nm">Mi progreso</span><span class="pt"></span></button>';
  let g = '';
  BL.forEach(b => {
    if(b.grp!==g){ g=b.grp; h += '<div class="sep">'+esc(g)+'</div>'; }
    const u = apOf(b), done = u>=b.cap;
    h += '<button class="bk'+(done?' done':'')+'" data-b="'+b.id+'" aria-current="'+(UI.active===b.id)+'"><span class="nm">'+esc(b.name)+'</span><span class="pt">'+(done?'✓ ':'')+u+'/'+b.cap+'</span><span class="bar">'+stackBar(b)+'</span></button>';
  });
  if(!S.ori) h = h.replace('<div class="sep">Fuera de la orientación</div>','<div class="sep">Orientación</div><div class="note" style="margin:0 0 2px">Elegí la orientación para ver principales, derivados, libres y constitucional.</div><div class="sep">Fuera de la orientación</div>');
  { const nc = calItems().out.length ? calItems().out.reduce((a,x)=>a.add(x.k),new Set()).size : 0; h += '<div class="sep">Herramientas</div><button class="bk" data-b="cal" aria-current="'+(UI.active==='cal')+'"><span class="nm">Calendario semanal</span><span class="pt">'+(nc?nc+' curso'+(nc>1?'s':''):'')+'</span></button><details class="navmore" data-sec="navmore"'+((UI.sec.navmore===true||UI.active==='sug'||UI.active==='fav')?' open':'')+'><summary>Más herramientas</summary><button class="bk" data-b="sug" aria-current="'+(UI.active==='sug')+'"><span class="nm">Armar mi cursada</span><span class="pt"></span></button><button class="bk" data-b="fav" aria-current="'+(UI.active==='fav')+'"><span class="nm">Mis favoritos</span><span class="pt">'+(S.fav.length||'')+'</span></button></details>'; }
  h += '<div class="sep">Comunidad</div><button class="bk" data-b="cm" aria-current="'+(UI.active==='cm')+'"><span class="nm">Comentarios de comisiones</span><span class="pt"></span></button>';
  document.getElementById('blocks').innerHTML = h;
},
sum(){
  let h = '<div class="ph"><h2>Mi progreso</h2><div class="rule">Cada bloque con los puntos que faltan y el departamento donde tenés que buscarlos. Tocá un bloque para ver los cursos que sirven.</div></div>';
  BL.forEach(b => {
    const u = apOf(b), left = b.cap-u;
    let det = '';
    if(left>0){
      if(b.manual==='obl'){ const f = OBLIG.filter(o=>!S.obl.includes(o[0])); det = '<ul>'+f.map(o=>'<li>'+esc(o[1])+' ('+o[3]+' pts)</li>').join('')+'</ul>'; }
      else if(b.manual==='idi'){ det=''; }
      else if(b.eligible){
        const ss = slotState(b).filter(x=>x.u<x.s.cap);
        if(b.id==='op'){
          const o = ORI[S.ori];
          const miss = o.fx.filter(k=>!S.sel[k]).map(k=>niceName(byKey.get(k).name)+' ('+(byKey.get(k).periods[0].pts)+' pts)');
          o.ch.forEach(g=>{ if(!g.some(k=>S.sel[k])) miss.push('Elegir uno: '+g.map(k=>niceName(byKey.get(k).name)).join(' o ')); });
          det = '<ul>'+miss.map(m=>'<li>'+esc(m)+'</li>').join('')+'</ul>';
        } else if(ss.length>1 || b.id==='pr' || b.id==='od'){
          det = '<ul>'+ss.map(x=>'<li>'+esc(x.s.label)+': '+(x.s.cap-x.u)+' pts</li>').join('')+'</ul>';
        } else if(b.libre){
          const dd = libDeps();
          det = '<ul><li>Repartidos en al menos 2 departamentos (hoy tenés '+dd.size+').</li></ul>';
        }
      }
    }
    h += '<div class="sumrow"><div><div class="nm">'+esc(b.name)+'</div>'+
      (left>0 ? '<div class="need">Faltan '+left+' pts · '+esc(b.dept)+'</div>' : '<div class="okt">Completo</div>')+'</div>'+
      '<div class="pt">'+u+'/'+b.cap+'</div>'+det+(left>0?'<button class="go" data-b="'+b.id+'">Ver</button>':'')+'</div>';
  });
  const picked = Object.keys(S.sel);
  if(picked.length){
    h += '<div class="ph" style="border-top:1px solid var(--line)"><h2 style="font-size:18px">Mi plan</h2></div>';
    BL.filter(b=>b.eligible).forEach(b => {
      const ks = entriesOf(b.id); if(!ks.length) return;
      h += '<div class="sumrow"><div class="nm">'+esc(b.name)+'</div><div class="pt">'+usedOf(b.id)+' pts</div><ul style="color:var(--ink)">'+ks.map(k=>{const c=byKey.get(k),p=c.periods.find(x=>x.id===S.sel[k].p);const e=S.sel[k], m=e.c?comOf(k,e.p,e.c):null; return '<li>'+esc(niceName(c.name))+' <span class="mono" style="color:var(--muted)">'+c.code+' · '+PERLBL[p.id]+' · '+p.pts+' pts · '+ST[e.st||'plan']+(m?' · com. '+esc(m[0])+' ('+esc(hh(m[3]))+')':'')+'</span></li>';}).join('')+'</ul></div>';
    });
  }
  return dashHtml()+'<details class="card2 todo sec" data-sec="todo"'+(secOpen('todo',false)?' open':'')+'><summary>Detalle por bloque y mi plan</summary>'+h+'</details>';
},
manual(b){
  let h = head(b);
  if(b.manual==='prac'){
    h += pracHtml();
  } else if(b.manual==='obl'){
    h += '<div class="list">'+OBLIG.map(o=>{const on=S.obl.includes(o[0]);return '<div class="card'+(on?' sel':'')+'"><div class="ct"><span class="cn">'+esc(o[1])+'</span><span class="mono" style="color:var(--muted)">'+o[2]+' · '+o[3]+' pts</span></div><div class="pers"><button class="per" data-obl="'+o[0]+'" aria-pressed="'+on+'">'+(on?'Marcada como cursada':'Marcar como cursada')+'</button></div></div>';}).join('')+'</div>';
  } else {
    h += '<div class="list"><div class="card'+(S.idi?' sel':'')+'"><div class="ct"><span class="cn">Lecto-comprensión de textos jurídicos en lengua extranjera</span><span class="mono" style="color:var(--muted)">cuatrimestral</span></div><div class="pers"><button class="per" data-idi="1" aria-pressed="'+S.idi+'">'+(S.idi?'Aprobada':'Marcar como aprobada')+'</button></div></div></div>';
  }
  return h;
}};
function blockStates(b){
  let a = 0, n = 0, p = 0;
  if(b.manual==='prac'){ S.pra.forEach(x => { if(x.st==='apr') a += x.pts; else if(x.st==='anot') n += x.pts; else p += x.pts; }); }
  else if(b.manual){ a = manualUsed(b.id); }
  else { a = prevPts(b.id); entriesOf(b.id).forEach(k => { const e = S.sel[k], pt = ptsOf(k, e.p); if(e.st==='apr') a += pt; else if(e.st==='anot') n += pt; else p += pt; }); }
  a = Math.min(a, b.cap); n = Math.min(n, b.cap-a); p = Math.min(p, b.cap-a-n);
  return {a, n, p};
}
function stackBar(b, dim){
  const s = blockStates(b), d = dim || 'width';
  return [['s1',s.a],['s2',s.n],['s3',s.p]].filter(x=>x[1]>0).map(x=>'<i class="'+x[0]+'" style="'+d+':'+(100*x[1]/b.cap)+'%"></i>').join('');
}
const VBL = {op:'Principales',od:'Derivados',lb:'Libres',co:'Const.',in:'Integr.',so:'Cs. Soc.',fi:'Filosofía',pr:'Procesal',pp:'Práctica'};
function dashHtml(){
  const n = totals(), left = Math.max(0, 69-n.got);
  const bars = BL.filter(b=>!b.outside);
  const open = bars.filter(b=>b.cap-apOf(b)>0).sort((a,b)=>(b.cap-apOf(b))-(a.cap-apOf(a)));
  const nx = open[0];
  const tiles = [['Aprobadas',n.apr,'t-apr','data-lista="1"'],['Cursando',n.anot,'t-cur','data-lista="1"'],['Por cursar',n.plan,'t-pla','data-lista="1"'],['Te faltan',left,'t-fal',nx?'data-b="'+nx.id+'"':'data-lista="1"']];
  let h = '<div class="tiles">'+tiles.map(([l,v,cl,at])=>'<button class="tile '+cl+'" '+at+'><span class="tl">'+l+'</span><span class="tn">'+v+'<small>pts</small></span><span class="td">'+(l==='Te faltan'?'Ir al bloque':'Ver detalle')+'</span></button>').join('')+'</div>';
  h += '<div class="dgrid"><section class="card2"><div class="c2h"><h3>Progreso por bloque</h3><span class="chipx">'+n.got+' de 69 pts</span></div><div class="lgd lgd2"><span><i class="dot d1"></i>Aprobadas</span><span><i class="dot d2"></i>Cursando</span><span><i class="dot d3"></i>Por cursar</span></div><div class="vbars">'+
    bars.map(b=>{ const u = apOf(b); return '<button class="vb'+(u>=b.cap?' done':'')+'" data-b="'+b.id+'" aria-label="'+esc(b.name)+': '+u+' de '+b.cap+' puntos"><span class="vbv">'+u+'/'+b.cap+'</span><span class="vbt">'+stackBar(b,'height')+'</span><span class="vbl">'+esc(VBL[b.id]||b.short||b.name)+'</span></button>'; }).join('')+'</div></section>'+
    '<section class="card2 insight"><div class="c2h"><h3>Siguiente paso</h3></div>'+(nx ? '<div class="ins"><span class="ico">★</span><div><b>'+esc(nx.name)+'</b><p>Te faltan '+(nx.cap-apOf(nx))+' pts · '+esc(nx.dept)+'.</p></div></div><button class="btn primary wide" data-b="'+nx.id+'">Ver cursos que sirven</button>' : '<div class="ins"><span class="ico">✓</span><div><b>¡Todos los bloques completos!</b><p>Confirmalo con la Secretaría.</p></div></div>')+'</section></div>';
  h += metaDatesHtml()+cargaHtml();
  const order = {anot:0, plan:1, apr:2};
  const act = Object.keys(S.sel).map(k=>({k, e:S.sel[k]})).sort((a,b)=>order[a.e.st||'plan']-order[b.e.st||'plan']);
  const first = (BL.find(b=>b.eligible && b.cap>used(b.id)) || BL[0]);
  h += '<section class="card2"><div class="c2h"><h3>Mis cursos</h3><button class="btn" data-lista="1">Ver todas mis materias</button></div><div class="mcs">'+
    act.slice(0,6).map(({k,e})=>{ const c = byKey.get(k), m = e.c ? comOf(k,e.p,e.c) : null, st = e.st||'plan';
      return '<article class="mc m-'+st+'"><span class="mcs1">'+ST[st]+'</span><b>'+esc(niceName(c.name))+'</b><span class="mcm">'+esc(c.code+' · '+PERLBL[e.p]+' · '+ptsOf(k,e.p)+' pts')+'</span><span class="mcm">'+(m?esc('Com. '+m[0]+' · '+hh(m[3])):'Todavía sin comisión')+'</span><button class="go" data-b="'+e.b+'">Ver en su bloque</button></article>'; }).join('')+
    (first ? '<button class="mc add" data-b="'+first.id+'">+ Elegir un curso</button>' : '')+'</div></section>';
  const ex = extrasSum();
  if(ex) h += '<details class="card2 sec" data-sec="avisos"'+(secOpen('avisos', !!(UI.carry||CLK.size))?' open':'')+'><summary><h3>Avisos</h3></summary>'+ex+'</details>';
  return h;
}
function extrasSum(){
  let h = '';
  if(UI.carry){
    const c = UI.carry;
    h += '<div class="sumrow carry"><div><div class="nm">Cambiaste a '+esc(ORI[c.to].n)+'</div>'+(c.items.length?'<div class="okt">Se aprovecharon '+c.items.length+' curso'+(c.items.length>1?'s':'')+' ('+c.pts+' pts) de '+esc(ORI[c.from].n)+'.</div>':'<div class="need">Ninguno de los cursos anteriores se podía aprovechar. Siguen guardados por si volvés.</div>')+'</div><button class="go" data-dismiss="carry">Cerrar</button>'+(c.items.length?'<ul>'+c.items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+'</div>';
  }
  const cl = allClashes(), withCom = Object.keys(S.sel).filter(k=>S.sel[k].c).length, noCom = Object.keys(S.sel).length - withCom;
  if(cl.length) h += '<div class="sumrow clash"><div><div class="nm">⚠ Choques de horario ('+cl.length+')</div><div class="need">Estas comisiones coinciden en día y hora. Cambiá la comisión de alguna.</div></div><div class="pt"></div><ul>'+cl.map(x=>'<li>'+esc(niceName(byKey.get(x.a).name))+' y '+esc(niceName(byKey.get(x.b).name))+' · '+esc(x.when)+'</li>').join('')+'</ul></div>';
  else if(withCom>=2) h += '<div class="sumrow"><div><div class="okt">✓ Sin choques de horario entre las comisiones que elegiste</div></div></div>';
  if(noCom) h += '<div class="sumrow"><div><div class="need">Te faltan elegir comisión en '+noCom+' curso'+(noCom>1?'s':'')+'. Elegila en cada curso para chequear los horarios.</div></div></div>';
  [1,2].forEach(sem=>{ const L = cursandoLoad(sem); const ov = L.tot>LIM_CUA || L.b[0]>LIM_BIM+1e-9 || L.b[1]>LIM_BIM+1e-9; if(ov) h += '<div class="sumrow clash"><div><div class="nm">⚠ Te pasaste del límite de puntos cursando ('+OFLBL[String(sem)].replace('del ','')+')</div><div class="need">El máximo es de '+LIM_BIM+' puntos por bimestre y '+LIM_CUA+' por cuatrimestre. Pasá algún curso a "Lo pienso cursar".</div></div></div>'; });
  const olds = Object.keys(S.hist).filter(o=>o!==S.ori && Object.keys(S.hist[o]).length);
  if(olds.length) h += '<div class="sumrow"><div><div class="nm">Avance guardado de otras orientaciones</div></div><div class="pt"></div><ul>'+olds.map(o=>'<li>'+esc(ORI[o].n)+': '+Object.keys(S.hist[o]).length+' curso'+(Object.keys(S.hist[o]).length>1?'s':'')+'</li>').join('')+'</ul></div>';
  return h;
}
function segBtns(attr, cur, pre){
  return Object.keys(ST).map(k => '<button class="sgb s-'+k+'" '+attr+'="'+pre+k+'" aria-pressed="'+(cur===k)+'">'+ST[k]+'</button>').join('');
}
function pracHtml(){
  const left = 19 - praSum(), F = UI.prF;
  let h = '<div class="prbox">';
  if(left>0){
    h += '<div class="pform2"><div class="wide fixp"><span class="stl">Puntos de Práctica Profesional</span><b>'+left+' puntos</b><span class="rule">Fijos: la Práctica vale siempre 19 puntos y se cursa completa.</span></div>'+
      '<div class="stw wide"><span class="stl">¿En qué estado está tu Práctica?</span><div class="seg" role="group" aria-label="Estado de la Práctica">'+segBtns('data-prpick', F.st, '')+'</div></div>'+
      '<button class="btn primary wide" data-pradd="1">Agregar mi Práctica Profesional</button></div>';
  } else h += '<div class="note">Ya completaste los 19 puntos de Práctica Profesional.</div>';
  if(S.pra.length) h += '<ul class="prl">'+S.pra.map(x=>'<li class="m-'+x.st+'"><div><b>'+esc(x.name||'Práctica Profesional')+'</b><span>'+x.pts+' pto'+(x.pts>1?'s':'')+'</span></div><div class="seg sm" role="group" aria-label="Cambiar estado">'+segBtns('data-prset', x.st, x.id+'|')+'</div><button class="go" data-prdel="'+esc(x.id)+'">Quitar</button></li>').join('')+'</ul>';
  return h+'</div>';
}
function head(b){
  const u = apOf(b);
  let h = '<div class="ph"><h2>'+esc(b.name)+'</h2><div class="rule">'+b.rule+'</div><div class="meter"><div class="bar'+(u>=b.cap?' ok':'')+'">'+stackBar(b)+'</div><span class="mono">'+u+' / '+b.cap+' pts</span></div>';
  if(b.eligible && b.slots.length>1){
    h += '<div class="slots">'+slotState(b).map(x=>'<span class="slot '+(x.u>=x.s.cap?'ok':(x.s.req?'need':''))+'">'+(x.u>=x.s.cap?'✓ ':'')+esc(x.s.label)+' · '+x.u+'/'+x.s.cap+'</span>').join('')+'</div>';
  }
  if(b.libre){ const dd = libDeps(); h += '<div class="slots"><span class="slot '+(dd.size>=2?'ok':'')+'">'+(dd.size>=2?'✓ ':'')+'Departamentos distintos: '+dd.size+' (mínimo 2)</span></div>'; }
  if(b.note) h += '<div class="note">'+esc(b.note)+'</div>';
  return h+'</div>';
}
function mineHtml(c, s){
  const p = c.periods.find(x=>x.id===s.p); if(!p) return '';
  const cur = s.c ? comOf(c.key, s.p, s.c) : null;
  const opts = '<option value="">Todavía no elegí comisión</option>'+p.coms.map(m=>{
    const cl = clashOf(c.key, s.p, m[3]);
    return '<option value="'+esc(m[0])+'"'+(s.c===m[0]?' selected':'')+'>'+esc('Com. '+m[0]+' · '+m[2]+' · '+hh(m[3])+(m[1]==='R'?' · Remota':'')+(cl?' ⚠ choca con '+niceName(byKey.get(cl.k).name):''))+'</option>';
  }).join('');
  const cl0 = cur ? clashOf(c.key, s.p, cur[3]) : null;
  return '<div class="mine"><label>Comisión en la que me anoté<select data-com="'+c.key+'">'+opts+'</select></label><div class="stw"><span class="stl">Estado de este curso</span><div class="seg" role="group" aria-label="Estado del curso">'+Object.keys(ST).map(k=>'<button class="sgb" data-stv="'+c.key+'|'+k+'" aria-pressed="'+((s.st||'plan')===k)+'">'+ST[k]+'</button>').join('')+'</div></div></div>'+
    (cl0 ? '<div class="why">⚠ Esta comisión choca con '+esc(niceName(byKey.get(cl0.k).name))+' ('+esc(cl0.when)+').</div>' : '')+(s.c?'<button class="btn cmgo" data-cmgo="'+c.key+'">Comentarios de esta comisión</button>':'');
}
function courseCard(b, c){
  const sel = S.sel[c.key] && S.sel[c.key].b===b.id ? S.sel[c.key] : null;
  const grpOf = b.id==='op' && S.ori ? ORI[S.ori].ch.find(g=>g.includes(c.key)) : null;
  const isFixed = b.id==='op' && !grpOf;
  const ou = otherUse(c.key, b.id);
  const modS = c.mods.map(m=>m==='Remota'?'Remota':'Presencial').join(' / ');
  let pers = '', whyAll = '';
  const pl = shownP(c);
  pers = pl.map(p => {
    const on = sel && sel.p===p.id;
    const why = on ? null : canPick(b, c, p.id);
    const nCom = p.coms.length;
    return '<button class="per" data-pick="'+c.key+'" data-per="'+p.id+'" aria-pressed="'+on+'"'+(why?' disabled title="'+esc(why)+'"':'')+'>'+PERLBL[p.id]+' <span class="mono">'+p.pts+' pts · '+nCom+' com.</span></button>';
  }).join('');
  const reasons = !sel ? pl.map(p=>canPick(b,c,p.id)) : [];
  if(!sel && reasons.length && reasons.every(r=>r)) whyAll = '<div class="why">'+esc(reasons[0])+'</div>';
  const fOn = !!(UI.day||UI.turno||UI.doc);
  let coms = shownP(c).filter(p=>p.coms.some(comOk)).map(p => '<div class="cm"><div class="h">Comisión</div><div class="h">Mod.</div><div class="h">'+PERLBL[p.id]+' · docente y horario</div>'+p.coms.filter(comOk).map(m=>{ const cl = clashOf(c.key, p.id, m[3]), mineC = S.sel[c.key] && S.sel[c.key].p===p.id && S.sel[c.key].c===m[0]; return '<div class="mono">'+esc(m[0])+'</div><div>'+(m[1]==='R'?'Remota':'Presencial')+'</div><div>'+esc(m[2])+' · '+esc(hh(m[3]))+(mineC?' · <b>mi comisión</b>':'')+(cl?' <span class="bad">· ⚠ choca con '+esc(niceName(byKey.get(cl.k).name))+' ('+esc(cl.when)+')</span>':'')+'</div>'; }).join('')+'</div>').join('');
  const tema = (c.tema||[]).length ? '<span class="tag b">Tema: '+esc(niceName(c.tema[0]).replace(/,.*$/,''))+'</span>' : '';
  return '<article class="card'+(sel?' sel':'')+(sel?(sel.st==='apr'?' ap':sel.st==='anot'?' cu':' pl'):'')+(sel&&CLK.has(c.key)?' clash':'')+((!sel&&ou)?' dis':'')+'"><div class="ct"><span class="code">'+c.code+'</span><span class="cn">'+esc(niceName(c.name))+'</span>'+
    (sel&&CLK.has(c.key)?'<span class="tag bad">⚠ Choca con otro curso</span>':'')+(isFixed?'<span class="tag">Obligatorio</span>':'')+(grpOf?'<span class="tag">Elegí uno</span>':'')+tema+favBtn(c.key)+'</div>'+
    '<div class="meta"><span>'+esc(DEPN[c.dep])+'</span><span>'+modS+'</span>'+(c.intdp?'<span>Interdepartamental</span>':'')+'</div>'+
    '<div class="pers">'+pers+'</div>'+whyAll+(sel?mineHtml(c, sel):'')+'<details class="coms"'+(fOn?' open':'')+'><summary>Ver comisiones y horarios'+(fOn?' (con tus filtros)':'')+'</summary>'+coms+'</details></article>';
}
function renderBlock(b){
  if(b.manual) return R.manual(b);
  let h = head(b);
  const deps = [...new Set(b.eligible.map(c=>c.dep))];
  h += '<div class="tools"><input id="q" type="search" placeholder="Buscar por nombre o código" value="'+esc(UI.q)+'" aria-label="Buscar curso">'+
    '<select id="fof" aria-label="Oferta"><option value="2"'+(UI.of==='2'?' selected':'')+'>Segundo período 2026 (3.er y 4.º bimestre)</option><option value="1"'+(UI.of==='1'?' selected':'')+'>Primer período 2026</option><option value=""'+(UI.of===''?' selected':'')+'>Ambos períodos</option></select>'+'<select id="fper" aria-label="Período"><option value="">Todos los períodos</option>'+Object.keys(PERLBL).filter(k=>(!UI.of||String(PSEM[k])===UI.of) && b.eligible.some(c=>c.periods.some(p=>p.id===k))).map(k=>'<option value="'+k+'"'+(UI.per===k?' selected':'')+'>'+PERLBL[k]+'</option>').join('')+'</select>'+
    (deps.length>1?'<select id="fdep" aria-label="Departamento"><option value="">Todos los departamentos</option>'+deps.map(d=>'<option value="'+d+'"'+(UI.dep===d?' selected':'')+'>'+esc(DEPN[d])+'</option>').join('')+'</select>':'')+
    '<button class="btn mini mf" data-moref="1" aria-expanded="'+(moreOpen()?'true':'false')+'">'+(moreOpen()?'Menos filtros':'Más filtros'+(extraN()?' ('+extraN()+')':''))+'</button></div><div class="tools tools2"'+(moreOpen()?'':' hidden')+'>'+
    '<select id="fmod" aria-label="Modalidad"><option value="">Presencial o remota</option><option value="Presencial"'+(UI.mod==='Presencial'?' selected':'')+'>Con comisión presencial</option><option value="Remota"'+(UI.mod==='Remota'?' selected':'')+'>Con comisión remota</option></select>'+
    '<select id="fday" aria-label="Día"><option value="">Cualquier día</option>'+[1,2,3,4,5,6].map(d=>'<option value="'+d+'"'+(String(UI.day)===String(d)?' selected':'')+'>'+DNAME[d]+'</option>').join('')+'</select>'+
    '<select id="fturno" aria-label="Turno"><option value="">Cualquier turno</option><option value="M"'+(UI.turno==='M'?' selected':'')+'>Mañana (hasta las 13)</option><option value="T"'+(UI.turno==='T'?' selected':'')+'>Tarde (13 a 18)</option><option value="N"'+(UI.turno==='N'?' selected':'')+'>Noche (desde las 18)</option></select>'+
    '<input id="fdoc" type="search" placeholder="Docente" value="'+esc(UI.doc)+'" aria-label="Buscar docente"></div>';
  const nq = UI.q.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  let L = b.eligible.filter(c => (!nq || c.nn.includes(nq) || c.code.toLowerCase()===nq) && shownP(c).length>0 && (!UI.mod || shownP(c).some(p=>p.coms.some(m=>m[1]===(UI.mod==='Remota'?'R':'P')))) && (!UI.dep || c.dep===UI.dep) && courseOk(c));
  const shown = L.slice(0, UI.page*40);
  h += '<div class="cnt">'+L.length+' curso'+(L.length===1?'':'s')+' de la oferta '+OFLBL[UI.of]+(filtersOn()?' <button class="btn mini" data-clrf="1">Limpiar filtros</button>':'')+'</div><div class="ofnote">'+esc(OFERTA)+'</div><div class="list">'+(shown.length? shown.map(c=>courseCard(b,c)).join('') : '<div class="empty-msg">Ningún curso coincide con los filtros.</div>')+'</div>';
  if(L.length>shown.length) h += '<button class="btn more" data-more="1">Mostrar más ('+(L.length-shown.length)+')</button>';
  return h;
}
function render(){
  const aid = document.activeElement && (document.activeElement.id==='q' || document.activeElement.id==='fdoc' || document.activeElement.id==='cm-q') ? document.activeElement.id : null;
  const fid = aid ? document.activeElement.selectionStart : null;
  const $ = id => document.getElementById(id);
  const loading = ENV.mode==='load', gate = !loading && !S.ori;
  $('app').classList.toggle('nosd', loading || gate);
  BL = getBlocks(); CLK = new Set(allClashes().reduce((a,x)=>a.concat([x.a,x.b]),[]));
  $('boot').hidden = !loading; $('gate').hidden = !gate;
  ['hero','ori','main','side'].forEach(i => { $(i).hidden = loading || gate; }); $('stk').hidden = true;
  R.user();
  if(loading){ $('total').innerHTML = ''; return; }
  const n = R.total();
  if(gate){ R.gate(); R.modal(); return; }
  const m = R.mot(n);
  $('pct').innerHTML = '<span>Completado</span><b>'+Math.round(100*n.got/69)+'%</b><small>'+n.got+' de 69 puntos</small>';
  $('app').dataset.view = UI.active;
  $('stk').hidden = false;
  $('stk').innerHTML = '<b class="mono">'+n.got+'/69</b><div class="stack" role="img" aria-label="Progreso"><i class="s1" style="width:'+(100*n.apr/69)+'%"></i><i class="s2" style="width:'+(100*n.anot/69)+'%"></i><i class="s3" style="width:'+(100*n.plan/69)+'%"></i></div><span class="stm">'+(n.got>=69?'¡Completo!':'faltan '+(69-n.got))+'</span>';
  if(ENV.ready){ if(LAST.tier!==null && m.ti>LAST.tier) toast(m.msg); LAST.tier = m.ti; }
  R.ori(); R.blocks();
  if(UI.active==='adm') UI.active = 'sum'; // Alumnos y avisos se movieron a /3816
  if(UI.active!=='sum' && UI.active!=='adm' && UI.active!=='cm' && !['cal','sug','fav','shr'].includes(UI.active) && !bl(UI.active)) UI.active = 'sum';
  $('panel').innerHTML = bannerHtml() + (UI.active==='cal'||UI.active==='sum' ? '' : clashBanner()) + (UI.active==='cm' ? cmHtml() : UI.active==='cal' ? calHtml() : UI.active==='sug' ? sugHtml() : UI.active==='fav' ? favHtml() : UI.active==='shr' ? shrHtml() : UI.active==='sum' ? R.sum() : renderBlock(bl(UI.active)));
  R.modal();
  if(fid!==null){ const q=$(aid); if(q){ q.focus(); q.setSelectionRange(fid,fid); } }
}

/* eventos */
document.addEventListener('click', e => {
  if(e.target.id==='modal'){ closeModal(); return; }
  const t = e.target.closest('button'); if(!t) return;
  if(t.dataset.setori){ setOri(t.dataset.setori); return; }
  if(t.dataset.change){ UI.modal = 'change'; render(); return; }
  if(t.dataset.lista){ UI.modal = 'list'; render(); return; }
  if(t.dataset.prevopen){ UI.modal = 'prev'; render(); return; }
  if(t.dataset.welcome){ S.asked = true; save(); UI.modal = t.dataset.welcome==='yes' ? 'prev' : (S.toured ? null : 'tour'); render(); return; }
  if(t.dataset.pvopen){ UI.pv.open = UI.pv.open===t.dataset.pvopen ? null : t.dataset.pvopen; UI.pv.err = ''; const r = document.getElementById('pv-res'); if(r) r.innerHTML = pvResHtml(); return; }
  if(t.dataset.pvadd){ addPrevCourse(t.dataset.pvadd); return; }
  if(t.dataset.delprev){ S.prev = S.prev.filter(x=>x.id!==t.dataset.delprev); save(); render(); return; }
  if(t.dataset.close){ closeModal(); return; }
  if(t.dataset.switch){ applySwitch(t.dataset.switch); return; }
  if(t.dataset.stv){ const [k,v]=t.dataset.stv.split('|'); if(S.sel[k] && ST[v]) setSt(k,v); return; }
  if(t.dataset.dismiss){ UI.carry = null; render(); return; }
  if(t.dataset.fav){ const k=t.dataset.fav; S.fav = S.fav.includes(k) ? S.fav.filter(x=>x!==k) : S.fav.concat([k]); save(); render(); return; }
  if(t.dataset.favgo){ const [bid,code]=t.dataset.favgo.split('|'); UI.active=bid; UI.q=code; UI.per=UI.mod=UI.dep=UI.day=UI.turno=UI.doc=''; UI.of=''; UI.page=1; render(); return; }
  if(t.dataset.sgtog){ const [k,v]=t.dataset.sgtog.split('|'); const m = k==='d'?UI.sg.days:UI.sg.turnos; m[v] = m[v]?0:1; render(); return; }
  if(t.dataset.sgrun){ sgRun(); return; }
  if(t.dataset.sguse!==undefined){ const r = UI.sg.res && UI.sg.res[+t.dataset.sguse]; if(r){ let n=0; r.picks.forEach(x=>{ if(pickWith(x.b,x.k,x.p,x.c)) n++; }); normalize(); save(); toast(n+' curso'+(n===1?'':'s')+' agregado'+(n===1?'':'s')+' como "Lo pienso cursar".'); sgRun(); } return; }
  if(t.dataset.sgadd){ const [k,pid,com]=t.dataset.sgadd.split('|'); const cd = BL.find(b=>b.eligible && b.eligible.some(c=>c.key===k)); const e = (UI.sg.ideas||[]).flatMap(g=>g.items).find(x=>x.c.key===k); if(e && pickWith(e.b.id,k,pid,com)){ normalize(); save(); toast('Agregado como "Lo pienso cursar".'); sgRun(); } else toast('Ya no entra en ese bloque.'); return; }
  if(t.dataset.sharecopy){ const c = shareCode(); const done = () => toast('Código copiado.'); const fb = () => { const ta=document.createElement('textarea'); ta.value=c; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch(e){ toast('No se pudo copiar: seleccionalo a mano.'); } ta.remove(); }; if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(done, fb); else fb(); return; }
  if(t.dataset.sharego){ const r = readCode(UI.shr.in); UI.shr.res = r; if(!r) toast('No pude leer ese código. Pedile que lo copie de nuevo.'); render(); return; }
  if(t.dataset.cmhide){ if(!ENV.admin) return; const k=t.dataset.cmhide; CFG.hid = CFG.hid.includes(k) ? CFG.hid.filter(x=>x!==k) : CFG.hid.concat([k]); saveConfig().then(()=>render()); return; }
  if(t.dataset.moref){ UI.moref = !moreOpen(); render(); return; }
  if(t.dataset.tourdone){ S.toured = true; save(); UI.modal = null; render(); return; }
  if(t.dataset.clrf){ UI.q=UI.per=UI.mod=UI.dep=UI.day=UI.turno=UI.doc=''; UI.page=1; render(); return; }
  if(t.dataset.calp!==undefined){ UI.calp=t.dataset.calp; render(); return; }
  if(t.dataset.cals){ UI.cals=t.dataset.cals; UI.calp=''; render(); return; }
  if(t.dataset.b){ UI.active=t.dataset.b; UI.q=UI.per=UI.mod=UI.dep=UI.day=UI.turno=UI.doc=''; UI.page=1; render(); if(UI.active==='cm' && (CM.status==='idle' || CM.status==='err')) loadComments(); if(window.innerWidth<860) document.getElementById('panel').scrollIntoView({block:'start',behavior:'smooth'}); return; }
  if(t.dataset.cmk){ UI.cm.k = t.dataset.cmk; UI.cm.pc = t.dataset.cmc || ''; UI.cm.q = ''; render(); return; }
  if(t.dataset.cmgo){ const k = t.dataset.cmgo, e = S.sel[k]; UI.cm.k = k; UI.cm.pc = (e && e.c) ? e.p+'|'+e.c : ''; UI.cm.q = ''; UI.active = 'cm'; if(CM.status==='idle' || CM.status==='err') loadComments(); else render(); return; }
  if(t.dataset.cmpost){ postComment(); return; }
  if(t.dataset.cmrefresh){ loadComments(); return; }
  if(t.dataset.cmdel){ const [u,i] = t.dataset.cmdel.split('|'); delComment(u, i); return; }
  if(t.dataset.pick){ toggle(UI.active, t.dataset.pick, t.dataset.per); return; }
  if(t.dataset.more){ UI.page++; render(); return; }
  if(t.dataset.prpick){ UI.prF.st = t.dataset.prpick; render(); return; }
  if(t.dataset.pradd){
    const left = 19 - praSum(), pts = left;
    if(left<=0){ toast('Ya completaste los 19 puntos de Práctica.'); return; }
    S.pra.push({id:newId(), pts, st:UI.prF.st, name:''});
    UI.prF.name = ''; save(); render(); toast('Práctica agregada: '+pts+' puntos.'); return;
  }
  if(t.dataset.prset){ const [id,st] = t.dataset.prset.split('|'); const x = S.pra.find(y=>y.id===id); if(x && ST[st]){ x.st = st; save(); render(); } return; }
  if(t.dataset.prdel){ S.pra = S.pra.filter(x=>x.id!==t.dataset.prdel); save(); render(); return; }
  if(t.dataset.obl){ const i=t.dataset.obl; S.obl = S.obl.includes(i)? S.obl.filter(x=>x!==i) : S.obl.concat([i]); save(); render(); return; }
  if(t.dataset.idi){ S.idi=!S.idi; save(); render(); return; }
  if(t.id==='copy'){ copyPlan(); return; }
  if(t.id==='print'){ printPlan(); return; }
  if(t.id==='dlplan'){ saveFile('mi-plan-cpo.html', planHtml(), 'text/html').then(ok=>{ if(ok) toast('Plan descargado. Abrilo y guardalo como PDF desde el navegador.'); }); return; }
  if(t.id==='reset'){
    if(t.classList.contains('armed')){ const keepRev = S.rev; S = blank(); S.rev = keepRev; save(); UI.active='sum'; UI.carry=null; UI.q=UI.per=UI.mod=UI.dep=UI.day=UI.turno=UI.doc=''; UI.page=1; t.classList.remove('armed'); t.textContent='Borrar todo mi avance'; render(); toast('Avance borrado.'); }
    else { t.classList.add('armed'); t.textContent='Tocá de nuevo para borrar todo'; setTimeout(()=>{ t.classList.remove('armed'); t.textContent='Borrar todo mi avance'; },4000); }
  }
});
document.addEventListener('toggle', e => { if(e.target.classList && e.target.classList.contains('pvman')) UI.pv.man = e.target.open; }, true);
document.addEventListener('keydown', e => { if(e.key==='Escape' && (UI.changing || UI.modal)){ closeModal(); } });
document.addEventListener('submit', e => { if(e.target.id==='prevf'){ e.preventDefault(); addPrev(new FormData(e.target)); } });
document.addEventListener('input', e => {
  const id = e.target.id;
  if(id==='q'){ UI.q=e.target.value; UI.page=1; render(); }
  if(id==='fdoc'){ UI.doc=e.target.value; UI.page=1; render(); }
  if(id==='shr-in') UI.shr.in = e.target.value;
  if(id==='cm-q'){ UI.cm.q=e.target.value; render(); }
  if(id==='cm-t') UI.cm.t = e.target.value;
  if(id==='pr-name') UI.prF.name = e.target.value;
  if(id==='pv-q'){ UI.pv.q = e.target.value; UI.pv.open = null; const r = document.getElementById('pv-res'); if(r) r.innerHTML = pvResHtml(); }
});
document.addEventListener('change', e => {
  const d = e.target.dataset || {};
  if(e.target.id==='cm-com') UI.cm.pc = e.target.value;
  if(e.target.id==='pv-desde'){ S.desde = e.target.value; UI.pv.open = null; save(); pvLoad(); return; }
  if(e.target.id==='pv-b' || e.target.id==='pv-per'){ UI.pv.err = ''; const er = document.getElementById('pv-err'); if(er) er.textContent = ''; }
  if(e.target.id==='cm-r') UI.cm.r = +e.target.value;
  if(e.target.id==='pr-pts') UI.prF.pts = +e.target.value;
  if(e.target.id==='fper'){ UI.per=e.target.value; UI.page=1; render(); }
  if(e.target.id==='fof'){ UI.of=e.target.value; UI.per=''; UI.page=1; render(); }
  if(e.target.id==='fmod'){ UI.mod=e.target.value; UI.page=1; render(); }
  if(e.target.id==='fdep'){ UI.dep=e.target.value; UI.page=1; render(); }
  if(e.target.id==='sg-goal'){ UI.sg.goal = +e.target.value; }
  if(e.target.id==='sg-mod'){ UI.sg.mod = e.target.value; }
  if(e.target.id==='sg-sem'){ UI.sg.sem = e.target.value; }
  if(e.target.id==='goal-sel'){ S.goal = +e.target.value; save(); render(); }
  if(e.target.id==='fday'){ UI.day=e.target.value; UI.page=1; render(); }
  if(e.target.id==='fturno'){ UI.turno=e.target.value; UI.page=1; render(); }
  if(d.com && S.sel[d.com]){ if(e.target.value) S.sel[d.com].c = e.target.value; else delete S.sel[d.com].c; save(); render(); }
  if(d.st && S.sel[d.st] && ST[e.target.value]) setSt(d.st, e.target.value);
});

/* ===== v13: calendario, filtros, plan imprimible, estadísticas ===== */
let CLK = new Set();
const DNAME = {1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado',7:'Domingo'};
const nrm = x => String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const turnoOf = a => a<13*60 ? 'M' : a<18*60 ? 'T' : 'N';
const filtersOn = () => !!(UI.q||UI.per||UI.mod||UI.dep||UI.day||UI.turno||UI.doc);
function comOk(m){
  if(!UI.day && !UI.turno && !UI.doc) return true;
  if(UI.doc && !nrm(m[2]).includes(nrm(UI.doc))) return false;
  if(UI.day || UI.turno) return segs(m[3]).some(sg => (!UI.day || sg.d===+UI.day) && (!UI.turno || turnoOf(sg.a)===UI.turno));
  return true;
}
function shownP(c){ const sl = S.sel[c.key]; return c.periods.filter(p => (!UI.of || String(PSEM[p.id])===UI.of || (sl && sl.p===p.id)) && (!UI.per || p.id===UI.per)); }
const OFLBL = {'1':'del primer período 2026','2':'del segundo período 2026','':'de ambos períodos 2026'};
function courseOk(c){
  if(!UI.day && !UI.turno && !UI.doc) return true;
  return shownP(c).some(p => p.coms.some(comOk));
}
const isMob = () => window.innerWidth < 760;
const secOpen = (id, mobDef) => (id in UI.sec) ? UI.sec[id] : (isMob() ? mobDef : true);
document.addEventListener('toggle', e => { const d = e.target; if(d && d.dataset && d.dataset.sec) UI.sec[d.dataset.sec] = d.open; }, true);

function clashBanner(){
  const cl = allClashes(); if(!cl.length) return '';
  return '<div class="cbanner" role="alert"><div><b>⚠ Tenés '+cl.length+' choque'+(cl.length>1?'s':'')+' de horario</b><ul>'+cl.slice(0,3).map(x=>'<li>'+esc(niceName(byKey.get(x.a).name))+' y '+esc(niceName(byKey.get(x.b).name))+' · '+esc(x.when)+'</li>').join('')+(cl.length>3?'<li>y '+(cl.length-3)+' más…</li>':'')+'</ul></div><button class="btn" data-b="cal">Ver en el calendario</button></div>';
}

function calItems(){
  const w = UI.calp==='B1' ? [0,2] : UI.calp==='B2' ? [2,4] : null, out = [], sin = [];
  Object.keys(S.sel).forEach(k => {
    const e = S.sel[k], c = byKey.get(k); if(!c) return;
    if(String(PSEM[e.p])!==UI.cals) return;
    const sp = PSPAN[e.p]; if(w && sp && (sp[1]<=w[0] || w[1]<=sp[0])) return;
    const m = e.c ? comOf(k, e.p, e.c) : null;
    if(!m){ sin.push(k); return; }
    segs(m[3]).forEach(sg => out.push({k, b:e.b, d:sg.d, a:sg.a, z:sg.z, st:e.st||'plan', name:niceName(c.name), com:m[0], mod:m[1]}));
  });
  return {out, sin};
}
function calLanes(arr){
  arr.sort((x,y)=>x.a-y.a || x.z-y.z);
  let cl = [], end = 0;
  const fin = () => { if(!cl.length) return; const n = Math.max.apply(null, cl.map(o=>o.l))+1; cl.forEach(o=>{ o.n = n; }); };
  arr.forEach(it => {
    if(cl.length && it.a>=end){ fin(); cl = []; end = 0; }
    let l = 0; while(cl.some(o=>o.l===l && o.z>it.a)) l++;
    it.l = l; cl.push(it); end = Math.max(end, it.z);
  });
  fin();
}
function calHtml(){
  const {out, sin} = calItems();
  const cl = allClashes();
  let h = '<div class="ph"><h2>Calendario semanal</h2><div class="rule">Tus comisiones elegidas, en su día y horario. Los bimestres y trimestres se supone que arrancan juntos al inicio del cuatrimestre. Tocá un curso para ir a su bloque.</div>'+
    '<div class="seg calseg" role="group" aria-label="Período lectivo">'+[['2','Segundo período 2026'],['1','Primer período 2026']].map(x=>'<button class="sgb" data-cals="'+x[0]+'" aria-pressed="'+(UI.cals===x[0])+'">'+x[1]+'</button>').join('')+'</div><div class="seg calseg" role="group" aria-label="Período">'+(UI.cals==='2' ? [['','Todo el 2.º cuatrimestre'],['B1','3.er bimestre'],['B2','4.º bimestre']] : [['','Todo el 1.er cuatrimestre'],['B1','1.er bimestre'],['B2','2.º bimestre']]).map(x=>'<button class="sgb" data-calp="'+x[0]+'" aria-pressed="'+(UI.calp===x[0])+'">'+x[1]+'</button>').join('')+'</div></div>';
  if(cl.length) h += '<div class="cbanner" role="alert"><div><b>⚠ '+cl.length+' choque'+(cl.length>1?'s':'')+' de horario</b><ul>'+cl.map(x=>'<li>'+esc(niceName(byKey.get(x.a).name))+' y '+esc(niceName(byKey.get(x.b).name))+' · '+esc(x.when)+'</li>').join('')+'</ul></div></div>';
  else if(out.length) h += '<div class="cok">✓ Sin choques entre las comisiones que elegiste.</div>';
  if(!out.length){
    h += '<div class="empty-msg">'+(Object.keys(S.sel).length ? 'Todavía no elegiste comisión en ningún curso'+(UI.calp?' de este período':' '+OFLBL[UI.cals])+'. Elegila dentro de cada curso y aparece acá.' : 'Todavía no elegiste cursos. Cuando elijas un curso y su comisión, aparece acá.')+'</div>';
  } else {
    const maxD = Math.max(6, Math.max.apply(null, out.map(x=>x.d)));
    const hmin = Math.min(8, Math.floor(Math.min.apply(null, out.map(x=>x.a))/60)), hmax = Math.max(21, Math.ceil(Math.max.apply(null, out.map(x=>x.z))/60));
    const RH = 46, rows = hmax-hmin;
    let cols = '';
    for(let d=1; d<=maxD; d++){
      const it = out.filter(x=>x.d===d); calLanes(it);
      cols += '<div class="cal-d" style="height:'+(rows*RH)+'px">'+it.map(x=>{
        const bad = CLK.has(x.k) && it.some(o=>o!==x && o.k!==x.k && o.a<x.z && x.a<o.z);
        return '<button class="ev e-'+x.st+(bad?' bad':'')+'" data-b="'+x.b+'" title="'+esc(x.name+' · Com. '+x.com+' · '+fm(x.a)+'–'+fm(x.z))+'" style="top:'+((x.a-hmin*60)*RH/60)+'px;height:'+Math.max(26,(x.z-x.a)*RH/60-2)+'px;left:calc('+(100*x.l/x.n)+'% + 1px);width:calc('+(100/x.n)+'% - 2px)"><b>'+esc(x.name)+'</b><span>Com. '+esc(x.com)+' · '+fm(x.a)+'–'+fm(x.z)+(x.mod==='R'?' · Remota':'')+'</span></button>';
      }).join('')+'</div>';
    }
    let hrs = ''; for(let i=0;i<rows;i++) hrs += '<div class="cal-t" style="height:'+RH+'px">'+String(hmin+i).padStart(2,'0')+':00</div>';
    h += '<div class="calw"><div class="cal" style="grid-template-columns:44px repeat('+maxD+',minmax(104px,1fr))"><div class="cal-h"></div>'+
      Array.from({length:maxD},(_,i)=>'<div class="cal-h">'+DNAME[i+1]+'</div>').join('')+'<div class="cal-c">'+hrs+'</div>'+cols+'</div></div>'+
      '<div class="lgd lgd2"><span><i class="dot d1"></i>Aprobada</span><span><i class="dot d2"></i>Cursando</span><span><i class="dot d3"></i>Por cursar</span><span><i class="dot dx"></i>Choque</span></div>';
  }
  if(sin.length) h += '<div class="card2" style="margin-top:14px"><div class="c2h"><h3>Sin comisión elegida</h3></div><div class="sinlist">'+sin.map(k=>{ const c = byKey.get(k), e = S.sel[k]; return '<button class="btn" data-b="'+e.b+'">'+esc(niceName(c.name))+'</button>'; }).join('')+'</div></div>';
  h += '<div class="ofnote">'+esc(OFERTA)+'</div>';
  return h;
}

async function saveFile(name, data, mime){
  try{
    const d = window.RT ? await window.RT.use('downloads') : null;
    if(d){ await d.save({filename:name, data}); return true; }
  }catch(e){ if(e && e.code==='declined') return false; }
  try{
    const u = URL.createObjectURL(new Blob([data], {type:mime||'text/plain'}));
    const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 3000); return true;
  }catch(e){ toast('No se pudo generar el archivo.'); return false; }
}
function planHtml(){
  const n = totals(), o = S.ori ? ORI[S.ori].n : '—', hoy = new Date().toLocaleDateString('es-AR');
  let h = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi plan · CPO UBA Derecho</title><style>'+
    'body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:28px auto;max-width:860px;padding:0 18px}h1{font-size:24px;margin:0 0 2px}h2{font-size:16px;margin:22px 0 6px;border-bottom:2px solid #111;padding-bottom:3px}'+
    '.sub{color:#555;margin:0 0 14px}.res{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.res div{border:1.5px solid #111;border-radius:10px;padding:8px 14px}.res b{font-size:20px;display:block}'+
    'table{border-collapse:collapse;width:100%;margin:4px 0 8px}th,td{border:1px solid #bbb;padding:5px 8px;text-align:left;vertical-align:top;font-size:13px}th{background:#f1f1f1}'+
    '.a{color:#15803D;font-weight:600}.c{color:#2563EB;font-weight:600}.p{color:#B45309;font-weight:600}.n{color:#555;font-size:12px}@media print{body{margin:10px}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>'+
    '<h1>Mi plan del CPO</h1><p class="sub">UBA Derecho · Plan 2004 · Orientación: '+esc(o)+' · '+hoy+'</p>'+
    '<div class="res"><div><b>'+n.apr+'</b>puntos aprobados</div><div><b>'+n.anot+'</b>cursando</div><div><b>'+n.plan+'</b>por cursar</div><div><b>'+Math.max(0,69-n.got)+'</b>faltan para los 69</div></div>';
  BL.filter(b=>!b.outside).forEach(b => {
    const st = blockStates(b), rows = [];
    prevOf(b.id).forEach(x=>rows.push(['<span class="a">Aprobada</span>', esc(x.name)+' <span class="n">(año '+esc(x.year)+')</span>', x.pts+' pts', '']));
    if(b.id==='pp') S.pra.forEach(x=>rows.push(['<span class="'+(x.st==='apr'?'a':x.st==='anot'?'c':'p')+'">'+ST[x.st]+'</span>', esc(x.name||'Práctica Profesional'), x.pts+' pts','']));
    if(b.eligible) entriesOf(b.id).forEach(k => { const c = byKey.get(k), e = S.sel[k], m = e.c ? comOf(k,e.p,e.c) : null; rows.push(['<span class="'+(e.st==='apr'?'a':e.st==='anot'?'c':'p')+'">'+ST[e.st||'plan']+'</span>', esc(niceName(c.name))+' <span class="n">'+esc(c.code)+' · '+PERLBL[e.p]+'</span>', ptsOf(k,e.p)+' pts', m ? 'Com. '+esc(m[0])+' · '+esc(m[2])+'<br>'+esc(hh(m[3])) : '<span class="n">Sin comisión</span>']); });
    h += '<h2>'+esc(b.name)+' — '+st.a+'/'+b.cap+' aprobados</h2>'+(rows.length ? '<table><tr><th>Estado</th><th>Curso</th><th>Puntos</th><th>Comisión y horario</th></tr>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</table>' : '<p class="n">Sin cursos cargados. Faltan '+(b.cap-st.a)+' pts · '+esc(b.dept)+'.</p>');
  });
  const {out} = calItems();
  if(out.length){
    h += '<h2>Horario semanal</h2><table><tr><th>Día</th><th>Horario</th><th>Curso</th><th>Comisión</th></tr>'+
      out.slice().sort((x,y)=>x.d-y.d||x.a-y.a).map(x=>'<tr><td>'+DNAME[x.d]+'</td><td>'+fm(x.a)+'–'+fm(x.z)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.com)+(x.mod==='R'?' (remota)':'')+'</td></tr>').join('')+'</table>';
  }
  const cl = allClashes();
  if(cl.length) h += '<p class="p">⚠ Choques de horario: '+cl.map(x=>esc(niceName(byKey.get(x.a).name))+' y '+esc(niceName(byKey.get(x.b).name))+' ('+esc(x.when)+')').join('; ')+'</p>';
  return h+'<p class="n">'+esc(OFERTA)+' Herramienta de apoyo para planificar; la inscripción y su validez dependen de la Secretaría de la Facultad.</p></body></html>';
}
function printPlan(){
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.onload = () => { try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('Este navegador bloqueó la impresión. Usá "Descargar mi plan" y abrilo.'); } setTimeout(()=>f.remove(), 120000); };
  f.srcdoc = planHtml(); document.body.appendChild(f);
}


/* ===== v15: sugeridor, armador, favoritos, metas, compartir, avisos, demanda ===== */
let CFG = {banner:null, dates:[], hid:[]};
UI.sg = {mod:'', sem:'2', goal:8, days:{1:1,2:1,3:1,4:1,5:1,6:1}, turnos:{M:1,T:1,N:1}, res:null, ideas:null, ran:false};
UI.shr = {in:'', res:null};
const isHid = i => CFG.hid.includes(i.uid+'|'+i.id);
async function loadConfig(){
  if(!DBX) return;
  try{
    const sn = await DBX.doc('config/main').get(), d = sn.exists ? sn.data() : null;
    CFG = {banner: d && d.banner && d.banner.text ? d.banner : null, dates: Array.isArray(d && d.dates) ? d.dates : [], hid: Array.isArray(d && d.hid) ? d.hid : []};
  }catch(e){}
  render();
}
async function saveConfig(){
  if(!DBX || !ENV.admin){ toast('Solo quien administra puede cambiar esto.'); return false; }
  try{ await DBX.doc('config/main').set(JSON.parse(JSON.stringify(CFG))); return true; }catch(e){ toast('No se pudo guardar. Probá de nuevo.'); return false; }
}
function bannerHtml(){
  if(!CFG.banner) return '';
  return '<div class="abanner" role="status"><b>Aviso de la Secretaría del CPO</b><p>'+esc(CFG.banner.text)+'</p>'+(CFG.banner.at?'<small>'+esc(new Date(CFG.banner.at).toLocaleDateString('es-AR'))+'</small>':'')+'</div>';
}
const fmtDate = d => { const m = String(d).match(/^(\d{4})-(\d\d)-(\d\d)$/); return m ? m[3]+'/'+m[2]+'/'+m[1] : d; };
function datesHtml(){
  const now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const up = CFG.dates.map(x=>({x, d: Math.round((new Date(x.date+'T00:00:00').getTime()-t0)/864e5)})).filter(o=>o.d>=0 && !isNaN(o.d)).sort((a,b)=>a.d-b.d).slice(0,5);
  if(!up.length) return '<p class="rule">'+(ENV.mode==='db' ? 'Todavía no hay fechas cargadas.' : 'Todavía no hay fechas cargadas.')+'</p>';
  return '<ul class="dtl">'+up.map(o=>'<li><span><b>'+esc(o.x.label)+'</b> · '+esc(fmtDate(o.x.date))+'</span><span class="chipx">'+(o.d===0?'hoy':o.d===1?'mañana':'en '+o.d+' días')+'</span></li>').join('')+'</ul>';
}
function goalHtml(){
  const n = totals(), all = n.apr+n.anot+n.plan, left = Math.max(0, 69-all), g = S.goal||0;
  let body;
  if(!g) body = '<p class="rule">Elegí en cuántos períodos querés terminar y te calculo cuántos puntos por período necesitás.</p>';
  else if(left===0) body = '<p><b>Con lo que cargaste ya cubrís los 69 puntos.</b> Solo falta aprobarlos.</p>';
  else { const per = Math.ceil(left/g); body = '<p class="goalbig"><b>'+per+'</b> pts por período</p><p class="rule">Te faltan cargar '+left+' pts (sin contar lo aprobado, lo que estás cursando ni lo que pensás cursar). Un cuatrimestre vale 4 pts y un bimestre 2.</p>'; }
  return '<label class="cmq">Quiero terminar en<select id="goal-sel"><option value="0">Sin meta</option>'+[1,2,3,4,5,6,7,8].map(v=>'<option value="'+v+'"'+(g===v?' selected':'')+'>'+v+' período'+(v>1?'s':'')+'</option>').join('')+'</select></label>'+body;
}
function metaDatesHtml(){
  return '<details class="card2 sec" data-sec="meta"'+((('meta' in UI.sec)?UI.sec.meta:!!S.goal)?' open':'')+'><summary><h3>Mi meta y próximas fechas</h3></summary><div class="dgrid dg2"><section><div class="stl">Mi meta</div>'+goalHtml()+'</section><section><div class="stl">Próximas fechas</div>'+datesHtml()+'</section></div></details>';
}
function favBtn(k){ const on = S.fav.includes(k); return '<button class="favb" data-fav="'+k+'" aria-pressed="'+on+'" title="'+(on?'Sacar de favoritos':'Guardar en favoritos')+'" aria-label="'+(on?'Sacar de favoritos':'Guardar en favoritos')+'">'+(on?'★':'☆')+'</button>'; }
function favHtml(){
  let h = '<div class="ph"><h2>Mis favoritos</h2><div class="rule">Cursos que te interesan para decidir después. No suman puntos hasta que los elijas en su bloque. Marcalos con la estrella ☆ en cualquier curso.</div></div>';
  if(!S.fav.length) return h+'<div class="empty-msg">Todavía no guardaste ningún curso. Tocá la estrella ☆ al lado del nombre de un curso.</div>';
  h += '<div class="list">'+S.fav.map(k=>{
    const c = byKey.get(k); if(!c) return '';
    const bs = BL.filter(b=>b.eligible && b.eligible.some(x=>x.key===k)), sl = S.sel[k];
    const pers = c.periods.map(p=>PERLBL[p.id]).join(' · ');
    return '<article class="card'+(sl?' sel':'')+'"><div class="ct"><span class="code">'+esc(c.code)+'</span><span class="cn">'+esc(niceName(c.name))+'</span>'+favBtn(k)+'</div><div class="meta"><span>'+esc(DEPN[c.dep])+'</span><span>'+esc(pers)+'</span>'+(sl?'<span><b>'+esc(ST[sl.st||'plan'])+'</b></span>':'')+'</div>'+
      '<div class="pers">'+(bs.length ? bs.map(b=>'<button class="per" data-favgo="'+b.id+'|'+esc(c.code)+'">Ver en '+esc(b.name)+'</button>').join('') : '<span class="rule">No cuenta en ningún bloque de tu orientación.</span>')+'</div></article>';
  }).join('')+'</div>';
  return h;
}

/* --- sugeridor y armador --- */
function pickWith(bid, key, pid, com){
  const b = bl(bid), c = byKey.get(key); if(!b || !c) return false;
  if(S.sel[key] && S.sel[key].b===bid) return false;
  if(canPick(b, c, pid)) return false;
  if(bid==='op' && S.ori){ const g = ORI[S.ori].ch.find(g=>g.includes(key)); if(g) g.forEach(k=>{ if(k!==key) delete S.sel[k]; }); }
  S.sel[key] = {b:bid, p:pid, t:++S.t, st:'plan'}; if(com) S.sel[key].c = com;
  return true;
}
function sgOpts(){ return {sem:UI.sg.sem, mod:UI.sg.mod, goal:UI.sg.goal, days:UI.sg.days, turnos:UI.sg.turnos}; }
function comFits(m, o){
  if(o.mod && m[1]!==(o.mod==='R'?'R':'P')) return false;
  const sg = segs(m[3]); if(!sg.length) return false;
  return sg.every(x => o.days[x.d] && o.turnos[turnoOf(x.a)]);
}
function sgCands(o){
  const out = [];
  BL.filter(b=>b.eligible && !b.outside && !b.manual).forEach(b => {
    if(b.cap - used(b.id) <= 0) return;
    b.eligible.forEach(c => {
      if(S.sel[c.key] || otherUse(c.key, b.id)) return;
      c.periods.forEach(p => {
        if(String(PSEM[p.id])!==String(o.sem)) return;
        if(canPick(b, c, p.id)) return;
        const coms = p.coms.filter(m => comFits(m, o) && !clashOf(c.key, p.id, m[3]));
        if(coms.length) out.push({b, c, p, coms, pts:p.pts, fixed: b.id==='op'});
      });
    });
  });
  return out;
}
function armar(o, base){
  const snap = JSON.stringify(S.sel), t0 = S.t, res = [], seen = new Set();
  let seed = 7; const rnd = () => { seed = (seed*1664525+1013904223) % 4294967296; return seed/4294967296; };
  const prio = (a,b) => (b.fixed-a.fixed) || (b.pts-a.pts);
  for(let it=0; it<45 && res.length<3; it++){
    S.sel = JSON.parse(snap); S.t = t0;
    let pool = base.slice();
    if(it===0) pool.sort(prio); else { pool.forEach(x=>{ x.r = rnd(); }); pool.sort((a,b)=> (b.fixed-a.fixed)*(it%3===0?1:0) || a.r-b.r); }
    let pts = 0; const picks = [];
    for(const cd of pool){
      if(pts>=o.goal) break;
      if(cd.pts > o.goal-pts || S.sel[cd.c.key]) continue;
      const com = cd.coms.find(m => !clashOf(cd.c.key, cd.p.id, m[3])); if(!com) continue;
      if(!pickWith(cd.b.id, cd.c.key, cd.p.id, com[0])) continue;
      pts += cd.pts; picks.push({k:cd.c.key, b:cd.b.id, p:cd.p.id, c:com[0], pts:cd.pts});
    }
    if(!picks.length || pts < o.goal-1) continue;
    const sig = picks.map(x=>x.k).sort().join(',');
    if(seen.has(sig)) continue; seen.add(sig);
    const days = new Set(); picks.forEach(x=>{ const m = comOf(x.k, x.p, x.c); if(m) segs(m[3]).forEach(g=>days.add(g.d)); });
    res.push({picks, pts, days:[...days].sort()});
  }
  S.sel = JSON.parse(snap); S.t = t0;
  return res.sort((a,b)=> Math.abs(a.pts-o.goal)-Math.abs(b.pts-o.goal) || a.days.length-b.days.length);
}
function sgRun(){
  const o = sgOpts(), base = sgCands(o), byB = {};
  base.forEach(x=>{ (byB[x.b.id] = byB[x.b.id] || {b:x.b, items:[]}).items.push(x); });
  UI.sg.ideas = Object.keys(byB).map(k=>{ const g = byB[k]; g.items.sort((a,b)=>(b.fixed-a.fixed) || (b.pts-a.pts) || niceName(a.c.name).localeCompare(niceName(b.c.name))); g.total = g.items.length; g.items = g.items.slice(0,5); return g; });
  UI.sg.res = armar(o, base); UI.sg.ran = true; UI.sg.nbase = base.length;
  render();
}
function sgItemHtml(x){
  const m = x.coms[0];
  return '<article class="sgi"><div><b>'+esc(niceName(x.c.name))+'</b><div class="meta"><span>'+esc(DEPN[x.c.dep])+'</span><span>'+esc(PERLBL[x.p.id])+' · '+x.pts+' pts</span></div><div class="mcm">Com. '+esc(m[0])+' · '+esc(m[2])+' · '+esc(hh(m[3]))+(m[1]==='R'?' · Remota':'')+(x.coms.length>1?' <span class="rule">(+'+(x.coms.length-1)+' comisión'+(x.coms.length>2?'es':'')+' que también entra'+(x.coms.length>2?'n':'')+')</span>':'')+'</div></div><button class="btn" data-sgadd="'+x.c.key+'|'+x.p.id+'|'+esc(m[0])+'">Agregar</button></article>';
}
function sugHtml(){
  const sg = UI.sg, D = [1,2,3,4,5,6];
  let h = '<div class="ph"><h2>Armar mi cursada</h2><div class="rule">Marcá cuándo podés cursar y cuántos puntos querés sumar. Armo combinaciones de comisiones que no chocan entre sí ni con lo que ya elegiste y que respetan los topes de cada bloque.</div></div>'+
    '<section class="card2 sgform"><div class="stl">Días en los que podés</div><div class="sgt">'+D.map(d=>'<button class="per" data-sgtog="d|'+d+'" aria-pressed="'+!!sg.days[d]+'">'+DNAME[d].slice(0,3)+'</button>').join('')+'</div>'+
    '<div class="stl">Turnos</div><div class="sgt">'+[['M','Mañana'],['T','Tarde'],['N','Noche']].map(x=>'<button class="per" data-sgtog="t|'+x[0]+'" aria-pressed="'+!!sg.turnos[x[0]]+'">'+x[1]+'</button>').join('')+'</div>'+
    '<div class="pform2"><label>Período<select id="sg-sem"><option value="2"'+(sg.sem==='2'?' selected':'')+'>Segundo período 2026</option><option value="1"'+(sg.sem==='1'?' selected':'')+'>Primer período 2026</option></select></label>'+
    '<label>Puntos que quiero sumar<select id="sg-goal">'+[2,3,4,5,6,7,8,9,10,12].map(v=>'<option value="'+v+'"'+(sg.goal===v?' selected':'')+'>'+v+' pts</option>').join('')+'</select></label>'+
    '<label>Modalidad<select id="sg-mod"><option value="">Presencial o remota</option><option value="P"'+(sg.mod==='P'?' selected':'')+'>Solo presencial</option><option value="R"'+(sg.mod==='R'?' selected':'')+'>Solo remota</option></select></label>'+
    '<button class="btn primary wide" data-sgrun="1">Buscar combinaciones</button></div></section>';
  if(!sg.ran) return h;
  if(!sg.nbase) return h+'<div class="empty-msg">No encontré cursos que entren con esos días y turnos. Probá habilitar más días o turnos.</div>';
  h += '<div class="c2h" style="margin-top:6px"><h3>Combinaciones armadas</h3></div>';
  if(!sg.res.length) h += '<div class="empty-msg">No pude armar una combinación de '+sg.goal+' pts sin choques. Mirá las ideas por bloque más abajo, o probá con menos puntos o más disponibilidad.</div>';
  else h += sg.res.map((r,i)=>'<section class="card2 sgc"><div class="c2h"><h3>Opción '+(i+1)+' · '+r.pts+' pts</h3><span class="chipx">'+r.days.map(d=>DNAME[d].slice(0,3)).join(' · ')+'</span></div><ul class="sgl">'+r.picks.map(x=>{ const c = byKey.get(x.k), m = comOf(x.k,x.p,x.c), b = bl(x.b); return '<li><b>'+esc(niceName(c.name))+'</b> <span class="mono">'+esc(PERLBL[x.p])+' · '+x.pts+' pts · '+esc(b?b.name:'')+'</span><div class="mcm">Com. '+esc(x.c)+' · '+esc(m?m[2]:'')+' · '+esc(m?hh(m[3]):'')+'</div></li>'; }).join('')+'</ul><button class="btn primary" data-sguse="'+i+'">Agregar estos cursos a mi plan</button></section>').join('');
  h += '<div class="c2h" style="margin-top:16px"><h3>Ideas por bloque</h3></div>';
  h += sg.ideas.length ? sg.ideas.map(g=>'<section class="card2"><div class="c2h"><h3>'+esc(g.b.name)+'</h3><span class="chipx">faltan '+(g.b.cap-used(g.b.id))+' pts</span></div>'+g.items.map(sgItemHtml).join('')+(g.total>g.items.length?'<p class="rule">Y '+(g.total-g.items.length)+' opciones más en el bloque.</p>':'')+'</section>').join('') : '<div class="empty-msg">No quedan cursos para sugerir.</div>';
  return h;
}

/* --- compartir plan --- */
function shareCode(){
  const o = {v:1, o:S.ori, s:Object.keys(S.sel).map(k=>[k, S.sel[k].p, S.sel[k].c||'', S.sel[k].st||'plan'])};
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function readCode(t){
  try{
    let x = String(t||'').trim().replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/'); while(x.length%4) x += '=';
    const o = JSON.parse(decodeURIComponent(escape(atob(x))));
    if(!o || o.v!==1 || !Array.isArray(o.s) || o.s.length>80) return null;
    o.s = o.s.filter(a => Array.isArray(a) && byKey.has(a[0]) && byKey.get(a[0]).periods.some(p=>p.id===a[1])).map(a=>({k:a[0], p:a[1], c:String(a[2]||''), st:ST[a[3]]?a[3]:'plan'}));
    if(o.o && !ORI[o.o]) o.o = null;
    return o;
  }catch(e){ return null; }
}
function shrHtml(){
  let h = '<div class="ph"><h2>Compartir mi plan</h2><div class="rule">Copiá tu código y mandáselo a un compañero: pegándolo acá ve tus cursos, comisiones y horarios, y cuáles chocan con los suyos. El código no incluye tu nombre ni tus datos personales.</div></div>'+
    '<section class="card2"><div class="c2h"><h3>Mi código</h3></div><textarea class="shcode" readonly rows="3" aria-label="Mi código">'+esc(S.ori||Object.keys(S.sel).length ? shareCode() : '')+'</textarea><div class="actions" style="margin-top:8px"><button class="btn primary" data-sharecopy="1"'+(Object.keys(S.sel).length?'':' disabled')+'>Copiar mi código</button></div>'+(Object.keys(S.sel).length?'':'<p class="rule">Elegí algunos cursos primero para tener un plan que compartir.</p>')+'</section>'+
    '<section class="card2"><div class="c2h"><h3>Ver el plan de un compañero</h3></div><textarea id="shr-in" rows="3" placeholder="Pegá acá el código que te mandaron" aria-label="Código del compañero">'+esc(UI.shr.in)+'</textarea><div class="actions" style="margin-top:8px"><button class="btn" data-sharego="1">Ver plan</button></div></section>';
  const r = UI.shr.res;
  if(r){
    const ents = r.s, tot = {apr:0, anot:0, plan:0};
    ents.forEach(e=>{ tot[e.st] += ptsOf(e.k, e.p); });
    h += '<section class="card2"><div class="c2h"><h3>Plan de tu compañero</h3><span class="chipx">'+(r.o ? esc(ORI[r.o].n) : 'Sin orientación')+'</span></div><p class="rule">Aprobadas '+tot.apr+' pts · cursando '+tot.anot+' pts · por cursar '+tot.plan+' pts</p>'+
      (ents.length ? '<ul class="sgl">'+ents.map(e=>{
        const c = byKey.get(e.k), m = e.c ? comOf(e.k, e.p, e.c) : null; let ch = '';
        if(m) for(const k2 of Object.keys(S.sel)){ const s2 = S.sel[k2]; if(!s2.c) continue; const m2 = comOf(k2, s2.p, s2.c); if(!m2) continue; const w = clashBetween(e.p, m[3], s2.p, m2[3]); if(w){ ch = '<div class="why">⚠ Choca con tu curso '+esc(niceName(byKey.get(k2).name))+' ('+esc(w)+')</div>'; break; } }
        const same = S.sel[e.k] && S.sel[e.k].p===e.p && S.sel[e.k].c===e.c && e.c ? '<span class="tag">Misma comisión que vos</span>' : '';
        return '<li><b>'+esc(niceName(c.name))+'</b> <span class="mono">'+esc(PERLBL[e.p])+' · '+esc(ST[e.st])+'</span>'+same+'<div class="mcm">'+(m ? 'Com. '+esc(m[0])+' · '+esc(m[2])+' · '+esc(hh(m[3])) : 'Sin comisión elegida')+'</div>'+ch+'</li>';
      }).join('')+'</ul>' : '<div class="empty-msg">Ese plan no tiene cursos.</div>')+'</section>';
  } else if(UI.shr.in.trim() && UI.shr.tried) h += '';
  return h;
}


/* ===== v16: límite de puntos cursando (8 por bimestre, 16 por cuatrimestre) ===== */
const LIM_BIM = 8, LIM_CUA = 16;
const BIMN = {1:['1.er bimestre','2.º bimestre'], 2:['3.er bimestre','4.º bimestre']};
const r2 = n => Math.round(n*100)/100;
function cursandoLoad(sem, skipKey, addKey, addPid){
  const b = [0,0]; let tot = 0;
  const add = (pid, pts) => {
    if(PSEM[pid]!==sem) return; const sp = PSPAN[pid]; if(!sp) return;
    tot += pts; const per = pts/(sp[1]-sp[0]);
    for(let m=sp[0]; m<sp[1]; m++) b[m<2?0:1] += per;
  };
  Object.keys(S.sel).forEach(k => { const e = S.sel[k]; if(k===skipKey || e.st!=='anot') return; add(e.p, ptsOf(k, e.p)); });
  if(addKey) add(addPid, ptsOf(addKey, addPid));
  return {b, tot};
}
function limitMsg(key, pid){
  const sem = PSEM[pid], L = cursandoLoad(sem, key, key, pid), nm = BIMN[sem];
  if(L.tot > LIM_CUA) return {t:'Se puede cursar un máximo de '+LIM_CUA+' puntos por cuatrimestre. Con este curso tendrías '+r2(L.tot)+' puntos cursando en el período.', d:'Pasalo a "Lo pienso cursar" o sacá otro curso que estés cursando.'};
  for(let i=0;i<2;i++) if(L.b[i] > LIM_BIM+1e-9) return {t:'Se puede cursar un máximo de '+LIM_BIM+' puntos en un mismo bimestre. Con este curso tendrías '+r2(L.b[i])+' puntos en el '+nm[i]+'.', d:'Pasalo a "Lo pienso cursar" o sacá otro curso que estés cursando en ese bimestre.'};
  return null;
}
function showLimit(m){ UI.limMsg = m; UI.modal = 'limit'; render(); }
function setSt(k, v){
  const e = S.sel[k]; if(!e) return;
  if(v==='anot' && e.st!=='anot'){ const m = limitMsg(k, e.p); if(m){ showLimit(m); return; } }
  e.st = v; save(); render();
}
function cargaHtml(){
  const rows = [];
  [2,1].forEach(sem => {
    const L = cursandoLoad(sem); if(!(L.tot>0)) return;
    const row = (lbl, v, lim) => '<div class="hbar"><span>'+esc(lbl)+'</span><i class="'+(v>=lim-1e-9?'full':'')+'" style="width:'+Math.min(100,100*v/lim)+'%"></i><b>'+r2(v)+'/'+lim+'</b></div>';
    rows.push('<div class="stl" style="margin-top:6px">'+(sem===2?'Segundo período 2026':'Primer período 2026')+'</div>'+row('Total del cuatrimestre', L.tot, LIM_CUA)+row(BIMN[sem][0], L.b[0], LIM_BIM)+row(BIMN[sem][1], L.b[1], LIM_BIM));
  });
  if(!rows.length) return '';
  return '<section class="card2"><div class="c2h"><h3>Puntos que estoy cursando</h3><span class="chipx">máx. '+LIM_BIM+' por bimestre · '+LIM_CUA+' por cuatrimestre</span></div>'+rows.join('')+'<p class="rule">Cuentan solo los cursos en "Lo estoy cursando". El nivel de idioma y la Práctica Profesional no cuentan para este límite.</p></section>';
}

const extraN = () => [UI.mod,UI.day,UI.turno,UI.doc].filter(Boolean).length;
const moreOpen = () => UI.moref===undefined ? extraN()>0 : UI.moref;
function planText(){
  let t = 'Fixture CPO · UBA Derecho' + (S.ori? ' · Orientación '+ORI[S.ori].n : '') + '\n';
  const nn = totals();
  t += 'Puntos: '+nn.got+'/69 (aprobados: '+nn.apr+')\n\n';
  BL.forEach(b => {
    t += b.name+': '+apOf(b)+'/'+b.cap+'\n'; if(b.id==='pp') S.pra.forEach(x=>{ t += '  - '+(x.name||'Práctica')+' ('+x.pts+' pts, '+ST[x.st]+')\n'; }); prevOf(b.id).forEach(x=>{ t += '  - '+x.name+' (anterior, '+x.year+', '+x.pts+' pts, Aprobada)\n'; });
    if(b.eligible) entriesOf(b.id).forEach(k=>{ const c=byKey.get(k), p=c.periods.find(x=>x.id===S.sel[k].p); const e=S.sel[k], m=e.c?comOf(k,e.p,e.c):null; t += '  - '+niceName(c.name)+' ('+c.code+', '+PERLBL[p.id]+', '+p.pts+' pts, '+ST[e.st||'plan']+(m?', com. '+m[0]+' '+hh(m[3]):'')+')\n'; });
  });
  return t;
}
function copyPlan(){
  const t = planText();
  const done = () => toast('Plan copiado.');
  const fb = () => { const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch(e){ toast('No se pudo copiar desde acá.'); } ta.remove(); };
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done, fb); } else fb();
}
boot();
