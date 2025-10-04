#!/bin/bash

# Rust MEV Engine Deployment Script v3.6.0
# Production deployment for MEV Engine on Linux/VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="/opt/rust-mev-engine"
SERVICE_NAME="mev-engine"
SERVICE_USER="mev"
LOG_DIR="/var/log/mev-engine"
CONFIG_DIR="/etc/mev-engine"
BACKUP_DIR="/opt/backups/mev-engine"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Rust MEV Engine Deployment Script   ${NC}"
echo -e "${BLUE}           Version 3.6.0                ${NC}"
echo -e "${BLUE}========================================${NC}"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

# Parse command line arguments
ENVIRONMENT=${1:-production}
ACTION=${2:-deploy}

print_info "Environment: $ENVIRONMENT"
print_info "Action: $ACTION"

# Function to check dependencies
check_dependencies() {
    print_info "Checking dependencies..."
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        print_warning "Rust not found. Installing..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source $HOME/.cargo/env
    else
        print_success "Rust is installed"
    fi
    
    # Check PostgreSQL client
    if ! command -v psql &> /dev/null; then
        print_warning "PostgreSQL client not found. Installing..."
        apt-get update && apt-get install -y postgresql-client
    else
        print_success "PostgreSQL client is installed"
    fi
    
    # Check systemd
    if ! command -v systemctl &> /dev/null; then
        print_error "systemd not found. This script requires systemd"
        exit 1
    else
        print_success "systemd is installed"
    fi
    
    # Check Prometheus (optional)
    if ! command -v prometheus &> /dev/null; then
        print_warning "Prometheus not found. Metrics collection will be limited"
    else
        print_success "Prometheus is installed"
    fi
}

# Function to create user and directories
setup_environment() {
    print_info "Setting up environment..."
    
    # Create service user if it doesn't exist
    if ! id "$SERVICE_USER" &>/dev/null; then
        print_info "Creating service user: $SERVICE_USER"
        useradd -m -s /bin/bash $SERVICE_USER
    fi
    
    # Create directories
    print_info "Creating directories..."
    mkdir -p $DEPLOY_DIR
    mkdir -p $LOG_DIR
    mkdir -p $CONFIG_DIR
    mkdir -p $BACKUP_DIR
    
    # Set permissions
    chown -R $SERVICE_USER:$SERVICE_USER $DEPLOY_DIR
    chown -R $SERVICE_USER:$SERVICE_USER $LOG_DIR
    chown -R $SERVICE_USER:$SERVICE_USER $CONFIG_DIR
    
    print_success "Environment setup complete"
}

# Function to backup existing deployment
backup_existing() {
    if [ -d "$DEPLOY_DIR/target" ]; then
        print_info "Backing up existing deployment..."
        BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
        
        # Backup binary
        if [ -f "$DEPLOY_DIR/target/release/mev-engine" ]; then
            cp "$DEPLOY_DIR/target/release/mev-engine" "$BACKUP_DIR/$BACKUP_NAME/"
        fi
        
        # Backup config
        if [ -f "$CONFIG_DIR/config.toml" ]; then
            cp "$CONFIG_DIR/config.toml" "$BACKUP_DIR/$BACKUP_NAME/"
        fi
        
        print_success "Backup created: $BACKUP_DIR/$BACKUP_NAME"
    fi
}

# Function to build the application
build_application() {
    print_info "Building MEV Engine..."
    
    cd $(dirname $0)/..
    
    # Copy source to deploy directory
    print_info "Copying source files..."
    rsync -av --exclude 'target' --exclude '.git' . $DEPLOY_DIR/
    
    cd $DEPLOY_DIR
    
    # Build in release mode
    print_info "Running cargo build in release mode..."
    sudo -u $SERVICE_USER cargo build --release
    
    if [ $? -eq 0 ]; then
        print_success "Build completed successfully"
    else
        print_error "Build failed"
        exit 1
    fi
}

# Function to install configuration
install_config() {
    print_info "Installing configuration..."
    
    # Copy config file
    if [ -f "$DEPLOY_DIR/config/config.toml" ]; then
        cp "$DEPLOY_DIR/config/config.toml" "$CONFIG_DIR/"
        
        # Update database connection string if provided
        if [ ! -z "$DATABASE_URL" ]; then
            sed -i "s|connection_string = .*|connection_string = \"$DATABASE_URL\"|" "$CONFIG_DIR/config.toml"
        fi
        
        # Update RPC endpoints with real API keys if provided
        if [ ! -z "$ALCHEMY_API_KEY" ]; then
            sed -i "s|YOUR_API_KEY_1|$ALCHEMY_API_KEY|g" "$CONFIG_DIR/config.toml"
        fi
        
        if [ ! -z "$INFURA_API_KEY" ]; then
            sed -i "s|YOUR_API_KEY_2|$INFURA_API_KEY|g" "$CONFIG_DIR/config.toml"
        fi
        
        chown $SERVICE_USER:$SERVICE_USER "$CONFIG_DIR/config.toml"
        chmod 600 "$CONFIG_DIR/config.toml"
        
        print_success "Configuration installed"
    else
        print_error "Config file not found"
        exit 1
    fi
}

