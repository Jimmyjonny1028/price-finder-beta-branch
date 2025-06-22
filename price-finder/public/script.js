// public/script.js (FINAL - All Features with Updated Loading Messages)

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');

// --- References for all UI controls ---
const controlsContainer = document.getElementById('controls-container');
const sortSelect = document.getElementById('sort-select');
const storeFilterSelect = document.getElementById('store-filter-select');
const conditionFilterSelect = document.getElementById('condition-filter-select');

let fullResults = []; // This will hold the results from a successful search.
let loadingInterval;  // This will manage the loading text animation.

// --- UPDATED: User-friendly loading messages ---
const loadingMessages = [
    "Sending request to your personal scraper...",
    "Searching Google Shopping & eBay...",
    "Checking Amazon Australia...",
    "Scanning other major retailers...",
    "Compiling all the deals...",
    "This may take a moment...",
    "Almost finished..."
];

// --- Event Listeners ---
searchForm.addEventListener('submit', handleSearch);
sortSelect.addEventListener('change', applyFiltersAndSort);
storeFilterSelect.addEventListener('change', applyFiltersAndSort);
conditionFilterSelect.addEventListener('change', applyFiltersAndSort);

// =================================================================
// Main Search and Polling Logic
// =================================================================

async function handleSearch(event) {
    event.preventDefault();
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        resultsContainer.innerHTML = '<p>Please enter a product to search for.</p>';
        return;
    }
    
    // Reset the UI for a new search
    searchButton.disabled = true;
    controlsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
    
    // Start the loading animation with dynamic messages
    let messageIndex = 0;
    loaderText.textContent = loadingMessages[messageIndex];
    loader.classList.remove('hidden');
    loader.classList.remove('polling'); // Ensure polling class is removed initially
    loadingInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        loaderText.textContent = loadingMessages[messageIndex];
    }, 5000); // Cycle messages every 5 seconds

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);

        // Case 1: The job was sent to your PC worker. We need to start polling.
        if (response.status === 202) {
            loader.classList.add('polling'); // Add class to prevent hiding the loader
            loaderText.textContent = "Job sent. Checking for results...";
            pollForResults(searchTerm); // This function will now take over.
            return; 
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned an error: ${response.statusText}`);
        }
        
        // Case 2: The results were already in the cache. We can display them instantly.
        const results = await response.json();
        
        if (results.length > 0) {
            fullResults = results;
            populateAndShowControls();
            applyFiltersAndSort();
        } else {
            // This happens if the cache is empty but no worker is connected.
            resultsContainer.innerHTML = `<p>No cached results found. Please ensure your local scraper is running and try again.</p>`;
        }
        
    } catch (error) {
        console.error("Failed to fetch data:", error);
        resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`;
    } finally {
        // Only hide the loader if we are not in a polling state.
        if (!loader.classList.contains('polling')) {
             searchButton.disabled = false;
             loader.classList.add('hidden');
             clearInterval(loadingInterval);
        }
    }
}

function pollForResults(query, attempt = 1) {
    const maxAttempts = 60; // Poll for up to 5 minutes (60 attempts * 5 seconds)
    const interval = 5000;

    if (attempt > maxAttempts) {
        loader.classList.remove('polling');
        loader.classList.add('hidden');
        resultsContainer.innerHTML = `<p class="error">The search took too long to complete. Please check your local scraper and try again.</p>`;
        searchButton.disabled = false;
        clearInterval(loadingInterval);
        return;
    }

    // Repeatedly call the /search endpoint, hoping for a cache hit.
    fetch(`/search?query=${encodeURIComponent(query)}`)
        .then(res => {
            if (res.status === 202) {
                console.log(`Attempt ${attempt}: Results not ready, checking again in ${interval}ms.`);
                setTimeout(() => pollForResults(query, attempt + 1), interval);
                return null;
            }
            if (res.ok) {
                return res.json();
            }
            throw new Error('Server returned an error during polling.');
        })
        .then(results => {
            if (results) { // This block only runs on a successful cache hit.
                console.log("Polling successful. Found results in cache.");
                loader.classList.remove('polling');
                loader.classList.add('hidden');
                searchButton.disabled = false;
                clearInterval(loadingInterval);
                fullResults = results;

                if (fullResults.length === 0) {
                    resultsContainer.innerHTML = `<p>Your scraper finished, but found no matching results for "${query}".</p>`;
                } else {
                    populateAndShowControls();
                    applyFiltersAndSort();
                }
            }
        })
        .catch(error => {
            console.error("Polling failed:", error);
            loader.classList.remove('polling');
            loader.classList.add('hidden');
            resultsContainer.innerHTML = `<p class="error">An error occurred while checking for results.</p>`;
            searchButton.disabled = false;
            clearInterval(loadingInterval);
        });
}

