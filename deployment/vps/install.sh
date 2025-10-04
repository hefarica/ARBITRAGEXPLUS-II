#!/bin/bash

################################################################################
# ArbitrageX MEV Engine - VPS Installation Script
# Version: 3.6.0
# Requirements: Ubuntu 22.04+ or Debian 11+
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${DOMAIN:-mev.arbitragex.com}"
EMAIL="${EMAIL:-admin@arbitragex.com}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 32)}"
GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-$(openssl rand -base64 32)}"
MEV_ENGINE_PORT=8080
GRAFANA_PORT=3000
PROMETHEUS_PORT=9090

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check OS compatibility
check_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
            log_error "This script requires Ubuntu 22.04+ or Debian 11+"
        fi
        
        if [[ "$ID" == "ubuntu" ]]; then
            VERSION_ID_MAJOR=$(echo "$VERSION_ID" | cut -d. -f1)
            if [[ "$VERSION_ID_MAJOR" -lt 22 ]]; then
                log_error "Ubuntu version must be 22.04 or higher"
            fi
        elif [[ "$ID" == "debian" ]]; then
            if [[ "$VERSION_ID" -lt 11 ]]; then
                log_error "Debian version must be 11 or higher"
            fi
        fi
    else
        log_error "Cannot determine OS version"
    fi
    
    log_info "OS check passed: $PRETTY_NAME"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
    fi
    log_info "Running as root"
}

# Update system packages
update_system() {
    log_info "Updating system packages..."
    apt-get update
    apt-get upgrade -y
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        ufw \
        fail2ban \
        htop \
        iotop \
        ncdu \
        jq \
        unzip
}

# Install Rust
install_rust() {
    log_info "Installing Rust..."
    if ! command -v rustc &> /dev/null; then
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source $HOME/.cargo/env
        rustup update stable
        rustup default stable
    else
        log_info "Rust already installed: $(rustc --version)"
    fi
}

# Install Node.js 20
install_nodejs() {
    log_info "Installing Node.js 20..."
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        log_info "Node.js already installed: $(node --version)"
    fi
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com | bash
        systemctl enable docker
        systemctl start docker
    else
        log_info "Docker already installed: $(docker --version)"
    fi
}

# Install Nginx
install_nginx() {
    log_info "Installing Nginx..."
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
}

# Install PostgreSQL 16
install_postgresql() {
    log_info "Installing PostgreSQL 16..."
    
    # Add PostgreSQL repository
    sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
    apt-get update
    apt-get install -y postgresql-16 postgresql-client-16 postgresql-contrib-16
    
    # Configure PostgreSQL
    systemctl enable postgresql
    systemctl start postgresql
    
    # Create database and user
    sudo -u postgres psql <<EOF
CREATE USER mevengine WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE arbitragex OWNER mevengine;
GRANT ALL PRIVILEGES ON DATABASE arbitragex TO mevengine;
ALTER USER mevengine CREATEDB;
EOF
    
    # Configure PostgreSQL for replication (streaming replication)
    PG_VERSION=16
    PG_CONFIG="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
    PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
    
    # Backup original configs
    cp $PG_CONFIG $PG_CONFIG.bak
    cp $PG_HBA $PG_HBA.bak
    
    # Configure for replication
    cat >> $PG_CONFIG <<EOF

# Replication Settings
wal_level = replica
max_wal_senders = 10
wal_keep_segments = 64
max_replication_slots = 10
hot_standby = on

# Performance Tuning
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_parallel_maintenance_workers = 4
EOF
    
    # Allow connections
    echo "host    all             all             0.0.0.0/0               scram-sha-256" >> $PG_HBA
    echo "host    replication     all             0.0.0.0/0               scram-sha-256" >> $PG_HBA
    
    systemctl restart postgresql
    
    log_info "PostgreSQL installed and configured"
}

# Setup firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (change port if needed)
    ufw allow 22/tcp comment 'SSH'
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    
    # Allow MEV Engine
    ufw allow $MEV_ENGINE_PORT/tcp comment 'MEV Engine'
    
    # Allow Grafana
    ufw allow $GRAFANA_PORT/tcp comment 'Grafana'
    
    # Allow Prometheus (internal only)
    ufw allow from 127.0.0.1 to any port $PROMETHEUS_PORT comment 'Prometheus'
    
    # Allow PostgreSQL (consider restricting to specific IPs)
    ufw allow 5432/tcp comment 'PostgreSQL'
    
    # Enable firewall
    ufw --force enable
    
    log_info "Firewall configured"
}

# Install Certbot for Let's Encrypt
install_certbot() {
    log_info "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
    
    # Get SSL certificate
    if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
        certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
        
        # Setup auto-renewal
        cat > /etc/cron.d/certbot <<EOF
0 */12 * * * root certbot renew --quiet --no-self-upgrade
EOF
    else
        log_warn "DOMAIN and EMAIL not set, skipping SSL setup"
    fi
}

# Setup monitoring stack
setup_monitoring() {
    log_info "Setting up monitoring stack..."
    
    # Create monitoring directory
    mkdir -p /opt/monitoring
    
    # Copy docker-compose.yml (will be created separately)
    cp docker-compose.yml /opt/monitoring/
    
    # Copy Prometheus config
    cp prometheus.yml /opt/monitoring/
    
    # Copy Grafana dashboard
    mkdir -p /opt/monitoring/grafana/dashboards
    cp grafana-dashboard.json /opt/monitoring/grafana/dashboards/
    
    # Start monitoring stack
    cd /opt/monitoring
    docker-compose up -d
    
    log_info "Monitoring stack started"
}

