// The isolated radar reads only the same public fields as storefront visitors.
// No product-admin credentials or shop database binding cross account boundaries.
export async function readCatalog(env, fetcher = fetch) {
  if (!env.SHOP_CATALOG_URL) {
    return (await env.RADAR_DB.prepare("SELECT json_extract(data,'$.name') AS name, json_extract(data,'$.brand') AS brand, json_extract(data,'$.price') AS price FROM products").all()).results;
  }
  if (env.SHOP_CATALOG_URL !== 'https://japansterdam-api.japansterdam-api.workers.dev/public/products') throw Error('RADAR_INVENTORY_FAILED');
  try {
    const response = await fetcher(env.SHOP_CATALOG_URL, {redirect:'manual',signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw Error();
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length || rows.length > 2000) throw Error();
    const products = rows.filter(row=>row.active!==false).map(row=>({name:row.name,brand:row.brand,price:row.price}));
    if (!products.length || products.some(p=>typeof p.name!=='string'||typeof p.brand!=='string'||!Number.isFinite(p.price)||p.price<=0)) throw Error();
    return products;
  } catch { throw Error('RADAR_INVENTORY_FAILED'); }
}
