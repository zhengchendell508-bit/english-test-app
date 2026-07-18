const CHILDREN_KEY = "englishTestChildrenV3";
const ACTIVE_CHILD_KEY = "englishTestActiveChildV3";

function getChildren(){
  try { return JSON.parse(localStorage.getItem(CHILDREN_KEY) || "[]"); }
  catch { return []; }
}
function saveChildren(children){
  localStorage.setItem(CHILDREN_KEY, JSON.stringify(children));
}
function createChild(name){
  const clean = String(name || "").trim();
  if(!clean) throw new Error("请输入孩子名字");
  const children = getChildren();
  if(children.some(c => c.name.toLowerCase() === clean.toLowerCase())){
    throw new Error("这个孩子已经创建过了");
  }
  const child = {id:`child-${Date.now()}-${Math.random().toString(16).slice(2)}`, name:clean};
  children.push(child);
  saveChildren(children);
  return child;
}
function removeChild(id){
  saveChildren(getChildren().filter(c => c.id !== id));
  const active = getActiveChild();
  if(active && active.id === id) localStorage.removeItem(ACTIVE_CHILD_KEY);
}
function setActiveChild(child){
  localStorage.setItem(ACTIVE_CHILD_KEY, JSON.stringify(child));
}
function getActiveChild(){
  try { return JSON.parse(localStorage.getItem(ACTIVE_CHILD_KEY) || "null"); }
  catch { return null; }
}
