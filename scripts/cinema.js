/* PowerPod Platform — the scroll cinema.
 *
 * The film. Real CAD geometry (scripts/pod-geometry.js) drawn as hidden-line
 * wireframe, choreographed by one pure function of a single clock: update(t),
 * t in 0..1. Nothing in here reads the scroll. scripts/scroll.js owns the
 * scroll and hands this module a t, a dim and a lift on every frame, which is
 * what keeps the film and the copy on one timeline.
 *
 * Purity matters: every value below is a function of t alone, never of the
 * previous frame, so scrubbing backwards is identical to scrubbing forwards.
 *
 * Hidden-line removal is done with real depth: "paper" meshes in the page's
 * own porcelain (renderOrder 2) sit between interior lines (1) and exterior
 * lines (3). The renderer clears to transparent, so those meshes are the only
 * thing that makes the pod opaque, and it reads as an object of the same
 * material as the page lying on the ceramic.
 */
(function () {
'use strict';

window.PPCinema = { init: init };

/* Builds the whole film into `host` and returns its controls. Called once,
   and only when the browser can actually run it. */
function init(host) {
/* PAPER is --porcelain, not white. It is the fill of every occluder mesh, so
   it is the colour the pod is *made of*: matching the page body is what stops
   the hidden-line pass reading as white cut-outs punched in the glaze. */
const INK=0x0a0a0a, AMBER=0xf5a623, BLUE=0x2d6bff, PAPER=0xfaf8f5;
const INK_CSS="#0a0a0a", MUTE_CSS="#8b8b8b", AMBER_CSS="#f5a623";

/* ---------- renderer ---------- */
const stage=host;
/* Transparent clear: the ceramic glaze underneath is the film's background,
   and the whiteout beats in Act III/IV dissolve to it rather than to white. */
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.setClearColor(0x000000,0);
stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(26,innerWidth/innerHeight,2,5000);

/* ---------- helpers ---------- */
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
const win=(t,a,b)=>clamp((t-a)/(b-a),0,1);
const easeOut=t=>1-Math.pow(1-t,3);
const smoother=t=>t*t*t*(t*(t*6-15)+10);
function lineMat(o){return new THREE.LineBasicMaterial(Object.assign({color:INK,transparent:true,opacity:1},o));}
function paperMat(o){return new THREE.MeshBasicMaterial(Object.assign({color:PAPER,transparent:true,opacity:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:3,polygonOffsetUnits:5},o));}
function rrPts(w,h,r,seg=7){const p=[],hw=w/2,hh=h/2,c=[[hw-r,hh-r,0],[-(hw-r),hh-r,Math.PI/2],[-(hw-r),-(hh-r),Math.PI],[hw-r,-(hh-r),Math.PI*1.5]];
  for(const[cx,cy,a0]of c)for(let i=0;i<=seg;i++){const a=a0+i/seg*Math.PI/2;p.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return p;}
function circPts(r,seg=36){const p=[];for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2;p.push([r*Math.cos(a),r*Math.sin(a)]);}return p;}
function seg3(v){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));return g;}
function loopGeom(pts,place){const v=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];v.push(...place(a[0],a[1]),...place(b[0],b[1]));}return seg3(v);}
function pathGeom(pts,place){const v=[];for(let i=0;i<pts.length-1;i++)v.push(...place(pts[i][0],pts[i][1]),...place(pts[i+1][0],pts[i+1][1]));return seg3(v);}
function merge(gs){const v=[];gs.forEach(g=>{const a=g.getAttribute('position').array;for(let i=0;i<a.length;i++)v.push(a[i]);});return seg3(v);}
const yz=x0=>(u,v)=>[x0,v,u];
const xy=z0=>(u,v)=>[u,v,z0];
const xz=y0=>(u,v)=>[u,y0,v];
function shiftGeom(g,dx,dy,dz){const a=g.getAttribute('position').array;for(let i=0;i<a.length;i+=3){a[i]+=dx;a[i+1]+=dy;a[i+2]+=dz;}return g;}
function boxWire(cx,cy,cz,sx,sy,sz){
  const hx=sx/2,hy=sy/2,hz=sz/2,v=[];
  const c=[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]];
  const e=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  e.forEach(([a,b])=>{v.push(cx+c[a][0],cy+c[a][1],cz+c[a][2], cx+c[b][0],cy+c[b][1],cz+c[b][2]);});
  return seg3(v);
}
function tubeXg(x0,x1,size,r){const pts=rrPts(size,size,r),g=[loopGeom(pts,yz(x0)),loopGeom(pts,yz(x1))];
  const t=size/2-r,s=size/2,Lv=[];[[s,t],[s,-t],[-s,t],[-s,-t],[t,s],[-t,s],[t,-s],[-t,-s]].forEach(([u,v])=>Lv.push(x0,v,u,x1,v,u));g.push(seg3(Lv));return merge(g);}
function slabZ(w,h,r,z0,z1){const pts=rrPts(w,h,r),g=[loopGeom(pts,xy(z0)),loopGeom(pts,xy(z1))];
  const tx=w/2-r,ty=h/2-r,sx=w/2,sy=h/2,Lv=[];
  [[sx,ty],[sx,-ty],[-sx,ty],[-sx,-ty],[tx,sy],[-tx,sy],[tx,-sy],[-tx,-sy]].forEach(([u,v])=>Lv.push(u,v,z0,u,v,z1));g.push(seg3(Lv));return merge(g);}
function rrShape(w,h,r){const s=new THREE.Shape(),hw=w/2,hh=h/2;
  s.moveTo(-hw+r,-hh);s.lineTo(hw-r,-hh);s.absarc(hw-r,-hh+r,r,-Math.PI/2,0,false);
  s.lineTo(hw,hh-r);s.absarc(hw-r,hh-r,r,0,Math.PI/2,false);
  s.lineTo(-hw+r,hh);s.absarc(-hw+r,hh-r,r,Math.PI/2,Math.PI,false);
  s.lineTo(-hw,-hh+r);s.absarc(-hw+r,-hh+r,r,Math.PI,Math.PI*1.5,false);return s;}
