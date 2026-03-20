'use strict';
/* =========================================================
   CIE Flowchart Lab — flowcharts.js  (v3)
   Fixes: correct CSS classes, clientToSVG, port connections,
          zoom strip, marquee selection, right-click pan
   ========================================================= */

const NS = 'http://www.w3.org/2000/svg';
const CW = 3000, CH = 2000;

// ── SVG element factory ───────────────────────────────────
function svgEl(tag, attrs) {
  attrs = attrs || {};
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function uid() { return 's' + Math.random().toString(36).slice(2, 9); }

// ── Symbol definitions ────────────────────────────────────
const DEFS = {
  START:    { w:120, h:50,  ports:['bottom'],                      locked:true   },
  STOP:     { w:120, h:50,  ports:['top'],                         locked:true   },
  INPUT:    { w:150, h:55,  ports:['top','bottom','left','right'],  locked:'prefix', prefix:'INPUT'  },
  OUTPUT:   { w:150, h:55,  ports:['top','bottom','left','right'],  locked:'prefix', prefix:'OUTPUT' },
  PROCESS:  { w:150, h:55,  ports:['top','bottom','left','right'],  locked:false  },
  DECISION: { w:140, h:85,  ports:['bottom','left','right'],        locked:false  },
  EMBEDDED: { w:150, h:55,  ports:['top','bottom','left','right'],  locked:false  },
  MODULE:   { w:130, h:50,  ports:['top','bottom','left','right'],  locked:false  },
};

function portPos(sym, portName) {
  const d = DEFS[sym.type];
  switch (portName) {
    case 'top':    return { x: sym.x + d.w/2,  y: sym.y       };
    case 'bottom': return { x: sym.x + d.w/2,  y: sym.y + d.h };
    case 'left':   return { x: sym.x,           y: sym.y + d.h/2 };
    case 'right':  return { x: sym.x + d.w,     y: sym.y + d.h/2 };
  }
}

// ── State ─────────────────────────────────────────────────
let symbols     = [];
let connections = [];
let zoom        = 1;
let selId       = null;
let selSet      = new Set();

let wireDrag    = null;
let symDrag     = null;
let panDrag     = null;
let marqDrag    = null;

// ── DOM refs ──────────────────────────────────────────────
const wrap       = document.getElementById('canvas-wrapper');
const svg        = document.getElementById('canvas');
const connsG     = document.getElementById('connections-layer');
const nodesG     = document.getElementById('nodes-layer');
const tempConn   = document.getElementById('temp-conn');
const snapRing   = document.getElementById('snap-ring');
const selBox     = document.getElementById('sel-box');
const pseudoOut  = document.getElementById('pseudocode-out');
const consoleOut = document.getElementById('console-out');
const traceWrap  = document.getElementById('trace-wrap');
const cInput     = document.getElementById('c-input');
const cSubmit    = document.getElementById('c-submit');
const cPrompt    = document.getElementById('c-prompt');
const zoomLabel  = document.getElementById('zoom-label');
const embOverlay = document.getElementById('embedded-overlay');
const embEditor  = document.getElementById('embedded-editor');
const inlineEdit = document.getElementById('inline-edit');
const inlineInp  = document.getElementById('inline-input');
const dragGhost  = document.getElementById('drag-ghost');
const rightPanel = document.getElementById('right-panel');

// ═══════════════════════════════════════════════════════════
//  COORDINATE HELPER
// ═══════════════════════════════════════════════════════════

function clientToSVG(cx, cy) {
  const r = wrap.getBoundingClientRect();
  return {
    x: (cx - r.left  + wrap.scrollLeft) / zoom,
    y: (cy - r.top   + wrap.scrollTop)  / zoom,
  };
}

// ═══════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════

function renderAll() {
  connsG.innerHTML = '';
  nodesG.innerHTML = '';
  connections.forEach(renderConn);
  symbols.forEach(renderSym);
  updatePseudocode();
}

function renderSym(sym) {
  const def = DEFS[sym.type];
  const w = def.w, h = def.h;
  const isSel = selId === sym.id || selSet.has(sym.id);

  const g = svgEl('g', {
    class: 'node-group' + (isSel ? ' selected' : ''),
    'data-id': sym.id,
    transform: 'translate(' + sym.x + ',' + sym.y + ')',
  });

  // Body shape
  let body = null;
  if (sym.type === 'START' || sym.type === 'STOP') {
    body = svgEl('rect', { x:1, y:1, width:w-2, height:h-2, rx:h/2, ry:h/2 });
  } else if (sym.type === 'INPUT' || sym.type === 'OUTPUT') {
    const off = 14;
    body = svgEl('polygon', { points: off+',1 '+(w-1)+',1 '+(w-off-1)+','+(h-1)+' 1,'+(h-1) });
  } else if (sym.type === 'PROCESS' || sym.type === 'MODULE') {
    body = svgEl('rect', { x:1, y:1, width:w-2, height:h-2 });
  } else if (sym.type === 'EMBEDDED') {
    body = svgEl('rect', { x:1, y:1, width:w-2, height:h-2 });
    body.setAttribute('class', 'node-shape');
    g.appendChild(body);
    const b1 = svgEl('line', { x1:13, y1:1, x2:13, y2:h-1 });
    const b2 = svgEl('line', { x1:w-13, y1:1, x2:w-13, y2:h-1 });
    b1.setAttribute('class', 'node-bar');
    b2.setAttribute('class', 'node-bar');
    g.appendChild(b1); g.appendChild(b2);
    body = null;
  } else if (sym.type === 'DECISION') {
    body = svgEl('polygon', { points: (w/2)+',1 '+(w-1)+','+(h/2)+' '+(w/2)+','+(h-1)+' 1,'+(h/2) });
  }
  if (body) { body.setAttribute('class', 'node-shape'); g.appendChild(body); }

  // Label text
  let labelStr;
  if (def.locked === true) {
    labelStr = sym.type;
  } else if (def.locked === 'prefix') {
    labelStr = def.prefix + ' ' + (sym.text || '');
  } else {
    labelStr = sym.text || (sym.type.charAt(0) + sym.type.slice(1).toLowerCase());
  }
  const lbl = svgEl('text', { x:w/2, y:h/2, class:'node-text', 'text-anchor':'middle', 'dominant-baseline':'central' });
  lbl.textContent = labelStr;
  g.appendChild(lbl);

  // Port hit areas + visible dots
  for (let pi = 0; pi < def.ports.length; pi++) {
    const pname = def.ports[pi];
    const pp = portPos(sym, pname);
    const lx = pp.x - sym.x;
    const ly = pp.y - sym.y;

    // Large transparent hit circle
    const hit = svgEl('circle', { cx:lx, cy:ly, r:10, class:'port-hit', 'data-port':pname });
    // Small visible dot
    const dot = svgEl('circle', { cx:lx, cy:ly, r:5,  class:'port-dot', 'data-port':pname });

    // Capture port for closure
    (function(fromId, fromPort, fpPos) {
      hit.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        e.preventDefault();
        wireDrag = { fromId: fromId, fromPort: fromPort };
        tempConn.setAttribute('visibility', 'visible');
        tempConn.setAttribute('d', 'M'+fpPos.x+','+fpPos.y);
        document.addEventListener('mousemove', onWireMove);
        document.addEventListener('mouseup',   onWireUp);
      });
    })(sym.id, pname, portPos(sym, pname));

    g.appendChild(hit);
    g.appendChild(dot);
  }

  // Symbol mouse events
  g.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    selId = sym.id; selSet.clear();
    const sp = clientToSVG(e.clientX, e.clientY);
    symDrag = { id:sym.id, startX:sp.x, startY:sp.y, origX:sym.x, origY:sym.y };
    document.addEventListener('mousemove', onSymMove);
    document.addEventListener('mouseup',   onSymUp);
    renderAll();
  });
  g.addEventListener('dblclick',    function(e) { e.stopPropagation(); startInlineEdit(sym); });
  g.addEventListener('contextmenu', function(e) { e.preventDefault(); e.stopPropagation(); showCtxMenu(e, sym); });

  nodesG.appendChild(g);
}

