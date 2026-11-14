import test from 'node:test';
import assert from 'node:assert/strict';
import {productBrands,matchesBrand,brandOptions,brandCounts} from '../js/brands.js';
test('collaborations match each participant while preserving the original credit',()=>{
 const p={brand:'Uniform Experiment x Fragment Design x Carhartt'};
 assert.deepEqual(productBrands(p),['Uniform Experiment','Fragment Design','Carhartt']);
 for(const brand of ['Uniform Experiment','Fragment Design','Carhartt',p.brand])assert(matchesBrand(p,brand));
 assert(!matchesBrand(p,'Needles'));assert.equal(p.brand,'Uniform Experiment x Fragment Design x Carhartt');
 assert.deepEqual(productBrands({brand:'Denim by Vanquish & Fragment'}),['Vanquish','Fragment Design']);
 assert.deepEqual(productBrands({brand:'SOPHNET. × VISVIM'}),['SOPHNET.','Visvim']);
 assert.deepEqual(productBrands({brand:'H&M'}),['H&M']);
});
test('short labels and available counts do not double-count a collaboration or expose hidden pieces',()=>{
 const products=[{brand:'Nulabel CM1Y0K42',category:'Bottoms'},{brand:'Nike x Fragment Design',category:'Tops'},{brand:'Fragment Design x Fragment',category:'Tops'},{brand:'Needles',sold:true},{brand:'Secret',active:false}];
 assert(!brandOptions(products).includes('Secret'));assert(brandOptions(products).includes('Nulabel'));
 assert.equal(brandCounts(products).get('Fragment Design'),2);assert.equal(brandCounts(products,p=>p.category==='Tops').get('Nulabel'),undefined);
 assert.equal(brandCounts(products).get('Needles'),undefined);
});
