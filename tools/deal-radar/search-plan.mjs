import fs from 'node:fs/promises';

const config = JSON.parse(await fs.readFile(new URL('./config.json', import.meta.url), 'utf8'));
const jobs = [...new Set([...config.coreBrands, ...config.peripheralBrands].flatMap((brand) => [brand, ...(config.aliases[brand] || [])]))]
  .map((text) => ({ text, priceTo: config.maxItemPrice, currency: 'EUR', order: 'newest_first',
    // Do not narrow to men's categories: mislabeled pieces are part of the brief.
    categories: [], sizes: [], source: 'Vinted', excludeBundles: true }));
console.log(JSON.stringify({ version: 1, queries: jobs }, null, 2));
