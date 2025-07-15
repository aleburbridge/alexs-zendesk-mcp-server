# Alex's Zendesk MCP Server

A Model Context Protocol (MCP) server that utilizes the node-zendesk library.

## Authorization

This server requires authorization for all endpoints except the health check. You can authenticate by adding the auth token to the server's URL, i.e. https://server-url.com/mcp?auth_token={your_auth_token} 

## Configuration

Create src/config.js with the following info 
```json
export const zendeskConfig = {
  username: 'your_username',
  token: 'your_zendesk_token',
  subdomain: 'your_subdomain'
};
```

## Endpoints

- `/health` - Health check (no auth required)
- `/mcp` - MCP server endpoint (requires auth)
- `/sse` - Server-sent events endpoint (requires auth)

## Adding to Claude

```json
{
  "mcpServers": {
    "Alexs Zendesk Server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://server-url.com/mcp?auth_token={your_auth_token} "
      ]
    }
  }
}
```

## Available Tools

1. **get_ticket_fields_by_id** - Returns all ticket fields for a specified ticket ID
2. **get_unsolved_ticket_ids_by_agent_name** - Returns unsolved tickets assigned to an agent
3. **get_ticket_comments** - Get all comments for a specific ticket
4. **get_ticket_priority** - Calculate ticket priority based on SLA, age, response time, and status