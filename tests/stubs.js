const stubs={
 'firebase-app.js':`export const initializeApp=()=>({});export const getApps=()=>[];`,
 'firebase-auth.js':`export const getAuth=()=>({});export const onAuthStateChanged=(a,cb)=>setTimeout(()=>cb({email:'a@b.c'}),0);export const signInWithEmailAndPassword=async()=>{};export const signOut=async()=>{};`,
 'firebase-firestore.js':`
const S=window.__DB=window.__DB||{};let n=0;
export const getFirestore=()=>({});
export const collection=(d,name)=>({name});
export const doc=(d,name,id)=>({name,id});
export const serverTimestamp=()=>'ts';
export const query=(c,...w)=>({name:c.name,w});export const orderBy=(f)=>({ob:f});export const limit=(n)=>({lim:n});export const writeBatch=()=>{const ops=[];return{update(r,v){ops.push(()=>updateDoc(r,v))},set(r,v,o){ops.push(()=>setDoc(r,v,o))},async commit(){for(const o of ops)await o()}}};export const where=(f,o,v)=>({f,v});
export const getDocs=async(c)=>{if(window.__FAIL)throw new Error('denied');let m=S[c.name]||{};if(c.w)m=Object.fromEntries(Object.entries(m).filter(([,d])=>c.w.every(w=>w.f===undefined||d[w.f]===w.v)));return {empty:!Object.keys(m).length,size:Object.keys(m).length,docs:Object.entries(m).map(([id,v])=>({id,data:()=>v})),forEach(f){this.docs.forEach(f)}}};
export const getDoc=async(r)=>{const v=(S[r.name]||{})[r.id];return {exists:()=>!!v,id:r.id,data:()=>v}};
const L=window.__L=window.__L||[];const emit=()=>L.forEach(f=>f());export const addDoc=async(c,v)=>{const id='id'+(++n);(S[c.name]=S[c.name]||{})[id]=v;emit();return {id}};
export const setDoc=async(r,v,o)=>{if(window.__SETFAIL&&r.name==='orders')throw new Error('denied');const m=(S[r.name]=S[r.name]||{});m[r.id]=o&&o.merge&&m[r.id]?Object.assign(m[r.id],v):v;emit()};
export const updateDoc=async(r,v)=>{Object.assign(S[r.name][r.id],v);emit()};
export const deleteDoc=async(r)=>{delete S[r.name][r.id];emit()};export const onSnapshot=(q,cb,eb)=>{if(window.__FAIL){eb&&eb(new Error('denied'));return()=>{}}let seen=new Set();const run=()=>{const m=S[q.name]||{};const ids=Object.keys(m);const added=ids.filter(i=>!seen.has(i));const snap={docs:ids.map(id=>({id,data:()=>m[id]})),docChanges:()=>added.map(id=>({type:'added',doc:{id,data:()=>m[id]}}))};ids.forEach(i=>seen.add(i));cb(snap)};L.push(run);run();return()=>{}};`};
module.exports=stubs;