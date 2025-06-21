// public/script.js (With Front-End Filtering & Sorting)

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');

// --- NEW: References for the new controls and a place to store results ---
const controlsContainer = document.getElementById('controls-container');
const sortSelect = document.getElementById('sort-select');
const storeFilterSelect = document.getElementById('store-filter-select');
let fullResults = []; // This will hold the original, complete list from the server.

searchForm.addEventListener('submit', handleSearch);
// --- NEW: Event listeners to trigger re-rendering ---
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
    controlsContainer.style.display = 'none'; // Hide controls during new search
    loaderText.textContent = 'Searching multiple providers... this may take up to 35 seconds.';
    loader.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned an error: ${response.statusText}`);
        }
        
        fullResults = await response.json(); // Store the full list of results
        
        if (fullResults.length === 0) {
            resultsContainer.innerHTML = `<p>Sorry, no matching offers were found for "${searchTerm}". Please try a different search term.</p>`;
        } else {
            populateStoreFilter();      // NEW: Fill the store dropdown
            applyFiltersAndSort();      // NEW: Render the initial view
            controlsContainer.style.display = 'flex'; // Show the controls
        }
        
    } catch (error) {
        console.error("Failed to fetch data:", error);
        resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`;
    } finally {
        loader.classList.add('hidden');
        searchButton.disabled = false;
    }
}

// --- NEW: Master function to handle filtering and sorting ---
function applyFiltersAndSort() {
    const sortBy = sortSelect.value;
    const storeFilter = storeFilterSelect.value;

    let processedResults = [...fullResults]; // Always work with a fresh copy

    // 1. Apply the Store Filter
    if (storeFilter !== 'all') {
        processedResults = processedResults.filter(item => item.store === storeFilter);
    }

    // 2. Apply the Sorting
    if (sortBy === 'price-asc') {
        processedResults.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
        processedResults.sort((a, b) => b.price - a.price);
    }

    renderResults(processedResults, `Best Prices for ${searchInput.value.trim()}`);
}

// --- NEW: Function to dynamically create the store filter options ---
function populateStoreFilter() {
    storeFilterSelect.innerHTML = '<option value="all">All Stores</option>';
    // Get a unique, sorted list of stores from the results
    const stores = [...new Set(fullResults.map(item => item.store))].sort();
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        storeFilterSelect.appendChild(option);
    });
}

// --- MODIFIED: This function now just handles the rendering part ---
function renderResults(results, title) {
    resultsContainer.innerHTML = `<h2>${title}</h2>`;

    if (results.length === 0) {
        resultsContainer.innerHTML += `<p>No results match the current filter.</p>`;
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