function renderConn(conn) {
  const fs = symbols.find(function(s) { return s.id === conn.fromId; });
  const ts = symbols.find(function(s) { return s.id === conn.toId;   });
  if (!fs || !ts) return;

  const fp = portPos(fs, conn.fromPort);
  const tp = portPos(ts, conn.toPort);
  const d  = orthPath(fp, conn.fromPort, tp, conn.toPort);
  const isSel = selId === conn.id;

  const cg = svgEl('g', { class:'conn-group' + (isSel ? ' selected' : '') });

  const hit  = svgEl('path', { d:d, class:'conn-hit' });
  const path = svgEl('path', { d:d, class:'conn-path', 'marker-end':'url(#arr)' });

  hit.addEventListener('click', function(e) {
    e.stopPropagation();
    selId = conn.id; selSet.clear();
    renderAll();
  });
  hit.addEventListener('contextmenu', function(e) {
    e.preventDefault(); e.stopPropagation();
    showConnCtx(e, conn);
  });

  cg.appendChild(hit);
  cg.appendChild(path);

  if (conn.label) {
    const mid = pathMid(fp, conn.fromPort, tp, conn.toPort);
    const isYes = conn.label === 'Yes';
    const bg = svgEl('rect', {
      x:mid.x-14, y:mid.y-9, width:28, height:18, rx:3,
      fill:'var(--bg-panel)', stroke:'var(--border-bright)', 'stroke-width':'1',
    });
    const lt = svgEl('text', {
      x:mid.x, y:mid.y,
      'text-anchor':'middle', 'dominant-baseline':'central',
      class:'conn-label ' + (isYes ? 'conn-label-yes' : 'conn-label-no'),
    });
    lt.textContent = conn.label;
    cg.appendChild(bg);
    cg.appendChild(lt);
  }

  connsG.appendChild(cg);
}

function orthPath(fp, fDir, tp, tDir) {
  const G = 22;
  const exits = { top:[0,-G], bottom:[0,G], left:[-G,0], right:[G,0] };
  const fd = exits[fDir] || [0,G];
  const td = exits[tDir] || [0,-G];
  const p1x = fp.x+fd[0], p1y = fp.y+fd[1];
  const p4x = tp.x+td[0], p4y = tp.y+td[1];
  let m1x, m1y, m2x, m2y;
  if (fDir==='top'||fDir==='bottom') {
    const my=(p1y+p4y)/2; m1x=p1x;m1y=my;m2x=p4x;m2y=my;
  } else {
    const mx=(p1x+p4x)/2; m1x=mx;m1y=p1y;m2x=mx;m2y=p4y;
  }
  return 'M'+fp.x+','+fp.y+' L'+p1x+','+p1y+' L'+m1x+','+m1y+' L'+m2x+','+m2y+' L'+p4x+','+p4y+' L'+tp.x+','+tp.y;
}

