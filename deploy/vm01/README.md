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

Create GitHub Environments named `development` and `production`. The current runner is installed on vm01 itself, so database reconciliation runs Docker Compose locally and requires no SSH secrets. Keep the `production` Environment protected with required reviewers.

`development.yml` runs for pull requests and pushes targeting `main`; pushes reconcile `postgres-dev` and build/deploy the development frontend and API. `production.yml` runs for pull requests and pushes targeting `prod`; pushes reconcile `postgres-prod` and build/deploy the production frontend and API.

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
