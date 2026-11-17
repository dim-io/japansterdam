import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizePageAssets} from './page-assets.mjs';
import {responsiveAttrs} from '../../js/responsive-images.js';
test('public head uses a local font and responsive logo without delaying the primary hero',()=>{
 const result=optimizePageAssets('<head><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo"></head><img src="assets/img/site/header-logo.png"><img src="assets/img/site/hero-logo-panel.jpg" fetchpriority="high"><img src="assets/img/site/hero-model-needles-accurate.jpg" fetchpriority="high">');
 assert.ok(!result.includes('fonts.googleapis'));assert.ok(!result.includes('fonts.gstatic'));
 assert.ok(result.includes('as="font" type="font/woff2" crossorigin'));
 assert.match(result,/hero-logo-panel.jpg" fetchpriority="high"/);
 assert.match(result,/hero-model-needles-accurate.jpg" fetchpriority="auto" loading="lazy"/);
 assert.ok(result.includes('header-logo.png-320.webp 320w'));
});
test('responsive images offer four resolutions and leave external or signed URLs untouched',()=>{
 const attrs=responsiveAttrs('assets/img/site/sam-quote.jpg');
 for(const w of [320,480,768,960])assert.ok(attrs.includes(`${w}.webp ${w}w`));
 assert.equal(responsiveAttrs('https://example.com/photo.jpg'),'');
 assert.equal(responsiveAttrs('https://japansterdam-api.sam-jesse.workers.dev/img/products/a.jpg?token=x'),'');
});
