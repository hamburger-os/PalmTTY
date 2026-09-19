process.stdin.setEncoding("utf8");

let pending = "";

function emit(value) {
  process.stdout.write(`${value}\r\n`);
}

setTimeout(() => emit("PALMTTY_READY"), 100);

process.stdin.on("data", (chunk) => {
  pending += chunk;
  const lines = pending.split(/\r\n|\r|\n/);
  pending = lines.pop() ?? "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line === "LATER") {
      setTimeout(() => emit("LATE_MARKER"), 150);
      continue;
    }

    if (line === "BURST") {
      emit("B".repeat(4096) + "STALE_MARKER");
      continue;
    }

    if (line === "EXIT") {
      emit("EXITING");
      setTimeout(() => process.exit(7), 20);
      continue;
    }

    emit("ACK:" + line);
  }
});
