import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../style.css';
import { getCacheEntriesByTabId, saveCacheEntries } from '../utils';

function App() {
  const [uiState, setUiState] = useState('default');
  return (
    <>
      <h1>Stakataka</h1>
      <button
        onClick={async () => {
          try {
            const tabs = await browser.tabs.query({
              active: true,
              currentWindow: true,
            });
            console.log(`Tabs: ${tabs.length}`);
            const tab = tabs[0];
            if (tab) {
              console.log(`Tab id: ${tab.id}`);

              const requestURLOrigin = new URL(tab.url).origin;
              const cacheEntries = await getCacheEntriesByTabId(tab.id);
              if (!Object.keys(cacheEntries).length) {
                setUiState('empty');
                return;
              }

              saveCacheEntries(tab.id, requestURLOrigin, cacheEntries);

              let url = browser.runtime.getURL('/visualizer.html');
              url += `?origin=${requestURLOrigin}`;
              window.open(url, `_${requestURLOrigin}`);
            }
          } catch (error) {
            console.log('Error getting current tab:', error);
            setUiState('error');
          }
        }}
      >
        Visualize Cache Storage
      </button>
      {uiState === 'empty' && <p>No cache entries found for this page.</p>}
      {uiState === 'error' && <p>Unable to get cache entries.</p>}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
