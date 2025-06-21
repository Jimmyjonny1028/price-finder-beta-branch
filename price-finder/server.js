// server.js (FINAL WORKING VERSION - CORRECT JSON PARSING FOR ALL 3 SOURCES)

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

const filterResultsByQuery = (results, query) => {
    const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 1 && isNaN(word));
    if (queryKeywords.length === 0) return results;
    return results.filter(item => item.title.toLowerCase().includes(queryKeywords.join(' ')));
};

const filterForIrrelevantAccessories = (results) => {
    const negativeKeywords = [
        'strap', 'band', 'protector', 'case', 'charger', 'cable', 
        'stand', 'dock', 'adapter', 'film', 'glass', 'cover', 'guide',
        'replacement', 'for '
    ];
    return results.filter(item => {
        const itemTitle = item.title.toLowerCase();
        return !negativeKeywords.some(keyword => itemTitle.includes(keyword));
    });
};

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    console.log(`Starting multi-source smart search for: ${query}`);
    try {
        const [pricerResults, priceApiComResults] = await Promise.all([
            searchPricerAPI(query),
            searchPriceApiCom(query)
        ]);

        const allResults = [...pricerResults, ...priceApiComResults];
        console.log(`Received ${allResults.length} initial results from all sources.`);

        const relevantResults = filterForIrrelevantAccessories(allResults);
        console.log(`Kept ${relevantResults.length} results after accessory filtering.`);
        
        const filteredResults = filterResultsByQuery(relevantResults, query);
        console.log(`Kept ${filteredResults.length} results after keyword filtering.`);

        const validResults = filteredResults.filter(item => item.price !== null && !isNaN(item.price));
        console.log(`Found ${validResults.length} valid, sorted offers.`);

        const sortedResults = validResults.sort((a, b) => a.price - b.price);

        res.json(sortedResults);
    } catch (error) {
        console.error("Error in the main search handler:", error);
        res.status(500).json({ error: 'Failed to fetch data from APIs' });
    }
});

function cleanGoogleUrl(googleUrl) {
    if (!googleUrl || !googleUrl.includes('?q=')) return googleUrl;
    try {
        const url = new URL(googleUrl);
        return url.searchParams.get('q') || googleUrl;
    } catch (e) {
        return googleUrl;
    }
}

async function searchPricerAPI(query) {
    try {
        const regionalQuery = `${query} australia`;
        console.log(`Calling Pricer API with regional hint: "${regionalQuery}"`);
        const response = await axios.request({
            method: 'GET',
            url: 'https://pricer.p.rapidapi.com/str',
            params: { q: regionalQuery },
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'pricer.p.rapidapi.com' }
        });
        return response.data.map(item => ({
            source: 'Pricer API',
            title: item?.title || 'Title Not Found',
            price: item?.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) : null,
            price_string: item?.price || 'N/A',
            url: cleanGoogleUrl(item?.link),
            image: item?.img || 'https://via.placeholder.com/100',
            store: item?.shop ? item.shop.replace(' from ', '') : 'Seller Not Specified'
        }));
    } catch (err) {
        console.error("Pricer API search failed:", err.message);
        return [];
    }
}


