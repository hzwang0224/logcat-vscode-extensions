export interface Device {
    serial: string;
    model: string;
    state: string;
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
