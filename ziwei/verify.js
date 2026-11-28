const {chromium}=require('playwright');
// 用法：node verify.js <起年> <迄年> <輸出.json> <lunar.js 路徑> <iztro.min.js 路徑>
const [,, Y0, Y1, OUT, LUNAR, IZTRO]=process.argv;
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.route('**/lunar.js',r=>r.fulfill({path:LUNAR,contentType:'application/javascript'}));
await p.goto('file://'+require('path').resolve(__dirname,'index.html'));await p.waitForTimeout(1500);
await p.addScriptTag({path:IZTRO});
const res=await p.evaluate(([Y0,Y1])=>{
  const Z='子丑寅卯辰巳午未申酉戌亥', MAIN=['紫微','天機','太陽','武曲','天同','廉貞','天府','太陰','貪狼','巨門','天相','天梁','七殺','破軍'];
  const MINOR=['左輔','右弼','文昌','文曲','天魁','天鉞','祿存','天馬','擎羊','陀羅','火星','鈴星','地空','地劫'];
  const stats={charts:0,fields:0,mism:{},samples:{}};
  const bad=(k,info)=>{stats.mism[k]=(stats.mism[k]||0)+1; if(!stats.samples[k]) stats.samples[k]=[]; if(stats.samples[k].length<5) stats.samples[k].push(info)};
  const t0=performance.now();
  for(let d=new Date(Date.UTC(Y0,0,1)); d.getUTCFullYear()<=Y1; d.setUTCDate(d.getUTCDate()+1)){
    const y=d.getUTCFullYear(), mo=d.getUTCMonth()+1, dd=d.getUTCDate();
    for(let hi=0;hi<=12;hi++){
      const sex=(dd+hi)%2?'M':'F';
      const me=window.__ziwei.computeChart({y,mo,d:dd,cal:'solar',leapIn:false,hi,sex,geng:'太陰'});
      const iz=iztro.astro.bySolar(y+'-'+mo+'-'+dd,hi,sex==='M'?'男':'女',true,'zh-TW');
      stats.charts++;
      const tag=y+'-'+mo+'-'+dd+' h'+hi+' '+sex;
      const izPal={}, izStar={}, izMut={};
      iz.palaces.forEach(P=>{const b=Z.indexOf(P.earthlyBranch); izPal[b]=P;
        [...P.majorStars,...P.minorStars].forEach(s=>{izStar[s.name]=b; if(s.mutagen) izMut[s.name]=s.mutagen})});
      const chk=(k,a,b2)=>{stats.fields++; if(a!==b2) bad(k,tag+' 我:'+a+' iztro:'+b2)};
      const izMing=iz.palaces.find(P=>P.name==='命宮'), izBody=iz.palaces.find(P=>P.isBodyPalace);
      chk('命宮',Z[me.ming],izMing.earthlyBranch);
      chk('身宮',Z[me.shen],izBody.earthlyBranch);
      chk('五行局',me.ju,iz.fiveElementsClass);
      for(let b=0;b<12;b++){
        chk('宮干','甲乙丙丁戊己庚辛壬癸'[me.pal[b].stem],izPal[b].heavenlyStem);
        chk('大限',me.pal[b].dx.join('-'),izPal[b].decadal.range.join('-'));
      }
      MAIN.forEach(s=>chk('主星:'+s,Z[me.pos[s].b],Z[izStar[s]]));
      MINOR.forEach(s=>chk('輔煞:'+s,Z[me.pos[s].b],Z[izStar[s]]));
      const myMut={}; Object.values(me.pal).forEach(P=>P.stars.forEach(s=>{if(s.bh!==undefined) myMut[s.name]='祿權科忌'[s.bh]}));
      const names=new Set([...Object.keys(myMut),...Object.keys(izMut)]);
      names.forEach(n=>chk('生年四化',n+(myMut[n]||'-'),n+(izMut[n]||'-')));
    }
  }
  stats.ms=Math.round(performance.now()-t0);
  return stats;
},[+Y0,+Y1]);
require('fs').writeFileSync(OUT,JSON.stringify(res,null,1));
console.log(Y0,Y1,'charts',res.charts,'fields',res.fields,'ms',res.ms,'mismatch',JSON.stringify(res.mism));
await b.close();})();