function extrude(w,h,r,depth){return new THREE.ExtrudeGeometry(rrShape(w,h,r),{depth,bevelEnabled:false,curveSegments:8});}
function L(g,m,order){const o=new THREE.LineSegments(g,m);o.renderOrder=order;return o;}
const L2=L;
function P(g,m){const o=new THREE.Mesh(g,m);o.renderOrder=2;return o;}
function rr(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

/* =====================================================================
   ACT I — THE POD
   ===================================================================== */
const pod=new THREE.Group(); scene.add(pod);
const podPaper=paperMat();
{
  /* 1.4mm inset: enough clearance that the silhouette lines never z-fight
     with their own fill at grazing angles */
  const tOcc=extrude(132.2,132.2,26.6,D.tubeX[1]-D.tubeX[0]); tOcc.rotateY(Math.PI/2); tOcc.translate(D.tubeX[0],0,0);
  const cL=extrude(137.2,137.2,30.6,D.collarL[1]-(-199.3)); cL.rotateY(Math.PI/2); cL.translate(-199.3,0,0);
  const cR=extrude(137.2,137.2,30.6,D.collarRt[1]-D.collarRt[0]); cR.rotateY(Math.PI/2); cR.translate(D.collarRt[0],0,0);
  [tOcc,cL,cR].forEach(g=>pod.add(P(g,podPaper)));
}
const shellMat=lineMat();
{
  const g=[];
  g.push(tubeXg(D.tubeX[0],D.tubeX[1],D.tubeSize,D.tubeR));
  g.push(tubeXg(D.collarL[0],D.collarL[1],D.collarSize,D.collarR));
  g.push(tubeXg(D.collarRt[0],D.collarRt[1],D.collarSize,D.collarR));
  g.push(loopGeom(rrPts(D.tubeSize,D.tubeSize,D.tubeR),yz(D.collarL[1])));
  g.push(loopGeom(rrPts(D.tubeSize,D.tubeSize,D.tubeR),yz(D.collarRt[0])));
  pod.add(L(merge(g),shellMat,3));
}
function quadStrip(rows){
  const v=[];
  for(let i=0;i<rows.length-1;i++){
    const a0=rows[i][0],b0=rows[i][1],a1=rows[i+1][0],b1=rows[i+1][1];
    v.push(...a0,...b0,...b1, ...a0,...b1,...a1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  return g;
}
/* =====================================================================
   TOP CAP + HANDLE — PP_HND_WTH_CVR V1.5 R2, at its STEP dimensions.
   The handle is a 155.34mm assembly: a mounting block at each end and a
   101.6mm grip bar bridging them, with a finger slot underneath. It sits on
   the DIAGONAL of the 140 square top face (whose diagonal is 197.98), so the
   feet land 15mm inside two opposite corners.
   The diagonal runs (+1,-1) in the face's own axes, which projects as
   lower-left to upper-right in every shot where the whole pod is in frame —
   horizontal at the open, and vertical alongside the phone and in the
   closing line-up.
   ===================================================================== */
function buildTop(baseX, outward){
  const DG=Math.SQRT1_2;
  /* Trimmed at the outer ends: on the diagonal of a 140 square the available
     half-width is (98.99 - u), so at the STEP's full u=77.67 only +-21 fits and
     the blocks would hang off the cap corners. Ends pulled to +-72, width to
     +-20, which seats them on the face. The bar keeps its STEP length. */
  const FL=[-72,-30.28], FR=[26.23,72], FW=20, FH=22.0;
  const BAR=[-50.79,50.79], BW=15.20, BLO=10.34, BHI=22.07;        // grip bar
  /* u along the handle, w across it, h up off the cap face */
  /* the diagonal that reads lower-left to upper-right: +u goes right and
     toward the viewer, and on a cap above eye level nearer reads higher. */
  const P=(u,w,h)=>[ baseX+outward*h, (u+w)*DG, (u-w)*DG ];
  const g=[], d=[], surf=[];
  const boxPts=(u0,u1,w,r,seg)=>{
    const cu=(u0+u1)/2, hu=(u1-u0)/2;
    return rrPts(2*hu,2*w,r,seg).map(q=>[cu+q[0], q[1]]);
  };
  /* the top runs as one shallow arch across the whole assembly, as it does on
     the real handle — flat-topped boxes read far too hard */
  const at=(h,u)=> (typeof h==='function') ? h(u) : h;
  const solid=(u0,u1,w,h0,h1,r)=>{                 // real wireframe + occluder
    const pts=boxPts(u0,u1,w,r,10), rows=[];
    const loop=h=>{const v=[];
      for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];
        v.push(...P(a[0],a[1],at(h,a[0])), ...P(b[0],b[1],at(h,b[0])));} return seg3(v);};
    g.push(loop(h1), loop(h0));
    [0,0.25,0.5,0.75].forEach(f=>{        // four corner ties, not one per segment
      const i=Math.round(f*pts.length)%pts.length;
      g.push(seg3([...P(pts[i][0],pts[i][1],at(h0,pts[i][0])),
                   ...P(pts[i][0],pts[i][1],at(h1,pts[i][0]))]));});
    for(let j=0;j<=pts.length;j++){const k=j%pts.length;
      rows.push([P(pts[k][0],pts[k][1],at(h0,pts[k][0])),
                 P(pts[k][0],pts[k][1],at(h1,pts[k][0]))]);}
    surf.push(quadStrip(rows));
    const top=[];                                   // arched top surface
    for(let j=0;j<=pts.length;j++){const k=j%pts.length;
      top.push([P(pts[k][0],0,at(h1,pts[k][0])), P(pts[k][0],pts[k][1],at(h1,pts[k][0]))]);}
    surf.push(quadStrip(top));
  };
  const ARCH=u=>FH+3.4-6.2*Math.pow(Math.min(1,Math.abs(u)/FR[1]),2.1);
  solid(FL[0],FL[1],FW,0,ARCH,7);
  solid(FR[0],FR[1],FW,0,ARCH,7);
  solid(BAR[0],BAR[1],BW,BLO,ARCH,5);
  /* Nothing is drawn without depth testing: the handle stands proud of the
     cap, so its own solid hides its far side and hidden-line removal does the
     rest. That reads correctly from any angle, standing or lying down. */
  return {lines:merge(g), detail:merge(d), mesh:merge(surf)};
}
/* --- HANDLE: digitised from the STEP file --- */
const handleMat=lineMat();
const handlePaper=paperMat({opacity:0});
/* the pocket and handle are recessed; at the angles this film uses they would
   be hidden by the crown, so they draw as cap detail — the same convention
   the rest of the film uses when it shows internals through the shell. */
const capDetailMat=lineMat({opacity:0,depthTest:false});
{
  const g=[],face=D.handleFaceX,floor=D.handleFloorX;
  /* the recess the bail sits in — a single diagonal pocket, nothing more */
  /* no recess outline: the handle itself says which end is the top, and a
     45-degree pocket streaks diagonal lines right across the cap */

  const HB=buildTop(D.collarL[0],-1);          // crowned cap, handle recessed into it
  g.push(HB.lines);
  pod.add(L(merge(g),handleMat,3));
  pod.add(L(HB.detail,capDetailMat,6));
  pod.add(P(HB.mesh,handlePaper));
}
/* --- CONNECTOR: PP_XCONN_ENC_F V1.5, built from its own STEP ---
   77 x 77 plate on R13 corners, 14mm deep, with all 80 drilled features at
   their true centres, radii and depths. The pod's end cap frames it. */
const connMat=lineMat({opacity:0}), connPaper=paperMat({opacity:0});
{
  const g=[], FX=199.7;                       // outward face of the connector
  const px=y=>FX-y;                           // connector depth -> pod x
  g.push(loopGeom(rrPts(D.facePlate.size,D.facePlate.size,D.facePlate.r),yz(D.facePlate.x)));
  g.push(loopGeom(rrPts(118,118,26),yz(px(0))));
  const plate=rrPts(77,77,13);
  g.push(loopGeom(plate,yz(px(0))));
  g.push(loopGeom(plate,yz(px(2.02))));
  for(let i=0;i<plate.length;i+=2)
    g.push(seg3([px(0),plate[i][1],plate[i][0], px(2.02),plate[i][1],plate[i][0]]));
  g.push(loopGeom(rrPts(70,70,11),yz(px(2.02))));
  g.push(loopGeom(rrPts(46,46,10),yz(px(0.5))));      // raised inner boss
  /* Only what the face actually presents: the part is opaque, so bores that
     start deep inside it are not visible from here. Front-facing features get
     their rim plus a short counterbore ring for depth. */
  XCONN.forEach(([bx,bz,r,y0,y1])=>{
    if(y0>3.5 || r>10 || r<1.8) return;               // back-side, cavity, and pilot-hole scatter
    const seg=r>6?32:(r>2.2?20:12);
    g.push(loopGeom(circPts(r,seg),(u,v)=>[px(y0),bz+v,bx+u]));
    if(y1-y0>1.0 && r>=1.9){
      const d=Math.min(y1,y0+Math.min(4,r));
      g.push(loopGeom(circPts(r*0.94,seg),(u,v)=>[px(d),bz+v,bx+u]));
    }
  });
  pod.add(L(merge(g),connMat,4));
  const o=extrude(75.6,75.6,12.3,12); o.rotateY(Math.PI/2); o.translate(px(12.2),0,0);
  pod.add(P(o,connPaper));
}
/* =====================================================================
   CELLS — three chemistries on the same pack architecture.
   Ø21.0 on a 22.6 pitch (measured): 1.6mm clearance, tops never touch.
   ===================================================================== */
/* ---- 1. NMC 21700: can, crimp, vent cap, spiral jelly roll ---- */
const cellGroup=new THREE.Group();
const cellLineMats=[],cellPaperMats=[],cellMeshes=[];
{
  const r=D.cell.dia/2, rc=D.cell.cap/2, hl=D.cell.len/2, gs=[];
  gs.push(loopGeom(circPts(r,40),xy(-hl)));
  gs.push(loopGeom(circPts(r,40),xy(hl)));
  gs.push(loopGeom(circPts(D.cell.step/2,36),xy(hl-0.9)));      // crimp step
  gs.push(loopGeom(circPts(rc,32),xy(hl+0.15)));                // cap disc
  gs.push(loopGeom(circPts(rc*0.42,20),xy(hl+0.3)));            // positive terminal
  for(let i=0;i<4;i++){                                         // vent slots
    const a=i/4*Math.PI*2+Math.PI/4;
    gs.push(shiftGeom(loopGeom(rrPts(5.4,1.9,0.9),xy(hl+0.22)),
      Math.cos(a)*6.1,Math.sin(a)*6.1,0));
  }
  [[r,0],[-r,0],[0,r],[0,-r]].forEach(([u,v])=>gs.push(seg3([u,v,-hl,u,v,hl-0.9])));
  /* the face we look at: can rim, crimp ring, terminal. Nothing else —
     a wound-core spiral on 70 faces at once just reads as visual noise. */
  gs.push(loopGeom(circPts(9.4,32),xy(-hl+0.35)));             // crimp ring
  gs.push(loopGeom(circPts(3.6,20),xy(-hl+0.35)));             // terminal
  const lineGeo=merge(gs);
  const occGeo=new THREE.CylinderGeometry(r-0.15,r-0.15,D.cell.len-0.6,22); occGeo.rotateX(Math.PI/2);
  D.cells.forEach(c=>{
    const h=new THREE.Group(); h.position.set(c[0],c[1],c[2]); h.userData.home=c[1];
    const lm=lineMat({opacity:0}),pm=paperMat({opacity:0});
    h.add(L(lineGeo,lm,1)); h.add(P(occGeo,pm));
    cellGroup.add(h); cellLineMats.push(lm); cellPaperMats.push(pm); cellMeshes.push(h);
  });
}
pod.add(cellGroup);

/* ---- 2. The same cells, laid on their side ----
   Identical Ø21.0 x 67.3 cans, just rotated: axis along the pack instead of
   across it. Nothing about the cell changes, only how the pack is packed. */
const horizGroup=new THREE.Group(); pod.add(horizGroup);
const horizMat=lineMat({opacity:0}), horizPaper=paperMat({opacity:0});
const HCELLS=[];
{
  const r=D.cell.dia/2, hl=D.cell.len/2, gs=[];
  for(let i=0;i<4;i++) for(let j=0;j<5;j++) for(let k=0;k<3;k++)
    HCELLS.push([-105+i*70, (j-2)*22.6, 5+(k-1)*22.6]);
  const cell=[];
  cell.push(loopGeom(circPts(r,40),yz(-hl)));                 // the end we look at
  cell.push(loopGeom(circPts(9.4,32),yz(-hl+0.35)));          // crimp ring
  cell.push(loopGeom(circPts(3.6,20),yz(-hl+0.35)));          // terminal
  cell.push(loopGeom(circPts(r,40),yz(hl)));
  cell.push(loopGeom(circPts(D.cell.step/2,36),yz(hl-0.9)));
  [[r,0],[-r,0],[0,r],[0,-r]].forEach(([u,v])=>
    cell.push(seg3([-hl,v,u, hl-0.9,v,u])));
  const one=merge(cell);
  HCELLS.forEach(([cx,cy,cz])=>gs.push(shiftGeom(one.clone(),cx,cy,cz)));
  horizGroup.add(L(merge(gs),horizMat,1));
  const occ=new THREE.CylinderGeometry(r-0.15,r-0.15,D.cell.len-0.6,20); occ.rotateZ(Math.PI/2);
  HCELLS.forEach(([cx,cy,cz])=>{
    const m=new THREE.Mesh(occ,horizPaper); m.position.set(cx,cy,cz); m.renderOrder=2;
    horizGroup.add(m);
  });
}

/* --- structural internals --- */
function part(build,order){const m=lineMat({opacity:0});const o=L(merge(build()),m,order||1);pod.add(o);return{o,m};}
const holder=part(()=>{const g=[],z=D.holder.z;
  g.push(shiftGeom(loopGeom(rrPts(D.holder.x1-D.holder.x0,D.holder.y1-D.holder.y0,10),xy(z)),(D.holder.x0+D.holder.x1)/2,0,0));
  D.cells.forEach(c=>g.push(loopGeom(circPts(10.75,20),(u,v)=>[c[0]+u,c[1]+v,z])));return g;});
const plates=part(()=>{const g=[];[D.endPlateX[0],D.endPlateX[1]].forEach(x=>{
  g.push(loopGeom(rrPts(D.endPlateSize,D.endPlateSize,D.endPlateR),yz(x)));
  g.push(loopGeom(rrPts(100,100,18),yz(x)));});return g;});

/* =====================================================================
   IoT / BMS  — staged, detailed reveal during the orbit (renderOrder 4:
   drawn above the paper so it stays crisp while the cells sit faint behind)
   ===================================================================== */
function stagedGroup(items,order){
  const mats=[],objs=[],grp=new THREE.Group();
  items.forEach(g=>{const m=lineMat({opacity:0});const o=L(g,m,order);grp.add(o);mats.push(m);objs.push(o);});
  pod.add(grp); return {mats,objs,grp};
}
/* board substrates: the power PCB along the floor */
const boardMat=lineMat({opacity:0});
{
  const g=[],pb=D.pcb,cx=(pb.x0+pb.x1)/2,cz=(pb.z0+pb.z1)/2;
  g.push(shiftGeom(loopGeom(rrPts(pb.x1-pb.x0,pb.z1-pb.z0,4),xz(pb.y)),cx,0,cz));
  g.push(shiftGeom(loopGeom(rrPts(pb.x1-pb.x0-9,pb.z1-pb.z0-9,3),xz(pb.y+1.5)),cx,0,cz));
  pod.add(L(merge(g),boardMat,4));
}
const pwParts=stagedGroup(IOT.pw.map(a=>boxWire(a[0],a[1],a[2],a[3],a[4],a[5])),4);
const busParts=stagedGroup(IOT.bs.map(a=>{
  const g=[shiftGeom(loopGeom(rrPts(a[3],a[4],1.0),xy(a[2]-a[5]/2)),a[0],a[1],0),
           shiftGeom(loopGeom(rrPts(a[3],a[4],1.0),xy(a[2]+a[5]/2)),a[0],a[1],0)];
  return merge(g);}),4);

/* =====================================================================
   BMS — the 110 x 90 board at x=-82.2 (STEP), then two alternates, to
   show the pack takes any BMS. Each is opaque: lines + a paper backer.
   ===================================================================== */
const BZ=-37.55;                                   // board plane from the STEP
/* Components are declared as data, not drawn ad hoc, so their footprints can
   be collision-checked. BOARD_RECTS collects every footprint for that test. */
const BOARD_RECTS=[];
function drawParts(g,name,cx,cy,w,h,holes,parts){
  const R=(x0,y0,x1,y1,k)=>BOARD_RECTS.push({board:name,kind:k,x0,y0,x1,y1});
  g.push(shiftGeom(loopGeom(rrPts(w,h,3),xy(BZ)),cx,cy,0));
  g.push(shiftGeom(loopGeom(rrPts(w,h,3),xy(BZ-1.6)),cx,cy,0));
  const pr=rrPts(w,h,3);
  for(let i=0;i<pr.length;i+=3)
    g.push(seg3([cx+pr[i][0],cy+pr[i][1],BZ, cx+pr[i][0],cy+pr[i][1],BZ-1.6]));
  (holes||[]).forEach(([hx,hy])=>{
    g.push(shiftGeom(loopGeom(circPts(1.7,14),xy(BZ)),cx+hx,cy+hy,0));
    g.push(shiftGeom(loopGeom(circPts(3.0,14),xy(BZ)),cx+hx,cy+hy,0));
    R(cx+hx-3.2,cy+hy-3.2,cx+hx+3.2,cy+hy+3.2,'hole');
  });
  parts.forEach(pt=>{
    const x=cx+pt.x, y=cy+pt.y;
    if(pt.k==='ic'){
      g.push(shiftGeom(loopGeom(rrPts(pt.w,pt.h,1),xy(BZ-1.9)),x,y,0));
      g.push(shiftGeom(loopGeom(circPts(0.9,10),xy(BZ-2.0)),x-pt.w/2+2.4,y+pt.h/2-2.4,0));
      for(let i=0;i<pt.pins;i++){
        const u=x-pt.w/2+(i+0.5)*pt.w/pt.pins;
        g.push(seg3([u,y+pt.h/2,BZ-1.9, u,y+pt.h/2+1.5,BZ-1.9]));
        g.push(seg3([u,y-pt.h/2,BZ-1.9, u,y-pt.h/2-1.5,BZ-1.9]));
      }
      R(x-pt.w/2,y-pt.h/2-1.5,x+pt.w/2,y+pt.h/2+1.5,'ic');
    } else if(pt.k==='grid'){
      for(let i=0;i<pt.c;i++)for(let j=0;j<pt.r;j++)
        g.push(shiftGeom(loopGeom(rrPts(2.6,1.4,0.4),xy(BZ-1.7)),x+i*pt.dx,y+j*pt.dy,0));
      const ex=x+(pt.c-1)*pt.dx, ey=y+(pt.r-1)*pt.dy;
      R(Math.min(x,ex)-1.3,Math.min(y,ey)-0.7,Math.max(x,ex)+1.3,Math.max(y,ey)+0.7,'passives');
    } else {                                       // plain footprint
      g.push(shiftGeom(loopGeom(rrPts(pt.w,pt.h,pt.r||1),xy(BZ-(pt.z||2.4))),x,y,0));
      R(x-pt.w/2,y-pt.h/2,x+pt.w/2,y+pt.h/2,pt.k);
    }
  });
}
function bmsVariant(name,cx,cy,w,h,holes,parts){
  const m=lineMat({opacity:0}), pm=paperMat({opacity:0});
  const grp=new THREE.Group(); pod.add(grp);
  const g=[]; drawParts(g,name,cx,cy,w,h,holes,parts);
  grp.add(L(merge(g),m,4));
  const o=extrude(w-0.4,h-0.4,2.8,1.5); o.translate(cx,cy,BZ-1.55);
  grp.add(P(o,pm));
  return {grp,m,pm};
}
/* The BS BMS, digitised from its STEP: a 161.1 x 91.9 board whose frame —
   outline, mounting screws, corner holes and the ribbed barley-paper backer —
   is identical in every variant. Only the component islands move, which is
   the honest way to say "the pack takes any BMS". Every layout is collision-
   checked against the frame and against the other components. */
const BMS_X=56.1, BMS_Y=0.1;                 // 160.2 x 90.2 station from the pod STEP
const BMS_PZ=BZ-1.7;                         // board face toward the camera
function bmsCurves(list){
  const g=[];
  list.forEach(([curve,ou,ov])=>{
    const v=[];
    for(let i=0;i<curve.length-1;i++)
      v.push(BMS_X+curve[i][0]+ou,   BMS_Y+curve[i][1]+ov,   BMS_PZ,
             BMS_X+curve[i+1][0]+ou, BMS_Y+curve[i+1][1]+ov, BMS_PZ);
    g.push(seg3(v));
  });
  return merge(g);
}
/* The board itself is drawn once and never changes. Only the component
   islands hand off, so the outline can't flicker or ghost between variants. */
const bmsFrameMat=lineMat({opacity:0}), bmsFramePaper=paperMat({opacity:0});
{
  const grp=new THREE.Group(); pod.add(grp);
  grp.add(L2(bmsCurves(BSBMS.frame.map(c=>[c,0,0])),bmsFrameMat,4));
  const o=extrude(159.8,89.8,3,1.7); o.translate(BMS_X,BMS_Y,BMS_PZ);
  grp.add(P(o,bmsFramePaper));
}
function bmsParts(which){
  const m=lineMat({opacity:0});
  const grp=new THREE.Group(); pod.add(grp);
  const list=[];
  BSBMS.isl.forEach((island,i)=>{
    const [ou,ov]=BSBMS.L[which][i];
    island.c.forEach(c=>list.push([c,ou,ov]));
  });
  grp.add(L2(bmsCurves(list),m,4));
  return {grp,m};
}
const bmsV1=bmsParts(0), bmsV2=bmsParts(1);   // the third beat returns to ours
const BMS_VARIANTS=[bmsV1,bmsV2];

/* =====================================================================
   IoT / TELEMATICS BOARD — the 160.2 x 90.2 board at x=56.1 (STEP),
   carrying the real 41.9 x 32 RF module and the 8.8 x 12.7 connector.
   Opaque, and detailed enough to hold a close-up.
   ===================================================================== */
const iotMat=lineMat({opacity:0}), iotPaper=paperMat({opacity:0});
const iotGroup=new THREE.Group(); pod.add(iotGroup);
{
  /* Pulse V2.0 — 110 x 90 x 1.6 board carrying 338 real components and 12
     drilled holes, all read straight out of the KiCad STEP. Nothing here is
     drawn by hand. Board front face points at the camera; parts stand proud
     of it by their true heights. */
  const g=[], CX=-82.2, CY=0.0, PF=BZ-1.6;   // 110 x 90 station, far end of the pack
  const out=rrPts(110,90,2);
  g.push(shiftGeom(loopGeom(out,xy(PF)),CX,CY,0));
  g.push(shiftGeom(loopGeom(out,xy(BZ)),CX,CY,0));
  for(let i=0;i<out.length;i+=2)
    g.push(seg3([CX+out[i][0],CY+out[i][1],PF, CX+out[i][0],CY+out[i][1],BZ]));
  PULSE.h.forEach(([hx,hy,r])=>{
    g.push(shiftGeom(loopGeom(circPts(r,16),xy(PF)),CX+hx,CY+hy,0));
    g.push(shiftGeom(loopGeom(circPts(r,16),xy(BZ)),CX+hx,CY+hy,0));
    if(r>1.5) g.push(shiftGeom(loopGeom(circPts(r+1.3,16),xy(PF)),CX+hx,CY+hy,0));
  });
  PULSE.c.forEach(([x0,y0,x1,y1,ht])=>{
    const w=x1-x0, d=y1-y0;
    if(w<=0.05||d<=0.05) return;
    const cx=CX+(x0+x1)/2, cy=CY+(y0+y1)/2;
    const rad=Math.max(0.12,Math.min(0.5,w/4,d/4));
    const zt=PF-ht;
    g.push(shiftGeom(loopGeom(rrPts(w,d,rad,2),xy(zt)),cx,cy,0));
    if(w*d>6){                                   // give the taller parts real body
      g.push(shiftGeom(loopGeom(rrPts(w,d,rad,2),xy(PF)),cx,cy,0));
      [[w/2-rad,d/2-rad],[w/2-rad,-(d/2-rad)],[-(w/2-rad),d/2-rad],[-(w/2-rad),-(d/2-rad)]]
        .forEach(([u,v])=>g.push(seg3([cx+u,cy+v,PF, cx+u,cy+v,zt])));
    }
  });
  iotGroup.add(L(merge(g),iotMat,4));
  const o=extrude(109.6,89.6,1.8,1.6); o.translate(CX,CY,PF);
  iotGroup.add(P(o,iotPaper));
}
/* sense-wire harness: BMS board out to each cell column */
const harnessMat=lineMat({opacity:0});
{
  const g=[],hz=-39.5;
  for(let col=0;col<14;col++){
    const x=D.cells[col*5][0];
    g.push(seg3([x,-52,hz, x,52,hz]));
    for(let row=0;row<5;row++){const y=D.cells[col*5+row][1];
      g.push(seg3([x,y,hz, x,y,-31.5]));}
  }
  pod.add(L(merge(g),harnessMat,4));
}

/* =====================================================================
   MORPH — pod silhouette lifts + rotates upright into the iPad
   ===================================================================== */
const IPAD={w:247.6,h:178.5,r:18,d:5.9,y:150,z:0};
const morphMat=lineMat({opacity:0});
const MSEG=9;
const morphGeo=(()=>{const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(4*(MSEG+1)*2*3),3));return g;})();
const morphLoop=L(morphGeo,morphMat,3); morphLoop.visible=false; scene.add(morphLoop);
function setMorph(k){
  const w=lerp(399.1,IPAD.w,k),d=lerp(139.99,IPAD.h,k),r=lerp(32,IPAD.r,k);
  const a=k*Math.PI/2,sa=Math.sin(a),ca=Math.cos(a),Y=lerp(70,IPAD.y,k),Z=k*(IPAD.z+3);
  const pts=rrPts(w,d,r,MSEG),arr=morphGeo.getAttribute('position').array;
  let j=0;
  for(let i=0;i<pts.length;i++){
    const p=pts[i],q=pts[(i+1)%pts.length];
    arr[j++]=p[0];arr[j++]=Y+p[1]*sa;arr[j++]=p[1]*ca+Z;
    arr[j++]=q[0];arr[j++]=Y+q[1]*sa;arr[j++]=q[1]*ca+Z;
  }
  morphGeo.getAttribute('position').needsUpdate=true;
}

