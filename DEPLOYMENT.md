# Deployment Guide

## Production Server
- **Host:** srv1372172.hstgr.cloud
- **Port:** 3000
- **URL:** http://srv1372172.hstgr.cloud:3000/

## Current Setup
- Docker Compose deployment in `/opt/planning-poker`
- Automatic restart enabled
- Health checks configured
- Network isolation via dedicated bridge network

## Deployment Process

### Prerequisites
- Docker installed on local machine
- SSH access to production server as root
- Git repository access

### Steps

1. **Local: Make changes and commit**
   ```bash
   # Make your changes
   git add .
   git commit -m "Your changes"
   git push origin main
   ```

2. **Local: Build Docker image**
   ```bash
   cd /Users/christoph/Projects/planning-poker
   docker build --platform linux/amd64 -t planning-poker:latest .
   ```

3. **Local: Save and transfer image**
   ```bash
   docker save planning-poker:latest | gzip > /tmp/planning-poker-latest.tar.gz
   scp /tmp/planning-poker-latest.tar.gz root@srv1372172.hstgr.cloud:/tmp/
   ```

4. **Server: Update deployment**
   ```bash
   ssh root@srv1372172.hstgr.cloud

   # Load new image
   docker load < /tmp/planning-poker-latest.tar.gz

   # Update repository
   cd /opt/planning-poker
   git pull

   # Restart with new image
   docker compose down
   docker compose up -d

   # Verify deployment
   docker compose ps
   docker compose logs --tail 50

   # Cleanup
   rm /tmp/planning-poker-latest.tar.gz
   ```

### Quick Update (Code only, no Docker changes)
If you only changed code (no package.json, Dockerfile, or dependencies):
```bash
ssh root@srv1372172.hstgr.cloud "cd /opt/planning-poker && git pull && docker compose restart"
```

### One-Liner Full Deployment
```bash
cd /Users/christoph/Projects/planning-poker && \
docker build --platform linux/amd64 -t planning-poker:latest . && \
docker save planning-poker:latest | gzip > /tmp/planning-poker-latest.tar.gz && \
scp /tmp/planning-poker-latest.tar.gz root@srv1372172.hstgr.cloud:/tmp/ && \
ssh root@srv1372172.hstgr.cloud "docker load < /tmp/planning-poker-latest.tar.gz && cd /opt/planning-poker && git pull && docker compose down && docker compose up -d && docker compose ps && rm /tmp/planning-poker-latest.tar.gz" && \
rm /tmp/planning-poker-latest.tar.gz
```

## Monitoring

### Check status
```bash
ssh root@srv1372172.hstgr.cloud "cd /opt/planning-poker && docker compose ps"
```

### View logs
```bash
ssh root@srv1372172.hstgr.cloud "cd /opt/planning-poker && docker compose logs -f"
```

### Check health
```bash
curl http://srv1372172.hstgr.cloud:3000/
```

## Rollback

If something goes wrong:
```bash
ssh root@srv1372172.hstgr.cloud
cd /opt/planning-poker
docker compose down
docker run -d --name planning-poker --restart unless-stopped -p 3000:3000 planning-poker:amd64
```

## Notes
- Container automatically restarts on failure
- Health checks run every 30 seconds
- Rooms expire after 60 seconds of admin disconnect
- No persistent storage - all data is in-memory
