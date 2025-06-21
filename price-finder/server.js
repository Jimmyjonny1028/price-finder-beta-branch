// server.js (FINAL - Scaled to 30 Pages)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { chromium } = require('playwright');
const cheerio =require('cheerio');

const app = express();
const PORT = 5000;

// Increased cache duration for the longer scrapes
const searchCache = new Map();
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const trafficLog = { totalSearches: 0, uniqueVisitors: new Set(), searchHistory: [] };
const MAX_HISTORY = 50;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const ADMIN_CODE = process.env.ADMIN_CODE;

// --- All helper functions are unchanged ---
const ACCESSORY_KEYWORDS = [ 'strap', 'band', 'protector', 'case', 'charger', 'cable', 'stand', 'dock', 'adapter', 'film', 'glass', 'cover', 'guide', 'replacement' ];
const REFURBISHED_KEYWORDS = [ 'refurbished', 'renewed', 'pre-owned', 'preowned', 'used', 'open-box', 'as new' ];
const detectItemCondition = (title) => { /* ... */ };
function formatImageUrl(url) { /* ... */ }
const filterForIrrelevantAccessories = (results) => { /* ... */ };
const filterForMainDevice = (results) => { /* ... */ };
const filterByPriceAnomalies = (results) => { /* ... */ };
const filterResultsByQuery = (results, query) => { /* ... */ };
const detectSearchIntent = (query) => { /* ... */ };

// --- The scraper for a single page is unchanged ---
async function scrapeSingleGooglePage(url, browser) { /* ... */ }

