import * as vscode from 'vscode';
import { AdbClient } from '../adb/adbClient';
import { Device, ProcessInfo, FileEntry } from '../types';

// ---- Node classes ----

export class DeviceNode extends vscode.TreeItem {
    readonly kind = 'device' as const;
    constructor(public readonly device: Device) {
        super(`${device.model} (${device.serial})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'device';
        this.iconPath = new vscode.ThemeIcon(device.state === 'device' ? 'device-mobile' : 'warning');
        this.command = {
            command: 'logcat.openPanel',
            title: 'Open Logcat',
            arguments: [device.serial],
        };
    }
}

export class SectionNode extends vscode.TreeItem {
    readonly kind = 'section' as const;
    constructor(
        public readonly serial: string,
        public readonly section: 'process' | 'explorer'
    ) {
        super(section === 'process' ? 'Process' : 'Explorer', vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = `section-${section}`;
        this.iconPath = new vscode.ThemeIcon(section === 'process' ? 'list-tree' : 'folder-opened');
    }
}

export class ProcessItemNode extends vscode.TreeItem {
    readonly kind = 'process' as const;
    constructor(public readonly info: ProcessInfo) {
        super(info.name, vscode.TreeItemCollapsibleState.None);
        this.description = `PID: ${info.pid}`;
        this.tooltip = `Name: ${info.name}\nPID: ${info.pid}\nUser: ${info.user}`;
        this.contextValue = 'processItem';
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }
}

export class FileNode extends vscode.TreeItem {
    readonly kind = 'file' as const;
    constructor(
        public readonly serial: string,
        public readonly entry: FileEntry
    ) {
        super(entry.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = entry.isDirectory ? 'directory' : 'file';
        this.iconPath = new vscode.ThemeIcon(entry.isDirectory ? 'folder' : 'file');
        this.tooltip = entry.path;
        this.description = undefined;
    }
}

export class MessageNode extends vscode.TreeItem {
    readonly kind = 'message' as const;
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'message';
    }
}

type TreeNode = DeviceNode | SectionNode | ProcessItemNode | FileNode | MessageNode;

// ---- Provider ----

export class DeviceTreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private adbClient: AdbClient) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            let devices: Device[];
            try {
                devices = await this.adbClient.getDevices();
            } catch {
                devices = [];
            }
            if (devices.length === 0) {
                return [new MessageNode('No devices connected')];
            }
            return devices.map(d => new DeviceNode(d));
        }

        if (element.kind === 'device') {
            return [
                new SectionNode(element.device.serial, 'process'),
                new SectionNode(element.device.serial, 'explorer'),
            ];
        }

        if (element.kind === 'section' && element.section === 'process') {
            try {
                const processes = await this.adbClient.getProcesses(element.serial);
                if (processes.length === 0) { return [new MessageNode('No processes found')]; }
                return processes.map(p => new ProcessItemNode(p));
            } catch {
                return [new MessageNode('Failed to load processes')];
            }
        }

        if (element.kind === 'section' && element.section === 'explorer') {
            try {
                const entries = await this.adbClient.listFiles(element.serial, '/');
                if (entries.length === 0) { return [new MessageNode('Empty')]; }
                return entries.map(e => new FileNode(element.serial, e));
            } catch {
                return [new MessageNode('Failed to load filesystem')];
            }
        }

        if (element.kind === 'file' && element.entry.isDirectory) {
            try {
                const entries = await this.adbClient.listFiles(element.serial, element.entry.path);
                if (entries.length === 0) { return [new MessageNode('Empty')]; }
                return entries.map(e => new FileNode(element.serial, e));
            } catch {
                return [new MessageNode('Permission denied')];
            }
        }

        if (element.kind === 'file') {
            return [new MessageNode('File preview not supported')];
        }

        return [];
    }
}
