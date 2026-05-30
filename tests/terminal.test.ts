import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TerminalManager } from '../src/core/terminal/manager.js';
import { randomUUID } from 'crypto';

describe('TerminalManager (TP-04)', () => {
    let manager: TerminalManager;

    beforeEach(() => {
        manager = new TerminalManager();
    });

    afterEach(() => {
        // Cleanup all processes
        manager.listProcesses().forEach(p => manager.killProcess(p.id));
    });

    it('should start a process and capture output', async () => {
        // A simple command that echoes "hello"
        const cmd = process.platform === 'win32' ? 'echo hello' : 'echo "hello"';
        const id = manager.startProcess(cmd, process.cwd());

        expect(id).toBeDefined();

        // Wait a bit for the process to exit
        await new Promise(resolve => setTimeout(resolve, 500));

        const status = manager.getProcessStatus(id);
        expect(status?.status).toBe('exited');

        const output = manager.getProcessOutput(id);
        expect(output).toContain('hello');
    });

    it('should truncate extremely long output to prevent OOM', async () => {
        // A command that continuously outputs data. In Windows, a simple node script can do this.
        const scriptCode = `
            for(let i=0; i<10000; i++) {
                console.log("A".repeat(100));
            }
        `;
        const cmd = `node -e "${scriptCode.replace(/"/g, '\\"')}"`;

        const id = manager.startProcess(cmd, process.cwd());

        // Let it run for 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));

        const output = manager.getProcessOutput(id, 50000); // specify max chars

        // Ensure the buffer didn't grow infinitely; the returned length is capped at 50,000 + the truncation warning length.
        expect(output.length).toBeLessThanOrEqual(51000);

        // Should contain the truncation warning if it exceeded maxChars
        if (output.includes('...(output truncated)...')) {
            expect(output.startsWith('...(output truncated)...')).toBe(true);
        }
    });

    it('should properly track and kill a running process', async () => {
        // Something that sleeps for 10 seconds
        const scriptCode = `setTimeout(() => console.log("done"), 10000);`;
        const cmd = `node -e "${scriptCode.replace(/"/g, '\\"')}"`;

        const id = manager.startProcess(cmd, process.cwd());

        let status = manager.getProcessStatus(id);
        expect(status?.status).toBe('running');

        const killed = manager.killProcess(id);
        expect(killed).toBe(true);

        status = manager.getProcessStatus(id);
        expect(status?.status).toBe('killed');
    });
});
