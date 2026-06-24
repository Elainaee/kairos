import fs from "node:fs/promises";
import path from "node:path";

const EMPTY={version:1,schedules:[],checkins:[],habits:[],moods:{},notes:[],studyPlans:[],theme:"light"};
const arrays=["schedules","checkins","habits","notes","studyPlans"];
function normalize(input={}){const out={...structuredClone(EMPTY),...input,version:1};for(const key of arrays)if(!Array.isArray(out[key]))out[key]=[];if(!out.moods||typeof out.moods!=="object"||Array.isArray(out.moods))out.moods={};return out;}

export class AppStateStore{
  constructor(filePath){this.filePath=filePath;this.queue=Promise.resolve();}
  async exists(){try{await fs.access(this.filePath);return true;}catch{return false;}}
  async read(){try{return normalize(JSON.parse(await fs.readFile(this.filePath,"utf8")));}catch{return normalize();}}
  async write(input){const state=normalize(input);this.queue=this.queue.then(async()=>{await fs.mkdir(path.dirname(this.filePath),{recursive:true});const temp=`${this.filePath}.tmp`;await fs.writeFile(temp,JSON.stringify(state,null,2),"utf8");await fs.rename(temp,this.filePath);return state;});return this.queue;}
  async initialize(legacy){if(!(await this.exists()))return this.write(legacy||{});return this.read();}
  async mutate(change){const state=await this.read();const result=await change(state);await this.write(state);return{state,result};}
}

const scheduleDomains=new Set(["schedules","tasks"]);
export function createAppAdapters(store,onChange=()=>{}){
  const listFor=(state,domain)=>scheduleDomains.has(domain)?state.schedules:(state[domain]||[]);
  const matches=(item,domain)=>domain!=="tasks"||["task","deadline"].includes(item.type);
  const notify=state=>{onChange(state);return state;};
  return new Proxy({}, {get:(_target,domain)=>({
    query:async query=>{const state=await store.read();let rows=listFor(state,domain).filter(item=>matches(item,domain));if(query?.id)rows=rows.filter(x=>x.id===query.id);if(query?.dateFrom)rows=rows.filter(x=>(x.date||"")>=query.dateFrom);if(query?.dateTo)rows=rows.filter(x=>(x.date||"")<=query.dateTo);return rows.slice(0,Math.min(query?.limit||100,100));},
    create:async payload=>{const {state,result}=await store.mutate(data=>{const target=scheduleDomains.has(domain)?data.schedules:(data[domain]||=[]);const now=new Date().toISOString();const item={id:crypto.randomUUID(),...payload,created_at:payload.created_at||now,updated_at:now};if(domain==="tasks"&&!item.type)item.type="task";target.push(item);return item;});notify(state);return result;},
    update:async payload=>{const {state,result}=await store.mutate(data=>{const item=listFor(data,domain).find(x=>x.id===payload.id&&matches(x,domain));if(!item)throw new Error("entity_not_found");Object.assign(item,payload,{updated_at:new Date().toISOString()});return item;});notify(state);return result;},
    delete:async payload=>{const {state,result}=await store.mutate(data=>{const key=scheduleDomains.has(domain)?"schedules":domain;const rows=data[key]||[];const item=rows.find(x=>x.id===payload.id&&matches(x,domain));if(!item)throw new Error("entity_not_found");data[key]=rows.filter(x=>x.id!==payload.id);return item;});notify(state);return result;}
  })});
}
