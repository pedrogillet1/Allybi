export async function getSecurityStatus() {
  const res = await fetch("/api/security/status", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load security status");
  return res.json();
}
