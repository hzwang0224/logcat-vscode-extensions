import { execFile, spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { Device } from '../types';

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
}
