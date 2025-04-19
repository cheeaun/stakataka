import { useEffect, useState, useRef, useReducer } from 'react';
import ReactDOM from 'react-dom/client';
import DataTable from 'react-data-table-component';
import prettyBytes from 'pretty-bytes';
import webtreemap from './webtreemap.js';
import Sunburst from 'react-sunburst-chart';
import { getCacheEntriesByTabId, saveCacheEntries } from '../utils';

import '../style.css';

const pb = (b) =>
  prettyBytes(b, {
    locale: true,
    space: false,
  });

function useSystemColorScheme() {
  const [scheme, setScheme] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setScheme(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return scheme;
}

function populateSize(n) {
  if (n.children) {
    for (const c of n.children) {
      populateSize(c);
    }
  }
  if (n.size) n.id = `${n.id} - ${pb(n.size)}`;
}

function formatTreeMapData(data, { sizeInID = false } = {}) {
  const { requestURLOrigin, cacheEntries } = data;
  const totalBytes = Object.values(cacheEntries).reduce(
    (acc, val) => acc + val.reduce((acc, item) => acc + item.bodySize, 0),
    0,
  );

  const children = Object.entries(cacheEntries).map(([key, entry]) => {
    const entrySize = entry.reduce((acc, item) => acc + item.bodySize, 0);

    const tree = entry.map((item) => {
      return [
        item.url.replace(new RegExp(`^${requestURLOrigin}`), ''),
        item.bodySize,
      ];
    });
    const treeData = webtreemap.treeify(tree);
    webtreemap.rollup(treeData);
    if (sizeInID) populateSize(treeData);
    webtreemap.sort(treeData);
    console.log('treeData', treeData.children[0].children);

    return {
      id: sizeInID ? `${key} - ${pb(entrySize)}` : key,
      size: entrySize,
      children: treeData.children[0].children,
      // children: entry.map((item) => {
      //   return {
      //     id: item.url.replace(new RegExp(`^${requestURLOrigin}`), ''),
      //     size: item.bodySize,
      //   };
      // }),
    };
  });
  children.sort((a, b) => b.size - a.size);

  return {
    id: requestURLOrigin,
    name: requestURLOrigin,
    size: totalBytes,
    children,
  };
}

const App = () => {
  const [uiState, setUiState] = useState('loading');
  const [data, setData] = useState<any[]>([]);

  const [view, setView] = useState(() => {
    const sView = new URLSearchParams(window.location.search).get('view');
    return sView || 'treemap';
  });

  function updateView(newView) {
    if (!newView) return;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('view', newView);
    window.history.pushState(
      {},
      '',
      `${window.location.pathname}?${searchParams}`,
    );
    setView(newView);
  }

  const [reloadCount, reload] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    // get origin from search params
    const searchParams = new URLSearchParams(window.location.search);
    const origin = searchParams.get('origin');
    if (origin) {
      // get data from session storage
      const data = sessionStorage.getItem(`cache-${origin}`);
      if (data) {
        setData(JSON.parse(data));
        setUiState('loaded');
      } else {
        setUiState('error');
      }
    }
  }, [reloadCount]);

  return (
    <>
      <h1>Stakataka: Cache Storage Visualizer</h1>
      <div>
        {data?.requestURLOrigin ? (
          <>
            {' '}
            <b>{data.requestURLOrigin}</b>
          </>
        ) : (
          ''
        )}{' '}
        <label>
          <input
            type="radio"
            name="view"
            value="treemap"
            checked={view === 'treemap'}
            onChange={() => updateView('treemap')}
          />
          Treemap
        </label>
        <label>
          <input
            type="radio"
            name="view"
            value="sunburst"
            checked={view === 'sunburst'}
            onChange={() => updateView('sunburst')}
          />
          Sunburst
        </label>
        <label>
          <input
            type="radio"
            name="view"
            value="table"
            checked={view === 'table'}
            onChange={() => updateView('table')}
          />
          Table
        </label>{' '}
        <button
          onClick={async () => {
            const { tabId } = data;
            const tab = await browser.tabs.get(tabId);
            const tabURLOrigin = new URL(tab.url).origin;
            if (tabURLOrigin !== data.requestURLOrigin) {
              alert('The tab URL has changed. Unable to refresh the data.');
              return;
            }
            setUiState('loading');
            const cacheEntries = await getCacheEntriesByTabId(tabId);
            saveCacheEntries(tabId, tabURLOrigin, cacheEntries);
            reload();
          }}
        >
          Refresh
        </button>{' '}
        <button
          onClick={async () => {
            const { tabId } = data;
            const tab = await browser.tabs.get(tabId);
            if (!tab) {
              alert('Tab not found');
              return;
            }
            const tabURLOrigin = new URL(tab.url).origin;
            if (tabURLOrigin !== data.requestURLOrigin) {
              alert('The tab URL has changed.');
              return;
            }
            // Open the tab
            await browser.tabs.update(tabId, {
              active: true,
            });
          }}
        >
          Switch to tab
        </button>
      </div>
      {uiState === 'loading' && <p>Loading...</p>}
      {uiState === 'error' && <p>Error</p>}
      {uiState === 'loaded' && !!data?.cacheEntries && (
        <>
          {view === 'sunburst' && <SunburstView data={data} />}
          {view === 'treemap' && <TreemapView data={data} />}
          {view === 'table' && <TableView data={data} />}
        </>
      )}
    </>
  );
};

