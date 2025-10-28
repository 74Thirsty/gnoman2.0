import React, { useState, useEffect } from "react";

export default function LicenseScreen() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Checking license...");

  useEffect(() => {
    const safevault = window.safevault;

    if (!safevault) {
      setStatus("⚠️ License service unavailable.");
      return;
    }

    const result = safevault.loadLicense();
    if (result.ok) setStatus("✅ License valid.");
    else setStatus("🔒 Not activated.");
  }, []);

  function handleValidate() {
    const safevault = window.safevault;

    if (!safevault) {
      setStatus("⚠️ Unable to validate — license service unavailable.");
      return;
    }

    const result = safevault.validateLicense(input.trim());
    if (result.ok) setStatus("✅ License valid and saved.");
    else setStatus(`❌ Invalid key (${result.reason})`);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>GNOMAN 2.0 License Activation</h2>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter license key"
        style={{ inlineSize: "80%", padding: "8px" }}
      />
      <button onClick={handleValidate} style={{ insetInlineStart: 8 }}>
        Validate
      </button>
      <p>{status}</p>
    </div>
  );
}
