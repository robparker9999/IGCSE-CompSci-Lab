/* ============================================================
   CIE Logic Gates Simulator — logic-gates.js
   ============================================================ */
'use strict';

// ── GATE GEOMETRY ─────────────────────────────────────────────
const GATES = {
  AND:    { w:80,  h:56, inPts:[{x:0,y:16},{x:0,y:40}], outPt:{x:80,y:28}  },
  OR:     { w:80,  h:56, inPts:[{x:0,y:16},{x:0,y:40}], outPt:{x:80,y:28}  },
  NOT:    { w:72,  h:44, inPts:[{x:-14,y:22}],            outPt:{x:72,y:22}  },
  NAND:   { w:90,  h:56, inPts:[{x:0,y:16},{x:0,y:40}], outPt:{x:90,y:28}  },
  NOR:    { w:90,  h:56, inPts:[{x:0,y:16},{x:0,y:40}], outPt:{x:90,y:28}  },
  XOR:    { w:80,  h:56, inPts:[{x:0,y:16},{x:0,y:40}], outPt:{x:80,y:28}  },
  INPUT:  { w:68,  h:40, inPts:[],                        outPt:{x:68,y:20} },
  OUTPUT: { w:68,  h:64, inPts:[{x:0,y:32}],             outPt:null         },
  COMMENT:{ w:130, h:64, inPts:[],                        outPt:null         },
};

const EVAL = {
  AND:    (a,b) => (a & b) & 1,
  OR:     (a,b) => (a | b) & 1,
  NOT:    (a)   => a ? 0 : 1,
  NAND:   (a,b) => (a & b) ? 0 : 1,
  NOR:    (a,b) => (a | b) ? 0 : 1,
  XOR:    (a,b) => (a ^ b) & 1,
  INPUT:  ()    => 0,
  OUTPUT: (a)   => a ?? 0,
};

const TRUTH_TABLES = {
  AND:  { cols:['A','B','Q'], rows:[[0,0,0],[0,1,0],[1,0,0],[1,1,1]] },
  OR:   { cols:['A','B','Q'], rows:[[0,0,0],[0,1,1],[1,0,1],[1,1,1]] },
  NOT:  { cols:['A','Q'],     rows:[[0,1],[1,0]] },
  NAND: { cols:['A','B','Q'], rows:[[0,0,1],[0,1,1],[1,0,1],[1,1,0]] },
  NOR:  { cols:['A','B','Q'], rows:[[0,0,1],[0,1,0],[1,0,0],[1,1,0]] },
  XOR:  { cols:['A','B','Q'], rows:[[0,0,0],[0,1,1],[1,0,1],[1,1,0]] },
};

// ── STATE ─────────────────────────────────────────────────────
let state = { components:[], wires:[] };
let uid   = 1;
function newId() { return `c${uid++}`; }

// Compute the next available INPUT label (A, B, C...) dynamically
function nextInputLabel() {
  const used = new Set(state.components.filter(c=>c.type==='INPUT').map(c=>c.label));
  for (let i=0; i<26; i++) {
    const lbl = String.fromCharCode(65+i); // A-Z
    if (!used.has(lbl)) return lbl;
  }
  return '?';
}
// Compute the next available OUTPUT label (X first, then Y Z A B...)
function nextOutputLabel() {
  const used = new Set(state.components.filter(c=>c.type==='OUTPUT').map(c=>c.label));
  const preferred = ['X','Y','Z'];
  for (const lbl of preferred) if (!used.has(lbl)) return lbl;
  for (let i=0; i<26; i++) {
    const lbl = String.fromCharCode(65+i);
    if (!used.has(lbl)) return lbl;
  }
  return '?';
}

// Selection: selectedIds holds component IDs; wireSelId holds one wire ID
let selectedIds = new Set();
let wireSelId   = null;

let drawingWire = null;  // {fromId, x1, y1}
let dragging    = null;  // {ids:Set, offsets:Map<id,{ox,oy}>, moved:bool}
let panning     = null;  // {sx,sy} right-click pan start
let resizing    = null;  // {id, ox, oy, ow, oh} comment resize
let selBox      = null;  // {x0,y0,x1,y1} rubber-band
let justBoxSelected = false; // prevents the post-mouseup click from clearing selection

// ── ZOOM ──────────────────────────────────────────────────────
let zoom = 1;
const ZOOM_STEP = 0.15, ZOOM_MIN = 0.25, ZOOM_MAX = 3;

function applyZoom() {
  const cv = document.getElementById('canvas');
  cv.setAttribute('width',  Math.round(3000 * zoom));
  cv.setAttribute('height', Math.round(2000 * zoom));
  document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
}
function zoomIn()  { zoom = Math.min(ZOOM_MAX, +(zoom+ZOOM_STEP).toFixed(2)); applyZoom(); }
function zoomOut() { zoom = Math.max(ZOOM_MIN, +(zoom-ZOOM_STEP).toFixed(2)); applyZoom(); }
function zoomFit() {
  if (!state.components.length) { zoom=1; applyZoom(); return; }
  const pad=60;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  state.components.forEach(c=>{
    const d=GATES[c.type];
    x0=Math.min(x0,c.x); y0=Math.min(y0,c.y);
    x1=Math.max(x1,c.x+d.w); y1=Math.max(y1,c.y+d.h);
  });
  const wr=document.getElementById('canvas-wrapper');
  zoom=+Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,Math.min(
    (wr.clientWidth -pad*2)/(x1-x0),
    (wr.clientHeight-pad*2)/(y1-y0)
  ))).toFixed(2);
  applyZoom();
  wr.scrollLeft=(x0-pad)*zoom;
  wr.scrollTop =(y0-pad)*zoom;
}

// ── SVG HELPERS ───────────────────────────────────────────────
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs={}){
  const e=document.createElementNS(NS,tag);
  for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);
  return e;
}
function txt(tag,attrs,content){
  const e=el(tag,attrs);e.textContent=content;return e;
}

// ── COORDINATE TRANSFORM ──────────────────────────────────────
function svgPt(e){
  const wr=document.getElementById('canvas-wrapper');
  const r=wr.getBoundingClientRect();
  return{x:(e.clientX-r.left+wr.scrollLeft)/zoom,
         y:(e.clientY-r.top +wr.scrollTop )/zoom};
}

