import { LogEntry } from '../types';

// Matches threadtime format: MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: message
const THREADTIME_REGEX = /^(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?)\s*:\s+(.*)$/;

export function parseLogLine(line: string): LogEntry | null {
    const match = line.match(THREADTIME_REGEX);
    if (!match) {
        return null;
    }
    return {
        date: match[1],
        time: match[2],
        pid: match[3],
        tid: match[4],
        level: match[5],
        tag: match[6],
        message: match[7],
    };
}
