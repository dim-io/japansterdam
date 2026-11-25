import provenance from '../web/image-provenance.json' with {type:'json'};
const confirmed = new Set(provenance.trainedAlgorithmicMedia);
export const knownGeneratedImage = key => confirmed.has(key);
// APP1 XMP adds provenance without decoding/recompressing any JPEG pixels.
export function markGeneratedJPEG(buffer) {
 const bytes = new Uint8Array(buffer);
 if(bytes[0]!==0xff || bytes[1]!==0xd8) return bytes;
 if(new TextDecoder().decode(bytes).includes('DigitalSourceType')) return bytes;
 const xmp = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></rdf:RDF></x:xmpmeta>');
 const length=xmp.length+2, result=new Uint8Array(bytes.length+xmp.length+4);
 result.set(bytes.subarray(0,2)); result.set([0xff,0xe1,length>>8,length&255],2);result.set(xmp,6);result.set(bytes.subarray(2),6+xmp.length);
 return result;
}
