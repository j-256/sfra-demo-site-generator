// lib/locations.mjs
// Single source of truth for WHERE ids live. Shared by harvest and transform.
// category-id is intentionally NOT here - categories are never renamed.
// NOTE: store-id IS included (stores are renamed). Confirmed in Task 2: without it, stores
// are never collected/renamed.
export const ID_ATTRS = ['site-id', 'catalog-id', 'product-id', 'source-id', 'target-id', 'list-id', 'pricebook-id', 'library-id', 'store-id'];
export const ID_PREF_SINGLE = ['SiteCatalog', 'SiteCustomerList', 'SiteLibrary', 'SiteInventoryList'];
export const PREF_PRICEBOOKS = 'SitePriceBooks';
