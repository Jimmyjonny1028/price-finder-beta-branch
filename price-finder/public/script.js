// public/script.js (FINAL - With Correct Polling Logic)

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');

// --- No filter controls in this simple, stable version ---

searchForm.addEventListener('submit', handleSearch);

async function handleSearch(event) {
    event.preventDefault();
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        resultsContainer.innerHTML = '<p>Please enter a product to search for.</p>';
        return;
    }
    
    searchButton.disabled = true;
    resultsContainer.innerHTML = '';
    loaderText.textContent = "Checking for cached results...";
    loader.classList.remove('hidden');

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);

        // Case 1: Search job was sent to the worker, now we must poll.
        if (response.status === 202) {
            loaderText.textContent = "Job sent to your PC. Checking for results...";
            pollForResults(searchTerm); // Start polling
            return; // Exit, the poller will handle the rest
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned an error: ${response.statusText}`);
        }
        
        const results = await response.json();
        
        // Case 2: Results were found in the cache instantly.
        if (results.length > 0) {
            displayResults(results, searchTerm);
        } else {
            resultsContainer.innerHTML = `<p>No results found. Your worker may be offline or the search produced no results.</p>`;
        }
        
    } catch (error) {
        console.error("Failed to fetch data:", error);
        resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`;
    } finally {
        // Only hide the loader if we are not polling. The poller will hide it.
        if (!loader.classList.contains('polling')) {
             searchButton.disabled = false;
             loader.classList.add('hidden');
        }
    }
}

function pollForResults(query, attempt = 1) {
    const maxAttempts = 20; // Poll for up to 100 seconds
    const interval = 5000;  // Check every 5 seconds

    loader.classList.add('polling'); // Mark that we are in a polling state

    if (attempt > maxAttempts) {
        loader.classList.remove('polling');
        loader.classList.add('hidden');
        resultsContainer.innerHTML = `<p class="error">The search took too long to complete. Please check your local scraper and try again.</p>`;
        searchButton.disabled = false;
        return;
    }

    // This makes another /search request, but we expect it to hit the cache this time.
    fetch(`/search?query=${encodeURIComponent(query)}`)
        .then(res => {
            // If we get a 200 OK, it means the results are in the cache!
            if (res.ok && res.status !== 202) {
                return res.json();
            }
            // If we get 202 again, it's not ready yet.
            if (res.status === 202) {
                console.log(`Attempt ${attempt}: Results not ready, checking again in ${interval}ms.`);
                setTimeout(() => pollForResults(query, attempt + 1), interval);
                return null; // Stop this promise chain
            }
            // If we get any other error, something went wrong.
            throw new Error('Server returned an error during polling.');
        })
        .then(results => {
            if (results) { // This block only runs if we got results
                console.log("Polling successful. Found results in cache.");
                loader.classList.remove('polling');
                loader.classList.add('hidden');
                searchButton.disabled = false;

                if (results.length === 0) {
                    resultsContainer.innerHTML = `<p>Your scraper finished, but found no matching results for "${query}".</p>`;
                } else {
                    displayResults(results, query);
                }
            }
        })
        .catch(error => {
            console.error("Polling failed:", error);
            loader.classList.remove('polling');
            loader.classList.add('hidden');
            resultsContainer.innerHTML = `<p class="error">An error occurred while checking for results.</p>`;
            searchButton.disabled = false;
        });
}

function displayResults(results, searchTerm) {
    resultsContainer.innerHTML = `<h2>Best Prices for ${searchTerm}</h2>`;

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

// --- Admin Panel Logic (no changes needed) ---
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
