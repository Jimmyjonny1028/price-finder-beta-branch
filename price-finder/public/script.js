// public/script.js (With Improved Image Error Handling)

const searchForm = document.getElementById('search-form');
// ... (rest of the variable declarations are the same)

// ... (handleSearch and other functions are the same) ...

function renderResults(results) {
    resultsContainer.innerHTML = ''; 

    if (results.length === 0) {
        resultsContainer.innerHTML = `<p>No results match the current filter.</p>`;
        return;
    }

    results.forEach(offer => {
        const card = document.createElement('div');
        card.className = 'result-card';
        const isLinkValid = offer.url && offer.url !== '#';
        const linkAttributes = isLinkValid ? `href="${offer.url}" target="_blank" rel="noopener noreferrer"` : `href="#" class="disabled-link"`; 

        // --- NEW: Better onerror handler ---
        // If the server-provided image fails, this replaces it with the same style of placeholder.
        const placeholderUrl = 'https://via.placeholder.com/150/E2E8F0/A0AEC0?text=Image+N/A';
        card.innerHTML = `
            <div class="result-image">
                <img src="${offer.image}" alt="${offer.title}" onerror="this.onerror=null; this.src='${placeholderUrl}';">
            </div>
            <div class="result-info">
                <h3>${offer.title}</h3>
                <p>Sold by: <strong>${offer.store}</strong> <span style="font-size: 12px; color: #999;">(via ${offer.source})</span></p>
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

// Full script.js for completeness
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');
const controlsContainer = document.getElementById('controls-container');
const sortSelect = document.getElementById('sort-select');
const storeFilterSelect = document.getElementById('store-filter-select');
let fullResults = [];
const loadingMessages = [ "Contacting providers...", "Aggregating results...", "Filtering for the best deals...", "Sorting the prices...", "Almost there..." ];
let loadingInterval;
searchForm.addEventListener('submit', handleSearch);
sortSelect.addEventListener('change', applyFiltersAndSort);
storeFilterSelect.addEventListener('change', applyFiltersAndSort);

async function handleSearch(event) { event.preventDefault(); const searchTerm = searchInput.value.trim(); if (!searchTerm) { resultsContainer.innerHTML = '<p>Please enter a product to search for.</p>'; return; } searchButton.disabled = true; controlsContainer.style.display = 'none'; resultsContainer.innerHTML = ''; let messageIndex = 0; loaderText.textContent = loadingMessages[messageIndex]; loader.classList.remove('hidden'); loadingInterval = setInterval(() => { messageIndex = (messageIndex + 1) % loadingMessages.length; loaderText.textContent = loadingMessages[messageIndex]; }, 3000); try { const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || `Server returned an error: ${response.statusText}`); } fullResults = await response.json(); if (fullResults.length === 0) { resultsContainer.innerHTML = `<p>Sorry, no matching offers were found for "${searchTerm}". Please try a different search term.</p>`; } else { populateStoreFilter(); applyFiltersAndSort(); controlsContainer.style.display = 'flex'; } } catch (error) { console.error("Failed to fetch data:", error); resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`; } finally { loader.classList.add('hidden'); searchButton.disabled = false; clearInterval(loadingInterval); } }
function applyFiltersAndSort() { const sortBy = sortSelect.value; const storeFilter = storeFilterSelect.value; let processedResults = [...fullResults]; if (storeFilter !== 'all') { processedResults = processedResults.filter(item => item.store === storeFilter); } if (sortBy === 'price-asc') { processedResults.sort((a, b) => a.price - b.price); } else if (sortBy === 'price-desc') { processedResults.sort((a, b) => b.price - a.price); } renderResults(processedResults); }
function populateStoreFilter() { storeFilterSelect.innerHTML = '<option value="all">All Stores</option>'; const stores = [...new Set(fullResults.map(item => item.store))].sort(); stores.forEach(store => { const option = document.createElement('option'); option.value = store; option.textContent = store; storeFilterSelect.appendChild(option); }); }
