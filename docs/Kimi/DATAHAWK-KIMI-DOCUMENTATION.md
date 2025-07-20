# 🚀 DataHawk - Documentação Kimi (Perspectiva Alternativa)

**Versão:** 2.0.0  
**Data:** 19 de Julho, 2025  
**Autor:** Kimi AI Assistant  
**Foco:** Arquitetura Orientada a Eventos e Microserviços

---

## 🎯 Visão Executiva

O DataHawk é um **sistema de validação autônoma** que combina **6 agentes especializados** para validar dados CSV contra interfaces web em tempo real. Esta documentação apresenta uma perspectiva alternativa focada em **arquitetura orientada a eventos** e **microserviços**.

---

## 🏗️ Arquitetura de Microserviços

### **Diagrama de Arquitetura**

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[Web Dashboard]
        API[REST API Gateway]
    end
    
    subgraph "Core Services"
        CSV[CSV Service]
        CONFIG[Config Service]
        VALIDATE[Validation Service]
        REPORT[Report Service]
    end
    
    subgraph "Agent Services"
        NAV[Navigator Service]
        EXTRACT[Extractor Service]
        OCR[OCR Service]
        LLM[LLM Service]
        EVIDENCE[Evidence Service]
    end
    
    subgraph "Infrastructure"
        QUEUE[Message Queue]
        CACHE[Redis Cache]
        STORAGE[File Storage]
        DB[PostgreSQL]
    end
    
    UI --> API
    API --> CSV
    API --> CONFIG
    API --> VALIDATE
    
    CSV --> QUEUE
    CONFIG --> QUEUE
    VALIDATE --> QUEUE
    
    QUEUE --> NAV
    QUEUE --> EXTRACT
    QUEUE --> OCR
    QUEUE --> LLM
    QUEUE --> EVIDENCE
    
    NAV --> CACHE
    EXTRACT --> CACHE
    OCR --> STORAGE
    LLM --> DB
    EVIDENCE --> STORAGE
    
    style UI fill:#4CAF50
    style API fill:#2196F3
    style VALIDATE fill:#FF9800
```

---

## 📋 Microserviços Detalhados

### **1. CSV Service**
**Responsabilidade:** Gerenciamento de arquivos CSV com processamento assíncrono

```typescript
// API Endpoints
POST /api/csv/upload
GET  /api/csv/status/:id
GET  /api/csv/download/:id
DELETE /api/csv/:id

// Eventos
CSV_UPLOADED
CSV_PROCESSED
CSV_VALIDATION_STARTED
CSV_VALIDATION_COMPLETED
```

**Estrutura de Dados:**
```json
{
  "id": "csv-uuid-123",
  "filename": "customers.csv",
  "size": 1048576,
  "rows": 1250,
  "status": "processed",
  "metadata": {
    "headers": ["id", "name", "email"],
    "delimiter": ",",
    "encoding": "utf-8"
  },
  "created_at": "2025-07-19T21:30:00Z"
}
```

### **2. Config Service**
**Responsabilidade:** Gerenciamento centralizado de configurações com versionamento

```yaml
# Config Schema v2.0
apiVersion: v2
kind: ValidationConfig
metadata:
  name: customer-validation
  version: "2.1.0"
spec:
  target:
    url: "https://app.example.com/user/{id}"
    method: "GET"
    headers:
      Authorization: "Bearer ${API_TOKEN}"
  
  fields:
    - name: "customer_name"
      selector: "h1.profile-name"
      type: "text"
      validation:
        - type: "exact_match"
          threshold: 0.95
        - type: "fuzzy_match"
          threshold: 0.85
    
    - name: "email"
      selector: "span.user-email"
      type: "email"
      validation:
        - type: "regex"
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  
  performance:
    batch_size: 50
    max_workers: 5
    timeout: 30000
```

### **3. Validation Service**
**Responsabilidade:** Orquestração de validações com circuit breaker pattern

```typescript
class ValidationOrchestrator {
  private circuitBreaker: CircuitBreaker;
  private retryPolicy: RetryPolicy;
  