// ── WIRE PATH ─────────────────────────────────────────────────
function wirePath(x1,y1,x2,y2){
  const dx=Math.max(Math.abs(x2-x1)*0.55,50);
  return`M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;
}

// ── DRAW BODY ─────────────────────────────────────────────────
function drawBody(g,comp){
  const t=comp.type;
  const body =(d)         =>g.appendChild(el('path',  {d,class:'comp-body'}));
  const fill =(d)         =>g.appendChild(el('path',  {d,class:'comp-fill'}));
  const stub =(x1,y1,x2,y2)=>g.appendChild(el('line',{x1,y1,x2,y2,class:'comp-stub'}));
  const bubble=(cx,cy,r)  =>g.appendChild(el('circle',{cx,cy,r,class:'comp-fill'}));

  if(t==='AND'||t==='NAND'){
    fill('M 12,4 L 40,4 A 24,24 0 0 1 40,52 L 12,52 Z');
    stub(0,16,12,16); stub(0,40,12,40);
    if(t==='NAND'){bubble(69,28,5);stub(74,28,90,28);g.appendChild(txt('text',{x:34,y:28,class:'comp-label'},'NAND'));}
    else           {stub(64,28,80,28);g.appendChild(txt('text',{x:34,y:28,class:'comp-label'},'AND'));}
  }
  else if(t==='OR'||t==='NOR'){
    fill('M 12,4 C 28,4 58,10 66,28 C 58,46 28,52 12,52 C 22,36 22,20 12,4 Z');
    stub(0,16,16,16); stub(0,40,16,40);
    if(t==='NOR'){bubble(71,28,5);stub(76,28,90,28);g.appendChild(txt('text',{x:36,y:28,class:'comp-label'},'NOR'));}
    else          {stub(66,28,80,28);g.appendChild(txt('text',{x:36,y:28,class:'comp-label'},'OR'));}
  }
  else if(t==='NOT'){
    fill('M 4,4 L 52,22 L 4,40 Z');
    bubble(57,22,5);
    stub(-14,22,4,22); stub(62,22,72,22);
    g.appendChild(txt('text',{x:22,y:22,class:'comp-label'},'NOT'));
  }
  else if(t==='XOR'){
    fill('M 12,4 C 28,4 58,10 66,28 C 58,46 28,52 12,52 C 22,36 22,20 12,4 Z');
    body('M 6,4 C 16,20 16,36 6,52');
    stub(0,16,16,16); stub(0,40,16,40); stub(66,28,80,28);
    g.appendChild(txt('text',{x:36,y:28,class:'comp-label'},'XOR'));
  }
  else if(t==='INPUT'){
    const on=comp.value===1;
    g.appendChild(el('rect',{x:4,y:4,width:52,height:32,rx:6,class:'input-body '+(on?'on':'off')}));
    stub(56,20,68,20);
    g.appendChild(txt('text',{x:22,y:20,class:'input-label-text','data-comp-id':comp.id},comp.label||'?'));
    g.appendChild(txt('text',{x:43,y:20,class:'input-value-text'},on?'1':'0'));
    return;
  }
  else if(t==='OUTPUT'){
    const on=comp.value===1;
    g.appendChild(el('circle',{cx:34,cy:30,r:27,fill:on?'var(--green)':'transparent','fill-opacity':on?'0.18':'0',class:'output-glow'}));
    g.appendChild(el('circle',{cx:34,cy:30,r:21,class:'output-body '+(on?'on':'off')}));
    if(on){
      [[-3],[-6],[3],[6]].forEach(([dx])=>{
        g.appendChild(el('line',{x1:34+dx,y1:20,x2:34+dx*0.5,y2:24,
          stroke:'var(--green)','stroke-width':'1.2','stroke-linecap':'round',fill:'none'}));
      });
    }
    stub(0,32,13,32);
    // 0/1 indicator inside the bulb
    g.appendChild(txt('text',{x:34,y:31,class:'output-value-text',
      fill:on?'#fff':'var(--text-muted)'},on?'1':'0'));
    g.appendChild(txt('text',{x:34,y:59,class:'output-name-text'},comp.label||'X'));
    return;
  }
  else if(t==='COMMENT'){
    const cw=comp.cw||130, ch=comp.ch||64;
    g.appendChild(el('rect',{x:0,y:0,width:cw,height:ch,class:'comment-body',rx:4,'data-drag-handle':'1'}));
    const fo=el('foreignObject',{x:5,y:5,width:cw-18,height:ch-10});
    const div=document.createElement('div');
    div.contentEditable='true';
    div.className='comment-editable';
    div.textContent=comp.comment||'Note...';
    div.addEventListener('input',()=>{comp.comment=div.textContent;save();});
    // Prevent drag from starting when clicking inside the text area
    div.addEventListener('mousedown',e=>e.stopPropagation());
    fo.appendChild(div);
    g.appendChild(fo);
    // Resize handle — bottom-right corner triangle
    const rh=12;
    g.appendChild(el('polygon',{
      points:`${cw-rh},${ch} ${cw},${ch} ${cw},${ch-rh}`,
      class:'comment-resize','data-resize':'1',
    }));
    return;
  }
}

function drawPorts(g,comp){
  const def=GATES[comp.type];
  def.inPts.forEach((pt,i)=>{
    g.appendChild(el('circle',{cx:pt.x,cy:pt.y,r:5,
      class:'port-circle port-in','data-comp-id':comp.id,'data-port':i}));
  });
  if(def.outPt){
    g.appendChild(el('circle',{cx:def.outPt.x,cy:def.outPt.y,r:5,
      class:'port-circle port-out','data-comp-id':comp.id}));
  }
}

// ── MAKE COMPONENT ELEMENT ────────────────────────────────────
function makeCompEl(comp){
  const def=GATES[comp.type];
  let cls='comp-group';
  if(selectedIds.has(comp.id)) cls+=' selected';
  if(comp.type==='INPUT'&&comp.value===1) cls+=' input-on';
  if(comp.type==='COMMENT') cls+=' comment-group';

  const g=el('g',{'data-id':comp.id,transform:`translate(${comp.x},${comp.y})`,class:cls});
  // Hit rect (transparent, receives events)
  g.appendChild(el('rect',{x:0,y:0,width:def.w,height:def.h,fill:'transparent',class:'comp-hit'}));
  drawBody(g,comp);
  drawPorts(g,comp);
  attachCompEvents(g,comp);
  return g;
}

// ── WIRE ELEMENT ──────────────────────────────────────────────
function makeWireEl(wire){
  const from=state.components.find(c=>c.id===wire.fromId);
  const to  =state.components.find(c=>c.id===wire.toId);
  if(!from||!to) return null;
  const fd=GATES[from.type],td=GATES[to.type];
  if(!fd.outPt||!td.inPts[wire.toPort]) return null;
  const x1=from.x+fd.outPt.x, y1=from.y+fd.outPt.y;
  const pt=td.inPts[wire.toPort];
  const x2=to.x+pt.x, y2=to.y+pt.y;
  return el('path',{
    d:wirePath(x1,y1,x2,y2),
    class:'wire-path '+(from.value?'wire-live':'wire-dead')+(wire.id===wireSelId?' selected':''),
    'data-id':wire.id,
  });
}

// ── PROPAGATE ─────────────────────────────────────────────────
function propagate(){
  const visited=new Set(),order=[];
  function visit(id){
    if(visited.has(id))return;visited.add(id);
    state.wires.filter(w=>w.toId===id).forEach(w=>visit(w.fromId));
    order.push(id);
  }
  state.components.forEach(c=>visit(c.id));
  order.forEach(id=>{
    const comp=state.components.find(c=>c.id===id);
    if(!comp||comp.type==='INPUT'||comp.type==='COMMENT')return;
    const def=GATES[comp.type];
    const inputs=def.inPts.map((_,i)=>{
      const w=state.wires.find(w=>w.toId===id&&w.toPort===i);
      return w?(state.components.find(c=>c.id===w.fromId)?.value??0):0;
    });
    comp.value=(EVAL[comp.type]||(() =>0))(...inputs);
  });
}

// ── TRUTH TABLE ───────────────────────────────────────────────
function buildTruthTable(){
  const ct=document.getElementById('truth-table-container');
  const ins=state.components.filter(c=>c.type==='INPUT').sort((a,b)=>a.label.localeCompare(b.label));
  const outs=state.components.filter(c=>c.type==='OUTPUT');
  if(!ins.length){ct.innerHTML='<div class="tt-hint">Place INPUT components to generate the truth table.</div>';return;}
  const n=ins.length,rows=1<<n;
  const saved=ins.map(c=>c.value);
  const activeBits=saved.join('');
  let h='<table class="truth-table"><thead><tr>';
  ins.forEach(c=>{h+=`<th>${c.label}</th>`;});
  outs.forEach(c=>{h+=`<th>${c.label||'X'}</th>`;});
  h+='</tr></thead><tbody>';
  for(let r=0;r<rows;r++){
    ins.forEach((c,i)=>{c.value=(r>>(n-1-i))&1;});
    propagate();
    const bits=ins.map(c=>c.value).join('');
    h+=`<tr${bits===activeBits?' class="tt-active"':''}>`;
    ins.forEach(c=>{h+=`<td>${c.value}</td>`;});
    outs.forEach(c=>{h+=`<td class="${c.value?'tt-one':'tt-zero'}">${c.value}</td>`;});
    h+='</tr>';
  }
  h+='</tbody></table>';
  ct.innerHTML=h;
  ins.forEach((c,i)=>{c.value=saved[i];});
  propagate();
}

// ── EXPRESSION ────────────────────────────────────────────────
function buildExpression(){
  const bar=document.getElementById('expression-text');
  const outs=state.components.filter(c=>c.type==='OUTPUT');
  if(!outs.length){bar.textContent='Add an OUTPUT component to see the Boolean expression';return;}
  const vis=new Set();
  function exprFor(id,port){
    const w=state.wires.find(w=>w.toId===id&&w.toPort===port);
    if(!w)return'?';
    const src=state.components.find(c=>c.id===w.fromId);
    if(!src||vis.has(src.id))return src?'(cycle)':'?';
    if(src.type==='INPUT')return src.label;
    vis.add(src.id);
    const ins=GATES[src.type].inPts.map((_,i)=>exprFor(src.id,i));
    vis.delete(src.id);
    switch(src.type){
      case 'AND': return`(${ins[0]} AND ${ins[1]})`;
      case 'OR':  return`(${ins[0]} OR ${ins[1]})`;
      case 'NOT': return`NOT ${ins[0]}`;
      case 'NAND':return`NOT (${ins[0]} AND ${ins[1]})`;
      case 'NOR': return`NOT (${ins[0]} OR ${ins[1]})`;
      case 'XOR': return`(${ins[0]} XOR ${ins[1]})`;
      default:    return'?';
    }
  }
  bar.textContent=outs.map(c=>{
    let expr=exprFor(c.id,0);
    if(expr.startsWith('(')&&expr.endsWith(')'))expr=expr.slice(1,-1);
    return`${c.label||'X'} = ${expr}`;
  }).join('    ');
}

// ── RENDER ────────────────────────────────────────────────────
function render(){
  const wl=document.getElementById('wires-layer');
  const cl=document.getElementById('comps-layer');
  wl.innerHTML=''; cl.innerHTML='';
  state.wires.forEach(w=>{
    const e=makeWireEl(w);
    if(!e)return;
    e.addEventListener('click',ev=>{ev.stopPropagation();selectWire(w.id);});
    wl.appendChild(e);
  });
  state.components.forEach(c=>cl.appendChild(makeCompEl(c)));
  buildTruthTable();
  buildExpression();
  save();
}

// ── INLINE LABEL EDIT ─────────────────────────────────────────
function startInlineEdit(g,comp,textEl,defaultVal,onCommit){
  textEl.setAttribute('visibility','hidden');
  const def=GATES[comp.type];
  const isOut=comp.type==='OUTPUT';
  const fo=el('foreignObject',{
    x:isOut?def.w/2-18:8, y:isOut?def.h-22:10,
    width:36,height:20,class:'label-fo','data-edit':'1',
  });
  const inp=document.createElement('input');
  inp.type='text'; inp.maxLength=2; inp.value=defaultVal;
  inp.className='label-input';
  inp.addEventListener('click',e=>e.stopPropagation());
  inp.addEventListener('mousedown',e=>e.stopPropagation());
  let done=false;
  const commit=()=>{
    if(done)return;done=true;
    const v=inp.value.trim();
    if(v)onCommit(v[0].toUpperCase());else render();
  };
  inp.addEventListener('blur',commit);
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();inp.blur();}
    if(e.key==='Escape'){done=true;render();}
    e.stopPropagation();
  });
  fo.appendChild(inp);
  g.appendChild(fo);
  setTimeout(()=>{inp.focus();inp.select();},10);
}

// ── SELECTION ─────────────────────────────────────────────────
function selectOne(id){
  selectedIds.clear(); wireSelId=null;
  if(id){selectedIds.add(id);}
  _syncSelectionClasses();
}
function selectWire(id){
  selectedIds.clear(); wireSelId=id;
  _syncSelectionClasses();
}
function selectMany(ids){
  selectedIds=new Set(ids); wireSelId=null;
  _syncSelectionClasses();
}
function clearSelection(){
  selectedIds.clear(); wireSelId=null;
  _syncSelectionClasses();
}
function _syncSelectionClasses(){
  document.querySelectorAll('#comps-layer .comp-group').forEach(e=>{
    e.classList.toggle('selected',selectedIds.has(e.getAttribute('data-id')));
  });
  document.querySelectorAll('#wires-layer .wire-path').forEach(e=>{
    e.classList.toggle('selected',e.getAttribute('data-id')===wireSelId);
  });
}

// ── ATTACH COMPONENT EVENTS ───────────────────────────────────
function attachCompEvents(g,comp){
  // Output port → start wire
  g.querySelectorAll('.port-out').forEach(p=>{
    p.addEventListener('mousedown',e=>{
      e.stopPropagation();e.preventDefault();
      const def=GATES[comp.type];
      const pt=svgPt(e);
      drawingWire={fromId:comp.id,x1:comp.x+def.outPt.x,y1:comp.y+def.outPt.y};
      const tw=document.getElementById('temp-wire');
      tw.setAttribute('visibility','visible');
      tw.setAttribute('d',wirePath(drawingWire.x1,drawingWire.y1,pt.x,pt.y));
      clearSelection();
    });
  });

  // Comment resize handle
  const rh=g.querySelector('[data-resize="1"]');
  if(rh){
    rh.addEventListener('mousedown',e=>{
      e.stopPropagation();e.preventDefault();
      const pt=svgPt(e);
      resizing={id:comp.id,ox:pt.x,oy:pt.y,ow:comp.cw||130,oh:comp.ch||64};
    });
  }

  // Comment drag handle (the border rect only)
  const dh=g.querySelector('[data-drag-handle="1"]');
  if(dh){
    dh.addEventListener('mousedown',e=>{
      e.stopPropagation();e.preventDefault();
      const pt=svgPt(e);
      if(!selectedIds.has(comp.id))selectOne(comp.id);
      dragging={
        ids:new Set(selectedIds),
        offsets:new Map([...selectedIds].map(id=>{
          const c=state.components.find(c=>c.id===id);
          return[id,{ox:pt.x-c.x,oy:pt.y-c.y}];
        })),
        moved:false,
      };
    });
  }

  // INPUT label → click to edit inline (stops propagation to prevent toggle)
  const lbl=g.querySelector('.input-label-text');
  if(lbl){
    lbl.addEventListener('mousedown',e=>e.stopPropagation()); // prevent drag/toggle
    lbl.addEventListener('click',e=>{
      e.stopPropagation();
      startInlineEdit(g,comp,lbl,comp.label||'?',v=>{
        comp.label=v;propagate();render();
      });
    });
  }

  // OUTPUT name label → click to edit inline
  const nl=g.querySelector('.output-name-text');
  if(nl&&comp.type==='OUTPUT'){
    nl.addEventListener('mousedown',e=>e.stopPropagation());
    nl.addEventListener('click',e=>{
      e.stopPropagation();
      startInlineEdit(g,comp,nl,comp.label||'X',v=>{
        comp.label=v;propagate();render();
      });
    });
  }

  // Whole group mousedown → drag (for non-comment, non-port targets)
  g.addEventListener('mousedown',e=>{
    if(e.target.classList.contains('port-circle'))return;
    if(e.target.getAttribute('data-drag-handle')==='1')return; // handled above
    if(e.target.getAttribute('data-resize')==='1')return;
    if(comp.type==='COMMENT')return; // comment handled by border rect
    if(g.querySelector('[data-edit="1"]'))return;
    e.stopPropagation();e.preventDefault();
    const pt=svgPt(e);
    if(!e.shiftKey&&!selectedIds.has(comp.id))selectOne(comp.id);
    else if(e.shiftKey)selectedIds.add(comp.id);
    dragging={
      ids:new Set(selectedIds),
      offsets:new Map([...selectedIds].map(id=>{
        const c=state.components.find(c=>c.id===id);
        return[id,{ox:pt.x-c.x,oy:pt.y-c.y}];
      })),
      moved:false,
    };
  });

  g.addEventListener('click',e=>{
    e.stopPropagation();
    if(!e.shiftKey)selectOne(comp.id);
    else{selectedIds.has(comp.id)?selectedIds.delete(comp.id):selectedIds.add(comp.id);}
    _syncSelectionClasses();
  });
}

// ── GLOBAL MOUSE EVENTS ───────────────────────────────────────
document.addEventListener('mousemove',e=>{
  // Pan (right-click drag)
  if(panning){
    const wr=document.getElementById('canvas-wrapper');
    wr.scrollLeft+=panning.sx-e.clientX;
    wr.scrollTop +=panning.sy-e.clientY;
    panning.sx=e.clientX; panning.sy=e.clientY;
    return;
  }
  // Resize comment
  if(resizing){
    const pt=svgPt(e);
    const comp=state.components.find(c=>c.id===resizing.id);
    if(comp){
      comp.cw=Math.max(80,resizing.ow+(pt.x-resizing.ox));
      comp.ch=Math.max(40,resizing.oh+(pt.y-resizing.oy));
      const g=document.querySelector(`#comps-layer [data-id="${comp.id}"]`);
      if(g){
        g.querySelector('.comment-body')?.setAttribute('width',comp.cw);
        g.querySelector('.comment-body')?.setAttribute('height',comp.ch);
        const fo=g.querySelector('foreignObject');
        if(fo){fo.setAttribute('width',comp.cw-18);fo.setAttribute('height',comp.ch-10);}
        const rh=g.querySelector('[data-resize="1"]');
        if(rh)rh.setAttribute('points',`${comp.cw-12},${comp.ch} ${comp.cw},${comp.ch} ${comp.cw},${comp.ch-12}`);
      }
    }
    return;
  }
  // Drag component(s)
  if(dragging){
    const pt=svgPt(e);
    let anyMoved=false;
    dragging.ids.forEach(id=>{
      const c=state.components.find(c=>c.id===id);
      if(!c)return;
      const off=dragging.offsets.get(id);
      if(!off)return;
      const nx=Math.max(0,pt.x-off.ox), ny=Math.max(0,pt.y-off.oy);
      if(!dragging.moved&&(Math.abs(nx-c.x)+Math.abs(ny-c.y))<4)return;
      c.x=nx; c.y=ny; anyMoved=true;
      const cg=document.querySelector(`#comps-layer [data-id="${id}"]`);
      if(cg)cg.setAttribute('transform',`translate(${c.x},${c.y})`);
      liveUpdateWires(id);
    });
    if(anyMoved)dragging.moved=true;
  }
  // Wire drawing
  if(drawingWire){
    const pt=svgPt(e);
    document.getElementById('temp-wire')
      .setAttribute('d',wirePath(drawingWire.x1,drawingWire.y1,pt.x,pt.y));
  }
  // Rubber-band selection box
  if(selBox){
    const pt=svgPt(e);
    selBox.x1=pt.x; selBox.y1=pt.y;
    const sr=document.getElementById('sel-rect');
    const rx=Math.min(selBox.x0,selBox.x1), ry=Math.min(selBox.y0,selBox.y1);
    const rw=Math.abs(selBox.x1-selBox.x0), rh=Math.abs(selBox.y1-selBox.y0);
    sr.setAttribute('x',rx);sr.setAttribute('y',ry);
    sr.setAttribute('width',rw);sr.setAttribute('height',rh);
    sr.setAttribute('visibility','visible');
  }
});

