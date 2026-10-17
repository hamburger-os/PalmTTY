// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n.js";
import { MarkdownPreview } from "./MarkdownPreview.js";
import { readWorkspaceImage } from "./api.js";

vi.mock("./api.js", () => ({
  readWorkspaceImage: vi.fn(async () => new Blob(["fixture"], { type: "image/png" }))
}));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect width="100" height="80"/></svg>' }))
  }
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const createObjectURL = vi.fn(() => "blob:markdown-fixture");
const revokeObjectURL = vi.fn();
Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  if (cleanup) await cleanup();
  cleanup = null;
  vi.clearAllMocks();
});

async function mount(markdown: string, onOpenFile = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <I18nProvider>
        <MarkdownPreview content={markdown} path="docs/main.md" workspaceId="workspace-test"
          onOpenFile={onOpenFile} />
      </I18nProvider>
    );
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  return { host, onOpenFile };
}

describe("Markdown preview lifecycle", () => {
  it("opens a workspace-relative heading link without browser navigation", async () => {
    const onOpenFile = vi.fn();
    const { host } = await mount("[next](./chapter.md#part)", onOpenFile);
    const link = host.querySelector<HTMLAnchorElement>("a[data-markdown-workspace-path]")!;
    expect(link.href.endsWith("#")).toBe(true);
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(onOpenFile).toHaveBeenCalledWith("docs/chapter.md", "part");
  });

  it("reads only local images and revokes their object URLs on unmount", async () => {
    const { host } = await mount(
      "![local](./images/cover.png)\n\n![remote](https://example.com/tracker.png)"
    );
    expect(readWorkspaceImage).toHaveBeenCalledTimes(1);
    expect(readWorkspaceImage).toHaveBeenCalledWith("workspace-test", "docs/images/cover.png");
    expect(host.querySelector(".markdown-local-image")).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    await cleanup!();
    cleanup = null;
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:markdown-fixture");
  });

  it("renders a bounded Mermaid code block inside an inert iframe", async () => {
    const { host } = await mount("~~~mermaid\ngraph TD\nA-->B\n~~~");
    await vi.waitFor(() => expect(host.querySelector(".markdown-mermaid-frame")).toBeTruthy());
    const frame = host.querySelector<HTMLIFrameElement>("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.srcdoc).toContain("default-src 'none'");
    expect(frame.srcdoc).toContain("<svg");
    expect(host.querySelector("script")).toBeNull();
  });
});
