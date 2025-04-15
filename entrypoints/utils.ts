export async function getCacheEntriesByTabId(tabId: number) {
  const res = await browser.scripting.executeScript({
    target: { tabId: tabId },
    func: async () => {
      try {
        const cacheNames = await caches.keys();
        const allCached = {};
        const allRequests = {};
        const allResponses = {};

        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName);

          // Get requests
          const requests = await cache.keys();
          allRequests[cacheName] = requests;

          // Get responses
          const responses = await cache.matchAll();
          allResponses[cacheName] = responses;

          for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            const clonedResponse = response.clone();
            const headers = {};
            clonedResponse.headers.forEach((v, k) => (headers[k] = v));

            const body = await clonedResponse.arrayBuffer();

            const url = clonedResponse.url || allRequests[cacheName]?.[i]?.url;

            allCached[cacheName] = allCached[cacheName] || [];
            allCached[cacheName].push({
              url,
              headers,
              // body,
              bodySize: body.byteLength,
              redirected: clonedResponse.redirected,
              status: clonedResponse.status,
              type: clonedResponse.type,
            });
          }
        }

        console.log('All cached:', allCached, allRequests, allResponses);

        return allCached;
      } catch (error) {
        console.error('Error getting cache entries:', error);
      }
    },
  });
  const cacheEntries = res[0].result;
  return cacheEntries;
}

export function saveCacheEntries(
  tabId: number,
  requestURLOrigin: string,
  cacheEntries: any,
) {
  sessionStorage.setItem(
    `cache-${requestURLOrigin}`,
    JSON.stringify({
      tabId,
      requestURLOrigin,
      cacheEntries,
    }),
  );
}

export default defineUnlistedScript(() => {});
