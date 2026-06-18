import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { WebtoonService } from './webtoon.service';
import type { GenerateScriptInput, WebtoonScript } from './webtoon.types';

@Controller('webtoon')
export class WebtoonController {
  constructor(private readonly webtoon: WebtoonService) {}

  // The AI brain: story idea -> structured webtoon script.
  @Post('generate')
  generate(@Body() body: GenerateScriptInput): Promise<WebtoonScript> {
    return this.webtoon.generateScript(body);
  }

  // Image proxy + cache. Browser hits OUR origin; we fetch/cache the art.
  @Get('img')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async img(
    @Query('prompt') prompt: string,
    @Query('w') w: string,
    @Query('h') h: string,
    @Query('seed') seed: string,
  ): Promise<StreamableFile> {
    const buf = await this.webtoon.getImage(
      prompt ?? '',
      parseInt(w, 10) || 512,
      parseInt(h, 10) || 720,
      parseInt(seed, 10) || 0,
    );
    return new StreamableFile(buf);
  }

  // Self-contained reader UI. Soft romance-manhwa aesthetic: warm ivory canvas,
  // elegant Playfair/Dancing-Script type, rose accent. Each panel renders REAL
  // AI art via Pollinations (free, keyless); dialogue/captions are a CSS overlay
  // on top of the art (never baked in — stays crisp and translatable).
  @Get('reader')
  @Header('Content-Type', 'text/html')
  reader(): string {
    return READER_HTML;
  }
}