function pathMid(fp, fDir, tp, tDir) {
  const G=22, exits={top:[0,-G],bottom:[0,G],left:[-G,0],right:[G,0]};
  const fd=exits[fDir]||[0,G], td=exits[tDir]||[0,-G];
  return { x:(fp.x+fd[0]+tp.x+td[0])/2, y:(fp.y+fd[1]+tp.y+td[1])/2 };
}

// ═══════════════════════════════════════════════════════════
//  SIDEBAR DRAG
// ═══════════════════════════════════════════════════════════

let sbType = null;

document.querySelectorAll('.comp-item').forEach(function(item) {
  item.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    sbType = item.dataset.type;
    const def = DEFS[sbType];
    dragGhost.style.display = 'block';
    dragGhost.setAttribute('viewBox', '0 0 '+def.w+' '+def.h);
    dragGhost.setAttribute('width',  def.w * 0.65);
    dragGhost.setAttribute('height', def.h * 0.65);
    posGhost(e);
    buildGhost(sbType);
    document.addEventListener('mousemove', onSbMove);
    document.addEventListener('mouseup',   onSbUp);
  });
});

function posGhost(e) {
  const def = DEFS[sbType];
  dragGhost.style.left = (e.clientX - def.w*0.33) + 'px';
  dragGhost.style.top  = (e.clientY - def.h*0.33) + 'px';
}

function buildGhost(type) {
  dragGhost.innerHTML = '';
  const def = DEFS[type];
  const w = def.w, h = def.h;
  let body = null;
  if (type==='START'||type==='STOP') {
    body = svgEl('rect', {x:1,y:1,width:w-2,height:h-2,rx:h/2});
  } else if (type==='INPUT'||type==='OUTPUT') {
    const off=14; body=svgEl('polygon',{points:off+',1 '+(w-1)+',1 '+(w-off-1)+','+(h-1)+' 1,'+(h-1)});
  } else if (type==='PROCESS'||type==='MODULE') {
    body=svgEl('rect',{x:1,y:1,width:w-2,height:h-2});
  } else if (type==='EMBEDDED') {
    body=svgEl('rect',{x:1,y:1,width:w-2,height:h-2});
    body.setAttribute('class','node-shape'); dragGhost.appendChild(body);
    const b1=svgEl('line',{x1:13,y1:1,x2:13,y2:h-1}); b1.setAttribute('class','node-bar'); dragGhost.appendChild(b1);
    const b2=svgEl('line',{x1:w-13,y1:1,x2:w-13,y2:h-1}); b2.setAttribute('class','node-bar'); dragGhost.appendChild(b2);
    body=null;
  } else if (type==='DECISION') {
    body=svgEl('polygon',{points:(w/2)+',1 '+(w-1)+','+(h/2)+' '+(w/2)+','+(h-1)+' 1,'+(h/2)});
  }
  if (body) { body.setAttribute('class','node-shape'); dragGhost.appendChild(body); }
}

function onSbMove(e) { if(sbType) posGhost(e); }

function onSbUp(e) {
  document.removeEventListener('mousemove', onSbMove);
  document.removeEventListener('mouseup',   onSbUp);
  dragGhost.style.display = 'none';
  if (!sbType) return;
  const r = wrap.getBoundingClientRect();
  if (e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom) {
    const sp  = clientToSVG(e.clientX, e.clientY);
    const def = DEFS[sbType];
    const sym = {
      id: uid(), type: sbType,
      x: Math.round(Math.max(10, Math.min(CW-def.w-10, sp.x - def.w/2))),
      y: Math.round(Math.max(10, Math.min(CH-def.h-10, sp.y - def.h/2))),
      text: defaultText(sbType),
      embeddedCode: '',
    };
    symbols.push(sym);
    selId = sym.id; selSet.clear();
    renderAll(); save();
  }
  sbType = null;
}

function defaultText(type) {
  if (type==='PROCESS')  return 'x \u2190 x + 1';
  if (type==='DECISION') return 'x > 0';
  if (type==='EMBEDDED') return 'Procedure';
  if (type==='MODULE')   return 'Module';
  return '';
}

// ═══════════════════════════════════════════════════════════
//  SYMBOL DRAG
// ═══════════════════════════════════════════════════════════

function onSymMove(e) {
  if (!symDrag) return;
  const sp  = clientToSVG(e.clientX, e.clientY);
  const sym = symbols.find(function(s){return s.id===symDrag.id;});
  const def = DEFS[sym.type];
  sym.x = Math.round(Math.max(0, Math.min(CW-def.w, symDrag.origX + sp.x - symDrag.startX)));
  sym.y = Math.round(Math.max(0, Math.min(CH-def.h, symDrag.origY + sp.y - symDrag.startY)));
  const g = nodesG.querySelector('[data-id="'+sym.id+'"]');
  if (g) g.setAttribute('transform','translate('+sym.x+','+sym.y+')');
  connsG.innerHTML = '';
  connections.forEach(renderConn);
}
function onSymUp() {
  symDrag = null;
  document.removeEventListener('mousemove', onSymMove);
  document.removeEventListener('mouseup',   onSymUp);
  renderAll(); save();
}

// ═══════════════════════════════════════════════════════════
//  WIRE DRAWING
// ═══════════════════════════════════════════════════════════

