// public/script.js (FINAL - With Polling Logic)

// ... (all variable declarations at the top are the same) ...

async function handleSearch(event) {
    event.preventDefault();
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) { /* ... */ }
    
    // ... (UI reset logic is the same) ...

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);
        
        // --- NEW: Handle the "Search in Progress" response ---
        if (response.status === 202) {
            loaderText.textContent = "Search job sent to worker... checking for results...";
            // Start polling for the result
            pollForResults(searchTerm);
            return; // Exit the function here, the poller will take over
        }

        if (!response.ok) { /* ... */ }
        
        fullResults = await response.json(); // This now only happens for cached results
        
        // ... (rest of the logic is the same) ...
        
    } catch (error) { /* ... */ }
}

// --- NEW: Function to poll the server for results ---
function pollForResults(query, attempt = 1) {
    const maxAttempts = 15; // Poll for a max of ~75 seconds
    const interval = 5000; // Check every 5 seconds

    if (attempt > maxAttempts) {
        loader.classList.add('hidden');
        resultsContainer.innerHTML = `<p class="error">The search took too long to complete. Please try again later.</p>`;
        searchButton.disabled = false;
        clearInterval(loadingInterval);
        return;
    }

    // This makes another /search request, but we expect it to hit the cache this time.
    fetch(`/search?query=${encodeURIComponent(query)}`)
        .then(response => {
            if (response.status === 202) {
                // Not ready yet, poll again
                console.log(`Attempt ${attempt}: Results not ready, checking again in ${interval}ms.`);
                setTimeout(() => pollForResults(query, attempt + 1), interval);
            } else if (response.ok) {
                // SUCCESS! The results are now in the cache.
                response.json().then(results => {
                    console.log("Polling successful. Found results in cache.");
                    loader.classList.add('hidden');
                    searchButton.disabled = false;
                    clearInterval(loadingInterval);
                    fullResults = results;
                    if (fullResults.length === 0) {
                        resultsContainer.innerHTML = `<p>The scraper finished, but found no matching results.</p>`;
                    } else {
                        populateStoreFilter();
                        applyFiltersAndSort();
                        controlsContainer.style.display = 'flex';
                    }
                });
            } else {
                throw new Error("Server returned an error during polling.");
            }
        })
        .catch(error => {
            console.error("Polling failed:", error);
            loader.classList.add('hidden');
            resultsContainer.innerHTML = `<p class="error">An error occurred while checking for results.</p>`;
            searchButton.disabled = false;
            clearInterval(loadingInterval);
        });
}


// ... (The rest of the script.js file remains exactly the same) ...
