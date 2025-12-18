# 🚀 TimeTide Deployment Guide (Debian/Ubuntu)

This guide covers deploying TimeTide on a self-hosted Debian or Ubuntu server.

## Prerequisites

- Debian 11+ or Ubuntu 22.04+
- Root access or sudo privileges
- Domain name pointing to your server
- Minimum 2GB RAM, 2 CPU cores

## 1. Server Setup

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Required Packages
```bash
# Essential tools
sudo apt install -y curl wget git build-essential software-properties-common

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### Install PostgreSQL
```bash
# Install PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16

# Start and enable
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE USER timetide WITH PASSWORD 'your-secure-password-here';
CREATE DATABASE timetide OWNER timetide;
GRANT ALL PRIVILEGES ON DATABASE timetide TO timetide;
EOF
```

### Install Redis
```bash
sudo apt install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping  # Should return PONG
```

### Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 2. Application Setup

### Create Application User
```bash
sudo useradd -m -s /bin/bash timetide
sudo mkdir -p /opt/timetide
sudo chown timetide:timetide /opt/timetide
```

### Clone Repository
```bash
sudo -u timetide bash
cd /opt/timetide
git clone https://github.com/yourusername/timetide-app.git app
cd app
```

### Install Dependencies
```bash
npm ci --only=production
```

### Configure Environment
```bash
cp .env.example .env.local
nano .env.local
```

Update the following variables:
```env
# Database
DATABASE_URL="postgresql://timetide:your-secure-password-here@localhost:5432/timetide?schema=public"

# Auth
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Email
RESEND_API_KEY="re_xxxxxxxxxxxx"
EMAIL_FROM="TimeTide <noreply@yourdomain.com>"

# Redis
REDIS_URL="redis://localhost:6379"

# App
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
```

### Generate NEXTAUTH_SECRET
```bash
openssl rand -base64 32
```

### Setup Database
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

### Build Application
```bash
npm run build
```

## 3. Process Management with PM2

### Install PM2
```bash
sudo npm install -g pm2
```

### Create PM2 Ecosystem File
```bash
cat > /opt/timetide/app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'timetide',
      script: 'npm',
      args: 'start',
      cwd: '/opt/timetide/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      error_file: '/var/log/timetide/error.log',
      out_file: '/var/log/timetide/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
EOF
```

### Create Log Directory
```bash
sudo mkdir -p /var/log/timetide
sudo chown timetide:timetide /var/log/timetide
```

### Start Application
```bash
cd /opt/timetide/app
pm2 start ecosystem.config.js
pm2 save
```

### Setup PM2 Startup Script
```bash
pm2 startup systemd -u timetide --hp /home/timetide
# Follow the output instructions
```

## 4. Nginx Configuration

### Create Nginx Server Block
```bash
sudo nano /etc/nginx/sites-available/timetide
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL (will be configured by Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Client upload size
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/timetide /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5. SSL with Let's Encrypt

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Auto-renewal
Certbot automatically sets up a cron job. Verify with:
```bash
sudo certbot renew --dry-run
```

## 6. Firewall Configuration

```bash
# Install UFW if not present
sudo apt install -y ufw

# Configure rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable
```

## 7. Database Backups

### Create Backup Script
```bash
sudo nano /opt/timetide/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/timetide"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="timetide_backup_$DATE.sql.gz"

mkdir -p $BACKUP_DIR
sudo -u postgres pg_dump timetide | gzip > "$BACKUP_DIR/$FILENAME"

# Keep only last 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $FILENAME"
```

```bash
sudo chmod +x /opt/timetide/backup.sh
```

### Setup Daily Backups
```bash
sudo crontab -e
# Add:
0 3 * * * /opt/timetide/backup.sh >> /var/log/timetide/backup.log 2>&1
```

## 8. Monitoring

### Check Application Status
```bash
pm2 status
pm2 logs timetide
```

### Check System Resources
```bash
htop
df -h
free -m
```

### View Application Logs
```bash
tail -f /var/log/timetide/out.log
tail -f /var/log/timetide/error.log
```

### View Nginx Logs
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 9. Updates

### Update Application
```bash
sudo -u timetide bash
cd /opt/timetide/app

# Pull latest changes
git pull origin main

# Install dependencies
npm ci --only=production

# Run migrations
npx prisma migrate deploy

# Rebuild
npm run build

# Restart
pm2 restart timetide
```

## 10. Troubleshooting

### Application Not Starting
```bash
# Check PM2 logs
pm2 logs timetide --lines 100

# Check if port is in use
sudo lsof -i :3000
```

### Database Connection Issues
```bash
# Test connection
sudo -u postgres psql -c "SELECT 1"

# Check PostgreSQL status
sudo systemctl status postgresql
```

### Redis Issues
```bash
# Test connection
redis-cli ping

# Check Redis status
sudo systemctl status redis-server
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Check status
sudo systemctl status nginx
```

## Security Checklist

- [ ] Strong database password
- [ ] NEXTAUTH_SECRET generated securely
- [ ] SSL enabled
- [ ] Firewall configured
- [ ] Regular backups enabled
- [ ] PM2 running as non-root user
- [ ] Environment variables secured
- [ ] Security headers configured in Nginx

---

For support, please open an issue on GitHub.
