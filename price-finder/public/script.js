// public/script.js (FINAL - All Features Implemented)

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');

const controlsContainer = document.getElementById('controls-container');
const sortSelect = document.getElementById('sort-select');
const storeFilterSelect = document.getElementById('store-filter-select');
const conditionFilterSelect = document.getElementById('condition-filter-select');

let fullResults = [];
let loadingInterval;
const loadingMessages = [ "Contacting providers...", "Aggregating results...", "Filtering for the best deals...", "Sorting the prices...", "Almost there..." ];

searchForm.addEventListener('submit', handleSearch);
sortSelect.addEventListener('change', applyFiltersAndSort);
storeFilterSelect.addEventListener('change', applyFiltersAndSort);
conditionFilterSelect.addEventListener('change', applyFiltersAndSort);

async function handleSearch(event) {
    event.preventDefault();
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        resultsContainer.innerHTML = '<p>Please enter a product to search for.</p>';
        return;
    }
    
    searchButton.disabled = true;
    controlsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
    
    let messageIndex = 0;
    loaderText.textContent = loadingMessages[messageIndex];
    loader.classList.remove('hidden');
    loadingInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        loaderText.textContent = loadingMessages[messageIndex];
    }, 4000);

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned an error: ${response.statusText}`);
        }
        
        fullResults = await response.json();
        
        if (fullResults.length === 0) {
            resultsContainer.innerHTML = `<p>Sorry, no matching offers were found for "${searchTerm}". Please try a different search term.</p>`;
        } else {
            // Reset filters to default before showing results
            sortSelect.value = 'price-asc';
            storeFilterSelect.innerHTML = '<option value="all">All Stores</option>';
            conditionFilterSelect.value = 'all';

            populateStoreFilter();
            applyFiltersAndSort();
            controlsContainer.style.display = 'flex';
        }
        
    } catch (error) {
        console.error("Failed to fetch data:", error);
        resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`;
    } finally {
        loader.classList.add('hidden');
        searchButton.disabled = false;
        clearInterval(loadingInterval);
    }
}

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

function populateStoreFilter() {
    const stores = [...new Set(fullResults.map(item => item.store))].sort();
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        storeFilterSelect.appendChild(option);
    });
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
        
        const conditionBadge = offer.condition === 'Refurbished' 
            ? `<span class="condition-badge">Refurbished</span>` 
            : '';

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

// --- Admin Panel Logic ---
const adminButton = document.getElementById('admin-button');
const adminPanel = document.getElementById('admin-panel');
const closeAdminPanel = document.getElementById('close-admin-panel');
const totalSearchesEl = document.getElementById('total-searches');
const uniqueVisitorsEl = document.getElementById('unique-visitors');
const searchHistoryListEl = document.getElementById('search-history-list');

adminButton.addEventListener('click', () => { const code = prompt("Please enter the admin code:"); if (code) { fetchAdminData(code); } });
closeAdminPanel.addEventListener('click', () => { adminPanel.style.display = 'none'; });
adminPanel.addEventListener('click', (event) => { if (event.target === adminPanel) { adminPanel.style.display = 'none'; } });

async function fetchAdminData(code) {
    try {
        const response = await fetch('/admin/traffic-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code }),
        });
        if (!response.ok) { alert('Incorrect code.'); return; }
        const data = await response.json();
        totalSearchesEl.textContent = data.totalSearches;
        uniqueVisitorsEl.textContent = data.uniqueVisitors;
        searchHistoryListEl.innerHTML = '';
        if(data.searchHistory.length > 0) {
            data.searchHistory.forEach(item => {
                const li = document.createElement('li');
                const timestamp = new Date(item.timestamp).toLocaleString();
                li.textContent = `"${item.query}" at ${timestamp}`;
                searchHistoryListEl.appendChild(li);
            });
        } else {
            searchHistoryListEl.innerHTML = '<li>No searches recorded yet.</li>';
        }
        adminPanel.style.display = 'flex';
    } catch (error) {
        console.error("Error fetching admin data:", error);
        alert("An error occurred while fetching stats.");
    }
}
