// public/script.js (FINAL WORKING VERSION)

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');
const loader = document.getElementById('loader');
const loaderText = document.querySelector('#loader p');

searchForm.addEventListener('submit', handleSearch);

async function handleSearch(event) {
    event.preventDefault();
    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        resultsContainer.innerHTML = '<p>Please enter a product to search for.</p>';
        return;
    }
    
    loaderText.textContent = 'Searching multiple providers... this may take up to 35 seconds.';
    loader.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    try {
        const response = await fetch(`/search?query=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned an error: ${response.statusText}`);
        }
        const results = await response.json();
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `<p>Sorry, no matching offers were found for "${searchTerm}". Please try a different search term.</p>`;
            return;
        }
        
        displayResults(results, searchTerm);
    } catch (error) {
        console.error("Failed to fetch data:", error);
        resultsContainer.innerHTML = `<p class="error">An error occurred: ${error.message}</p>`;
    } finally {
        loader.classList.add('hidden');
    }
}

function displayResults(results, searchTerm) {
    resultsContainer.innerHTML = `<h2>Best Prices for ${searchTerm}</h2>`;

    results.forEach(offer => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const isLinkValid = offer.url && offer.url !== '#';
        const linkAttributes = isLinkValid
            ? `href="${offer.url}" target="_blank" rel="noopener noreferrer"`
            : `href="#" class="disabled-link"`; 

        card.innerHTML = `
            <div class="result-image">
                <img src="${offer.image}" alt="${offer.store}" onerror="this.src='https://via.placeholder.com/100';">
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
