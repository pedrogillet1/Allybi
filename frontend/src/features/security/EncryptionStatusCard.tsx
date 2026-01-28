import React from "react";
import { getSecurityStatus } from "../../api/security";

interface SecurityState {
  dbFieldEncryption: boolean;
  s3SseKms: boolean;
  keyProvider: string;
}

export function EncryptionStatusCard() {
  const [state, setState] = React.useState<SecurityState | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    getSecurityStatus()
      .then(setState)
      .catch((e: any) => setErr(String(e?.message ?? e)));
  }, []);

  if (err) return <div className="security-status error">Security status error: {err}</div>;
  if (!state) return <div className="security-status loading">Loading security status...</div>;

  return (
    <div className="security-status">
      <h3>Security</h3>
      <div>DB content encryption: {state.dbFieldEncryption ? "Enabled" : "Disabled"}</div>
      <div>S3 at-rest encryption: {state.s3SseKms ? "Enabled" : "Disabled"}</div>
      <div>Key provider: {state.keyProvider}</div>
    </div>
  );
}