// --- The master scraper function is updated ---
async function scrapeGoogleBroadSearch(query) {
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        const searchPromises = [];
        const fullQuery = `buy ${query}`;

        console.log("Generating URLs for 30 pages...");
        // --- THE CHANGE IS HERE: Loop now runs 30 times ---
        for (let i = 0; i < 30; i++) {
            const start = i * 10;
            const searchUrl = `https://www.google.com.au/search?q=${encodeURIComponent(fullQuery)}&start=${start}&gl=au&hl=en`;
            searchPromises.push(scrapeSingleGooglePage(searchUrl, browser));
        }

        console.log("Scraping all 30 pages in parallel...");
        const allPageResults = await Promise.all(searchPromises);
        
        return allPageResults.flat();
    } catch (error) {
        console.error("The main scraping process failed:", error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

// --- The main /search route and all other routes are unchanged ---
app.get('/search', async (req, res) => { /* ... */ });
app.post('/admin/traffic-data', (req, res) => { /* ... */ });
app.listen(PORT, () => console.log(`Server is running! Open your browser to http://localhost:${PORT}`));


// --- Full definitions for all unchanged functions ---
const detectItemCondition = (title) => { const lowerCaseTitle = title.toLowerCase(); if (REFURBISHED_KEYWORDS.some(keyword => lowerCaseTitle.includes(keyword))) { return 'Refurbished'; } return 'New'; };
function formatImageUrl(url) { const placeholder = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A'; if (!url || typeof url !== 'string') return placeholder; if (url.startsWith('//')) return `https:${url}`; if (!url.startsWith('http')) return placeholder; return url; }
const filterForIrrelevantAccessories = (results) => { return results.filter(item => !ACCESSORY_KEYWORDS.some(keyword => item.title.toLowerCase().includes(keyword))); };
const filterForMainDevice = (results) => { const negativePhrases = ['for ', 'compatible with', 'fits ']; return results.filter(item => !negativePhrases.some(phrase => item.title.toLowerCase().includes(phrase))); };
const filterByPriceAnomalies = (results) => { if (results.length < 5) return results; const prices = results.map(r => r.price).sort((a, b) => a - b); const mid = Math.floor(prices.length / 2); const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2; const priceThreshold = medianPrice * 0.20; console.log(`Median price is $${medianPrice.toFixed(2)}. Filtering out items cheaper than $${priceThreshold.toFixed(2)}.`); return results.filter(item => item.price >= priceThreshold); };
const filterResultsByQuery = (results, query) => { const queryKeywords = query.toLowerCase().split(' ').filter(word => word.length > 0); if (queryKeywords.length === 0) return results; return results.filter(item => { const itemTitle = item.title.toLowerCase(); return queryKeywords.every(keyword => itemTitle.includes(keyword)); }); };
const detectSearchIntent = (query) => { const queryLower = query.toLowerCase(); return ACCESSORY_KEYWORDS.some(keyword => queryLower.includes(keyword)); };
async function scrapeSingleGooglePage(url, browser) { let page; try { page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36', locale: 'en-AU' }); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForSelector('#search', { timeout: 10000 }); const html = await page.content(); const $ = cheerio.load(html); const results = []; $('div.g').each((i, el) => { const resultText = $(el).text(); if (resultText.includes('$')) { const title = $(el).find('h3').text(); const link = $(el).find('a').attr('href'); const store = $(el).find('cite').text().split(' ')[0] || 'Unknown Store'; const priceMatch = resultText.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/); const priceString = priceMatch ? priceMatch[0] : null; if (title && link && priceString) { results.push({ title, price_string: priceString, store: new URL(link).hostname.replace('www.', ''), url: link, }); } } }); return results; } catch (error) { console.error(`Failed to scrape page ${url}: ${error.message}`); return []; } finally { if (page) await page.close(); } }
app.get('/search', async (req, res) => { const { query } = req.query; if (!query) return res.status(400).json({ error: 'Search query is required' }); try { const visitorIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress; trafficLog.totalSearches++; trafficLog.uniqueVisitors.add(visitorIp); trafficLog.searchHistory.unshift({ query: query, timestamp: new Date().toISOString() }); if (trafficLog.searchHistory.length > MAX_HISTORY) { trafficLog.searchHistory.splice(MAX_HISTORY); } } catch (e) { console.error("Error logging traffic:", e); } const cacheKey = query.toLowerCase(); if (searchCache.has(cacheKey)) { const cachedData = searchCache.get(cacheKey); if (Date.now() - cachedData.timestamp < CACHE_DURATION_MS) { console.log(`Serving results for "${query}" from CACHE!`); return res.json(cachedData.results); } } console.log(`Starting 10-page broad scrape for: ${query}`); const isAccessorySearch = detectSearchIntent(query); console.log(`Search Intent Detected: ${isAccessorySearch ? 'ACCESSORY' : 'MAIN PRODUCT'}`); try { let rawResults = await scrapeGoogleBroadSearch(query); let allResults = rawResults.map(item => ({ ...item, price: parseFloat(item.price_string.replace(/[^0-9.]/g, '')), condition: detectItemCondition(item.title), image: formatImageUrl(null) })).filter(item => !isNaN(item.price)); console.log(`Scraped ${allResults.length} initial valid results.`); let finalFilteredResults; if (isAccessorySearch) { finalFilteredResults = filterResultsByQuery(allResults, query); } else { const accessoryFiltered = filterForIrrelevantAccessories(allResults); const mainDeviceFiltered = filterForMainDevice(accessoryFiltered); const queryFiltered = filterResultsByQuery(mainDeviceFiltered, query); finalFilteredResults = filterByPriceAnomalies(queryFiltered); } console.log(`Kept ${finalFilteredResults.length} final results after all filtering.`); const sortedResults = finalFilteredResults.sort((a, b) => a.price - b.price); searchCache.set(cacheKey, { results: sortedResults, timestamp: Date.now() }); res.json(sortedResults); } catch (error) { console.error("Error in the main search handler:", error); res.status(500).json({ error: 'Failed to fetch data from APIs' }); } });
app.post('/admin/traffic-data', (req, res) => { const { code } = req.body; if (!code || code !== ADMIN_CODE) { return res.status(403).json({ error: 'Forbidden' }); } res.json({ totalSearches: trafficLog.totalSearches, uniqueVisitors: trafficLog.uniqueVisitors.size, searchHistory: trafficLog.searchHistory }); });
