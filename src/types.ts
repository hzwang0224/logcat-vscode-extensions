export interface Device {
    serial: string;
    model: string;
    state: string;
}

export interface ProcessInfo {
    pid: string;
    user: string;
    name: string;
}

export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
}

export interface LogEntry {
    date: string;
    time: string;
    pid: string;
    tid: string;
    level: string;
    tag: string;
    message: string;
}
