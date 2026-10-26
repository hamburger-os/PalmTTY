// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n.js";
import { WebApplicationPanel, workspaceCodeUrl } from "./WebApplications.js";
import type { WorkspacePublic } from "@palmtty/protocol";
vi.mock("./api.js", () => ({ authorizeWebApp: vi.fn(), ensureWebApp: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const workspace: WorkspacePublic = { id: "workspace-test", name: "Test", cwd: "C:\\work\\项目 #1", terminal: { runtime: {kind: "host", args: []} } };
it("routes Code to the persisted host workspace and does not guess WSL mappings", () => {
  expect(new URL(workspaceCodeUrl("https://code.example.test/", workspace)!).searchParams.get("folder")).toBe("/C:/work/项目 #1");
  expect(workspaceCodeUrl("https://code.example.test/", {...workspace, terminal: { runtime: {kind: "wsl", args: []} }})).toBeUndefined();
});
it("keeps the frame on presentation changes and never offers install for a running app without an entry", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = async (url?: string) => act(async () => root.render(<I18nProvider>
    <WebApplicationPanel id="vscodeWeb" workspace={workspace} status={{id:"vscodeWeb", phase:"running", canEnsure:true, ...(url ? {embedUrl:url} : {})}} onRefresh={async () => {}}/>
  </I18nProvider>));
  try {
    await render("https://code.example.test/"); const frame = host.querySelector("iframe")!;
    await render("https://code.example.test/"); expect(host.querySelector("iframe")).toBe(frame);
    expect(new URL(frame.src).searchParams.get("folder")).toBe("/C:/work/项目 #1");
    await render(); expect(host.querySelector("iframe")).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(0);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
