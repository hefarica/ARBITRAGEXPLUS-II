#!/bin/bash

################################################################################
# ArbitrageX MEV System - Cloudflare Workers Deployment Script
# Version: 3.6.0
# 
# This script handles the complete deployment of the Cloudflare Workers
# infrastructure including environment setup, secret management, and validation.
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="arbitragex-mev-workers"
WORKERS_DIR="$(dirname "$0")"

# Function to print colored output
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    if ! command_exists wrangler; then
        print_error "Wrangler CLI is not installed"
        print_info "Installing Wrangler..."
        npm install -g wrangler
    fi
    
    if ! command_exists jq; then
        print_error "jq is not installed"
        exit 1
    fi
    
    print_success "All prerequisites met"
}

# Function to setup environment
setup_environment() {
    local ENV="${1:-production}"
    
    print_info "Setting up environment: $ENV"
    
    cd "$WORKERS_DIR"
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        print_info "Installing dependencies..."
        npm install
    fi
    
    # Build TypeScript
    print_info "Building TypeScript..."
    npx tsc --noEmit
    
    print_success "Environment setup complete"
}

# Function to create KV namespaces
create_kv_namespaces() {
    print_info "Creating KV namespaces..."
    
    # Create namespaces if they don't exist
    wrangler kv:namespace create CACHE_KV || true
    wrangler kv:namespace create RATE_LIMIT_KV || true
    wrangler kv:namespace create CONFIG_KV || true
    
    if [ "$ENV" != "production" ]; then
        wrangler kv:namespace create CACHE_KV --preview || true
        wrangler kv:namespace create RATE_LIMIT_KV --preview || true
        wrangler kv:namespace create CONFIG_KV --preview || true
    fi
    
    print_success "KV namespaces created"
}

# Function to create D1 database
create_d1_database() {
    print_info "Creating D1 database..."
    
    # Create database if it doesn't exist
    if ! wrangler d1 list | grep -q "arbitragex-db"; then
        wrangler d1 create arbitragex-db
    fi
    
    # Run migrations
    print_info "Running database migrations..."
    wrangler d1 migrations apply arbitragex-db --local
    
    if [ "$ENV" == "production" ]; then
        wrangler d1 migrations apply arbitragex-db --remote
    fi
    
    print_success "D1 database created and migrations applied"
}

# Function to set secrets
set_secrets() {
    local ENV="${1:-production}"
    
    print_info "Setting secrets for environment: $ENV"
    
    # Check if secrets file exists
    local SECRETS_FILE=".secrets.$ENV"
    
    if [ ! -f "$SECRETS_FILE" ]; then
        print_warning "Secrets file not found: $SECRETS_FILE"
        print_info "Creating template secrets file..."
        
        cat > "$SECRETS_FILE" << EOF
# ArbitrageX Cloudflare Workers Secrets
# Environment: $ENV
JWT_SECRET=your-jwt-secret-here
API_KEY=your-api-key-here
RUST_ENGINE_URL=https://your-rust-engine-url.com
ALCHEMY_API_KEY=your-alchemy-api-key
INFURA_API_KEY=your-infura-api-key
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
DISCORD_WEBHOOK_URL=your-discord-webhook-url
EOF
        
        print_warning "Please edit $SECRETS_FILE with your actual secrets"
        exit 1
    fi
    
    # Load and set secrets
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ ! "$key" =~ ^#.*$ ]] && [ -n "$key" ]; then
            # Remove any surrounding quotes
            value="${value%\"}"
            value="${value#\"}"
            
            print_info "Setting secret: $key"
            echo "$value" | wrangler secret put "$key" --env "$ENV"
        fi
    done < "$SECRETS_FILE"
    
    print_success "Secrets configured"
}

# Function to deploy workers
deploy_workers() {
    local ENV="${1:-production}"
    
    print_info "Deploying workers to environment: $ENV"
    
    cd "$WORKERS_DIR"
    
    if [ "$ENV" == "production" ]; then
        wrangler deploy --env production
    else
        wrangler deploy --env "$ENV"
    fi
    
    print_success "Workers deployed successfully"
}

