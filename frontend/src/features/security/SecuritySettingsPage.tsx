import React from "react";
import { EncryptionStatusCard } from "./EncryptionStatusCard";

export function SecuritySettingsPage() {
  return (
    <div className="security-settings-page">
      <h2>Security Settings</h2>
      <EncryptionStatusCard />
    </div>
  );
}