/* =====================================================================
   ACT II — iPAD  (canvas UI, DM Sans, measured layout — no overflow)
   ===================================================================== */
const ipad=new THREE.Group(); ipad.position.set(0,IPAD.y,IPAD.z); ipad.visible=false; scene.add(ipad);
const padLineMat=lineMat({opacity:0}),padPaper=paperMat({opacity:0});
{
  /* body stops short of the recess floor so the screen stays in front of it */
  const occ=extrude(IPAD.w-0.6,IPAD.h-0.6,17.7,IPAD.d-1.5); occ.translate(0,0,-IPAD.d/2+0.2);
  ipad.add(P(occ,padPaper));
  const g=[];
  g.push(slabZ(IPAD.w,IPAD.h,18,-IPAD.d/2,IPAD.d/2));                 // body
  g.push(loopGeom(rrPts(233,164,9),xy(IPAD.d/2)));                    // one bezel line, nothing else
  ipad.add(L(merge(g),padLineMat,3));
}
const PW=1400,PH_=985;
const padCv=document.createElement('canvas'); padCv.width=PW; padCv.height=PH_;
const padCtx=padCv.getContext('2d');
const padTex=new THREE.CanvasTexture(padCv); padTex.anisotropy=4;
const padScreenMat=new THREE.MeshBasicMaterial({map:padTex,transparent:true,opacity:0});
const padScreen=new THREE.Mesh(new THREE.PlaneGeometry(226,159),padScreenMat);
padScreen.position.z=IPAD.d/2-0.55;   /* seated in the recess, clear of the body */ padScreen.renderOrder=4; ipad.add(padScreen);