const READER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PanelForge — AI Webtoon Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,600;1,700&family=Dancing+Script:wght@700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --cream:#f6f1e8; --paper:#fffdf8; --ink:#2c2722; --muted:#9a9088; --line:#e7ddcd;
          --rose:#c98793; --rose-d:#a85f6d; --gold:#c6a85a; --gold2:#bfa05a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--cream); color:var(--ink); font-family:'Inter',system-ui,sans-serif; }

  /* top bar */
  .topbar { position:sticky; top:0; z-index:20; background:rgba(255,253,248,.9); backdrop-filter:blur(8px);
            border-bottom:1px solid var(--line); display:flex; align-items:center; gap:14px; padding:14px 22px; }
  .brand { font-family:'Dancing Script',cursive; font-weight:700; font-size:26px; color:var(--rose-d); line-height:1; }
  .brand span { font-family:'Playfair Display',serif; font-size:15px; color:var(--ink); letter-spacing:3px; margin-left:6px; }
  .nav { display:flex; gap:20px; margin-left:auto; font-size:12px; font-weight:600; letter-spacing:1px; color:var(--muted); }
  .nav span:first-child { color:var(--rose-d); }

  /* home */
  .wrap { max-width:1060px; margin:0 auto; padding:36px 22px 90px; }
  .hero { text-align:center; padding:34px 0 6px; }
  .kicker { font-family:'Playfair Display',serif; font-style:italic; color:var(--rose-d); font-size:15px; letter-spacing:2px; }
  .hero h1 { font-family:'Playfair Display',serif; font-weight:800; font-size:52px; letter-spacing:-1px; margin:10px 0 10px; line-height:1.04; }
  .hero h1 em { font-style:italic; color:var(--rose); }
  .hero p { color:var(--muted); font-size:16px; max-width:500px; margin:0 auto; }

  .composer { max-width:660px; margin:30px auto 0; background:var(--paper); border:1px solid var(--line);
              border-radius:22px; padding:20px; box-shadow:0 18px 50px rgba(120,90,70,.10); }
  .composer textarea { width:100%; border:none; outline:none; resize:none; font:inherit; font-size:18px;
              min-height:62px; padding:8px 6px; color:var(--ink); background:transparent; }
  .composer textarea::placeholder { color:#c4b9aa; font-style:italic; }
  .pills { display:flex; flex-wrap:wrap; gap:8px; margin:10px 2px 16px; }
  .pill { border:1px solid var(--line); background:var(--paper); color:#6f6459; font:inherit; font-size:12px; font-weight:600;
          letter-spacing:.4px; padding:8px 15px; border-radius:999px; cursor:pointer; transition:.15s; }
  .pill:hover { border-color:var(--rose); color:var(--ink); }
  .pill.on { background:var(--rose); border-color:var(--rose); color:#fff; box-shadow:0 4px 12px rgba(201,135,147,.4); }
  .composer .foot { display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--line); padding-top:16px; }
  .count { display:flex; align-items:center; gap:9px; font-size:13px; color:var(--muted); font-weight:600; }
  .count input { width:120px; accent-color:var(--rose); }
  .go { font-family:'Playfair Display',serif; background:var(--rose-d); color:#fff; border:none; font-weight:700; font-size:16px;
        padding:13px 30px; border-radius:999px; cursor:pointer; transition:.15s; box-shadow:0 8px 22px rgba(168,95,109,.4); }
  .go:hover { transform:translateY(-2px); }
  .go:disabled { opacity:.6; cursor:wait; transform:none; }

  .samples { margin-top:54px; }
  .samples h3 { font-family:'Playfair Display',serif; font-style:italic; font-size:20px; color:var(--ink); margin:0 0 18px; text-align:center; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:18px; }
  .card { border:1px solid var(--line); border-radius:18px; overflow:hidden; cursor:pointer; transition:.2s; background:var(--paper); }
  .card:hover { transform:translateY(-5px); box-shadow:0 18px 36px rgba(120,90,70,.16); }
  .card .thumb { position:relative; overflow:hidden; height:150px; display:flex; align-items:center; justify-content:center; font-size:46px; }
  .card .thumb .emoji { position:relative; z-index:1; }
  .card .thumb .cardart { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:2; }
  .card .body { padding:13px 15px; }
  .card .g { font-family:'Playfair Display',serif; font-style:italic; font-size:12px; color:var(--rose-d); }
  .card .t { font-size:14px; font-weight:500; margin-top:3px; line-height:1.35; }

  /* reader */
  #reader { display:none; }
  .rbar { position:sticky; top:0; z-index:20; background:rgba(255,253,248,.92); backdrop-filter:blur(8px);
          border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; padding:12px 18px; }
  .back { border:none; background:var(--cream); width:40px; height:40px; border-radius:50%; font-size:18px; cursor:pointer; color:var(--ink); }
  .rtitle { font-family:'Playfair Display',serif; font-weight:700; font-size:17px; }
  .rtitle small { display:block; font-family:'Inter'; color:var(--muted); font-weight:500; font-size:12px; }
  .progress { position:fixed; top:0; left:0; height:3px; background:var(--rose); width:0; z-index:30; transition:width .1s; }
  .strip { max-width:500px; margin:0 auto; background:#000; }
  .episodeTag { text-align:center; padding:30px 0 8px; background:var(--cream); }
  .episodeTag .e { font-family:'Playfair Display',serif; font-style:italic; color:var(--rose-d); font-size:14px; letter-spacing:1px; }
  .episodeTag h2 { font-family:'Playfair Display',serif; font-weight:800; font-size:30px; letter-spacing:-.5px; margin:8px 0 4px; }
  .episodeTag p { color:var(--muted); font-style:italic; margin:0; font-size:14px; padding:0 20px; }
  .panel { position:relative; line-height:0; background:#15110f; }
  /* aspect-ratio reserves the panel's height before the image loads, and z-index
     puts the art ON TOP of the spinner — so art shows even if onload never fires. */
  .panel .art { width:100%; display:block; aspect-ratio:512/720; object-fit:cover; position:relative; z-index:1; }
  .panel.noart { min-height:440px; line-height:1.4; display:flex; align-items:center; justify-content:center; }
  .panel.noart .scene { position:static; color:#fff; padding:30px; text-align:center; font-size:13px; }
  .panel .scene { position:absolute; inset:0; display:none; }
  .spin { position:absolute; inset:0; z-index:0; display:flex; align-items:center; justify-content:center; }
  .spin div { width:30px; height:30px; border:3px solid #4a3f3a; border-top-color:var(--rose); border-radius:50%; animation:rot .8s linear infinite; }
  @keyframes rot { to { transform:rotate(360deg); } }
  .num { position:absolute; top:12px; left:14px; color:#fff; font-family:'Playfair Display',serif; font-weight:700; font-size:14px;
         opacity:.85; text-shadow:0 2px 6px rgba(0,0,0,.6); z-index:3; line-height:1; }
  .ov { position:absolute; left:0; right:0; bottom:0; padding:20px 16px; line-height:1.4;
        background:linear-gradient(transparent,rgba(0,0,0,.55)); z-index:2; }
  .cap { background:rgba(255,253,248,.96); color:#2c2722; display:inline-block; padding:7px 12px; border-radius:7px;
         font-size:13px; font-weight:600; margin-bottom:9px; box-shadow:0 3px 10px rgba(0,0,0,.3); }
  .bub { background:#fff; color:#1a1a1a; display:inline-block; padding:10px 15px; border-radius:18px;
         font-size:14px; font-weight:600; max-width:88%; box-shadow:0 4px 14px rgba(0,0,0,.3); }
  .end { text-align:center; padding:50px 20px 90px; background:var(--cream); }
  .end .done { font-family:'Playfair Display',serif; font-style:italic; font-size:22px; }
  .end button { margin-top:16px; font-family:'Playfair Display',serif; background:var(--paper); border:1px solid var(--rose);
                color:var(--rose-d); font-weight:700; font-size:15px; padding:12px 26px; border-radius:999px; cursor:pointer; }
  @media(max-width:520px){ .hero h1{font-size:38px} .nav{display:none} }
</style></head>
<body>
  <div class="progress" id="prog"></div>

  <!-- HOME -->
  <div id="home">
    <div class="topbar">
      <div class="nav"><span>CREATE</span><span>ORIGINALS</span><span>RANKING</span></div>
    </div>
    <div class="wrap">
      <div class="hero">
        <div class="kicker">AI Webtoon Studio</div>
        <h1>Where every idea<br>becomes a <em>webtoon</em>.</h1>
        <p>Describe a story. PanelForge writes the script and paints each panel as illustrated art.</p>
      </div>
      <div class="composer">
        <textarea id="prompt" placeholder="a duke falls for the maid he mistook for a noblewoman…"></textarea>
        <div class="pills" id="pills"></div>
        <div class="foot">
          <label class="count">Panels <input type="range" id="count" min="4" max="10" value="6"><b id="countVal">6</b></label>
          <button class="go" id="go">Create ✦</button>
        </div>
      </div>
      <div class="samples">
        <h3>Need a spark?</h3>
        <div class="cards" id="cards"></div>
      </div>
    </div>
  </div>

  <!-- READER -->
  <div id="reader">
    <div class="rbar">
      <button class="back" id="back">←</button>
      <div class="rtitle" id="rtitle">—<small id="rsub"></small></div>
    </div>
    <div class="strip" id="strip"></div>
  </div>

<script>
  var GENRES = ['Romance','Fantasy','Drama','Historical','Thriller','Comedy','Sci-Fi','Slice of life'];
  var EXAMPLES = [
    {e:'👑', g:'Historical', t:'A duke falls for the maid he mistook for a visiting noblewoman'},
    {e:'🌸', g:'Romance', t:'Two rival florists keep sabotaging each other\\'s weddings'},
    {e:'🗡️', g:'Fantasy', t:'A cursed swordsman bound to protect the princess who cursed him'},
    {e:'🌙', g:'Drama', t:'A girl who only exists at night searches for someone who remembers her'},
    {e:'☕', g:'Slice of life', t:'A quiet cafe where heartbroken customers leave their memories behind'},
    {e:'⚔️', g:'Fantasy', t:'The villainess wakes up knowing she dies in chapter twelve'}
  ];
  var PALETTES = [['#caa8a0','#7d6f86'],['#a8c0b0','#6d7d86'],['#d4b483','#86756d'],
    ['#b0a8c0','#6d6886'],['#c0b0a8','#86766d'],['#a8b8c0','#6d7e86'],['#c8a8b0','#866d7a'],['#b8c0a8','#7a866d']];
  var selectedGenre = 'Historical';
  // Style suffix that gives every panel that glossy Korean-manhwa romance look.
  var STYLE = ', korean manhwa webtoon illustration, romance, soft cel shading, detailed digital painting, beautiful delicate faces, cinematic warm lighting, pastel palette, highly detailed, trending art';

  var pillBox = document.getElementById('pills');
  GENRES.forEach(function(g){
    var b = document.createElement('button');
    b.className = 'pill' + (g===selectedGenre?' on':''); b.textContent = g;
    b.onclick = function(){ selectGenre(g); };
    pillBox.appendChild(b);
  });
  function selectGenre(g){ selectedGenre=g; Array.prototype.forEach.call(pillBox.children,function(c){c.classList.toggle('on',c.textContent===g);}); }

  var cardBox = document.getElementById('cards');
  EXAMPLES.forEach(function(x,i){
    var p = PALETTES[i % PALETTES.length];
    var c = document.createElement('div'); c.className='card';
    c.innerHTML = '<div class="thumb" style="background:linear-gradient(160deg,'+p[0]+','+p[1]+')">'
      + '<span class="emoji">'+x.e+'</span>'
      + '<img class="cardart" referrerpolicy="no-referrer" data-src="'+cardImgUrl(x.t, 1000 + i*131)+'">'
      + '</div>'
      + '<div class="body"><div class="g">'+esc(x.g)+'</div><div class="t">'+esc(x.t)+'</div></div>';
    c.onclick = function(){ document.getElementById('prompt').value = x.t; selectGenre(x.g); window.scrollTo({top:0,behavior:'smooth'}); };
    cardBox.appendChild(c);
  });
  hydrateCards();

  // Landscape cover art for an example card.
  function cardImgUrl(text, seed){
    return '/webtoon/img?w=420&h=280&seed=' + seed + '&prompt=' + encodeURIComponent(text + STYLE);
  }
  function hydrateCards(){
    var imgs = Array.prototype.slice.call(document.querySelectorAll('.thumb img.cardart'));
    var idx = 0;
    function nx(){ if(idx >= imgs.length) return; loadOne(imgs[idx++]).then(nx); }
    nx(); nx();
  }

  var count = document.getElementById('count');
  count.oninput = function(){ document.getElementById('countVal').textContent = count.value; };

  document.getElementById('go').onclick = generate;
  document.getElementById('back').onclick = function(){
    document.getElementById('reader').style.display='none';
    document.getElementById('home').style.display='block';
    document.getElementById('prog').style.width='0';
  };
  window.addEventListener('scroll', function(){
    var h = document.body.scrollHeight - window.innerHeight;
    document.getElementById('prog').style.width = (h>0 ? (window.scrollY/h*100) : 0) + '%';
  });

  function showReader(){ document.getElementById('home').style.display='none';
    document.getElementById('reader').style.display='block'; window.scrollTo({top:0}); }

  // simple stable hash so one episode keeps a consistent visual seed
  function hash(str){ var h=0; for(var i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))|0; } return Math.abs(h); }

  async function generate(){
    var go = document.getElementById('go');
    var prompt = document.getElementById('prompt').value.trim() || document.getElementById('prompt').placeholder;
    go.disabled = true; go.textContent = 'Creating…';
    showReader();
    document.getElementById('rtitle').firstChild.textContent = 'Writing the script…';
    document.getElementById('rsub').textContent = selectedGenre;
    document.getElementById('strip').innerHTML = '';
    try {
      var res = await fetch('/webtoon/generate', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt: prompt, genre: selectedGenre, panelCount: parseInt(count.value,10) }) });
      var s = await res.json();
      render(s);
    } catch(e){ document.getElementById('strip').innerHTML = '<div class="end"><div class="done">Something broke</div><p>'+esc(String(e))+'</p></div>'; }
    go.disabled = false; go.textContent = 'Create ✦';
  }

  function imgUrl(anchor, scene, seed){
    var p = anchor + '. ' + scene + STYLE;
    return '/webtoon/img?w=512&h=720&seed=' + seed + '&prompt=' + encodeURIComponent(p);
  }

  function render(s){
    document.getElementById('rtitle').firstChild.textContent = s.title || 'Untitled';
    document.getElementById('rsub').textContent = (s.genre||'') + ' · ' + s.panels.length + ' panels';
    var anchor = s.logline || s.title || '';
    var base = hash(s.title || 'x') % 90000;
    var h = '<div class="episodeTag"><div class="e">— Episode 1 —</div><h2>'+esc(s.title)+'</h2><p>'+esc(s.logline||'')+'</p></div>';
    s.panels.forEach(function(p,i){
      var pal = PALETTES[i % PALETTES.length];
      var url = imgUrl(anchor, p.scene, base + i);
      h += '<div class="panel" style="background:linear-gradient(160deg,'+pal[0]+','+pal[1]+')">'
        + '<div class="spin"><div></div></div>'
        + '<img class="art" referrerpolicy="no-referrer" data-src="'+url+'">'
        + '<div class="num">'+p.order+'</div>'
        + '<div class="scene">'+esc(p.scene)+'</div>'
        + '<div class="ov">'
        + (p.caption ? '<div class="cap">'+esc(p.caption)+'</div><br>' : '')
        + (p.dialogue ? '<div class="bub">'+esc(p.dialogue)+'</div>' : '')
        + '</div></div>';
    });
    h += '<div class="end"><div class="done">✦ End of Episode 1 ✦</div><br><button onclick="document.getElementById(\\'back\\').click()">Create another</button></div>';
    document.getElementById('strip').innerHTML = h;
    window.scrollTo({top:0});
    hydrateImages();
  }

  // Load panel art a few at a time (Pollinations throttles bursts) with retries,
  // so every panel renders instead of just the first one or two.
  function hydrateImages(){
    var imgs = Array.prototype.slice.call(document.querySelectorAll('#strip img.art'));
    var CONCURRENCY = 2, idx = 0;
    function next(){ if(idx >= imgs.length) return; loadOne(imgs[idx++]).then(next); }
    for(var k=0;k<CONCURRENCY;k++) next();
  }
  function loadOne(img){
    return new Promise(function(resolve){
      var tries = 0;
      function attempt(){
        tries++;
        img.onload = function(){ var s=img.parentNode.querySelector('.spin'); if(s) s.style.display='none'; resolve(); };
        img.onerror = function(){
          if(tries < 3){ setTimeout(attempt, 700); }
          else { img.parentNode.classList.add('noart'); var s=img.parentNode.querySelector('.spin'); if(s) s.style.display='none'; img.style.display='none'; resolve(); }
        };
        img.src = img.getAttribute('data-src') + (tries>1 ? ('&retry='+tries) : '');
      }
      attempt();
    });
  }

  function esc(t){ return (t||'').replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
</script>
</body></html>`;
