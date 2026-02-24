document.addEventListener('DOMContentLoaded', () => {
    const agentFilter = document.getElementById('agent-filter');

    // --- Notification Sounds (Web Audio API) ---
    let audioCtx = null;
    document.addEventListener('click', function() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }, { once: true });

    var newTicketAudio = new Audio('/static/audio/new-ticket.mp3');
    newTicketAudio.preload = 'auto';

    function playNewTicketSound() {
        newTicketAudio.currentTime = 0;
        newTicketAudio.play().catch(function() {});
    }

    function playSLAEscalationSound() {
        if (!audioCtx) return;
        // Urgent double-pulse at 440Hz, square wave
        [0, 0.2].forEach(function(delay) {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 440;
            gain.gain.setValueAtTime(0.9, audioCtx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + delay);
            osc.stop(audioCtx.currentTime + delay + 0.15);
        });
    }

    // --- Toast Manager ---
    var ToastManager = (function() {
        var container = null;
        var MAX_TOASTS = 5;

        function getContainer() {
            if (!container) {
                container = document.createElement('div');
                container.className = 'toast-container';
                document.body.appendChild(container);
            }
            return container;
        }

        function show(html, variant, duration) {
            variant = variant || 'info';
            duration = duration || 6000;
            var c = getContainer();

            // Enforce max toasts — remove oldest
            while (c.children.length >= MAX_TOASTS) {
                c.removeChild(c.firstChild);
            }

            var toast = document.createElement('div');
            toast.className = 'toast toast--' + variant;
            toast.innerHTML = html;

            // Click to dismiss
            toast.addEventListener('click', function() { dismiss(toast); });

            c.appendChild(toast);

            // Auto-dismiss
            var timer = setTimeout(function() { dismiss(toast); }, duration);
            toast._dismissTimer = timer;

            return toast;
        }

        function dismiss(toast) {
            if (toast._dismissed) return;
            toast._dismissed = true;
            clearTimeout(toast._dismissTimer);
            toast.classList.add('toast--hiding');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }

        return { show: show };
    })();

    // --- SLA Severity Tracking ---
    var SLA_SEVERITY = { 'sla-none': 0, 'sla-responded': 0, 'sla-normal': 1, 'sla-warning': 2, 'sla-critical': 3, 'sla-overdue': 4 };
    var previousSlaSeverity = {}; // ticket id → severity number

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

    // --- HTML Escaping ---
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
            let parsable = isoTimestamp.trim().replace(' ', 'T');
            if (!parsable.endsWith('Z') && !parsable.match(/[+-]\d{2}:\d{2}$/)) parsable += 'Z';
            const d = new Date(parsable);
            if (!isNaN(d.getTime())) {
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const yy = String(d.getFullYear()).slice(-2);
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                dashboardTimeLocalEl.textContent = `${mm}/${dd}/${yy} ${hh}:${min}`;
            } else {
                dashboardTimeLocalEl.textContent = formatToLocal(isoTimestamp);
            }
        }
    }

    const _rawTicketUrl = window.TICKET_URL_TEMPLATE || '';
    const TICKET_URL_TEMPLATE = /^https?:\/\//.test(_rawTicketUrl) ? _rawTicketUrl : '';
    const AUTO_REFRESH_INTERVAL_MS = window.AUTO_REFRESH_MS || 0;
    const CURRENT_TICKET_TYPE_SLUG = window.CURRENT_TICKET_TYPE_SLUG || 'helpdesk';
    const THRESHOLDS = window.ALERT_THRESHOLDS || { calm: 50, good: 70, warning: 90, danger: 100, emergency: 110 };

    window.currentApiData = {};
    let sortState = {
        's1-item-table': { key: 'updated_at_str', direction: 'desc' },
        's2-item-table': { key: 'updated_at_str', direction: 'desc' },
        's3-item-table': { key: 'updated_at_str', direction: 'desc' },
        's4-item-table': { key: 'updated_at_str', direction: 'desc' }
    };

    function renderItemRow(item, sectionPrefix) {
        const itemId = escapeHtml(item.id || 'N/A');
        const subjectRaw = item.subject ? item.subject.substring(0, 60) + (item.subject.length > 60 ? '...' : '') : 'No Subject';
        const subjectText = escapeHtml(subjectRaw);
        const requesterName = escapeHtml(item.requester_name || 'N/A');
        const agentFull = item.agent_name || 'Unassigned';
        const agentName = escapeHtml(agentFull.split(' ')[0]);
        const statusText = escapeHtml(item.status_text || 'Unknown');
        const slaText = escapeHtml(item.sla_text || 'N/A');
        const slaClass = (item.sla_class || 'sla-none').replace(/[^a-zA-Z0-9_-]/g, '');
        const updatedFriendly = escapeHtml(item.updated_friendly || 'N/A');
        const createdDaysOld = escapeHtml(item.created_days_old || 'N/A');
        const ticketId = escapeHtml(item.ticket_id || '');

        const needsFR = !item.first_responded_at_iso && item.fr_due_by_str;
        const slaAtRisk = slaClass && slaClass !== 'sla-normal' && slaClass !== 'sla-responded' && slaClass !== 'sla-none';

        const prioritySlug = (item.priority_text || 'n-a').toLowerCase().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');

        // Row highlighting for SLA states
        let rowClass = '';
        if (slaClass === 'sla-overdue') rowClass = 'row-sla-violated';
        else if (slaClass === 'sla-critical') rowClass = 'row-sla-critical';
        else if (slaClass === 'sla-warning') rowClass = 'row-sla-warning';

        // Build SLA tooltip for the row
        let rowTitle = '';
        if (slaAtRisk) {
            let slaTooltip = slaText;
            if (needsFR && item.fr_due_by_str) {
                slaTooltip += ' — FR Due: ' + item.fr_due_by_str;
            } else if (item.type === 'SERVICE_REQUEST' && item.due_by_str && !item.first_responded_at_iso) {
                slaTooltip += ' — Due: ' + item.due_by_str;
            }
            rowTitle = ` title="${escapeHtml(slaTooltip)}"`;
        }

        const rowAttrs = (rowClass ? ` class="${rowClass}"` : '') + rowTitle;

        return `
        <tr${rowAttrs}>
            <td><a href="${TICKET_URL_TEMPLATE.replace('{ticket_id}', ticketId)}" target="_blank" class="ticket-id ticket-id--${prioritySlug}">#${itemId}</a></td>
            <td>${subjectText}</td>
            <td>${requesterName}</td>
            <td>${agentName}</td>
            <td>${statusText}</td>${sectionPrefix === 's1' ? `
            <td>${needsFR ? formatToLocal(item.fr_due_by_str, {}, false, '') : (item.first_responded_at_iso ? 'Responded' : 'N/A')}</td>` : ''}
            <td>${updatedFriendly}</td>
            <td>${createdDaysOld}</td>
        </tr>`;
    }

    function updateItemSection(sectionIdPrefix, items) {
        const tableBody = document.getElementById(`${sectionIdPrefix}-items-body`);
        const noItemsMessageElement = document.getElementById(`${sectionIdPrefix}-no-items-message`);
        const sectionItemCountElement = document.getElementById(`${sectionIdPrefix}-item-count`);
        const tableWrapper = tableBody ? tableBody.closest('.table-wrapper') : null;
        const container = document.getElementById(`${sectionIdPrefix}-container`);
        const cardBody = container ? container.querySelector('.card__body') : null;

        if (!tableBody || !noItemsMessageElement || !sectionItemCountElement) return;

        sectionItemCountElement.textContent = items.length;

        if (items && items.length > 0) {
            const html = items.map(item => renderItemRow(item, sectionIdPrefix)).join('');
            tableBody.innerHTML = html;
            noItemsMessageElement.style.display = 'none';
            if (tableWrapper) tableWrapper.style.display = '';
            // Expand section
            if (cardBody && cardBody.classList.contains('card__body--collapsed')) {
                cardBody.classList.remove('card__body--collapsed');
                cardBody.style.height = cardBody.scrollHeight + 'px';
                setTimeout(function() { cardBody.style.height = ''; }, 300);
            }
        } else {
            tableBody.innerHTML = '';
            noItemsMessageElement.style.display = 'none';
            if (tableWrapper) tableWrapper.style.display = 'none';
            // Collapse section
            if (cardBody && !cardBody.classList.contains('card__body--collapsed')) {
                cardBody.style.height = cardBody.scrollHeight + 'px';
                // Force reflow then collapse
                cardBody.offsetHeight;
                cardBody.classList.add('card__body--collapsed');
                cardBody.style.height = '0';
                setTimeout(function() { cardBody.style.height = ''; }, 300);
            }
        }
    }

    function applyTicketData(data) {
        window.currentApiData = data;

        const totalActiveItems = data.total_active_items;
        const totalActiveItemsCount = document.getElementById('total-active-items-count');
        const sirenLeft = document.getElementById('siren-left');
        const sirenRight = document.getElementById('siren-right');

        if (totalActiveItemsCount) {
            totalActiveItemsCount.textContent = totalActiveItems;

            // Remove all state classes
            totalActiveItemsCount.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
            if (sirenLeft) sirenLeft.classList.remove('active');
            if (sirenRight) sirenRight.classList.remove('active');

            // Apply appropriate state using config thresholds
            if (totalActiveItems >= THRESHOLDS.emergency) {
                totalActiveItemsCount.classList.add('count-emergency');
                if (sirenLeft) sirenLeft.classList.add('active');
                if (sirenRight) sirenRight.classList.add('active');
            } else if (totalActiveItems >= THRESHOLDS.danger) {
                totalActiveItemsCount.classList.add('count-danger');
            } else if (totalActiveItems >= THRESHOLDS.warning) {
                totalActiveItemsCount.classList.add('count-warning');
            } else if (totalActiveItems < THRESHOLDS.calm) {
                totalActiveItemsCount.classList.add('count-calm');
            } else if (totalActiveItems < THRESHOLDS.good) {
                totalActiveItemsCount.classList.add('count-good');
            }
            // else: normal range (>= good, < warning) — no class

            // Celebration crossing detection
            var prev = window._previousTicketCount;
            var now = totalActiveItems;
            window._previousTicketCount = now;

            if (typeof prev === 'number' && prev >= THRESHOLDS.good && now < THRESHOLDS.good) {
                if (now < THRESHOLDS.calm) {
                    maybeCalmCelebration();
                } else {
                    maybeGoodCelebration();
                }
            } else if (typeof prev === 'number' && prev >= THRESHOLDS.calm && now < THRESHOLDS.calm) {
                maybeCalmCelebration();
            }

            // "This is fine" dog easter egg
            maybeShowThisIsFine(totalActiveItems);
        }

        // Update closed counts
        var closedTodayEl = document.getElementById('closed-today-count');
        var closedWeekEl = document.getElementById('closed-this-week-count');
        if (closedTodayEl) {
            closedTodayEl.textContent = (data.closed_today != null) ? data.closed_today : 'N/A';
        }
        if (closedWeekEl) {
            closedWeekEl.textContent = (data.closed_this_week != null) ? data.closed_this_week : 'N/A';
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

        // Update SLA violation counter badge
        var allItems = [].concat(data.s1_items || [], data.s2_items || [], data.s3_items || [], data.s4_items || []);
        var slaViolationCount = 0;
        allItems.forEach(function(item) {
            if (item.first_response_violated || item.resolution_violated) {
                slaViolationCount++;
            }
        });
        var slaBadge = document.getElementById('sla-violation-badge');
        if (slaBadge) {
            if (slaViolationCount > 0) {
                slaBadge.style.display = 'inline-flex';
                var countEl = slaBadge.querySelector('.sla-violation-count');
                if (countEl) countEl.textContent = slaViolationCount;
            } else {
                slaBadge.style.display = 'none';
            }
        }
    }

    async function refreshTicketData() {
        const apiErrorBanner = document.getElementById('api-error-banner');
        const apiErrorMessage = document.getElementById('api-error-message');

        try {
            const url = new URL(`/api/tickets/${CURRENT_TICKET_TYPE_SLUG}`, window.location.origin);
            const selectedAgentId = (agentFilter && agentFilter.value) || new URLSearchParams(window.location.search).get('agent_id');
            if (selectedAgentId) {
                url.searchParams.set('agent_id', selectedAgentId);
            }
            const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
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
                const currentValue = agentFilter.value || new URLSearchParams(window.location.search).get('agent_id') || '';
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
                        agentFilter.appendChild(opt);
                    }
                    // Restore selection after rebuild
                    agentFilter.value = currentValue;
                }
            }

            // --- Detect new open tickets ---
            const oldS1 = window.currentApiData.s1_items || [];
            const newS1 = data.s1_items || [];
            if (oldS1.length > 0) {
                const oldIds = new Set(oldS1.map(function(i) { return i.id; }));
                const newTickets = newS1.filter(function(i) { return !oldIds.has(i.id); });
                if (newTickets.length > 0) {
                    playNewTicketSound();
                    if (newTickets.length <= 3) {
                        newTickets.forEach(function(t) {
                            var subj = (t.subject || 'No Subject').substring(0, 50) + ((t.subject || '').length > 50 ? '...' : '');
                            ToastManager.show('<strong>New Ticket: ' + escapeHtml(t.requester_name || 'Unknown') + '</strong><br>' + escapeHtml(subj), 'warning', 8000);
                        });
                    } else {
                        ToastManager.show('<strong>' + newTickets.length + ' New Tickets</strong><br>Check Section 1', 'warning', 8000);
                    }
                }
            }

            // --- Detect closed/resolved tickets ---
            var oldAll = [].concat(window.currentApiData.s1_items || [], window.currentApiData.s2_items || [], window.currentApiData.s3_items || [], window.currentApiData.s4_items || []);
            var newAll = [].concat(data.s1_items || [], data.s2_items || [], data.s3_items || [], data.s4_items || []);
            var agentFilterActive = (agentFilter && agentFilter.value) || new URLSearchParams(window.location.search).get('agent_id');
            if (oldAll.length > 0 && !agentFilterActive) {
                var newIdSet = new Set(newAll.map(function(i) { return i.id; }));
                var closedTickets = oldAll.filter(function(i) { return !newIdSet.has(i.id); });
                if (closedTickets.length > 0) {
                    if (closedTickets.length <= 3) {
                        closedTickets.forEach(function(t) {
                            var subj = (t.subject || 'No Subject').substring(0, 50) + ((t.subject || '').length > 50 ? '...' : '');
                            ToastManager.show('<strong>Closed: ' + escapeHtml(t.requester_name || 'Unknown') + '</strong><br>' + escapeHtml(subj), 'success', 6000);
                        });
                    } else {
                        ToastManager.show('<strong>' + closedTickets.length + ' Tickets Closed</strong>', 'success', 6000);
                    }
                }
            }

            // --- Detect SLA escalations ---
            var slaEscalated = [];
            newAll.forEach(function(item) {
                var slaClass = (item.sla_class || 'sla-none').replace(/[^a-zA-Z0-9_-]/g, '');
                var newSev = SLA_SEVERITY[slaClass] != null ? SLA_SEVERITY[slaClass] : 0;
                var oldSev = previousSlaSeverity[item.id];
                if (typeof oldSev === 'number' && newSev >= 3 && newSev > oldSev) {
                    slaEscalated.push({ item: item, severity: newSev });
                }
                previousSlaSeverity[item.id] = newSev;
            });
            if (slaEscalated.length > 0) {
                playSLAEscalationSound();
                slaEscalated.forEach(function(e) {
                    var label = e.severity >= 4 ? 'SLA VIOLATED' : 'SLA Critical';
                    ToastManager.show('<strong>' + label + ': ' + escapeHtml(e.item.requester_name || 'Unknown') + '</strong>', 'error', 10000);
                });
            }

            applyTicketData(data);

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

    // Initial render from server-injected data (instant, no AJAX wait)
    if (window.INITIAL_API_DATA) {
        applyTicketData(window.INITIAL_API_DATA);
        // Seed SLA severity map from initial data to avoid false escalation toasts
        var initAll = [].concat(window.INITIAL_API_DATA.s1_items || [], window.INITIAL_API_DATA.s2_items || [], window.INITIAL_API_DATA.s3_items || [], window.INITIAL_API_DATA.s4_items || []);
        initAll.forEach(function(item) {
            var cls = (item.sla_class || 'sla-none').replace(/[^a-zA-Z0-9_-]/g, '');
            previousSlaSeverity[item.id] = SLA_SEVERITY[cls] != null ? SLA_SEVERITY[cls] : 0;
        });
    } else {
        // Fallback if server didn't inject data
        setTimeout(refreshTicketData, 100);
    }

    // Periodic auto-refresh synced to the clock (fires at the top of each minute)
    function scheduleRefresh() {
        if (AUTO_REFRESH_INTERVAL_MS <= 0) return;
        var now = Date.now();
        var msUntilNextMinute = AUTO_REFRESH_INTERVAL_MS - (now % AUTO_REFRESH_INTERVAL_MS);
        setTimeout(async function() {
            await refreshTicketData();
            scheduleRefresh();
        }, msUntilNextMinute);
    }
    scheduleRefresh();

    // ========================
    //  EASTER EGG: "This is fine" Dog
    // ========================
    let _thisIsFineCooldown = 0;

    function maybeShowThisIsFine(totalActiveItems) {
        if (totalActiveItems < THRESHOLDS.danger) return;
        if (document.querySelector('.this-is-fine-overlay')) return;
        var now = Date.now();
        if (now - _thisIsFineCooldown < 600000) return; // 10-min cooldown
        _thisIsFineCooldown = now;

        // Full-screen flame overlay
        var overlay = document.createElement('div');
        overlay.className = 'this-is-fine-overlay';
        document.body.appendChild(overlay);

        // Spawn fire emojis raining down
        var fireEmojis = ['\uD83D\uDD25']; // 🔥
        for (var i = 0; i < 30; i++) {
            (function(idx) {
                setTimeout(function() {
                    var flame = document.createElement('div');
                    flame.className = 'this-is-fine-flame';
                    flame.textContent = fireEmojis[idx % fireEmojis.length];
                    flame.style.left = (Math.random() * 100) + 'vw';
                    flame.style.animationDuration = (2 + Math.random() * 3) + 's';
                    flame.style.fontSize = (20 + Math.random() * 30) + 'px';
                    overlay.appendChild(flame);
                    setTimeout(function() { flame.remove(); }, 6000);
                }, idx * 150);
            })(i);
        }

        // Dog image peeking up from bottom-right
        var dog = document.createElement('div');
        dog.className = 'this-is-fine-dog';
        var img = document.createElement('img');
        img.src = '/static/img/this-is-fine.png';
        img.alt = 'This is fine';
        img.className = 'this-is-fine-dog__img';
        dog.appendChild(img);
        overlay.appendChild(dog);

        // Slide dog in
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                dog.classList.add('this-is-fine-dog--visible');
            });
        });

        // Hold for 6s then clean up
        setTimeout(function() {
            overlay.classList.add('this-is-fine-overlay--fade-out');
            dog.classList.remove('this-is-fine-dog--visible');
            setTimeout(function() { overlay.remove(); }, 1200);
        }, 6000);
    }

    // ========================
    //  TIME-BASED EASTER EGGS
    // ========================
    let _lastTimeEventMinute = -1;

    function checkTimeBasedEvents() {
        var now = new Date();
        var hour = now.getHours();
        var minute = now.getMinutes();
        var day = now.getDay(); // 0=Sun, 5=Fri
        var currentMinuteKey = hour * 60 + minute;

        // Prevent double-firing within same minute
        if (currentMinuteKey === _lastTimeEventMinute) return;

        // 4:04 PM — "Tickets Not Found"
        if (hour === 16 && minute === 4) {
            _lastTimeEventMinute = currentMinuteKey;
            show404Event();
        }

        // 4:20 PM — Leaf rain
        if (hour === 16 && minute === 20) {
            _lastTimeEventMinute = currentMinuteKey;
            show420Event();
        }

        // 5:00 PM — Beer o'clock
        if (hour === 17 && minute === 0) {
            _lastTimeEventMinute = currentMinuteKey;
            showBeerEvent();
        }
    }

    function show404Event() {
        var overlay = document.createElement('div');
        overlay.className = 'event-404';
        overlay.innerHTML =
            '<div class="event-404-content">' +
                '<div class="event-404-dino">\uD83E\uDD96</div>' +
                '<div class="event-404-heading">Tickets Not Found</div>' +
                '<div class="event-404-sub">The ticket you are looking for might have been resolved, had its name changed, or is temporarily unavailable.</div>' +
                '<div class="event-404-code">ERR_TICKETS_NOT_FOUND</div>' +
            '</div>';
        document.body.appendChild(overlay);

        // Dismiss on click or key press
        function dismiss() {
            overlay.classList.add('event-404--fade-out');
            setTimeout(function() { overlay.remove(); }, 500);
            document.removeEventListener('keydown', dismiss);
        }
        overlay.style.pointerEvents = 'auto';
        overlay.addEventListener('click', dismiss);
        document.addEventListener('keydown', dismiss);

        // Auto-dismiss after 8s
        setTimeout(dismiss, 8000);
    }

    function show420Event() {
        var leafEmojis = ['\uD83C\uDF3F', '\uD83C\uDF43', '\u2618\uFE0F']; // 🌿🍃☘️
        for (var i = 0; i < 15; i++) {
            (function(idx) {
                setTimeout(function() {
                    var leaf = document.createElement('div');
                    leaf.className = 'event-420-leaf';
                    leaf.textContent = leafEmojis[idx % leafEmojis.length];
                    leaf.style.left = (Math.random() * 100) + 'vw';
                    leaf.style.animationDuration = (3 + Math.random() * 2) + 's';
                    document.body.appendChild(leaf);
                    setTimeout(function() { leaf.remove(); }, 6000);
                }, idx * 200);
            })(i);
        }

        // Smoke puffs rising from the bottom
        var smokeContainer = document.createElement('div');
        smokeContainer.className = 'event-420-smoke-container';
        document.body.appendChild(smokeContainer);

        var smokePuffs = [];
        for (var s = 0; s < 60; s++) {
            (function(idx) {
                var delay = idx * 80 + Math.random() * 200;
                var t = setTimeout(function() {
                    var puff = document.createElement('div');
                    puff.className = 'event-420-puff';
                    puff.style.left = (Math.random() * 100) + 'vw';
                    puff.style.animationDuration = (3 + Math.random() * 3) + 's';
                    var size = 80 + Math.random() * 160;
                    puff.style.width = size + 'px';
                    puff.style.height = size + 'px';
                    smokeContainer.appendChild(puff);
                    smokePuffs.push(puff);
                }, delay);
            })(s);
        }

        // Badge
        var badge = document.createElement('div');
        badge.className = 'event-420-badge';
        badge.textContent = '4:20';
        document.body.appendChild(badge);

        setTimeout(function() {
            smokeContainer.classList.add('event-420-smoke-container--fade-out');
            badge.classList.add('event-420-badge--fade-out');
            setTimeout(function() { badge.remove(); smokeContainer.remove(); }, 1000);
        }, 5000);
    }

    function showBeerEvent() {
        var overlay = document.createElement('div');
        overlay.className = 'event-beer';
        overlay.innerHTML =
            '<div class="event-beer-emoji">\uD83C\uDF7A</div>' +
            '<div class="event-beer-title">It\'s 5 o\'clock somewhere!</div>' +
            '<div class="event-beer-subtitle">Go home.</div>';
        document.body.appendChild(overlay);

        // Falling confetti
        var confettiEmojis = ['\uD83C\uDF7A', '\uD83C\uDF7B', '\uD83E\uDD42', '\uD83C\uDF89']; // 🍺🍻🥂🎉
        for (var i = 0; i < 12; i++) {
            (function(idx) {
                setTimeout(function() {
                    var c = document.createElement('div');
                    c.className = 'event-beer-confetti';
                    c.textContent = confettiEmojis[idx % confettiEmojis.length];
                    c.style.left = (Math.random() * 100) + 'vw';
                    c.style.animationDuration = (4 + Math.random() * 2) + 's';
                    document.body.appendChild(c);
                    setTimeout(function() { c.remove(); }, 7000);
                }, idx * 250);
            })(i);
        }

        setTimeout(function() {
            overlay.classList.add('event-beer--fade-out');
            setTimeout(function() { overlay.remove(); }, 500);
        }, 7000);
    }

    // Check every 15 seconds
    setInterval(checkTimeBasedEvents, 15000);

    // ========================
    //  CELEBRATION EASTER EGGS
    // ========================
    let _goodCelebrationCooldown = 0;
    let _calmCelebrationCooldown = 0;

    function showGoodCelebration() {
        var countEl = document.getElementById('total-active-items-count');
        if (!countEl) return;

        var rect = countEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;

        var emojis = ['\uD83C\uDF89', '\uD83C\uDF8A', '\u2728', '\uD83C\uDF1F', '\uD83D\uDCAB', '\uD83C\uDF8A']; // 🎉🎊✨🌟💫🎊
        var particleCount = 10;

        for (var i = 0; i < particleCount; i++) {
            (function(idx) {
                var particle = document.createElement('div');
                particle.className = 'celebration-particle';
                particle.textContent = emojis[idx % emojis.length];

                // Radial distribution
                var angle = (idx / particleCount) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
                var distance = 60 + Math.random() * 80;
                var tx = Math.cos(angle) * distance;
                var ty = Math.sin(angle) * distance;

                particle.style.left = cx + 'px';
                particle.style.top = cy + 'px';
                particle.style.setProperty('--tx', tx + 'px');
                particle.style.setProperty('--ty', ty + 'px');
                particle.style.animationDelay = (idx * 30) + 'ms';

                document.body.appendChild(particle);
                setTimeout(function() { particle.remove(); }, 1800);
            })(i);
        }

        // Brief green glow pulse on count element
        countEl.classList.add('celebration-glow');
        setTimeout(function() { countEl.classList.remove('celebration-glow'); }, 1500);
    }

    function maybeGoodCelebration() {
        if (document.querySelector('.celebration-particle')) return;
        var now = Date.now();
        if (now - _goodCelebrationCooldown < 600000) return; // 10-min cooldown
        _goodCelebrationCooldown = now;
        showGoodCelebration();
    }

    function showCalmCelebration() {
        if (document.querySelector('.celebration-calm-overlay')) return;

        var overlay = document.createElement('div');
        overlay.className = 'celebration-calm-overlay';

        // Trophy
        var trophy = document.createElement('div');
        trophy.className = 'celebration-trophy';
        trophy.textContent = '\uD83C\uDFC6'; // 🏆
        overlay.appendChild(trophy);

        // Text
        var text = document.createElement('div');
        text.className = 'celebration-text';
        text.textContent = 'All Clear!';
        overlay.appendChild(text);

        // Confetti rain
        var confettiEmojis = ['\uD83C\uDF89', '\uD83C\uDF8A', '\uD83E\uDD73', '\u2728', '\uD83C\uDF86']; // 🎉🎊🥳✨🎆
        for (var i = 0; i < 22; i++) {
            (function(idx) {
                var c = document.createElement('div');
                c.className = 'celebration-confetti';
                c.textContent = confettiEmojis[idx % confettiEmojis.length];
                c.style.left = (Math.random() * 100) + 'vw';
                c.style.animationDuration = (3 + Math.random() * 3) + 's';
                c.style.animationDelay = (Math.random() * 2) + 's';
                c.style.fontSize = (18 + Math.random() * 16) + 'px';
                overlay.appendChild(c);
            })(i);
        }

        document.body.appendChild(overlay);

        // Click to dismiss early
        overlay.addEventListener('click', function() {
            dismiss();
        });

        // Auto-dismiss after 5s
        var dismissTimer = setTimeout(dismiss, 5000);

        function dismiss() {
            clearTimeout(dismissTimer);
            overlay.classList.add('celebration-calm-overlay--fade-out');
            setTimeout(function() { overlay.remove(); }, 800);
        }
    }

    function maybeCalmCelebration() {
        if (document.querySelector('.celebration-calm-overlay')) return;
        var now = Date.now();
        if (now - _calmCelebrationCooldown < 600000) return; // 10-min cooldown
        _calmCelebrationCooldown = now;
        showCalmCelebration();
    }

    // Expose forced triggers for debug menu
    window._debugEasterEggs = window._debugEasterEggs || {};
    window._debugEasterEggs.thisIsFine = function() {
        // Bypass cooldown and threshold check
        var origCooldown = _thisIsFineCooldown;
        _thisIsFineCooldown = 0;
        // Remove existing overlay if present
        var existing = document.querySelector('.this-is-fine-overlay');
        if (existing) existing.remove();
        // Force-call with a value above danger threshold
        maybeShowThisIsFine(THRESHOLDS.danger);
        _thisIsFineCooldown = origCooldown;
    };
    window._debugEasterEggs.event404 = show404Event;
    window._debugEasterEggs.event420 = show420Event;
    window._debugEasterEggs.eventBeer = showBeerEvent;
    window._debugEasterEggs.goodCelebration = function() { showGoodCelebration(); };
    window._debugEasterEggs.calmCelebration = function() { showCalmCelebration(); };

    // Debug: preview threshold visual states on the count number
    window._debugEasterEggs.stateCalm = function() {
        var el = document.getElementById('total-active-items-count');
        if (!el) return;
        el.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
        var sirenL = document.getElementById('siren-left');
        var sirenR = document.getElementById('siren-right');
        if (sirenL) sirenL.classList.remove('active');
        if (sirenR) sirenR.classList.remove('active');
        el.classList.add('count-calm');
    };
    window._debugEasterEggs.stateGood = function() {
        var el = document.getElementById('total-active-items-count');
        if (!el) return;
        el.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
        var sirenL = document.getElementById('siren-left');
        var sirenR = document.getElementById('siren-right');
        if (sirenL) sirenL.classList.remove('active');
        if (sirenR) sirenR.classList.remove('active');
        el.classList.add('count-good');
    };
    window._debugEasterEggs.stateWarning = function() {
        var el = document.getElementById('total-active-items-count');
        if (!el) return;
        el.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
        var sirenL = document.getElementById('siren-left');
        var sirenR = document.getElementById('siren-right');
        if (sirenL) sirenL.classList.remove('active');
        if (sirenR) sirenR.classList.remove('active');
        el.classList.add('count-warning');
    };
    window._debugEasterEggs.stateDanger = function() {
        var el = document.getElementById('total-active-items-count');
        if (!el) return;
        el.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
        var sirenL = document.getElementById('siren-left');
        var sirenR = document.getElementById('siren-right');
        if (sirenL) sirenL.classList.remove('active');
        if (sirenR) sirenR.classList.remove('active');
        el.classList.add('count-danger');
    };
    window._debugEasterEggs.stateEmergency = function() {
        var el = document.getElementById('total-active-items-count');
        if (!el) return;
        el.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
        var sirenL = document.getElementById('siren-left');
        var sirenR = document.getElementById('siren-right');
        if (sirenL) sirenL.classList.add('active');
        if (sirenR) sirenR.classList.add('active');
        el.classList.add('count-emergency');
    };
    window._debugEasterEggs.stateNormal = function() {
        var el = document.getElementById('total-active-items-count');
        if (!el) return;
        el.classList.remove('count-calm', 'count-good', 'count-warning', 'count-danger', 'count-emergency', 'pulse-red');
        var sirenL = document.getElementById('siren-left');
        var sirenR = document.getElementById('siren-right');
        if (sirenL) sirenL.classList.remove('active');
        if (sirenR) sirenR.classList.remove('active');
    };

    // ========================
    //  AUTO-DIM (TV/Kiosk Mode)
    // ========================
    var dimConfig = window.AUTO_DIM || {};
    if (dimConfig.enabled) {
        // Parse "HH:MM" or plain hour number into minutes-since-midnight
        function parseTimeToMinutes(val, fallback) {
            if (val == null) return fallback;
            if (typeof val === 'string' && val.indexOf(':') !== -1) {
                var parts = val.split(':');
                return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            }
            return parseInt(val, 10) * 60;
        }
        var dimStartMin = parseTimeToMinutes(dimConfig.dim_start, 17 * 60);
        var wakeMin = parseTimeToMinutes(dimConfig.wake, 8 * 60);
        var dimWeekends = dimConfig.dim_weekends != null ? dimConfig.dim_weekends : true;
        var brightnessPct = dimConfig.brightness_percent != null ? dimConfig.brightness_percent : 15;

        // Create the dim overlay
        var dimOverlay = document.createElement('div');
        dimOverlay.id = 'auto-dim-overlay';
        dimOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'background:#000;pointer-events:none;z-index:99999;opacity:0;' +
            'transition:opacity 2s ease;';
        document.body.appendChild(dimOverlay);

        function shouldDim() {
            var now = new Date();
            var day = now.getDay(); // 0=Sun, 6=Sat
            var currentMin = now.getHours() * 60 + now.getMinutes();

            // Weekend check (Sat=6, Sun=0)
            if (dimWeekends && (day === 0 || day === 6)) {
                return true;
            }

            // After-hours check
            return currentMin >= dimStartMin || currentMin < wakeMin;
        }

        function updateDim() {
            var dimmed = shouldDim();
            // Opacity = inverse of brightness (15% bright = 85% dark overlay)
            dimOverlay.style.opacity = dimmed ? String((100 - brightnessPct) / 100) : '0';
        }

        // Check immediately and then every 30 seconds
        updateDim();
        setInterval(updateDim, 30000);

        // Debug hooks
        window._debugEasterEggs.dimOn = function() { dimOverlay.style.opacity = String((100 - brightnessPct) / 100); };
        window._debugEasterEggs.dimOff = function() { dimOverlay.style.opacity = '0'; };
    }

    // --- Debug hooks for toasts ---
    window._debugEasterEggs.testToastNew = function() {
        ToastManager.show('<strong>New Ticket: John Doe</strong><br>My computer won\'t turn on after I spilled...', 'warning', 8000);
    };
    window._debugEasterEggs.testToastClosed = function() {
        ToastManager.show('<strong>Closed: Jane Smith</strong><br>Password reset request', 'success', 6000);
    };
    window._debugEasterEggs.testToastSLA = function() {
        ToastManager.show('<strong>SLA VIOLATED: Bob Jones</strong>', 'error', 10000);
    };
    window._debugEasterEggs.testToastInfo = function() {
        ToastManager.show('<strong>Info:</strong> This is an info toast', 'info', 6000);
    };

    // --- Debug hooks for sounds ---
    window._debugEasterEggs.soundNewTicket = function() { playNewTicketSound(); };
    window._debugEasterEggs.soundSLA = function() { playSLAEscalationSound(); };
    window._debugEasterEggs.soundAll = function() {
        playNewTicketSound();
        setTimeout(playSLAEscalationSound, 1500);
    };
});
