// Preloaded realistic Agent Markdown samples for instant testing
window.MARKDOWN_SAMPLES = {
  engine_differences: {
    name: "🔍 Spot Engine Differences (Tasks, Tables, Links)",
    description: "Compare task checkboxes, tables, autolinks, and strikethrough side-by-side",
    content: `# Engine Differences Benchmark

Notice how each library treats the exact same syntax differently below:

## 1. Task List Checkboxes (Look at Remarkable & Snarkdown)
- [x] Completed milestone (Marked & markdown-it & Showdown render real checkboxes)
- [ ] Pending task item (Remarkable leaves as text "[ ]", Snarkdown breaks into a broken link)

## 2. GFM Tables (Look at Snarkdown)
| Feature | Marked | markdown-it | Showdown | Remarkable | Snarkdown |
| :--- | :---: | :---: | :---: | :---: | :---: |
| GFM Tables | ✅ | ✅ | ✅ | ✅ | ❌ Raw Pipes |
| Task Checkboxes | ✅ | ✅ | ✅ | ❌ Plain text | ❌ Broken link |
| Bare Auto-links | ✅ | ✅ | ✅ | ✅ | ❌ Plain text |
| Strikethrough Tag | \`<del>\` | \`<s>\` | \`<del>\` | \`<del>\` | \`<s>\` |
| Heading IDs | ❌ None | ❌ None | ✅ \`id="..."\` | ❌ None | ❌ None |

## 3. Inline Strikethrough & Auto-linking
- Strikethrough: ~~This text should be crossed out~~
- Bare URL Auto-link: https://github.com
- Bracket URL: <https://antigravity.google>

## 4. Alert Callout (> [!NOTE])
> [!NOTE]
> Snarkdown breaks this because its regex mistakes \`[!NOTE]\` for a markdown link!

## 5. Mermaid Architecture
\`\`\`mermaid
flowchart LR
    Agent[Agent Prompt] --> Marked[Marked v18]
    Agent --> MdIt[markdown-it v15]
    Agent --> Showdown[Showdown v2.1]
    Agent --> Remarkable[Remarkable v2.0]
    Agent --> Snarkdown[Snarkdown v2.0]
\`\`\`
`
  },

  agent_plan: {
    name: "🤖 Agent Architecture & Plan",
    description: "Flowchart, task checklist, API table, alerts, and code blocks",
    content: `# Agent Execution Plan: Multi-Tool Pipeline Refactor

> [!IMPORTANT]
> This plan replaces the legacy synchronous RPC handler with an event-driven worker pool. Review the flowchart below before deployment.

## 1. System Architecture

\`\`\`mermaid
flowchart TD
    User([User Prompt]) --> Gateway[API Gateway / Router]
    Gateway --> Planner{Agent Planner}
    
    Planner -->|Select Tool| Registry[Tool Registry]
    Planner -->|Direct Response| Output([Final Answer])
    
    subgraph Execution Pool
        Registry --> Worker1[Sandbox Runner 1]
        Registry --> Worker2[Sandbox Runner 2]
        Worker1 --> Result[(Telemetry & Results)]
        Worker2 --> Result
    end
    
    Result --> Memory[(Vector Memory / Store)]
    Memory --> Planner

    style User fill:#3b82f6,stroke:#1d4ed8,color:#fff
    style Output fill:#10b981,stroke:#047857,color:#fff
    style Planner fill:#f59e0b,stroke:#d97706,color:#000
\`\`\`

## 2. Implementation Milestones

- [x] Analyze latency bottlenecks in current TUI streaming
- [x] Define standardized JSON-RPC envelope for subagent events
- [ ] Implement backpressure queue in \`EventBus.ts\`
- [ ] Add circuit breaker for LLM rate-limit retries
- [ ] Benchmark parser throughput across target runtimes

## 3. Configuration Parameters

| Parameter | Type | Default | Description | Impact |
| :--- | :--- | :--- | :--- | :--- |
| \`maxConcurrency\` | \`number\` | \`8\` | Max concurrent tool containers | High memory |
| \`timeoutMs\` | \`number\` | \`15000\` | Timeout per tool invocation | Prevents hanging |
| \`enableCache\` | \`boolean\` | \`true\` | Vector cache for semantic lookup | 40% speedup |
| \`logLevel\` | \`string\` | \`"info"\` | Log verbosity (\`debug\`/\`info\`) | Disk I/O |

## 4. Proposed Worker Code

\`\`\`typescript
import { EventEmitter } from 'node:events';

interface AgentTask {
  id: string;
  command: string;
  timeoutMs?: number;
}

export class TaskRunner extends EventEmitter {
  async execute(task: AgentTask): Promise<{ status: 'ok' | 'failed'; output: string }> {
    console.log(\`[Worker] Dispatching task \${task.id}: \${task.command}\`);
    try {
      const result = await this.spawnProcess(task.command, task.timeoutMs ?? 15000);
      return { status: 'ok', output: result };
    } catch (err: unknown) {
      return { status: 'failed', output: String(err) };
    }
  }

  private async spawnProcess(cmd: string, timeout: number): Promise<string> {
    // Simulated process dispatch
    return \`Processed "\${cmd}" in \${timeout}ms\`;
  }
}
\`\`\`

> [!NOTE]
> Check out the [documentation](https://github.com) for extended configuration options and edge cases.
`
  },

  sequence_diagram: {
    name: "⚡ Agent Interaction Sequence",
    description: "Mermaid sequence diagram showing Agent-User-LLM interaction",
    content: `# Agent-to-Subagent Orchestration Flow

Below is the interaction sequence between the parent agent, coordinator, and sandboxed subagent tasks.

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as Developer
    participant Host as Antigravity Host
    participant Agent as Primary Agent
    participant LLM as LLM Engine (Gemini)
    participant Tool as Sandboxed Tool Runner

    User->>Host: Run goal command
    Host->>Agent: Initialize context & active workspace
    Agent->>LLM: Stream prompt + tool definitions
    LLM-->>Agent: Function Call Request (invoke_subagent)
    
    rect rgb(240, 245, 255)
        note right of Agent: Parallel Subagent Execution
        Agent->>Tool: Spawn isolated worker
        Tool->>Tool: Execute script in sandbox
        Tool-->>Agent: Tool Output / Exit Code 0
    end

    Agent->>LLM: Send execution response
    LLM-->>Agent: Final synthesized solution
    Agent-->>Host: Emit artifact update & summary
    Host-->>User: Desktop Notification & Ready View
\`\`\`

## Key Takeaways
1. Subagents run with isolated context windows to avoid context bloat.
2. The Primary Agent synthesizes intermediate artifacts into a unified result.
3. Errors in Tool execution bubble up as recovery prompts rather than hard crashes.
`
  },

  class_diagram: {
    name: "📐 Class & State Machine",
    description: "Mermaid class diagram and lifecycle state machine",
    content: `# Parser & Rendering Engine Models

\`\`\`mermaid
classDiagram
    class MarkdownComparator {
        +String activeInput
        +Array~ParserEngine~ parsers
        +init() void
        +renderAll() Promise~void~
        +benchmark(engineId) BenchmarkResult
    }

    class ParserEngine {
        +String id
        +String name
        +String version
        +parse(markdown) String
        +getFeatures() Object
    }

    class MermaidManager {
        +String theme
        +Boolean isRendering
        +renderElement(node) Promise~SVGElement~
        +clearCache() void
    }

    MarkdownComparator "1" *-- "many" ParserEngine : manages
    MarkdownComparator ..> MermaidManager : triggers
\`\`\`

## Lifecycle State Machine

\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> InputChanged : User types or pastes
    InputChanged --> Debouncing : 150ms timer
    Debouncing --> Parsing : Timer fires
    Parsing --> MermaidRender : HTML inserted
    MermaidRender --> RenderComplete : SVG attached
    RenderComplete --> Idle : Waiting for input
    Parsing --> ErrorState : Syntax / Runtime Error
    ErrorState --> Idle : User corrects input
\`\`\`
`
  },

  formatting_stress: {
    name: "🧪 Markdown Stress Test & Edge Cases",
    description: "Tables, nested lists, blockquotes, raw HTML, strikethrough, formatting",
    content: `# Markdown Edge Cases & Formatting Benchmark

Testing typography, HTML nesting, strikethrough, blockquotes, and tables across different parsers.

---

## 1. Text Formatting & Inline Elements
- **Bold text** with asterisks, __bold text__ with underscores
- *Italic text* with asterisks, _italic text_ with underscores
- ***Bold and italic*** combination
- ~~Strikethrough text~~ (GFM extension)
- \`Inline code block with <special> & characters\`
- Links: [Antigravity Docs](https://antigravity.google) or auto-link: https://github.com
- Keyboard shortcut: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>

## 2. Nested Lists & Checkboxes
1. First ordered item
   - Unordered sub-item A
   - Unordered sub-item B
     - Deeply nested item
2. Second ordered item
   - [x] Completed task checkbox
   - [ ] Incomplete task checkbox

## 3. Complex Table with Alignments

| Left Aligned | Center Aligned | Right Aligned | Status |
| :--- | :---: | ---: | :---: |
| Marked | Fast | 47 KB | 🚀 Active |
| Markdown-it | CommonMark | 99 KB | 🏆 Gold Std |
| Showdown | Classic | 74 KB | ⚙️ Configurable |
| Remarkable | High-perf | 120 KB | ⚡ Snappy |
| Snarkdown | Micro | 2 KB | ⚠️ Limited |

## 4. Nested Blockquotes with Code

> Programming is the art of telling another human being what one wants the computer to do.
>
> > Donald Knuth
>
> \`\`\`bash
> echo "Ready to benchmark!"
> \`\`\`

## 5. Collapsible Details Tag

<details>
<summary><b>Click to expand raw JSON response</b></summary>

\`\`\`json
{
  "status": "success",
  "parsers": ["marked", "markdown-it", "showdown", "remarkable", "snarkdown"],
  "benchmark": {
    "iterations": 100,
    "averageLatencyMs": 1.2
  }
}
\`\`\`

</details>
`
  }
};