// --- FULLY UPDATED FUNCTION TO HANDLE AMAZON, EBAY, AND GOOGLE ---
async function searchPriceApiCom(query) {
    let allResults = [];
    try {
        const jobsToSubmit = [
            { source: 'amazon', topic: 'product_and_offers', key: 'term', values: query },
            { source: 'ebay', topic: 'search_results', key: 'term', values: query },
            { source: 'google_shopping', topic: 'search_results', key: 'term', values: query }
        ];

        console.log(`Submitting ${jobsToSubmit.length} jobs to PriceAPI.com...`);
        const jobPromises = jobsToSubmit.map(job =>
            axios.post('https://api.priceapi.com/v2/jobs', { token: PRICEAPI_COM_KEY, country: 'au', max_pages: 1, ...job })
            .then(res => ({ ...res.data, source: job.source, topic: job.topic }))
            .catch(err => {
                console.error(`Failed to submit job for source: ${job.source}`, err.response?.data?.message || err.message);
                return null;
            })
        );
        
        const jobResponses = (await Promise.all(jobPromises)).filter(Boolean);
        if (jobResponses.length === 0) return [];
        
        console.log(`Jobs submitted. IDs: ${jobResponses.map(j => j.job_id).join(', ')}. Waiting...`);
        await wait(30000); // Wait for APIs to process

        console.log("Fetching results for completed jobs...");
        const resultPromises = jobResponses.map(job =>
            axios.get(`https://api.priceapi.com/v2/jobs/${job.job_id}/download.json`, { params: { token: PRICEAPI_COM_KEY } })
            .then(res => ({ ...res.data, source: job.source, topic: job.topic }))
            .catch(err => {
                console.error(`Failed to fetch results for job ID ${job.job_id} (${job.source})`, err.response?.data?.message || err.message);
                return null;
            })
        );

        const downloadedResults = (await Promise.all(resultPromises)).filter(Boolean);

        for (const data of downloadedResults) {
            let mapped = [];
            const sourceName = data.source; // 'amazon', 'ebay', or 'google_shopping'
            const topic = data.topic;

            // --- Handler for Amazon's 'product_and_offers' structure ---
            if (sourceName === 'amazon' && topic === 'product_and_offers') {
                const content = data.results?.[0]?.content;
                if (content && content.buybox && content.buybox.min_price) {
                    mapped.push({
                        source: `PriceAPI (Amazon)`,
                        title: content.name || 'Title Not Found',
                        price: parseFloat(content.buybox.min_price),
                        price_string: `$${parseFloat(content.buybox.min_price).toFixed(2)}`,
                        url: content.url || '#',
                        image: content.image_url || 'https://via.placeholder.com/100',
                        store: content.buybox.shop_name || 'Amazon'
                    });
                }
            } 
            // --- Unified handler for eBay and Google Shopping 'search_results' structure ---
            else if (topic === 'search_results') {
                const searchResults = data.results?.[0]?.content?.search_results || [];
                
                mapped = searchResults.map(item => {
                    let price = null;
                    let price_string = 'N/A';
                    const store = item.shop_name || sourceName;

                    // Handles specific "offers" with a direct price (common to both Google and eBay)
                    if (item.type === 'offer' && item.price) {
                        price = parseFloat(item.price_with_shipping) || parseFloat(item.price);
                        price_string = `$${parseFloat(item.price).toFixed(2)}`;
                        const shipping = parseFloat(item.shipping_costs);
                        if (shipping > 0) {
                            price_string += ` + $${shipping.toFixed(2)} ship`;
                        }
                    }
                    // Handles "product" aggregates (Google) or "offer_cluster" (eBay)
                    else if ((item.type === 'product' || item.type === 'offer_cluster') && item.min_price) {
                        price = parseFloat(item.min_price);
                        price_string = `From $${price.toFixed(2)}`;
                    }

                    if (item.name && price !== null) {
                        return {
                            source: `PriceAPI (${sourceName})`,
                            title: item.name,
                            price: price,
                            price_string: price_string,
                            url: item.url || '#',
                            image: item.img_url || 'https://via.placeholder.com/100', // Fallback for eBay
                            store: store
                        };
                    }
                    return null;
                }).filter(Boolean); // Remove any null (invalid) items
            }
            
            const validMapped = mapped.filter(item => item.title && item.price);
            allResults = allResults.concat(validMapped);
        }
        console.log(`Retrieved ${allResults.length} valid results from PriceAPI.com sources.`);
        return allResults;

    } catch (err) {
        console.error("A critical error occurred in the searchPriceApiCom function:", err.message);
        return [];
    }
}


app.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});