# Setup systemd services
setup_systemd_services() {
    log_info "Setting up systemd services..."
    
    # Copy service files
    cp systemd/*.service /etc/systemd/system/
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable services
    systemctl enable rust-mev-engine.service
    systemctl enable monitoring.service
    
    log_info "Systemd services configured"
}

# Setup log rotation
setup_log_rotation() {
    log_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/mev-engine <<EOF
/var/log/mev-engine/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        systemctl reload rust-mev-engine
    endscript
}
EOF
    
    log_info "Log rotation configured"
}

# Create backup script
create_backup_script() {
    log_info "Creating backup script..."
    
    cat > /usr/local/bin/backup-mev.sh <<'EOF'
#!/bin/bash

# Backup configuration
BACKUP_DIR="/var/backups/mev-engine"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
pg_dump -U mevengine arbitragex | gzip > $BACKUP_DIR/db_$TIMESTAMP.sql.gz

# Backup configuration files
tar czf $BACKUP_DIR/config_$TIMESTAMP.tar.gz \
    /etc/nginx/sites-available/ \
    /etc/systemd/system/rust-mev-engine.service \
    /opt/monitoring/

# Backup application data
tar czf $BACKUP_DIR/app_$TIMESTAMP.tar.gz \
    /opt/mev-engine/ \
    --exclude=/opt/mev-engine/logs \
    --exclude=/opt/mev-engine/target

# Remove old backups
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $TIMESTAMP"
EOF
    
    chmod +x /usr/local/bin/backup-mev.sh
    
    # Add to crontab
    cat > /etc/cron.d/mev-backup <<EOF
0 3 * * * root /usr/local/bin/backup-mev.sh
EOF
    
    log_info "Backup script created"
}

# Install fail2ban rules
setup_fail2ban() {
    log_info "Setting up fail2ban..."
    
    cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true

[nginx-botsearch]
enabled = true
EOF
    
    systemctl enable fail2ban
    systemctl restart fail2ban
    
    log_info "Fail2ban configured"
}

# Create health check script
create_health_check() {
    log_info "Creating health check script..."
    
    cat > /usr/local/bin/health-check.sh <<'EOF'
#!/bin/bash

# Health check script
ERRORS=0

# Check MEV Engine
if ! systemctl is-active --quiet rust-mev-engine; then
    echo "ERROR: MEV Engine is not running"
    ((ERRORS++))
fi

# Check PostgreSQL
if ! systemctl is-active --quiet postgresql; then
    echo "ERROR: PostgreSQL is not running"
    ((ERRORS++))
fi

# Check Nginx
if ! systemctl is-active --quiet nginx; then
    echo "ERROR: Nginx is not running"
    ((ERRORS++))
fi

# Check Docker
if ! systemctl is-active --quiet docker; then
    echo "ERROR: Docker is not running"
    ((ERRORS++))
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "WARNING: Disk usage is at $DISK_USAGE%"
fi

# Check memory
MEM_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')
if [ $MEM_USAGE -gt 80 ]; then
    echo "WARNING: Memory usage is at $MEM_USAGE%"
fi

if [ $ERRORS -eq 0 ]; then
    echo "All systems operational"
    exit 0
else
    echo "System health check failed with $ERRORS errors"
    exit 1
fi
EOF
    
    chmod +x /usr/local/bin/health-check.sh
    
    log_info "Health check script created"
}

# Final configuration
final_configuration() {
    log_info "Performing final configuration..."
    
    # Create necessary directories
    mkdir -p /var/log/mev-engine
    mkdir -p /opt/mev-engine
    mkdir -p /var/backups/mev-engine
    
    # Set up environment file
    cat > /etc/mev-engine.env <<EOF
DATABASE_URL=postgresql://mevengine:${DB_PASSWORD}@localhost:5432/arbitragex
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}
NODE_ENV=production
MEV_ENGINE_PORT=${MEV_ENGINE_PORT}
EOF
    
    chmod 600 /etc/mev-engine.env
    
    # Output important information
    cat > /root/mev-installation-info.txt <<EOF
==============================================
ArbitrageX MEV Engine Installation Complete
==============================================

Database Password: ${DB_PASSWORD}
Grafana Password: ${GRAFANA_PASSWORD}

Access URLs:
- MEV Engine: http://${DOMAIN}:${MEV_ENGINE_PORT}
- Grafana: http://${DOMAIN}:${GRAFANA_PORT}
- Prometheus: http://localhost:${PROMETHEUS_PORT}

Commands:
- Check status: systemctl status rust-mev-engine
- View logs: journalctl -u rust-mev-engine -f
- Health check: /usr/local/bin/health-check.sh
- Backup: /usr/local/bin/backup-mev.sh

Security:
- Firewall: ufw status
- Fail2ban: fail2ban-client status

IMPORTANT: Save this information securely and delete this file!
==============================================
EOF
    
    log_info "Installation information saved to /root/mev-installation-info.txt"
}

# Main installation flow
main() {
    log_info "Starting ArbitrageX MEV Engine installation..."
    
    check_root
    check_os
    update_system
    install_rust
    install_nodejs
    install_docker
    install_nginx
    install_postgresql
    configure_firewall
    install_certbot
    setup_systemd_services
    setup_log_rotation
    create_backup_script
    setup_fail2ban
    create_health_check
    final_configuration
    
    log_info "✅ Installation complete! Review /root/mev-installation-info.txt for details."
    log_warn "⚠️  Remember to: 1) Deploy your application code, 2) Configure Nginx properly, 3) Start the MEV engine service"
}

# Run main function
main "$@"