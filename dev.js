const { spawn, execSync } = require("child_process");
const os = require("os");
const path = require("path");

console.log("[CityConnect Launcher] Starting Backend Signaling Server (backend/src/server.js) & Frontend Next.js App...");

const backendProcess = spawn(process.execPath, [path.join(__dirname, "backend", "src", "server.js")], {
  cwd: __dirname,
  stdio: "inherit"
});

const frontendProcess = os.platform() === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev"], {
      cwd: path.join(__dirname, "frontend"),
      stdio: "inherit"
    })
  : spawn("npm", ["run", "dev"], {
      cwd: path.join(__dirname, "frontend"),
      stdio: "inherit"
    });

const cleanup = () => {
  console.log("[CityConnect Launcher] Shutting down servers...");
  try {
    if (os.platform() === "win32") {
      if (backendProcess && backendProcess.pid) {
        execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: 'ignore' });
      }
      if (frontendProcess && frontendProcess.pid) {
        execSync(`taskkill /pid ${frontendProcess.pid} /T /F`, { stdio: 'ignore' });
      }
    } else {
      if (backendProcess) backendProcess.kill();
      if (frontendProcess) frontendProcess.kill();
    }
  } catch (e) {}
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);
