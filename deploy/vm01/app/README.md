# Nilam application services on vm01

This Compose file is run by the self-hosted GitHub Actions runner. It joins the existing `postgres_default` network created by `/home/vm01/nilam/postgres/docker-compose.yml`.

| Service | WireGuard binding | Public hostname |
| --- | --- | --- |
| `dev-frontend` | `10.10.0.2:8091` | `dev-topan.fluxorastudio.id` |
| `dev-backend` | `10.10.0.2:5100` | `dev-api-topan.fluxorastudio.id` |
| `prod-frontend` | `10.10.0.2:8092` | `topan.fluxorastudio.id` |
| `prod-backend` | `10.10.0.2:5101` | `api-topan.fluxorastudio.id` |

The Compose command must receive `/home/vm01/nilam/postgres/.env` with `--env-file`; that file is VM-only and contains database credentials.
