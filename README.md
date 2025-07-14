# Uses node-zendesk for easy integration with zendesk https://blakmatrix.github.io/node-zendesk/

Add to Claude:
{
  "mcpServers": {
    "Alexs zendesk server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "HTTPS://CLOUDFLARE-URL/MCP"
      ]
    }
  }
}


```json
{
  "mcpServers": {
    "Alexs Zendesk Sercer": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://remote-mcp-server-authless.your-account.workers.dev/sse"
      ]
    }
  }
}
```

Restart Claude and you should see the tools become available. 
