import { spawn } from "node:child_process";

const server = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: "D:/prd-pipeline",
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
});

let output = "";
server.stdout.on("data", (data) => {
  output += data.toString();
});

server.stderr.on("data", () => {}); // discard

server.on("close", () => {
  console.log(output);
});

const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "prd/workspace.init",
    arguments: {
      domain: "fintech",
      soul: "c-end-pm",
      doc_system: "local",
      local_path: "D:\\obsidian\\my_babel_tower_notes",
      template: "standard",
    },
  },
};

server.stdin.write(JSON.stringify(request) + "\n");
server.stdin.end();