function TreemapView({ data }) {
  const treemapRef = useRef(null);
  const [treemapResize, setTreemapResize] = useState(1);

  useEffect(() => {
    if (!data) return;
    const container = treemapRef.current;
    if (!container) return;
    const treemapData = formatTreeMapData(data, {
      sizeInID: true,
    });
    console.log('treemapData', treemapData);
    const height = Math.max(
      Math.round(treemapData.size / 15000),
      Math.max(window.innerHeight * 0.9, 600),
    );
    container.style.height = `${height}px`;
    container.dataset.initialHeight = height;
    const wtm = new webtreemap.TreeMap(treemapData, {
      padding: [16, 5, 5, 5],
      lowerBound: 0,
      showNode: () => true,
      showChildren: () => true,
    });
    wtm.render(container);
    const resizeObserver = new ResizeObserver(() =>
      wtm.layout(treemapData, container),
    );
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, [data]);

  useEffect(() => {
    const container = treemapRef.current;
    if (!container) return;
    const initalHeight = parseInt(container.dataset.initialHeight, 10);
    if (!initalHeight) return;
    const newHeight = initalHeight * treemapResize;
    container.style.height = `${newHeight}px`;
  }, [treemapResize]);

  return (
    <>
      <div ref={treemapRef} id="treemap" />
      <div className="resize-controls">
        Resize: {treemapResize}x{' '}
        <button
          onClick={() => {
            setTreemapResize((prev) => Math.min(prev + 0.5, 10));
          }}
          disabled={treemapResize >= 10}
        >
          ↕️ +
        </button>{' '}
        <button
          onClick={() => {
            setTreemapResize((prev) => Math.max(prev - 0.25, 0.5));
          }}
          disabled={treemapResize <= 0.5}
        >
          ↕️ -
        </button>{' '}
        <button
          onClick={() => {
            setTreemapResize(1);
          }}
          disabled={treemapResize === 1}
        >
          ↕️ 1x
        </button>
      </div>
    </>
  );
}

function SunburstView({ data }) {
  const container = useRef(null);
  const [width, setWidth] = useState(null);
  const colorScheme = useSystemColorScheme();
  useEffect(() => {
    const containerEl = container.current;
    if (!containerEl) return;
    const resizeObserver = new ResizeObserver(() => {
      setWidth(containerEl.clientWidth);
    });
    resizeObserver.observe(containerEl);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Choose colors based on color scheme
  const sunburstColors =
    colorScheme === 'dark'
      ? { color: () => 'dimgray', strokeColor: () => 'black' }
      : { color: () => 'lightgrey', strokeColor: () => 'white' };

  return (
    <div id="sunburst" ref={container}>
      <Sunburst
        color={sunburstColors.color}
        strokeColor={sunburstColors.strokeColor}
        data={formatTreeMapData(data)} // Reuse treemap data
        width={width || undefined}
        label="id"
        size="size"
        tooltipContent={(d, node) =>
          `Size: ${pb(node.value)} (${node.value.toLocaleString()}B)`
        }
        radiusScaleExponent={0.8}
      />
    </div>
  );
}

function TableView({ data }) {
  const colorScheme = useSystemColorScheme();
  return (
    <>
      {Object.entries(data.cacheEntries).map(([key, entry]) => {
        const totalBytes = entry.reduce((a, b) => a + b.bodySize, 0);
        const entryLargestBodySize = Math.max(...entry.map((e) => e.bodySize));
        return (
          <details key={key} open className="cache-entry">
            <summary>
              <h2>{key}</h2>
            </summary>
            <p className="cache-meta">
              {entry.length} response(s) ⸱ {totalBytes.toLocaleString()}B (
              {pb(totalBytes)})
            </p>
            <DataTable
              theme={colorScheme}
              columns={[
                {
                  minWidth: '3ch',
                  grow: 0,
                  compact: true,
                  style: {
                    opacity: 0.5,
                  },
                  hide: 320,
                  selector: (row, rowIndex) => rowIndex + 1,
                },
                {
                  name: 'Path',
                  sortable: true,
                  cell: (row: any) => {
                    // linkify it
                    const shortUrl = row.url.replace(
                      new RegExp(`^${data.requestURLOrigin}`),
                      '',
                    );
                    return (
                      <a href={row.url} target="_blank">
                        {shortUrl}
                      </a>
                    );
                  },
                },
                {
                  name: 'Type',
                  sortable: true,
                  hide: 'sm',
                  selector: (row: any) => {
                    return row.headers?.['content-type'] || 'unknown';
                  },
                },
                {
                  name: 'Bytes',
                  sortable: true,
                  right: true,
                  grow: 0,
                  conditionalCellStyles: [
                    {
                      when: (row) => row.bodySize > 0,
                      style: (row) => ({
                        '--percentage': Math.round(
                          (row.bodySize / entryLargestBodySize) * 100,
                        ),
                      }),
                      classNames: ['cache-percentage'],
                    },
                  ],
                  selector: (row: any) => row.bodySize,
                  format: (row: any) => row.bodySize.toLocaleString(),
                },
              ]}
              data={entry}
              striped
              highlightOnHover
              dense
              responsive
              pagination={entry.length > 15}
              paginationPerPage={15}
              paginationRowsPerPageOptions={[15, 25, 50, 100, 200]}
              // fixedHeader
              // fixedHeaderScrollHeight="66vh"
            />
          </details>
        );
      })}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
