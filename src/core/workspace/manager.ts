import { Workspace } from './workspace.js';
import { ProviderResolver } from '../llm/resolver.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

const BLOCKED_WORKSPACE_DIR_NAMES = new Set([
    '.agent',
    '.cache',
    '.claude',
    '.git',
    '.hg',
    '.meshy',
    '.next',
    '.nuxt',
    '.sisyphus',
    '.specflow',
    '.svn',
    '.worktrees',
    '__pycache__',
    'build',
    'coverage',
    'dist',
    'node_modules',
    'public',
    'tmp',
]);

export class WorkspaceManager {
    private workspaces: Map<string, Workspace> = new Map();
    private providerResolver: ProviderResolver;
    private registryPath: string;
    private persistedWorkspaces: string[] = [];

    constructor(providerResolver: ProviderResolver, registryPath?: string) {
        this.providerResolver = providerResolver;
        this.registryPath = registryPath ?? path.join(os.homedir(), '.meshy', 'workspaces.json');
        this.loadPersistedWorkspaces();
    }

    private loadPersistedWorkspaces() {
        try {
            if (fs.existsSync(this.registryPath)) {
                const data = fs.readFileSync(this.registryPath, 'utf-8');
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    this.persistedWorkspaces = parsed;
                }
            }
        } catch (err) {
            console.error('[WorkspaceManager] Failed to load workspaces registry:', err);
        }
    }

    private savePersistedWorkspaces() {
        try {
            const dir = path.dirname(this.registryPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.registryPath, JSON.stringify(this.persistedWorkspaces, null, 2), 'utf-8');
        } catch (err) {
            console.error('[WorkspaceManager] Failed to save workspaces registry:', err);
        }
    }

    public getWorkspace(rootPath: string): Workspace {
        const resolvedPath = path.resolve(rootPath);

        // Ensure it's tracked in persistence
        this.addWorkspace(resolvedPath);

        if (this.workspaces.has(resolvedPath)) {
            return this.workspaces.get(resolvedPath)!;
        }

        const llmProvider = this.providerResolver.getProvider();
        const embeddingProvider = this.providerResolver.getEmbeddingProvider();

        const workspace = new Workspace(resolvedPath, llmProvider, embeddingProvider);
        this.workspaces.set(resolvedPath, workspace);
        return workspace;
    }

    public addWorkspace(rootPath: string): void {
        const resolvedPath = path.resolve(rootPath);
        this.assertValidWorkspaceRoot(resolvedPath);

        if (!this.persistedWorkspaces.includes(resolvedPath)) {
            this.persistedWorkspaces.push(resolvedPath);
            this.savePersistedWorkspaces();
        }
    }

    private assertValidWorkspaceRoot(resolvedPath: string): void {
        const dirName = path.basename(resolvedPath);
        const normalizedDirName = dirName.toLowerCase();

        if (BLOCKED_WORKSPACE_DIR_NAMES.has(normalizedDirName)) {
            throw new Error(`Cannot add system directory "${dirName}" as a workspace. Choose the project root instead.`);
        }

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Workspace directory does not exist: ${resolvedPath}`);
        }

        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) {
            throw new Error(`Workspace path is not a directory: ${resolvedPath}`);
        }

        try {
            fs.accessSync(resolvedPath, fs.constants.R_OK);
            fs.readdirSync(resolvedPath);
        } catch (err) {
            throw new Error(`Workspace directory is not readable: ${resolvedPath}`);
        }
    }

    public removeWorkspace(rootPath: string): void {
        const resolvedPath = path.resolve(rootPath);
        this.persistedWorkspaces = this.persistedWorkspaces.filter(p => p !== resolvedPath);
        this.savePersistedWorkspaces();

        // Also cleanup active workspace instance if it exists
        if (this.workspaces.has(resolvedPath)) {
            this.workspaces.get(resolvedPath)!.dispose();
            this.workspaces.delete(resolvedPath);
        }
    }

    public listWorkspaces(): string[] {
        return [...this.persistedWorkspaces];
    }

    public disposeAll() {
        for (const workspace of this.workspaces.values()) {
            workspace.dispose();
        }
        this.workspaces.clear();
    }
}