# Function to create systemd service
create_systemd_service() {
    print_info "Creating systemd service..."
    
    cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=Rust MEV Engine
After=network.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$DEPLOY_DIR
Environment="RUST_LOG=info"
Environment="RUST_BACKTRACE=1"
ExecStart=$DEPLOY_DIR/target/release/mev-engine
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/mev-engine.log
StandardError=append:$LOG_DIR/mev-engine-error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LOG_DIR $CONFIG_DIR

# Resource limits
LimitNOFILE=65535
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    print_success "Systemd service created"
}

# Function to setup log rotation
setup_log_rotation() {
    print_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/mev-engine <<EOF
$LOG_DIR/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $SERVICE_USER $SERVICE_USER
    sharedscripts
    postrotate
        systemctl reload $SERVICE_NAME 2>/dev/null || true
    endscript
}
EOF

    print_success "Log rotation configured"
}

# Function to setup firewall rules
setup_firewall() {
    print_info "Setting up firewall rules..."
    
    # Check if ufw is installed
    if command -v ufw &> /dev/null; then
        # Allow MEV Engine API port
        ufw allow 8080/tcp comment 'MEV Engine API'
        
        # Allow Prometheus metrics port
        ufw allow 9090/tcp comment 'Prometheus metrics'
        
        print_success "Firewall rules configured"
    else
        print_warning "UFW not installed. Please configure firewall manually"
    fi
}

# Function to start the service
start_service() {
    print_info "Starting MEV Engine service..."
    
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    # Wait for service to start
    sleep 5
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        print_success "MEV Engine service started successfully"
        systemctl status $SERVICE_NAME --no-pager
    else
        print_error "Failed to start MEV Engine service"
        journalctl -u $SERVICE_NAME -n 50 --no-pager
        exit 1
    fi
}

# Function to stop the service
stop_service() {
    print_info "Stopping MEV Engine service..."
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        systemctl stop $SERVICE_NAME
        print_success "MEV Engine service stopped"
    else
        print_info "MEV Engine service is not running"
    fi
}

# Function to check service health
check_health() {
    print_info "Checking service health..."
    
    # Check if service is running
    if systemctl is-active --quiet $SERVICE_NAME; then
        print_success "Service is running"
    else
        print_error "Service is not running"
        return 1
    fi
    
    # Check API endpoint
    if curl -f -s http://localhost:8080/health > /dev/null; then
        print_success "API endpoint is responding"
    else
        print_error "API endpoint is not responding"
        return 1
    fi
    
    # Check metrics endpoint
    if curl -f -s http://localhost:8080/metrics > /dev/null; then
        print_success "Metrics endpoint is responding"
    else
        print_warning "Metrics endpoint is not responding"
    fi
    
    # Check recent logs for errors
    ERROR_COUNT=$(tail -n 100 $LOG_DIR/mev-engine-error.log 2>/dev/null | grep -c ERROR || true)
    if [ "$ERROR_COUNT" -eq 0 ]; then
        print_success "No recent errors in logs"
    else
        print_warning "Found $ERROR_COUNT errors in recent logs"
    fi
    
    return 0
}

# Function to display logs
show_logs() {
    print_info "Showing recent logs..."
    echo "----------------------------------------"
    tail -n 50 $LOG_DIR/mev-engine.log
    echo "----------------------------------------"
}

# Main execution flow
case $ACTION in
    deploy)
        print_info "Starting full deployment..."
        check_dependencies
        setup_environment
        backup_existing
        build_application
        install_config
        create_systemd_service
        setup_log_rotation
        setup_firewall
        start_service
        check_health
        print_success "Deployment completed successfully!"
        ;;
    
    update)
        print_info "Updating MEV Engine..."
        backup_existing
        stop_service
        build_application
        install_config
        start_service
        check_health
        print_success "Update completed successfully!"
        ;;
    
    start)
        start_service
        ;;
    
    stop)
        stop_service
        ;;
    
    restart)
        stop_service
        start_service
        check_health
        ;;
    
    status)
        systemctl status $SERVICE_NAME --no-pager
        check_health
        ;;
    
    logs)
        show_logs
        ;;
    
    health)
        check_health
        ;;
    
    backup)
        backup_existing
        ;;
    
    *)
        echo "Usage: $0 [environment] [action]"
        echo ""
        echo "Environments:"
        echo "  production  - Production deployment (default)"
        echo "  staging     - Staging deployment"
        echo ""
        echo "Actions:"
        echo "  deploy      - Full deployment (default)"
        echo "  update      - Update existing deployment"
        echo "  start       - Start the service"
        echo "  stop        - Stop the service"
        echo "  restart     - Restart the service"
        echo "  status      - Show service status"
        echo "  logs        - Show recent logs"
        echo "  health      - Check service health"
        echo "  backup      - Backup current deployment"
        echo ""
        echo "Examples:"
        echo "  $0 production deploy    - Deploy to production"
        echo "  $0 staging update       - Update staging environment"
        echo "  $0 production status    - Check production status"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}        Operation Completed             ${NC}"
echo -e "${GREEN}========================================${NC}"