document.addEventListener('mouseup',e=>{
  // End pan
  if(panning){panning=null;return;}

  // End resize
  if(resizing){resizing=null;save();return;}

  // End drag
  if(dragging){
    const wasMoved=dragging.moved;
    const firstId=[...dragging.ids][0];
    const comp=state.components.find(c=>c.id===firstId);
    dragging=null;
    if(wasMoved){
      // Check if dropped over left sidebar → delete all selected
      const sb=document.getElementById('left-sidebar');
      const sbr=sb.getBoundingClientRect();
      if(e.clientX>=sbr.left&&e.clientX<=sbr.right&&e.clientY>=sbr.top&&e.clientY<=sbr.bottom){
        // Delete all dragged components
        selectedIds.forEach(id=>{
          state.components=state.components.filter(c=>c.id!==id);
          state.wires=state.wires.filter(w=>w.fromId!==id&&w.toId!==id);
        });
        selectedIds.clear();
      }
      propagate();render();
    } else if(comp&&comp.type==='INPUT'){
      // Pure click → toggle
      comp.value=comp.value?0:1;
      propagate();render();
    }
    return;
  }

  // End wire
  if(drawingWire){
    const target=document.elementFromPoint(e.clientX,e.clientY);
    if(target&&target.classList.contains('port-in')){
      const toId  =target.getAttribute('data-comp-id');
      const toPort=parseInt(target.getAttribute('data-port'));
      if(toId!==drawingWire.fromId&&!state.wires.find(w=>w.toId===toId&&w.toPort===toPort)){
        state.wires.push({id:`w${uid++}`,fromId:drawingWire.fromId,toId,toPort});
        propagate();
      }
    }
    cancelWire();render();return;
  }

  // End rubber-band selection
  if(selBox){
    const rx=Math.min(selBox.x0,selBox.x1), ry=Math.min(selBox.y0,selBox.y1);
    const rw=Math.abs(selBox.x1-selBox.x0), rh=Math.abs(selBox.y1-selBox.y0);
    if(rw>4||rh>4){
      const ids=state.components
        .filter(c=>{
          const cw=c.type==='COMMENT'?(c.cw||130):GATES[c.type].w;
          const ch=c.type==='COMMENT'?(c.ch||64):GATES[c.type].h;
          return c.x+cw>rx && c.x<rx+rw && c.y+ch>ry && c.y<ry+rh;
        })
        .map(c=>c.id);
      // Add to existing selection if shift was held when rubber-band started
      if(selBox.additive){
        ids.forEach(id=>selectedIds.add(id));
        wireSelId=null;
        _syncSelectionClasses();
      } else {
        selectMany(ids);
      }
    }
    document.getElementById('sel-rect').setAttribute('visibility','hidden');
    selBox=null;
    // Re-render so selection highlight is applied properly.
    // Set a flag so the click event that follows this mouseup doesn't wipe the selection.
    justBoxSelected=true;
    render();
  }
});

