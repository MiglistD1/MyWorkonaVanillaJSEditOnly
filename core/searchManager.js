import { 
    setSearchQuery
} from './storage.js';

export function initSearchManager(callbacks) {
    const { onRender } = callbacks;

    // 1. Quick Search Input
    const searchInput = document.getElementById('quick-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            setSearchQuery(e.target.value.toLowerCase().trim());
            onRender();
        });
    }
}
