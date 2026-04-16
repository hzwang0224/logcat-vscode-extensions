import * as vscode from 'vscode';
import { AdbClient } from './adb/adbClient';
import { DeviceTreeProvider } from './sidebar/sidebarProvider';
import { LogcatPanelManager } from './webview/logcatPanelManager';

export function activate(context: vscode.ExtensionContext) {
    const adbClient = new AdbClient();
    const deviceTreeProvider = new DeviceTreeProvider(adbClient);
    const panelManager = new LogcatPanelManager(context, adbClient);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('logcat-devices', deviceTreeProvider),

        vscode.commands.registerCommand('logcat.openPanel', (serial?: string) => {
            panelManager.openPanel(serial);
        }),

        vscode.commands.registerCommand('logcat.refreshDevices', () => {
            deviceTreeProvider.refresh();
            panelManager.refreshDevices();
        }),

        panelManager
    );
}

export function deactivate() {}