function onWireMove(e) {
  if (!wireDrag) return;
  const sp = clientToSVG(e.clientX, e.clientY);
  const fs  = symbols.find(function(s){return s.id===wireDrag.fromId;});
  const fp  = portPos(fs, wireDrag.fromPort);
  const snap = findSnap(sp.x, sp.y, wireDrag.fromId);
  if (snap) {
    snapRing.setAttribute('cx',snap.x); snapRing.setAttribute('cy',snap.y);
    snapRing.setAttribute('visibility','visible');
    tempConn.setAttribute('d', orthPath(fp, wireDrag.fromPort, snap, snap.port));
  } else {
    snapRing.setAttribute('visibility','hidden');
    tempConn.setAttribute('d','M'+fp.x+','+fp.y+' L'+sp.x+','+sp.y);
  }
}

function onWireUp(e) {
  document.removeEventListener('mousemove', onWireMove);
  document.removeEventListener('mouseup',   onWireUp);
  tempConn.setAttribute('visibility','hidden');
  snapRing.setAttribute('visibility','hidden');
  if (!wireDrag) return;
  const sp   = clientToSVG(e.clientX, e.clientY);
  const snap = findSnap(sp.x, sp.y, wireDrag.fromId);
  if (snap) addConnection(wireDrag.fromId, wireDrag.fromPort, snap.symId, snap.port);
  wireDrag = null;
}

function findSnap(x, y, excludeId) {
  let best=null, bestD=30;
  for (let i=0;i<symbols.length;i++) {
    const sym=symbols[i];
    if (sym.id===excludeId) continue;
    const ports=DEFS[sym.type].ports;
    for (let j=0;j<ports.length;j++) {
      const p=portPos(sym,ports[j]);
      const d=Math.hypot(p.x-x,p.y-y);
      if (d<bestD) { bestD=d; best={x:p.x,y:p.y,port:p,symId:sym.id,port:ports[j]}; }
    }
  }
  return best;
}

function addConnection(fromId, fromPort, toId, toPort) {
  const dup = connections.find(function(c){return c.fromId===fromId&&c.fromPort===fromPort&&c.toId===toId&&c.toPort===toPort;});
  if (dup) return;
  const fromSym = symbols.find(function(s){return s.id===fromId;});
  let label = null;
  if (fromSym.type === 'DECISION') {
    const used = connections.filter(function(c){return c.fromId===fromId;}).map(function(c){return c.label;});
    const avail = ['Yes','No'].filter(function(l){return !used.includes(l);});
    if (avail.length===0) return;
    label = avail.length===1 ? avail[0] : (confirm('Label this branch "Yes"?\n(Cancel = No)') ? 'Yes' : 'No');
  }
  connections.push({id:uid(), fromId:fromId, fromPort:fromPort, toId:toId, toPort:toPort, label:label});
  renderAll(); save();
}

// ═══════════════════════════════════════════════════════════
//  CANVAS BACKGROUND — deselect + marquee
// ═══════════════════════════════════════════════════════════

document.getElementById('canvas-bg').addEventListener('mousedown', function(e) {
  if (e.button!==0) return;
  e.preventDefault();
  selId=null; selSet.clear();
  const sp = clientToSVG(e.clientX, e.clientY);
  marqDrag = {startX:sp.x, startY:sp.y};
  selBox.setAttribute('x',sp.x); selBox.setAttribute('y',sp.y);
  selBox.setAttribute('width',0); selBox.setAttribute('height',0);
  selBox.setAttribute('visibility','visible');
  document.addEventListener('mousemove', onMarqMove);
  document.addEventListener('mouseup',   onMarqUp);
  renderAll();
});

function onMarqMove(e) {
  if (!marqDrag) return;
  const sp=clientToSVG(e.clientX,e.clientY);
  const rx=Math.min(sp.x,marqDrag.startX), ry=Math.min(sp.y,marqDrag.startY);
  selBox.setAttribute('x',rx); selBox.setAttribute('y',ry);
  selBox.setAttribute('width',Math.abs(sp.x-marqDrag.startX));
  selBox.setAttribute('height',Math.abs(sp.y-marqDrag.startY));
}

function onMarqUp(e) {
  document.removeEventListener('mousemove', onMarqMove);
  document.removeEventListener('mouseup',   onMarqUp);
  if (!marqDrag) return;
  const sp=clientToSVG(e.clientX,e.clientY);
  const rx=Math.min(sp.x,marqDrag.startX), ry=Math.min(sp.y,marqDrag.startY);
  const rw=Math.abs(sp.x-marqDrag.startX), rh=Math.abs(sp.y-marqDrag.startY);
  if (rw>5||rh>5) {
    selSet.clear();
    symbols.forEach(function(sym) {
      const d=DEFS[sym.type];
      if (sym.x<rx+rw && sym.x+d.w>rx && sym.y<ry+rh && sym.y+d.h>ry) selSet.add(sym.id);
    });
  }
  marqDrag=null;
  selBox.setAttribute('visibility','hidden');
  renderAll();
}

// ═══════════════════════════════════════════════════════════
//  RIGHT-CLICK PAN
// ═══════════════════════════════════════════════════════════

wrap.addEventListener('contextmenu', function(e) { e.preventDefault(); });

