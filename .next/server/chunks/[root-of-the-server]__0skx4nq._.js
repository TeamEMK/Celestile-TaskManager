module.exports=[4446,(e,r,t)=>{r.exports=e.x("net",()=>require("net"))},55004,(e,r,t)=>{r.exports=e.x("tls",()=>require("tls"))},92509,(e,r,t)=>{r.exports=e.x("url",()=>require("url"))},24836,(e,r,t)=>{r.exports=e.x("https",()=>require("https"))},874,(e,r,t)=>{r.exports=e.x("buffer",()=>require("buffer"))},51615,(e,r,t)=>{r.exports=e.x("node:buffer",()=>require("node:buffer"))},54799,(e,r,t)=>{r.exports=e.x("crypto",()=>require("crypto"))},22734,(e,r,t)=>{r.exports=e.x("fs",()=>require("fs"))},27699,(e,r,t)=>{r.exports=e.x("events",()=>require("events"))},5365,(e,r,t)=>{r.exports=e.x("process",()=>require("process"))},37464,(e,r,t)=>{r.exports=e.x("timers",()=>require("timers"))},88947,(e,r,t)=>{r.exports=e.x("stream",()=>require("stream"))},99348,(e,r,t)=>{r.exports=e.x("string_decoder",()=>require("string_decoder"))},6461,(e,r,t)=>{r.exports=e.x("zlib",()=>require("zlib"))},77652,(e,r,t)=>{r.exports=e.x("node:diagnostics_channel",()=>require("node:diagnostics_channel"))},33405,(e,r,t)=>{r.exports=e.x("child_process",()=>require("child_process"))},46786,(e,r,t)=>{r.exports=e.x("os",()=>require("os"))},45706,(e,r,t)=>{r.exports=e.x("querystring",()=>require("querystring"))},25328,(e,r,t)=>{r.exports=e.x("http2",()=>require("http2"))},21517,(e,r,t)=>{r.exports=e.x("http",()=>require("http"))},49719,(e,r,t)=>{r.exports=e.x("assert",()=>require("assert"))},93695,(e,r,t)=>{r.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},18622,(e,r,t)=>{r.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,r,t)=>{r.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},24361,(e,r,t)=>{r.exports=e.x("util",()=>require("util"))},14747,(e,r,t)=>{r.exports=e.x("path",()=>require("path"))},70406,(e,r,t)=>{r.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},11616,e=>{"use strict";var r=e.i(89171),t=e.i(13618),s=e.i(12697),n=e.i(29091);function i(e,t=400){return r.NextResponse.json({error:e},{status:t})}async function a(){try{let e=await (0,t.getServerSession)(s.authOptions);return e?.user||null}catch{return null}}async function o(){return await a()?null:i("Unauthorized",401)}async function u(){let e=await a();return(0,n.isAdminRoles)(e?.roles)?null:i("Forbidden",403)}e.s(["requireAdmin",0,u,"requireUser",0,o])},88700,e=>{"use strict";let r=e=>String(e||"").replace(/[​-‍﻿]/g,"").trim(),t=r(process.env.MAYTAPI_PRODUCT_ID),s=r(process.env.MAYTAPI_PHONE_ID),n=r(process.env.MAYTAPI_TOKEN),i=r(process.env.WHATSAPP_DEFAULT_CC)||"91";function a(){return!!(t&&s&&n)}function o(e){let r=String(e||"").replace(/\D/g,"");return(r=r.replace(/^0+/,""))?(10===r.length&&(r=i+r),r.length>=11&&r.length<=15?r:null):null}async function u(e,r){if(!a())return{skipped:!0,reason:"not configured"};let i=o(e);if(!i)return{skipped:!0,reason:"invalid number"};try{let e=await fetch(`https://api.maytapi.com/api/${t}/${s}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json","x-maytapi-key":n},body:JSON.stringify({to_number:i,type:"text",message:r})}),a=await e.json().catch(()=>({}));if(!e.ok||!1===a.success)return console.error("[whatsapp] send failed",e.status,JSON.stringify(a)),{ok:!1,status:e.status,data:a};return{ok:!0,data:a}}catch(e){return console.error("[whatsapp] error",e.message),{ok:!1,error:e.message}}}function l(e,r="-"){if(!e)return"—";let t=String(e).slice(0,10),s=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);return s?`${s[3]}${r}${s[2]}${r}${s[1]}`:t}e.s(["checklistReminderMessage",0,function(e,r){return`*${e||"Hello"} - Checklist Pending Task Summary*

`+(r||[]).map(e=>{var r;let t;return`Task ID - ${e.id||""}
Task - ${e.task||""}
Target Date - ${l(e.targetDate,"/")}
Client Name - ${e.client||"-"}
Frequency - ${(t=String((r=e.frequency)||"").toLowerCase()).startsWith("d")?"D":t.startsWith("w")?"W":t.startsWith("m")?"M":String(r||"-").charAt(0).toUpperCase()||"-"}`}).join("\n\n")},"dailyTaskConfirmationMessage",0,function(e,r){return`✨ Hello ${e||"there"},
Thank you for submitting your daily task ✔️
Your response for the date ${l(r,"/")} has been successfully recorded 📄✨`},"delegationMessage",0,function({doerName:e,byName:r,dueDate:t,priority:s,approval:n,description:i}){return`Hello ${e||"there"},

📋 *New Task Delegated*

*By:* ${r||"—"}
*Due:* ${l(t)}
*Priority:* ${s||"Low"}
*Approval Required:* ${n&&"No Approval"!==n?"Yes":"No"}

*Task:* ${i||""}

— Celestile-TaskManager`},"formatNumber",0,o,"isWhatsappConfigured",0,a,"quotationRevisionMessage",0,function({branch:e,refNo:r,clientName:t,revisedBy:s,dateStr:n,changes:i,grandTotal:a,pdfUrl:o}){let u=e?e.charAt(0).toUpperCase()+e.slice(1):"—",l=i&&i.length?i.join("\n"):"• No field changes detected";return l.length>1800&&(l=l.substring(0,1800)+"\n  …(truncated)"),[`*Celestile ${u} — Quotation Revised* 📝`,"─────────────────────────",`*Ref No:* ${r||"—"}`,`*Client:* ${t||"—"}`,`*Revised by:* ${s||"Unknown user"}`,`*Date:* ${n||""}`,"","*Changes:*",l,"",`*Grand Total:* ${a||"—"}`,...o?["",`📄 *PDF:* ${o}`]:[]].join("\n")},"reminderMessage",0,function({name:e,id:r,description:t,dueDate:s,priority:n,client:i}){return`*${e||"Hello"} - Delegation Pending Task Summary*

Task ID - ${r||""}
Task - ${t||""}
Target Date - ${l(s,"/")}
Priority - ${n||"Low"}
Client Name - ${i||"-"}`},"sendWhatsApp",0,u,"slabBlockedMessage",0,function(e){return`🟥 *SLAB BLOCKED*

📦 Slab: ${e.slab||"-"}
🪨 Material: ${e.material||"-"} -- ${e.thickness||"-"}
📏 Size: ${e.sizeL||"-"} x ${e.sizeW||"-"}
📐 SFT: ${e.sft||"-"}
🧾 Order: ${e.orderNo||"-"}`},"slabReleasedMessage",0,function(e){return`🟢 *SLAB RELEASED*

📦 Slab: ${e.slab||"-"}
🪨 Material: ${e.material||"-"} -- ${e.thickness||"-"}
📐 SFT: ${e.sft||"-"}`}])},85685,e=>{e.v(e=>Promise.resolve().then(()=>e(54799)))},91961,e=>{e.v(r=>Promise.all(["server/chunks/[externals]_tty_08_t10n._.js","server/chunks/node_modules_0xgj0gr._.js"].map(r=>e.l(r))).then(()=>r(12111)))},72331,e=>{e.v(r=>Promise.all(["server/chunks/[root-of-the-server]__052.wit._.js","server/chunks/node_modules_0ixxh5h._.js","server/chunks/node_modules_node-fetch_src_index_0u~7j_7.js"].map(r=>e.l(r))).then(()=>r(159)))},69827,e=>{e.v(e=>Promise.resolve().then(()=>e(80998)))},61075,e=>{e.v(r=>Promise.all(["server/chunks/[externals]__0rsg6e-._.js","server/chunks/lib_0c.zusw._.js"].map(r=>e.l(r))).then(()=>r(90599)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0skx4nq._.js.map