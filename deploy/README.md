# Local infrastructure

`docker-compose.yml` is a local development baseline. It deliberately requires database and Redis passwords and binds both services to `127.0.0.1`.

```powershell
Copy-Item .env.example .env
# Edit .env and set POSTGRES_PASSWORD and REDIS_PASSWORD.
docker compose --env-file .env up -d
```

`deploy/.env` is ignored and must never be committed. Production deployments must inject credentials from an approved Secret Manager rather than baking them into Compose files or images.
