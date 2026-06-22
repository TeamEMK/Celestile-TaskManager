module.exports=[76110,a=>{"use strict";var b=a.i(87924),c=a.i(72131),d=a.i(75003);let e={display:"block",fontSize:10.5,fontWeight:600,letterSpacing:".09em",textTransform:"uppercase",color:"#9b9082",marginBottom:7},f={position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#8a8175",display:"flex"};function g(){return(0,b.jsx)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.5",strokeLinecap:"round",style:{animation:"lx-spin .7s linear infinite"},children:(0,b.jsx)("path",{d:"M21 12a9 9 0 1 1-6.219-8.56"})})}a.s(["default",0,function(){let[a,h]=(0,c.useState)(""),[i,j]=(0,c.useState)(""),[k,l]=(0,c.useState)(null),[m,n]=(0,c.useState)(!1),[o,p]=(0,c.useState)(!1);function q(a,b="error"){l({msg:a,type:b})}async function r(b){b.preventDefault(),n(!0),l(null);let c=await (0,d.signIn)("credentials",{email:a,password:i,redirect:!1});n(!1),c?.error?q("Invalid email or password ❌","error"):(q("Login successful! Redirecting… ✅","success"),setTimeout(()=>{window.location.href="/"},1e3))}return(0,c.useEffect)(()=>{if(!k)return;let a=setTimeout(()=>l(null),3500);return()=>clearTimeout(a)},[k]),(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)("style",{children:`
        @keyframes lx-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-12px) rotate(1.5deg); } }
        @keyframes lx-up { from { opacity:0; transform: translateY(22px); } to { opacity:1; transform: translateY(0); } }
        @keyframes lx-toast { from { opacity:0; transform: translateX(-50%) translateY(-18px) scale(.96); } to { opacity:1; transform: translateX(-50%) translateY(0) scale(1); } }
        @keyframes lx-spin { to { transform: rotate(360deg); } }
        @keyframes lx-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,-40px) scale(1.15); } }
        @keyframes lx-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,40px) scale(1.2); } }
        @keyframes lx-drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,50px) scale(1.1); } }
        @keyframes lx-ring { 0%,100% { box-shadow: 0 0 0 1px rgba(232,184,115,.5), 0 0 40px rgba(232,184,115,.25); } 50% { box-shadow: 0 0 0 1px rgba(232,184,115,.8), 0 0 70px rgba(232,184,115,.45); } }
        @keyframes lx-shine { 0% { left:-120%; } 60%,100% { left:120%; } }
        @keyframes lx-sheen { to { background-position: 200% center; } }

        .lx-blob { position:absolute; border-radius:50%; filter: blur(70px); opacity:.55; pointer-events:none; }
        .lx-stagger > * { opacity:0; animation: lx-up .7s cubic-bezier(.16,1,.3,1) forwards; }
        .lx-stagger > *:nth-child(1){ animation-delay:.05s } .lx-stagger > *:nth-child(2){ animation-delay:.12s }
        .lx-stagger > *:nth-child(3){ animation-delay:.19s } .lx-stagger > *:nth-child(4){ animation-delay:.26s }
        .lx-stagger > *:nth-child(5){ animation-delay:.33s } .lx-stagger > *:nth-child(6){ animation-delay:.40s }

        .lx-input { width:100%; box-sizing:border-box; padding:13px 44px 13px 42px;
          background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:13px;
          color:#f4ece0; font-size:13.5px; outline:none; transition: border-color .18s, box-shadow .18s, background .18s; }
        .lx-input::placeholder { color:#7c7468; }
        .lx-input:focus { border-color: rgba(232,184,115,.65); background: rgba(255,255,255,.06);
          box-shadow: 0 0 0 3px rgba(232,184,115,.14); }

        .lx-btn { position:relative; overflow:hidden; width:100%; padding:13.5px; border:none; border-radius:13px;
          color:#1a130a; font-weight:800; font-size:14px; letter-spacing:.02em; cursor:pointer;
          background: linear-gradient(135deg,#F5D6A8 0%,#E8B873 45%,#C4714A 100%);
          box-shadow: 0 10px 30px rgba(196,113,74,.40), inset 0 1px 0 rgba(255,255,255,.45);
          transition: transform .15s, box-shadow .2s, filter .2s;
          display:flex; align-items:center; justify-content:center; gap:9px; }
        .lx-btn:hover:not(:disabled) { transform: translateY(-2px); filter:brightness(1.04); box-shadow:0 16px 40px rgba(196,113,74,.5), inset 0 1px 0 rgba(255,255,255,.5); }
        .lx-btn:active:not(:disabled){ transform: translateY(0); }
        .lx-btn:disabled { cursor:not-allowed; opacity:.75; }
        .lx-btn::after { content:''; position:absolute; top:0; left:-120%; width:55%; height:100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent); transform: skewX(-20deg); }
        .lx-btn:not(:disabled)::after { animation: lx-shine 3.2s ease-in-out infinite; }

        .lx-eye { position:absolute; right:13px; top:50%; transform:translateY(-50%); background:none; border:none;
          cursor:pointer; color:#8a8175; display:flex; padding:3px; transition:color .15s; }
        .lx-eye:hover { color:#E8B873; }

        .lx-shell { position:relative; z-index:2; display:grid; grid-template-columns: 1.05fr .95fr;
          width:100%; max-width:920px; border-radius:26px; overflow:hidden;
          background: rgba(20,17,14,.55); backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%);
          border:1px solid rgba(255,255,255,.10);
          box-shadow: 0 40px 120px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);
          animation: lx-up .6s cubic-bezier(.16,1,.3,1) both; }

        .lx-brand { position:relative; padding:48px 44px; display:flex; flex-direction:column; justify-content:space-between;
          background:
            radial-gradient(circle at 80% 0%, rgba(232,184,115,.18), transparent 55%),
            radial-gradient(circle at 0% 100%, rgba(196,113,74,.20), transparent 55%),
            linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.01));
          border-right:1px solid rgba(255,255,255,.08); }
        .lx-feat { display:flex; align-items:center; gap:11px; font-size:13px; color:#cfc4b4; }
        .lx-feat svg { color:#E8B873; flex:none; }

        .lx-mini { display:none; }

        @media (max-width: 860px) {
          .lx-shell { grid-template-columns: 1fr; max-width:420px; }
          .lx-brand { display:none; }
          .lx-mini { display:flex; }
        }
      `}),k&&(0,b.jsx)("div",{style:{position:"fixed",top:"24px",left:"50%",zIndex:9999,animation:"lx-toast .35s cubic-bezier(.16,1,.3,1) both",background:"success"===k.type?"rgba(16,32,18,.92)":"rgba(38,18,18,.92)",backdropFilter:"blur(10px)",color:"success"===k.type?"#6ee7a0":"#fb8585",padding:"12px 22px",borderRadius:"13px",fontSize:"13px",fontWeight:600,boxShadow:"0 12px 40px rgba(0,0,0,.4)",border:`1px solid ${"success"===k.type?"rgba(110,231,160,.25)":"rgba(251,133,133,.25)"}`,whiteSpace:"nowrap"},children:k.msg}),(0,b.jsxs)("div",{style:{position:"relative",minHeight:"100vh",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",background:"radial-gradient(ellipse at 70% 20%, #1b1610 0%, #0d0b09 45%, #070605 100%)",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif"},children:[(0,b.jsx)("div",{className:"lx-blob",style:{width:480,height:480,top:"-120px",left:"-80px",background:"radial-gradient(circle,#E8B873,#C4714A)",animation:"lx-drift1 16s ease-in-out infinite"}}),(0,b.jsx)("div",{className:"lx-blob",style:{width:420,height:420,bottom:"-140px",right:"-60px",background:"radial-gradient(circle,#C4714A,#7a3f24)",animation:"lx-drift2 19s ease-in-out infinite"}}),(0,b.jsx)("div",{className:"lx-blob",style:{width:300,height:300,top:"40%",left:"45%",opacity:.35,background:"radial-gradient(circle,#F5D6A8,transparent)",animation:"lx-drift3 22s ease-in-out infinite"}}),(0,b.jsxs)("div",{className:"lx-shell",children:[(0,b.jsxs)("aside",{className:"lx-brand lx-stagger",style:{alignItems:"center",justifyContent:"center",textAlign:"center",gap:18},children:[(0,b.jsx)("div",{style:{display:"flex",justifyContent:"center"},children:(0,b.jsx)("div",{className:"login-logo",style:{width:116,height:116,borderRadius:26,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"#0c0a08",animation:"lx-float 5s ease-in-out infinite, lx-ring 4s ease-in-out infinite"},children:(0,b.jsx)("img",{src:"/logo.jpeg",alt:"Celestile-TaskManager",width:116,height:116,style:{width:"100%",height:"100%",objectFit:"cover"}})})}),(0,b.jsx)("div",{style:{fontSize:13,fontWeight:700,letterSpacing:".28em",textTransform:"uppercase",color:"#E8B873"},children:"Celestile · TaskManager"})]}),(0,b.jsx)("main",{style:{padding:"46px 40px"},children:(0,b.jsxs)("div",{className:"lx-stagger",style:{maxWidth:340,margin:"0 auto"},children:[(0,b.jsx)("div",{className:"lx-mini",style:{justifyContent:"center",marginBottom:20},children:(0,b.jsx)("div",{className:"login-logo",style:{width:76,height:76,borderRadius:18,overflow:"hidden",background:"#0c0a08",display:"flex",alignItems:"center",justifyContent:"center",animation:"lx-float 5s ease-in-out infinite, lx-ring 4s ease-in-out infinite"},children:(0,b.jsx)("img",{src:"/logo.jpeg",alt:"Celestile-TaskManager",width:76,height:76,style:{width:"100%",height:"100%",objectFit:"cover"}})})}),(0,b.jsxs)("div",{children:[(0,b.jsx)("h1",{style:{margin:"0 0 6px",fontSize:25,fontWeight:800,color:"#f6efe4"},children:"Welcome back 👋"}),(0,b.jsx)("p",{style:{margin:"0 0 26px",fontSize:13,color:"#9b9082"},children:"Sign in to your Celestile workspace"})]}),(0,b.jsxs)("form",{onSubmit:r,style:{display:"flex",flexDirection:"column",gap:16},children:[(0,b.jsxs)("div",{children:[(0,b.jsx)("label",{style:e,children:"Email Address"}),(0,b.jsxs)("div",{style:{position:"relative"},children:[(0,b.jsx)("span",{style:f,children:(0,b.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,b.jsx)("rect",{x:"2",y:"4",width:"20",height:"16",rx:"2"}),(0,b.jsx)("path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"})]})}),(0,b.jsx)("input",{className:"lx-input",type:"email",required:!0,value:a,onChange:a=>h(a.target.value),placeholder:"you@company.com"})]})]}),(0,b.jsxs)("div",{children:[(0,b.jsx)("label",{style:e,children:"Password"}),(0,b.jsxs)("div",{style:{position:"relative"},children:[(0,b.jsx)("span",{style:f,children:(0,b.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,b.jsx)("rect",{x:"3",y:"11",width:"18",height:"11",rx:"2"}),(0,b.jsx)("path",{d:"M7 11V7a5 5 0 0 1 10 0v4"})]})}),(0,b.jsx)("input",{className:"lx-input",type:o?"text":"password",required:!0,value:i,onChange:a=>j(a.target.value),placeholder:"••••••••"}),(0,b.jsx)("button",{type:"button",className:"lx-eye",onClick:()=>p(a=>!a),"aria-label":"Toggle password",children:o?(0,b.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,b.jsx)("path",{d:"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"}),(0,b.jsx)("path",{d:"M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"}),(0,b.jsx)("line",{x1:"1",y1:"1",x2:"23",y2:"23"})]}):(0,b.jsxs)("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,b.jsx)("path",{d:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"}),(0,b.jsx)("circle",{cx:"12",cy:"12",r:"3"})]})})]})]}),(0,b.jsx)("button",{type:"submit",disabled:m,className:"lx-btn",style:{marginTop:4},children:m?(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(g,{})," Signing in…"]}):(0,b.jsxs)(b.Fragment,{children:["Sign In ",(0,b.jsx)("span",{style:{fontSize:16},children:"→"})]})})]}),(0,b.jsxs)("div",{style:{marginTop:26},children:[(0,b.jsx)("div",{style:{height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)",marginBottom:14}}),(0,b.jsxs)("p",{style:{textAlign:"center",fontSize:11,color:"#8a8175",margin:0,letterSpacing:".03em"},children:[(0,b.jsx)("span",{style:{color:"#E8B873",fontWeight:700},children:"Celestile-TaskManager"}),(0,b.jsx)("span",{style:{margin:"0 7px",color:"#56504a"},children:"·"}),"Grow Your Business"]})]})]})})]})]})]})}])}];

//# sourceMappingURL=app_login_page_jsx_00bdnho._.js.map