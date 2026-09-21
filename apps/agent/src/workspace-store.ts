import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  WorkspaceDefinitionSchema,
  type WorkspaceDefinition
} from "@palmtty/protocol";
import { z } from "zod";

const MAX_WORKSPACES = 256;

const WorkspaceFileSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(WorkspaceDefinitionSchema).max(MAX_WORKSPACES)
}).strict();

export interface WorkspaceStore {
  initialize(): Promise<void>;
  list(): WorkspaceDefinition[];
  get(id: string): WorkspaceDefinition | undefined;
  create(workspace: WorkspaceDefinition): Promise<void>;
  replace(id: string, workspace: WorkspaceDefinition): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

function cloneWorkspace(workspace: WorkspaceDefinition): WorkspaceDefinition {
  return WorkspaceDefinitionSchema.parse(workspace);
}

function validateUnique(workspaces: WorkspaceDefinition[]): void {
  const ids = new Set<string>();
  for (const workspace of workspaces) {
    if (ids.has(workspace.id)) {
      throw new Error(`Duplicate workspace id in persistent state: ${workspace.id}`);
    }
    ids.add(workspace.id);
  }
}

export function defaultWorkspaceStorePath(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? os.homedir(),
      "PalmTTY",
      "workspaces.json"
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "PalmTTY",
      "workspaces.json"
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "palmtty",
    "workspaces.json"
  );
}

export class FileWorkspaceStore implements WorkspaceStore {
  private workspaces = new Map<string, WorkspaceDefinition>();
  private initialized = false;
  private mutationPipeline: Promise<void> = Promise.resolve();

  constructor(readonly filePath = defaultWorkspaceStorePath()) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(directory, 0o700);
    }

    try {
      const source = await readFile(this.filePath, "utf8");
      const parsed = WorkspaceFileSchema.parse(JSON.parse(source));
      validateUnique(parsed.workspaces);
      this.workspaces = new Map(
        parsed.workspaces.map((workspace) => [workspace.id, workspace])
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist([]);
    }

    this.initialized = true;
  }

  list(): WorkspaceDefinition[] {
    this.requireInitialized();
    return [...this.workspaces.values()]
      .map(cloneWorkspace)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): WorkspaceDefinition | undefined {
    this.requireInitialized();
    const workspace = this.workspaces.get(id);
    return workspace ? cloneWorkspace(workspace) : undefined;
  }

  async create(workspace: WorkspaceDefinition): Promise<void> {
    await this.mutate((next) => {
      if (next.has(workspace.id)) {
        throw new Error("Workspace id already exists");
      }
      if (next.size >= MAX_WORKSPACES) {
        throw new Error(`Maximum workspace count reached (${MAX_WORKSPACES})`);
      }
      next.set(workspace.id, cloneWorkspace(workspace));
      return true;
    });
  }

  async replace(id: string, workspace: WorkspaceDefinition): Promise<boolean> {
    return this.mutate((next) => {
      if (!next.has(id)) return false;
      next.set(id, cloneWorkspace({ ...workspace, id }));
      return true;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.mutate((next) => next.delete(id));
  }

  private async mutate(
    change: (next: Map<string, WorkspaceDefinition>) => boolean
  ): Promise<boolean> {
    this.requireInitialized();
    let changed = false;
    let result = false;
    const run = this.mutationPipeline.then(async () => {
      const next = new Map(this.workspaces);
      result = change(next);
      changed = result;
      if (!changed) return;
      await this.persist([...next.values()]);
      this.workspaces = next;
    });
    this.mutationPipeline = run.then(() => undefined, () => undefined);
    await run;
    return result;
  }

  private async persist(workspaces: WorkspaceDefinition[]): Promise<void> {
    const document = JSON.stringify(
      WorkspaceFileSchema.parse({ version: 1, workspaces }),
      null,
      2
    ) + "\n";
    const directory = path.dirname(this.filePath);
    const temporary = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
    );
    try {
      await writeFile(temporary, document, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx"
      });
      if (process.platform !== "win32") await chmod(temporary, 0o600);
      await rename(temporary, this.filePath);
      if (process.platform !== "win32") await chmod(this.filePath, 0o600);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private requireInitialized(): void {
    if (!this.initialized) throw new Error("Workspace store is not initialized");
  }
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  private readonly workspaces = new Map<string, WorkspaceDefinition>();
  private initialized = false;

  constructor(initial: WorkspaceDefinition[] = []) {
    validateUnique(initial);
    for (const workspace of initial) {
      this.workspaces.set(workspace.id, cloneWorkspace(workspace));
    }
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  list(): WorkspaceDefinition[] {
    this.requireInitialized();
    return [...this.workspaces.values()]
      .map(cloneWorkspace)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): WorkspaceDefinition | undefined {
    this.requireInitialized();
    const workspace = this.workspaces.get(id);
    return workspace ? cloneWorkspace(workspace) : undefined;
  }

  async create(workspace: WorkspaceDefinition): Promise<void> {
    this.requireInitialized();
    if (this.workspaces.has(workspace.id)) throw new Error("Workspace id already exists");
    if (this.workspaces.size >= MAX_WORKSPACES) throw new Error("Maximum workspace count reached");
    this.workspaces.set(workspace.id, cloneWorkspace(workspace));
  }

  async replace(id: string, workspace: WorkspaceDefinition): Promise<boolean> {
    this.requireInitialized();
    if (!this.workspaces.has(id)) return false;
    this.workspaces.set(id, cloneWorkspace({ ...workspace, id }));
    return true;
  }

  async delete(id: string): Promise<boolean> {
    this.requireInitialized();
    return this.workspaces.delete(id);
  }

  private requireInitialized(): void {
    if (!this.initialized) throw new Error("Workspace store is not initialized");
  }
}
