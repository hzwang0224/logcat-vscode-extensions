import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, maxLogLines: number): string {
    const nonce = getNonce();

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Logcat</title>
    <style nonce="${nonce}">
        :root {
            --ui-font: var(--vscode-font-family);
            --ui-size: var(--vscode-font-size);
            --mono-font: var(--vscode-editor-font-family);
            --mono-size: var(--vscode-editor-font-size);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            font-family: var(--ui-font);
            font-size: var(--ui-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            height: 100vh;
            overflow: hidden;
        }
        body {
            display: flex;
            flex-direction: column;
        }

        /* ---------- Toolbar ---------- */
        #toolbar {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 6px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            font-size: var(--ui-size);
        }
        #filter-input {
            flex: 1;
            height: 22px;
            min-width: 100px;
            padding: 0 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 2px;
            font-family: var(--ui-font);
            font-size: var(--ui-size);
            outline: none;
        }
        #filter-input:focus {
            border-color: var(--vscode-focusBorder);
        }
        #filter-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .toolbar-btn {
            height: 22px;
            padding: 0 8px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid transparent;
            border-radius: 2px;
            cursor: pointer;
            font-family: var(--ui-font);
            font-size: var(--ui-size);
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }
        .toolbar-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .toolbar-btn:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        .toolbar-btn.active {
            background: var(--vscode-toolbar-activeBackground, var(--vscode-button-secondaryHoverBackground));
        }

        /* ---------- Popup menu (Format) ---------- */
        .popup-wrapper { position: relative; }
        .popup-menu {
            position: absolute;
            top: calc(100% + 2px);
            right: 0;
            min-width: 180px;
            background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
            color: var(--vscode-menu-foreground, var(--vscode-foreground));
            border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border));
            border-radius: 3px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            padding: 4px 0;
            z-index: 100;
            font-size: var(--ui-size);
        }
        .popup-menu label {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            cursor: pointer;
            user-select: none;
        }
        .popup-menu label:hover {
            background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
            color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
        }
        .popup-menu input[type="checkbox"] {
            margin: 0;
            accent-color: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
        }
        .hidden { display: none !important; }

        /* ---------- Log area ---------- */
        #log-container {
            flex: 1;
            overflow-y: auto;
            overflow-x: auto;
            font-family: var(--mono-font);
            font-size: var(--mono-size);
            line-height: 1.4;
        }
        #log-table {
            min-width: 100%;
        }
        .log-row {
            display: flex;
            white-space: nowrap;
            padding: 0 8px;
        }
        .log-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .col-time   { width: 170px; flex-shrink: 0; color: var(--vscode-descriptionForeground); padding-right: 10px; }
        .col-pid    { width: 110px; flex-shrink: 0; color: var(--vscode-descriptionForeground); padding-right: 10px; }
        .col-tag    { width: 200px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
        .col-level  { width: 16px; flex-shrink: 0; text-align: center; font-weight: bold; padding-right: 6px; }
        .col-msg    { flex: 1; min-width: 0; }

        /* Column hide toggles driven by body class */
        body.hide-time .col-time   { display: none; }
        body.hide-pid  .col-pid    { display: none; }
        body.hide-tag  .col-tag    { display: none; }
        body.hide-level .col-level { display: none; }

        .level-V { color: #888888; }
        .level-D .col-tag, .level-D .col-level, .level-D .col-msg { color: #4fc3f7; }
        .level-I .col-tag, .level-I .col-level, .level-I .col-msg { color: #81c784; }
        .level-W .col-tag, .level-W .col-level, .level-W .col-msg { color: #ffb74d; }
        .level-E .col-tag, .level-E .col-level, .level-E .col-msg { color: #f44336; }
        .level-F .col-tag, .level-F .col-level, .level-F .col-msg { color: #ff5252; background: rgba(244,67,54,0.15); }

        /* ---------- Status bar ---------- */
        #status-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 2px 8px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px;
            flex-shrink: 0;
        }

        /* ---------- Search bar ---------- */
        #search-bar {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 6px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            font-size: var(--ui-size);
        }
        #search-input {
            flex: 1;
            max-width: 300px;
            height: 22px;
            padding: 0 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 2px;
            font-family: var(--ui-font);
            font-size: var(--ui-size);
            outline: none;
        }
        #search-input:focus { border-color: var(--vscode-focusBorder); }
        #search-count {
            color: var(--vscode-descriptionForeground);
            font-size: var(--ui-size);
            white-space: nowrap;
            min-width: 60px;
        }
        mark.search-hl {
            background: var(--vscode-editor-findMatchHighlightBackground, rgba(255,215,0,0.4));
            color: inherit;
            border-radius: 1px;
        }
        .search-focused mark.search-hl {
            background: var(--vscode-editor-findMatchBackground, rgba(255,140,0,0.7));
        }

        /* ---------- Word wrap ---------- */
        body.word-wrap #log-container { overflow-x: hidden; }
        body.word-wrap .log-row { white-space: normal; }
        body.word-wrap .col-tag { text-overflow: unset; overflow: visible; }
        body.word-wrap .col-msg { white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; }
    </style>
</head>
<body>
    <div id="toolbar">
        <input id="filter-input" type="text" placeholder="Filter (text, level:W, tag:MyApp, pid:1234)" />
        <button class="toolbar-btn" id="btn-clear" title="Clear logs">Clear</button>
        <button class="toolbar-btn" id="btn-pause" title="Pause streaming">Pause</button>
        <button class="toolbar-btn" id="btn-wrap" title="Toggle word wrap">Wrap</button>
        <div class="popup-wrapper">
            <button class="toolbar-btn" id="btn-format" title="Column visibility">Format <span>\u25BE</span></button>
            <div id="format-menu" class="popup-menu hidden">
                <label><input type="checkbox" data-col="time" checked>Timestamp</label>
                <label><input type="checkbox" data-col="pid" checked>PID-TID</label>
                <label><input type="checkbox" data-col="tag" checked>Tag</label>
                <label><input type="checkbox" data-col="level" checked>Level</label>
            </div>
        </div>
    </div>
    <div id="search-bar" class="hidden">
        <button class="toolbar-btn" id="btn-search-prev" title="Previous match (Shift+Enter)">&#8593;</button>
        <button class="toolbar-btn" id="btn-search-next" title="Next match (Enter)">&#8595;</button>
        <input id="search-input" type="text" placeholder="Find in logs…" />
        <span id="search-count"></span>
        <button class="toolbar-btn" id="btn-search-close" title="Close (Escape)">&#10005;</button>
    </div>
    <div id="log-container">
        <div id="log-table"></div>
    </div>
    <div id="status-bar">
        <span id="line-count">0 lines</span>
        <span id="status-text">Initializing...</span>
    </div>

    <script nonce="${nonce}">
    (function() {
        const vscode = acquireVsCodeApi();
        const MAX_LINES = ${maxLogLines};
        const TRIM_AMOUNT = Math.floor(MAX_LINES * 0.2);

        const filterInput = document.getElementById('filter-input');
        const btnClear = document.getElementById('btn-clear');
        const btnPause = document.getElementById('btn-pause');
        const btnWrap = document.getElementById('btn-wrap');
        const btnFormat = document.getElementById('btn-format');
        const formatMenu = document.getElementById('format-menu');
        const searchBar = document.getElementById('search-bar');
        const searchInput = document.getElementById('search-input');
        const searchCount = document.getElementById('search-count');
        const btnSearchPrev = document.getElementById('btn-search-prev');
        const btnSearchNext = document.getElementById('btn-search-next');
        const btnSearchClose = document.getElementById('btn-search-close');
        const logTable = document.getElementById('log-table');
        const logContainer = document.getElementById('log-container');
        const lineCountEl = document.getElementById('line-count');
        const statusTextEl = document.getElementById('status-text');

        let paused = false;
        let totalLines = 0;
        let filterText = '';
        let filterTerms = [];
        let autoScroll = true;
        let searchText = '';
        let searchMatches = [];
        let searchIndex = -1;

        // ----- Auto-scroll detection -----
        logContainer.addEventListener('scroll', () => {
            const threshold = 50;
            autoScroll = (logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight) < threshold;
        });

        // ----- Filter (debounced) -----
        let filterTimeout;
        filterInput.addEventListener('input', () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                filterText = filterInput.value.toLowerCase();
                filterTerms = filterText.split(/\\s+/).filter(Boolean);
                applyFilterToAll();
            }, 200);
        });

        // ----- Toolbar buttons -----
        btnClear.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearLogs' });
            logTable.innerHTML = '';
            totalLines = 0;
            lineCountEl.textContent = '0 lines';
        });

        btnPause.addEventListener('click', () => {
            paused = !paused;
            btnPause.textContent = paused ? 'Resume' : 'Pause';
            btnPause.classList.toggle('active', paused);
            vscode.postMessage({ type: paused ? 'pause' : 'resume' });
        });

        // ----- Format popup menu -----
        btnFormat.addEventListener('click', (e) => {
            e.stopPropagation();
            formatMenu.classList.toggle('hidden');
            btnFormat.classList.toggle('active', !formatMenu.classList.contains('hidden'));
        });
        document.addEventListener('click', (e) => {
            if (!formatMenu.classList.contains('hidden') && !formatMenu.contains(e.target) && e.target !== btnFormat) {
                formatMenu.classList.add('hidden');
                btnFormat.classList.remove('active');
            }
        });
        formatMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const col = cb.dataset.col;
                document.body.classList.toggle('hide-' + col, !cb.checked);
            });
        });

        // ----- Filter logic -----
        function matchesFilter(text, level, tag, pid) {
            if (filterTerms.length === 0) return true;
            return filterTerms.every(term => {
                if (term.startsWith('level:')) return term.slice(6).includes(level.toLowerCase());
                if (term.startsWith('tag:')) return tag.toLowerCase().includes(term.slice(4));
                if (term.startsWith('pid:')) return pid === term.slice(4);
                return text.includes(term);
            });
        }

        function applyFilterToAll() {
            const rows = logTable.children;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const visible = matchesFilter(
                    row.dataset.text,
                    row.dataset.level,
                    row.dataset.tag,
                    row.dataset.pid
                );
                row.classList.toggle('hidden', !visible);
            }
            if (searchText) { rebuildSearchMatches(); }
        }

        function escapeHtml(str) {
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function escapeRegex(str) {
            return str.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
        }

        function renderRowContent(row, hl) {
            function buildSpan(orig) {
                if (!hl) return escapeHtml(orig);
                const parts = orig.split(new RegExp('(' + escapeRegex(hl) + ')', 'gi'));
                return parts.map(p => p.toLowerCase() === hl.toLowerCase()
                    ? '<mark class="search-hl">' + escapeHtml(p) + '</mark>'
                    : escapeHtml(p)
                ).join('');
            }
            row.innerHTML =
                '<span class="col-time">' + buildSpan(row.dataset.origTime || '') + '</span>' +
                '<span class="col-pid">'  + buildSpan(row.dataset.origPid  || '') + '</span>' +
                '<span class="col-tag">'  + buildSpan(row.dataset.origTag  || '') + '</span>' +
                '<span class="col-level">'+ buildSpan(row.dataset.origLevel|| '') + '</span>' +
                '<span class="col-msg">'  + buildSpan(row.dataset.origMsg  || '') + '</span>';
        }

        function createRow(entry) {
            const row = document.createElement('div');
            row.className = 'log-row level-' + entry.level;
            row.dataset.text = (entry.date + ' ' + entry.time + ' ' + entry.pid + ' ' + entry.tid + ' ' + entry.tag + ' ' + entry.message).toLowerCase();
            row.dataset.level = entry.level.toLowerCase();
            row.dataset.tag = entry.tag.toLowerCase();
            row.dataset.pid = entry.pid;
            row.dataset.origTime  = entry.date + ' ' + entry.time;
            row.dataset.origPid   = entry.pid + '-' + entry.tid;
            row.dataset.origTag   = entry.tag;
            row.dataset.origLevel = entry.level;
            row.dataset.origMsg   = entry.message;
            renderRowContent(row, searchText);
            if (!matchesFilter(row.dataset.text, row.dataset.level, row.dataset.tag, row.dataset.pid)) {
                row.classList.add('hidden');
            }
            return row;
        }

        function trimOldRows() {
            if (totalLines > MAX_LINES) {
                for (let i = 0; i < TRIM_AMOUNT && logTable.firstChild; i++) {
                    logTable.removeChild(logTable.firstChild);
                }
                totalLines -= TRIM_AMOUNT;
                if (searchText) { rebuildSearchMatches(); }
            }
        }

        // ----- Search helpers -----
        function rebuildSearchMatches() {
            const focused = searchIndex >= 0 && searchIndex < searchMatches.length ? searchMatches[searchIndex] : null;
            searchMatches = [];
            const rows = logTable.children;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row.classList.contains('hidden') && row.dataset.text.includes(searchText.toLowerCase())) {
                    searchMatches.push(row);
                }
            }
            if (focused && searchMatches.includes(focused)) {
                searchIndex = searchMatches.indexOf(focused);
            } else {
                searchIndex = searchMatches.length > 0 ? 0 : -1;
                if (searchIndex === 0) { searchMatches[0].classList.add('search-focused'); }
            }
            searchCount.textContent = searchMatches.length > 0
                ? (searchIndex + 1) + ' / ' + searchMatches.length
                : (searchText ? 'No results' : '');
        }

        function updateSearch(text) {
            searchText = text;
            if (searchIndex >= 0 && searchIndex < searchMatches.length) {
                searchMatches[searchIndex].classList.remove('search-focused');
            }
            searchMatches = [];
            searchIndex = -1;
            const rows = logTable.children;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                row.classList.remove('search-focused');
                renderRowContent(row, text);
                if (text && !row.classList.contains('hidden') && row.dataset.text.includes(text.toLowerCase())) {
                    searchMatches.push(row);
                }
            }
            if (searchMatches.length > 0) { navigateTo(0); }
            else { searchCount.textContent = text ? 'No results' : ''; }
        }

        function navigateTo(index) {
            if (searchMatches.length === 0) return;
            if (searchIndex >= 0 && searchIndex < searchMatches.length) {
                searchMatches[searchIndex].classList.remove('search-focused');
            }
            searchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
            searchMatches[searchIndex].classList.add('search-focused');
            searchMatches[searchIndex].scrollIntoView({ block: 'nearest' });
            searchCount.textContent = (searchIndex + 1) + ' / ' + searchMatches.length;
        }

        function openSearch() {
            searchBar.classList.remove('hidden');
            searchInput.focus();
            searchInput.select();
        }

        function closeSearch() {
            searchBar.classList.add('hidden');
            const prevText = searchText;
            searchText = '';
            searchMatches = [];
            searchIndex = -1;
            searchInput.value = '';
            searchCount.textContent = '';
            if (prevText) {
                const rows = logTable.children;
                for (let i = 0; i < rows.length; i++) {
                    rows[i].classList.remove('search-focused');
                    renderRowContent(rows[i], '');
                }
            }
        }

        // ----- Word wrap -----
        btnWrap.addEventListener('click', () => {
            document.body.classList.toggle('word-wrap');
            btnWrap.classList.toggle('active', document.body.classList.contains('word-wrap'));
        });

        // ----- Ctrl+F / Escape -----
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                openSearch();
            } else if (e.key === 'Escape' && !searchBar.classList.contains('hidden')) {
                closeSearch();
            }
        });

        // ----- Search bar events -----
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) { navigateTo(searchIndex - 1); }
                else { navigateTo(searchIndex + 1); }
            } else if (e.key === 'Escape') {
                closeSearch();
            }
        });
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => updateSearch(searchInput.value), 150);
        });
        btnSearchPrev.addEventListener('click', () => navigateTo(searchIndex - 1));
        btnSearchNext.addEventListener('click', () => navigateTo(searchIndex + 1));
        btnSearchClose.addEventListener('click', closeSearch);

        // ----- Messages from extension -----
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'addLogs': {
                    const fragment = document.createDocumentFragment();
                    const newMatchRows = [];
                    msg.entries.forEach(entry => {
                        const row = createRow(entry);
                        fragment.appendChild(row);
                        if (searchText && !row.classList.contains('hidden') && row.dataset.text.includes(searchText.toLowerCase())) {
                            newMatchRows.push(row);
                        }
                    });
                    logTable.appendChild(fragment);
                    totalLines += msg.entries.length;
                    trimOldRows();
                    lineCountEl.textContent = totalLines + ' lines';
                    if (newMatchRows.length > 0) {
                        searchMatches.push(...newMatchRows);
                        if (searchIndex === -1) { searchIndex = 0; searchMatches[0].classList.add('search-focused'); }
                        searchCount.textContent = (searchIndex + 1) + ' / ' + searchMatches.length;
                    }
                    if (autoScroll) {
                        logContainer.scrollTop = logContainer.scrollHeight;
                    }
                    break;
                }
                case 'clearLogs': {
                    logTable.innerHTML = '';
                    totalLines = 0;
                    lineCountEl.textContent = '0 lines';
                    searchMatches = [];
                    searchIndex = -1;
                    if (searchText) { searchCount.textContent = 'No results'; }
                    break;
                }
                case 'status': {
                    statusTextEl.textContent = msg.text;
                    break;
                }
            }
        });

        // ----- Ready signal -----
        vscode.postMessage({ type: 'ready' });
    })();
    </script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