const FONT=(w,s)=>w+" "+s+"px 'DM Sans', system-ui, sans-serif";
const NAV=[["dash","Dashboard"],["fin","Financial Dashboard"],["fore","Forecast"],["pay","Payments"],["swap","SwapNest"]];
/* measured, ellipsised text — nothing ever spills its box */
function fitText(ctx,text,maxW){
  if(ctx.measureText(text).width<=maxW)return text;
  let lo=0,hi=text.length;
  while(lo<hi){const mid=(lo+hi+1)>>1;
    if(ctx.measureText(text.slice(0,mid)+"\u2026").width<=maxW)lo=mid;else hi=mid-1;}
  return text.slice(0,lo)+"\u2026";
}
/* The rupee mark, stroked rather than typed.
   Every glyph this film paints has to be DM Sans, and U+20B9 sits outside the
   subset the site self-hosts, so `fillText("₹")` would silently render one
   character in whatever the system fallback happens to be. Drawn from a path
   it is always the same mark on every machine, and it matches the weight of
   the other line icons besides. Coordinates are the standard 24-unit box. */
function rupee(ctx,cx,cy,size){
  const k=size/24, X=x=>cx+(x-12)*k, Y=y=>cy+(y-12)*k;
  ctx.save();
  ctx.lineWidth=Math.max(1.4,2*k);ctx.lineJoin="round";ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(X(6),Y(3));  ctx.lineTo(X(18),Y(3));      // shirorekha
  ctx.moveTo(X(6),Y(8));  ctx.lineTo(X(18),Y(8));      // second bar
  ctx.moveTo(X(6),Y(13)); ctx.lineTo(X(9),Y(13));
  ctx.moveTo(X(9),Y(13));                              // the bowl, closing upward
  ctx.bezierCurveTo(X(15.7),Y(13),X(15.7),Y(3),X(9),Y(3));
  ctx.moveTo(X(6),Y(13)); ctx.lineTo(X(14.5),Y(21));   // the leg
  ctx.stroke();
  ctx.restore();
}
/* icons drawn inside a fixed 34px box centred on (cx,cy) */
function icon(ctx,kind,cx,cy,col){
  const S=34,h=S/2;
  ctx.save();ctx.translate(cx,cy);
  ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=2.6;ctx.lineJoin="round";ctx.lineCap="round";
  if(kind==="dash"){const g=14,gap=6,o=(g+gap)/2;
    [[-o-g/2,-o-g/2],[o-g/2,-o-g/2],[-o-g/2,o-g/2],[o-g/2,o-g/2]].forEach(([a,b])=>{rr(ctx,a,b,g,g,3);ctx.stroke();});}
  else if(kind==="fin"){rupee(ctx,0,0,26);}
  else if(kind==="fore"){ctx.beginPath();ctx.moveTo(-h,h-5);ctx.lineTo(-4,-1);ctx.lineTo(3,6);ctx.lineTo(h,-h+4);ctx.stroke();
    ctx.beginPath();ctx.moveTo(h-9,-h+4);ctx.lineTo(h,-h+4);ctx.lineTo(h,-h+13);ctx.stroke();}
  else if(kind==="pay"){rr(ctx,-h,-h+5,S,S-10,4);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-h,-h+13);ctx.lineTo(h,-h+13);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-h+6,h-9);ctx.lineTo(-h+14,h-9);ctx.stroke();}
  else if(kind==="swap"){ctx.beginPath();ctx.moveTo(-h+1,-6);ctx.lineTo(h-6,-6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(h-12,-12);ctx.lineTo(h-5,-6);ctx.lineTo(h-12,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(h-1,7);ctx.lineTo(-h+6,7);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-h+12,1);ctx.lineTo(-h+5,7);ctx.lineTo(-h+12,13);ctx.stroke();}
  ctx.restore();
}
const CURVE=(()=>{const p=[];for(let i=0;i<=48;i++){const u=i/48;
  p.push([u,(Math.sin(i*0.46)*0.5+0.5)*0.5+Math.sin(i*1.7)*0.075+u*0.3]);}return p;})();
