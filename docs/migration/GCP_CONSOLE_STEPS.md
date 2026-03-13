# GCP Console Steps

## Project and APIs
1. Create or select separate staging and production projects.
2. Enable:
   - Cloud Run
   - Artifact Registry
   - Cloud Build
   - Compute Engine
   - Secret Manager
   - Cloud KMS
   - Cloud SQL Admin
   - Memorystore
   - Pub/Sub
   - IAP
   - Monitoring
   - Logging
   - Service Networking
   - Serverless VPC Access

## Artifact Registry
1. Create Docker repository `allybi`.
2. Push images for:
   - web
   - api
   - admin
   - worker

## Networking
1. Create VPC and subnet.
2. Allocate Private Service Access range.
3. Connect Service Networking.
4. Create Serverless VPC Access connector.
5. Create Cloud Router and NAT.

## Cloud SQL
1. Create Postgres instance with private IP only.
2. Enable backups and PITR.
3. Create database and app user.
4. Validate private connectivity from Cloud Run staging service.

## Redis
1. Create Memorystore Redis with private connectivity.
2. Capture host/port for `REDIS_URL`.

## Secret Manager
1. Create all required secrets.
2. Populate secret versions.
3. Grant `secretAccessor` only to the runtime service accounts that need them.

## KMS
1. Create key ring and crypto keys.
2. Grant only required encrypt/decrypt roles to API and worker service accounts.
3. Set `KODA_USE_GCP_KMS=true` in staging first.

## GCS
1. Create document bucket.
2. Enable uniform bucket-level access.
3. Enforce public access prevention.
4. Attach CMEK if required.
5. Validate signed upload flow from staging.

## Pub/Sub
1. Create extract, extract-fanout, embed, preview, and ocr topics.
2. Create authenticated push subscriptions for active worker endpoints.
3. Validate OIDC audiences.

## Cloud Run
1. Deploy `allybi-web`.
2. Deploy `allybi-api`.
3. Deploy `allybi-admin`.
4. Deploy worker services.
5. Confirm service accounts, secrets, VPC connector, and Cloud SQL connectivity on each service.

## Load Balancer and Edge
1. Create global external application load balancer.
2. Create serverless NEGs for web, api, admin.
3. Create backend services:
   - public web
   - public api
   - admin frontend
   - admin api
4. Attach Cloud Armor.
5. Attach IAP to admin frontend and admin api backend services.
6. Create URL map:
   - public web root
   - public api paths
   - admin root
   - admin api paths
   - `app.allybi.co` redirect
7. Reserve global IP and map forwarding rules.

## Monitoring and Alerts
1. Create uptime checks for `/` and `/ready`.
2. Create alert policies for:
   - uptime failure
   - high 5xx
   - elevated latency
   - worker delivery failures
   - Cloud SQL connection saturation

## Staging Validation
1. Smoke test auth.
2. Upload a document and verify worker completion.
3. Verify admin IAP access.
4. Verify socket connection and multi-instance behavior.
5. Verify Cloud Armor and IAP enforcement.

## Production Cutover
1. Freeze production deploys.
2. Confirm DB migration/cutover plan.
3. Apply Terraform for prod.
4. Deploy prod images.
5. Perform Hostinger DNS cutover.
6. Run post-cutover validation.
