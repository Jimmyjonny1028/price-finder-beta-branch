// server.js (DEFINITIVE FIX - Corrected Syntax, API Calls, and Image Handling)

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 5000;

const searchCache = new Map();
const CACHE_DURATION_MS = 10 * 60 * 1000;

app.use(cors());
app.use(express.static('public'));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const PRICEAPI_COM_KEY = process.env.PRICEAPI_COM_KEY;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =================================================================
// ALL HELPER FUNCTIONS - DEFINED ONLY ONCE
// =================================================================

const ACCESSORY_KEYWORDS = [ 'strap', 'band', 'protector', 'case', 'charger', 'cable', 'stand', 'dock', 'adapter', 'film', 'glass', 'cover', 'guide', 'replacement' ];

// --- FIX: New robust function to clean and validate image URLs ---
function formatImageUrl(url) {
    const placeholder = 'https://via.placeholder.com/150/F0F2F5/333333?text=No+Image';
    if (!url || typeof url !== 'string') {
        return placeholder;
    }
    // If URL starts with //, prepend https:
    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    // If URL is missing http protocol, it's likely invalid, use placeholder
    if (!url.startsWith('http')) {
        return placeholder;
    }
    return url;
}

const filterUbuyFromGoogle = (results) => { const ubuyStoreName = 'ubuy'; const googleShoppingSource = 'google shopping'; return results.filter(item => { const itemSource = item.source ? item.source.toLowerCase() : ''; const itemStore = item.store ? item.store.toLowerCase() : ''; if (itemSource.includes(googleShoppingSource) && itemStore.includes(ubuyStoreName)) { return false; } return true; }); };
const filterForEnglish = (results) => { const isNotEnglishRegex = /[^\u0020-\u007E]/; return results.filter(item => !isNotEnglishRegex.test(item.title)); };
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };
function cleanGoogleUrl(googleUrl) { if (!googleUrl || !googleUrl.includes('?q=')) return googleUrl; try { const url = new URL(googleUrl); return url.searchParams.get('q') || googleUrl; } catch (e) { return googleUrl; } }

// =================================================================
// MAIN SEARCH ROUTE
// =================================================================

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });
    
    const cacheKey = query.toLowerCase();
    if (searchCache.has(cacheKey)) {
        const cachedData = searchCache.get(cacheKey);
        if (Date.now() - cachedData.timestamp < CACHE_DURATION_MS) {
            console.log(`Serving results for "${query}" from CACHE!`);
            return res.json(cachedData.results);
        }
    }

    console.log(`Starting multi-source search for: ${query}`);
    const isAccessorySearch = detectSearchIntent(query);
    console.log(`Search Intent Detected: ${isAccessorySearch ? 'ACCESSORY' : 'MAIN PRODUCT'}`);

    try {
        const [pricerResults, priceApiComResults] = await Promise.all([
            searchPricerAPI(query),
            searchPriceApiCom(query)
        ]);

        let allResults = [...pricerResults, ...priceApiComResults].filter(item => item.price !== null && !isNaN(item.price));
        console.log(`Received ${allResults.length} initial valid results.`);
        
        const filteredForUbuy = filterUbuyFromGoogle(allResults);
        const languageFiltered = filterForEnglish(filteredForUbuy);

        let finalFilteredResults;
        if (isAccessorySearch) {
            finalFilteredResults = filterResultsByQuery(languageFiltered, query);
        } else {
            const accessoryFiltered = filterForIrrelevantAccessories(languageFiltered);
            const mainDeviceFiltered = filterForMainDevice(accessoryFiltered);
            const queryFiltered = filterResultsByQuery(mainDeviceFiltered, query);
            finalFilteredResults = filterByPriceAnomalies(queryFiltered);
        }
        
        console.log(`Kept ${finalFilteredResults.length} final results after all filtering.`);
        const sortedResults = finalFilteredResults.sort((a, b) => a.price - b.price);

        searchCache.set(cacheKey, { results: sortedResults, timestamp: Date.now() });
        console.log(`Stored results for "${query}" in cache.`);
        
        res.json(sortedResults);
    } catch (error) {
        console.error("Error in the main search handler:", error);
        res.status(500).json({ error: 'Failed to fetch data from APIs' });
    }
});