function drawPad(p){
  const ctx=padCtx,PADX=42;
  ctx.clearRect(0,0,PW,PH_);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,PW,PH_);
  ctx.textBaseline="alphabetic";
  /* header: the product first, the view second — this screen is PowerPodOS,
     and Dashboard is only which part of it happens to be open */
  ctx.globalAlpha=1;ctx.fillStyle=INK_CSS;
  ctx.font=FONT(700,40);ctx.textAlign="left";
  ctx.fillText("PowerPodOS",PADX,68);
  const hw=ctx.measureText("PowerPodOS").width;
  ctx.fillStyle=MUTE_CSS;ctx.font=FONT(500,24);
  ctx.fillText("Dashboard",PADX+hw+22,68);
  ctx.strokeStyle=INK_CSS;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,104);ctx.lineTo(PW,104);ctx.stroke();
  /* sidebar — icon column stays at a fixed x, so nothing shifts on collapse */
  const SB_OPEN=404,SB_SHUT=104;
  const sbW=lerp(SB_OPEN,SB_SHUT,p.col);
  const ICX=52, ROW_H=62, ROW_GAP=12, ROW_TOP=142;
  ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(sbW,104);ctx.lineTo(sbW,PH_);ctx.stroke();
  NAV.forEach((item,i)=>{
    const k=clamp(p.items*NAV.length-i,0,1);
    if(k<=0)return;
    const y=ROW_TOP+i*(ROW_H+ROW_GAP), sel=i===0;
    const boxX=16, boxW=sbW-32;
    ctx.globalAlpha=k;
    if(sel&&p.sel>0){
      ctx.globalAlpha=k*p.sel;ctx.fillStyle=INK_CSS;
      rr(ctx,boxX,y,boxW,ROW_H,14);ctx.fill();
      ctx.globalAlpha=k;
    }
    const col=(sel&&p.sel>0.55)?"#fff":INK_CSS;
    icon(ctx,item[0],ICX,y+ROW_H/2,col);
    const labAlpha=k*(1-p.col);
    if(labAlpha>0.01){
      ctx.globalAlpha=labAlpha;ctx.fillStyle=col;
      ctx.font=FONT(500,25);ctx.textAlign="left";ctx.textBaseline="middle";
      const lx=ICX+34, maxW=boxX+boxW-lx-18;
      ctx.fillText(fitText(ctx,item[1],maxW),lx,y+ROW_H/2+1);
      ctx.textBaseline="alphabetic";
    }
    ctx.globalAlpha=1;
  });
  /* content */
  if(p.graph>0){
    const cx0=sbW+36, cw=PW-cx0-PADX, cardH=598, cy0=142;
    const a=Math.min(1,p.graph*3.2);
    ctx.globalAlpha=a;ctx.strokeStyle=INK_CSS;ctx.fillStyle=INK_CSS;
    ctx.lineWidth=2; rr(ctx,cx0,cy0,cw,cardH,18);ctx.stroke();
    ctx.font=FONT(500,26);ctx.textAlign="left";
    ctx.fillText("Energy Throughput",cx0+34,cy0+48);
    ctx.font=FONT(400,19);ctx.fillStyle=MUTE_CSS;
    ctx.fillText("kWh delivered / hour",cx0+34,cy0+76);
    /* plot frame */
    const gx0=cx0+72, gx1=cx0+cw-40, gy1=cy0+cardH-58, gy0=cy0+112;
    const gw=gx1-gx0, gh=gy1-gy0;
    ctx.strokeStyle=INK_CSS;ctx.lineWidth=2.4;
    ctx.beginPath();ctx.moveTo(gx0,gy0);ctx.lineTo(gx0,gy1);ctx.lineTo(gx1,gy1);ctx.stroke();
    ctx.lineWidth=1.2;ctx.font=FONT(400,17);ctx.fillStyle=MUTE_CSS;
    ctx.textAlign="right";ctx.textBaseline="middle";
    for(let i=1;i<=4;i++){const gy=gy1-gh*i/4;
      ctx.globalAlpha=a*0.28;ctx.strokeStyle=INK_CSS;
      ctx.beginPath();ctx.moveTo(gx0,gy);ctx.lineTo(gx1,gy);ctx.stroke();
      ctx.globalAlpha=a;ctx.fillText(String(i*12),gx0-14,gy);}
    ctx.textAlign="center";ctx.textBaseline="top";
    ["06","10","14","18","22"].forEach((lb,i)=>{
      ctx.fillText(lb,gx0+gw*i/4,gy1+14);});
    ctx.textBaseline="alphabetic";
    /* energy curve draws with scroll */
    const n=Math.floor(p.graph*CURVE.length);
    if(n>1){
      ctx.strokeStyle=AMBER_CSS;ctx.lineWidth=4.4;ctx.lineJoin=ctx.lineCap="round";
      ctx.beginPath();
      for(let i=0;i<n;i++){const X=gx0+CURVE[i][0]*gw, Y=gy1-CURVE[i][1]*gh;
        i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);}
      ctx.stroke();
      const li=Math.min(n-1,CURVE.length-1);
      ctx.beginPath();ctx.arc(gx0+CURVE[li][0]*gw,gy1-CURVE[li][1]*gh,6,0,Math.PI*2);
      ctx.fillStyle=AMBER_CSS;ctx.fill();
    }
    /* two stat cards below, evenly split */
    if(p.stats>0){
      ctx.globalAlpha=p.stats;ctx.strokeStyle=INK_CSS;ctx.lineWidth=2;
      const sy=cy0+cardH+22, sh=PH_-sy-PADX, gap=22, sw=(cw-gap)/2;
      /* two lines optically centred in the card, value then caption */
      [["12,480","COLLECTED TODAY \u00B7 INR"],["214","SWAPS TODAY"]].forEach((s,i)=>{
        const sx=cx0+i*(sw+gap), inner=sw-56;
        rr(ctx,sx,sy,sw,sh,16);ctx.stroke();
        ctx.fillStyle=INK_CSS;ctx.font=FONT(700,42);ctx.textAlign="left";
        ctx.fillText(fitText(ctx,s[0],inner),sx+28,sy+sh/2+2);
        ctx.fillStyle=MUTE_CSS;ctx.font=FONT(500,18);
        ctx.fillText(fitText(ctx,s[1],inner),sx+28,sy+sh/2+32);
      });
    }
  }
  ctx.globalAlpha=1;
  padTex.needsUpdate=true;
}

/* =====================================================================
   ACT II — PHONE
   ===================================================================== */
const PHD={w:71.6,h:146.6,d:8,r:14,x:206,y:128,z:6};
const phone=new THREE.Group(); phone.position.set(PHD.x,PHD.y,PHD.z); phone.visible=false; scene.add(phone);
const phLineMat=lineMat({opacity:0}),phPaper=paperMat({opacity:0});
{
  const occ=extrude(PHD.w-0.6,PHD.h-0.6,13.7,PHD.d-1.3); occ.translate(0,0,-PHD.d/2+0.2);
  phone.add(P(occ,phPaper));
  const g=[];
  g.push(slabZ(PHD.w,PHD.h,PHD.r,-PHD.d/2,PHD.d/2));                  // body
  g.push(loopGeom(rrPts(PHD.w-6,PHD.h-6,11.5),xy(PHD.d/2)));          // one bezel line
  /* side hardware — power right, volume pair left */
  const bt=(x,y0,len)=>{const q=[];
    q.push(loopGeom(rrPts(len,PHD.d-3.2,1.4),(u,v)=>[x,y0+u,v]));return merge(q);};
  g.push(bt(PHD.w/2,18,26)); g.push(bt(-PHD.w/2,26,17)); g.push(bt(-PHD.w/2,4,17));
  phone.add(L(merge(g),phLineMat,3));
}
const SW=656,SH=1400;
const phCv=document.createElement('canvas'); phCv.width=SW; phCv.height=SH;
const phCtx=phCv.getContext('2d');
const phTex=new THREE.CanvasTexture(phCv); phTex.anisotropy=4;
const phScreenMat=new THREE.MeshBasicMaterial({map:phTex,transparent:true,opacity:0});
const phScreen=new THREE.Mesh(new THREE.PlaneGeometry(63.9,136.4),phScreenMat);
phScreen.position.z=PHD.d/2-0.45;   /* seated in the recess, clear of the body */ phScreen.renderOrder=4; phone.add(phScreen);