// Right-click → pan (not context menu)
document.getElementById('canvas-wrapper').addEventListener('mousedown',e=>{
  if(e.button===2){e.preventDefault();panning={sx:e.clientX,sy:e.clientY};}
});
document.getElementById('canvas-wrapper').addEventListener('contextmenu',e=>e.preventDefault());

// Canvas background mousedown → start rubber-band
document.getElementById('canvas').addEventListener('mousedown',e=>{
  if(e.button!==0)return;
  if(e.target.id!=='canvas'&&e.target.id!=='canvas-bg')return;
  e.preventDefault();
  if(!e.shiftKey) clearSelection();
  const pt=svgPt(e);
  selBox={x0:pt.x,y0:pt.y,x1:pt.x,y1:pt.y,additive:e.shiftKey};
});

document.getElementById('canvas').addEventListener('click',e=>{
  if(e.target.id==='canvas'||e.target.id==='canvas-bg'){
    if(justBoxSelected){ justBoxSelected=false; return; }
    clearSelection();
  }
});

function liveUpdateWires(compId){
  const wl=document.getElementById('wires-layer');
  state.wires.forEach(w=>{
    if(w.fromId!==compId&&w.toId!==compId)return;
    const we=wl.querySelector(`[data-id="${w.id}"]`);if(!we)return;
    const fr=state.components.find(c=>c.id===w.fromId);
    const to=state.components.find(c=>c.id===w.toId);
    if(!fr||!to)return;
    const fd=GATES[fr.type],td=GATES[to.type];
    if(!fd.outPt||!td.inPts[w.toPort])return;
    we.setAttribute('d',wirePath(fr.x+fd.outPt.x,fr.y+fd.outPt.y,
      to.x+td.inPts[w.toPort].x,to.y+td.inPts[w.toPort].y));
  });
}

