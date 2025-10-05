#!/bin/bash

# ArbitrageX MEV Engine Runner for Replit
# This script runs the Rust MEV engine once compiled

MEV_BINARY="./binaries/mev-engine"
MEV_BINARY_MINIMAL="./rust-mev-engine/target/release/mev-engine-minimal"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 ArbitrageX MEV Engine Starter${NC}"
echo -e "${GREEN}================================${NC}\n"

# Check if binary exists
if [ -f "$MEV_BINARY" ]; then
    echo -e "${GREEN}✅ Found MEV engine binary${NC}"
    chmod +x "$MEV_BINARY"
    
    # Export DATABASE_URL from environment
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}❌ DATABASE_URL not set${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}📊 Starting MEV Engine...${NC}\n"
    exec "$MEV_BINARY"
    
elif [ -f "$MEV_BINARY_MINIMAL" ]; then
    echo -e "${YELLOW}⚠️  Using minimal MEV engine${NC}"
    chmod +x "$MEV_BINARY_MINIMAL"
    
    # Export DATABASE_URL from environment
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}❌ DATABASE_URL not set${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}📊 Starting Minimal MEV Engine...${NC}\n"
    exec "$MEV_BINARY_MINIMAL"
    
else
    echo -e "${RED}❌ MEV Engine binary not found${NC}"
    echo -e "${YELLOW}Please compile the Rust engine externally and place it in:${NC}"
    echo -e "  • $MEV_BINARY"
    echo -e "  • Or $MEV_BINARY_MINIMAL"
    echo -e "\n${YELLOW}See instructions in:${NC} rust-mev-engine/BUILD_EXTERNAL.md"
    echo -e "\n${YELLOW}Options:${NC}"
    echo -e "  1. Use GitHub Actions (automated)"
    echo -e "  2. Compile on Windows/Linux/Mac"
    echo -e "  3. Use pre-compiled binary"
    exit 1
fi
