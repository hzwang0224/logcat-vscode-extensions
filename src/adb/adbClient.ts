import { execFile, spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { Device, ProcessInfo, FileEntry } from '../types';

export class AdbClient {
    private getAdbPath(): string {
        return vscode.workspace.getConfiguration('logcat').get<string>('adbPath', 'adb');
    }

    getDevices(): Promise<Device[]> {
        return new Promise((resolve, reject) => {
            execFile(this.getAdbPath(), ['devices', '-l'], (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Failed to run adb: ${error.message}. Check logcat.adbPath setting.`));
                    return;
                }
                const devices: Device[] = [];
                const lines = stdout.split('\n');
                for (const line of lines) {
                    // Skip header and empty lines
                    if (!line.trim() || line.startsWith('List of devices')) {
                        continue;
                    }
                    const parts = line.split(/\s+/);
                    if (parts.length < 2) {
                        continue;
                    }
                    const serial = parts[0];
                    const state = parts[1];
                    // Extract model from properties like "model:Pixel_6"
                    const modelMatch = line.match(/model:(\S+)/);
                    const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : serial;
                    devices.push({ serial, model, state });
                }
                resolve(devices);
            });
        });
    }

    startLogcat(serial: string): ChildProcess {
        const proc = spawn(this.getAdbPath(), ['-s', serial, 'logcat', '-v', 'threadtime']);
        return proc;
    }

    clearLogcat(serial: string): Promise<void> {
        return new Promise((resolve, reject) => {
            execFile(this.getAdbPath(), ['-s', serial, 'logcat', '-c'], (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    getProcesses(serial: string): Promise<ProcessInfo[]> {
        return new Promise((resolve, reject) => {
            execFile(this.getAdbPath(), ['-s', serial, 'shell', 'ps', '-A'], (error, stdout) => {
                if (error) { reject(error); return; }
                const lines = stdout.split('\n');
                const processes: ProcessInfo[] = [];
                for (const line of lines.slice(1)) {
                    const trimmed = line.trim();
                    if (!trimmed) { continue; }
                    const parts = trimmed.split(/\s+/);
                    if (parts.length < 2) { continue; }
                    const user = parts[0];
                    const pid = parts[1];
                    const name = parts[parts.length - 1];
                    if (!pid || isNaN(Number(pid))) { continue; }
                    processes.push({ pid, user, name });
                }
                processes.sort((a, b) => a.name.localeCompare(b.name));
                resolve(processes);
            });
        });
    }

    listFiles(serial: string, path: string): Promise<FileEntry[]> {
        return new Promise((resolve, reject) => {
            execFile(this.getAdbPath(), ['-s', serial, 'shell', 'ls', '-laL', path], (error, stdout) => {
                if (error) { reject(error); return; }
                const entries: FileEntry[] = [];
                // Match modern Android date: 2024-01-01 12:00  OR older: Jan  1 12:00
                const modernDate = /^([dlrwx\-]{10})\s+.*?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.*)/;
                const olderDate = /^([dlrwx\-]{10})\s+.*?\w{3}\s+\d+\s+[\d:]+\s+(.*)/;
                for (const line of stdout.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('total') || trimmed.endsWith(':')) { continue; }
                    const m = trimmed.match(modernDate) || trimmed.match(olderDate);
                    if (!m) { continue; }
                    const perms = m[1];
                    let nameField = m[2].trim();
                    const arrowIdx = nameField.indexOf(' -> ');
                    if (arrowIdx !== -1) { nameField = nameField.substring(0, arrowIdx); }
                    if (!nameField || nameField === '.' || nameField === '..') { continue; }
                    // 'd' = directory, 'l' = symlink entry from the parent listing.
                    const isDirectory = perms.startsWith('d') || perms.startsWith('l');
                    const entryPath = path === '/' ? `/${nameField}` : `${path}/${nameField}`;
                    entries.push({ name: nameField, path: entryPath, isDirectory });
                }
                entries.sort((a, b) => a.name.localeCompare(b.name));
                resolve(entries);
            });
        });
    }
}