# Function to verify deployment
verify_deployment() {
    local ENV="${1:-production}"
    
    print_info "Verifying deployment..."
    
    # Get worker URL
    local WORKER_URL
    if [ "$ENV" == "production" ]; then
        WORKER_URL="https://api.arbitragex.io"
    else
        WORKER_URL="https://${PROJECT_NAME}.${CF_ACCOUNT_ID}.workers.dev"
    fi
    
    # Test health endpoint
    print_info "Testing health endpoint..."
    local HEALTH_RESPONSE
    HEALTH_RESPONSE=$(curl -s "$WORKER_URL/health" || echo "{}")
    
    if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
        print_success "Health check passed"
    else
        print_error "Health check failed"
        echo "$HEALTH_RESPONSE" | jq '.' || echo "$HEALTH_RESPONSE"
        exit 1
    fi
    
    # Test API endpoints
    print_info "Testing API endpoints..."
    
    # Test opportunities endpoint
    local OPPORTUNITIES_RESPONSE
    OPPORTUNITIES_RESPONSE=$(curl -s "$WORKER_URL/api/opportunities" || echo "{}")
    
    if echo "$OPPORTUNITIES_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        print_success "Opportunities endpoint working"
    else
        print_warning "Opportunities endpoint returned unexpected response"
    fi
    
    print_success "Deployment verification complete"
}

# Function to setup monitoring
setup_monitoring() {
    print_info "Setting up monitoring..."
    
    # Create monitor configuration
    cat > monitor-config.json << EOF
{
  "name": "ArbitrageX Workers Monitor",
  "type": "http",
  "method": "GET",
  "url": "https://api.arbitragex.io/health",
  "expectedCodes": [200],
  "interval": 60,
  "retries": 2,
  "timeout": 30000,
  "alerting": {
    "enabled": true,
    "channels": ["email", "discord"]
  }
}
EOF
    
    print_info "Monitor configuration created: monitor-config.json"
    print_info "Please configure monitoring in Cloudflare dashboard"
    
    print_success "Monitoring setup complete"
}

# Function to rollback deployment
rollback_deployment() {
    local VERSION="${1:-}"
    
    print_warning "Rolling back deployment..."
    
    if [ -z "$VERSION" ]; then
        # Rollback to previous version
        wrangler rollback
    else
        # Rollback to specific version
        wrangler rollback --version "$VERSION"
    fi
    
    print_success "Rollback complete"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    deploy      Deploy workers to Cloudflare
    rollback    Rollback to previous deployment
    verify      Verify deployment health
    setup       Initial setup (KV, D1, secrets)
    monitor     Setup monitoring
    help        Show this help message

Options:
    --env       Environment (development, staging, production)
    --version   Specific version for rollback

Examples:
    $0 deploy --env production
    $0 rollback --version 1.2.3
    $0 verify --env staging
    $0 setup --env production

EOF
}

# Main script logic
main() {
    local COMMAND="${1:-help}"
    local ENV="production"
    local VERSION=""
    
    # Parse arguments
    shift || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENV="$2"
                shift 2
                ;;
            --version)
                VERSION="$2"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Execute command
    case $COMMAND in
        deploy)
            check_prerequisites
            setup_environment "$ENV"
            deploy_workers "$ENV"
            verify_deployment "$ENV"
            ;;
        rollback)
            rollback_deployment "$VERSION"
            verify_deployment "$ENV"
            ;;
        verify)
            verify_deployment "$ENV"
            ;;
        setup)
            check_prerequisites
            setup_environment "$ENV"
            create_kv_namespaces
            create_d1_database
            set_secrets "$ENV"
            ;;
        monitor)
            setup_monitoring
            ;;
        help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac
}

# Export Cloudflare account ID if available
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Run main function
main "$@"