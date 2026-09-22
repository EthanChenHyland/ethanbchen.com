/** An optional legal-move sketch, not an engine evaluation or full chess game. */
export function knightSketch():HTMLElement{
  const details=document.createElement('details');details.className='knight-sketch';details.innerHTML='<summary>ONE MORE MOVE ♞</summary><div class="knight-board" role="group" aria-label="Explore legal knight moves"></div><p class="mono" aria-live="polite">A knight on b1. Choose a marked square.</p>';
  const board=details.querySelector<HTMLElement>('.knight-board')!;let file=1,rank=0;
  function render(){board.replaceChildren();for(let r=7;r>=0;r--)for(let f=0;f<8;f++){const legal=Math.abs(f-file)*Math.abs(r-rank)===2;const cell=document.createElement(legal?'button':'span');cell.className=(r+f)%2?'light':'dark';if(f===file&&r===rank){cell.textContent='♞';cell.setAttribute('aria-hidden','true')}if(legal){const name=String.fromCharCode(97+f)+(r+1);cell.setAttribute('aria-label',`Move knight to ${name}`);cell.textContent='·';cell.addEventListener('click',()=>{file=f;rank=r;details.querySelector('p')!.textContent=`Knight on ${name}. Choose another marked square.`;render()})}board.append(cell)}}
  render();return details;
}
