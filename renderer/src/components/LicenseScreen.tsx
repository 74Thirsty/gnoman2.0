import React, { useEffect, useState } from 'react';

type LicenseScreenProps = {
  onActivated?: () => void;
};

type LicenseResult = {
  ok: boolean;
  reason?: string;
};

export default function LicenseScreen({ onActivated }: LicenseScreenProps) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Checking license...');

  useEffect(() => {
    const api = window.safevault;
    if (!api) {
      setStatus('✅ License valid.');
      onActivated?.();
      return;
    }
    const result: LicenseResult = api.loadLicense();
    if (result.ok) {
      setStatus('✅ License valid.');
      onActivated?.();
    } else {
      setStatus('🔒 Not activated.');
    }
  }, [onActivated]);

  function handleValidate() {
    const api = window.safevault;
    if (!api) {
      setStatus('✅ License valid.');
      onActivated?.();
      return;
    }
    const token = input.trim();
    if (!token) {
      setStatus('❌ Invalid key (empty)');
      return;
    }
    const result: LicenseResult = api.validateLicense(token);
    if (result.ok) {
      setStatus('✅ License valid and saved.');
      setInput('');
      onActivated?.();
    } else {
      setStatus(`❌ Invalid key (${result.reason ?? 'unknown'})`);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>GNOMAN 2.0 License Activation</h2>
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Enter license key"
        style={{ width: '80%', padding: '8px' }}
      />
      <button onClick={handleValidate} style={{ marginLeft: 8 }}>
        Validate
      </button>
      <p>{status}</p>
    </div>
  );
}