// =================================================================
// API CALLING FUNCTIONS
// =================================================================

async function searchPricerAPI(query) {
    try {
        const regionalQuery = `${query} australia`;
        const response = await axios.request({
            method: 'GET', url: 'https://pricer.p.rapidapi.com/str',
            params: { q: regionalQuery },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'pricer.p.rapidapi.com' }
        });
        return response.data.map(item => ({
            source: 'Pricer',
            title: item?.title || 'Title Not Found',
            price: item?.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) : null,
            price_string: item?.price || 'N/A',
            url: cleanGoogleUrl(item?.link),
            image: formatImageUrl(item?.img), // FIX: Format image URL
            store: item?.shop ? item.shop.replace(' from ', '') : 'Seller Not Specified'
        }));
    } catch (err) { console.error("Pricer API search failed:", err.message); return []; }
}

async function searchPriceApiCom(query) {
    let allResults = [];
    try {
        // --- FIX: Standardized all jobs to use 'search_results' and forced eBay to Australian domain ---
        const jobsToSubmit = [
            { source: 'amazon', topic: 'search_results', key: 'term', values: query },
            { source: 'ebay', topic: 'search_results', key: 'term', values: query, domain: 'ebay.com.au' },
            { source: 'google shopping', topic: 'search_results', key: 'term', values: query }
        ];

        const jobPromises = jobsToSubmit.map(job =>
            axios.post('https://api.priceapi.com/v2/jobs', { token: PRICEAPI_COM_KEY, country: 'au', ...job })
            .then(res => ({ ...res.data, source: job.source, topic: job.topic }))
            .catch(err => { console.error(`Failed to submit job for source: ${job.source}`, err.response?.data?.message || err.message); return null; })
        );
        
        const jobResponses = (await Promise.all(jobPromises)).filter(Boolean);
        if (jobResponses.length === 0) return [];
        
        console.log(`Jobs submitted. Waiting for processing...`);
        await wait(30000);

        const resultPromises = jobResponses.map(job =>
            axios.get(`https://api.priceapi.com/v2/jobs/${job.job_id}/download.json`, { params: { token: PRICEAPI_COM_KEY } })
            .then(res => ({ ...res.data, source: job.source, topic: job.topic }))
            .catch(err => { console.error(`Failed to fetch results for job ID ${job.job_id}`, err.response?.data?.message || err.message); return null; })
        );

        const downloadedResults = (await Promise.all(resultPromises)).filter(Boolean);

        for (const data of downloadedResults) {
            // All jobs now use 'search_results', so we can simplify the parsing logic.
            const sourceName = data.source;
            const searchResults = data.results?.[0]?.content?.search_results || [];
            
            const mapped = searchResults.map(item => {
                let price = null;
                let price_string = 'N/A';
                if (item.price) {
                    price = parseFloat(item.price_with_shipping) || parseFloat(item.price);
                    price_string = `$${parseFloat(item.price).toFixed(2)}`;
                    const shipping = parseFloat(item.shipping_costs);
                    if (shipping > 0) price_string += ` + $${shipping.toFixed(2)} ship`;
                } else if (item.min_price) {
                    price = parseFloat(item.min_price);
                    price_string = `From $${price.toFixed(2)}`;
                }

                if (item.name && price !== null) {
                    return {
                        source: sourceName,
                        title: item.name,
                        price: price,
                        price_string: price_string,
                        url: item.url,
                        image: formatImageUrl(item.img_url), // FIX: Format image URL
                        store: item.shop_name || sourceName
                    };
                }
                return null;
            }).filter(Boolean);
            
            allResults = allResults.concat(mapped);
        }
        return allResults;
    } catch (err) {
        console.error("A critical error occurred in the searchPriceApiCom function:", err.message);
        return [];
    }
}

app.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});