  async validateBatch(batch: ValidationBatch): Promise<ValidationResult> {
    const validationId = generateUUID();
    
    // Publica evento de início
    await this.eventBus.publish('VALIDATION_STARTED', {
      id: validationId,
      batchSize: batch.rows.length,
      config: batch.config
    });
    
    try {
      const results = await this.executeValidation(batch);
      
      // Publica evento de sucesso
      await this.eventBus.publish('VALIDATION_COMPLETED', {
        id: validationId,
        results,
        metrics: this.calculateMetrics(results)
      });
      
      return results;
    } catch (error) {
      // Publica evento de erro
      await this.eventBus.publish('VALIDATION_FAILED', {
        id: validationId,
        error: error.message,
        retryCount: this.retryPolicy.getRetryCount()
      });
      
      throw error;
    }
  }
}
```

---

## 🤖 Agentes como Microserviços

### **Navigator Service**
**Port:** 3001  
**Health Check:** `GET /health`  
**Responsabilidade:** Navegação web com retry automático

```typescript
// Service Definition
@Service({
  name: 'navigator-service',
  port: 3001,
  dependencies: ['browser-pool', 'proxy-rotator']
})
class NavigatorService {
  @Post('/navigate')
  async navigate(@Body() request: NavigationRequest): Promise<NavigationResult> {
    const page = await this.browserPool.acquire();
    
    try {
      const result = await page.goto(request.url, {
        waitUntil: 'networkidle',
        timeout: request.timeout || 30000
      });
      
      return {
        url: page.url(),
        status: result.status(),
        loadTime: Date.now() - startTime,
        screenshot: await page.screenshot()
      };
    } finally {
      await this.browserPool.release(page);
    }
  }
}
```

### **Extractor Service**
**Port:** 3002  
**Responsabilidade:** Extração de dados via CSS selectors e XPath

```typescript
// Extraction Strategies
interface ExtractionStrategy {
  name: string;
  extract(element: ElementHandle): Promise<ExtractedData>;
}

class DOMExtractor implements ExtractionStrategy {
  async extract(element: ElementHandle): Promise<ExtractedData> {
    const text = await element.textContent();
    const value = await element.inputValue();
    const attributes = await element.evaluate(el => el.attributes);
    
    return {
      text: text?.trim(),
      value: value?.trim(),
      attributes: Object.fromEntries(
        Array.from(attributes).map(attr => [attr.name, attr.value])
      )
    };
  }
}

class OCRExtractor implements ExtractionStrategy {
  async extract(element: ElementHandle): Promise<ExtractedData> {
    const screenshot = await element.screenshot();
    const ocrResult = await this.ocrService.extract(screenshot);
    
    return {
      text: ocrResult.text,
      confidence: ocrResult.confidence,
      method: 'ocr'
    };
  }
}
```

### **LLM Service**
**Port:** 3003  
**Responsabilidade:** Validação semântica com modelos locais

```python
# FastAPI Service
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import llama_cpp

app = FastAPI(title="LLM Validation Service")

class ValidationRequest(BaseModel):
    csv_value: str
    web_value: str
    field_type: str
    context: dict

@app.post("/validate")
async def validate_semantic(request: ValidationRequest):
    prompt = f"""
    Compare these values for semantic similarity:
    
    CSV Value: {request.csv_value}
    Web Value: {request.web_value}
    Field Type: {request.field_type}
    
    Return JSON with:
    - similarity_score (0-1)
    - is_match (boolean)
    - reasoning (string)
    """
    
    response = llm.create_completion(
        prompt=prompt,
        max_tokens=150,
        temperature=0.1
    )
    
    return parse_llm_response(response)
```

---

## 📊 Event-Driven Architecture

### **Message Queue Schema**

```typescript
// Event Types
interface ValidationEvent {
  type: 'VALIDATION_STARTED' | 'VALIDATION_COMPLETED' | 'VALIDATION_FAILED';
  payload: any;
  timestamp: Date;
  correlationId: string;
}

