/**
 * LlamaFirewall (Meta) Tier-2.5 runtime defense ADVISOR.
 *
 * Critical design choice: LlamaFirewall is a Python *runtime* guardrail that lives INSIDE the
 * user's agent / app process. It is NOT a scanner that Security Gate can "run" against a
 * codebase. The honest integration therefore is an ADVISOR:
 *
 *   - Detect whether the workspace looks agentic (Python + langchain / langgraph / openai / llama_index).
 *   - Report whether `llamafirewall` is already declared in requirements.txt / pyproject.toml.
 *   - Return an OS-aware install plan plus a copy-paste Python integration snippet
 *     (PromptGuardScanner + CodeShieldScanner + AlignmentCheckScanner).
 *
 * The advisor never installs anything and never modifies user files. It is reading + recommending.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, shell: false });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim()
  };
}

function platformKey() {
  const p = process.platform;
  if (p === "darwin") return "darwin";
  if (p === "win32") return "windows";
  return "linux";
}

export function detectPython() {
  for (const bin of ["python3", "python"]) {
    const r = run(bin, ["--version"]);
    if (r.ok && r.stdout) {
      const m = r.stdout.match(/Python\s+(\d+)\.(\d+)/i);
      const major = m ? Number(m[1]) : null;
      const minor = m ? Number(m[2]) : null;
      const satisfies310 = Number.isFinite(major) && Number.isFinite(minor) && (major > 3 || (major === 3 && minor >= 10));
      return { available: true, command: bin, version: r.stdout, major, minor, satisfies310 };
    }
  }
  return { available: false, command: null, version: null, major: null, minor: null, satisfies310: false };
}

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

const AGENTIC_PYTHON_HINTS = /langchain|langgraph|openai|llama[-_]?index|huggingface|crewai|autogen|smolagents|haystack|guidance|llm/i;

export function detectAgenticSignals(workspaceRoot) {
  const out = { isPythonProject: false, agentic: false, evidence: [] };
  const req = readSafe(path.join(workspaceRoot, "requirements.txt"));
  const pyproject = readSafe(path.join(workspaceRoot, "pyproject.toml"));
  const setupCfg = readSafe(path.join(workspaceRoot, "setup.cfg"));
  const combined = [req, pyproject, setupCfg].join("\n");
  if (combined.trim()) {
    out.isPythonProject = !!(req || pyproject || setupCfg);
    if (AGENTIC_PYTHON_HINTS.test(combined)) {
      out.agentic = true;
      const matches = combined.match(AGENTIC_PYTHON_HINTS);
      if (matches) out.evidence.push(`Detected dependency hint: ${matches[0]}`);
    }
  }
  // Also check that we have *any* Python file at the root to avoid false negatives for
  // single-file scripts that import langchain/openai without a manifest.
  try {
    const top = fs.readdirSync(workspaceRoot).slice(0, 200);
    if (top.some((n) => n.endsWith(".py"))) out.isPythonProject = true;
  } catch {
    // ignore
  }
  return out;
}

export function detectLlamaFirewallInstalled(workspaceRoot) {
  const req = readSafe(path.join(workspaceRoot, "requirements.txt"));
  const pyproject = readSafe(path.join(workspaceRoot, "pyproject.toml"));
  const declared = /llamafirewall\b/i.test(`${req}\n${pyproject}`);
  let importable = false;
  const py = detectPython();
  if (py.available) {
    const r = run(py.command, ["-c", "import llamafirewall; print(llamafirewall.__name__)"]);
    importable = r.ok && r.stdout.includes("llamafirewall");
  }
  return { declared, importable };
}

export function installPlan() {
  const pk = platformKey();
  const python = {
    title: "Ensure Python 3.10+ (LlamaFirewall requires it)",
    urls: ["https://www.python.org/downloads/"],
    commands:
      pk === "darwin"
        ? ["brew install python@3.12"]
        : pk === "windows"
          ? ["winget install Python.Python.3.12"]
          : ["sudo apt-get install -y python3 python3-venv python3-pip"]
  };
  const venv = {
    title: "Create a project virtualenv (recommended) and install LlamaFirewall",
    commands: [
      "python3 -m venv .venv",
      "source .venv/bin/activate   # Windows: .venv\\Scripts\\activate",
      "pip install --upgrade pip",
      "pip install \"llamafirewall>=1.0.3,<2\""
    ],
    note: "On first import LlamaFirewall downloads Meta's Prompt Guard 2 model from Hugging Face (~hundreds of MB). Allow that or pre-download."
  };
  const credentials = {
    title: "Credentials (only for optional paid scanners)",
    options: [
      { label: "Core (PromptGuard + CodeShield + AlignmentCheck)", envVars: [], free: true },
      { label: "Optional: Together / Fireworks acceleration", envVars: ["TOGETHER_API_KEY", "FIREWORKS_API_KEY"], free: false }
    ],
    note: "The core local-model path is FREE. Paid scanners are opt-in."
  };
  return { platform: pk, python, venv, credentials };
}

export function integrationSnippet({ agentic }) {
  const header = agentic
    ? "Your workspace looks agentic. Paste this near the entry point of your agent loop or tool dispatcher."
    : "Your workspace did not strongly look agentic; only use this snippet if you actually expose an LLM agent.";
  const code = `# pip install \"llamafirewall>=1.0.3,<2\"
from llamafirewall import LlamaFirewall, ScannerType, Role, UserMessage, AssistantMessage

firewall = LlamaFirewall(
    scanners={
        Role.USER: [ScannerType.PROMPT_GUARD],          # input-side prompt injection
        Role.ASSISTANT: [ScannerType.CODE_SHIELD],      # output-side unsafe code generation
        # Role.AGENT: [ScannerType.AGENT_ALIGNMENT],    # uncomment for agent goal-alignment checks
    }
)

def safe_call(user_text: str, llm_reply: str) -> tuple[bool, str]:
    # Input guard
    user_result = firewall.scan(UserMessage(content=user_text))
    if user_result.decision == \"block\":
        return False, f\"Blocked input: {user_result.reason}\"
    # Output guard
    assistant_result = firewall.scan(AssistantMessage(content=llm_reply))
    if assistant_result.decision == \"block\":
        return False, f\"Blocked output: {assistant_result.reason}\"
    return True, llm_reply
`;
  return { header, code };
}

export function runLlamaFirewallAction({ workspaceRoot, action }) {
  const py = detectPython();
  const agentic = detectAgenticSignals(workspaceRoot);
  const installed = detectLlamaFirewallInstalled(workspaceRoot);
  const status = {
    workspaceRoot,
    python: py,
    agentic_signals: agentic,
    llamafirewall: installed,
    ready: py.satisfies310 && (installed.declared || installed.importable),
    next_action_hint:
      installed.declared || installed.importable
        ? agentic.agentic
          ? "Open your agent entry point and verify the LlamaFirewall scan call is wired."
          : "Workspace did not look agentic; only use LlamaFirewall in agent code paths."
        : "Run action=install_plan, then action=snippet."
  };

  if (action === "install_plan") {
    return { ok: true, action, install_plan: installPlan(), status };
  }
  if (action === "snippet") {
    return {
      ok: true,
      action,
      status,
      snippet: integrationSnippet({ agentic: agentic.agentic })
    };
  }
  if (action === "status") {
    return { ok: true, action, status };
  }
  return { ok: false, action, blocked_reason: `Unknown action: ${action}` };
}
