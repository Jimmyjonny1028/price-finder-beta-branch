// public/script.js (With All 3 New Features)

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');

// --- FEATURE 1: State management ---
const controlsContainer = document.getElementById('controls-container');
const sortSelect = document.getElementById('sort-select');
const storeFilterSelect = document.getElementById('store-filter-select');
let fullResults = []; // This will hold the original, complete list from the server.

// --- FEATURE 3: Loading messages ---
const loadingMessages = [
    "Contacting providers...",
    "Aggregating results...",
    "Filtering for the best deals...",
    "Sorting the prices...",
    "Almost there..."
];
let loadingInterval;

searchForm.addEventListener('submit', handleSearch);
sortSelect.addEventListener('change', applyFiltersAndSort);
storeFilterSelect.addEventListener('change', applyFiltersAndSort);

async function handleSearch(event) {
    event.preventDefault();
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        resultsContainer.innerHTML = '<p>Please enter a product to search for.</p>';
        return;
    }

    searchButton.disabled = true;
    controlsContainer.style.display = 'none'; // Hide controls during search
    resultsContainer.innerHTML = '';
    
    // --- FEATURE 3: Start dynamic loading text ---
    let messageIndex = 0;
    loaderText.textContent = loadingMessages[messageIndex];
    loader.classList.remove('hidden');
    loadingInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        loaderText.textContent = loadingMessages[messageIndex];
    }, 3000);

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned an error: ${response.statusText}`);
        }
        
        fullResults = await response.json(); // Store full results
        
        if (fullResults.length === 0) {
            resultsContainer.innerHTML = `<p>Sorry, no matching offers were found for "${searchTerm}". Please try a different search term.</p>`;
        } else {
            populateStoreFilter();
            applyFiltersAndSort(); // Initial render with default sorting
            controlsContainer.style.display = 'flex'; // Show controls
        }
        
    } catch (error) {
        console.error("Failed to fetch data:", error);
        resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`;
    } finally {
        loader.classList.add('hidden');
        searchButton.disabled = false;
        clearInterval(loadingInterval); // Stop the loading messages
    }
}

function applyFiltersAndSort() {
    const sortBy = sortSelect.value;
    const storeFilter = storeFilterSelect.value;

    let processedResults = [...fullResults]; // Work with a copy

    // 1. Apply Store Filter
    if (storeFilter !== 'all') {
        processedResults = processedResults.filter(item => item.store === storeFilter);
    }

    // 2. Apply Sorting
    if (sortBy === 'price-asc') {
        processedResults.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
        processedResults.sort((a, b) => b.price - a.price);
    }

    renderResults(processedResults);
}

function populateStoreFilter() {
    // Reset the filter first
    storeFilterSelect.innerHTML = '<option value="all">All Stores</option>';
    const stores = [...new Set(fullResults.map(item => item.store))].sort();
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        storeFilterSelect.appendChild(option);
    });
}

function renderResults(results) {
    resultsContainer.innerHTML = ''; // Clear previous results

    if (results.length === 0) {
        resultsContainer.innerHTML = `<p>No results match the current filter.</p>`;
        return;
    }

    results.forEach(offer => {
        const card = document.createElement('div');
        card.className = 'result-card';
        const isLinkValid = offer.url && offer.url !== '#';
        const linkAttributes = isLinkValid ? `href="${offer.url}" target="_blank" rel="noopener noreferrer"` : `href="#" class="disabled-link"`; 

        card.innerHTML = `
            <div class="result-image">
                <img src="${offer.image}" alt="${offer.title}" onerror="this.style.display='none';">
            </div>
            <div class="result-info">
                <h3>${offer.title}</h3>
                <p>Sold by: <strong>${offer.store}</strong></p>
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