function cancelWire(){
  drawingWire=null;
  const tw=document.getElementById('temp-wire');
  tw.setAttribute('visibility','hidden');tw.setAttribute('d','');
}

// ── KEYBOARD DELETE ───────────────────────────────────────────
document.addEventListener('keydown',e=>{
  // ── Arrow keys → nudge selected components ──────────────────
  const ARROWS = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0] };
  if (ARROWS[e.key] && selectedIds.size > 0) {
    if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
    if(document.activeElement.contentEditable==='true')return;
    if(document.querySelector('[data-edit="1"]'))return;
    e.preventDefault(); // stop the canvas from scrolling
    const step  = e.shiftKey ? 1 : 10; // Shift = 1 px fine-nudge, normal = 10 px
    const [dx, dy] = ARROWS[e.key];
    selectedIds.forEach(id => {
      const c = state.components.find(c=>c.id===id);
      if (!c) return;
      c.x = Math.max(0, c.x + dx * step);
      c.y = Math.max(0, c.y + dy * step);
    });
    propagate(); render();
    return;
  }

  if(e.key!=='Delete'&&e.key!=='Backspace')return;
  if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(document.activeElement.contentEditable==='true')return;
  if(document.querySelector('[data-edit="1"]'))return;
  e.preventDefault();
  if(wireSelId){
    state.wires=state.wires.filter(w=>w.id!==wireSelId);
    wireSelId=null;
  } else {
    selectedIds.forEach(id=>{
      state.components=state.components.filter(c=>c.id!==id);
      state.wires=state.wires.filter(w=>w.fromId!==id&&w.toId!==id);
    });
    selectedIds.clear();
  }
  propagate();render();
});

