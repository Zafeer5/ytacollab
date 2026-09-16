import { store } from '../../lib/store.js';

export function renderAdminDatabaseView(container, navigate) {
  let isFilterExpanded = false;
  let filterChannel = '';
  let filterTask = '';
  let filterActor = '';
  let searchQuery = '';

  function render() {
    const state = store.getState();
    const allLedger = state.ledger || [];

    // Filter logic
    let filteredLedger = allLedger.filter((entry) => {
      if (filterChannel && entry.channel !== filterChannel) return false;
      if (filterTask && entry.task !== filterTask) return false;
      if (filterActor && entry.actor !== filterActor) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          (entry.actor || '').toLowerCase().includes(q) ||
          (entry.action || '').toLowerCase().includes(q) ||
          (entry.channel || '').toLowerCase().includes(q) ||
          (entry.task || '').toLowerCase().includes(q) ||
          (entry.fileReference || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });

    const displayEntries = isFilterExpanded ? filteredLedger : filteredLedger.slice(0, 10);

    const ledgerItemsHtml = displayEntries
      .map((entry) => `
        <div class="ledger-item">
          <div class="ledger-item-header">
            <div>
              <span class="ledger-actor">${entry.actor}</span>
              <span class="ledger-desc"> ${entry.action}</span>
            </div>
            <span class="ledger-time">${entry.timestamp}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: baseline; font-size: 11px;">
            <span style="color: var(--text-muted);">Channel: <strong style="color: var(--text-secondary);">${entry.channel}</strong></span>
            ${entry.videoNumber ? `<span style="color: var(--text-muted);">• Video <strong style="color: var(--text-secondary);">${entry.videoNumber}</strong></span>` : ''}
            <span style="color: var(--text-muted);">• Task: <strong style="color: var(--text-secondary);">${entry.task}</strong></span>
          </div>
          ${entry.fileReference ? `<div class="ledger-ref">${entry.fileReference}</div>` : ''}
        </div>
      `)
      .join('');

    // Unique options for filters
    const uniqueChannels = Array.from(new Set(allLedger.map((l) => l.channel).filter(Boolean)));
    const uniqueTasks = Array.from(new Set(allLedger.map((l) => l.task).filter(Boolean)));
    const uniqueActors = Array.from(new Set(allLedger.map((l) => l.actor).filter(Boolean)));

    const channelOptions = uniqueChannels
      .map((c) => `<option value="${c}" ${filterChannel === c ? 'selected' : ''}>${c}</option>`)
      .join('');

    const taskOptions = uniqueTasks
      .map((t) => `<option value="${t}" ${filterTask === t ? 'selected' : ''}>${t}</option>`)
      .join('');

    const actorOptions = uniqueActors
      .map((a) => `<option value="${a}" ${filterActor === a ? 'selected' : ''}>${a}</option>`)
      .join('');

    container.innerHTML = `
      <div class="main-content">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
            <div>
              <h2>List of Added content (All transactions stacked recorded like a ledger)</h2>
              <div class="helper-text">Permanent chronological audit trail of every submission and pipeline event.</div>
            </div>
            <button id="btn-toggle-see-more" class="btn btn-secondary btn-sm">
              ${isFilterExpanded ? 'Show Less' : 'See More...'}
            </button>
          </div>

          ${
            isFilterExpanded
              ? `
                <div style="background-color: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 14px;">
                  <div class="section-label">Filter Full Ledger</div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                    <div>
                      <label for="filter-channel">Channel</label>
                      <select id="filter-channel" style="padding: 6px 8px; font-size: 12px;">
                        <option value="">All Channels</option>
                        ${channelOptions}
                      </select>
                    </div>
                    <div>
                      <label for="filter-task">Task</label>
                      <select id="filter-task" style="padding: 6px 8px; font-size: 12px;">
                        <option value="">All Tasks</option>
                        ${taskOptions}
                      </select>
                    </div>
                    <div>
                      <label for="filter-actor">Actor</label>
                      <select id="filter-actor" style="padding: 6px 8px; font-size: 12px;">
                        <option value="">All Actors</option>
                        ${actorOptions}
                      </select>
                    </div>
                    <div>
                      <label for="filter-search">Search</label>
                      <input type="text" id="filter-search" value="${searchQuery}" placeholder="Keyword..." style="padding: 6px 8px; font-size: 12px;" />
                    </div>
                  </div>
                  <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                    <button id="btn-clear-filters" class="btn btn-secondary btn-sm">Clear Filters</button>
                  </div>
                </div>
              `
              : ''
          }

          <div class="scrollable-container" style="max-height: 520px;">
            <div class="ledger-list">
              ${ledgerItemsHtml || (allLedger.length === 0 
                ? '<div style="padding: 24px; text-align: center;" class="helper-text">No ledger entries recorded yet. As you add channels, paste titles, and submit tasks, all audit records will appear here.</div>' 
                : '<div style="padding: 24px; text-align: center;" class="helper-text">No ledger entries match the selected filter criteria.</div>')}
            </div>
          </div>
        </div>
      </div>
    `;

    // Handlers
    container.querySelector('#btn-toggle-see-more').addEventListener('click', () => {
      isFilterExpanded = !isFilterExpanded;
      render();
    });

    if (isFilterExpanded) {
      container.querySelector('#filter-channel').addEventListener('change', (e) => {
        filterChannel = e.target.value;
        render();
      });

      container.querySelector('#filter-task').addEventListener('change', (e) => {
        filterTask = e.target.value;
        render();
      });

      container.querySelector('#filter-actor').addEventListener('change', (e) => {
        filterActor = e.target.value;
        render();
      });

      const searchInput = container.querySelector('#filter-search');
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
      });

      container.querySelector('#btn-clear-filters').addEventListener('click', () => {
        filterChannel = '';
        filterTask = '';
        filterActor = '';
        searchQuery = '';
        render();
      });
    }
  }

  render();
}