wrap.addEventListener('mousedown', function(e) {
  if (e.button!==2) return;
  e.preventDefault();
  panDrag = {startX:e.clientX, startY:e.clientY, scrollX:wrap.scrollLeft, scrollY:wrap.scrollTop};
  wrap.style.cursor='grabbing';
  document.addEventListener('mousemove', onPanMove);
  document.addEventListener('mouseup',   onPanUp);
});
function onPanMove(e) {
  if (!panDrag) return;
  wrap.scrollLeft = panDrag.scrollX - (e.clientX-panDrag.startX);
  wrap.scrollTop  = panDrag.scrollY - (e.clientY-panDrag.startY);
}
function onPanUp() {
  panDrag=null; wrap.style.cursor='';
  document.removeEventListener('mousemove', onPanMove);
  document.removeEventListener('mouseup',   onPanUp);
}

// ═══════════════════════════════════════════════════════════
//  INLINE EDIT
// ═══════════════════════════════════════════════════════════

let editingSymId = null;

function startInlineEdit(sym) {
  const def = DEFS[sym.type];
  if (def.locked===true) return;
  const g    = nodesG.querySelector('[data-id="'+sym.id+'"]');
  const bbox = g.getBoundingClientRect();
  inlineEdit.style.display = 'block';
  inlineEdit.style.left    = bbox.left+'px';
  inlineEdit.style.top     = (bbox.top + bbox.height/2 - 14)+'px';
  inlineEdit.style.width   = Math.max(bbox.width, 100)+'px';
  editingSymId    = sym.id;
  inlineInp.value = sym.text||'';
  inlineInp.placeholder = def.locked==='prefix' ? 'variable' : 'text';
  inlineInp.focus(); inlineInp.select();
}

function commitEdit() {
  if (!editingSymId) return;
  const sym = symbols.find(function(s){return s.id===editingSymId;});
  if (sym) { sym.text=inlineInp.value.trim(); renderAll(); save(); }
  inlineEdit.style.display='none'; editingSymId=null;
}
inlineInp.addEventListener('keydown', function(e){if(e.key==='Enter'||e.key==='Escape')commitEdit();});
inlineInp.addEventListener('blur', commitEdit);

// ═══════════════════════════════════════════════════════════
//  CONTEXT MENUS
// ═══════════════════════════════════════════════════════════

let ctxMenu = null;
function closeCtx() { if(ctxMenu){ctxMenu.remove();ctxMenu=null;} }

function showCtxMenu(e, sym) {
  closeCtx();
  const m = document.createElement('div');
  m.className='ctx-menu';
  m.style.cssText='position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;z-index:9000;';
  const items=[];
  if (DEFS[sym.type].locked!==true) items.push(['Edit text', function(){startInlineEdit(sym);}]);
  if (sym.type==='EMBEDDED') items.push(['Edit pseudocode\u2026', function(){openEmbModal(sym.id);}]);
  items.push(['Delete', function(){deleteSym(sym.id);}]);
  items.forEach(function(it){
    const b=document.createElement('button');
    b.textContent=it[0];
    b.addEventListener('click',function(){closeCtx();it[1]();});
    m.appendChild(b);
  });
  document.body.appendChild(m); ctxMenu=m;
  setTimeout(function(){document.addEventListener('click',closeCtx,{once:true});},0);
}

function showConnCtx(e, conn) {
  closeCtx();
  const m=document.createElement('div');
  m.className='ctx-menu';
  m.style.cssText='position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;z-index:9000;';
  const b=document.createElement('button');
  b.textContent='Delete connection';
  b.addEventListener('click',function(){closeCtx();deleteConn(conn.id);});
  m.appendChild(b); document.body.appendChild(m); ctxMenu=m;
  setTimeout(function(){document.addEventListener('click',closeCtx,{once:true});},0);
}

function deleteSym(id) {
  symbols=symbols.filter(function(s){return s.id!==id;});
  connections=connections.filter(function(c){return c.fromId!==id&&c.toId!==id;});
  if(selId===id)selId=null; selSet.delete(id);
  renderAll(); save();
}
function deleteConn(id) {
  connections=connections.filter(function(c){return c.id!==id;});
  if(selId===id)selId=null;
  renderAll(); save();
}

document.addEventListener('keydown', function(e) {
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if(e.key==='Delete'||e.key==='Backspace') {
    if(selSet.size){selSet.forEach(function(id){deleteSym(id);});return;}
    if(selId) {
      const isConn=connections.find(function(c){return c.id===selId;});
      if(isConn)deleteConn(selId); else deleteSym(selId);
    }
  }
});

svg.addEventListener('click', function(e) {
  const bg=document.getElementById('canvas-bg');
  if(e.target===svg||e.target===bg){selId=null;selSet.clear();renderAll();}
});

// ═══════════════════════════════════════════════════════════
//  EMBEDDED MODAL
// ═══════════════════════════════════════════════════════════

let embSymId=null;
function openEmbModal(id) {
  embSymId=id;
  const sym=symbols.find(function(s){return s.id===id;});
  embEditor.value=sym.embeddedCode||'';
  embOverlay.style.display='flex'; embEditor.focus();
}
document.getElementById('embedded-save').addEventListener('click',function(){
  if(embSymId){const sym=symbols.find(function(s){return s.id===embSymId;});if(sym)sym.embeddedCode=embEditor.value;save();}
  embOverlay.style.display='none';
});
document.getElementById('embedded-cancel').addEventListener('click',function(){embOverlay.style.display='none';});
document.getElementById('embedded-close').addEventListener('click',function(){embOverlay.style.display='none';});

// ═══════════════════════════════════════════════════════════
//  ZOOM
// ═══════════════════════════════════════════════════════════

function applyZoom() {
  svg.style.width  = Math.round(CW*zoom)+'px';
  svg.style.height = Math.round(CH*zoom)+'px';
  zoomLabel.textContent = Math.round(zoom*100)+'%';
}

