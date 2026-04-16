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
        #device-select {
            height: 22px;
            padding: 0 4px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border, transparent);
            border-radius: 2px;
            font-family: var(--ui-font);
            font-size: var(--ui-size);
            min-width: 180px;
            max-width: 320px;
            outline: none;
        }
        #device-select:focus {
            border-color: var(--vscode-focusBorder);
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
    </style>
</head>
<body>
    <div id="toolbar">
        <select id="device-select" title="Device">
            <option value="">-- Select Device --</option>
        </select>
        <input id="filter-input" type="text" placeholder="Filter (text, level:W, tag:MyApp, pid:1234)" />
        <button class="toolbar-btn" id="btn-clear" title="Clear logs">Clear</button>
        <button class="toolbar-btn" id="btn-pause" title="Pause streaming">Pause</button>
        <button class="toolbar-btn" id="btn-refresh" title="Refresh device list">Refresh</button>
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

        const deviceSelect = document.getElementById('device-select');
        const filterInput = document.getElementById('filter-input');
        const btnClear = document.getElementById('btn-clear');
        const btnPause = document.getElementById('btn-pause');
        const btnRefresh = document.getElementById('btn-refresh');
        const btnFormat = document.getElementById('btn-format');
        const formatMenu = document.getElementById('format-menu');
        const logTable = document.getElementById('log-table');
        const logContainer = document.getElementById('log-container');
        const lineCountEl = document.getElementById('line-count');
        const statusTextEl = document.getElementById('status-text');

        let paused = false;
        let totalLines = 0;
        let filterText = '';
        let filterTerms = [];
        let autoScroll = true;

        // ----- Auto-scroll detection -----
        logContainer.addEventListener('scroll', () => {
            const threshold = 50;
            autoScroll = (logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight) < threshold;
        });

        // ----- Device selection -----
        deviceSelect.addEventListener('change', () => {
            const serial = deviceSelect.value;
            if (serial) {
                vscode.postMessage({ type: 'selectDevice', serial });
                statusTextEl.textContent = 'Connecting...';
            }
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

        btnRefresh.addEventListener('click', () => {
            vscode.postMessage({ type: 'refreshDevices' });
            statusTextEl.textContent = 'Refreshing...';
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
        }

        function createRow(entry) {
            const row = document.createElement('div');
            row.className = 'log-row level-' + entry.level;
            row.dataset.text = (entry.date + ' ' + entry.time + ' ' + entry.pid + ' ' + entry.tid + ' ' + entry.tag + ' ' + entry.message).toLowerCase();
            row.dataset.level = entry.level.toLowerCase();
            row.dataset.tag = entry.tag.toLowerCase();
            row.dataset.pid = entry.pid;

            row.innerHTML =
                '<span class="col-time">' + escapeHtml(entry.date + ' ' + entry.time) + '</span>' +
                '<span class="col-pid">' + escapeHtml(entry.pid + '-' + entry.tid) + '</span>' +
                '<span class="col-tag">' + escapeHtml(entry.tag) + '</span>' +
                '<span class="col-level">' + escapeHtml(entry.level) + '</span>' +
                '<span class="col-msg">' + escapeHtml(entry.message) + '</span>';

            if (!matchesFilter(row.dataset.text, row.dataset.level, row.dataset.tag, row.dataset.pid)) {
                row.classList.add('hidden');
            }
            return row;
        }

        function escapeHtml(str) {
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function trimOldRows() {
            if (totalLines > MAX_LINES) {
                const removeCount = TRIM_AMOUNT;
                for (let i = 0; i < removeCount && logTable.firstChild; i++) {
                    logTable.removeChild(logTable.firstChild);
                }
                totalLines -= removeCount;
            }
        }

        // ----- Messages from extension -----
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'setDevices': {
                    const current = deviceSelect.value;
                    deviceSelect.innerHTML = '<option value="">-- Select Device --</option>';
                    msg.devices.forEach(d => {
                        const opt = document.createElement('option');
                        opt.value = d.serial;
                        const label = d.state === 'device'
                            ? d.model + ' (' + d.serial + ')'
                            : d.model + ' (' + d.serial + ') [' + d.state + ']';
                        opt.textContent = label;
                        deviceSelect.appendChild(opt);
                    });
                    // Restore selection if still present
                    if (current && msg.devices.some(d => d.serial === current)) {
                        deviceSelect.value = current;
                    }
                    break;
                }
                case 'addLogs': {
                    const fragment = document.createDocumentFragment();
                    msg.entries.forEach(entry => {
                        fragment.appendChild(createRow(entry));
                    });
                    logTable.appendChild(fragment);
                    totalLines += msg.entries.length;
                    trimOldRows();
                    lineCountEl.textContent = totalLines + ' lines';
                    if (autoScroll) {
                        logContainer.scrollTop = logContainer.scrollHeight;
                    }
                    break;
                }
                case 'clearLogs': {
                    logTable.innerHTML = '';
                    totalLines = 0;
                    lineCountEl.textContent = '0 lines';
                    break;
                }
                case 'status': {
                    statusTextEl.textContent = msg.text;
                    break;
                }
                case 'selectDevice': {
                    deviceSelect.value = msg.serial;
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
