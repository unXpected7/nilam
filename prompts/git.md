init git

git remote add origin git@github-personal:unxpected7/nilam.git
git clone git@github-personal:akmaltezar/lalaka.git


=====
ssh vm01
git clone git@github-personal:unXpected7/nilam.git


On `vm01`, two isolated PostgreSQL 16 containers are running and healthy:

| Environment | Branch | VM-only port | Database | Container |
|---|---|---:|---|---|
| Development | `main` | `127.0.0.1:5436` | `nilam_dev` | `nilam-postgres-dev` |
| Production | `prod` | `127.0.0.1:5437` | `nilam_prod` | `nilam-postgres-prod` |

Credentials are randomly generated and stored only on the VM at:

```
/home/vm01/nilam/postgres/.env
```

Added independent GitHub Actions workflows:

- .github/workflows/development.yml: PR/push to `main`; deploys only development DB.
- .github/workflows/production.yml: PR/push to `prod`; deploys only production DB.

Create GitHub Environments named `development` and `production`, then add these secrets to each:

```
VM01_HOST
VM01_USER
VM01_SSH_PRIVATE_KEY
VM01_SSH_KNOWN_HOSTS
```

Protect the `production` Environment with required reviewers. Full VM and CI/CD instructions are in deploy/vm01/README.md.
