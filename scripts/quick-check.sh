#!/bin/bash

# DataHawk Quick Validation Script - Issue 006
# Executa verificações rápidas dos componentes críticos

set -e

echo "🚀 DataHawk Quick System Check"
echo "==============================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check functions
check_build() {
    echo -e "${BLUE}🔍 Checking TypeScript build...${NC}"
    if npm run build >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Build: PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ Build: FAILED${NC}"
        return 1
    fi
}

check_config_manager() {
    echo -e "${BLUE}🔍 Checking ConfigManager methods...${NC}"
    if grep -q "mergeConfigs(" src/core/config-manager.ts && grep -q "saveValidationConfig(" src/core/config-manager.ts; then
        echo -e "${GREEN}✅ ConfigManager: PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ ConfigManager: FAILED${NC}"
        return 1
    fi
}

check_llm_engine() {
    echo -e "${BLUE}🔍 Checking LLM Engine enhancements...${NC}"
    if grep -q "checkLLMServer" src/llm/local-llm-engine.ts && grep -q "8080" src/llm/local-llm-engine.ts; then
        echo -e "${GREEN}✅ LLM Engine: PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ LLM Engine: FAILED${NC}"
        return 1
    fi
}

check_resource_manager() {
    echo -e "${BLUE}🔍 Checking Resource Management...${NC}"
    if [ -f "src/core/resource-manager.ts" ] && grep -q "ManagedResource" src/automation/browser-agent.ts; then
        echo -e "${GREEN}✅ Resource Management: PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ Resource Management: FAILED${NC}"
        return 1
    fi
}

check_documentation() {
    echo -e "${BLUE}🔍 Checking fix documentation...${NC}"
    if [ -d "docs/fixed" ] && [ -f "docs/fixed/FINAL_QA_FIXES_REPORT.md" ]; then
        local count=$(ls docs/fixed/*.md 2>/dev/null | wc -l)
        if [ "$count" -ge 6 ]; then
            echo -e "${GREEN}✅ Documentation: PASSED ($count files)${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Documentation: PARTIAL ($count files)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Documentation: FAILED${NC}"
        return 1
    fi
}

check_llm_server_connection() {
    echo -e "${BLUE}🔍 Checking LLM server connection...${NC}"
    
    # Test common LLM server ports
    for port in 8080 8000; do
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ LLM Server: RUNNING on port $port${NC}"
            return 0
        fi
    done
    
    echo -e "${YELLOW}⚠️  LLM Server: NOT RUNNING (stub mode)${NC}"
    return 1
}

# Main execution
main() {
    local passed=0
    local total=6
    
    # Run checks
    check_build && ((passed++))
    check_config_manager && ((passed++))
    check_llm_engine && ((passed++))  
    check_resource_manager && ((passed++))
    check_documentation && ((passed++))
    check_llm_server_connection && ((passed++))
    
    echo ""
    echo "==============================="
    
    # Calculate success rate
    local success_rate=$((passed * 100 / total))
    
    if [ $success_rate -ge 90 ]; then
        echo -e "${GREEN}🎉 System Status: EXCELLENT ($passed/$total - $success_rate%)${NC}"
        exit_code=0
    elif [ $success_rate -ge 70 ]; then
        echo -e "${YELLOW}⚠️  System Status: GOOD ($passed/$total - $success_rate%)${NC}"
        exit_code=0
    else
        echo -e "${RED}❌ System Status: NEEDS ATTENTION ($passed/$total - $success_rate%)${NC}"
        exit_code=1
    fi
    
    echo ""
    echo "📋 Quick Actions:"
    echo "  • Full validation: node scripts/validate-system.js"
    echo "  • Run tests: npm test"
    echo "  • Start LLM server: ./llama.cpp/server -m models/llama3-8b-instruct.Q4_K_M.gguf --port 8080"
    
    exit $exit_code
}

# Make script executable and run
chmod +x "$0"
main "$@"