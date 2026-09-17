// Academia - localhost (localStorage) OU nuvem (Supabase) se config.js preenchido
// Tabelas isoladas: academia_alunos / academia_pagamentos (convivem com outros projetos no mesmo Supabase)
const KEY='academia_alunos_v1', KEYPAG='academia_pagamentos_v1';
const T_ALUNOS='academia_alunos', T_PAG='academia_pagamentos';
let alunos=JSON.parse(localStorage.getItem(KEY)||'[]');
let pagamentos=JSON.parse(localStorage.getItem(KEYPAG)||'[]');
alunos=alunos.map(a=>({...a,criadoEm:a.criadoEm||new Date().toISOString()}));
// migração: pago (boolean) -> pago_mes (mês em que pagou; vira o mês sozinho)
alunos=alunos.map(a=>({...a, pago_mes: a.pago_mes || (a.pago ? mesKey(new Date()) : null)}));
let editingId=null;
const USE_CLOUD = !!(window.SUPABASE_URL && window.SUPABASE_KEY && window.supabase);
let sb=null;
if(USE_CLOUD){ sb=window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY); }
const $=id=>document.getElementById(id);
const form=$('formAluno'), lista=$('lista'), busca=$('busca'), filtro=$('filtro');
function saveLocal(){ localStorage.setItem(KEY,JSON.stringify(alunos)); localStorage.setItem(KEYPAG,JSON.stringify(pagamentos)); }
function brl(v){ return (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function mesKey(d){ d=new Date(d); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function pagoNoMes(a){ return a.pago_mes === mesKey(new Date()); }
function mesLabel(mk){ const [a,m]=mk.split('-').map(Number); return new Date(a,m-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}); }
function ultimos6Meses(){ const r=[]; const h=new Date(); h.setDate(1); for(let i=5;i>=0;i--){ const d=new Date(h.getFullYear(),h.getMonth()-i,1); r.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); } return r; }
function proximoVencimento(dia){ const h=new Date(); return new Date(h.getFullYear(),h.getMonth(),Math.min(dia,28)); }
function diffDias(data){ const h=new Date(); h.setHours(0,0,0,0); data=new Date(data); data.setHours(0,0,0,0); return Math.round((data-h)/86400000); }
function statusAluno(a){
  if(pagoNoMes(a)) return {tipo:'pago',texto:'✅ Pago'};
  const d=diffDias(proximoVencimento(a.dia));
  if(d<0) return {tipo:'atrasado',texto:`⚠️ Atrasado ${Math.abs(d)} dia(s)`};
  if(d===0) return {tipo:'hoje',texto:'📅 Vence hoje!'};
  if(d<=2) return {tipo:'proximo',texto:`⏳ Vence em ${d} dia(s)`};
  return {tipo:'ok',texto:`Vence dia ${a.dia}`};
}
function msgCobranca(a){ return encodeURIComponent(`Olá ${a.nome}! Aqui é da academia 💪 Sua mensalidade de ${brl(a.valor)} vence dia ${a.dia}. Pode confirmar o pagamento? Obrigado!`); }

async function carregarNuvem(){
  if(!USE_CLOUD) return;
  const {data:{session}} = await sb.auth.getSession();
  if(!session){ mostrarLogin(false); return; }
  mostrarApp(session.user.email);
  const {data:a, error:e1}=await sb.from(T_ALUNOS).select('*').order('nome');
  if(e1){ console.error(e1); authErro('Erro banco: '+e1.message+' (rode o supabase.sql novo)'); return; }
  const {data:p}=await sb.from(T_PAG).select('*').gte('mes', ultimos6Meses()[0]).order('data',{ascending:false}).limit(2000);
  if(a) alunos=a.map(x=>({id:x.id,nome:x.nome,dia:x.dia,valor:Number(x.valor),whats:x.whats||'',pago_mes:x.pago_mes||(x.pago?mesKey(new Date()):null),criadoEm:x.criado_em}));
  if(p) pagamentos=p.map(x=>({id:x.id,alunoId:x.aluno_id,nome:x.nome,valor:Number(x.valor),data:x.data,mes:x.mes}));
}
function mostrarLogin(msg=true){
  $('tela-login').classList.remove('hidden'); $('app').classList.add('hidden');
  $('navTabs').classList.add('hidden'); $('topActions').classList.add('hidden');
  $('userEmail').classList.add('hidden'); $('btnSair').classList.add('hidden');
  if(msg) $('loginModoInfo').textContent='Faça login para ver seus alunos na nuvem.';
}
function mostrarApp(email){
  $('tela-login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('navTabs').classList.remove('hidden'); $('topActions').classList.remove('hidden');
  if(email){ $('userEmail').textContent=email; $('userEmail').classList.remove('hidden'); $('btnSair').classList.remove('hidden'); }
}
function authErro(t){ const e=$('authErro'); e.textContent=t; e.classList.remove('hidden'); }
window.entrar=async()=>{
  const email=$('authEmail').value.trim(), pass=$('authPass').value;
  if(!email||pass.length<6) return authErro('Digite e-mail e senha de 6+ letras.');
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error) return authErro('Não entrou: '+error.message);
  await carregarNuvem(); render(); renderFat();
};
window.criarConta=async()=>{
  const email=$('authEmail').value.trim(), pass=$('authPass').value;
  if(!email||pass.length<6) return authErro('Digite e-mail e senha de 6+ letras para criar.');
  const {error}=await sb.auth.signUp({email,password:pass});
  if(error) return authErro('Não criou: '+error.message);
  authErro('Conta criada! Se pedir, confirme no e-mail e clique Entrar.');
  await carregarNuvem(); render(); renderFat();
};
window.sair=async()=>{ await sb.auth.signOut(); alunos=[]; pagamentos=[]; mostrarLogin(); };

form.addEventListener('submit', async e=>{
  e.preventDefault();
  const nome=$('nome').value.trim(), dia=parseInt($('dia').value), valor=parseFloat($('valor').value), whats=$('whats').value.replace(/\D/g,'');
  if(!nome||!(dia>=1&&dia<=31)||!(valor>0)) return alert('Preencha nome, dia 1-31 e valor.');
  if(USE_CLOUD){
    const {data:{session}} = await sb.auth.getSession();
    await sb.from(T_ALUNOS).insert({nome,dia,valor,whats,pago:false,user_id:session.user.id});
    await carregarNuvem();
  } else {
    alunos.push({id:Date.now(),nome,dia,valor,whats,pago_mes:null,criadoEm:new Date().toISOString()});
    saveLocal();
  }
  form.reset(); render(); renderFat();
});

window.trocarAba=qual=>{
  $('aba-alunos').classList.toggle('hidden',qual!=='alunos');
  $('aba-fat').classList.toggle('hidden',qual!=='fat');
  $('tabAlunos').classList.toggle('active',qual==='alunos');
  $('tabFat').classList.toggle('active',qual==='fat');
  if(qual==='fat') renderFat();
};
window.marcarPago=async id=>{
  const mk=mesKey(new Date());
  if(USE_CLOUD){
    const {data:{session}} = await sb.auth.getSession();
    await sb.from(T_ALUNOS).update({pago:true,pago_mes:mk}).eq('id',id);
    const a=alunos.find(x=>String(x.id)===String(id));
    await sb.from(T_PAG).insert({aluno_id:id,nome:a?.nome||'',valor:a?.valor||0,mes:mk,user_id:session.user.id});
    await carregarNuvem();
  } else {
    const a=alunos.find(x=>x.id===id); if(a) a.pago_mes=mk;
    const al=alunos.find(x=>x.id===id);
    pagamentos.push({id:Date.now(),alunoId:id,nome:al.nome,valor:al.valor,data:new Date().toISOString(),mes:mk});
    saveLocal();
  }
  render(); renderFat();
};
window.desmarcar=async id=>{
  const mk=mesKey(new Date());
  if(USE_CLOUD){
    await sb.from(T_ALUNOS).update({pago:false,pago_mes:null}).eq('id',id);
    await sb.from(T_PAG).delete().eq('aluno_id',id).eq('mes',mk);
    await carregarNuvem();
  } else {
    alunos=alunos.map(a=>a.id===id?{...a,pago_mes:null}:a);
    const idx=[...pagamentos].map((p,i)=>({p,i})).filter(x=>String(x.p.alunoId)===String(id)&&x.p.mes===mk).pop();
    if(idx) pagamentos.splice(idx.i,1);
    saveLocal();
  }
  render(); renderFat();
};
window.excluir=async id=>{ if(!confirm('Excluir aluno?'))return;
  if(USE_CLOUD){ await sb.from(T_ALUNOS).delete().eq('id',id); await carregarNuvem(); }
  else { alunos=alunos.filter(a=>a.id!==id); saveLocal(); }
  render(); renderFat();
};
window.editar=id=>{ editingId=id; render(); };
window.cancelarEdicao=()=>{ editingId=null; render(); };
window.salvarEdicao=async id=>{
  const nome=$('edit-nome-'+id).value.trim();
  const dia=parseInt($('edit-dia-'+id).value);
  const valor=parseFloat($('edit-valor-'+id).value);
  const whats=$('edit-whats-'+id).value.replace(/\D/g,'');
  if(!nome||!(dia>=1&&dia<=31)||!(valor>0)) return alert('Preencha nome, dia 1-31 e valor.');
  const mk=mesKey(new Date());
  if(USE_CLOUD){
    const {error}=await sb.from(T_ALUNOS).update({nome,dia,valor,whats}).eq('id',id);
    if(error) return alert('Erro ao salvar: '+error.message);
    await sb.from(T_PAG).update({nome,valor}).eq('aluno_id',id).eq('mes',mk);
    await carregarNuvem();
  } else {
    alunos=alunos.map(a=>a.id===id?{...a,nome,dia,valor,whats}:a);
    pagamentos=pagamentos.map(p=>String(p.alunoId)===String(id)&&p.mes===mk?{...p,nome,valor}:p);
    saveLocal();
  }
  editingId=null; render(); renderFat();
};
let buscaTimer=null;
busca.addEventListener('input',()=>{ clearTimeout(buscaTimer); buscaTimer=setTimeout(render,200); }); filtro.addEventListener('change',render);
$('btnLembretes').addEventListener('click',()=>{ trocarAba('alunos'); $('painelLembretes').classList.toggle('hidden'); $('painelLembretes').scrollIntoView({behavior:'smooth'}); });

function render(){
  const termo=busca.value.toLowerCase(), f=filtro.value;
  lista.innerHTML='';
  let F=alunos.filter(a=>a.nome.toLowerCase().includes(termo)).filter(a=>{
    const s=statusAluno(a).tipo;
    if(f==='todos')return true; if(f==='hoje')return s==='hoje'; if(f==='proximos')return s==='proximo'||s==='hoje';
    if(f==='atrasados')return s==='atrasado'; if(f==='pagos')return s==='pago'; if(f==='pendentes')return s!=='pago'; return true;
  });
  const peso={atrasado:0,hoje:1,proximo:2,ok:3,pago:4}; F.sort((x,y)=>peso[statusAluno(x).tipo]-peso[statusAluno(y).tipo]);
  if(!F.length) lista.innerHTML='<p style="color:#888">Nenhum aluno.</p>';
  F.forEach(a=>{
    const s=statusAluno(a); const div=document.createElement('div'); div.className='aluno';
    const idJs = typeof a.id==='string' ? `'${a.id}'` : a.id;
    const pago = pagoNoMes(a);
    if(String(a.id)===String(editingId)){
      div.innerHTML=`<div class="aluno-info edit-form">
        <input id="edit-nome-${a.id}" value="${a.nome.replace(/"/g,'&quot;')}" placeholder="Nome" />
        <div class="row">
          <input id="edit-dia-${a.id}" type="number" min="1" max="31" value="${a.dia}" placeholder="Dia" />
          <input id="edit-valor-${a.id}" type="number" min="1" step="0.01" value="${a.valor}" placeholder="Valor R$" />
        </div>
        <input id="edit-whats-${a.id}" value="${a.whats||''}" placeholder="WhatsApp (só números)" />
        <span class="badge b-${s.tipo}">${s.texto}</span>
      </div>
      <div class="aluno-actions">
        <button class="btn btn-pago" onclick="salvarEdicao(${idJs})">💾 Salvar</button>
        <button class="btn btn-dark" onclick="cancelarEdicao()">✖ Cancelar</button>
      </div>`;
    } else {
      div.innerHTML=`<div class="aluno-info"><b>${a.nome}</b><small>Dia <b>${a.dia}</b> • ${brl(a.valor)} ${a.whats?'• 📱 '+a.whats:''}</small><span class="badge b-${s.tipo}">${s.texto}</span></div>
      <div class="aluno-actions">${!pago?`<button class="btn btn-pago" onclick="marcarPago(${idJs})">✅ Marcar pago</button>`:`<button class="btn btn-dark" onclick="desmarcar(${idJs})">↩️ Voltar p/ pendente</button>`}
      ${a.whats?`<a class="btn btn-whats" target="_blank" href="https://wa.me/55${a.whats}?text=${msgCobranca(a)}">💬 Cobrar no Whats</a>`:`<span class="btn btn-dark">💬 Sem Whats</span>`}
      <button class="btn btn-edit" onclick="editar(${idJs})">✏️ Editar</button>
      <button class="btn btn-del" onclick="excluir(${idJs})">🗑 Excluir</button></div>`;
    }
    lista.appendChild(div);
  });
  const total=alunos.reduce((s,a)=>s+Number(a.valor),0), pago=alunos.filter(pagoNoMes).reduce((s,a)=>s+Number(a.valor),0);
  $('statTotal').textContent=brl(total); $('statPago').textContent=brl(pago); $('statPendente').textContent=brl(total-pago); $('statAlunos').textContent=alunos.length;
  const urg=alunos.filter(a=>['atrasado','hoje','proximo'].includes(statusAluno(a).tipo));
  $('badgeCount').textContent=urg.length;
  const b=$('alertBanner'); if(urg.length){b.classList.remove('hidden'); b.textContent=`⚠️ ${urg.length} aluno(s) precisam pagar. Clique em 🔔.`;} else b.classList.add('hidden');
  const box=$('listaLembretes'); if(box){ box.innerHTML=urg.length?'':'<p style="color:#888">Tudo em dia! 🎉</p>';
    urg.forEach(a=>{ const s=statusAluno(a); const d=document.createElement('div'); d.className='lembrete';
      d.innerHTML=`<div><b>${a.nome}</b> — ${s.texto} — ${brl(a.valor)}</div>${a.whats?`<a class="btn btn-whats" target="_blank" href="https://wa.me/55${a.whats}?text=${msgCobranca(a)}">Cobrar</a>`:''}`; box.appendChild(d); }); }
}
let chFat=null,chAlu=null;
function alunosAtivosNoMes(mk){ const [y,m]=mk.split('-').map(Number); const fim=new Date(y,m,0,23,59,59); return alunos.filter(a=>new Date(a.criadoEm)<=fim); }
function recebidoNoMes(mk){ return pagamentos.filter(p=>p.mes===mk).reduce((s,p)=>s+Number(p.valor),0); }
function renderFat(){
  const meses=ultimos6Meses(), labels=meses.map(mesLabel);
  const recebidos=meses.map(recebidoNoMes);
  const previstos=meses.map(mk=>alunosAtivosNoMes(mk).reduce((s,a)=>s+Number(a.valor),0));
  const nAlunos=meses.map(mk=>alunosAtivosNoMes(mk).length);
  const mkAtual=mesKey(new Date()), mkAnt=meses[meses.length-2];
  const recAtual=recebidoNoMes(mkAtual), recAnt=recebidoNoMes(mkAnt);
  const prevAtual=alunos.reduce((s,a)=>s+Number(a.valor),0);
  const variacao=recAnt>0?((recAtual-recAnt)/recAnt*100):(recAtual>0?100:0);
  $('fatMesAtual').textContent=brl(recAtual); $('fatMesAnt').textContent=brl(recAnt); $('fatPrevisto').textContent=brl(prevAtual);
  $('fatAlunos').textContent=alunos.length; $('fatTicket').textContent=brl(alunos.length?prevAtual/alunos.length:0);
  $('fatInad').textContent=(prevAtual>0?Math.max(0,(prevAtual-recAtual)/prevAtual*100):0).toFixed(0)+'%';
  const elV=$('fatVar'); elV.textContent=(variacao>=0?'📈 +':'📉 ')+variacao.toFixed(1)+'% vs mês anterior'; elV.className='var '+(variacao>=0?'up':'down');
  const novos=alunos.filter(a=>mesKey(a.criadoEm)===mkAtual).length;
  $('fatNovos').textContent=`+${novos} novos este mês`;
  const tb=$('tabelaFat'); tb.innerHTML='';
  [...meses].reverse().forEach(mk=>{
    const rec=recebidoNoMes(mk), al=alunosAtivosNoMes(mk), prev=al.reduce((s,a)=>s+Number(a.valor),0);
    const idx=meses.indexOf(mk), recPrevM=idx>0?recebidoNoMes(meses[idx-1]):null;
    let tend='—'; if(recPrevM!==null) tend=rec>recPrevM?'📈 subindo':rec<recPrevM?'📉 caindo':'➖ estável';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><b>${mesLabel(mk)}</b></td><td>${al.length} assinantes</td><td>${brl(prev)}</td><td>${brl(rec)}</td><td>${prev>0?(rec/prev*100).toFixed(0):0}%</td><td>${tend}</td>`;
    tb.appendChild(tr);
  });
  if(typeof Chart==='undefined') return;
  if(chFat)chFat.destroy(); if(chAlu)chAlu.destroy();
  Chart.defaults.color='#9ca3af';
  chFat=new Chart($('chartFat'),{type:'bar',data:{labels,datasets:[{label:'Recebido',data:recebidos,backgroundColor:'#22c55e',borderRadius:8},{label:'Previsto',data:previstos,backgroundColor:'#2a2f3b',borderRadius:8}]},options:{scales:{y:{beginAtZero:true}}}});
  chAlu=new Chart($('chartAlunos'),{type:'line',data:{labels,datasets:[{label:'Assinantes',data:nAlunos,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.2)',fill:true,tension:.4}]},options:{scales:{y:{beginAtZero:true,ticks:{stepSize:1}}}}});
}
window.carregarExemplo=async()=>{
  if(!confirm('Gerar exemplo?'))return;
  const nomes=['Carlos Silva','Ana Souza','Pedro Santos','Mariana Lima','João Oliveira','Fernanda Costa','Lucas Pereira','Juliana Alves','Rafael Rocha','Beatriz Martins','Thiago Nunes','Camila Ribeiro'];
  if(USE_CLOUD){ alert('No modo nuvem, cadastre 3-4 alunos reais e marque pago — o gráfico monta sozinho. O botão exemplo só funciona no localhost.'); return; }
  alunos=[];pagamentos=[]; const hoje=new Date();
  nomes.forEach((n,i)=>{ const criado=new Date(hoje.getFullYear(),hoje.getMonth()-(i%6),3+i); const valor=[79.9,89.9,99.9,119.9][i%4]; const id=Date.now()+i;
    alunos.push({id,nome:n,dia:5+(i%20),valor,whats:'',pago_mes:null,criadoEm:criado.toISOString()});
    for(let m=5;m>=0;m--){ if(Math.random()<(0.55+(5-m)*0.07)){ const d=new Date(hoje.getFullYear(),hoje.getMonth()-m,8); if(d>=criado) pagamentos.push({id:Date.now()+i*100+m,alunoId:id,nome:n,valor,data:d.toISOString(),mes:mesKey(d)}); } }
  });
  const mk=mesKey(new Date()); alunos.forEach(a=>{a.pago_mes=pagamentos.some(p=>p.alunoId===a.id&&p.mes===mk)?mk:null;});
  saveLocal(); render(); renderFat(); trocarAba('fat');
};
window.limparHistorico=async()=>{ if(!confirm('Apagar TUDO?'))return;
  if(USE_CLOUD){ await sb.from(T_PAG).delete().neq('id',0); await sb.from(T_ALUNOS).delete().neq('id',0); await carregarNuvem(); }
  else { alunos=[];pagamentos=[]; saveLocal(); }
  render(); renderFat();
};
(async()=>{
  if(USE_CLOUD){
    $('loginModoInfo').textContent='Entre ou crie sua conta com e-mail e senha.';
    sb.auth.onAuthStateChange(async (_ev,session)=>{ if(session){ await carregarNuvem(); render(); renderFat(); } });
    await carregarNuvem();
  } else {
    mostrarApp();
  }
  render(); renderFat();
})();