// ── SIDEBAR & TOOLTIP ─────────────────────────────────────────
const globalTooltip=document.getElementById('global-tooltip');
function posTooltip(e){
  const sr=document.getElementById('left-sidebar').getBoundingClientRect();
  const ty=Math.max(8,Math.min(window.innerHeight-globalTooltip.offsetHeight-8,
    e.clientY-globalTooltip.offsetHeight/2));
  globalTooltip.style.left=(sr.right+8)+'px';
  globalTooltip.style.top=ty+'px';
}

function buildSidebar(){
  const DEFS=[
    {sep:'Inputs / Outputs'},
    {type:'INPUT',  label:'Input Toggle',desc:'Click to toggle 0↔1. Click label to rename.'},
    {type:'OUTPUT', label:'Output Bulb', desc:'Shows 0/1. Click label to rename.'},
    {sep:'Logic Gates'},
    {type:'AND', label:'AND Gate'},{type:'OR',  label:'OR Gate'},
    {type:'NOT', label:'NOT Gate'},{type:'NAND',label:'NAND Gate'},
    {type:'NOR', label:'NOR Gate'},{type:'XOR', label:'XOR Gate'},
    {sep:'Other'},
    {type:'COMMENT',label:'Comment Box',desc:'Drag border to move. Drag ▿ to resize.'},
  ];
  const lib=document.getElementById('component-library');
  DEFS.forEach(def=>{
    if(def.sep){
      const d=document.createElement('div');
      d.className='comp-category';d.textContent=def.sep;lib.appendChild(d);return;
    }
    const item=document.createElement('div');
    item.className='comp-item';item.draggable=true;item.dataset.type=def.type;
    item.appendChild(miniSVG(def.type));
    const s=document.createElement('span');s.textContent=def.label;item.appendChild(s);

    item.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('text/plain',def.type);
      globalTooltip.style.display='none';
      const ghost=document.createElement('div');
      ghost.style.cssText='position:fixed;top:-200px;left:-200px;background:var(--bg-panel);'+
        'border:1px solid var(--border-bright);border-radius:6px;padding:6px 10px;'+
        'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary);'+
        'font-family:var(--font-ui);pointer-events:none;';
      ghost.appendChild(miniSVG(def.type));
      const gs=document.createElement('span');gs.textContent=def.label;ghost.appendChild(gs);
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost,ghost.offsetWidth/2,ghost.offsetHeight/2);
      setTimeout(()=>document.body.removeChild(ghost),0);
    });
    item.addEventListener('dragend',()=>globalTooltip.style.display='none');

    const tt=TRUTH_TABLES[def.type];
    let tipH='';
    if(tt){
      tipH='<table class="mini-tt"><thead><tr>';
      tt.cols.forEach(c=>{tipH+=`<th>${c}</th>`;});
      tipH+='</tr></thead><tbody>';
      tt.rows.forEach(row=>{
        tipH+='<tr>';
        row.forEach((v,i)=>{
          const isOut=i===row.length-1;
          tipH+=`<td class="${isOut&&v?'tt-one':isOut?'tt-zero':''}">${v}</td>`;
        });
        tipH+='</tr>';
      });
      tipH+='</tbody></table>';
    } else if(def.desc){
      tipH=`<span style="font-size:11px;color:var(--text-secondary);max-width:180px;display:block;white-space:normal;">${def.desc}</span>`;
    }
    if(tipH){
      item.addEventListener('mouseenter',e=>{globalTooltip.innerHTML=tipH;globalTooltip.style.display='block';posTooltip(e);});
      item.addEventListener('mousemove',posTooltip);
      item.addEventListener('mouseleave',()=>globalTooltip.style.display='none');
    }
    lib.appendChild(item);
  });
}

