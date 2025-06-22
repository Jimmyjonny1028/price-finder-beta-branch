// server.js (FINAL - Faster "Scrape-Lite" with API Fallback)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios'); // We will use axios for scraping now
const cheerio = require('cheerio');

const app = express();
const PORT = 5000;

// Shorter cache is fine because searches are fast now
const searchCache = new Map();
const CACHE_DURATION_MS = 10 * 60 * 1000;
const trafficLog = { totalSearches: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;
const PRICEAPI_COM_KEY = process.env.PRICEAPI_COM_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =================================================================
// ALL HELPER FUNCTIONS (No changes needed)
// =================================================================
const ACCESSORY_KEYWORDS = [ /* ... */ ];
const REFURBISHED_KEYWORDS = [ /* ... */ ];
const detectItemCondition = (title) => { /* ... */ };
function formatImageUrl(url) { /* ... */ }
const filterForIrrelevantAccessories = (results) => { /* ... */ };
const filterForMainDevice = (results) => { /* ... */ };
const filterByPriceAnomalies = (results) => { /* ... */ };
const filterResultsByQuery = (results, query) => { /* ... */ };
const detectSearchIntent = (query) => { /* ... */ };

// =================================================================
// THE NEW "SCRAPE-LITE" FUNCTION (Much Faster)
// =================================================================

async function scrapeGoogleLite(query) {
    try {
        const fullQuery = `buy ${query} site:au`;
        console.log(`Performing fast scrape for: "${fullQuery}"`);

        // We mimic a real browser with a User-Agent header
        const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(fullQuery)}&hl=en&gl=au`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
            },
            timeout: 10000 // 10-second timeout
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        const results = [];

        $('div.g').each((i, el) => {
            const resultText = $(el).text();
            if (resultText.includes('$')) {
                const title = $(el).find('h3').text();
                const link = $(el).find('a').attr('href');
                const priceMatch = resultText.match(/\$\s?\d{1,3}(,\d{3})*(\.\d{2})?/);
                const priceString = priceMatch ? priceMatch[0] : null;

                if (title && link && priceString) {
                    try {
                        const store = new URL(link).hostname.replace('www.', '');
                        results.push({
                            title,
                            price_string: priceString,
                            store,
                            url: link,
                            source: 'Google Scraper' // Keep source for potential filtering
                        });
                    } catch (e) { /* Ignore invalid links */ }
                }
            }
        });
        return results;
    } catch (error) {
        console.error(`Lightweight scrape failed: ${error.response ? error.response.status : error.message}`);
        return []; // Return empty on failure to trigger API fallback
    }
}

// --- The API fallback functions remain the same ---
async function searchPricerAPI(query) { /* ... */ }
async function searchPriceApiCom(query) { /* ... */ }


// =================================================================
// MAIN SEARCH ROUTE - Now uses Scrape-Lite
// =================================================================
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    try { const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress; trafficLog.totalSearches++; trafficLog.uniqueVisitors.add(visitorIp); trafficLog.searchHistory.unshift({ query: query, timestamp: new Date().toISOString() }); if (trafficLog.searchHistory.length > MAX_HISTORY) { trafficLog.searchHistory.splice(MAX_HISTORY); } } catch (e) {}
    const cacheKey = query.toLowerCase();
    if (searchCache.has(cacheKey)) { const cachedData = searchCache.get(cacheKey); if (Date.now() - cachedData.timestamp < CACHE_DURATION_MS) { console.log(`Serving results for "${query}" from CACHE!`); return res.json(cachedData.results); } }
    
    const isAccessorySearch = detectSearchIntent(query);
    
    try {
        console.log("Attempting primary data source: Lightweight Scrape...");
        let rawResults = await scrapeGoogleLite(query);

        if (rawResults.length === 0) {
            console.log("Scraper returned no results. Initiating API fallback...");
            const [pricerResults, priceApiComResults] = await Promise.all([
                searchPricerAPI(query),
                searchPriceApiCom(query)
            ]);
            rawResults = [...pricerResults, ...priceApiComResults];
        }

        let allResults = rawResults.map(item => ({ ...item, price: parseFloat(String(item.price_string || item.price).replace(/[^0-9.]/g, '')), condition: detectItemCondition(item.title), image: formatImageUrl(item.image) })).filter(item => !isNaN(item.price));
        console.log(`Processed ${allResults.length} initial valid results.`);
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

app.post('/admin/traffic-data', (req, res) => { /* ... */ });
app.listen(PORT, () => console.log(`Server is running! Open your browser to http://localhost:${PORT}`));


// --- Full definitions of all unchanged functions ---
const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); if (REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword))) { return 'Refurbished'; } return 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };
async function searchPricerAPI(query) { try { const regionalQuery = `${query} australia`; const response = await axios.request({ method: 'GET', url: 'https://pricer.p.rapidapi.com/str', params: { q: regionalQuery }, headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'pricer.p.rapidapi.com' } }); return response.data.map(item => ({ source: 'Pricer', title: item?.title || 'Title Not Found', price: item?.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) : null, price_string: item?.price || 'N/A', url: item?.url, image: item?.img, store: item?.shop ? item.shop.replace(' from ', '') : 'Seller Not Specified', condition: detectItemCondition(item?.title || '') })); } catch (err) { console.error("Pricer API search failed:", err.message); return []; } }
async function searchPriceApiCom(query) { let allResults = []; try { const jobsToSubmit = [ { source: 'amazon', topic: 'product_and_offers', key: 'term', values: query }, { source: 'ebay', topic: 'search_results', key: 'term', values: query, condition: 'any' }, { source: 'google_shopping', topic: 'search_results', key: 'term', values: query, condition: 'any' } ]; const jobPromises = jobsToSubmit.map(job => axios.post('https://api.priceapi.com/v2/jobs', { token: PRICEAPI_COM_KEY, country: 'au', ...job }).then(res => ({ ...res.data, source: job.source, topic: job.topic })).catch(err => { console.error(`Failed to submit job for source: ${job.source}`, err.response?.data?.message || err.message); return null; }) ); const jobResponses = (await Promise.all(jobPromises)).filter(Boolean); if (jobResponses.length === 0) return []; await wait(30000); const resultPromises = jobResponses.map(job => axios.get(`https://api.priceapi.com/v2/jobs/${job.job_id}/download.json`, { params: { token: PRICEAPI_COM_KEY } }).then(res => ({ ...res.data, source: job.source, topic: job.topic })).catch(err => { console.error(`Failed to fetch results for job ID ${job.job_id}`, err.response?.data?.message || err.message); return null; }) ); const downloadedResults = (await Promise.all(resultPromises)).filter(Boolean); for (const data of downloadedResults) { let mapped = []; const sourceName = data.source; if (data.topic === 'product_and_offers') { const products = data.results?.[0]?.products || []; mapped = products.map(item => ({ source: sourceName, title: item?.name || 'Title Not Found', price: item?.price, price_string: item?.offer?.price_string || (item?.price ? `$${item.price.toFixed(2)}` : 'N/A'), url: item?.url, image: item?.image, store: item?.shop?.name || sourceName, condition: detectItemCondition(item?.name || '') })); } else if (data.topic === 'search_results') { const searchResults = data.results?.[0]?.content?.search_results || []; mapped = searchResults.map(item => { let price = null; let price_string = 'N/A'; if (item.price) { price = parseFloat(item.price_with_shipping) || parseFloat(item.price); price_string = item.price_string || `$${parseFloat(item.price).toFixed(2)}`; } else if (item.min_price) { price = parseFloat(item.min_price); price_string = `From $${price.toFixed(2)}`; } if (item.name && price !== null) return { source: sourceName, title: item.name, price: price, price_string: price_string, url: item.url, image: item.img_url, store: item.shop_name || sourceName, condition: detectItemCondition(item.name || (item.condition_text || '')) }; return null; }).filter(Boolean); } allResults = allResults.concat(mapped); } return allResults; } catch (err) { console.error("A critical error occurred in the searchPriceApiCom function:", err.message); return []; } }
app.post('/admin/traffic-data', (req, res) => { const { code } = req.body; if (!code || code !== ADMIN_CODE) { return res.status(403).json({ error: 'Forbidden' }); } res.json({ totalSearches: trafficLog.totalSearches, uniqueVisitors: trafficLog.uniqueVisitors.size, searchHistory: trafficLog.searchHistory }); });
