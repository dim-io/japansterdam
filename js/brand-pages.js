import { shortBrand } from './brands.js';
// Permanent editorial destinations; collaboration credits stay unchanged.
export const BRAND_PAGES = [
  {
    "slug": "needles",
    "brand": "Needles",
    "title": "Pre-Owned Needles Clothing",
    "description": "Shop pre-owned Needles clothing at Japansterdam: individual shirts, trousers, jackets and coordinated sets, curated in Amsterdam.",
    "intro": "Unexpected proportions, expressive fabrics and pieces with a point of view. Our Needles selection brings together individual garments and coordinated sets, chosen for the details that make each piece worth a closer look.",
    "detail": "Browse the available pieces below. Each listing includes the original label size, our fit assessment where available, condition notes and garment measurements when supplied. Use these details to compare with a garment you already own."
  },
  {
    "slug": "kapital",
    "brand": "KAPITAL",
    "title": "Pre-Owned Kapital & Kountry Clothing",
    "description": "Explore pre-owned Kapital and Kapital Kountry clothing at Japansterdam. Discover distinctive Japanese garments, selected in Amsterdam.",
    "intro": "Texture, playful construction and distinctive silhouettes define our Kapital selection. From characterful trousers to substantial knitwear and Kountry pieces, every garment is selected individually rather than as part of a seasonal collection.",
    "detail": "Our selection changes as individual pieces find new owners. Explore the current garments below, with product-specific condition notes, original label sizes and measurements where available."
  },
  {
    "slug": "wacko-maria",
    "brand": "Wacko Maria",
    "title": "Pre-Owned Wacko Maria Clothing",
    "description": "Discover pre-owned Wacko Maria clothing at Japansterdam: expressive shirts, distinctive jackets and trousers, curated in Amsterdam.",
    "intro": "Bold prints, distinctive collaborations and an attitude that connects clothing with a wider cultural world. Our Wacko Maria selection brings together statement pieces and quieter garments, chosen for their character and construction.",
    "detail": "Explore the available pieces below and read the individual condition notes before ordering. For a closer look at one collaboration in the collection, visit our Journal story on Wacko Maria and Daido Moriyama."
  },
  {
    "slug": "nanamica",
    "brand": "Nanamica",
    "title": "Pre-Owned Nanamica Clothing",
    "description": "Discover pre-owned Nanamica clothing at Japansterdam. Explore considered everyday layers, knitwear and individual garments curated in Amsterdam.",
    "intro": "Quiet details, considered fabrics and an easy approach to everyday dressing. Our Nanamica selection focuses on garments that invite a closer look: texture, construction and a balance of utility and comfort.",
    "detail": "Explore the current selection below. Each piece has its own condition notes and original label size, with a fit assessment and garment measurements where supplied. Compare these details with a garment you already own before ordering."
  },
  {
    "slug": "engineered-garments",
    "brand": "Engineered Garments",
    "title": "Pre-Owned Engineered Garments Clothing",
    "description": "Explore pre-owned Engineered Garments clothing at Japansterdam. Discover characterful workwear-inspired pieces, selected individually in Amsterdam.",
    "intro": "Familiar workwear shapes with unexpected details. Our Engineered Garments selection is chosen for useful pockets, considered proportions and the character that makes a garment interesting to wear and layer.",
    "detail": "Explore the current selection below. Each piece has its own condition notes and original label size, with a fit assessment and garment measurements where supplied. Compare these details with a garment you already own before ordering."
  },
  {
    "slug": "nonnative",
    "brand": "Nonnative",
    "title": "Pre-Owned Nonnative Clothing",
    "description": "Shop pre-owned Nonnative clothing at Japansterdam. Discover everyday layers and distinctive utility pieces, curated in Amsterdam.",
    "intro": "Understated colour, useful details and silhouettes made for layering. Our Nonnative selection brings together individual pieces chosen for their balance of everyday ease and distinctive construction.",
    "detail": "Explore the current selection below. Each piece has its own condition notes and original label size, with a fit assessment and garment measurements where supplied. Compare these details with a garment you already own before ordering."
  },
  {
    "slug": "uniform-experiment",
    "brand": "Uniform Experiment",
    "title": "Pre-Owned Uniform Experiment Clothing",
    "description": "Discover pre-owned Uniform Experiment clothing and collaborations at Japansterdam. Explore individual pieces curated in Amsterdam.",
    "intro": "A considered uniform with room for something unexpected. Our Uniform Experiment selection looks for expressive details in familiar shapes, from distinctive outerwear to pieces made in collaboration with other labels.",
    "detail": "The selection includes available Uniform Experiment collaborations, with the full brand credit retained on each product page. Check the original label size, condition notes and measurements where supplied to find the piece that works for you."
  },
  {
    "slug": "ts-s",
    "brand": "Ts(s)",
    "title": "Pre-Owned Ts(s) Clothing",
    "description": "Explore pre-owned Ts(s) clothing at Japansterdam. Discover textured layers, shirts, trousers and outerwear, individually curated in Amsterdam.",
    "intro": "Texture and proportion reward a closer look. Our Ts(s) selection brings together distinctive fabrics, subtle patterns and relaxed layers, chosen for the details that give familiar garments their own character.",
    "detail": "Explore the current selection below. Each piece has its own condition notes and original label size, with a fit assessment and garment measurements where supplied. Compare these details with a garment you already own before ordering."
  },
  {
    "slug": "white-mountaineering",
    "brand": "White Mountaineering",
    "title": "Pre-Owned White Mountaineering Clothing",
    "description": "Discover pre-owned White Mountaineering clothing at Japansterdam. Explore outdoor-inspired layers and individual pieces, selected in Amsterdam.",
    "intro": "Outdoor references with a strong eye for pattern, texture and construction. Our White Mountaineering selection focuses on pieces that bring something distinctive to everyday layering.",
    "detail": "Explore the current selection below. Each piece has its own condition notes and original label size, with a fit assessment and garment measurements where supplied. Compare these details with a garment you already own before ordering."
  },
  {
    "slug": "wtaps",
    "brand": "WTAPS",
    "title": "Pre-Owned WTAPS Clothing",
    "description": "Shop pre-owned WTAPS clothing at Japansterdam. Explore utility-inspired garments and individual pieces, curated in Amsterdam.",
    "intro": "Utility shapes, considered proportions and details with purpose. Our WTAPS selection brings together garments chosen for their construction and the character they add to an everyday wardrobe.",
    "detail": "Explore the current selection below. Each piece has its own condition notes and original label size, with a fit assessment and garment measurements where supplied. Compare these details with a garment you already own before ordering."
  }
];
export const brandPage = brand => BRAND_PAGES.find(p=>shortBrand(p.brand).toLowerCase()===shortBrand(brand).toLowerCase());
