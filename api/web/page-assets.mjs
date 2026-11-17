import {responsiveAttrs} from '../../js/responsive-images.js';
export function optimizePageAssets(html) {
 // The same licensed font families are served locally; no third-party CSS hop.
 html=html.replace(/<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g,'');
 html=html.replace('</head>','<link rel="preload" href="/assets/fonts/archivo-latin-expanded-800.woff2" as="font" type="font/woff2" crossorigin>\n</head>');
 html=html.replace(/<img\b[^>]*>/g,tag=>{
  const src=tag.match(/\bsrc="([^"]+)"/)?.[1];
  if(src?.endsWith('/header-logo.png'))return tag.replace('<img','<img'+responsiveAttrs(src,'(min-width:900px) 236px, 160px'));
  // On mobile the model is below the first logo panel; the logo stays high priority.
  if(src?.endsWith('/hero-model-needles-accurate.jpg'))return tag.replace('fetchpriority="high"','fetchpriority="auto" loading="lazy"');
  return tag;
 });
 return html;
}