document.getElementById('btn-zi').addEventListener('click',function(){zoom=Math.min(3,parseFloat((zoom+0.15).toFixed(2)));applyZoom();});
document.getElementById('btn-zo').addEventListener('click',function(){zoom=Math.max(0.25,parseFloat((zoom-0.15).toFixed(2)));applyZoom();});
document.getElementById('btn-zf').addEventListener('click',function(){
  const r=wrap.getBoundingClientRect();
  zoom=parseFloat(Math.min(r.width/CW, r.height/CH).toFixed(2));
  applyZoom(); wrap.scrollLeft=0; wrap.scrollTop=0;
});
wrap.addEventListener('wheel',function(e){
  if(!e.ctrlKey&&!e.metaKey) return;
  e.preventDefault();
  zoom=Math.max(0.25,Math.min(3,parseFloat((zoom-e.deltaY*0.001).toFixed(3))));
  applyZoom();
},{passive:false});

// ═══════════════════════════════════════════════════════════
//  RIGHT PANEL RESIZE
// ═══════════════════════════════════════════════════════════

const resizer=document.getElementById('right-resizer');
let resDrag=null;
resizer.addEventListener('mousedown',function(e){
  resDrag={startX:e.clientX,startW:rightPanel.offsetWidth};
  document.addEventListener('mousemove',onResMove);
  document.addEventListener('mouseup',onResUp);
});
function onResMove(e){if(!resDrag)return;rightPanel.style.width=Math.max(200,Math.min(600,resDrag.startW+(resDrag.startX-e.clientX)))+'px';}
function onResUp(){resDrag=null;document.removeEventListener('mousemove',onResMove);document.removeEventListener('mouseup',onResUp);}

// ═══════════════════════════════════════════════════════════
//  TAB SWITCHING + TOOLBAR
// ═══════════════════════════════════════════════════════════

document.querySelectorAll('.rp-tab').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.rp-tab').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.rp-pane').forEach(function(p){p.classList.remove('active');});
    btn.classList.add('active');
    document.getElementById('pane-'+btn.dataset.tab).classList.add('active');
  });
});

document.getElementById('btn-theme').addEventListener('click',function(){
  document.body.classList.toggle('light-mode');
  localStorage.setItem('cie_theme',document.body.classList.contains('light-mode')?'light':'dark');
});
document.getElementById('btn-export-bw').addEventListener('click',exportBW);
document.getElementById('btn-clear').addEventListener('click',function(){
  if(confirm('Clear the entire canvas?')){symbols=[];connections=[];selId=null;selSet.clear();renderAll();save();}
});
document.getElementById('btn-copy-pseudo').addEventListener('click',function(){
  navigator.clipboard.writeText(pseudoOut.textContent).catch(function(){});
});
document.getElementById('btn-run').addEventListener('click',function(){runFlowchart(false);});
document.getElementById('btn-step').addEventListener('click',function(){if(!runCtx)runFlowchart(true);});
document.getElementById('btn-reset').addEventListener('click',resetExec);

// ═══════════════════════════════════════════════════════════
//  PSEUDOCODE GENERATOR
// ═══════════════════════════════════════════════════════════

function updatePseudocode() {
  const start=symbols.find(function(s){return s.type==='START';});
  if(!start){pseudoOut.textContent='// Add a START block to\n// generate pseudocode.';return;}
  try{
    const lines=[],vis=new Set();
    crawl(start.id,lines,vis,0);
    pseudoOut.textContent=lines.join('\n')||'// (empty)';
  }catch(err){pseudoOut.textContent='// Error: '+err.message;}
}

function crawl(id,lines,vis,depth){
  if(!id||vis.has(id))return;
  const sym=symbols.find(function(s){return s.id===id;});
  if(!sym)return;
  vis.add(id);
  const outs=connections.filter(function(c){return c.fromId===id;});
  switch(sym.type){
    case 'START':lines.push(ind(depth)+'// START');break;
    case 'STOP':lines.push(ind(depth)+'// STOP');return;
    case 'INPUT':lines.push(ind(depth)+'INPUT '+(sym.text||'x'));break;
    case 'OUTPUT':lines.push(ind(depth)+'OUTPUT '+(sym.text||'x'));break;
    case 'PROCESS':lines.push(ind(depth)+(sym.text||'// process'));break;
    case 'EMBEDDED':
      lines.push(ind(depth)+'CALL '+(sym.text||'Procedure'));
      (sym.embeddedCode||'').split('\n').filter(Boolean).forEach(function(l){lines.push(ind(depth+1)+l);});
      break;
    case 'DECISION':{
      const cond=sym.text||'condition';
      const yes=outs.find(function(c){return c.label==='Yes';});
      const no=outs.find(function(c){return c.label==='No';});
      if(no&&vis.has(no.toId)){
        lines.push(ind(depth)+'WHILE '+cond+' DO');
        if(yes)walkBlock(yes.toId,lines,new Set(vis),depth+1);
        lines.push(ind(depth)+'ENDWHILE');
        crawl(no.toId,lines,vis,depth);
      }else if(yes&&no){
        lines.push(ind(depth)+'IF '+cond+' THEN');
        walkBlock(yes.toId,lines,new Set(vis),depth+1);
        lines.push(ind(depth)+'ELSE');
        walkBlock(no.toId,lines,new Set(vis),depth+1);
        lines.push(ind(depth)+'ENDIF');
        const merge=findMerge(yes.toId,no.toId,vis);
        if(merge)crawl(merge,lines,vis,depth);
      }else{
        const branch=yes||outs[0];
        lines.push(ind(depth)+'IF '+cond+' THEN');
        if(branch)walkBlock(branch.toId,lines,new Set(vis),depth+1);
        lines.push(ind(depth)+'ENDIF');
      }
      return;
    }
  }
  if(outs.length===1)crawl(outs[0].toId,lines,vis,depth);
}

