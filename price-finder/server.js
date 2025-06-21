// server.js (Apify Version - No Delays & Clean Labels)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { ApifyClient } = require('apify-client');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.static('public'));

// --- API Keys ---
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

// --- Initialize Apify Client ---
const apifyClient = new ApifyClient({
    token: APIFY_API_TOKEN,
});

// --- Main Search Route ---
app.get('/search', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`Starting hybrid search for: ${query}`);
    try {
        // We will combine results from the eBay API and our Apify Actors
        const [ebayResults, apifyResults] = await Promise.all([
            searchEbayAPI(query),
            searchApify(query)
        ]);

        const allResults = [...ebayResults, ...apifyResults];
        console.log(`Received ${allResults.length} total results.`);

        // ... (Filtering and sorting logic can be added back here if needed)
        const validResults = allResults.filter(item => item.title && item.price && !isNaN(item.price));
        console.log(`Found ${validResults.length} valid, sorted offers.`);
        const sortedResults = validResults.sort((a, b) => a.price - b.price);

        res.json(sortedResults);

    } catch (error) {
        console.error("Error in the main search handler:", error);
        res.status(500).json({ error: 'Failed to fetch data from APIs' });
    }
});


// --- Apify function using ONLY Free-Tier-Compatible Actors ---
async function searchApify(query) {
    console.log("Starting Apify searches (Google & Amazon)...");

    // Inputs for the free-tier compatible Actors
    const googleShoppingInput = { queries: query, countryCode: 'au', maxResults: 15 };
    const amazonInput = {
        keywords: [query],
        country: 'AU',
        max_results: 15,
        category: 'ALL'
    };

    try {
        // Run the Apify Actors in parallel
        console.log("Submitting Apify jobs in parallel...");
        const [googleRun, amazonRun] = await Promise.all([
            apifyClient.actor("apify/google-shopping-scraper").call(googleShoppingInput),
            apifyClient.actor("natours/amazon-scraper").call(amazonInput)
        ]);

        console.log("Apify jobs submitted. Fetching results...");

        // Fetch results from both datasets in parallel
        const [googleDataset, amazonDataset] = await Promise.all([
             apifyClient.dataset(googleRun.defaultDatasetId).listItems(),
             apifyClient.dataset(amazonRun.defaultDatasetId).listItems()
        ]);

        const googleItems = googleDataset.items;
        const amazonItems = amazonDataset.items;

        // --- Map results to our standard format with CLEAN labels ---
        const googleResults = googleItems.flatMap(r => r.results || []).map(item => ({
            source: 'Google', // MODIFIED
            title: item.title,
            price: item.price,
            price_string: item.priceString,
            url: item.url,
            image: item.thumbnail,
            store: item.merchant?.name || 'Google Shopping'
        }));

        const amazonResults = amazonItems.map(item => ({
            source: 'Amazon', // MODIFIED
            title: item.title,
            price: item.price,
            price_string: item.price_string || (item.price ? `$${item.price}` : 'N/A'),
            url: item.url,
            image: item.image,
            store: 'Amazon'
        }));

        const allApifyResults = [...googleResults, ...amazonResults];
        console.log(`Retrieved ${allApifyResults.length} valid results from Apify.`);

        return allApifyResults;
    } catch (error) {
        console.error("An error occurred during Apify operations:", error);
        return []; // Return empty array on failure
    }
}


// --- TODO: Your function for the official eBay API ---
async function searchEbayAPI(query) {
    console.log("Searching eBay via official API...");
    // This is where you would implement the OAuth flow and call the eBay Browse API.
    // When you map the results, be sure to set the source label correctly.
    // Example:
    // return mappedEbayResults.map(item => ({
    //     ...item,
    //     source: 'eBay' // MODIFIED
    // }));
    return [];
}


app.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});
