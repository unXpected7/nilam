# vm01 deployment

Nilam uses two isolated PostgreSQL 16 services on vm01. They bind only to the VM loopback interface:

| Environment | Host port | Database | Container |
| --- | --- | --- | --- |
| Development | `127.0.0.1:5436` | `nilam_dev` | `nilam-postgres-dev` |
| Production | `127.0.0.1:5437` | `nilam_prod` | `nilam-postgres-prod` |

The live environment files live only on vm01 at `/home/vm01/nilam/postgres/.env`; they are never committed. To inspect them from vm01:

```bash
cd /home/vm01/nilam/postgres
docker compose ps
docker compose logs --tail=50
```

## GitHub Actions secrets

Create GitHub Environments named `development` and `production`. Configure the following secrets in each Environment before enabling deployment:

- `VM01_HOST` — the VM hostname or IP.
- `VM01_USER` — SSH user with Docker access.
- `VM01_SSH_PRIVATE_KEY` — a dedicated GitHub Actions deployment key.
- `VM01_SSH_KNOWN_HOSTS` — pinned `ssh-keyscan -H` output for the VM.

`development.yml` runs for pull requests and pushes targeting `main`; pushes reconcile only `postgres-dev`. `production.yml` runs for pull requests and pushes targeting `prod`; pushes reconcile only `postgres-prod`. Protect the `production` Environment with required reviewers in GitHub before use. Application deployment will be added after the frontend and API containers are defined.

The current workflows use `npm install` while the project has no committed lockfiles. Switch them to `npm ci` after generating and committing `frontend/package-lock.json` and `backend/package-lock.json`.

## Self-hosted GitHub Actions runner

The dedicated runner is registered as `nilam-vm01` in `/home/vm01/nilam-actions-runner`, with labels `self-hosted`, `linux`, `x64`, and `nilam`. Both workflow files target it with:

```yaml
runs-on: [self-hosted, linux, x64, nilam]
```

It is currently running as the `vm01` user. To make it start automatically after a VM reboot, run this once on vm01 with an account that can use sudo:

```bash
cd ~/nilam-actions-runner
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```
