const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function makeCode(){
  let c;
  do c=String(Math.floor(1000+Math.random()*9000)); while(rooms.has(c));
  return c;
}
function fresh(){
  return {
    ice:100, fire:100,
    turn:"ice", winner:null,
    phase:"choose", // choose | defend | resolve
    pending:null
  };
}
function pub(room){
  return {code:room.code, players:{ice:!!room.players.ice,fire:!!room.players.fire}, state:room.state};
}
function enemy(role){ return role==="ice" ? "fire" : "ice"; }

const ATTACKS = {
  ice:{
    hammer:{name:"Σφυρί του Πάγου", icon:"🔨", min:18,max:26,kind:"melee"},
    iceblast:{name:"Παγωμένη Βολή", icon:"❄️", min:14,max:21,kind:"projectile"},
    special:{name:"Παγωμένη Καταιγίδα", icon:"🌨️", min:27,max:31,kind:"special"}
  },
  fire:{
    sword:{name:"Πύρινη Λεπίδα", icon:"⚔️", min:17,max:24,kind:"melee"},
    fireball:{name:"Μπάλα Φωτιάς", icon:"🔥", min:15,max:22,kind:"projectile"},
    special:{name:"Κύμα Φωτιάς", icon:"🌋", min:28,max:31,kind:"special"}
  }
};
const DEFENSES = {
  shield:{name:"Ασπίδα",icon:"🛡️",reduce:.65, dodge:0, reflect:0},
  dodge:{name:"Αποφυγή",icon:"💨",reduce:0,dodge:.58,reflect:0},
  counter:{name:"Αντεπίθεση",icon:"⚡",reduce:.30,dodge:0,reflect:7}
};

function roll(min,max){ return min+Math.floor(Math.random()*(max-min+1)); }

function resolve(room, defenseMove){
  const s=room.state;
  const p=s.pending;
  if(!p) return null;
  const atk=ATTACKS[p.attacker][p.move];
  const def=DEFENSES[defenseMove] || null;

  let raw=roll(atk.min,atk.max);
  let dmg=raw, dodged=false, reflected=0, reduced=0;

  // Specials are harder to dodge
  if(def && def.dodge){
    const chance = atk.kind==="special" ? .25 : def.dodge;
    if(Math.random()<chance){ dodged=true; dmg=0; }
  }
  if(def && !dodged && def.reduce){
    const before=dmg;
    dmg=Math.max(1, Math.round(dmg*(1-def.reduce)));
    reduced=before-dmg;
  }
  if(def && !dodged && def.reflect){
    reflected=def.reflect;
    s[p.attacker]=Math.max(0,s[p.attacker]-reflected);
  }

  s[p.defender]=Math.max(0,s[p.defender]-dmg);

  if(s.ice<=0 && s.fire<=0) s.winner="draw";
  else if(s.ice<=0) s.winner="fire";
  else if(s.fire<=0) s.winner="ice";

  const result={
    attacker:p.attacker, defender:p.defender, attack:p.move,
    attackName:atk.name, attackIcon:atk.icon,
    defense:defenseMove||"none",
    defenseName:def?def.name:"Καμία άμυνα",
    defenseIcon:def?def.icon:"💥",
    rawDamage:raw, damage:dmg, reduced, dodged, reflected
  };

  s.pending=null;
  s.phase="choose";
  if(!s.winner) s.turn=p.defender; // defender gets next attack turn
  return result;
}

function startDefenseTimer(room){
  clearTimeout(room.timer);
  room.timer=setTimeout(()=>{
    if(room.state.phase!=="defend" || !room.state.pending) return;
    const result=resolve(room,null);
    io.to(room.code).emit("attack-resolved",{result,room:pub(room)});
  }, 6500);
}

io.on("connection", socket=>{
  socket.on("create-room", cb=>{
    const code=makeCode();
    const room={code,players:{ice:socket.id,fire:null},state:fresh(),timer:null};
    rooms.set(code,room); socket.join(code);
    socket.data.room=code;socket.data.role="ice";
    cb({ok:true,code,role:"ice",room:pub(room)});
  });

  socket.on("join-room",({code},cb)=>{
    code=String(code||"").trim();
    const room=rooms.get(code);
    if(!room) return cb({ok:false,error:"ROOM_NOT_FOUND"});
    if(room.players.fire) return cb({ok:false,error:"ROOM_FULL"});
    room.players.fire=socket.id; socket.join(code);
    socket.data.room=code;socket.data.role="fire";
    cb({ok:true,code,role:"fire",room:pub(room)});
    io.to(code).emit("battle-ready",pub(room));
  });

  socket.on("attack",({move},cb)=>{
    const room=rooms.get(socket.data.room), role=socket.data.role;
    if(!room) return cb?.({ok:false,error:"NO_ROOM"});
    const s=room.state;
    if(s.winner || s.phase!=="choose" || s.turn!==role) return cb?.({ok:false,error:"NOT_ALLOWED"});
    if(!ATTACKS[role][move]) return cb?.({ok:false,error:"BAD_MOVE"});

    const defender=enemy(role);
    s.pending={attacker:role,defender,move};
    s.phase="defend";
    io.to(room.code).emit("attack-started",{attacker:role,defender,move,room:pub(room)});
    startDefenseTimer(room);
    cb?.({ok:true});
  });

  socket.on("defend",({move},cb)=>{
    const room=rooms.get(socket.data.room), role=socket.data.role;
    if(!room) return cb?.({ok:false,error:"NO_ROOM"});
    const s=room.state;
    if(s.phase!=="defend" || !s.pending || s.pending.defender!==role) return cb?.({ok:false,error:"NOT_ALLOWED"});
    if(!DEFENSES[move]) return cb?.({ok:false,error:"BAD_MOVE"});
    clearTimeout(room.timer);
    const result=resolve(room,move);
    io.to(room.code).emit("attack-resolved",{result,room:pub(room)});
    cb?.({ok:true});
  });

  socket.on("restart",()=>{
    const room=rooms.get(socket.data.room); if(!room)return;
    clearTimeout(room.timer);room.state=fresh();
    io.to(room.code).emit("room-update",pub(room));
  });

  socket.on("disconnect",()=>{
    const room=rooms.get(socket.data.room), role=socket.data.role;
    if(!room)return;
    if(role && room.players[role]===socket.id) room.players[role]=null;
    io.to(room.code).emit("room-update",pub(room));
    if(!room.players.ice && !room.players.fire){clearTimeout(room.timer);rooms.delete(room.code);}
  });
});

server.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("v6 on http://localhost:3000"));
