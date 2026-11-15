import test from 'node:test';
import assert from 'node:assert/strict';
import {productBrands,matchesBrand,brandOptions,brandCounts} from '../js/brands.js';
test('collaborations match each participant while preserving the original credit',()=>{
 const p={brand:'Uniform Experiment x Fragment Design x Carhartt'};
 assert.deepEqual(productBrands(p),['Uniform Experiment','Fragment Design']);
 for(const brand of ['Uniform Experiment','Fragment Design',p.brand])assert(matchesBrand(p,brand));
 assert(!matchesBrand(p,'Needles'));assert.equal(p.brand,'Uniform Experiment x Fragment Design x Carhartt');
 assert.deepEqual(productBrands({brand:'Denim by Vanquish & Fragment'}),['Denim by Vanquish & Fragment']);
 assert.deepEqual(productBrands({brand:'SOPHNET. × VISVIM'}),['SOPHNET.','Visvim']);
 assert.deepEqual(productBrands({brand:'H&M'}),['H&M']);
});
test('short labels and available counts do not double-count a collaboration or expose hidden pieces',()=>{
 const products=[{brand:'Nulabel CM1Y0K42',category:'Bottoms'},{brand:'Nike x Fragment Design',category:'Tops'},{brand:'Fragment Design x Fragment',category:'Tops'},{brand:'Needles',sold:true},{brand:'Secret',active:false}];
 assert(!brandOptions(products).includes('Secret'));assert(brandOptions(products).includes('Nulabel'));
 assert.equal(brandCounts(products).get('Fragment Design'),2);assert.equal(brandCounts(products,p=>p.category==='Tops').get('Nulabel'),undefined);
 assert.equal(brandCounts(products).get('Needles'),undefined);
});

test('separate SOPHNET and Visvim entries share the collaboration while Denim remains its own label',()=>{
 const products=[{slug:'polo',brand:'SOPHNET. x VISVIM'},{slug:'solo',brand:'SOPHNET.'},{slug:'denim',brand:'Denim by Vanquish & Fragment'}];
 assert.deepEqual(brandOptions(products),['Denim by Vanquish & Fragment','SOPHNET.','Visvim']);
 assert.deepEqual(products.filter(p=>matchesBrand(p,'Visvim')).map(p=>p.slug),['polo']);
 assert.deepEqual(products.filter(p=>matchesBrand(p,'SOPHNET.')).map(p=>p.slug),['polo','solo']);
 assert.equal(brandCounts(products).get('SOPHNET.'),2);
 assert.equal(brandCounts(products).get('Visvim'),1);
 assert(!matchesBrand(products[2],'Fragment Design'));
});

test('omitted labels leave navigation while collaborations remain discoverable',()=>{
 const products=[{brand:'Nike x Fragment Design'},{brand:'Uniform Experiment x Fragment Design x Carhartt'},{brand:'The Changes'}];
 assert.deepEqual(brandOptions(products),['Fragment Design','Uniform Experiment']);
 assert.deepEqual(productBrands(products[2]),[]);
 assert(matchesBrand(products[0],'Fragment Design'));
 assert(matchesBrand(products[1],'Uniform Experiment'));
 assert.equal(products[2].brand,'The Changes');
});
