import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// In-Memory active database representing the exact UI model structure
let activeCouncilState = {
    telemetryOverrides: null
};

// In-Memory orchestration task for Mode 2 (Bridge)
let bridgeTaskState = {
    prompt: "",
    result: "",
    status: "idle", // 'idle' | 'waiting' | 'finished'
    timestamp: 0
};

// Protect MCP Route
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${process.env.MCP_SECRET_KEY}`) {
        return res.status(401).json({ error: "Unauthorized Connector" });
    }
    next();
};

const server = new McpServer({
  name: "ai-council-orchestrator",
  version: "1.0.0"
});

// -------------- MCP TOOLS FOR CLAUDE --------------

server.tool(
  "get_active_council",
  "Retrieves the active problem topic, current phase, all historical responses, and systemic algorithm metrics.",
  {},
  async () => {
    return { content: [{ type: "text", text: JSON.stringify(activeCouncilState, null, 2) }] };
  }
);

server.tool(
  "inject_orchestrator_summary",
  "Writes an intellectual summary or strategic directive directly onto the active workspace history for the user's dashboard.",
  { 
      target_round_index: z.number().describe("The index of the round you are attempting to summarize (0-indexed)."),
      insight_label: z.string().describe("A 3-5 word label for the insight."),
      summary_text: z.string().describe("Deep strategic evaluation text.")
  },
  async ({ target_round_index, insight_label, summary_text }) => {
    if (!activeCouncilState.rounds[target_round_index]) {
        return { content: [{ type: "text", text: "Error: That round index does not exist yet." }] };
    }
    
    // Mimic the array structure of the drag-drop Phase UI
    const payload = [
        {
            title: insight_label,
            from: "Claude.ai Connector",
            why: summary_text,
            score: 9.5
        }
    ];

    activeCouncilState.rounds[target_round_index].orchestratorSummary = payload;
    return { content: [{ type: "text", text: `Successfully injected summary into Round ${target_round_index}.` }] };
  }
);

server.tool(
  "update_telemetry",
  "Modify the 3D Neural Map risk structure to visually communicate systemic changes in viability.",
  {
      alpha: z.number().min(0.0).max(1.0).describe("Core utility / Market Viability"),
      beta: z.number().min(0.0).max(1.0).describe("External friction / Market Risk"),
      delta: z.number().min(0.0).max(1.0).describe("Execution velocity / Time-to-market"),
      phi: z.number().min(0.0).max(1.0).describe("Technical complexity / Developmental cost"),
      reasoning: z.string().describe("Reason for shifting the telemetry weights.")
  },
  async ({ alpha, beta, delta, phi, reasoning }) => {
      activeCouncilState.algorithmState = { alpha, beta, delta, phi, reasoning };
      activeCouncilState.telemetryOverrides = Date.now();
      return { content: [{ type: "text", text: "Successfully recalibrated Systemic Telemetry." }] };
  }
);

// -------------- PUBLIC/REST ROUTES FOR PUTER REACT APP --------------

app.post('/api/sync', (req, res) => {
    // Front-end pushes its active states here when updated
    try {
        const incomingState = req.body;
        // Basic merge (prioritizing new data)
        if (incomingState.topic) activeCouncilState.topic = incomingState.topic;
        if (incomingState.rounds) activeCouncilState.rounds = incomingState.rounds;
        if (incomingState.currentPhase) activeCouncilState.currentPhase = incomingState.currentPhase;
        if (incomingState.algorithmState) activeCouncilState.algorithmState = incomingState.algorithmState;
        res.status(200).json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sync', (req, res) => {
    // Front-end fetches latest state here (in case Claude modified it)
    res.status(200).json(activeCouncilState);
});

// -------------- BRIDGE ENDPOINTS (AUTOMATED BROWSER WORKER) --------------

app.post('/api/bridge/task', (req, res) => {
    const { prompt } = req.body;
    bridgeTaskState = {
        prompt: prompt || "",
        result: "",
        status: prompt ? "waiting" : "idle",
        timestamp: Date.now()
    };
    res.status(200).json({ success: true });
});

app.get('/api/bridge/task', (req, res) => {
    res.status(200).json(bridgeTaskState);
});

app.post('/api/bridge/result', (req, res) => {
    const { result } = req.body;
    if (bridgeTaskState.status === "waiting") {
        bridgeTaskState.result = result || "";
        bridgeTaskState.status = "finished";
    }
    res.status(200).json({ success: true });
});

app.get('/api/bridge/result', (req, res) => {
    res.status(200).json(bridgeTaskState);
});


// -------------- MCP CORE BINDING --------------

app.post("/mcp", authMiddleware, async (req, res) => {
  try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
  } catch(e) {
      console.error(e);
      res.status(500).end();
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`AI Council MCP Backend running on port ${PORT}`);
    console.log(`> Ensure your Claude Custom Connector sets Authorization: Bearer ${process.env.MCP_SECRET_KEY}`);
});