(()=>{
  const KEY='kairos-mvp-state';
  const ICONS=[['📚','Reading'],['🏋️','Exercise'],['🧠','Study'],['🌙','Sleep'],['💧','Hydration'],['🧘','Meditation'],['✍️','Writing'],['🥗','Healthy Eating'],['🏃','Running'],['🧹','Cleaning']];
  const LEGACY_ICONS={menu_book:'📚',fitness_center:'🏋️',school:'🧠',bedtime:'🌙',water_drop:'💧',self_improvement:'🧘',edit_note:'✍️',nutrition:'🥗',directions_run:'🏃',cleaning_services:'🧹',routine:'📚'};
  const core=window.KairosHabitCore;
  let state;
  let lastHabitCompletionRate=null,habitCompletionFrame=0;
  const pad=n=>String(n).padStart(2,'0');
  const dateKey=d=>core?.dateKey?core.dateKey(d):`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today=()=>dateKey(new Date());
  const from=key=>core?.fromDateKey?core.fromDateKey(key):(()=>{const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d)})();
  const shift=(key,days)=>core?.shiftDateKey?core.shiftDateKey(key,days):(()=>{const d=from(key);d.setDate(d.getDate()+days);return dateKey(d)})();
  const clean=habit=>({...habit,icon:LEGACY_ICONS[habit.icon]||habit.icon||'📚',dates:core?.normalizeDates?core.normalizeDates(habit.dates):[...new Set(habit.dates||[])].sort(),allowBackfill:!!habit.allowBackfill});
  const readSettings=()=>{try{return window.KairosSettingsFeature?.read?.()||window.top?.KairosSettingsFeature?.read?.()||JSON.parse((window.top||window).localStorage.getItem('kairos-settings')||'{}')}catch{return {}}};
  const backfillDefault=()=>!!readSettings()?.habits?.allowBackfillDefault;
  const reactPet=(action,payload={})=>{if(window.kairosDesktop?.pet?.react)return window.kairosDesktop.pet.react(action,payload).catch(()=>{});if(window.top!==window)window.top.postMessage({type:'kairos:pet-react',action,payload},'*')};
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
  const kairosConfirmAlert=({title,description,action='Continue',cancel='Cancel',tone='danger'}={})=>new Promise(resolve=>{
    let dialog=document.getElementById('kairosAlertDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='kairosAlertDialog';dialog.className='kairos-alert-dialog';dialog.setAttribute('role','alertdialog');dialog.innerHTML='<form method="dialog" class="kairos-alert-content"><div class="kairos-alert-header"><div class="kairos-alert-media"><span class="material-symbols-outlined">warning</span></div><div><h2 class="kairos-alert-title"></h2><p class="kairos-alert-description"></p></div></div><footer class="kairos-alert-footer"><button class="kairos-alert-cancel" value="cancel" type="submit"></button><button class="kairos-alert-action" value="confirm" type="submit"></button></footer></form>';document.body.append(dialog)}
    dialog.dataset.tone=tone;dialog.querySelector('.kairos-alert-title').textContent=title||'Are you sure?';dialog.querySelector('.kairos-alert-description').textContent=description||'This action cannot be undone.';dialog.querySelector('.kairos-alert-cancel').textContent=cancel;dialog.querySelector('.kairos-alert-action').textContent=action;
    const done=value=>{dialog.removeEventListener('close',onClose);resolve(value)};const onClose=()=>done(dialog.returnValue==='confirm');
    dialog.addEventListener('close',onClose,{once:true});dialog.showModal();dialog.querySelector('.kairos-alert-cancel')?.focus();
  });
  const streak=habit=>core?.currentStreak?core.currentStreak(habit,today()):(()=>{const dates=new Set(habit.dates);let cursor=today();if(!dates.has(cursor))cursor=shift(cursor,-1);let count=0;while(dates.has(cursor)){count++;cursor=shift(cursor,-1)}return count})();
  const best=habit=>core?.bestStreak?core.bestStreak(habit):(()=>{let maximum=0,count=0,last='';for(const date of habit.dates){count=last&&shift(last,1)===date?count+1:1;maximum=Math.max(maximum,count);last=date}return maximum})();
  const easeOutCubic=t=>1-Math.pow(1-t,3);
  function animateHabitCompletion(target){
    const node=document.querySelector('[data-habit-countup]'),ring=document.querySelector('[data-habit-progress-ring]');if(!node)return;
    const previous=lastHabitCompletionRate;
    const from=previous===null?0:previous;
    cancelAnimationFrame(habitCompletionFrame);
    if(target===from){node.textContent=`${target}%`;if(ring)ring.style.setProperty('--progress',`${target*3.6}deg`);lastHabitCompletionRate=target;return}
    node.classList.remove('is-counting');void node.offsetWidth;node.classList.add('is-counting');
    ring?.classList.remove('is-progressing');if(ring){void ring.offsetWidth;ring.classList.add('is-progressing')}
    const start=performance.now(),duration=900;
    const tick=now=>{
      const progress=Math.min(1,(now-start)/duration),value=Math.round(from+(target-from)*easeOutCubic(progress));
      const ringValue=from+(target-from)*easeOutCubic(progress);
      node.textContent=`${value}%`;
      if(ring)ring.style.setProperty('--progress',`${ringValue*3.6}deg`);
      if(progress<1)habitCompletionFrame=requestAnimationFrame(tick);
      else{node.textContent=`${target}%`;if(ring){ring.style.setProperty('--progress',`${target*3.6}deg`);ring.classList.remove('is-progressing')}node.classList.remove('is-counting');lastHabitCompletionRate=target}
    };
    habitCompletionFrame=requestAnimationFrame(tick);
  }

  async function load(){
    let local={};try{local=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
    state={...local,habits:(Array.isArray(local.habits)?local.habits:[]).map(clean)};
    if(window.kairosDesktop){
      state=await window.kairosDesktop.appState.initialize(state);
      state.habits=(Array.isArray(state.habits)?state.habits:[]).map(clean);
      window.kairosDesktop.appState.onChanged(next=>{state=next;state.habits=(next.habits||[]).map(clean);render()});
    }
    render();
  }
  function save(){localStorage.setItem(KEY,JSON.stringify(state));if(window.top!==window)window.top.postMessage({type:'kairos:state-sync',state},'*');window.dispatchEvent(new CustomEvent('kairos:state-changed',{detail:state}));window.kairosDesktop?.appState.save(state)}
  function toggle(id,date=today()){
    const habit=state.habits.find(item=>item.id===id);
    if(!habit)return;
    const nextDates=core?.toggleDate?core.toggleDate(habit,date,today()):(date!==today()&&!habit.allowBackfill)?habit.dates:(habit.dates.includes(date)?habit.dates.filter(item=>item!==date):[...habit.dates,date].sort());
    if(JSON.stringify(nextDates)===JSON.stringify(habit.dates))return;
    habit.dates=nextDates;
    save();render();
  }
  function card(habit){
    const done=habit.dates.includes(today());
    return `<article class="real-habit-card habit-magic-card" data-id="${habit.id}"><button class="habit-drag-handle" type="button" draggable="true" aria-label="Drag to reorder"><span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span></button><button class="habit-check-button ${done?'done':''}" data-toggle="${habit.id}" aria-label="${done?'Mark incomplete':'Mark complete'}"><span aria-hidden="true">${done?'✓':''}</span></button><div class="habit-card-copy"><span class="habit-card-icon" aria-hidden="true">${escape(habit.icon||'📚')}</span><div><h3>${escape(habit.name)}</h3><p>${escape(habit.description||'A little progress every day')}</p></div></div><strong>${streak(habit)}<small>day streak</small></strong><button class="habit-more" data-edit="${habit.id}" aria-label="Edit habit"><span class="material-symbols-outlined">more_vert</span></button></article>`;
  }
  function heatmap(habit){
    let cells='';for(const cell of core?.heatmapWindow?core.heatmapWindow(habit,today(),84):Array.from({length:84},(_,i)=>{const date=shift(today(),i-83);return{date,done:habit.dates.includes(date)}})){cells+=`<span class="heat-cell ${cell.done?'done':''}" title="${cell.date}"></span>`}
    const completed=habit.dates.filter(date=>date>=shift(today(),-83)&&date<=today()).length;
    return `<article class="habit-magic-card"><header><span class="habit-heatmap-icon" aria-hidden="true">${escape(habit.icon||'📚')}</span><strong>${escape(habit.name)}</strong><small>${completed}/84 days</small></header><div class="real-heatmap">${cells}</div></article>`;
  }
  function render(){
    const main=document.querySelector('main.kairos-page-main');if(!main)return;
    const done=state.habits.filter(habit=>habit.dates.includes(today())).length,total=state.habits.length,rate=total?Math.round(done/total*100):0;
    const progressStart=(lastHabitCompletionRate===null?0:lastHabitCompletionRate)*3.6;
    main.innerHTML=`<div class="habit-dashboard"><header class="habit-page-head"><div><span class="habit-kicker">DAILY RHYTHM</span><h1>My Habits</h1><p>${done} of ${total} completed today. Every small step counts.</p></div><button class="habit-primary" data-add><span class="material-symbols-outlined">add</span>Add Habit</button></header><div class="habit-columns"><section><h2>Active Habits</h2><div class="habit-cards">${total?state.habits.map(card).join(''):'<div class="habit-empty">No habits yet. Add a small goal to get started.</div>'}</div></section><section class="habit-progress-column"><h2 aria-hidden="true">&nbsp;</h2><div class="habit-momentum habit-magic-card"><span>Today&apos;s Progress</span><div class="habit-ring" data-habit-progress-ring style="--progress:${progressStart}deg"><div><strong class="habit-count-up-text" data-habit-countup>${rate}%</strong><small>completion</small></div></div><dl><div class="habit-magic-card"><dt>Current Longest Streak</dt><dd>${Math.max(0,...state.habits.map(streak))} days</dd></div><div class="habit-magic-card"><dt>Personal Best</dt><dd>${Math.max(0,...state.habits.map(best))} days</dd></div></dl></div></section><section><h2>Last 12 Weeks</h2><div class="habit-heatmaps">${state.habits.map(heatmap).join('')}</div></section></div></div>`;
    animateHabitCompletion(rate);
    main.querySelectorAll('[data-toggle]').forEach(button=>button.onclick=()=>toggle(button.dataset.toggle));
    main.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>editor(button.dataset.edit));
    main.querySelector('[data-add]').onclick=()=>editor();
    const create=document.querySelector('.kairos-create');if(create)create.onclick=()=>editor();
    setupDrag();
    setupHabitMagicBento();
  }
  function history(habit){
    let days='';for(let index=29;index>=0;index--){const date=shift(today(),-index);days+=`<button type="button" data-history="${date}" class="${habit.dates.includes(date)?'done':''}">${from(date).getDate()}</button>`}
    return `<section class="editor-history"><strong>Last 30 Days</strong><div>${days}</div></section>`;
  }
  function editor(id){
    const habit=state.habits.find(item=>item.id===id);let dialog=document.getElementById('realHabitEditor');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='realHabitEditor';dialog.className='habit-editor';document.body.append(dialog)}
    const selectedIcon=habit?.icon||ICONS[0][0],iconGrid=ICONS.map(([emoji])=>`<button type="button" class="habit-emoji-option ${selectedIcon===emoji?'selected':''}" data-emoji="${emoji}" aria-label="Select ${emoji}" aria-pressed="${selectedIcon===emoji}">${emoji}</button>`).join('');
    const allowBackfill=habit?!!habit.allowBackfill:backfillDefault();
    dialog.innerHTML=`<form><header><div><small>ROUTINE</small><h2>${habit?'Edit Habit':'Add Habit'}</h2></div><button type="button" data-cancel aria-label="Close">×</button></header><label>Name<input name="name" maxlength="24" required value="${escape(habit?.name)}"></label><label>Short Description<input name="description" maxlength="40" value="${escape(habit?.description)}"></label><label>Icon<div class="habit-icon-picker"><input name="icon" type="hidden" value="${selectedIcon}"><button class="habit-icon-trigger" type="button" aria-expanded="false"><span>${selectedIcon}</span><span class="material-symbols-outlined">expand_more</span></button><div class="habit-emoji-grid" hidden>${iconGrid}</div></div></label><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px" class="schedule-all-day"><input name="backfill" type="checkbox" ${allowBackfill?'checked':''}>Allow check-ins for past dates</label><section class="editor-history${allowBackfill?'':' collapsed'}">${habit?history(habit):history({dates:[]})}</section><footer>${habit?'<button type="button" class="habit-danger" data-delete>Delete Habit</button>':'<span></span>'}<button type="button" data-cancel>Cancel</button><button type="submit" class="habit-primary">Save</button></footer></form>`;
    dialog.showModal();
    const iconTrigger=dialog.querySelector('.habit-icon-trigger'),iconGridElement=dialog.querySelector('.habit-emoji-grid'),iconInput=dialog.querySelector('[name=icon]');
    iconTrigger.onclick=()=>{const open=iconGridElement.hidden;iconGridElement.hidden=!open;iconTrigger.setAttribute('aria-expanded',String(open))};
    iconGridElement.querySelectorAll('[data-emoji]').forEach(button=>button.onclick=()=>{iconInput.value=button.dataset.emoji;iconTrigger.querySelector('span').textContent=button.dataset.emoji;iconGridElement.querySelectorAll('[data-emoji]').forEach(option=>{const active=option===button;option.classList.toggle('selected',active);option.setAttribute('aria-pressed',String(active))});iconGridElement.hidden=true;iconTrigger.setAttribute('aria-expanded','false')});
    dialog.querySelector('[name=backfill]').onchange=()=>{const hist=dialog.querySelector('.editor-history');if(hist)hist.classList.toggle('collapsed',!dialog.querySelector('[name=backfill]').checked)};
    dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>dialog.close());
    dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.currentTarget),item=clean({...habit,id:habit?.id||uid(),name:form.get('name').trim(),description:form.get('description').trim(),icon:form.get('icon')||ICONS[0][0],dates:habit?.dates||[],allowBackfill:form.get('backfill')==='on'});state.habits=habit?state.habits.map(current=>current.id===habit.id?item:current):[...state.habits,item];save();dialog.close();render()};
    dialog.querySelector('[data-delete]')?.addEventListener('click',async()=>{const ok=await kairosConfirmAlert({title:'Delete habit?',description:'This habit and all of its check-in history will be permanently removed.',action:'Delete Habit',cancel:'Cancel'});if(!ok)return;state.habits=state.habits.filter(item=>item.id!==habit.id);save();dialog.close();render()});
    const bindHistoryClicks=()=>{dialog.querySelectorAll('[data-history]').forEach(button=>button.onclick=()=>{const allow=dialog.querySelector('[name=backfill]').checked;habit.allowBackfill=allow;if(button.dataset.history===today()||allow){toggle(habit.id,button.dataset.history);const section=dialog.querySelector('.editor-history');if(section)section.outerHTML=history(habit);bindHistoryClicks()}})};bindHistoryClicks();
  }
  function setupDrag(){
    const list=document.querySelector('.habit-cards');
    if(!list)return;
    let movingId='';
    const cards=()=>[...list.querySelectorAll('.real-habit-card')];
    const persist=()=>{
      const order=cards().map(card=>card.dataset.id),byId=new Map(state.habits.map(habit=>[habit.id,habit]));
      state.habits=order.map(id=>byId.get(id)).filter(Boolean);
      save();render();
    };
    cards().forEach(card=>{
      const handle=card.querySelector('.habit-drag-handle');
      if(!handle)return;
      handle.ondragstart=event=>{
        movingId=card.dataset.id;
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed='move';
        event.dataTransfer.setData('text/plain',movingId);
      };
      handle.ondragend=()=>{movingId='';cards().forEach(item=>item.classList.remove('is-dragging','is-drop-before','is-drop-after'))};
      card.ondragover=event=>{
        event.preventDefault();
        if(!movingId||card.dataset.id===movingId)return;
        const box=card.getBoundingClientRect(),before=event.clientY<box.top+box.height/2,dragging=list.querySelector(`[data-id="${movingId}"]`);
        if(!dragging)return;
        card.classList.toggle('is-drop-before',before);
        card.classList.toggle('is-drop-after',!before);
        if(before)list.insertBefore(dragging,card);else list.insertBefore(dragging,card.nextSibling);
      };
      card.ondragleave=()=>card.classList.remove('is-drop-before','is-drop-after');
      card.ondrop=event=>{
        event.preventDefault();
        cards().forEach(item=>item.classList.remove('is-drop-before','is-drop-after'));
        if(movingId)persist();
      };
    });
  }
  function setupHabitMagicBento(){
    const cards=[...document.querySelectorAll('.habit-magic-card')];
    const update=(card,event)=>{
      const rect=card.getBoundingClientRect(),x=((event.clientX-rect.left)/rect.width)*100,y=((event.clientY-rect.top)/rect.height)*100;
      card.style.setProperty('--magic-x',`${x}%`);
      card.style.setProperty('--magic-y',`${y}%`);
      card.style.setProperty('--magic-intensity','1');
    };
    cards.forEach(card=>{
      card.style.setProperty('--magic-intensity','0');
      card.onpointermove=event=>update(card,event);
      card.onpointerenter=event=>update(card,event);
      card.onpointerleave=()=>card.style.setProperty('--magic-intensity','0');
    });
  }
  function sync(){let local={};try{local=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}state={...local,habits:(Array.isArray(local.habits)?local.habits:[]).map(clean)};render()}
  window.addEventListener('storage',event=>{if(event.key===KEY)sync()});
  window.addEventListener('message',event=>{if(event.data?.type==='kairos:state-sync'&&event.data.state){state=event.data.state;state.habits=(Array.isArray(state.habits)?state.habits:[]).map(clean);localStorage.setItem(KEY,JSON.stringify(state));render()}});
  document.addEventListener('click',event=>{const button=event.target.closest?.('.habit-check-button[data-toggle]');if(!button||button.classList.contains('done'))return;const title=button.closest('.real-habit-card')?.querySelector('h3')?.textContent||'';queueMicrotask(()=>reactPet('happy',{title}))},true);
  load();
})();
