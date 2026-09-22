import assert from "node:assert/strict";
import test from "node:test";
import { validateTerminalStack } from "./terminal-stack-check.mjs";

const stack = {
  schemaVersion: 1,
  browser: {
    "@xterm/xterm": "6.1.0-beta.304",
    "@xterm/addon-fit": "0.12.0-beta.301"
  },
  worker: {
    "@xterm/headless": "6.0.0",
    "@xterm/addon-serialize": "0.14.0"
  }
};

function manifests() {
  return {
    webPackage: {
      name: "@palmtty/web",
      dependencies: {
        "@palmtty/protocol": "workspace:*",
        ...stack.browser
      }
    },
    agentPackage: {
      name: "@palmtty/agent",
      dependencies: {
        "@palmtty/protocol": "workspace:*",
        ...stack.worker
      }
    }
  };
}

test("accepts the exact governed terminal stack", () => {
  assert.deepEqual(validateTerminalStack(stack, manifests()), []);
});

test("rejects ranged or ungoverned xterm dependencies", () => {
  const input = manifests();
  input.webPackage.dependencies["@xterm/xterm"] = "^6.1.0-beta.304";
  input.webPackage.dependencies["@xterm/addon-search"] = "0.17.0-beta.301";

  const failures = validateTerminalStack(stack, input);
  assert(failures.some((failure) => failure.includes("dependency set")));
  assert(failures.some((failure) => failure.includes("must be pinned")));
});

test("rejects xterm packages moved outside dependencies", () => {
  const input = manifests();
  delete input.webPackage.dependencies["@xterm/addon-fit"];
  input.webPackage.devDependencies = {
    "@xterm/addon-fit": "0.12.0-beta.301"
  };

  const failures = validateTerminalStack(stack, input);
  assert(
    failures.some((failure) =>
      failure.includes("@palmtty/web @xterm dependency set must exactly match")
    ) === false
  );
});

test("rejects duplicate xterm declarations across dependency sections", () => {
  const input = manifests();
  input.webPackage.devDependencies = {
    "@xterm/xterm": "6.1.0-beta.304"
  };

  const failures = validateTerminalStack(stack, input);
  assert(failures.some((failure) => failure.includes("more than one dependency section")));
});

test("rejects the xterm 6.0.0 browser touch-scroll regression", () => {
  const regressedStack = {
    ...stack,
    browser: {
      ...stack.browser,
      "@xterm/xterm": "6.0.0"
    }
  };
  const input = manifests();
  input.webPackage.dependencies["@xterm/xterm"] = "6.0.0";

  const failures = validateTerminalStack(regressedStack, input);
  assert(failures.some((failure) => failure.includes("touch scroll is broken")));
});
