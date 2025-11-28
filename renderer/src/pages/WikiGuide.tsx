import React, { useState } from "react";
import { FaBook, FaTools, FaDatabase, FaShieldAlt, FaDesktop, FaCode, FaClipboard } from "react-icons/fa";

interface CopyButtonProps {
  text: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={`ml-2 text-sm p-1 rounded bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-1`}
    >
      <FaClipboard />
      {copied ? "Copied!" : "Copy"}
    </button>
  );
};

interface CollapsibleProps {
  title: React.ReactNode;
  children: React.ReactNode;
}

const Collapsible: React.FC<CollapsibleProps> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 border border-gray-600 rounded">
      <div
        className="bg-gray-800 text-white p-3 cursor-pointer flex justify-between items-center"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="p-4 bg-gray-900 text-gray-100">{children}</div>}
    </div>
  );
};

export const GnomanWiki: React.FC = () => {
  return (
    <div className="prose max-w-none p-6 lg:max-w-6xl mx-auto text-gray-100">
      {/* Banner */}
      <img
        src="https://raw.githubusercontent.com/74Thirsty/74Thirsty/main/assets/gnoman.svg"
        alt="Sheen Banner"
        className="w-full mb-10 rounded-lg shadow-2xl"
      />

      {/* Intro */}
      <p className="mb-8 text-lg leading-relaxed">
        <strong>GNOMAN 2.0</strong> is a <em>cross-platform Electron desktop application</em> combining a local Express API
        with a React renderer to manage Gnosis Safe workflows from a single secured workspace. It provides
        tooling for simulating Safe transactions, managing wallets, and enforcing offline license policies.
      </p>

      {/* Graphical-first operations */}
      <Collapsible title={<><FaDesktop /> Graphical-first operations</>}>
        <p>
          The graphical client is the main control plane. CLI commands are now mapped to UI workflows:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Keyring management</li>
          <li>Wallet administration</li>
          <li>Safe tooling and sandbox orchestration</li>
          <li>Configuration panels with live activity feeds</li>
        </ul>
        <p>The CLI remains available for legacy automation but no longer receives new features.</p>
      </Collapsible>

      {/* Tech stack */}
      <Collapsible title={<><FaTools /> Tech stack</>}>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Electron 28:</strong> Desktop shell, preload isolation, IPC keyring bridge (<code>main/</code>).
          </li>
          <li>
            <strong>Express + TypeScript:</strong> Backend API powering wallet, Safe, sandbox, and license flows (<code>backend/</code>).
          </li>
          <li>
            <strong>React + Tailwind (Vite):</strong> Renderer UI with live dev updates (<code>renderer/</code>).
          </li>
          <li>
            <strong>Better SQLite3:</strong> Persistent transaction holds and vanity job history under <code>.gnoman/</code>.
          </li>
          <li>
            <strong>Ethers v6:</strong> Wallet creation, encryption, and contract simulation utilities.
          </li>
        </ul>
      </Collapsible>

      {/* Repository layout */}
      <Collapsible title={<><FaBook /> Repository layout</>}>
        <pre className="bg-gray-800 text-green-300 p-4 rounded-lg overflow-x-auto">
{`/
├── backend/              # Express API, services, and route handlers
├── main/                 # Electron entrypoint, preload, and AES keyring integration
├── modules/sandbox/      # Shared sandbox engine, ABI parser, local fork helper, and UI panel
├── renderer/             # React renderer bundled with Vite
├── scripts/              # Build utilities for packaging renderer output and launching Electron
├── docs/                 # Markdown documentation surfaced in the app and project wiki
├── tests/                # API smoke tests and fixtures
├── package.json          # Root npm scripts and dependencies
└── tsconfig*.json        # TypeScript project references for each process`}
        </pre>
      </Collapsible>

      {/* Prerequisites */}
      <Collapsible title={<><FaShieldAlt /> Prerequisites</>}>
        <div className="bg-yellow-900 border-l-4 border-yellow-600 p-4 text-yellow-100">
          <p>
            License tokens must be validated at startup. They persist as <code>.safevault/license.env</code>
            and mirror metadata to <code>.gnoman/license.json</code>.
          </p>
        </div>
      </Collapsible>

      {/* Offline license workflow */}
      <Collapsible title={<><FaTools /> Offline License Workflow (Developer)</>}>
        <div className="overflow-x-auto">
          <table className="table-auto border-collapse border border-gray-600 w-full">
            <thead className="bg-gray-700 text-white">
              <tr>
                <th className="border border-gray-600 p-2 text-left">Purpose</th>
                <th className="border border-gray-600 p-2 text-left">Command</th>
                <th className="border border-gray-600 p-2 text-left">Output</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  purpose: "Generate keypair (one-time)",
                  command: "python backend/licenses/make_keys.py",
                  output: "license_private.pem, license_public.pem",
                },
                {
                  purpose: "Generate license token",
                  command: 'python backend/licenses/gen_license.py --id "Customer"',
                  output: "Signed token (raw + Base32)",
                },
                {
                  purpose: "Embed public key",
                  command: "backend/licenses/license_public.pem",
                  output: "Used by verifier",
                },
                {
                  purpose: "Validate offline",
                  command:
                    'python -c "from backend.licenses.verify_license import verify_token; print(verify_token(\'backend/licenses/license_public.pem\', \'<token>\', \'GNOMAN\', \'2.0.0\'))"',
                  output: "Prints True/False",
                },
              ].map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-gray-900 text-white" : "bg-gray-800 text-gray-100"}>
                  <td className="border border-gray-600 p-2">{row.purpose}</td>
                  <td className="border border-gray-600 p-2 flex items-center">
                    <code className="bg-gray-900 text-green-300 p-1 rounded">{row.command}</code>
                    <CopyButton text={row.command} />
                  </td>
                  <td className="border border-gray-600 p-2">{row.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* Desktop features */}
      <Collapsible title={<><FaDesktop /> Desktop Application Features</>}>
        <ul className="list-disc pl-6 space-y-3">
          <li><strong>Dashboard</strong> – overview of wallets and connected Safe.</li>
          <li><strong>Wallets</strong> – generate encrypted wallets with aliases, hidden flags, passwords, list metadata.</li>
          <li><strong>Safes</strong> – connect to Safes, review owners/modules, audit holds, monitor queued transactions.</li>
          <li><strong>Sandbox</strong> – advanced panel for ABIs, function testing, historical replay, optional local forks.</li>
          <li><strong>Keyring</strong> – manage secrets via Electron IPC (<code>window.gnoman</code>) with fallback if unavailable.</li>
          <li><strong>Settings</strong> – offline licensing, hold defaults, vanity generators, in-app wiki navigation.</li>
          <li><strong>Wiki Guide</strong> – render Markdown docs from <code>docs/wiki</code> directly in-app.</li>
        </ul>
      </Collapsible>

      {/* Data & Security */}
      <Collapsible title={<><FaDatabase /> Data Directories & Security</>}>
        <ul className="list-disc pl-6 space-y-3">
          <li>Transaction holds & vanity jobs: <code>.gnoman/</code></li>
          <li>Sandbox logs: <code>modules/sandbox/logs/</code></li>
          <li>Wallet keys: AES-256-GCM in-memory encryption, PBKDF2. Export requires password.</li>
          <li>Electron preload exposes <code>window.gnoman.invoke</code> for isolated operations.</li>
        </ul>
      </Collapsible>

      {/* Documentation */}
      <Collapsible title={<><FaBook /> Documentation</>}>
        <p>
          Guides live in <code>docs/</code>. Start with <code>docs/user-guide.md</code> for walkthroughs, <code>docs/license-dev-guide.md</code> for offline licensing, and <code>docs/wiki/</code> for in-app knowledge base content.
        </p>
      </Collapsible>
    </div>
  );
};

export default GnomanWiki;