function walkBlock(startId,lines,vis,depth){
  let cur=startId,steps=0;
  while(cur&&steps++<100){
    const sym=symbols.find(function(s){return s.id===cur;});
    if(!sym||vis.has(cur))break;
    vis.add(cur);
    if(sym.type==='DECISION'||sym.type==='START'||sym.type==='STOP')break;
    switch(sym.type){
      case 'INPUT':lines.push(ind(depth)+'INPUT '+(sym.text||'x'));break;
      case 'OUTPUT':lines.push(ind(depth)+'OUTPUT '+(sym.text||'x'));break;
      case 'PROCESS':lines.push(ind(depth)+(sym.text||'// process'));break;
      case 'EMBEDDED':lines.push(ind(depth)+'CALL '+(sym.text||'Procedure'));break;
    }
    const o=connections.filter(function(c){return c.fromId===cur;});
    if(o.length===1)cur=o[0].toId;else break;
  }
}

function findMerge(aId,bId,vis){
  const aSet=new Set();let cur=aId,s=0;
  while(cur&&s++<50){aSet.add(cur);const o=connections.filter(function(c){return c.fromId===cur;});if(o.length!==1)break;cur=o[0].toId;}
  cur=bId;s=0;
  while(cur&&s++<50){if(aSet.has(cur))return cur;const o=connections.filter(function(c){return c.fromId===cur;});if(o.length!==1)break;cur=o[0].toId;}
  return null;
}

function ind(n){return'   '.repeat(n);}

// ═══════════════════════════════════════════════════════════
//  EXECUTOR
// ═══════════════════════════════════════════════════════════

var runCtx=null;

async function runFlowchart(stepping){
  const start=symbols.find(function(s){return s.type==='START';});
  if(!start){logC('// No START block','err');return;}
  clearConsole();clearTrace();activateTab('console');
  runCtx={vars:{},rows:[],stopped:false,stepping:stepping};
  enableInput(false);
  await execFlow(start.id);
  if(runCtx&&!runCtx.stopped)logC('// Execution complete.','info');
  clearHL();renderTraceTable();runCtx=null;
}

async function execFlow(startId){
  let cur=startId,steps=0;
  while(cur&&steps++<2000&&runCtx&&!runCtx.stopped){
    const sym=symbols.find(function(s){return s.id===cur;});
    if(!sym)break;
    highlight(cur);
    if(runCtx.stepping)await waitStep();
    if(!runCtx||runCtx.stopped)break;
    let next=null;
    const outs=connections.filter(function(c){return c.fromId===cur;});
    switch(sym.type){
      case 'START':next=outs[0]?outs[0].toId:null;break;
      case 'STOP':runCtx.stopped=true;logC('// STOP','info');break;
      case 'INPUT':{
        const val=await promptUser(sym.text||'x');
        if(val===null){runCtx.stopped=true;break;}
        const k=(sym.text||'x').trim();
        runCtx.vars[k]=isNaN(val)?val:Number(val);
        traceRow(sym,k,runCtx.vars[k]);next=outs[0]?outs[0].toId:null;break;
      }
      case 'OUTPUT':{
        const v=evalE(sym.text||'',runCtx.vars);
        logC('OUTPUT: '+v,'out');traceRow(sym,'OUTPUT',v);
        next=outs[0]?outs[0].toId:null;break;
      }
      case 'PROCESS':{
        const m=(sym.text||'').match(/^(\w+)\s*[←=]\s*(.+)$/);
        if(m){runCtx.vars[m[1]]=evalE(m[2],runCtx.vars);traceRow(sym,m[1],runCtx.vars[m[1]]);}
        next=outs[0]?outs[0].toId:null;break;
      }
      case 'EMBEDDED':logC('CALL '+(sym.text||'Procedure'),'info');next=outs[0]?outs[0].toId:null;break;
      case 'DECISION':{
        const res=evalC(sym.text||'false',runCtx.vars);
        logC('? '+(sym.text||'cond')+' \u2192 '+(res?'Yes':'No'),'info');
        const branch=outs.find(function(c){return c.label===(res?'Yes':'No');});
        next=branch?branch.toId:(outs[0]?outs[0].toId:null);break;
      }
    }
    cur=runCtx.stopped?null:next;
  }
  if(steps>=2000)logC('// Possible infinite loop \u2014 stopped.','err');
}

function evalE(expr,vars){
  try{
    let e=expr.replace(/←/g,'=').replace(/\bMOD\b/gi,'%').replace(/\bDIV\b/gi,'/').replace(/\bAND\b/gi,'&&').replace(/\bOR\b/gi,'||').replace(/\bNOT\s+/gi,'!');
    for(const k in vars)e=e.replace(new RegExp('\\b'+k+'\\b','g'),JSON.stringify(vars[k]));
    return Function('"use strict";return('+e+')')(); // eslint-disable-line no-new-func
  }catch{return expr;}
}
function evalC(c,v){try{return Boolean(evalE(c,v));}catch{return false;}}

