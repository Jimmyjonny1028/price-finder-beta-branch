// server.js (FINAL - Using ScraperAPI for Free, Stable Scraping)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios'); // We use axios to make API requests
const cheerio = require('cheerio');

const app = express();
const PORT = 5000;

const searchCache = new Map();
const CACHE_DURATION_MS = 20 * 60 * 1000;
const trafficLog = { totalSearches: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

// =================================================================
// ALL HELPER FUNCTIONS - DEFINED ONLY ONCE
// =================================================================
const ACCESSORY_KEYWORDS = [ 'strap', 'band', 'protector', 'case', 'charger', 'cable', 'stand', 'dock', 'adapter', 'film', 'glass', 'cover', 'guide', 'replacement' ];
const REFURBISHED_KEYWORDS = [ 'refurbished', 'renewed', 'pre-owned', 'preowned', 'used', 'open-box', 'as new' ];
const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); if (REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword))) { return 'Refurbished'; } return 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };

// =================================================================
// THE NEW SCRAPER - Powered by ScraperAPI
// =================================================================
async function scrapeSingleGooglePage(url) {
    try {
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(url)}`;
        const response = await axios.get(proxyUrl, { timeout: 45000 });
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
                        results.push({ title, price_string: priceString, store, url: link });
                    } catch (e) { /* Ignore invalid links */ }
                }
            }
        });
        return results;
    } catch (error) {
        console.error(`Failed to scrape page via proxy: ${error.message}`);
        return [];
    }
}

async function scrapeGoogleBroadSearch(query) {
    try {
        const searchPromises = [];
        const fullQuery = `buy ${query}`;
        const pagesToScrape = 10;
        console.log(`Generating URLs for ${pagesToScrape} pages...`);
        for (let i = 0; i < pagesToScrape; i++) {
            const start = i * 10;
            const searchUrl = `https://www.google.com.au/search?q=${encodeURIComponent(fullQuery)}&start=${start}&gl=au&hl=en`;
            searchPromises.push(scrapeSingleGooglePage(searchUrl));
        }
        console.log(`Scraping all ${pagesToScrape} pages in parallel via ScraperAPI...`);
        const allPageResults = await Promise.all(searchPromises);
        return allPageResults.flat();
    } catch (error) {
        console.error("The main scraping process failed:", error);
        return [];
    }
}

// =================================================================
// MAIN ROUTES
// =================================================================
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    try { const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress; trafficLog.totalSearches++; trafficLog.uniqueVisitors.add(visitorIp); trafficLog.searchHistory.unshift({ query: query, timestamp: new Date().toISOString() }); if (trafficLog.searchHistory.length > MAX_HISTORY) { trafficLog.searchHistory.splice(MAX_HISTORY); } } catch (e) { console.error("Error logging traffic:", e); }
    const cacheKey = query.toLowerCase();
    if (searchCache.has(cacheKey)) { const cachedData = searchCache.get(cacheKey); if (Date.now() - cachedData.timestamp < CACHE_DURATION_MS) { console.log(`Serving results for "${query}" from CACHE!`); return res.json(cachedData.results); } }
    console.log(`Starting broad scrape for: ${query}`);
    const isAccessorySearch = detectSearchIntent(query);
    console.log(`Search Intent Detected: ${isAccessorySearch ? 'ACCESSORY' : 'MAIN PRODUCT'}`);
    try {
        let rawResults = await scrapeGoogleBroadSearch(query);
        let allResults = rawResults.map(item => ({ ...item, price: parseFloat(item.price_string.replace(/[^0-9.]/g, '')), condition: detectItemCondition(item.title), image: formatImageUrl(null) })).filter(item => !isNaN(item.price));
        console.log(`Scraped ${allResults.length} initial valid results.`);
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
        searchCache.set(cacheKey, { results: sortedResults, timestamp: Date.now() });
        res.json(sortedResults);
    } catch (error) {
        console.error("Error in the main search handler:", error);
        res.status(500).json({ error: 'Failed to fetch data from APIs' });
    }
});

app.post('/admin/traffic-data', (req, res) => {
    const { code } = req.body;
    if (!code || code !== ADMIN_CODE) { return res.status(403).json({ error: 'Forbidden' }); }
    res.json({ totalSearches: trafficLog.totalSearches, uniqueVisitors: trafficLog.uniqueVisitors.size, searchHistory: trafficLog.searchHistory });
});

app.listen(PORT, () => console.log(`Server is running! Open your browser to http://localhost:${PORT}`));
