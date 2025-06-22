// server.js (FINAL - With True Job Queue)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 5000;
const server = http.createServer(app);

const searchCache = new Map();
const CACHE_DURATION_MS = 60 * 60 * 1000;
const trafficLog = { totalSearches's IP address.** The "human-like" scraper is not enough. Your IP is being flagged for making too many automated requests.
2.  **Job Spam:** The log `Worker is already busy. Ignoring new job request.` proves that the front-end's polling system is spamming your local worker with the same job over and over because the first job never succeeds.

### The Definitive Solution: A Resilient Job Queue

We will now build the system properly. This is the final architecture.

1.  **The Server (`server.js`) becomes a true Job Manager:**
    *   It will have a **queue** to hold incoming search requests.
    *   It will know if the worker is "busy."
    *   If a search is requested and the worker is free, it sends the job.
    *   If a search is requested and the worker is busy, it **adds the job to the queue** and waits.

2.  **The Local Worker (`local_scraper.js`) becomes a Reliable Scraper:**
    *   It will **abandon Playwright** for connecting to Google.
    *   It will use the **ScraperAPI** free tier. This solves the IP blocking and CAPTCHA problem permanently.
    *   It will process pages **one by one (sequentially)** to respect ScraperAPI's free tier rate limits. This solves the `429` error we saw before.
    *   When it finishes a job, it will **tell the server it's ready for the next one.**

This is the correct, stable, and professional way to build this system. I apologize for not providing it sooner.

---

### Part 1: Your Render Server Project (`price-finder`)

#### The Final `server.js` (The Job Manager)
This is a complete rewrite of the logic. It no longer contains any scraping code.

```javascript
// server.js (FINAL - The Job Queue Manager)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 5000;
const server = http.createServer(app);

const searchCache = new Map();
const CACHE_DURATION_MS = 60 * 60 * 1000;
const trafficLog = { totalSearches: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json({ limit: '5mb' }));
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;
const SERVER_SIDE_SECRET = process.env.SERVER_SIDE_SECRET;

// --- NEW: Job Queue System ---
const jobQueue = [];
let isWorkerBusy = false;
let workerSocket = null;

// =================================================================
// WEBSOCKET SERVER SETUP
// =================================================================
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const secret = req.headers['x-secret'];
    if (secret !== SERVER_SIDE_SECRET) {
        console.log("A client tried to connect with the wrong secret. Closing connection.");
        ws.close();
        return;
    }

    console.log("✅ A trusted worker has connected.");
    workerSocket = ws;
    isWorkerBusy = false; // Worker is ready for a job

    // When the worker connects, check the queue for any pending jobs
    sendNextJob();

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'JOB_COMPLETE') {
                console.log(`Worker has completed job for "${msg.query}". It is now free.`);
                isWorkerBusy = false;
                sendNextJob(); // Check for another job in the queue
            }
        } catch (e) {
            console.error("Error parsing message from worker:", e);
        }
    });

    ws.on('close', () => {
        console.log("❌ The trusted worker has disconnected.");
        workerSocket = null;
        isWorkerBusy = true; // Mark as busy until it reconnects
    });
    ws.on('error', (error) => { console.error("WebSocket error:", error); });
});

function sendNextJob() {
    if (isWorkerBusy || jobQueue.length === 0 || !workerSocket) {
        return; // Do nothing if worker is busy, queue is empty, or no worker is connected
    }

    isWorkerBusy = true;
    const nextQuery = jobQueue.shift(); // Get the next job from the front of the queue
    console.log(`Sending new job "${nextQuery}" to the local worker...`);
    workerSocket.send(JSON.stringify({ type: 'NEW_JOB', query: nextQuery }));
}

// =================================================================
// ALL HELPER FUNCTIONS (No changes needed)
// =================================================================
const ACCESSORY_KEYWORDS = [ 'strap', 'band', 'protector', 'case', 'charger', 'cable', 'stand', 'dock', 'adapter', 'film', 'glass', 'cover', 'guide', 'replacement' ];
const REFURBISHED_KEYWORDS = [ 'refurbished', 'renewed', 'pre-owned', 'preowned', 'used', 'open-box', 'as new' ];
const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); if (REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword))) { return 'Refurbished'; } return 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json({ limit: '5mb' }));
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;
const SERVER_SIDE_SECRET = process.env.SERVER_SIDE_SECRET;

// --- NEW: Job Queue and Worker Status ---
const jobQueue = [];
let workerSocket = null;
let isWorkerBusy = false;

// =================================================================
// WEBSOCKET SERVER - Now much smarter
// =================================================================
const wss = new WebSocketServer({ server });

function triggerNextJob() {
    if (!isWorkerBusy && jobQueue.length > 0 && workerSocket) {
        isWorkerBusy = true;
        const nextQuery = jobQueue.shift(); // Get the next job
        console.log(`Worker is free. Sending new job "${nextQuery}"...`);
        workerSocket.send(JSON.stringify({ type: 'NEW_JOB', query: nextQuery }));
    } else {
        console.log("Worker is busy or queue is empty. No new job sent.");
    }
}

wss.on('connection', (ws, req) => {
    const secret = req.headers['x-secret'];
    if (secret !== SERVER_SIDE_SECRET) { ws.close(); return; }
    console.log("✅ A trusted worker has connected.");
    workerSocket = ws;
    isWorkerBusy = false; // Worker is ready for a job
    triggerNextJob(); // Check if there are any pending jobs

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            // The worker tells us when it's done.
            if (msg.type === 'JOB_COMPLETE') {
                console.log(`Worker has completed job for "${msg.query}".`);
                isWorkerBusy = false;
                triggerNextJob(); // Immediately check for the next job
            }
        } catch (e) { console.error("Error processing message from worker:", e); }
    });

    ws.on('close', () => { console.log("❌ The trusted worker has disconnected."); workerSocket = null; isWorkerBusy = true; });
    ws.on('error', (error) => { console.error("WebSocket error:", error); });
});

// ... (All helper functions like detectItemCondition, etc., are unchanged) ...

// =================================================================
// MAIN ROUTES
// =================================================================
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

    if (workerSocket) {
        // --- NEW: Add to queue instead of sending directly ---
        if (!jobQueue.includes(query)) {
            jobQueue.push(query);
            console.log(`Query "${query}" added to the job queue. Position: ${jobQueue.length}`);
        }
        triggerNextJob(); // Try to start the job immediately
        return res.status(202).json({ message: "Search in progress. Please check back in a moment." });
    } else {
        return res.status(503).json({ error: "Service is temporarily unavailable. The scraper is not connected." });
    }
});

app.post('/submit-results', (req, res) => {
    const { secret, query, results } = req.body;
    if (secret !== SERVER_SIDE_SECRET) { return res.status(403).send('Forbidden'); }
    if (!query || !results) { return res.status(400).send('Bad Request: Missing query or results.'); }

    console.log(`Received ${results.length} results for "${query}" from local worker.`);
    const isAccessorySearch = detectSearchIntent(query);
    let allResults = results.map(item => ({ ...item, price: parseFloat(String(item.price_string || '').replace(/[^0-9.]/g, '')), condition: detectItemCondition(item.title), image: formatImageUrl(item.image) })).filter(item => !isNaN(item.price));
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
    
    searchCache.set(query.toLowerCase(), { results: sortedResults, timestamp: Date.now() });
    console.log(`SUCCESS: Cached ${sortedResults.length} filtered results for "${query}".`);
    res.status(200).send('Results cached successfully.');
});

app.post('/admin/traffic-data', (req, res) => { const { code } = req.body; if (!code || code !== ADMIN_CODE) { return res.status(403).json({ error: 'Forbidden' }); } res.json({ totalSearches: trafficLog.totalSearches, uniqueVisitors: trafficLog.uniqueVisitors.size, searchHistory: trafficLog.searchHistory }); });

server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); if (REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword))) { return 'Refurbished'; } return 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };
