# Public Nginx routing

The public Nginx host (`171.22.173.4`, WireGuard `10.10.0.1`) proxies to vm01 (`10.10.0.2`) with this reserved port map:

| Host | vm01 upstream |
| --- | --- |
| `dev-topan.fluxorastudio.id` | `10.10.0.2:8091` |
| `dev-api-topan.fluxorastudio.id` | `10.10.0.2:5100` |
| `topan.fluxorastudio.id` | `10.10.0.2:8092` |
| `api-topan.fluxorastudio.id` | `10.10.0.2:5101` |

Cloudflare DNS is proxied to the public server. TLS certificates are provisioned on that server with Certbot after the Nginx virtual hosts are installed.
