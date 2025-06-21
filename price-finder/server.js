// server.js (FINAL - With Specific Ubuy-from-Google Filter)

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.static('public'));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const PRICEAPI_COM_KEY = process.env.PRICEAPI_COM_KEY;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =================================================================
// ALL HELPER FUNCTIONS - DEFINED ONLY ONCE
// =================================================================

const ACCESSORY_KEYWORDS = [
    'strap', 'band', 'protector', 'case', 'charger', 'cable', 'stand', 
    'dock', 'adapter', 'film', 'glass', 'cover', 'guide', 'replacement'
];

// --- NEW: Specific filter for Ubuy results from Google Shopping ---
const filterUbuyFromGoogle = (results) => {
    const ubuyStoreName = 'ubuy';
    const googleShoppingSource = 'google_shopping';
    
    return results.filter(item => {
        // Ensure properties exist to prevent errors
        const itemSource = item.source ? item.source.toLowerCase() : '';
        const itemStore = item.store ? item.store.toLowerCase() : '';

        // If the source is Google Shopping AND the store is Ubuy, filter it out (return false).
        if (itemSource.includes(googleShoppingSource) && itemStore.includes(ubuyStoreName)) {
            return false;
        }
        // Otherwise, keep the item.
        return true;
    });
};

const filterForEnglish = (results) => { /* ... existing code ... */ };
const filterForIrrelevantAccessories = (results) => { /* ... existing code ... */ };
const filterForMainDevice = (results) => { /* ... existing code ... */ };
const filterByPriceAnomalies = (results) => { /* ... existing code ... */ };
const filterResultsByQuery = (results, query) => { /* ... existing code ... */ };
const detectSearchIntent = (query) => { /* ... existing code ... */ };
function cleanGoogleUrl(googleUrl) { /* ... existing code ... */ }


// =================================================================
// MAIN SEARCH ROUTE
// =================================================================

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    console.log(`Starting multi-source search for: ${query}`);
    const isAccessorySearch = detectSearchIntent(query);
    console.log(`Search Intent Detected: ${isAccessorySearch ? 'ACCESSORY' : 'MAIN PRODUCT'}`);

    try {
        const [pricerResults, priceApiComResults] = await Promise.all([
            searchPricerAPI(query),
            searchPriceApiCom(query)
        ]);

        const allResults = [...pricerResults, ...priceApiComResults].filter(item => item.price !== null && !isNaN(item.price));
        console.log(`Received ${allResults.length} initial valid results.`);

        // --- APPLYING THE NEW UBUY-FROM-GOOGLE FILTER FIRST ---
        const filteredForUbuyFromGoogle = filterUbuyFromGoogle(allResults);
        console.log(`Kept ${filteredForUbuyFromGoogle.length} results after removing Google's Ubuy listings.`);
        
        const languageFiltered = filterForEnglish(filteredForUbuyFromGoogle);
        console.log(`Kept ${languageFiltered.length} results after English language filtering.`);

        let finalFilteredResults;
        if (isAccessorySearch) {
            console.log("Applying ACCESSORY filtering logic...");
            finalFilteredResults = filterResultsByQuery(languageFiltered, query);
        } else {
            console.log("Applying MAIN PRODUCT filtering logic...");
            const accessoryFiltered = filterForIrrelevantAccessories(languageFiltered);
            const mainDeviceFiltered = filterForMainDevice(accessoryFiltered);
            const queryFiltered = filterResultsByQuery(mainDeviceFiltered, query);
            finalFilteredResults = filterByPriceAnomalies(queryFiltered);
        }

        console.log(`Kept ${finalFilteredResults.length} final results after all filtering.`);
        const sortedResults = finalFilteredResults.sort((a, b) => a.price - b.price);

        // --- FINAL STEP: Remove the 'source' property before sending to the client ---
        const finalPayload = sortedResults.map(({ source, ...rest }) => rest);

        res.json(finalPayload);
    } catch (error) {
        console.error("Error in the main search handler:", error);
        res.status(500).json({ error: 'Failed to fetch data from APIs' });
    }
});

// =================================================================
// API CALLING FUNCTIONS (Unchanged - they still need to provide the 'source' for filtering)
// =================================================================