// ── miniSVG ───────────────────────────────────────────────────
function miniSVG(type){
  const s=document.createElementNS(NS,'svg');
  s.setAttribute('width','36');s.setAttribute('height','24');s.setAttribute('viewBox','0 0 36 24');
  const g=document.createElementNS(NS,'g');
  g.setAttribute('transform','scale(0.42) translate(2,0)');
  const sk='var(--accent)',none='none';
  function mp(d,fill=none){const p=document.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('fill',fill);p.setAttribute('stroke',sk);p.setAttribute('stroke-width','2');g.appendChild(p);}
  function mc(cx,cy,r){const c=document.createElementNS(NS,'circle');c.setAttribute('cx',cx);c.setAttribute('cy',cy);c.setAttribute('r',r);c.setAttribute('fill',none);c.setAttribute('stroke',sk);c.setAttribute('stroke-width','2');g.appendChild(c);}
  function mr(x,y,w,h,rx){const r=document.createElementNS(NS,'rect');Object.entries({x,y,width:w,height:h,rx:rx||0,fill:'var(--accent-dim)',stroke:sk,'stroke-width':2}).forEach(([k,v])=>r.setAttribute(k,v));g.appendChild(r);}
  switch(type){
    case 'AND':  mp('M6,2 L22,2 A12,12 0 0 1 22,26 L6,26 Z');break;
    case 'OR':   mp('M6,2 C14,2 28,6 32,14 C28,22 14,26 6,26 C11,18 11,10 6,2 Z');break;
    case 'NOT':  mp('M2,2 L28,14 L2,26 Z');mc(31,14,3);break;
    case 'NAND': mp('M6,2 L22,2 A12,12 0 0 1 22,26 L6,26 Z');mc(35,14,3);break;
    case 'NOR':  mp('M6,2 C14,2 28,6 32,14 C28,22 14,26 6,26 C11,18 11,10 6,2 Z');mc(35,14,3);break;
    case 'XOR':  mp('M6,2 C14,2 28,6 32,14 C28,22 14,26 6,26 C11,18 11,10 6,2 Z');mp('M2,2 C8,10 8,18 2,26');break;
    case 'INPUT':mr(2,6,24,16,4);break;
    case 'OUTPUT':mc(18,14,11);break;
    case 'COMMENT':{const r=document.createElementNS(NS,'rect');Object.entries({x:2,y:2,width:32,height:20,rx:3,fill:none,stroke:sk,'stroke-width':1.5,'stroke-dasharray':'4 2'}).forEach(([k,v])=>r.setAttribute(k,v));g.appendChild(r);break;}
  }
  s.appendChild(g);return s;
}

// ── DROP FROM SIDEBAR ─────────────────────────────────────────
const cwEl=document.getElementById('canvas-wrapper');
cwEl.addEventListener('dragover',e=>e.preventDefault());
cwEl.addEventListener('drop',e=>{
  e.preventDefault();
  const type=e.dataTransfer.getData('text/plain');
  if(!GATES[type])return;
  const def=GATES[type];
  const pt=svgPt(e);
  const comp={id:newId(),type,x:Math.max(0,pt.x-def.w/2),y:Math.max(0,pt.y-def.h/2),value:0,label:''};
  if(type==='INPUT')      comp.label=nextInputLabel();
  else if(type==='OUTPUT') comp.label=nextOutputLabel();
  else if(type==='COMMENT'){comp.comment='Note...';comp.cw=130;comp.ch=64;}
  state.components.push(comp);
  propagate();render();
});