// =================================================================
// UI Rendering and Filtering Logic
// =================================================================

function applyFiltersAndSort() {
    const sortBy = sortSelect.value;
    const storeFilter = storeFilterSelect.value;
    const conditionFilter = conditionFilterSelect.value;
    let processedResults = [...fullResults];

    if (conditionFilter === 'new') {
        processedResults = processedResults.filter(item => item.condition === 'New');
    } else if (conditionFilter === 'refurbished') {
        processedResults = processedResults.filter(item => item.condition === 'Refurbished');
    }
    if (storeFilter !== 'all') {
        processedResults = processedResults.filter(item => item.store === storeFilter);
    }
    if (sortBy === 'price-asc') {
        processedResults.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
        processedResults.sort((a, b) => b.price - a.price);
    }
    renderResults(processedResults);
}

function populateAndShowControls() {
    // Reset filters to their default state
    sortSelect.value = 'price-asc';
    storeFilterSelect.innerHTML = '<option value="all">All Stores</option>';
    conditionFilterSelect.value = 'all';

    // Get a unique, sorted list of stores from the results
    const stores = [...new Set(fullResults.map(item => item.store))].sort();
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        storeFilterSelect.appendChild(option);
    });
    
    // Make the controls visible
    controlsContainer.style.display = 'flex';
}

function renderResults(results) {
    resultsContainer.innerHTML = `<h2>Best Prices for ${searchInput.value.trim()}</h2>`;
    if (results.length === 0) {
        resultsContainer.innerHTML += `<p>No results match the current filters.</p>`;
        return;
    }
    results.forEach(offer => {
        const card = document.createElement('div');
        card.className = 'result-card';
        const isLinkValid = offer.url && offer.url !== '#';
        const linkAttributes = isLinkValid ? `href="${offer.url}" target="_blank" rel="noopener noreferrer"` : `href="#" class="disabled-link"`; 
        const conditionBadge = offer.condition === 'Refurbished' ? `<span class="condition-badge">Refurbished</span>` : '';
        card.innerHTML = `
            <div class="result-image">
                <img src="${offer.image}" alt="${offer.title}" onerror="this.style.display='none';">
            </div>
            <div class="result-info">
                <h3>${offer.title}</h3>
                <p>Sold by: <strong>${offer.store}</strong> ${conditionBadge}</p>
            </div>
            <div class="result-price">
                <a ${linkAttributes}>
                    ${offer.price_string}
                </a>
            </div>
        `;
        resultsContainer.appendChild(card);
    });
}

// =================================================================
// ADMIN PANEL LOGIC
// =================================================================
const adminButton = document.getElementById('admin-button');
const adminPanel = document.getElementById('admin-panel');
const closeAdminPanel = document.getElementById('close-admin-panel');
const totalSearchesEl = document.getElementById('total-searches');
const uniqueVisitorsEl = document.getElementById('unique-visitors');
const searchHistoryListEl = document.getElementById('search-history-list');
adminButton.addEventListener('click', () => { const code = prompt("Please enter the admin code:"); if (code) { fetchAdminData(code); } });
closeAdminPanel.addEventListener('click', () => { adminPanel.style.display = 'none'; });
adminPanel.addEventListener('click', (event) => { if (event.target === adminPanel) { adminPanel.style.display = 'none'; } });
async function fetchAdminData(code) { try { const response = await fetch('/admin/traffic-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }), }); if (!response.ok) { alert('Incorrect code.'); return; } const data = await response.json(); totalSearchesEl.textContent = data.totalSearches; uniqueVisitorsEl.textContent = data.uniqueVisitors; searchHistoryListEl.innerHTML = ''; if(data.searchHistory.length > 0) { data.searchHistory.forEach(item => { const li = document.createElement('li'); const timestamp = new Date(item.timestamp).toLocaleString(); li.textContent = `"${item.query}" at ${timestamp}`; searchHistoryListEl.appendChild(li); }); } else { searchHistoryListEl.innerHTML = '<li>No searches recorded yet.</li>'; } adminPanel.style.display = 'flex'; } catch (error) { console.error("Error fetching admin data:", error); alert("An error occurred while fetching stats."); } }
