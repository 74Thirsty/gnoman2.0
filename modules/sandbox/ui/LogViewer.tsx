import type { SandboxLogEntry } from '../types';

interface LogViewerProps {
  logs: SandboxLogEntry[];
  onReplay: (entry: SandboxLogEntry) => void;
}

const LogViewer = ({ logs, onReplay }: LogViewerProps) => (
  <div className="space-y-3">
    {logs.map((entry) => (
      <div key={entry.id} className="rounded border border-slate-800 bg-slate-950/50 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{new Date(entry.timestamp).toLocaleString()}</span>
          <button
            className="rounded border border-purple-400 px-2 py-1 text-purple-200 hover:bg-purple-500/10"
            onClick={() => onReplay(entry)}
          >
            Replay
          </button>
        </div>
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-200">
          {JSON.stringify(entry, null, 2)}
        </pre>
      </div>
    ))}
    {!logs.length && <p className="text-sm text-slate-500">No simulations recorded yet.</p>}
  </div>
);

export default LogViewer;