// ── THEME TOGGLE ──────────────────────────────────────────────
function toggleTheme(){
  const light=document.body.classList.toggle('light-mode');
  const btn=document.getElementById('btn-theme');
  if(light){btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';}
  else{btn.textContent='⏾';}
  localStorage.setItem('lg_theme',light?'light':'dark');
}

// ── CLEAR ─────────────────────────────────────────────────────
function clearCircuit(){
  if(state.components.length&&!confirm('Clear the entire circuit?'))return;
  state.components=[];state.wires=[];
  uid=1;clearSelection();propagate();render();
}

// ── EXPORT PNG ────────────────────────────────────────────────
function exportPNG(){
  if(!state.components.length){alert('Nothing to export.');return;}
  const pad=40;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  state.components.forEach(c=>{
    const d=GATES[c.type];
    x0=Math.min(x0,c.x);y0=Math.min(y0,c.y);
    x1=Math.max(x1,c.x+(c.type==='COMMENT'?(c.cw||130):d.w));
    y1=Math.max(y1,c.y+(c.type==='COMMENT'?(c.ch||64):d.h));
  });
  const bx=x0-pad,by=y0-pad,bw=(x1-x0)+pad*2,bh=(y1-y0)+pad*2,scale=2;
  const cv=document.createElement('canvas');
  cv.width=bw*scale;cv.height=bh*scale;
  const ctx=cv.getContext('2d');
  ctx.scale(scale,scale);ctx.translate(-bx,-by);
  ctx.fillStyle='#fff';ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.lineCap='round';ctx.lineJoin='round';

  // Wires
  state.wires.forEach(w=>{
    const fr=state.components.find(c=>c.id===w.fromId);
    const to=state.components.find(c=>c.id===w.toId);
    if(!fr||!to)return;
    const fd=GATES[fr.type],td=GATES[to.type];
    if(!fd.outPt||!td.inPts[w.toPort])return;
    const wx1=fr.x+fd.outPt.x,wy1=fr.y+fd.outPt.y;
    const pt=td.inPts[w.toPort],wx2=to.x+pt.x,wy2=to.y+pt.y;
    const dx=Math.max(Math.abs(wx2-wx1)*0.55,50);
    ctx.beginPath();ctx.moveTo(wx1,wy1);ctx.bezierCurveTo(wx1+dx,wy1,wx2-dx,wy2,wx2,wy2);ctx.stroke();
  });

  // Components
  state.components.forEach(comp=>{
    const t=comp.type;
    const def=GATES[t];
    ctx.save();ctx.translate(comp.x,comp.y);
    ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.lineCap='round';ctx.lineJoin='round';

    function stub(ax,ay,bx,by){ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();}
    function dot(cx,cy,r){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#000';ctx.stroke();}
    function outline(){ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#000';ctx.stroke();}

    if(t==='AND'||t==='NAND'){
      ctx.beginPath();ctx.moveTo(12,4);ctx.lineTo(40,4);ctx.arc(40,28,24,-Math.PI/2,Math.PI/2);ctx.lineTo(12,52);ctx.closePath();outline();
      stub(0,16,12,16);stub(0,40,12,40);
      if(t==='NAND'){dot(69,28,5);stub(74,28,90,28);}else stub(64,28,80,28);
    }
    else if(t==='OR'||t==='NOR'){
      ctx.beginPath();ctx.moveTo(12,4);ctx.bezierCurveTo(28,4,58,10,66,28);ctx.bezierCurveTo(58,46,28,52,12,52);ctx.bezierCurveTo(22,36,22,20,12,4);ctx.closePath();outline();
      stub(0,16,16,16);stub(0,40,16,40);
      if(t==='NOR'){dot(71,28,5);stub(76,28,90,28);}else stub(66,28,80,28);
    }
    else if(t==='NOT'){
      ctx.beginPath();ctx.moveTo(4,4);ctx.lineTo(52,22);ctx.lineTo(4,40);ctx.closePath();outline();
      dot(57,22,5);stub(-14,22,4,22);stub(62,22,72,22);
    }
    else if(t==='XOR'){
      ctx.beginPath();ctx.moveTo(12,4);ctx.bezierCurveTo(28,4,58,10,66,28);ctx.bezierCurveTo(58,46,28,52,12,52);ctx.bezierCurveTo(22,36,22,20,12,4);ctx.closePath();outline();
      ctx.beginPath();ctx.moveTo(6,4);ctx.bezierCurveTo(16,20,16,36,6,52);ctx.stroke();
      stub(0,16,16,16);stub(0,40,16,40);stub(66,28,80,28);
    }
    else if(t==='INPUT'){
      const rr=6;
      ctx.beginPath();ctx.moveTo(4+rr,4);ctx.lineTo(56-rr,4);ctx.arcTo(56,4,56,4+rr,rr);ctx.lineTo(56,36-rr);ctx.arcTo(56,36,56-rr,36,rr);ctx.lineTo(4+rr,36);ctx.arcTo(4,36,4,36-rr,rr);ctx.lineTo(4,4+rr);ctx.arcTo(4,4,4+rr,4,rr);ctx.closePath();outline();
      stub(56,20,68,20);
      ctx.fillStyle='#000';ctx.font='700 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(comp.label||'?',22,20);
    }
    else if(t==='OUTPUT'){
      ctx.beginPath();ctx.arc(34,30,21,0,Math.PI*2);outline();
      stub(0,32,13,32);
      // Label below the bulb only — no 0/1 inside
      ctx.fillStyle='#000';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(comp.label||'X',34,59);
    }
    else if(t==='COMMENT'){
      const cw=comp.cw||130,ch=comp.ch||64;
      ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.setLineDash([5,3]);
      ctx.strokeRect(0,0,cw,ch);ctx.setLineDash([]);
      ctx.fillStyle='#000';ctx.font='11px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
      const lines=(comp.comment||'Note...').split('\n');
      lines.forEach((ln,i)=>ctx.fillText(ln,5,5+i*16,cw-10));
    }

    if(t!=='COMMENT'){
      def.inPts.forEach(pt=>dot(pt.x,pt.y,3));
      if(def.outPt)dot(def.outPt.x,def.outPt.y,3);
    }
    ctx.restore();
  });

  const a=document.createElement('a');
  a.download='logic-circuit.png';a.href=cv.toDataURL('image/png');a.click();
}

// ── PERSISTENCE ───────────────────────────────────────────────
function save(){
  try{localStorage.setItem('lg_state',JSON.stringify({components:state.components,wires:state.wires,uid}));}catch(_){}
}
function load(){
  try{
    const raw=localStorage.getItem('lg_state');if(!raw)return;
    const d=JSON.parse(raw);
    state.components=d.components||[];
    state.wires     =d.wires     ||[];
    uid             =d.uid       ||1;
  }catch(_){}
}

// ── INIT ──────────────────────────────────────────────────────
function init(){
  buildSidebar();
  if(localStorage.getItem('lg_theme')==='light'){
    document.body.classList.add('light-mode');
    document.getElementById('btn-theme').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }
  load();propagate();render();applyZoom();

  document.getElementById('btn-export')  .addEventListener('click',exportPNG);
  document.getElementById('btn-clear')   .addEventListener('click',clearCircuit);
  document.getElementById('btn-theme')   .addEventListener('click',toggleTheme);
  document.getElementById('btn-zoom-in') .addEventListener('click',zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click',zoomOut);
  document.getElementById('btn-zoom-fit').addEventListener('click',zoomFit);

  // ── Copy expression to clipboard ──────────────────────────
  const copyExpr = () => {
    const txt = document.getElementById('expression-text').textContent;
    if (!txt || txt.startsWith('Add an OUTPUT')) return;
    navigator.clipboard.writeText(txt).then(()=>{
      const btn = document.getElementById('copy-expr-btn');
      btn.classList.add('copied');
      setTimeout(()=>btn.classList.remove('copied'), 1200);
    }).catch(()=>{});
  };
  document.getElementById('copy-expr-btn').addEventListener('click', copyExpr);
  document.getElementById('expression-wrap').addEventListener('click', copyExpr);

  // ── Right sidebar resize ──────────────────────────────────
  const resizer    = document.getElementById('sidebar-resizer');
  const rSidebar   = document.getElementById('right-sidebar');
  const zoomCtrls  = document.getElementById('zoom-controls');
  // Keep zoom controls anchored to the left edge of the right sidebar
  function updateZoomPos() {
    zoomCtrls.style.right = (rSidebar.offsetWidth + 12) + 'px';
  }
  updateZoomPos(); // set correct position on load
  let sidebarDrag = null;
  resizer.addEventListener('mousedown', e=>{
    e.preventDefault();
    sidebarDrag = { startX: e.clientX, startW: rSidebar.offsetWidth };
    resizer.classList.add('dragging');
  });
  document.addEventListener('mousemove', e=>{
    if(!sidebarDrag) return;
    // Dragging left increases width, dragging right decreases
    const delta = sidebarDrag.startX - e.clientX;
    const newW  = Math.max(140, Math.min(600, sidebarDrag.startW + delta));
    rSidebar.style.width = newW + 'px';
    updateZoomPos();
  });
  document.addEventListener('mouseup', ()=>{
    if(!sidebarDrag) return;
    sidebarDrag = null;
    resizer.classList.remove('dragging');
  });
}

init();