function netBars(ctx,cx,cy,level,alpha){
  const H=[16,26,36,46],BW=14,GAP=9;
  ctx.save();ctx.globalAlpha*=alpha;
  const filled=Math.round(clamp(level,0,1)*4);
  for(let i=0;i<4;i++){
    const x=cx+i*(BW+GAP),h=H[i],y=cy-h;
    ctx.lineWidth=2.4;
    rr(ctx,x,y,BW,h,3);
    if(i<filled){ctx.fillStyle=INK_CSS;ctx.fill();}
    else{ctx.strokeStyle="#c9c9c9";ctx.stroke();}
  }
  ctx.restore();
}
function crossMark(ctx,cx,cy,r,alpha){
  ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=INK_CSS;
  ctx.lineWidth=5;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(cx-r,cy-r);ctx.lineTo(cx+r,cy+r);
  ctx.moveTo(cx+r,cy-r);ctx.lineTo(cx-r,cy+r);ctx.stroke();ctx.restore();
}
function btGlyph(ctx,cx,cy,h,alpha){
  const w=h*0.44;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(cx,cy);
  ctx.strokeStyle=INK_CSS;ctx.lineWidth=h*0.075;ctx.lineJoin=ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(-w/2,-h/4);ctx.lineTo(w/2,h/4);ctx.lineTo(0,h/2);
  ctx.lineTo(0,-h/2);ctx.lineTo(w/2,-h/4);ctx.lineTo(-w/2,h/4);
  ctx.stroke();ctx.restore();
}
function drawPodFront(ctx,cx,cy,h){
  /* The pod exactly as the cinema opens on it — the plan view off the CAD
     stations — simply stood on end. 399.1 long, 139.99 across the collars,
     stepping in to 135.0 over the mid-body. Handle end up. */
  const s=h/399.1;
  const HC=139.99/2*s, HT=135.0/2*s;
  const top=-h/2, bot=h/2;
  const yTop = top + (199.55-163.0)*s;        // collar band ends
  const yBot = bot - (199.55-152.0)*s;        // lower collar band begins
  const rC=32*s, rT=6*s;
  ctx.save(); ctx.translate(cx,cy);
  ctx.strokeStyle=INK_CSS; ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.lineWidth=4;
  ctx.beginPath();
  ctx.moveTo(-HC+rC, top);
  ctx.lineTo(HC-rC, top);
  ctx.quadraticCurveTo(HC, top, HC, top+rC);
  ctx.lineTo(HC, yTop);
  ctx.lineTo(HT, yTop+rT);
  ctx.lineTo(HT, yBot-rT);
  ctx.lineTo(HC, yBot);
  ctx.lineTo(HC, bot-rC);
  ctx.quadraticCurveTo(HC, bot, HC-rC, bot);
  ctx.lineTo(-HC+rC, bot);
  ctx.quadraticCurveTo(-HC, bot, -HC, bot-rC);
  ctx.lineTo(-HC, yBot);
  ctx.lineTo(-HT, yBot-rT);
  ctx.lineTo(-HT, yTop+rT);
  ctx.lineTo(-HC, yTop);
  ctx.lineTo(-HC, top+rC);
  ctx.quadraticCurveTo(-HC, top, -HC+rC, top);
  ctx.closePath(); ctx.stroke();
  ctx.lineWidth=2.6;                          // the two collar seams
  [yTop, yBot].forEach(y=>{
    ctx.beginPath(); ctx.moveTo(-HC,y); ctx.lineTo(HC,y); ctx.stroke(); });
  ctx.lineWidth=1.6;                          // mid-body edges, as in the plan view
  [-HT+3*s, HT-3*s].forEach(x=>{
    ctx.beginPath(); ctx.moveTo(x,yTop+rT); ctx.lineTo(x,yBot-rT); ctx.stroke(); });
  /* the bail, seen edge-on above the cap — the same cue as in the 3D scenes,
     so the top of the pod is obvious here too */
  ctx.lineWidth=2.2;
  const bw=104*s, bh=22.9*s;
  ctx.beginPath();
  ctx.moveTo(-bw/2, top);
  ctx.bezierCurveTo(-bw*0.34, top-bh, bw*0.34, top-bh, bw/2, top);
  ctx.stroke();
  ctx.lineWidth=1.6;
  ctx.beginPath();
  ctx.moveTo(-bw*0.40, top);
  ctx.bezierCurveTo(-bw*0.24, top-bh*0.62, bw*0.24, top-bh*0.62, bw*0.40, top);
  ctx.stroke();
  ctx.restore();
}
function drawPhone(p){
  const ctx=phCtx;
  ctx.clearRect(0,0,SW,SH);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,SW,SH);
  ctx.fillStyle=INK_CSS;ctx.strokeStyle=INK_CSS;
  ctx.textBaseline="alphabetic";ctx.textAlign="left";

  /* ---- status row: packet dots (left) · signal bars (right) ---- */
  netBars(ctx,SW-64-83,104,p.net,1);
  if(p.cross>0){
    crossMark(ctx,SW-64-83-44,84,13,p.cross);
    ctx.save();ctx.globalAlpha=p.cross;ctx.fillStyle=MUTE_CSS;
    ctx.font=FONT(500,19);ctx.textAlign="right";
    ctx.fillText("OFFLINE",SW-64,142);ctx.restore();
  }
  if(p.pkt>0){
    /* a repeating chase — telemetry still moving with no network */
    const head=Math.floor(((p.pkt*3.2)%1)*7);
    for(let i=0;i<6;i++){
      ctx.save();
      ctx.globalAlpha=(i<head?1:0.16)*Math.min(1,p.pkt*4);
      ctx.fillStyle=INK_CSS;
      ctx.beginPath();ctx.arc(70+i*29,88,6.5,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    ctx.save();ctx.globalAlpha=Math.min(1,p.pkt*4);ctx.fillStyle=MUTE_CSS;
    ctx.font=FONT(500,19);ctx.textAlign="left";
    ctx.fillText("SYNCING",68,142);ctx.restore();
  }

  /* ---- SoC block (fades out when the phone goes local-only) ---- */
  if(p.ui>0.004){
    ctx.save();ctx.globalAlpha=p.ui;
    const pct=Math.round(lerp(69,25,p.soc));
    ctx.font=FONT(500,30);ctx.fillStyle=MUTE_CSS;ctx.textAlign="left";
    ctx.fillText("SOC",64,232);
    ctx.fillStyle=INK_CSS;ctx.font=FONT(700,124);
    ctx.fillText(pct+"%",60,352);
    const bx=64,by=404,bw=SW-128,bh=72,br=36;
    ctx.lineWidth=6;ctx.strokeStyle=INK_CSS; rr(ctx,bx,by,bw,bh,br);ctx.stroke();
    ctx.save(); rr(ctx,bx+7,by+7,bw-14,bh-14,br-7); ctx.clip();
    ctx.fillStyle=INK_CSS; rr(ctx,bx+7,by+7,Math.max(bh-14,(bw-14)*pct/100),bh-14,br-7); ctx.fill();
    ctx.restore();ctx.restore();
  }
  /* ---- the pod, upright, centre ---- */
  if(p.pod>0.004){
    ctx.save();ctx.globalAlpha=p.pod;
    drawPodFront(ctx,SW/2,940,700);
    ctx.restore();
  }
  /* ---- local sync: bluetooth pulses while telemetry keeps flowing ---- */
  if(p.bt>0.004){
    btGlyph(ctx,SW/2,700,280,p.bt);
    ctx.save();ctx.globalAlpha=p.bt;ctx.fillStyle=MUTE_CSS;
    ctx.font=FONT(500,26);ctx.textAlign="center";
    ctx.fillText("LOCAL SYNC",SW/2,930);ctx.restore();
  }
  /* ---- the session, metered and billed on the handset ----
     The point of the whole beat: with no network the pod is still earning.
     The value meters up while the link is live, then settles. */
  if(p.bill>0.004){
    const x0=64,y0=1040,w=SW-128,h=248;
    ctx.save();ctx.globalAlpha=p.bill;
    ctx.strokeStyle=INK_CSS;ctx.lineWidth=5;
    rr(ctx,x0,y0,w,h,26);ctx.stroke();
    ctx.fillStyle=MUTE_CSS;ctx.font=FONT(500,26);ctx.textAlign="left";
    ctx.fillText("SESSION",x0+36,y0+62);
    /* the running total */
    ctx.strokeStyle=INK_CSS;
    rupee(ctx,x0+58,y0+150,58);
    ctx.fillStyle=INK_CSS;ctx.font=FONT(700,92);
    ctx.fillText((42.6*p.meter).toFixed(2),x0+96,y0+180);
    /* offline first, settled once the packets have gone */
    ctx.textAlign="right";ctx.font=FONT(500,24);
    ctx.fillStyle=MUTE_CSS;
    ctx.globalAlpha=p.bill*(1-p.settle);
    ctx.fillText("BILLED ON DEVICE",x0+w-36,y0+62);
    ctx.globalAlpha=p.bill*p.settle;
    ctx.fillStyle=INK_CSS;
    ctx.fillText("SETTLED",x0+w-36,y0+62);
    ctx.restore();
  }
  phTex.needsUpdate=true;
}

/* =====================================================================
   ACT III / IV — VERTICAL POD (outer casing + handle + connector only)
   Same CAD geometry, stood on end: handle up, connector down.
   ===================================================================== */
const vpod=new THREE.Group(); vpod.visible=false; scene.add(vpod);
const vpodInner=new THREE.Group(); vpodInner.rotation.z=-Math.PI/2; vpod.add(vpodInner);
const vShellMat=lineMat({opacity:0}), vPaper=paperMat({opacity:0});
const vCapDetailMat=lineMat({opacity:0,depthTest:false});
{
  const tOcc=extrude(132.2,132.2,26.6,D.tubeX[1]-D.tubeX[0]); tOcc.rotateY(Math.PI/2); tOcc.translate(D.tubeX[0],0,0);
  const cL=extrude(137.2,137.2,30.6,D.collarL[1]-(-199.3)); cL.rotateY(Math.PI/2); cL.translate(-199.3,0,0);
  const cR=extrude(137.2,137.2,30.6,D.collarRt[1]-D.collarRt[0]); cR.rotateY(Math.PI/2); cR.translate(D.collarRt[0],0,0);
  [tOcc,cL,cR].forEach(g=>vpodInner.add(P(g,vPaper)));
  const g=[];
  g.push(tubeXg(D.tubeX[0],D.tubeX[1],D.tubeSize,D.tubeR));
  g.push(tubeXg(D.collarL[0],D.collarL[1],D.collarSize,D.collarR));
  g.push(tubeXg(D.collarRt[0],D.collarRt[1],D.collarSize,D.collarR));
  g.push(loopGeom(rrPts(D.tubeSize,D.tubeSize,D.tubeR),yz(D.collarL[1])));
  g.push(loopGeom(rrPts(D.tubeSize,D.tubeSize,D.tubeR),yz(D.collarRt[0])));
  /* handle, digitised */
  const face=D.handleFaceX,floor=D.handleFloorX;
  /* no recess outline: the handle itself says which end is the top, and a
     45-degree pocket streaks diagonal lines right across the cap */

  const VHB=buildTop(D.collarL[0],-1);         // same cap, so the top reads when upright
  g.push(VHB.lines);
  /* connector face */
  const fx=199.7;
  g.push(loopGeom(rrPts(D.facePlate.size,D.facePlate.size,D.facePlate.r),yz(D.facePlate.x)));
  g.push(loopGeom(rrPts(118,118,26),yz(fx)));
  D.pads.pos.forEach(([pz,py])=>{
    g.push(loopGeom(circPts(D.pads.r),(u,v)=>[fx,py+v,pz+u]));
    g.push(loopGeom(circPts(D.pads.r-2.4),(u,v)=>[fx,py+v,pz+u]));});
  D.pins.pos.forEach(([pz,py])=>{                       // guide pins with real protrusion
    g.push(loopGeom(circPts(D.pins.r),(u,v)=>[fx,py+v,pz+u]));
    g.push(loopGeom(circPts(D.pins.r),(u,v)=>[fx+6,py+v,pz+u]));
    g.push(seg3([fx,py,pz+D.pins.r,fx+6,py,pz+D.pins.r, fx,py,pz-D.pins.r,fx+6,py,pz-D.pins.r]));
  });
  g.push(loopGeom(circPts(12),yz(fx)));
  g.push(loopGeom(circPts(2.5),yz(fx)));
  for(let i=0;i<8;i++){const a2=i/8*Math.PI*2;         // 8-pin data cluster
    g.push(loopGeom(circPts(2.2),(u,v)=>[fx,8.5*Math.sin(a2)+v,8.5*Math.cos(a2)+u]));}
  vpodInner.add(L(merge(g),vShellMat,3));
  vpodInner.add(L(VHB.detail,vCapDetailMat,6));
  vpodInner.add(P(VHB.mesh,vPaper));
}
/* Wireless link: broadcast ripples leaving the pod's near face and washing
   toward the phone. Arcs only — they live in the air between the two devices
   and never cross the pod's surface. */
const telemetry=new THREE.Group(); telemetry.visible=false; scene.add(telemetry);
const telMats=[];
{
  const EX=22, EY=118, EZ=-300;           // emitter sits in the gap, not over the pod's body
  for(let i=0;i<4;i++){
    const r=10+i*7, m=lineMat({opacity:0}), v=[];
    const a0=Math.PI*0.72, a1=Math.PI*1.28, N=26;   // opens toward the phone
    for(let k=0;k<N;k++){
      const b0=a0+(a1-a0)*k/N, b1=a0+(a1-a0)*(k+1)/N;
      v.push(EX+r*Math.cos(b0),EY+r*Math.sin(b0),EZ,
             EX+r*Math.cos(b1),EY+r*Math.sin(b1),EZ);
    }
    telemetry.add(L(seg3(v),m,4)); telMats.push(m);
  }
}

/* =====================================================================
   CAMERA
   ===================================================================== */
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
/* =====================================================================
   ACT I owns t in [0, A1]. Acts II-IV keep their original clock, remapped
   through tB, so none of that choreography had to be re-authored.
   ===================================================================== */
const A1=0.560;          // Act I's share of the scroll
const TB0=0.340;         // where the old clock picks up
const toB=t=>TB0+(t-A1)/(1-A1)*(1-TB0);

/* Act I camera. Each "snap" beat sits the subject left, leaving the right
   ~40% of frame clear for copy; between beats the bias returns to 0 and the
   cinema recentres. */
const CAM1=[
  [0.000,V(0,930,0.01),V(0,0,0)],          // the drawing: top view
  [0.026,V(0,930,0.01),V(0,0,0)],
  [0.048,V(-90,430,300),V(0,0,-10)],       // tilt in
  [0.070,V(-40,120,-210),V(0,0,-30)],      // slip round to the cell faces
  [0.100,V(0,10,-800),V(0,0,-30)],         // ── cells, upright pack
  [0.190,V(0,10,-800),V(0,0,-30)],         // ── same view: cells laid on their side
  [0.238,V(0,10,-800),V(0,0,-30)],         // ── back to the upright pack
  [0.256,V(0,10,-790),V(0,0,-30)],
  [0.272,V(56,16,-540),V(56,0,-37)],       // travel along to the BMS
  [0.300,V(56,3,-462),V(56,0,-37)],        // ── BMS, frontal (connector side)
  [0.350,V(56,3,-456),V(56,0,-37)],
  [0.376,V(400,95,110),V(168,0,0)],        // arc round the end onto the far side
  [0.400,V(524,58,196),V(196,0,0)],        // ── connector, face angled to the right
  [0.430,V(524,58,196),V(196,0,0)],
  [0.452,V(250,75,-250),V(70,0,-34)],      // back across and down the length of the pack
  [0.484,V(-82,4,-392),V(-82,0,-37)],      // ── IoT, frontal (far end)
  [0.516,V(-82,3,-386),V(-82,0,-37)],
  [0.540,V(300,235,-640),V(0,-6,0)],       // ── the whole pod, from the board side
  [0.560,V(0,700,120),V(0,10,0)],          // rise, handing off to the morph
];
const CAM=[
  [0.340,V(0,700,120),V(0,10,0)],   // handed over from Act I, already in top view
  /* --- ACT II: morph, iPad, phone --- */
  [0.385,V(0,760,60),V(0,10,0)],
  [0.405,V(0,505,300),V(0,105,0)],
  [0.429,V(0,232,540),V(0,145,0)],
  [0.449,V(0,156,648),V(0,150,0)],
  [0.480,V(0,152,604),V(0,150,0)],
  [0.506,V(0,150,592),V(0,148,0)],
  [0.532,V(96,146,540),V(104,142,0)],   // drifts right to meet the rising phone
  [0.562,V(150,132,432),V(160,130,0)],  // closes on it while it still sits right
  /* --- ACT III: signal drops, pod arrives, local sync ---
     Camera stays put and the staging moves instead (ACT3_PHONE, ACT3_VPOD
     below). The two subjects are 700mm apart in depth, so panning the frame
     slides the near one across three times faster than the far one and closes
     the gap they are talking across. Moving them is the only way to recentre
     the pair without collapsing it. */
  [0.600,V(96,128,470),V(96,126,0)],    // travels left with the phone, never back
  [0.632,V(40,122,462),V(38,120,0)],
  [0.664,V(6,118,540),V(4,118,0)],
  [0.700,V(0,118,560),V(0,118,0)],      // settled
  [0.760,V(0,118,560),V(0,118,0)],      // pod slides in and sinks behind
  [0.800,V(0,118,562),V(0,118,0)],
  /* --- ACT IV: the whole stack, pod as hero --- */
  [0.802,V(58,48,290),V(0,32,30)],      // opens on the connector face
  [0.838,V(46,120,470),V(0,110,30)],    // rises the length of the pod
  [0.876,V(10,214,1015),V(0,210,30)],   // the pod, whole, as hero
  [0.912,V(64,216,1165),V(70,212,0)],   // dashboard and phone join together
  [0.946,V(60,212,1125),V(66,209,0)],
  [0.964,V(84,212,1155),V(84,209,0)],   // the crown made the pod taller; fit it
  [0.984,V(88,208,1460),V(84,205,0)],   // all three fall away
  [1.000,V(90,209,1800),V(84,205,0)],];

const _p=new THREE.Vector3(),_l=new THREE.Vector3();
/* 0 = subject centred in frame · 1 = subject lifted clear of the copy band.
   scripts/scroll.js sets it from the chapter geometry, so the lift is on
   exactly while a band chapter holds and relaxes for the hero and the last. */
let lift=0;
/* Whole-film opacity, on top of the dissolves the choreography owns. It is
   what keeps the pod a faint blueprint behind the hero wordmark. */
let dim=1;
function evalCam(t){
  const act1=t<A1;
  const KEYS=act1?CAM1:CAM, tt=act1?t:toB(t);
  let i=0;while(i<KEYS.length-2&&tt>KEYS[i+1][0])i++;
  const a=KEYS[i],b=KEYS[i+1];
  const u=smoother(clamp((tt-a[0])/(b[0]-a[0]),0,1));
  _p.lerpVectors(a[1],b[1],u);_l.lerpVectors(a[2],b[2],u);
  /* portrait/narrow screens dolly back so framing survives the aspect change */
  const fit=camera.aspect>=1.5?1:clamp(1.5/camera.aspect,1,2.6);
  if(fit>1)_p.sub(_l).multiplyScalar(fit).add(_l);
  /* Making room for the copy band is two moves, and it needs both.
     Ease back first: several of these shots were framed to fill the height of
     the screen, and lifting one of those without shrinking it walks the top
     of the subject straight out of frame. Then dolly down, rather than tilt:
     tilting would swing the perspective and undo the drawn, orthographic feel
     the whole film is built on, where moving the camera down its own up-axis
     slides the subject up the frame with the drawing untouched.
     The band is proportionally taller on a phone, so the lift is too. */
  const narrow=camera.aspect<1;
  /* Portrait needs almost none of the ease-back: `fit` above has already
     pulled the camera as far as 2.6x to survive the aspect change, and
     stacking another third on top of that leaves the drawing too small to
     read. */
  if(lift>0.001) _p.sub(_l).multiplyScalar(1+(narrow?0.08:0.34)*lift).add(_l);
  camera.position.copy(_p);camera.lookAt(_l);
  if(lift>0.001){
    const d=camera.position.distanceTo(_l);
    const halfH=d*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
    camera.translateY(-halfH*(narrow?0.34:0.24)*lift);
  }
}

/* =====================================================================
   UPDATE
   ===================================================================== */
const inkC=new THREE.Color(INK),amberC=new THREE.Color(AMBER),blueC=new THREE.Color(BLUE),tmp=new THREE.Color();
let lastPad="",lastPh="",fontsReady=false;
function stagger(set,k,spread){
  const n=set.mats.length;
  for(let i=0;i<n;i++){
    const s=(i/n)*spread;
    set.mats[i].opacity=easeOut(win(k,s,s+(1-spread)));
  }
}
/* Acts I+II were authored on a 0..1 clock; S remaps them onto the front
   of the longer timeline so Acts III and IV have room after them. */
const S=0.5788;
/* The pod is 399mm tall — nearly 2.2x the iPad and 2.7x the phone. Acts III
   and IV stand all three on a shared ground plane at y=0 at 1:1 scale, so the
   size relationship the viewer reads is the real one. */
const ACT2_PHONE=new THREE.Vector3(206,128,6);
/* Act III is staged across the frame rather than into the left of it, because
   the copy now sits underneath rather than beside. The two are moved by
   different amounts on purpose: the phone is 760mm nearer the lens than the
   pod, so equal world shifts would not read as equal on screen and the gap
   the BLE link lives in would close. */
const ACT3_PHONE=new THREE.Vector3(-55,118,60);           // forward and left, gap kept clear
const ACT4_PHONE=new THREE.Vector3(-158,PHD.h/2,-20);
const ACT3_VPOD =new THREE.Vector3(100,118,-700);         // enters right, settles right of frame and far behind
const ACT4_VPOD =new THREE.Vector3(0,199.6,30);           // hero, front & centre
const ACT4_IPAD =new THREE.Vector3(236,IPAD.h/2,-45);     // 0 .. 178.5
const ACT2_IPAD =new THREE.Vector3(0,IPAD.y,IPAD.z);      // where the morph lands it
const _v=new THREE.Vector3();

function update(t){
  evalCam(t);
  const tB=toB(t);                       // Acts II-IV keep their original clock
  const W=(a,b)=>win(tB,a*S,b*S);
  const act4 = tB>=0.800;   /* swapped at the whiteout floor — invisible */

  /* ================= ACT I — the pod =================
     Act I is authored directly on t. Every value below is a pure function
     of t, so scrubbing backwards is identical to scrubbing forwards. */
  const podFade=1-win(t,0.552,0.572);
  pod.visible=podFade>0.001;
  {
    /* casing: a solid drawing at the top view, then held open so the
       internals can be read for the rest of the act. It stays shut through
       the balance beat, which is about the outside of the pod and nothing
       else, and dissolves on the handoff after it. */
    const opened=smoother(win(t,0.048,0.078));
    podPaper.opacity=(1-opened)*podFade;
    podPaper.depthWrite=podPaper.opacity>0.97;
    shellMat.opacity=lerp(1,0.11,opened)*podFade;
    handleMat.opacity=shellMat.opacity;
    capDetailMat.opacity=handleMat.opacity;
    handlePaper.opacity=Math.min(1,handleMat.opacity*4)*podFade;
    handlePaper.depthWrite=handleMat.opacity>0.02;

    /* ---- chemistry: NMC in, LFP, solid-state, back to NMC ---- */
    const stack=win(t,0.058,0.132);                 // the first fill
    /* one clean hand-off each way: upright pack -> laid on its side -> back.
       Sequenced, never crossfaded, so the two orientations never overlap. */
    const axialOut =smoother(win(t,0.138,0.156));
    const horizIn  =smoother(win(t,0.154,0.172));
    const horizOut =smoother(win(t,0.208,0.226));
    const axialBack=smoother(win(t,0.224,0.242));
    const nmcA=clamp((1-axialOut)+axialBack,0,1);
    const horizA=horizIn*(1-horizOut);
    /* ---- focus: the subject of a beat leads, everything else recedes to a
       faint context layer, which also keeps the right-hand band clean ---- */
    const wide   = smoother(win(t,0.512,0.544));        // closing shot brings it all back
    const fCells = Math.max(1-smoother(win(t,0.252,0.284)), wide*0.55, 0.042);
    const fBoard = Math.max(smoother(win(t,0.258,0.288))*(1-smoother(win(t,0.378,0.406))),
                            wide*0.5, smoother(win(t,0.258,0.288))*0.05);
    const fConn  = Math.max(smoother(win(t,0.372,0.398))*(1-smoother(win(t,0.436,0.462))),
                            wide*0.8, smoother(win(t,0.372,0.398))*0.05);
    const fIoT   = Math.max(smoother(win(t,0.456,0.482))*(1-smoother(win(t,0.540,0.560))*0.45),
                            wide*0.6);
    /* casing thins further during the close-ups so nothing crowds the gap */
    const closeUp=Math.max(smoother(win(t,0.264,0.292))*(1-smoother(win(t,0.536,0.556))),0);
    shellMat.opacity=lerp(1,lerp(0.11,0.032,closeUp),opened)*podFade;
    handleMat.opacity=shellMat.opacity;
    const cellVis=fCells*podFade;

    for(let i=0;i<70;i++){
      const st=i/70*0.66, k=easeOut(win(stack,st,st+0.34));
      const a=k*nmcA*cellVis;
      cellLineMats[i].opacity=a;
      cellPaperMats[i].opacity=k*nmcA*podFade;
      cellPaperMats[i].depthWrite=k*nmcA>0.5;
      cellMeshes[i].position.y=cellMeshes[i].userData.home-(1-k)*46;
      cellMeshes[i].visible=a>0.002;
    }
    horizMat.opacity=horizA*cellVis; horizGroup.visible=horizMat.opacity>0.002;
    horizPaper.opacity=horizA*podFade; horizPaper.depthWrite=horizA>0.5;

    const kH=easeOut(win(t,0.100,0.128));
    holder.m.opacity=kH*nmcA*fCells*podFade;
    holder.o.position.z=0;
    const kE=easeOut(win(t,0.246,0.268));
    plates.m.opacity=kE*Math.max(fCells*0.8,wide*0.5)*podFade;
    plates.o.scale.x=1;

    /* ---- BMS: the built board, then two alternates ---- */
    const bmsIn=easeOut(win(t,0.264,0.292));
    /* sequenced, never crossfaded — the board stays put while the parts move */
    const p1out=smoother(win(t,0.300,0.316)), p2in =smoother(win(t,0.314,0.330));
    const p2out=smoother(win(t,0.344,0.360)), p1in =smoother(win(t,0.358,0.374));
    const wv=[ clamp((1-p1out)+p1in,0,1), p2in*(1-p2out) ];
    bmsFrameMat.opacity=bmsIn*fBoard*podFade;
    bmsFramePaper.opacity=bmsIn*podFade;
    bmsFramePaper.depthWrite=bmsIn>0.5;
    BMS_VARIANTS.forEach((bv,i)=>{
      const a=clamp(wv[i],0,1);
      bv.m.opacity=a*bmsIn*fBoard*podFade;
      bv.grp.visible=bv.m.opacity>0.002;
    });
    /* the power board runs the whole length of the pack, so once the BMS
       itself is the subject it drops to context and stops crossing the gap */
    const fPower=fBoard*Math.max(1-smoother(win(t,0.286,0.302)),wide*0.55,0.05);
    boardMat.opacity=easeOut(win(t,0.252,0.286))*fPower*podFade;
    stagger(pwParts,win(t,0.256,0.300),0.5);
    stagger(busParts,win(t,0.268,0.312),0.55);
    pwParts.mats.forEach(m=>m.opacity*=fPower*podFade);
    busParts.mats.forEach(m=>m.opacity*=fPower*podFade);
    harnessMat.opacity=easeOut(win(t,0.282,0.320))*0.8*fPower*podFade;

    /* ---- connector ---- */
    connMat.opacity=fConn*podFade;
    connPaper.opacity=Math.min(1,fConn*3)*podFade;
    connPaper.depthWrite=fConn>0.3;

    /* ---- IoT board ---- */
    const iotIn=easeOut(win(t,0.456,0.482));
    iotMat.opacity=fIoT*podFade;
    iotPaper.opacity=iotIn*podFade; iotPaper.depthWrite=iotIn>0.5;
    iotGroup.visible=iotMat.opacity>0.002;

    /* a single unhurried turn for the wide shot, ending square for the morph */
    pod.rotation.set(0, Math.sin(win(t,0.500,0.560)*Math.PI)*0.42, 0);

    /* ---- the balance ----
       The pod swells past what a person would carry and comes back. Scale,
       not a cut: the point is that there is no second size, only one that was
       chosen. It runs and returns inside a single beat, so nothing downstream
       ever sees the pod at anything other than 1. */
    const swell=Math.sin(win(t,0.026,0.046)*Math.PI);
    pod.scale.setScalar(1+swell*0.42);
  }
  /* ================= MORPH ================= */
  const mk=W(0.632,0.702);
  morphMat.opacity=W(0.634,0.660)*(1-W(0.706,0.730));   // starts only once the pod has cleared
  morphLoop.visible=morphMat.opacity>0.001;
  if(morphLoop.visible) setMorph(smoother(mk));

  /* ================= iPAD ================= */
  const ipVis = act4 ? win(tB,0.884,0.922)
                     : W(0.690,0.736)*(1-win(tB,0.581,0.601));
  /* assigned unconditionally: a transform set only inside one act leaks into
     the others once the user scrolls back, which is how the iPad used to end
     up parked off to the right on a second pass */
  ipad.position.copy(act4?ACT4_IPAD:ACT2_IPAD);
  ipad.rotation.set(0,0,0);
  ipad.scale.setScalar(1);
  padLineMat.opacity=ipVis;
  padPaper.opacity=Math.min(1,ipVis*3.5); padPaper.depthWrite=ipVis>0.02;
  padScreenMat.opacity=Math.min(ipVis,act4?1:W(0.710,0.746));
  ipad.visible=ipVis>0.001;
  if(ipad.visible){
    const q={items:W(0.740,0.784),sel:easeOut(W(0.780,0.798)),
             col:smoother(W(0.796,0.826)),graph:W(0.818,0.858),stats:W(0.848,0.872)};
    const sig=[q.items,q.sel,q.col,q.graph,q.stats].map(v=>v.toFixed(3)).join();
    if(sig!==lastPad||!fontsReady){drawPad(q);lastPad=sig;}
  }

  /* ================= PHONE ================= */
  const rise=smoother(W(0.878,0.916));
  const phVis = act4 ? win(tB,0.884,0.922)
                     : (tB<0.786 ? rise : 1-win(tB,0.786,0.800));
  const toAct3=smoother(win(tB,0.572,0.664));
  if(act4){ phone.position.copy(ACT4_PHONE); phone.rotation.set(0,-0.10,0); }
  else{
    _v.copy(ACT2_PHONE); _v.y-=(1-rise)*26;
    phone.position.lerpVectors(_v,ACT3_PHONE,toAct3);
    phone.rotation.set(0,lerp(-0.10,0,toAct3),0);
  }
  phone.scale.setScalar(lerp(0.62,1,rise));
  phLineMat.opacity=phVis;
  phPaper.opacity=Math.min(1,phVis*3.5); phPaper.depthWrite=phVis>0.02;
  phScreenMat.opacity=Math.min(phVis,act4?1:Math.max(W(0.892,0.920),0));
  phone.visible=phVis>0.001;
  if(phone.visible){
    /* signal fades out, cross appears, UI gives way to a pulsing BLE glyph */
    const back=act4?win(tB,0.884,0.922):0;
    const q={
      soc:smoother(W(0.908,0.968)),
      net:Math.max(1-win(tB,0.604,0.660),back),
      cross:win(tB,0.646,0.672)*(1-win(tB,0.884,0.912)),
      ui:Math.max(1-win(tB,0.652,0.700),back),
      pod:Math.max(1-win(tB,0.652,0.700),back),
      bt:win(tB,0.688,0.716)*(1-win(tB,0.762,0.784))*(0.34+0.66*(0.5+0.5*Math.sin(tB*400))),
      pkt:win(tB,0.700,0.775)*(1-win(tB,0.775,0.792)),
      bill:win(tB,0.706,0.730)*(1-win(tB,0.788,0.800)),
      meter:smoother(win(tB,0.712,0.768)),
      settle:win(tB,0.768,0.780)
    };
    const sig=[q.soc,q.net,q.cross,q.ui,q.bt,q.pkt,q.bill,q.meter,q.settle]
      .map(v=>v.toFixed(2)).join();
    if(sig!==lastPh||!fontsReady){drawPhone(q);lastPh=sig;}
  }

  /* ================= ACT III — vertical pod, offline link ================= */
  const vpVis = act4 ? win(tB,0.796,0.816) : win(tB,0.648,0.716);   // fully formed as the white lifts
  vpod.position.copy(act4?ACT4_VPOD:ACT3_VPOD);
  vpod.scale.setScalar(1);                    /* 1:1 — the pod really is this big */
  const slide=1-smoother(win(tB,0.644,0.730)); /* in from the right, then behind */
  vpod.position.x+=act4?0:slide*420;
  vpod.rotation.set(0, act4?lerp(0.30,0.10,smoother(win(tB,0.800,0.975)))
                          :lerp(-0.42,0,smoother(win(tB,0.604,0.690))), 0);
  vShellMat.opacity=vpVis;
  vCapDetailMat.opacity=vpVis;
  vPaper.opacity=Math.min(1,vpVis*3.5); vPaper.depthWrite=vpVis>0.02;
  vpod.visible=vpVis>0.001;
  const telK=win(tB,0.702,0.736)*(1-win(tB,0.768,0.788));
  telemetry.visible=telK>0.002;
  {
    /* each ring blooms and fades in turn, so the signal reads as leaving
       the pod rather than sitting there */
    const phase=(tB-0.700)*7;
    telMats.forEach((m,i)=>{
      const f=((phase-i*0.25)%1+1)%1;
      m.opacity=telK*Math.sin(Math.PI*f)*(0.30+0.70*(1-i/4));
    });
  }

  /* ================= transitions =================
     Dissolves to the ceramic, not to white: the canvas is transparent, so
     dropping it reveals the page's own glaze. `dim` is folded in here rather
     than given its own layer, because one opacity write per frame is the
     whole cost of it. */
  const out=smoother(win(tB,0.778,0.800));      // dissolve out
  const back=smoother(win(tB,0.802,0.826));     // and back up on the connector detail
  const fin=smoother(win(tB,0.972,0.998));      // and away for the last time
  stage.style.opacity=String(dim*(1-out*(1-back))*(1-fin));
}

/* ---------- fonts ----------
   Both device screens are canvas textures, and a canvas bakes whatever face
   was resolved at the moment it was painted. Each is redrawn only when its
   own signature changes, so a first paint made before DM Sans arrived would
   sit there in a fallback face until the beat happened to move. Clearing the
   signatures forces one repaint the moment the face is ready. */
if(document.fonts&&document.fonts.load){
  Promise.all([document.fonts.load("500 25px 'DM Sans'"),
               document.fonts.load("700 40px 'DM Sans'")])
    .then(()=>{fontsReady=true;lastPad="";lastPh="";})
    .catch(()=>{fontsReady=true;});
}else fontsReady=true;

/* ---------- controls ----------
   The only surface scripts/scroll.js touches. No listeners are registered in
   here: one scroll owner, one rAF loop, one resize handler, all of them over
   there. */
function frame(t,d,l){
  dim=d; lift=l;
  update(clamp(t,0,1));
  renderer.render(scene,camera);
}

function resize(){
  const w=Math.max(1,innerWidth), h=Math.max(1,innerHeight);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}

return {frame:frame, resize:resize};

}
})();
