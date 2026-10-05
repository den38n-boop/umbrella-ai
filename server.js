import express from "express";
import OpenAI from "openai";
import fs from "fs";

const app = express();
app.use(express.json({limit:"1mb"}));
app.use(express.static("public"));

const WORLD = JSON.parse(fs.readFileSync("./world.json","utf8"));
const AGENTS = JSON.parse(fs.readFileSync("./agents.json","utf8"));
const sessions = new Map();

function freshState(){
  const relationships={};
  const memories={};
  for(const a of Object.keys(AGENTS)){
    relationships[a]={Alina:{trust:0,affection:0,respect:0,suspicion:0,fear:0,irritation:0,protectiveness:0}};
    memories[a]=[];
  }
  return {
    ...structuredClone(WORLD.state),
    relationships, memories,
    messages:[],
    privateChats:{},
    characterStates:Object.fromEntries(Object.keys(AGENTS).map(a=>[a,{location:"unknown",activity:"idle",emotion:"neutral"}])),
    discoveredInformation:[],
    tick:0
  };
}
function getSession(id){
  if(!sessions.has(id)) sessions.set(id,freshState());
  return sessions.get(id);
}
function client(){
  if(!process.env.OPENAI_API_KEY) throw new Error("На сервере не задан OPENAI_API_KEY");
  return new OpenAI({apiKey:process.env.OPENAI_API_KEY});
}
const SYSTEM = `Ты управляешь эмерджентной симуляцией мира The Umbrella Academy.
КРИТИЧЕСКИ: никакого заранее заданного сюжета, глав, сцен, обязательных событий, концовок или дерева выборов.
Ты моделируешь только логичные последствия текущего состояния.
Алина является реальным участником симуляции и ТОЛЬКО пользователь пишет за Алину.
Каждый персонаж автономен и знает только сведения из его knowledge/memory и публично увиденное.
Персонажи могут молчать, ошибаться, лгать, расследовать, спорить, писать друг другу и действовать вне чата.
Скрытая истина мира не равна знанию персонажей. Не раскрывай её персонажу без причинно-следственного пути.
Не заставляй персонажей обслуживать "сюжет".
Ответ должен быть строго JSON без markdown:
{"messages":[{"author":"Five|Klaus|Diego|Luther|Allison|Viktor|Lila","text":"...","channel":"group"}],
"private_messages":[],
"actions":[{"actor":"...","action":"...","visible_to_alina":false}],
"memory_updates":[{"agent":"...","memory":"..."}],
"relationship_updates":[{"agent":"...","trust":0,"respect":0,"suspicion":0,"fear":0,"irritation":0,"protectiveness":0}],
"world_changes":{"timeline_stability_delta":0,"commission_activity_delta":0,"new_anomalies":[],"new_dangers":[],"consequences":[]}}`;

async function simulate(state, event){
  const payload={
    world_rules:WORLD.rules,
    hidden_world_truth:WORLD.truth,
    agents:AGENTS,
    current_world_state:state,
    new_event:event,
    instruction:"Реши, кто вообще имеет причину действовать сейчас. Не обязан давать ответ от каждого. Допускается ноль сообщений. Создай естественное продолжение симуляции, а не сцену."
  };
  const response=await client().responses.create({
    model:process.env.OPENAI_MODEL || "gpt-5-mini",
    input:[
      {role:"system",content:SYSTEM},
      {role:"user",content:JSON.stringify(payload)}
    ]
  });
  const txt=response.output_text.trim().replace(/^```json\s*/,"").replace(/```$/,"");
  return JSON.parse(txt);
}
function apply(state,out){
  for(const m of out.messages||[]) state.messages.push({...m,at:Date.now()});
  for(const u of out.memory_updates||[]) if(state.memories[u.agent]) state.memories[u.agent].push(u.memory);
  for(const u of out.relationship_updates||[]){
    const r=state.relationships[u.agent]?.Alina; if(!r) continue;
    for(const k of ["trust","affection","respect","suspicion","fear","irritation","protectiveness"])
      if(Number.isFinite(u[k])) r[k]=Math.max(-100,Math.min(100,r[k]+u[k]));
  }
  const w=out.world_changes||{};
  state.timeline_stability=Math.max(0,Math.min(1,state.timeline_stability+(w.timeline_stability_delta||0)));
  state.commission_activity=Math.max(0,Math.min(1,state.commission_activity+(w.commission_activity_delta||0)));
  state.known_anomalies.push(...(w.new_anomalies||[]));
  state.active_dangers.push(...(w.new_dangers||[]));
  state.consequences.push(...(w.consequences||[]));
  state.world_events.push(...(out.actions||[]));
  state.tick++;
}
app.post("/api/start",async(req,res)=>{
 try{
   const id=req.body.sessionId||crypto.randomUUID();
   sessions.set(id,freshState()); const state=getSession(id);
   const out=await simulate(state,{type:"SIMULATION_START",description:"Алина появилась в поле внимания семьи. У Пятого есть основание подозревать связанную с ней временную аномалию. Реши автономно, действует ли кто-либо сейчас."});
   apply(state,out); res.json({sessionId:id,messages:state.messages});
 }catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/message",async(req,res)=>{
 try{
   const {sessionId,text}=req.body; const state=getSession(sessionId);
   state.messages.push({author:"Alina",text:String(text||""),channel:"group",at:Date.now()});
   const out=await simulate(state,{type:"USER_MESSAGE",author:"Alina",channel:"group",text:String(text||"")});
   apply(state,out); res.json({messages:state.messages.slice(-12)});
 }catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/tick",async(req,res)=>{
 try{
   const state=getSession(req.body.sessionId);
   const out=await simulate(state,{type:"SIMULATION_TICK",description:"Прошло некоторое время. Действуй только если у агента или мира есть естественная причина."});
   apply(state,out); res.json({messages:state.messages.slice(-12)});
 }catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/health",(req,res)=>res.json({ok:true,ai:!!process.env.OPENAI_API_KEY}));
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`Umbrella simulation on ${port}`));
