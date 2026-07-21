const DOMAINS=["schedules","tasks","habits","notes","externalSearch"];
const LEVELS=["none","read","write"];
const READ_ONLY_DOMAINS=new Set(["externalSearch"]);
const OPERATIONS=["create","update","delete","delete_many"];

export class ToolRuntime {
  constructor(store) { this.store=store; }
  async getPermissions() { const data=await this.store.read();return Object.fromEntries(DOMAINS.map(domain=>[domain,data.permissions[domain]||"none"])); }
  async setPermissions(input) { return this.store.mutate(data=>{for(const domain of DOMAINS){if(domain in input){if(!LEVELS.includes(input[domain]))throw new Error("invalid_permission");if(READ_ONLY_DOMAINS.has(domain)&&input[domain]==="write")throw new Error("invalid_permission");data.permissions[domain]=input[domain];}}return {...data.permissions};}); }
  async query(domain, query, adapters) { const permissions=await this.getPermissions();if(!DOMAINS.includes(domain)||permissions[domain]==="none")throw new Error("permission_denied");if(!adapters[domain]?.query)throw new Error("adapter_unavailable");return adapters[domain].query(query); }
  async propose({conversationId,domain,operation,payload}) { const permissions=await this.getPermissions();if(!DOMAINS.includes(domain)||permissions[domain]!=="write")throw new Error("permission_denied");if(!OPERATIONS.includes(operation))throw new Error("invalid_operation");const item={id:crypto.randomUUID(),conversationId,domain,operation,payload,status:"pending",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return this.store.mutate(data=>{data.proposals.push(item);return item;}); }
  async decide({id,approved,payload},adapters) { return this.store.mutate(async data=>{const item=data.proposals.find(x=>x.id===id);if(!item||item.status!=="pending")throw new Error("proposal_unavailable");if(!approved){item.status="rejected";item.updatedAt=new Date().toISOString();return item;}const adapter=adapters[item.domain]?.[item.operation];if(!adapter)throw new Error("adapter_unavailable");const finalPayload=payload||item.payload;const result=await adapter(finalPayload);item.payload=finalPayload;item.result=result;item.status="committed";item.updatedAt=new Date().toISOString();return item;}); }
}