function promptUser(varName){
  return new Promise(function(res){
    enableInput(true,'INPUT '+varName+' >');
    function done(){const v=cInput.value;cInput.value='';enableInput(false);res(v);}
    cSubmit.onclick=done;cInput.onkeydown=function(e){if(e.key==='Enter')done();};
  });
}
function waitStep(){
  return new Promise(function(res){
    const btn=document.getElementById('btn-step');
    btn.classList.add('waiting');
    btn.onclick=function(){btn.classList.remove('waiting');btn.onclick=null;res();};
  });
}
function highlight(id){clearHL();const g=nodesG.querySelector('[data-id="'+id+'"]');if(g)g.classList.add('active-exec');}
function clearHL(){nodesG.querySelectorAll('.active-exec').forEach(function(g){g.classList.remove('active-exec');});}
function resetExec(){
  if(runCtx)runCtx.stopped=true;
  clearHL();clearConsole();clearTrace();runCtx=null;
  logC('// CIE Flowchart Simulator','c-welcome');
  logC('// Press RUN to execute','c-welcome');
}

function logC(msg,cls){
  cls=cls||'out';
  const d=document.createElement('div');d.className='c-line c-'+cls;d.textContent=msg;
  consoleOut.appendChild(d);consoleOut.scrollTop=consoleOut.scrollHeight;
}
function clearConsole(){consoleOut.innerHTML='';}
function enableInput(on,lbl){
  lbl=lbl||'INPUT >';cPrompt.textContent=lbl;
  cInput.disabled=!on;cSubmit.disabled=!on;
  if(on){activateTab('console');cInput.focus();}
}
function activateTab(name){
  document.querySelectorAll('.rp-tab').forEach(function(b){b.classList.toggle('active',b.dataset.tab===name);});
  document.querySelectorAll('.rp-pane').forEach(function(p){p.classList.toggle('active',p.id==='pane-'+name);});
}
function traceRow(sym,k,v){if(runCtx)runCtx.rows.push({step:runCtx.rows.length+1,block:sym.type,v:k,val:v});}
function clearTrace(){traceWrap.innerHTML='<div class="trace-hint">Run your flowchart to populate the trace table.</div>';}
function renderTraceTable(){
  if(!runCtx||!runCtx.rows.length)return;
  const rows=runCtx.rows;
  const vars=[...new Set(rows.map(function(r){return r.v;}))];
  let h='<table class="trace-table"><thead><tr><th>#</th><th>Block</th>';
  vars.forEach(function(v){h+='<th>'+v+'</th>';});
  h+='</tr></thead><tbody>';
  const last={};
  rows.forEach(function(r){
    last[r.v]=r.val;
    h+='<tr><td>'+r.step+'</td><td>'+r.block+'</td>';
    vars.forEach(function(v){h+='<td>'+(v===r.v?'<strong>'+r.val+'</strong>':(last[v]!==undefined?last[v]:''))+'</td>';});
    h+='</tr>';
  });
  h+='</tbody></table>';
  traceWrap.innerHTML=h;
}

// ═══════════════════════════════════════════════════════════
//  EXPORT B&W PNG
// ═══════════════════════════════════════════════════════════

function exportBW(){
  const clone=svg.cloneNode(true);
  clone.setAttribute('width',CW);clone.setAttribute('height',CH);
  clone.style.width='';clone.style.height='';
  const bg=clone.querySelector('#canvas-bg');if(bg)bg.setAttribute('fill','#ffffff');
  clone.querySelectorAll('.node-shape').forEach(function(e){e.setAttribute('fill','#ffffff');e.setAttribute('stroke','#111');e.setAttribute('stroke-width','2');});
  clone.querySelectorAll('.node-bar').forEach(function(e){e.setAttribute('stroke','#111');});
  clone.querySelectorAll('.node-text').forEach(function(e){e.setAttribute('fill','#111');});
  clone.querySelectorAll('.conn-path').forEach(function(e){e.setAttribute('stroke','#111');e.setAttribute('marker-end','url(#arr-bw)');});
  clone.querySelectorAll('.port-dot,.port-hit').forEach(function(e){e.remove();});
  const tc=clone.querySelector('#temp-conn');if(tc)tc.setAttribute('visibility','hidden');
  const sb=clone.querySelector('#sel-box');if(sb)sb.setAttribute('visibility','hidden');
  const sn=clone.querySelector('#snap-ring');if(sn)sn.setAttribute('visibility','hidden');
  const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  img.onload=function(){
    const c=document.createElement('canvas');c.width=CW;c.height=CH;
    c.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(url);
    const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='flowchart.png';a.click();
  };
  img.src=url;
}

// ═══════════════════════════════════════════════════════════
//  PERSIST + INIT
// ═══════════════════════════════════════════════════════════

function save(){
  try{localStorage.setItem('cie_fc_s',JSON.stringify(symbols));localStorage.setItem('cie_fc_c',JSON.stringify(connections));}catch{}
}
function load(){
  try{
    symbols=JSON.parse(localStorage.getItem('cie_fc_s')||'[]');
    connections=JSON.parse(localStorage.getItem('cie_fc_c')||'[]');
    if(localStorage.getItem('cie_theme')==='light')document.body.classList.add('light-mode');
  }catch{symbols=[];connections=[];}
}

load();
applyZoom();
renderAll();
requestAnimationFrame(function(){
  wrap.scrollLeft=(CW*zoom-wrap.clientWidth)/2;
  wrap.scrollTop=(CH*zoom-wrap.clientHeight)/2;
});
