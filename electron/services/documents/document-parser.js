import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";

const clean=text=>String(text||"").replace(/\u0000/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
const ext=name=>path.extname(name).toLowerCase();
const decodeXml=text=>text.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'");

async function parsePdf(filePath){const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");const bytes=new Uint8Array(await fs.readFile(filePath));const doc=await pdfjs.getDocument({data:bytes,useWorkerFetch:false,isEvalSupported:false,useSystemFonts:true}).promise;const sections=[];for(let page=1;page<=doc.numPages;page++){const content=await (await doc.getPage(page)).getTextContent();const text=clean(content.items.map(item=>item.str).join(" "));if(text)sections.push({location:`第 ${page} 页`,text});}return{kind:"pdf",sections};}
async function parseDocx(filePath){const result=await mammoth.extractRawText({path:filePath});return{kind:"docx",sections:[{location:"文档正文",text:clean(result.value)}],warnings:result.messages.map(x=>x.message)};}
async function parsePptx(filePath){const zip=await JSZip.loadAsync(await fs.readFile(filePath));const names=Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));const sections=[];for(const name of names){const xml=await zip.file(name).async("string");const texts=[...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match=>decodeXml(match[1]));const text=clean(texts.join("\n"));if(text)sections.push({location:`第 ${Number(name.match(/\d+/)[0])} 张幻灯片`,text});}return{kind:"pptx",sections};}
async function parsePlain(filePath){return{kind:"text",sections:[{location:"全文",text:clean(await fs.readFile(filePath,"utf8"))}]};}

export async function parseDocument(filePath,name,mimeType=""){
  const suffix=ext(name);let result;
  if(suffix===".pdf"||mimeType==="application/pdf")result=await parsePdf(filePath);
  else if(suffix===".docx")result=await parseDocx(filePath);
  else if(suffix===".pptx")result=await parsePptx(filePath);
  else if([".txt",".md",".csv"].includes(suffix)||mimeType.startsWith("text/"))result=await parsePlain(filePath);
  else throw new Error("unsupported_attachment_format");
  const text=result.sections.map(section=>`[${section.location}]\n${section.text}`).join("\n\n");return{...result,text,charCount:text.length};
}

export function chunkParsedDocument(parsed,maxChars=12000){const chunks=[];for(const section of parsed.sections){let rest=section.text;let index=1;while(rest.length){let end=Math.min(maxChars,rest.length);if(end<rest.length){const boundary=Math.max(rest.lastIndexOf("\n",end),rest.lastIndexOf("。",end));if(boundary>maxChars*.55)end=boundary+1;}chunks.push({location:section.location,part:index++,text:rest.slice(0,end)});rest=rest.slice(end);}}return chunks;}
