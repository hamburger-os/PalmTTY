// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n.js";
import { WebApplicationLink, workspaceCodeUrl } from "./WebApplicationLink.js";
import { ApiError, authorizeWebApp } from "./api.js";
import type { WebAppStatus, WorkspacePublic } from "@palmtty/protocol";
vi.mock("./api.js", async (original) => ({...await original<typeof import("./api.js")>(), authorizeWebApp: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.restoreAllMocks());
const workspace: WorkspacePublic = { id: "workspace-test", name: "Test", cwd: "C:\\work\\项目 #1", terminal: { runtime: {kind: "host", args: []} } };
it("routes Code to the persisted host folder and rejects guessed WSL mappings", () => {
  expect(new URL(workspaceCodeUrl("https://code.example.test/", workspace)!).searchParams.get("folder")).toBe("/C:/work/项目 #1");
  expect(workspaceCodeUrl("https://code.example.test/", {...workspace, terminal: { runtime: {kind: "wsl", args: []} }})).toBeUndefined();
});
it("opens managed Code independently with explicit handoff, without putting credentials in href or mounting a frame", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const popup = {opener: {}, location: {replace:vi.fn()}, close:vi.fn()};
  vi.spyOn(window,"open").mockReturnValue(popup as unknown as Window);
  vi.mocked(authorizeWebApp).mockResolvedValue({url:"https://code.example.test/?tkn=fixture-only"});
  const status: WebAppStatus = {id:"vscodeWeb",phase:"running",accessUrl:"https://code.example.test/",canAuthorize:true};
  try {
    await act(async () => root.render(<I18nProvider><WebApplicationLink id="vscodeWeb" workspace={workspace} status={status}/></I18nProvider>));
    const link=host.querySelector("a")!;expect(link.target).toBe("_blank");expect(link.rel).toContain("noreferrer");
    expect(link.href).not.toContain("tkn");
    await act(async () => {link.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));});
    expect(popup.opener).toBeNull();expect(authorizeWebApp).toHaveBeenCalledWith("vscodeWeb");
    const target=new URL(popup.location.replace.mock.calls[0]![0]);
    expect(target.searchParams.get("folder")).toBe("/C:/work/项目 #1");expect(target.searchParams.get("tkn")).toBe("fixture-only");
    expect(link.href).not.toContain("tkn");expect(host.querySelector("iframe")).toBeNull();
  } finally {await act(async () => root.unmount());host.remove();}
});
it("uses a clean independent link for external instances without any handoff", async () => {
  const host=document.createElement("div");const root=createRoot(host);
  try {
    await act(async () => root.render(<I18nProvider><WebApplicationLink id="harness" status={{id:"harness",phase:"external",accessUrl:"https://harness.example.test/"}}/></I18nProvider>));
    expect(host.querySelector("a")?.href).toBe("https://harness.example.test/");expect(host.querySelector("iframe")).toBeNull();
  } finally {await act(async () => root.unmount());}
});

it("does not request credentials when popups are blocked and closes a failed handoff", async () => {
  const host=document.createElement("div");const root=createRoot(host);
  const open=vi.spyOn(window,"open").mockReturnValue(null);
  vi.mocked(authorizeWebApp).mockClear();
  try {
    await act(async () => root.render(<I18nProvider><WebApplicationLink id="harness" status={{id:"harness",phase:"running",accessUrl:"http://harness.palmtty.home.arpa:3080/",canAuthorize:true}}/></I18nProvider>));
    await act(async () => {host.querySelector("a")!.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));});
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(authorizeWebApp).not.toHaveBeenCalled();
    const popup={opener:{},location:{replace:vi.fn()},close:vi.fn()};
    open.mockReturnValue(popup as unknown as Window);
    vi.mocked(authorizeWebApp).mockRejectedValueOnce(new Error("unavailable"));
    await act(async () => {host.querySelector("a")!.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));});
    expect(popup.close).toHaveBeenCalledOnce();expect(popup.location.replace).not.toHaveBeenCalled();
    expect(host.querySelector("a")?.getAttribute("aria-disabled")).toBe("false");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  } finally {await act(async () => root.unmount());}
});

it("preserves clean ordinary navigation when the bootstrap rate limit is reached", async () => {
  const host=document.createElement("div");const root=createRoot(host);
  const popup={opener:{},location:{replace:vi.fn()},close:vi.fn()};
  vi.spyOn(window,"open").mockReturnValue(popup as unknown as Window);
  vi.mocked(authorizeWebApp).mockRejectedValueOnce(new ApiError("too_many_web_app_requests"));
  try {
    await act(async () => root.render(<I18nProvider><WebApplicationLink id="vscodeWeb" workspace={workspace} status={{id:"vscodeWeb",phase:"running",accessUrl:"https://code.example.test/",canAuthorize:true}}/></I18nProvider>));
    await act(async () => {host.querySelector("a")!.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));});
    expect(popup.close).not.toHaveBeenCalled();
    const destination=new URL(popup.location.replace.mock.calls[0]![0]);
    expect(destination.searchParams.get("folder")).toBe("/C:/work/项目 #1");
    expect(destination.searchParams.has("tkn")).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {await act(async () => root.unmount());}
});
