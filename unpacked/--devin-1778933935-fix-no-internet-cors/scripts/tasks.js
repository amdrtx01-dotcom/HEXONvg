/* ---------- Daily tasks ---------- */
const TASK_TEMPLATES = [
  { type:"score", picks:[300,500,750,1000,1500,2000,3000,5000], xp:80 },
  { type:"lines", picks:[5,10,15,20,30,40,60], xp:70 },
  { type:"combo", picks:[2,3,4,5,6], xp:60 },
  { type:"place", picks:[20,40,60,100,150], xp:50 },
  { type:"games", picks:[1,2,3,5], xp:90 },
  { type:"clear3", picks:[1,2,3], xp:120 },
];
function generateDailyTasks(){
  const seed = hashStr(todayKey() + (state.profile.id||"x"));
  const rnd = mulberry32(seed);
  const taskCount = 6;
  const pool = TASK_TEMPLATES.slice();
  const tasks = [];
  for(let i=0;i<taskCount;i++){
    const tmpl = pool[Math.floor(rnd()*pool.length)];
    const target = tmpl.picks[Math.floor(rnd()*tmpl.picks.length)];
    tasks.push({ id: "t_"+tmpl.type+"_"+target+"_"+i, type:tmpl.type, target, progress:0, xp:tmpl.xp, done:false });
  }
  return tasks;
}
function ensureDailyTasks(){
  const key = todayKey();
  if(state.dailyTasks.date !== key){
    state.dailyTasks = { date: key, tasks: generateDailyTasks() };
    /* Coalesce — ensureDailyTasks() is called at the top of every
       bumpDailyTask, so on the first move of a new day we'd otherwise
       fire two writes (one here, one from the achievement chain). */
    requestSaveState();
  }
}
function bumpDailyTask(type, value, asMax){
  ensureDailyTasks();
  let any = false;
  state.dailyTasks.tasks.forEach(task=>{
    if(task.type !== type || task.done) return;
    if(asMax){
      if(value > task.progress) task.progress = value;
    } else {
      task.progress += value;
    }
    if(task.progress >= task.target){
      task.progress = task.target;
      task.done = true;
      addXP(task.xp);
      toast(t("toast.taskdone") + ": " + taskTitle(task), "success");
      any = true;
    }
  });
  if(any){ renderTasks(); refreshSideTasks(); }
}
function taskTitle(task){
  return t("task."+task.type+".t",{n:task.target});
}
function taskDesc(task){
  return t("task."+task.type+".d",{n:task.target});
}
function timeToReset(){
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,0,0);
  const diff = next - now;
  const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000);
  return h+"h "+m+"m";
}
function renderTasks(){
  ensureDailyTasks();
  $("#tasks-reset").textContent = t("tasks.reset.in") + " " + timeToReset();
  const grid = $("#tasks-grid");
  grid.innerHTML = "";
  state.dailyTasks.tasks.forEach(task=>{
    const el = document.createElement("div");
    el.className = "task" + (task.done ? " done" : "");
    el.innerHTML = `
      <div class="t"></div>
      <div class="d"></div>
      <div class="bar"><i></i></div>
      <div class="ft"><span class="prog"></span><span class="xp">+${task.xp} XP</span></div>
    `;
    el.querySelector(".t").textContent = taskTitle(task);
    el.querySelector(".d").textContent = taskDesc(task);
    el.querySelector(".bar > i").style.width = Math.min(100, (task.progress/task.target)*100) + "%";
    el.querySelector(".prog").textContent = task.progress + "/" + task.target;
    grid.appendChild(el);
  });
}
function refreshSideTasks(){
  ensureDailyTasks();
  const wrap = $("#side-tasks");
  if(!wrap) return;
  wrap.innerHTML = "";
  state.dailyTasks.tasks.slice(0,3).forEach(task=>{
    const el = document.createElement("div");
    el.className = "daily-mini";
    el.innerHTML = `
      <div class="lbl">+${task.xp} XP</div>
      <div class="ttl"></div>
      <div class="bar"><i></i></div>
    `;
    el.querySelector(".ttl").textContent = taskTitle(task);
    el.querySelector(".bar > i").style.width = Math.min(100, (task.progress/task.target)*100) + "%";
    wrap.appendChild(el);
  });
}