async function searchPricerAPI(query) { /* ... existing code ... */ }
async function searchPriceApiCom(query) { /* ... existing code ... */ }


app.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});


// --- Full, non-duplicated helper function definitions ---
const filterForEnglish = (results) => { const isNotEnglishRegex = /[^\u0020-\u007E]/; return results.filter(item => !isNotEnglishRegex.test(item.title)); };
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };
function cleanGoogleUrl(googleUrl) { if (!googleUrl || !googleUrl.includes('?q=')) return googleUrl; try { const url = new URL(googleUrl); return url.searchParams.get('q') || googleUrl; } catch (e) { return googleUrl; } }
async function searchPricerAPI(query) { try { const regionalQuery = `${query} australia`; const response = await axios.request({ method: 'GET', url: 'https://pricer.p.rapidapi.com/str', params: { q: regionalQuery }, headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'pricer.p.rapidapi.com' } }); return response.data.map(item => ({ source: 'Pricer API', title: item?.title || 'Title Not Found', price: item?.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) : null, price_string: item?.price || 'N/A', url: cleanGoogleUrl(item?.link), image: item?.img || 'https://via.placeholder.com/150', store: item?.shop ? item.shop.replace(' from ', '') : 'Seller Not Specified' })); } catch (err) { console.error("Pricer API search failed:", err.message); return []; } }
async function searchPriceApiCom(query) { let allResults = []; try { const jobsToSubmit = [ { source: 'amazon', topic: 'product_and_offers', key: 'term', values: query }, { source: 'ebay', topic: 'search_results', key: 'term', values: query }, { source: 'google_shopping', topic: 'search_results', key: 'term', values: query } ]; const jobPromises = jobsToSubmit.map(job => axios.post('https://api.priceapi.com/v2/jobs', { token: PRICEAPI_COM_KEY, country: 'au', max_pages: 1, ...job }).then(res => ({ ...res.data, source: job.source, topic: job.topic })).catch(err => { console.error(`Failed to submit job for source: ${job.source}`, err.response?.data?.message || err.message); return null; }) ); const jobResponses = (await Promise.all(jobPromises)).filter(Boolean); if (jobResponses.length === 0) return []; await wait(30000); const resultPromises = jobResponses.map(job => axios.get(`https://api.priceapi.com/v2/jobs/${job.job_id}/download.json`, { params: { token: PRICEAPI_COM_KEY } }).then(res => ({ ...res.data, source: job.source, topic: job.topic })).catch(err => { console.error(`Failed to fetch results for job ID ${job.job_id}`, err.response?.data?.message || err.message); return null; }) ); const downloadedResults = (await Promise.all(resultPromises)).filter(Boolean); for (const data of downloadedResults) { let mapped = []; const sourceName = `PriceAPI (${data.source})`; if (data.topic === 'product_and_offers') { const products = data.results?.[0]?.products || []; mapped = products.map(item => ({ source: sourceName, title: item?.name, price: item?.price, price_string: item?.offer?.price_string || (item?.price ? `$${item.price.toFixed(2)}` : 'N/A'), url: item?.url, image: item?.image || 'https://via.placeholder.com/150', store: item?.shop?.name || data.source })); } else if (data.topic === 'search_results') { const searchResults = data.results?.[0]?.content?.search_results || []; mapped = searchResults.map(item => { let price = null; let price_string = 'N/A'; if (item.type === 'offer' && item.price) { price = parseFloat(item.price_with_shipping) || parseFloat(item.price); price_string = `$${parseFloat(item.price).toFixed(2)}`; const shipping = parseFloat(item.shipping_costs); if (shipping > 0) price_string += ` + $${shipping.toFixed(2)} ship`; } else if ((item.type === 'product' || item.type === 'offer_cluster') && item.min_price) { price = parseFloat(item.min_price); price_string = `From $${price.toFixed(2)}`; } if (item.name && price !== null) return { source: sourceName, title: item.name, price: price, price_string: price_string, url: item.url, image: item.img_url || 'https://via.placeholder.com/150', store: item.shop_name || data.source }; return null; }).filter(Boolean); } allResults = allResults.concat(mapped); } return allResults; } catch (err) { console.error("A critical error occurred in the searchPriceApiCom function:", err.message); return []; } }
