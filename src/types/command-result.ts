export type McpServer = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  scope?: string;
  error?: string;
  tools?: { name: string; description?: string }[];
};

export type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
};

export type CommandResult =
  | {
      command: "cost";
      status: "loaded";
      data: {
        totalTokens: number;
        totalCostUsd: number;
        numTurns: number;
      };
    }
  | {
      command: "model";
      status: "loading" | "loaded" | "error";
      data?: {
        currentModel: string;
        currentEffort?: string;
        availableModels: ModelInfo[];
      };
      error?: string;
    }
  | {
      command: "mcp";
      status: "loading" | "loaded" | "error";
      data?: {
        servers: McpServer[];
      };
      error?: string;
    }
  | {
      command: "status";
      status: "loading" | "loaded" | "error";
      data?: {
        sessionStatus: string;
        connectionStatus: string;
        sdkSessionId: string | null;
        hasActiveQuery: boolean;
        currentTool: string | null;
        pendingPermissions: number;
        model: string;
        effort?: string;
        contextUsage?: {
          usedTokens: number;
          maxTokens: number;
          percentUsed: number;
        };
      };
      error?: string;
    }
  | {
      command: "permissions";
      status: "loading" | "loaded" | "error";
      data?: {
        trustLevel: string;
        permissionMode: string;
        rules: { toolPattern: string; decision: string }[];
      };
      error?: string;
    }
  | {
      command: "compact";
      status: "running" | "done" | "error";
      message?: string;
    }
  | {
      command: "config";
      status: "loading" | "loaded" | "error";
      data?: {
        model: string;
        effort?: string;
        trustLevel: string;
        availableModels: ModelInfo[];
      };
      error?: string;
    };
