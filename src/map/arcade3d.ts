import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** A real scene object; its accessible Play control is anchored to the front panel. */
export function createArcadeCabinet(): {group: THREE.Group; playElement: HTMLElement} {
  const group=new THREE.Group();
  group.name='basketball-arcade';
  const pink=new THREE.MeshStandardMaterial({color:0xff9cc2,roughness:.6});
  const purple=new THREE.MeshStandardMaterial({color:0x67588e,roughness:.7});
  const ink=new THREE.MeshStandardMaterial({color:0x2a2657,roughness:.65});
  const mint=new THREE.MeshStandardMaterial({color:0xa5ebce,emissive:0x355b4e,emissiveIntensity:.35});
  const cream=new THREE.MeshStandardMaterial({color:0xffe39b});
  function add(geometry: THREE.BufferGeometry,material: THREE.Material,x: number,y: number,z: number) {
    const mesh=new THREE.Mesh(geometry,material); mesh.position.set(x,y,z);
    mesh.castShadow=true; mesh.receiveShadow=true; mesh.userData.arcade=true; mesh.userData.ownedMaterial=true;
    group.add(mesh); return mesh;
  }
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  add(new THREE.CylinderGeometry(4.1,4.2,.3,32),new THREE.MeshStandardMaterial({color:0xc4d2d4}),0,.15,0);
  box(5.3,3.8,4.2,0,2.2,0,pink);
  box(5.3,5.3,2.0,0,6.25,-1.1,purple);
  const profile=new THREE.Shape();
  profile.moveTo(-2.1,.3);profile.lineTo(2.1,.3);profile.lineTo(2.1,3.5);profile.lineTo(2.8,4.0);
  profile.lineTo(2.4,4.7);profile.lineTo(.65,4.7);profile.lineTo(.15,7.5);profile.lineTo(.9,7.7);
  profile.lineTo(.9,9.4);profile.lineTo(-2.1,9.4);profile.closePath();
  for(const x of [-2.8,3.1]) {
    const side=add(new THREE.ExtrudeGeometry(profile,{depth:.3,bevelEnabled:false}),pink,x,0,0);
    side.rotation.y=-Math.PI/2;
  }
  box(5.5,1.45,3.0,0,8.65,-.6,purple);
  box(4.9,.8,.12,0,8.65,.96,mint);
  for(const x of [-1.7,1.7])add(new THREE.SphereGeometry(.16,12,8),cream,x,8.65,1.06);
  const bezel=box(4.9,3.0,.3,0,6.25,.3,ink);bezel.rotation.x=-.17;
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#193f50';ctx.fillRect(0,0,384,256);
  ctx.strokeStyle='#8fe8ce';ctx.lineWidth=3;ctx.strokeRect(16,16,352,224);
  ctx.fillStyle='#ddf8e9';ctx.fillRect(133,44,118,83);
  ctx.strokeStyle='#f58a55';ctx.lineWidth=8;ctx.strokeRect(171,82,43,42);
  ctx.beginPath();ctx.ellipse(192,135,65,12,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#fff4d0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(134,142);ctx.lineTo(153,194);ctx.lineTo(231,194);ctx.lineTo(250,142);ctx.stroke();
  ctx.fillStyle='#ff995c';ctx.beginPath();ctx.arc(192,220,19,0,Math.PI*2);ctx.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const screen=add(new THREE.PlaneGeometry(4.25,2.5),new THREE.MeshBasicMaterial({map:texture}),0,6.25,.5);screen.rotation.x=-.17;
  const control=box(5.6,.35,2.5,0,4.1,1.5,purple);control.rotation.x=.10;
  add(new THREE.CylinderGeometry(.10,.10,.65,12),ink,-1.5,4.6,1.7);
  add(new THREE.SphereGeometry(.29,16,12),pink,-1.5,5.0,1.7);
  for(const [x,z,material] of [[.8,1.6,cream],[1.65,1.9,mint]] as const) add(new THREE.CylinderGeometry(.3,.3,.15,16),material,x,4.4,z);
  box(1.1,.75,.13,0,1.3,2.2,ink);
  for(const x of [-.2,.2])box(.08,.34,.14,x,1.3,2.3,purple);
  box(4.7,.18,.1,0,.6,2.2,purple);
  const playElement=document.createElement('div');
  const play=new CSS2DObject(playElement);play.position.set(0,3.0,2.35);group.add(play);
  return {group,playElement};
}
