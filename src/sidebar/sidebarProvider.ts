import * as vscode from 'vscode';
import { AdbClient } from '../adb/adbClient';
import { Device } from '../types';

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<DeviceTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private devices: Device[] = [];

    constructor(private adbClient: AdbClient) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    async getChildren(): Promise<DeviceTreeItem[]> {
        try {
            this.devices = await this.adbClient.getDevices();
        } catch {
            this.devices = [];
        }

        if (this.devices.length === 0) {
            return [new DeviceTreeItem('No devices connected', '', 'none', vscode.TreeItemCollapsibleState.None)];
        }

        return this.devices.map(d =>
            new DeviceTreeItem(
                `${d.model} (${d.serial})`,
                d.serial,
                d.state,
                vscode.TreeItemCollapsibleState.None
            )
        );
    }

    getTreeItem(element: DeviceTreeItem): vscode.TreeItem {
        return element;
    }
}

export class DeviceTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly serial: string,
        public readonly state: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        if (serial) {
            this.command = {
                command: 'logcat.openPanel',
                title: 'Open Logcat',
                arguments: [serial],
            };
            this.contextValue = 'device';
            this.iconPath = new vscode.ThemeIcon(state === 'device' ? 'device-mobile' : 'warning');
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}
