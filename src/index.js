import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { nameToIdMap } from "./data/nameToIdsMap.js"
import { ticketStatusToIdMap } from "./data/ticketStatusToIdMap.js"
import { zendeskConfig, authConfig } from "./config.js"

var zendesk = require('node-zendesk');

var client = zendesk.createClient({
  username:  zendeskConfig.username,
  token:     zendeskConfig.token,
  subdomain: zendeskConfig.subdomain
});

// Authorization middleware
function checkAuth(request) {
  if (!authConfig.requireAuth) return true;

  // Accept token as query param for compatibility
  const url = new URL(request.url);
  if (url.searchParams.get('auth_token') === authConfig.token) return true;

  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === authConfig.token;
  }

  // Check X-API-Key header
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey === authConfig.token) return true;

  return false;
}

// TODO: 
// Implement auth
// Share on Github
// Share with team 

/*
Calculate the priority of a ticket based on multiple factors:
1. SLA enterprise tag (immediately higher priority)
2. Age of the ticket
3. Time since last response
4. Status priority (Open > New > Pending > Feature Request Review Pending > ENG Confirmed Bug)

Returns a dictionary with priority score and breakdown of factors.
*/

/*
Get random solved tickets for audit from a specific agent within a timeframe.

Args:
	name: Agent name or ID
	timeframe: Time period (e.g., "7d", "24h", "30m")
	numberOfTickets: Number of tickets to return
	
Returns:
	List of ticket IDs that have at least 4 comments
*/

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Alexs Zendesk MCP Server",
		version: "1.0.0",
	});

	async init() {

		this.server.tool(
			"get_ticket_fields_by_id",
			"Returns an object of all ticket fields, including title, comments, and all custom fields for a ticket of a specified ID. If you're just trying to get comments, use get_ticket_comments instead",
			{ id: z.string() },
			async ({ id }) => {
				if (!id) {
					throw new Error("Ticket id is required");
				}
				try {
					const ticket = await client.tickets.show(id);
					return {
						content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
					};
				}
			}
		);

		this.server.tool(
			"get_unsolved_ticket_ids_by_agent_name",
			"Returns a list of ticket ids given an agents first name or full name",
			{ agent_name: z.string() },
			async ({ agent_name }) => {
				try {
					if (!agent_name) {
						throw new Error("Agent name is required");
					}
					
					let agentId;
					
					if (/^\d+$/.test(agent_name)) {
						agentId = parseInt(agent_name);
					} else {
						if (nameToIdMap.has(agent_name)) {
							agentId = nameToIdMap.get(agent_name);
						} else {
							const firstName = agent_name.split(' ')[0].toLowerCase();
							
							const matchingAgentIds = [];
							for (const [fullName, userId] of nameToIdMap.entries()) {
								const agentFirstName = fullName.split(' ')[0].toLowerCase();
								if (agentFirstName === firstName) {
									matchingAgentIds.push(userId);
								}
							}
							
							if (matchingAgentIds.length === 0) {
								throw new Error(`No agent found with name: ${agent_name}`);
							}
							
							agentId = matchingAgentIds[0];
						}
					}
					
					
					// Use search to filter by assignee and status in one query
					const searchQuery = `assignee:${agentId} status:open status:pending status:"Feature Request Review Pending" status:"ENG Confirmed Bug"`;
					const searchResults = await client.search.query(searchQuery);
					console.log("searchResults type:", typeof searchResults);
					console.log("searchResults keys:", Object.keys(searchResults));
					
					// Extract tickets from search results
					const allTickets = searchResults.result || [];
					
					console.log('Agent ID found:', agentId);
					console.log('Total tickets found:', allTickets.length);
					console.log('Status breakdown:', allTickets.reduce((acc, ticket) => {
						acc[ticket.status] = (acc[ticket.status] || 0) + 1;
						return acc;
					}, {}));
					
				
					const formattedTickets = allTickets.map(ticket => ({
						id: ticket.id,
						status: ticket.status,
						subject: ticket.subject,
						assignee_id: ticket.assignee_id,
						created_at: ticket.created_at,
						updated_at: ticket.updated_at
					}));
					console.log("Formatted tickets are ", formattedTickets)
					
					return {
						content: [{ type: "text", text: JSON.stringify(formattedTickets, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
					};
				}
			}
		);

		this.server.tool(
			"get_ticket_comments",
			"Get all comments for a specific ticket",
			{ ticket_id: z.number() },
			async ({ ticket_id }) => {
				try {
					if (!ticket_id) {
						throw new Error("Ticket ID is required");
					}
					
					const comments = await client.tickets.getComments(ticket_id);
					
					const formattedComments = comments.map(comment => ({
						id: comment.id,
						author_id: comment.author_id,
						body: comment.body,
						html_body: comment.html_body,
						public: comment.public,
						created_at: comment.created_at
					}));
					
					return {
						content: [{ type: "text", text: JSON.stringify(formattedComments, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: Failed to get comments for ticket ${ticket_id}: ${error.message}` }],
					};
				}
			}
		);

		this.server.tool(
			"get_ticket_priority",
			"Calculate the priority of a ticket based on SLA tag, age, time since last response, and status. Returns a dictionary with priority score and breakdown of factors.",
			{ ticket_id: z.number() },
			async ({ ticket_id }) => {
				try {
					if (!ticket_id) {
						throw new Error("Ticket ID is required");
					}
					
					const response = await client.tickets.show(ticket_id);
					const ticket = response.ticket;
					const comments = await client.tickets.getComments(ticket_id);

					let priority_score = 0;
					const breakdown = {};

					// 1. SLA enterprise tag
					if (ticket.tags && ticket.tags.includes("sla_enterprise")) {
						priority_score += 100;
						breakdown.sla_enterprise = 100;
					} else {
						breakdown.sla_enterprise = 0;
					}

					// 2. Age of the ticket
					const now = new Date();
					let ticketCreated = ticket.created_at;
					if (typeof ticketCreated === "string") {
						ticketCreated = new Date(ticketCreated);
					}
					const ticketAgeHours = (now - ticketCreated) / 1000 / 3600;
					const age_score = (ticketAgeHours / 24) * 5;
					priority_score += age_score;
					breakdown.age_score = age_score;

					// 3. Time since last response
					let response_score = 0;
					if (comments && comments.length > 0) {
						let latestComment = comments[0];
						for (const comment of comments) {
							if (new Date(comment.created_at) > new Date(latestComment.created_at)) {
								latestComment = comment;
							}
						}
						let commentCreated = latestComment.created_at;
						if (typeof commentCreated === "string") {
							commentCreated = new Date(commentCreated);
						}
						const hoursSinceResponse = (now - commentCreated) / 1000 / 3600;
						response_score = (hoursSinceResponse / 24) * 10;
						priority_score += response_score;
					}
					breakdown.response_score = response_score;

					// 4. Status priority
					const status_scores = {
						"open": 100,
						"new": 75,
						"pending": 25,
						"feature request review pending": 0,
						"eng confirmed bug": 0
					};
					const status = (ticket.status || "").toLowerCase();
					const status_score = status_scores[status] || 0;
					priority_score += status_score;
					breakdown.status_score = status_score;

					breakdown.total = Math.round(priority_score);

					return {
						content: [{ type: "text", text: JSON.stringify(breakdown, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: Failed to calculate priority for ticket ${ticket_id}: ${error.message}` }],
					};
				}
			}
		);
	}
}

export default {
	fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Health check endpoint (no auth required)
		if (url.pathname === "/health") {
			return new Response(JSON.stringify({ 
				status: "healthy", 
				service: "Zendesk MCP Server",
				version: "1.0.0"
			}), { 
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Check authorization for all other endpoints
		if (!checkAuth(request)) {
			return new Response("Unauthorized", { 
				status: 401,
				headers: {
					'WWW-Authenticate': 'Bearer realm="Zendesk MCP Server"'
				}
			});
		}

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
