// server.js (FINAL WORKING VERSION - FULLY TARGETING AUSTRALIA)

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

// A helper function to make the server wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// A helper function to smartly filter results based on search keywords
const filterResultsByQuery = (results, query) => {
    const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 1 && isNaN(word));
    if (queryKeywords.length === 0) return results;

    return results.filter(item => {
        const itemTitle = item.title.toLowerCase();
        return queryKeywords.every(keyword => itemTitle.includes(keyword));
    });
};

app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    console.log(`Starting multi-source Australian search for: ${query}`);
    try {
        const [pricerResults, priceApiComResults] = await Promise.all([
            searchPricerAPI(query),
            searchPriceApiCom(query)
        ]);

        const allResults = [...pricerResults, ...priceApiComResults];
        
        console.log(`Received ${allResults.length} initial results. Filtering for accuracy...`);
        const filteredResults = filterResultsByQuery(allResults, query);

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

// --- Pricer API Helper - MODIFIED FOR AUSTRALIA ---
async function searchPricerAPI(query) {
    try {
        // We add "australia" to the query to hint the location
        const regionalQuery = `${query} australia`;
        console.log(`Calling Pricer API with regional query: "${regionalQuery}"`);
        
        const response = await axios.request({
            method: 'GET',
            url: 'https://pricer.p.rapidapi.com/str',
            params: { q: regionalQuery }, // Use the modified query
            headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'pricer.p.rapidapi.com' }
        });

        return response.data.map(item => ({
            source: 'Pricer API (AU Hint)',
            title: item.title || 'Title Not Found',
            price: item.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) : null,
            price_string: item.price || 'N/A',
            url: cleanGoogleUrl(item.link),
            image: item.img || 'https://via.placeholder.com/100',
            store: item.shop ? item.shop.replace(' from ', '') : 'Seller Not Specified'
        }));
    } catch (err) {
        console.error("Pricer API search failed:", err.message);
        return [];
    }
}

// --- PriceAPI.com Helper - SET TO AUSTRALIA ---
async function searchPriceApiCom(query) {
    const sources = ['amazon', 'google_shopping', 'ebay'];
    let allResults = [];

    try {
        console.log(`Submitting jobs for AU sources: ${sources.join(', ')}`);
        const jobPromises = sources.map(source => 
            axios.post('https://api.priceapi.com/v2/jobs', {
                token: PRICEAPI_COM_KEY,
                source: source,
                country: 'au', // Explicitly set to Australia
                topic: 'product_and_offers',
                key: 'term',
                values: query,
                max_pages: 1
            }).then(res => ({...res.data, source}))
            .catch(err => {
                console.error(`Failed to submit job for source: ${source}`, err.response?.data?.message || err.message);
                return null;
            })
        );
        
        const jobResponses = (await Promise.all(jobPromises)).filter(Boolean);
        const jobIds = jobResponses.map(job => job.job_id);

        if (jobIds.length === 0) {
            console.log("No jobs successfully submitted to PriceAPI.com.");
            return [];
        }
        console.log(`Jobs submitted. IDs: ${jobIds.join(', ')}. Waiting for completion...`);

        await wait(30000);

        console.log("Fetching results for completed jobs...");
        const resultPromises = jobResponses.map(job => 
            axios.get(`https://api.priceapi.com/v2/jobs/${job.job_id}/download.json`, {
                params: { token: PRICEAPI_COM_KEY }
            }).then(res => ({...res.data, source: job.source}))
            .catch(err => {
                console.error(`Failed to fetch results for job ID ${job.job_id} (${job.source})`, err.response?.data?.message || err.message);
                return null;
            })
        );

        const downloadedResults = (await Promise.all(resultPromises)).filter(Boolean);

        for (const data of downloadedResults) {
            const products = data.results && data.results[0] ? data.results[0].products || [] : [];
            const mapped = products.map(item => ({
                source: `PriceAPI (${data.source})`,
                title: item.name || 'Title Not Found',
                price: item.price,
                price_string: item.offer?.price_string || (item.price ? `$${item.price.toFixed(2)}` : 'N/A'),
                url: item.url || '#',
                image: item.image || 'https://via.placeholder.com/100',
                store: item.shop?.name || data.source.charAt(0).toUpperCase() + data.source.slice(1)
            }));
            allResults = allResults.concat(mapped);
        }
        console.log(`Retrieved ${allResults.length} results from PriceAPI.com sources.`);
        return allResults;

    } catch (err) {
        console.error("A critical error occurred in the searchPriceApiCom function:", err.message);
        return [];
    }
}

app.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});
