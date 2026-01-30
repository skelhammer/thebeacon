document.addEventListener('DOMContentLoaded', () => {
    const agentFilter = document.getElementById('agent-filter');

    // --- Agent Filter Logic ---
    if (agentFilter) {
        agentFilter.addEventListener('change', () => {
            const selectedAgentId = agentFilter.value;
            const url = new URL(window.location);
            if (selectedAgentId) {
                url.searchParams.set('agent_id', selectedAgentId);
            } else {
                url.searchParams.delete('agent_id');
            }
            window.location.href = url.toString();
        });
    }

    // --- Ticket Data Fetching & Rendering Logic ---
    function formatToLocal(utcDateStringInput, options = {}, dateOnly = false, prefix = "") {
        if (!utcDateStringInput || utcDateStringInput.trim() === 'N/A' || utcDateStringInput.trim() === '') {
            return 'N/A';
        }
        let parsableDateString = utcDateStringInput.trim().replace(' ', 'T');
        if (!parsableDateString.endsWith('Z') && !parsableDateString.match(/[+-]\d{2}:\d{2}$/)) {
            parsableDateString += 'Z';
        }

        const date = new Date(parsableDateString);
        if (isNaN(date.getTime())) {
            return utcDateStringInput;
        }

        let Noptions = dateOnly
            ? { year: 'numeric', month: 'short', day: 'numeric', ...options }
            : { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, ...options };
        return prefix + date.toLocaleString(undefined, Noptions);
    }

    function convertAllUTCToLocal(isoTimestamp) {
        const dashboardTimeLocalEl = document.getElementById('dashboard-generated-time');
        if (dashboardTimeLocalEl && isoTimestamp) {
            dashboardTimeLocalEl.textContent = formatToLocal(isoTimestamp);
        }
        document.querySelectorAll('.datetime-container').forEach(el => {
            const utcTimestamp = el.getAttribute('data-utc-datetime');
            const prefix = el.getAttribute('data-prefix') || "";
            const localTimeSpan = el.querySelector('.local-datetime');
            if (utcTimestamp && localTimeSpan) {
                localTimeSpan.textContent = formatToLocal(utcTimestamp, {}, false, prefix);
            }
        });
    }

    const TICKET_BASE_URL = window.TICKET_BASE_URL || '';
    const AUTO_REFRESH_INTERVAL_MS = window.AUTO_REFRESH_MS || 0;
    const CURRENT_TICKET_TYPE_SLUG = window.CURRENT_TICKET_TYPE_SLUG || 'helpdesk';
    const THRESHOLDS = window.ALERT_THRESHOLDS || { warning: 90, danger: 100, critical: 110, emergency: 120 };

    window.currentApiData = {};
    let sortState = {
        's1-item-table': { key: null, direction: 'asc' },
        's2-item-table': { key: null, direction: 'asc' },
        's3-item-table': { key: null, direction: 'asc' },
        's4-item-table': { key: null, direction: 'asc' }
    };

    function renderItemRow(item, sectionIdPrefix) {
        const itemId = item.id || 'N/A';
        const subjectText = item.subject ? item.subject.substring(0, 60) + (item.subject.length > 60 ? '...' : '') : 'No Subject';
        const requesterName = item.requester_name || 'N/A';
        const agentName = item.agent_name || 'Unassigned';
        const priorityText = item.priority_text || 'N/A';
        const slaText = item.sla_text || 'N/A';
        const slaClass = item.sla_class || 'sla-none';
        const updatedFriendly = item.updated_friendly || 'N/A';
        const createdDaysOld = item.created_days_old || 'N/A';

        let slaDetailHtml = '';
        const needsFR = !item.first_responded_at_iso && item.fr_due_by_str;
        const slaAtRisk = slaClass && slaClass !== 'sla-normal' && slaClass !== 'sla-responded' && slaClass !== 'sla-none';
        if (needsFR && slaAtRisk) {
            slaDetailHtml = `<div class="datetime-container" data-utc-datetime="${item.fr_due_by_str}" data-prefix="FR Due: "><small class="local-datetime">Loading...</small></div>`;
        } else if (item.type === 'SERVICE_REQUEST' && item.due_by_str && !item.first_responded_at_iso && slaAtRisk) {
            slaDetailHtml = `<div class="datetime-container" data-utc-datetime="${item.due_by_str}" data-prefix="Due: "><small class="local-datetime">Loading...</small></div>`;
        }

        return `
        <tr>
            <td><a href="${TICKET_BASE_URL}${itemId}" target="_blank">${itemId}</a></td>
            <td>
                <a href="#" class="modal-trigger" data-item-id="${itemId}" data-section-prefix="${sectionIdPrefix}">
                    ${subjectText}
                </a>
            </td>
            <td>${requesterName}</td>
            <td>${agentName}</td>
            <td><span class="priority-badge priority-badge--${priorityText.toLowerCase()}">${priorityText}</span></td>
            <td>
                <span class="sla-status ${slaClass}">${slaText}</span>
                ${slaDetailHtml}
            </td>
            <td>${updatedFriendly}</td>
            <td>${createdDaysOld}</td>
        </tr>`;
    }

    function updateItemSection(sectionIdPrefix, items) {
        const tableBody = document.getElementById(`${sectionIdPrefix}-items-body`);
        const noItemsMessageElement = document.getElementById(`${sectionIdPrefix}-no-items-message`);
        const sectionItemCountElement = document.getElementById(`${sectionIdPrefix}-item-count`);

        if (!tableBody || !noItemsMessageElement || !sectionItemCountElement) return;

        sectionItemCountElement.textContent = items.length;

        if (items && items.length > 0) {
            const html = items.map(item => renderItemRow(item, sectionIdPrefix)).join('');
            tableBody.innerHTML = html;
            noItemsMessageElement.style.display = 'none';
        } else {
            tableBody.innerHTML = '';
            noItemsMessageElement.style.display = 'block';
        }
    }

    async function refreshTicketData() {
        const apiErrorBanner = document.getElementById('api-error-banner');
        const apiErrorMessage = document.getElementById('api-error-message');

        try {
            const url = new URL(`/api/tickets/${CURRENT_TICKET_TYPE_SLUG}`, window.location.origin);
            const selectedAgentId = new URLSearchParams(window.location.search).get('agent_id');
            if (selectedAgentId) {
                url.searchParams.set('agent_id', selectedAgentId);
            }
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                console.error('Failed to fetch data:', response.status);
                if (apiErrorBanner && apiErrorMessage) {
                    apiErrorMessage.textContent = `Failed to fetch ticket data (HTTP ${response.status})`;
                    apiErrorBanner.style.display = 'block';
                }
                return;
            }
            const data = await response.json();

            // Handle API-level errors
            if (data.error) {
                if (apiErrorBanner && apiErrorMessage) {
                    apiErrorMessage.textContent = data.error;
                    apiErrorBanner.style.display = 'block';
                }
            } else {
                if (apiErrorBanner) {
                    apiErrorBanner.style.display = 'none';
                }
            }

            // Update agent dropdown if new agents returned
            if (data.agent_mapping && agentFilter) {
                const currentValue = agentFilter.value;
                const currentOptions = new Set();
                for (let i = 1; i < agentFilter.options.length; i++) {
                    currentOptions.add(agentFilter.options[i].value);
                }
                const newKeys = Object.keys(data.agent_mapping);
                if (newKeys.length !== currentOptions.size || newKeys.some(k => !currentOptions.has(String(k)))) {
                    // Rebuild dropdown
                    agentFilter.innerHTML = '<option value="">All Agents</option>';
                    for (const [id, name] of Object.entries(data.agent_mapping)) {
                        const opt = document.createElement('option');
                        opt.value = id;
                        opt.textContent = name;
                        if (String(id) === String(currentValue)) opt.selected = true;
                        agentFilter.appendChild(opt);
                    }
                }
            }

            window.currentApiData = data;

            const totalActiveItems = data.total_active_items;
            const totalActiveItemsCount = document.getElementById('total-active-items-count');
            const sirenLeft = document.getElementById('siren-left');
            const sirenRight = document.getElementById('siren-right');

            if (totalActiveItemsCount) {
                totalActiveItemsCount.textContent = totalActiveItems;

                // Remove all warning classes
                totalActiveItemsCount.classList.remove('count-warning', 'count-danger', 'count-critical', 'count-emergency', 'pulse-red');
                if (sirenLeft) sirenLeft.classList.remove('active');
                if (sirenRight) sirenRight.classList.remove('active');

                // Apply appropriate warning state using config thresholds
                if (totalActiveItems >= THRESHOLDS.emergency) {
                    totalActiveItemsCount.classList.add('count-emergency');
                    if (sirenLeft) sirenLeft.classList.add('active');
                    if (sirenRight) sirenRight.classList.add('active');
                } else if (totalActiveItems >= THRESHOLDS.critical) {
                    totalActiveItemsCount.classList.add('count-critical');
                } else if (totalActiveItems >= THRESHOLDS.danger) {
                    totalActiveItemsCount.classList.add('count-danger');
                } else if (totalActiveItems >= THRESHOLDS.warning) {
                    totalActiveItemsCount.classList.add('count-warning');
                }
            }

            let s1Data = data.s1_items || [];
            let s2Data = data.s2_items || [];
            let s3Data = data.s3_items || [];
            let s4Data = data.s4_items || [];

            if (sortState['s1-item-table'].key) s1Data = sortData([...s1Data], sortState['s1-item-table'].key, sortState['s1-item-table'].direction);
            if (sortState['s2-item-table'].key) s2Data = sortData([...s2Data], sortState['s2-item-table'].key, sortState['s2-item-table'].direction);
            if (sortState['s3-item-table'].key) s3Data = sortData([...s3Data], sortState['s3-item-table'].key, sortState['s3-item-table'].direction);
            if (sortState['s4-item-table'].key) s4Data = sortData([...s4Data], sortState['s4-item-table'].key, sortState['s4-item-table'].direction);

            updateItemSection('s1', s1Data);
            updateItemSection('s2', s2Data);
            updateItemSection('s3', s3Data);
            updateItemSection('s4', s4Data);

            updateAllSortIndicators();
            if (data.dashboard_generated_time_iso) {
                convertAllUTCToLocal(data.dashboard_generated_time_iso);
            }

        } catch (error) {
            console.error('Error refreshing data:', error);
            if (apiErrorBanner && apiErrorMessage) {
                apiErrorMessage.textContent = 'Network error: Unable to connect to server';
                apiErrorBanner.style.display = 'block';
            }
        }
    }

    function sortData(dataArray, key, direction) {
        if (!dataArray) return [];
        dataArray.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            if (valA == null) return 1;
            if (valB == null) return -1;
            if (key.endsWith('_at_str') || key.endsWith('_by_str')) {
                return direction === 'asc' ? new Date(valA) - new Date(valB) : new Date(valB) - new Date(valA);
            } else if (typeof valA === 'number') {
                return direction === 'asc' ? valA - valB : valB - valA;
            } else {
                return direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
            }
        });
        return dataArray;
    }

    function updateSortIndicators(tableElement, activeKey, direction) {
        if (!tableElement) return;
        tableElement.querySelectorAll('.sortable-header').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sortKey === activeKey) {
                th.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    function updateAllSortIndicators() {
        for (const tableId in sortState) {
            const tableElement = document.getElementById(tableId);
            if (tableElement && sortState[tableId].key) {
                updateSortIndicators(tableElement, sortState[tableId].key, sortState[tableId].direction);
            }
        }
    }

    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sortKey;
            const tableElement = header.closest('.data-table');
            if (!tableElement) return;
            const tableId = tableElement.id;
            const sectionPrefix = tableId.substring(0, 2);

            let currentDataForTable = window.currentApiData[`${sectionPrefix}_items`];
            if (!currentDataForTable) return;

            let dataToSort = [...currentDataForTable];

            if (sortState[tableId].key === sortKey) {
                sortState[tableId].direction = sortState[tableId].direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState[tableId].key = sortKey;
                sortState[tableId].direction = 'asc';
            }

            const sortedData = sortData(dataToSort, sortKey, sortState[tableId].direction);
            updateItemSection(sectionPrefix, sortedData);
            updateSortIndicators(tableElement, sortKey, sortState[tableId].direction);
            convertAllUTCToLocal();
        });
    });

    // --- Modal Logic ---
    const modal = document.getElementById('ticket-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDetailsGrid = document.getElementById('modal-details-grid');
    const modalDescription = document.getElementById('modal-description');
    const closeModalBtn = modal ? modal.querySelector('.modal__close') : null;

    function createDetailRow(label, value) {
        return `
            <div class="modal__detail-row">
                <span class="modal__detail-label">${label}</span>
                <span class="modal__detail-value">${value || 'N/A'}</span>
            </div>
        `;
    }

    function openModal(item) {
        if (!item || !modal) return;

        modalTitle.textContent = `Ticket #${item.id}: ${item.subject}`;

        let detailsHtml = '';
        detailsHtml += createDetailRow('Requester', item.requester_name);
        detailsHtml += createDetailRow('Agent', item.agent_name || 'Unassigned');
        detailsHtml += createDetailRow('Priority', `<span class="priority-badge priority-badge--${(item.priority_text || '').toLowerCase()}">${item.priority_text}</span>`);
        detailsHtml += createDetailRow('Status', item.sla_text || 'N/A');
        detailsHtml += createDetailRow('Created', `${item.created_days_old} (${formatToLocal(item.created_at_str)})`);
        detailsHtml += createDetailRow('Last Updated', `${item.updated_friendly} (${formatToLocal(item.updated_at_str)})`);

        modalDetailsGrid.innerHTML = detailsHtml;

        // Sanitize and display description
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = item.description_text || "No description provided.";
        modalDescription.textContent = tempDiv.textContent || tempDiv.innerText || "";

        modal.classList.add('active');
    }

    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
        }
    }

    document.addEventListener('click', function(event) {
        const trigger = event.target.closest('.modal-trigger');
        if (trigger) {
            event.preventDefault();
            const itemId = trigger.dataset.itemId;
            const sectionPrefix = trigger.dataset.sectionPrefix;
            const itemArray = window.currentApiData[`${sectionPrefix}_items`] || [];
            const item = itemArray.find(i => String(i.id) === String(itemId));
            openModal(item);
        }
    });

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // Initial data fetch and auto-refresh
    if (AUTO_REFRESH_INTERVAL_MS > 0) {
        setTimeout(refreshTicketData, 100);
        setInterval(refreshTicketData, AUTO_REFRESH_INTERVAL_MS);
    } else {
        setTimeout(refreshTicketData, 100);
    }

    // --- Manual Refresh Button ---
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            await refreshTicketData();
            refreshBtn.textContent = 'Refresh';
            refreshBtn.disabled = false;
        });
    }

    // --- Force Refresh Button (invalidates server cache) ---
    const forceRefreshBtn = document.getElementById('force-refresh-btn');
    const refreshStatus = document.getElementById('refresh-status');

    if (forceRefreshBtn) {
        forceRefreshBtn.addEventListener('click', async () => {
            forceRefreshBtn.disabled = true;
            forceRefreshBtn.textContent = 'Refreshing...';
            if (refreshStatus) refreshStatus.textContent = 'Fetching from SuperOps...';

            try {
                const response = await fetch('/api/refresh', {
                    method: 'POST',
                    credentials: 'same-origin'
                });

                const data = await response.json();

                if (data.success) {
                    if (refreshStatus) refreshStatus.textContent = `Refreshed (${data.ticket_count} tickets)`;
                    // Now refresh the displayed data
                    await refreshTicketData();
                    setTimeout(() => {
                        if (refreshStatus) refreshStatus.textContent = '';
                    }, 3000);
                } else {
                    if (refreshStatus) refreshStatus.textContent = data.error || 'Refresh failed';
                }
            } catch (error) {
                console.error('Force refresh error:', error);
                if (refreshStatus) refreshStatus.textContent = 'Network error';
            }

            forceRefreshBtn.textContent = 'Force Refresh';
            forceRefreshBtn.disabled = false;
        });
    }
});
