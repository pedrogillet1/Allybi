# Hostinger DNS Cutover

## Pre-Cutover
1. Export a full DNS snapshot from Hostinger.
2. Record all `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `CAA`, and verification records.
3. Lower TTL for `allybi.co`, `www`, `app`, and `admin` 24-48 hours before cutover.
4. Leave mail-related `MX` and `TXT` records unchanged unless email migration is explicitly planned.
5. Disable Hostinger CDN/proxying if it would interfere with apex or subdomain edits.

## Target Records
1. `allybi.co`
   - point apex to the Google global load balancer IP.
2. `www.allybi.co`
   - point to the same LB IP or CNAME to apex if supported by current DNS policy.
3. `app.allybi.co`
   - point to the same LB; application-layer redirect is handled at Google LB.
4. `admin.allybi.co`
   - point to the same LB.

## Cutover Steps
1. Verify managed certificates are in `ACTIVE` or expected provisioning state on Google before changing DNS.
2. Change DNS records at Hostinger.
3. Wait for propagation and test from:
   - local resolver
   - `1.1.1.1`
   - `8.8.8.8`
4. Validate:
   - `https://allybi.co`
   - `https://www.allybi.co`
   - `https://app.allybi.co`
   - `https://admin.allybi.co`

## Rollback Snapshot
- Keep a copy of all previous Hostinger records.
- Keep VPS available in read-only fallback mode for 24-72 hours.
- If rollback is required, restore prior DNS values and wait one TTL window before declaring rollback complete.

## Decommission
1. Confirm:
   - no production traffic depends on VPS,
   - admin is reachable through IAP,
   - uploads and workers complete successfully,
   - websocket/realtime works across multiple instances.
2. Remove Hostinger runtime references only after stability window completes.
