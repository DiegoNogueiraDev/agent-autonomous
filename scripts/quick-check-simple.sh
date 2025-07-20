#!/bin/bash

echo "🚀 DataHawk Quick System Check"
echo "==============================="

passed=0
total=6

# Check 1: Build
echo "🔍 Checking TypeScript build..."
if npm run build > /dev/null 2>&1; then
    echo "✅ Build: PASSED"
    ((passed++))
else
    echo "❌ Build: FAILED"
fi

# Check 2: Config Manager  
echo "🔍 Checking ConfigManager methods..."
if grep -q "mergeConfigs(" src/core/config-manager.ts && grep -q "saveValidationConfig(" src/core/config-manager.ts; then
    echo "✅ ConfigManager: PASSED"
    ((passed++))
else
    echo "❌ ConfigManager: FAILED"
fi

# Check 3: LLM Engine
echo "🔍 Checking LLM Engine enhancements..."
if grep -q "checkLLMServer" src/llm/local-llm-engine.ts && grep -q "8080" src/llm/local-llm-engine.ts; then
    echo "✅ LLM Engine: PASSED"
    ((passed++))
else
    echo "❌ LLM Engine: FAILED"
fi

# Check 4: Resource Manager
echo "🔍 Checking Resource Management..."
if [ -f "src/core/resource-manager.ts" ] && grep -q "ManagedResource" src/automation/browser-agent.ts; then
    echo "✅ Resource Management: PASSED"
    ((passed++))
else
    echo "❌ Resource Management: FAILED"
fi

# Check 5: Documentation
echo "🔍 Checking fix documentation..."
if [ -d "docs/fixed" ] && [ -f "docs/fixed/FINAL_QA_FIXES_REPORT.md" ]; then
    count=$(ls docs/fixed/*.md 2>/dev/null | wc -l)
    if [ "$count" -ge 6 ]; then
        echo "✅ Documentation: PASSED ($count files)"
        ((passed++))
    else
        echo "⚠️  Documentation: PARTIAL ($count files)"
    fi
else
    echo "❌ Documentation: FAILED"
fi

# Check 6: LLM Server Connection
echo "🔍 Checking LLM server connection..."
if curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
    echo "✅ LLM Server: RUNNING on port 8080"
    ((passed++))
elif curl -s -f "http://localhost:8000/health" > /dev/null 2>&1; then
    echo "✅ LLM Server: RUNNING on port 8000"
    ((passed++))
else
    echo "⚠️  LLM Server: NOT RUNNING (stub mode)"
fi

echo ""
echo "==============================="

success_rate=$((passed * 100 / total))

if [ $success_rate -ge 90 ]; then
    echo "🎉 System Status: EXCELLENT ($passed/$total - $success_rate%)"
elif [ $success_rate -ge 70 ]; then
    echo "⚠️  System Status: GOOD ($passed/$total - $success_rate%)"
else
    echo "❌ System Status: NEEDS ATTENTION ($passed/$total - $success_rate%)"
fi

echo ""
echo "📋 Quick Actions:"
echo "  • Full validation: node scripts/validate-system.js"
echo "  • Run tests: npm test"
echo "  • Start LLM server: ./llama.cpp/server -m models/llama3-8b-instruct.Q4_K_M.gguf --port 8080"