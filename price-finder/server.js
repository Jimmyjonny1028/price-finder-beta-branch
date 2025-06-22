// server.js (FINAL, STABLE - Multi-Site ScraperAPI with All Features)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 5000;

const searchCache = new Map();
const CACHE_DURATION_MS = 20 * 60 * 1000;
const trafficLog = { totalSearches: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json({ limit: '5mb' }));
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

// =================================================================
// HELPER FUNCTIONS (No changes needed)
// =================================================================
const ACCESSORY_KEYWORDS = [ 'strap', 'band', 'protector', 'case', 'charger', 'cable', 'stand', 'dock', 'adapter', 'film', 'glass', 'cover', 'guide', 'replacement' ];
const REFURBISHED_KEYWORDS = [ 'refurbished', 'renewed', 'pre-owned', 'preowned', 'used', 'open-box', 'as new' ];
const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); return REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword)) ? 'Refurbished' : 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };

// =================================================================
// THE NEW, STABLE SCRAPER FUNCTIONS (Powered by ScraperAPI)
// =================================================================

async function scrapeWithProxy(url) {
    const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(proxyUrl, { timeout: 45000 });
    return cheerio.load(data);
}

async function scrapeGoogleShopping(query) {
    try {
        console.log("-> Scraping Google Shopping...");
        const url = `https://www.google.com.au/search?tbm=shop&q=${encodeURIComponent(query)}&hl=en&gl=au`;
        const $ = await scrapeWithProxy(url);
        const results = [];
        $('.sh-dgr__gr-auto').each((i, el) => {
            const title = $(el).find('h3').text();
            const priceString = $(el).find('.a8Pemb').text();
            const store = $(el).find('.aULzUe').text();
            const link = $(el).find('a').attr('href');
            const image = $(el).find('img').attr('src');
            if (title && priceString && store) results.push({ title, price_string: priceString, store, url: `https://google.com.au${link}`, image });
        });
        console.log(`-> Google Shopping OK: Found ${results.length} items.`);
        return results;
    } catch (e) { console.error(`-> Google Shopping FAILED: ${e.message}`); return []; }
}

async function scrapeEbayAU(query) {
    try {
        console.log("-> Scraping eBay AU...");
        const url = `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(query)}`;
        const $ = await scrapeWithProxy(url);
        const results = [];
        $('li.s-item').each((i, el) => {
            const title = $(el).find('.s-item__title').text();
            const priceString = $(el).find('.s-item__price').text();
            const link = $(el).find('a').attr('href');
            const image = $(el).find('.s-item__image-wrapper img').attr('src');
            if (title && priceString && !title.toLowerCase().includes('shop with confidence')) results.push({ title, price_string: priceString, store: 'eBay', url: link, image });
        });
        console.log(`-> eBay AU OK: Found ${results.length} items.`);
        return results;
    } catch (e) { console.error(`-> eBay AU FAILED: ${e.message}`); return []; }
}

async function scrapeAmazonAU(query) {
    try {
        console.log("-> Scraping Amazon AU...");
        const url = `https://www.amazon.com.au/s?k=${encodeURIComponent(query)}`;
        const $ = await scrapeWithProxy(url);
        const results = [];
        $('div[data-cy="s-search-result"]').each((i, el) => {
            const title = $(el).find('h2 a span').text();
            const priceString = $(el).find('.a-price .a-offscreen').first().text();
            const link = $(el).find('h2 a').attr('href');
            const image = $(el).find('.s-image').attr('src');
            if (title && priceString) results.push({ title, price_string: priceString, store: 'Amazon', url: `https://amazon.com.au${link}`, image });
        });
        console.log(`-> Amazon AU OK: Found ${results.length} items.`);
        return results;
    } catch (e) { console.error(`-> Amazon AU FAILED: ${e.message}`); return []; }
}

// =================================================================
// MAIN SEARCH ROUTE
// =================================================================
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    try { const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress; trafficLog.totalSearches++; trafficLog.uniqueVisitors.add(visitorIp); trafficLog.searchHistory.unshift({ query: query, timestamp: new Date().toISOString() }); if (trafficLog.searchHistory.length > MAX_HISTORY) { trafficLog.searchHistory.splice(MAX_HISTORY); } } catch (e) {}
    
    const cacheKey = query.toLowerCase();
    if (searchCache.has(cacheKey)) { const cachedData = searchCache.get(cacheKey); if (Date.now() - cachedData.timestamp < CACHE_DURATION_MS) { console.log(`Serving results for "${query}" from CACHE!`); return res.json(cachedData.results); } }

    console.log(`Starting multi-site scrape for: ${query}`);
    const isAccessorySearch = detectSearchIntent(query);
    
    try {
        const scraperPromises = [
            scrapeGoogleShopping(query),
            scrapeEbayAU(query),
            scrapeAmazonAU(query)
        ];
        const allScraperResults = await Promise.all(scraperPromises);
        let rawResults = allScraperResults.flat();
        
        console.log(`Scraping complete. Found ${rawResults.length} total raw results.`);
        
        let allResults = rawResults.map(item => ({ ...item, price: parseFloat(String(item.price_string || '').replace(/[^0-9.]/g, '')), condition: detectItemCondition(item.title), image: formatImageUrl(item.image) })).filter(item => !isNaN(item.price));
        let finalFilteredResults;
        if (isAccessorySearch) {
            finalFilteredResults = filterResultsByQuery(allResults, query);
        } else {
            const accessoryFiltered = filterForIrrelevantAccessories(allResults);
            const mainDeviceFiltered = filterForMainDevice(accessoryFiltered);
            const queryFiltered = filterResultsByQuery(mainDeviceFiltered, query);
            finalFilteredResults = filterByPriceAnomalies(queryFiltered);
        }
        
        console.log(`Kept ${finalFilteredResults.length} final results after all filtering.`);
        const sortedResults = finalFilteredResults.sort((a, b) => a.price - b.price);
        
        const finalPayload = sortedResults.map(({ source, ...rest }) => rest);
        searchCache.set(cacheKey, { results: finalPayload, timestamp: Date.now() });
        res.json(finalPayload);
    } catch (error) { console.error("Error in the main search handler:", error); res.status(500).json({ error: 'Failed to fetch data from APIs' }); }
});

app.post('/admin/traffic-data', (req, res) => { const { code } = req.body; if (!code || code !== ADMIN_CODE) { return res.status(403).json({ error: 'Forbidden' }); } res.json({ totalSearches: trafficLog.totalSearches, uniqueVisitors: trafficLog.uniqueVisitors.size, searchHistory: trafficLog.searchHistory }); });

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
