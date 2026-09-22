import { schemaFields } from './signal-shapes';
import { isKey, schemaLabels } from './content';
/** Public contract demonstration only: no report, model inference, or scoring. */
export function setupSchemaDesk(signal:AbortSignal):void{
  const lab=document.querySelector<HTMLElement>('.evaluation-lab');if(!lab)return;
  const desk=document.createElement('div');desk.className='schema-desk';
  desk.innerHTML=`<div class="schema-desk-heading mono"><span>THE CONTRACT / SIX FINDINGS</span><span>SELECT A FIELD ↓</span></div><div class="schema-field-controls" role="group" aria-label="Choose a finding field">${schemaFields.map((field,i)=>`<button type="button" data-field="${field}" aria-pressed="${i===0}"><span class="mono">0${i+1}</span><span>${field.replaceAll('_',' ').replace('osteoarthritis','osteo\u00adarthritis')}</span><small>not_reported</small></button>`).join('')}</div><p class="schema-working mono">EDITING THE SPECIMEN: <strong>acl_tear</strong></p><p class="schema-disclaimer mono">CONTRACT SPECIMEN · NO REPORT OR MODEL RUN</p>`;
  lab.querySelector('.schema-explorer')!.before(desk);
  const values:Record<string,string>=Object.fromEntries(schemaFields.map(f=>[f,'not_reported']));let selected=schemaFields[0];
  const controls=[...desk.querySelectorAll<HTMLButtonElement>('[data-field]')];
  controls.forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.field!;controls.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));desk.querySelector('strong')!.textContent=selected;lab.querySelector<HTMLButtonElement>(`[data-label="${values[selected]}"]`)!.click()},{signal}));
  lab.querySelectorAll<HTMLButtonElement>('[data-label]').forEach(button=>button.addEventListener('click',()=>{const label=button.dataset.label;if(!isKey(label,schemaLabels))return;values[selected]=label;const field=controls.find(b=>b.dataset.field===selected)!;field.querySelector('small')!.textContent=label;field.dataset.label=label},{signal}));
}