// Queue Configuration
const queues = {
  validation: {
    name: 'validation-queue',
    maxRetries: 3,
    retryDelay: 5000,
    deadLetterQueue: 'validation-dlq'
  },
  extraction: {
    name: 'extraction-queue',
    maxRetries: 2,
    retryDelay: 3000
  },
  evidence: {
    name: 'evidence-queue',
    maxRetries: 1,
    retryDelay: 1000
  }
};
```

### **Event Flow Example**

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Queue
    participant Navigator
    participant Extractor
    participant LLM
    participant Evidence
    
    Client->>API: POST /validate
    API->>Queue: PUBLISH validation.started
    Queue->>Navigator: CONSUME navigation.task
    Navigator->>Queue: PUBLISH navigation.completed
    Queue->>Extractor: CONSUME extraction.task
    Extractor->>Queue: PUBLISH extraction.completed
    Queue->>LLM: CONSUME validation.task
    LLM->>Queue: PUBLISH validation.completed
    Queue->>Evidence: CONSUME evidence.task
    Evidence->>Queue: PUBLISH evidence.completed
    Queue->>API: PUBLISH validation.finished
    API->>Client: 200 OK { results }
```

---

## 🔧 Configuração e Deploy

### **Docker Compose**

```yaml
version: '3.8'
services:
  api-gateway:
    image: datahawk/api-gateway:latest
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - POSTGRES_URL=postgres://user:pass@postgres:5432/datahawk

  csv-service:
    image: datahawk/csv-service:latest
    ports:
      - "3001:3001"
    volumes:
      - ./uploads:/app/uploads

  navigator-service:
    image: datahawk/navigator-service:latest
    ports:
      - "3002:3002"
    environment:
      - BROWSER_POOL_SIZE=10
      - PROXY_ROTATION=true

  llm-service:
    image: datahawk/llm-service:latest
    ports:
      - "3003:3003"
    volumes:
      - ./models:/app/models
    environment:
      - MODEL_PATH=/app/models/llama-3-8b.gguf

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=datahawk
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### **Kubernetes Deployment**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: datahawk-validation
spec:
  replicas: 3
  selector:
    matchLabels:
      app: datahawk-validation
  template:
    metadata:
      labels:
        app: datahawk-validation
    spec:
      containers:
      - name: validation-service
        image: datahawk/validation-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        - name: POSTGRES_HOST
          value: "postgres-service"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

---

## 📈 Monitoramento e Observabilidade

### **Métricas Prometheus**

```yaml
# Prometheus metrics
validation_requests_total{status="success"} 1250
validation_requests_total{status="failed"} 45
validation_duration_seconds{quantile="0.95"} 2.5
agent_utilization{service="navigator"} 0.85
agent_utilization{service="extractor"} 0.92
```

### **Dashboard Grafana**

```json
{
  "dashboard": {
    "title": "DataHawk Monitoring",
    "panels": [
      {
        "title": "Validation Throughput",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(validation_requests_total[5m])",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "title": "Agent Health",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=~\"datahawk-.*\"}",
            "legendFormat": "{{job}}"
          }
        ]
      }
    ]
  }
}
```

---

## 🧪 Testes e Qualidade

### **Test Strategy**

```typescript
// Contract Testing
describe('Navigator Service API', () => {
  it('should return navigation result with screenshot', async () => {
    const response = await request(app)
      .post('/navigate')
      .send({
        url: 'https://example.com',
        timeout: 30000
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toMatchSchema({
      url: { type: 'string' },
      status: { type: 'number' },
      screenshot: { type: 'string', format: 'base64' }
    });
  });
});

// Load Testing
describe('Performance Tests', () => {
  it('should handle 100 concurrent validations', async () => {
    const promises = Array.from({ length: 100 }, () => 
      validationService.validate(mockData)
    );
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    expect(results.every(r => r.success)).toBe(true);
  });
});
```

---

## 🚀 CI/CD Pipeline

### **GitHub Actions**

```yaml
name: DataHawk CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run contract tests
        run: npm run test:contract
      
      - name: Build Docker images
        run: docker-compose build
      
      - name: Deploy to staging
        if: github.ref == 'refs/heads/develop'
        run: |
          kubectl apply -f k8s/staging/
```

---

## 📋 Comparação com Documentação Original

| Aspecto | Documentação Original | Documentação Kimi |
|---------|----------------------|-------------------|
| **Foco** | Componentes monolíticos | Microserviços |
