import * as vscode from 'vscode';
import * as readline from 'readline';
import { ChildProcess } from 'child_process';
import { AdbClient } from '../adb/adbClient';
import { parseLogLine } from '../adb/logParser';
import { Device, LogEntry } from '../types';
import { getWebviewContent } from './getWebviewContent';

export class LogcatPanelManager implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private logcatProcess: ChildProcess | undefined;
    private logBuffer: LogEntry[] = [];
    private flushInterval: ReturnType<typeof setInterval> | undefined;
    private paused = false;
    private pauseBuffer: LogEntry[] = [];
    private currentSerial: string | undefined;
    private pendingSerial: string | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private adbClient: AdbClient
    ) {}

    openPanel(serial?: string): void {
        if (this.panel) {
            this.panel.reveal();
            if (serial) {
                this.connectDevice(serial);
            }
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'logcat',
            'Logcat',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        const maxLogLines = vscode.workspace.getConfiguration('logcat').get<number>('maxLogLines', 10000);
        this.panel.webview.html = getWebviewContent(this.panel.webview, maxLogLines);

        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleWebviewMessage(msg),
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.stopLogcat();
            this.stopFlushInterval();
            this.panel = undefined;
        });

        this.startFlushInterval();

        if (serial) {
            this.pendingSerial = serial;
        }
    }

    private async handleWebviewMessage(msg: { type: string; serial?: string }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                await this.refreshAndMaybeReconnect(this.pendingSerial);
                this.pendingSerial = undefined;
                break;
            case 'selectDevice':
                if (msg.serial) {
                    await this.connectDevice(msg.serial);
                }
                break;
            case 'clearLogs':
                if (this.currentSerial) {
                    try {
                        await this.adbClient.clearLogcat(this.currentSerial);
                    } catch {
                        // Ignore clear errors
                    }
                }
                break;
            case 'pause':
                this.paused = true;
                break;
            case 'resume':
                this.paused = false;
                if (this.pauseBuffer.length > 0) {
                    this.logBuffer.push(...this.pauseBuffer);
                    this.pauseBuffer = [];
                }
                break;
            case 'refreshDevices':
                await this.refreshAndMaybeReconnect();
                break;
        }
    }

    refreshDevices(): void {
        this.refreshAndMaybeReconnect();
    }

    /**
     * Fetch current device list, update the webview dropdown, and:
     * - If a preferredSerial is passed (or currentSerial is set) and that device is now
     *   available with state 'device', (re)start logcat streaming.
     * - Otherwise just update the status bar to reflect the current device state.
     */
    private async refreshAndMaybeReconnect(preferredSerial?: string): Promise<void> {
        if (!this.panel) {
            return;
        }
        let devices: Device[] = [];
        try {
            devices = await this.adbClient.getDevices();
        } catch {
            this.panel.webview.postMessage({ type: 'setDevices', devices: [] });
            this.panel.webview.postMessage({ type: 'status', text: 'ADB not found or failed' });
            return;
        }
        this.panel.webview.postMessage({ type: 'setDevices', devices });

        const targetSerial = preferredSerial ?? this.currentSerial;
        if (!targetSerial) {
            this.panel.webview.postMessage({
                type: 'status',
                text: devices.length ? 'No device selected' : 'No devices connected',
            });
            return;
        }

        const device = devices.find(d => d.serial === targetSerial);
        if (!device) {
            this.stopLogcat();
            this.panel.webview.postMessage({ type: 'status', text: `Device ${targetSerial} not connected` });
            return;
        }

        if (device.state !== 'device') {
            this.stopLogcat();
            this.panel.webview.postMessage({
                type: 'status',
                text: `Device ${targetSerial} is ${device.state}`,
            });
            return;
        }

        // Device is ready. Start streaming if not already running for this serial.
        if (this.logcatProcess && this.currentSerial === targetSerial) {
            this.panel.webview.postMessage({ type: 'status', text: `Connected to ${targetSerial}` });
            this.panel.webview.postMessage({ type: 'selectDevice', serial: targetSerial });
            return;
        }
        await this.connectDevice(targetSerial, devices);
    }

    private async connectDevice(serial: string, knownDevices?: Device[]): Promise<void> {
        this.stopLogcat();
        this.currentSerial = serial;
        this.paused = false;
        this.pauseBuffer = [];

        this.panel?.webview.postMessage({ type: 'selectDevice', serial });
        this.panel?.webview.postMessage({ type: 'clearLogs' });

        // Verify device state before spawning logcat to avoid "waiting for device" noise.
        let devices = knownDevices;
        if (!devices) {
            try {
                devices = await this.adbClient.getDevices();
                this.panel?.webview.postMessage({ type: 'setDevices', devices });
            } catch {
                this.panel?.webview.postMessage({ type: 'status', text: 'ADB not found or failed' });
                return;
            }
        }
        const device = devices.find(d => d.serial === serial);
        if (!device) {
            this.panel?.webview.postMessage({ type: 'status', text: `Device ${serial} not connected` });
            return;
        }
        if (device.state !== 'device') {
            this.panel?.webview.postMessage({ type: 'status', text: `Device ${serial} is ${device.state}` });
            return;
        }

        this.panel?.webview.postMessage({ type: 'status', text: `Connected to ${serial}` });

        try {
            this.logcatProcess = this.adbClient.startLogcat(serial);
        } catch {
            this.panel?.webview.postMessage({ type: 'status', text: 'Failed to start logcat' });
            return;
        }

        const proc = this.logcatProcess;

        if (proc.stdout) {
            const rl = readline.createInterface({ input: proc.stdout });
            rl.on('line', (line) => {
                const entry = parseLogLine(line);
                if (entry) {
                    if (this.paused) {
                        if (this.pauseBuffer.length < 50000) {
                            this.pauseBuffer.push(entry);
                        }
                    } else {
                        this.logBuffer.push(entry);
                    }
                }
            });
        }

        if (proc.stderr) {
            proc.stderr.on('data', (data: Buffer) => {
                const msg = data.toString().trim();
                if (!msg) return;
                if (msg.includes('waiting for device')) {
                    this.panel?.webview.postMessage({ type: 'status', text: 'Waiting for device...' });
                } else {
                    this.panel?.webview.postMessage({ type: 'status', text: `Error: ${msg}` });
                }
            });
        }

        proc.on('close', (code) => {
            // Only update status if this is still the active process (not killed by us).
            if (this.logcatProcess === proc) {
                this.panel?.webview.postMessage({
                    type: 'status',
                    text: code === 0 ? 'Disconnected' : `Disconnected (code ${code}) — click Refresh`,
                });
                this.logcatProcess = undefined;
            }
        });
    }

    private startFlushInterval(): void {
        this.flushInterval = setInterval(() => {
            if (this.logBuffer.length > 0 && this.panel) {
                const entries = this.logBuffer;
                this.logBuffer = [];
                this.panel.webview.postMessage({ type: 'addLogs', entries });
            }
        }, 100);
    }

    private stopFlushInterval(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = undefined;
        }
    }

    private stopLogcat(): void {
        if (this.logcatProcess) {
            const proc = this.logcatProcess;
            this.logcatProcess = undefined;
            proc.kill('SIGTERM');
        }
        this.logBuffer = [];
        this.pauseBuffer = [];
    }

    dispose(): void {
        this.stopLogcat();
        this.stopFlushInterval();
        this.panel?.dispose();
    }
}
