import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCardImage, initCardImages} from '../../js/card-images.mjs';

test('alternate image requests start only on mouse or keyboard interest, once, with responsive sizes before URLs', () => {
 const attrs=new Map([['data-card-src','original.jpg'],['data-card-srcset','small.webp 480w, large.webp 960w'],['data-card-sizes','25vw']]);
 const writes=[],classes=new Set(),listeners={};
 const img={naturalWidth:0,complete:false,getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>{writes.push(k);attrs.set(k,v);},removeAttribute:k=>attrs.delete(k),classList:{add:k=>classes.add(k)},addEventListener:(k,fn)=>listeners[k]=fn};
 const card={querySelector:()=>attrs.has('data-card-src')?img:null};
 const events={};const root={addEventListener:(k,fn)=>events[k]=fn};
 globalThis.matchMedia=()=>({matches:true});
 try {
  initCardImages(root);assert.deepEqual(writes,[]);
  const target={closest:()=>card};
  events.pointerover({pointerType:'touch',target});assert.deepEqual(writes,[]);
  events.pointerover({pointerType:'mouse',target});assert.deepEqual(writes,['sizes','srcset','src']);
  assert.equal(classes.has('is-ready'),false);
  img.naturalWidth=480;listeners.load();assert.equal(classes.has('is-ready'),true);
  events.focusin({target});assert.equal(writes.length,3);
  loadCardImage(null);
 } finally {delete globalThis.matchMedia;}
});

test('coarse-pointer devices do not fetch invisible alternate images on focus', () => {
 const events={};initCardImages({addEventListener:(k,fn)=>events[k]=fn});
 globalThis.matchMedia=()=>({matches:false});
 try {events.focusin({target:{closest:()=>{throw Error('must not load');}}});}
 finally {delete globalThis.matchMedia;}
});
