const roughTokens=value=>Math.ceil(String(value||"").length/3);
export const DEFAULT_CONTEXT_LIMITS={openai:128000,doubao:128000,anthropic:200000,gemini:1000000};

export class ContextManager{
  constructor(store){this.store=store;}
  assess({provider,messages,attachments=[],limit}){const contextLimit=limit||DEFAULT_CONTEXT_LIMITS[provider]||128000;const messageTokens=messages.reduce((sum,item)=>sum+roughTokens(item.content)+4,0);const attachmentTokens=attachments.reduce((sum,item)=>sum+roughTokens(item.text),0);const estimatedTokens=messageTokens+attachmentTokens;return{estimatedTokens,contextLimit,ratio:estimatedTokens/contextLimit,requiresDecision:estimatedTokens>=contextLimit*.85,options:["summarize","new_conversation"]};}
  buildSummaryPrompt(messages){return[{role:"user",content:`请将以下对话压缩成可供后续模型继续交流的事实摘要。保留用户偏好、未完成事项、明确日期、关键结论和待确认操作；不要补充原文没有的信息。\n\n${messages.map(x=>`${x.role}: ${x.content}`).join("\n")}`}];}
  async saveSummary(conversationId,summary){if(!summary?.trim())throw new Error("empty_summary");return this.store.updateConversation(conversationId,{summary:summary.trim()});}
  async createContinuation(conversationId,{carrySummary=false}={}){const source=await this.store.getConversation(conversationId);if(!source)throw new Error("conversation_not_found");return this.store.createConversation({title:`${source.title} · 继续`,provider:source.provider,model:source.model,summary:carrySummary?source.summary:""});}
}
