// server.js (FINAL - Receiver & Cache Server)

const express = require('express');
const cors =require('cors');
require('dotenv').config();

const app = express();
const PORT = 5000;

const searchCache = new Map();
const CACHE_DURATION_MS = 60 * 60 * 1000; // Cache for 1 hour
const trafficLog = { totalSearches: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json({ limit: '5mb' })); // Increase payload limit for scraped data
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;
const SERVER_SIDE_SECRET = process.env.SERVER_SIDE_SECRET; // The same secret as your Python script

// --- All the helper/filtering functions are the same ---
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
// MAIN ROUTES
// =================================================================

// This route ONLY checks the cache. It does no scraping.
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    try { const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress; trafficLog.totalSearches++; trafficLog.uniqueVisitors.add(visitorIp); trafficLog.searchHistory.unshift({ query: query, timestamp: new Date().toISOString() }); if (trafficLog.searchHistory.length > MAX_HISTORY) { trafficLog.searchHistory.splice(MAX_HISTORY); } } catch (e) {}
    
    const cacheKey = query.toLowerCase();
    if (searchCache.has(cacheKey)) {
        const cachedData = searchCache.get(cacheKey);
        if (Date.now() - cachedData.timestamp < CACHE_DURATION_MS) {
            console.log(`Serving results for "${query}" from CACHE!`);
            return res.json(cachedData.results);
        }
    }
    // If not in cache, tell the user.
    console.log(`No cached results for "${query}".`);
    res.json([]);
});

// NEW secret endpoint for your Python script to submit data
app.post('/submit-results', (req, res) => {
    const { secret, query, results } = req.body;

    if (secret !== SERVER_SIDE_SECRET) {
        return res.status(403).send('Forbidden');
    }
    if (!query || !results) {
        return res.status(400).send('Bad Request: Missing query or results.');
    }

    console.log(`Received ${results.length} results for "${query}" from local scraper.`);
    
    // Process and filter the submitted data exactly like we did before
    const isAccessorySearch = detectSearchIntent(query);
    let allResults = results.map(item => ({ ...item, price: parseFloat(item.price_string.replace(/[^0-9.]/g, '')), condition: detectItemCondition(item.title), image: formatImageUrl(item.image) })).filter(item => !isNaN(item.price));
    let finalFilteredResults;
    if (isAccessorySearch) {
        finalFilteredResults = filterResultsByQuery(allResults, query);
    } else {
        const accessoryFiltered = filterForIrrelevantAccessories(allResults);
        const mainDeviceFiltered = filterForMainDevice(accessoryFiltered);
        const queryFiltered = filterResultsByQuery(mainDeviceFiltered, query);
        finalFilteredResults = filterByPriceAnomalies(queryFiltered);
    }
    const sortedResults = finalFilteredResults.sort((a, b) => a.price - b.price);
    
    // Cache the processed results
    searchCache.set(query.toLowerCase(), {
        results: sortedResults,
        timestamp: Date.now()
    });

    console.log(`SUCCESS: Cached ${sortedResults.length} filtered results for "${query}".`);
    res.status(200).send('Results cached successfully.');
});

// Admin panel route remains the same
app.post('/admin/traffic-data', (req, res) => { /* ... */ });

app.listen(PORT, () => console.log(`Server is running! Open your browser to http://localhost:${PORT}`));


// --- Full helper function definitions for completeness ---
const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); if (REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword))) { return 'Refurbished'; } return 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };
app.post('/admin/traffic-data', (req, res) => { const { code } = req.body; if (!code || code !== ADMIN_CODE) { return res.status(403).json({ error: 'Forbidden' }); } res.json({ totalSearches: trafficLog.totalSearches, uniqueVisitors: trafficLog.uniqueVisitors.size, searchHistory: trafficLog.searchHistory }); });
