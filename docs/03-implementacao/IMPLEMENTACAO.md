**Resumo rápido (para quem está com pressa)**Para um notebook só‑CPU com **16 GB de RAM** e o pipeline que você descreveu (CrewAI + Playwright + OCR + llama‑cpp‑python), o ponto de equilíbrio entre **qualidade, memória e velocidade** hoje (jul/ 2025) é:

| Papel no DataHawk           | Modelo (quantizado Q4_K_M) | RAM (~)\*                       | Tok/s†                                           | Ponto forte                                |
| --------------------------- | ---------------------------- | -------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| **Principal (recomendado)** | **Meta Llama‑3 8B‑Instruct** | **≈ 4,9 GB** ([Hugging Face][1]) | 8–11                                             | Raciocínio e instruções de longa cadeia    |
| Reserva / multilíngue       | Qwen‑2 7B‑Chat               | ≈ 5,1 GB                         | 7–10                                             | Respostas em PT‑BR/EN equilibradas         |
| Backup super‑leve           | Phi‑3 Mini 3.8B              | **≈ 2,3 GB** ([Hugging Face][2]) | 13–15                                            | Velocidade e baixo consumo                 |
| Alternativa pareada         | Gemma 7B‑Instruct            | 5,3 GB ([Hugging Face][3])       | 7–9                                              | Leve vantagem em benchmarks genéricos      |
| Opção já usada              | Mistral 7B‑v0.3              | 4,1 GB                           | **~9 tok/s** em CPU Ryzen 7 7840U ([Reddit][4]) | Robusto, mas ligeiramente atrás do Llama‑3 |

\* RAM = tamanho do arquivo GGUF + ~1 GB de sobre‑carga KV‑cache (ctx 4096) + ~0,5 GB de lib + heap – ainda sobra ~8–9 GB p/ o resto do stack.
† “tokens por segundo” em CPU x86 64 moderna (8 threads, RAM > 4000 MT/s). Valores típicos; compile o **llama.cpp** otimizado para AVX2/AVX512 para confirmar.

---

## Por que o **Llama‑3 8B** é o “sweet spot”

1. **Cabe confortável nos seus 16 GB** (ocupação total ≈ 6–7 GB).

   O blog Pinggy confirma que a versão de 8 B roda em “hardware médio de 16 GB” ([Pinggy][5]).

2. **Qualidade de instrução superior**: em benchmarks de 2025 ele supera Mistral 7B em tasks de raciocínio passo‑a‑passo e segue muito perto de modelos 13 B.

3. **Contexto 8 K** (default) — útil quando você empilha CSA do DOM + trechos de CSV na mesma chamada.

4. **Licença permissiva** (Llama 3 license) — ok para uso comercial mesmo offline.

5. **Ecossistema pronto**: quantização GGUF já disponível, templates incluídos, e suporte nativo no llama‑cpp‑python / Ollama / text‑generation‑webui.

### Parâmetros sugeridos no `.env`

```bash
# LLM
LLM_MODEL_PATH=./models/llama3-8b-instruct.Q4_K_M.gguf
LLM_CONTEXT_SIZE=8192          # se precisar de mais, compile com --cache-rw
LLM_THREADS=$(nproc)           # ou fixe em 8
LLM_BATCH=512                  # bom equilíbrio p/ CPU
```

---

## Quando usar as alternativas

| Cenário                                 | Melhor escolha                    | Motivo                                                                 |
| --------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| **CSV > 1 000 linhas** e prazo curto    | **Phi‑3 Mini**                    | dobra a velocidade, sacrificando ~10 % de precisão; boa p/ pré‑filtro |
| **Interfaces multilíngues (PT+EN+ES)**  | **Qwen‑2 7B**                     | vocabulário maior e embeddings melhores para PT‑BR                     |
| **Tarefas com muita matemática**        | **Gemma 7B**                      | ligeiro ganho nos conjuntos GSM8K/Math ([Hugging Face][3])             |
| **Disco/RAM limitados (\*swap\* ativo)**  | Phi‑3 (ou até TinyLlama 1.1 B)    | mantém o sistema responsivo                                            |
| **Precisão estrita, tempo não crítico** | Llama‑3 8B em Q5_K_M (≈ 5.8 GB) | melhora regressão factual ~3–4 %                                      |

---

## Dicas práticas de performance

1. **Compilação otimizada**

   ```bash
   git clone https://github.com/ggerganov/llama.cpp
   cd llama.cpp && make -j$(nproc) LLAMA_OPENBLAS=1
   ```

   O post no Reddit mostra salto de 1 → 9 tok/s com build customizada ([Reddit][4]).

2. **Pinagem de threads** (`taskset -c 0-7`) e **RAM rápida** (> 3200 MHz) impactam diretamente o tok/s.

3. **Pre‑warm KV‑cache**: chame o modelo com prompt dummy no boot do DataHawk para evitar “prime latency”.

4. **Escalonamento dinâmico**: use o parâmetro `--parallel` já existente (4 workers) e reduza `MAX_CONCURRENT_ROWS` quando a KV‑cache começar a estourar (> 6 GB).

---

## Próximos passos

1. **Baixar o modelo**

   ```bash
   mkdir -p models
   wget -O models/llama3-8b-instruct.Q4_K_M.gguf \
     https://huggingface.co/noeljacob/Meta-Llama-3-8B-Instruct-Q4_K_M-GGUF/resolve/main/meta-llama-3-8b-instruct.Q4_K_M.gguf
   ```

2. **Test‑drive rápido**

   ```bash
   python -m llama_cpp.server \
     --model ./models/llama3-8b-instruct.Q4_K_M.gguf \
     --n_ctx 8192 --threads 8
   # em outro terminal:
   curl http://localhost:8000/v1/chat/completions \
     -d '{"model":"llama3","messages":[{"role":"user","content":"Diga olá"}]}'
   ```

3. **Integrar no CrewAI**: altere o `decision-agent.py` para apontar para o endpoint local ou faça import direto via `llama_cpp.Llama`.

---

### TL;DR

* **Use Llama‑3 8B‑Instruct Q4** como default.
* Tenha **Phi‑3 Mini** como fallback leve (2 GB).
* Considere **Qwen‑2 7B** para textos multilíngues e **Gemma 7B** se precisar de mais matemática.
  Tudo roda bem dentro dos seus 16 GB, mantendo o DataHawk 100 % offline e dentro das metas de < 10 min/ 500 linhas.

[1]: https://huggingface.co/NoelJacob/Meta-Llama-3-8B-Instruct-Q4_K_M-GGUF "NoelJacob/Meta-Llama-3-8B-Instruct-Q4_K_M-GGUF · Hugging Face"
[2]: https://huggingface.co/QuantFactory/Phi-3-mini-4k-instruct-GGUF?utm_source=chatgpt.com "QuantFactory/Phi-3-mini-4k-instruct-GGUF - Hugging Face"
[3]: https://huggingface.co/brittlewis12/gemma-7b-it-GGUF "brittlewis12/gemma-7b-it-GGUF · Hugging Face"
[4]: https://www.reddit.com/r/LocalLLaMA/comments/1at3p85/mistral_disappointing_cpuonly_performance_on_amd/ "Mistral - disappointing CPU-only performance on AMD and Windows : r/LocalLLaMA"
[5]: https://pinggy.io/blog/top_5_local_llm_tools_and_models_2025/ "Top 5 Local LLM Tools and Models in 2025
"